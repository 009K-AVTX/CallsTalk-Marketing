// Daily calls read from a billing report, for an admin to enter in the buyer's billing along with the upload.
//
// The file is in the Excel template's format (Upload.jsx downloadTemplate): the "Daily Bills" sheet, or the first
// sheet with a Date and a Total Calls column. Only each day's calls, replacements and price are read. The portal works
// out charges and balances itself, and payments are never taken from a file: USDT deposits come in on their own and
// the team records the others, so reading them here would count them twice.
//
// Each day is saved through the same call as the customer page's Calls (PUT /api/admin/users/:id/days/:date), so the
// same checks apply, a day someone else changed meanwhile is refused, and each one is in the Audit Log.

import { isConflict, saveDay } from './admin.js';

const HEADS = {
  date: ['date'],
  calls: ['total calls', 'calls'],
  replacements: ['replacements', 'replaced'],
  price: ['price per call', 'price'],
};
// "Price per Call ($)" -> "price per call"
const norm = (v) => String(v ?? '').toLowerCase().replace(/\(.*?\)|[^a-z ]/g, '').replace(/\s+/g, ' ').trim();

const iso = (y, m, d) => {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? t.toISOString().slice(0, 10) : null;
};

// A date cell (an Excel date number) or text: "2026-10-19", or "10/19/2026" as Excel shows US dates.
function dayOf(v, XLSX) {
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v);
    return d ? iso(d.y, d.m, d.d) : null;
  }
  const s = String(v ?? '').trim();
  const ymd = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (ymd) return iso(+ymd[1], +ymd[2], +ymd[3]);
  const mdy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  return mdy ? iso(+mdy[3], +mdy[1], +mdy[2]) : null;
}

const num = (v) => (v === null || v === undefined || String(v).trim() === '' ? null : Number(String(v).replace(/[$,\s]/g, '')));

// One file -> { days: [{ date, calls, replacements, price }], skipped: [{ file, row, reason }] }, or null when no
// sheet in it has the template's columns. `price`: null when the cell is empty or 0, so the day keeps its price.
async function readFile(file) {
  const XLSX = await import('xlsx');
  // CSV as plain text, so "2026-10-19" stays as written instead of becoming a date number in the browser's zone.
  const book = XLSX.read(await file.arrayBuffer(), { raw: /\.csv$/i.test(file.name) });
  const names = [...book.SheetNames].sort((a, b) => (b === 'Daily Bills') - (a === 'Daily Bills'));
  for (const name of names) {
    const sheet = book.Sheets[name];
    if (!sheet['!ref']) continue;
    const first = XLSX.utils.decode_range(sheet['!ref']).s.r + 1; // the sheet's first row, as Excel numbers it
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, blankrows: true, defval: null });
    const at = rows.slice(0, 10).findIndex((r) => r.some((c) => norm(c) === 'date') && r.some((c) => HEADS.calls.includes(norm(c))));
    if (at < 0) continue;
    const col = Object.fromEntries(Object.entries(HEADS).map(([k, heads]) => [k, rows[at].findIndex((c) => heads.includes(norm(c)))]));

    const days = [];
    const skipped = [];
    for (let i = at + 1; i < rows.length; i++) {
      const cell = (k) => (col[k] < 0 ? null : rows[i][col[k]]);
      const skip = (reason) => skipped.push({ file: file.name, row: first + i, reason });
      if (cell('date') === null && cell('calls') === null) continue; // a blank row
      const date = dayOf(cell('date'), XLSX);
      const calls = num(cell('calls'));
      const replacements = num(cell('replacements')) ?? 0;
      const price = num(cell('price'));
      if (!date) skip(`"${cell('date') ?? ''}" is not a date`);
      else if (calls === null) skip('no calls entered');
      else if (!Number.isInteger(calls) || calls < 0 || calls > 1_000_000) skip('the calls are not a whole number');
      else if (!Number.isInteger(replacements) || replacements < 0 || replacements > calls) skip('the replacements are not a whole number up to the calls');
      else if (price !== null && (!Number.isFinite(price) || price < 0)) skip('the price is not a number');
      else days.push({ date, calls, replacements, price: price ? price.toFixed(2) : null });
    }
    return { days, skipped };
  }
  return null;
}

// Every chosen file -> { days, skipped } as above, oldest day first, or null when none is in the template's format.
// A day listed twice with different figures is left out: which one is right is for the team to say.
export async function readBillingDays(files) {
  const read = (await Promise.all([...files].map((f) => readFile(f).catch(() => null)))).filter(Boolean);
  if (!read.length) return null;
  const byDate = new Map();
  const skipped = read.flatMap((r) => r.skipped);
  const twice = new Set();
  for (const d of read.flatMap((r) => r.days)) {
    const seen = byDate.get(d.date);
    if (!seen) byDate.set(d.date, d);
    else if (seen.calls !== d.calls || seen.replacements !== d.replacements || seen.price !== d.price) twice.add(d.date);
  }
  for (const date of twice) {
    byDate.delete(date);
    skipped.push({ date, reason: 'listed twice with different figures' });
  }
  return { days: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)), skipped };
}

const localDate = (timeZone) => {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const get = (t) => p.find((x) => x.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
};

// What entering `days` would do to the buyer's billing. `billing`: fetchBilling (admin.js) for that buyer.
// -> each day with { now, version, action, reason }: `now` is what billing has for it ({ calls, replacements, price },
// or null when nothing is entered), `action` is new | change | same | skip, and `version` goes back with the save.
export function planBillingDays(days, { account, statement, day_versions: versions = {} }) {
  const today = localDate(account.timezone);
  const shown = new Map(statement.days.map((d) => [d.date, d])); // the last 30 days, as on the customer page
  return days.map((d) => {
    if (d.date < account.start_date) return { ...d, now: null, action: 'skip', reason: 'before billing started' };
    if (d.date > today) return { ...d, now: null, action: 'skip', reason: 'a future day' };
    // Older days are not shown on the customer page either: entered without comparing (and without a version).
    if (!shown.has(d.date)) return { ...d, now: null, action: 'new', reason: 'older than 30 days, not compared' };
    if (versions[d.date] === undefined) {
      const empty = !d.calls && !d.replacements;
      return { ...d, now: null, version: 0, action: empty ? 'same' : 'new', ...(empty && { reason: 'no calls' }) };
    }
    const s = shown.get(d.date);
    const now = { calls: s.calls, replacements: s.replacements, price: s.price_per_call };
    const same = now.calls === d.calls && now.replacements === d.replacements && (d.price === null || Number(d.price) === Number(now.price));
    return { ...d, now, version: versions[d.date], action: same ? 'same' : 'change' };
  });
}

export const toEnter = (plan) => plan.filter((d) => d.action === 'new' || d.action === 'change');

// Saves the new and changed days, one at a time. -> { saved, failed: ["Oct 19, 2026: why", …] }. `label`: a day's date
// as shown. One day failing leaves the others.
export async function enterBillingDays(customerId, plan, label) {
  let saved = 0;
  const failed = [];
  for (const d of toEnter(plan)) {
    try {
      await saveDay(customerId, d.date, d.calls, d.price, d.replacements, d.version);
      saved++;
    } catch (err) {
      failed.push(`${label(d.date)}: ${isConflict(err) ? 'someone changed it meanwhile, so it was left as it is' : err.message}`);
    }
  }
  return { saved, failed };
}
