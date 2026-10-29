// Billing reports read from Excel, whatever layout the team made them in. billing-import.js sets what is read against
// the buyer's billing and saves it.
//
// Two shapes are looked for on every sheet:
//  - a table: a header row with a Date column and the day's figures, a row per day. The Excel template (Upload.jsx
//    downloadTemplate), "Daily Report", "VGK", "P30-Balance Data" and the one-row Date | Opening Balance | Total No. |
//    Payment Received | Balance report are tables. A row above the first day with only a balance in it ("Due- $2173",
//    "$420") is the first day's opening balance; a day without an Opening column opens on the day before's closing.
//  - label and value boxes: a column of labels, each value in the first filled cell to its right, one day a box. The
//    "Financial Overview" box, the "28-Oct-2026" statement and "Leads & Transactions" are boxes. The day is the box's
//    Date row, or the date in its title ("OCT 20, 2026 - Financial Overview"). A label and its value can share a cell
//    ("Old Due : $ 2,350 /-"), as in the "Account Summary" text the team sends by message, pasted a line a row
//    (textBook).
// Labels are matched loosely, so "Opening Balanace ($)" and "Cloing Balance" are read too (FIELDS).
//
// Each day -> { date, calls, replacements, price, opening, payment, closing, adds_up, flipped, implied_price, notes }.
// The portal works balances out itself (server/src/billing.js statement):
//   balance = opening + payment received - (calls - replacements) x price per call
// so a report's own closing balance is only checked against that (settle). A red balance typed without its minus sign
// is read as negative when that is what makes the day add up.

const FIELDS = {
  date: ['date', 'day'],
  calls: ['calls', 'total calls', 'total no', 'total number', 'lead', 'leads', 'total leads'],
  replacements: ['replacement', 'replacements', 'replaced', 'missed', 'missed calls'],
  final: ['final', 'final lead', 'final leads', 'final calls', 'final calls count', 'billable calls'],
  price: ['price', 'price per call', 'cost per call', 'price per lead', 'cost per lead'],
  charges: ['total', 'final calls amount', 'call charges', 'charges'],
  opening: ['opening balance', 'opening', 'advance', 'previous advance', 'previous balance', 'due', 'old due', 'previous due', 'opening due'],
  payment: ['payment received', 'payment', 'payments', 'received', 'fund received', 'funds received', 'amount received'],
  closing: ['balance', 'closing balance', 'closing day balance', 'current advance balance', 'current balance', 'balance now', 'remaining balance', 'total due', 'balance due', 'current due'],
};
const LABELS = Object.entries(FIELDS).flatMap(([key, names]) => names.map((name) => ({ key, name })));
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// "Price per Call ($)" -> "price per call"
export const norm = (v) => String(v ?? '').toLowerCase().replace(/\(.*?\)/g, ' ').replace(/[^a-z]+/g, ' ').trim();
const filled = (v) => v !== null && v !== undefined && String(v).trim() !== '';

function distance(a, b) {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length];
}

// A label cell -> { key, owed } (owed: the label says Due, so its amounts are owed), or null. Typos are allowed in
// longer labels: one letter in 6 to 9, two from 10.
export function fieldOf(v) {
  if (typeof v !== 'string') return null;
  const s = norm(v);
  if (!s || s.length > 40) return null;
  const owed = /\bdue\b/.test(s);
  const exact = LABELS.find((l) => l.name === s);
  if (exact) return { key: exact.key, owed };
  let best = null;
  for (const l of LABELS) {
    const room = l.name.length >= 10 ? 2 : l.name.length >= 6 ? 1 : 0;
    if (!room || Math.abs(l.name.length - s.length) > room) continue;
    const d = distance(s, l.name);
    if (d <= room && (!best || d < best.d)) best = { key: l.key, d };
  }
  return best && { key: best.key, owed };
}

const iso = (y, m, d) => {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? t.toISOString().slice(0, 10) : null;
};
const fullYear = (y) => (y.length === 2 ? 2000 + Number(y) : Number(y));
const monthOf = (name) => MONTHS.indexOf(String(name).slice(0, 3).toLowerCase()) + 1;

// A day written without its year ("27-Oct"): the year the file names, else this year, or last year when that would put
// the day more than a week ahead (December's reports read in January).
function withYear(m, d, { year, now = new Date() } = {}) {
  if (year) return iso(year, m, d);
  const y = now.getUTCFullYear();
  const day = iso(y, m, d);
  return day && day > new Date(now.getTime() + 7 * 86_400_000).toISOString().slice(0, 10) ? iso(y - 1, m, d) : day;
}

// A date cell -> "YYYY-MM-DD", or null: an Excel date number, or text as the team types it: "2026-10-27", "10/27/2026"
// (or "27/10/2026": a first part over 12, or `dmy` for the whole sheet or column; "05-10-2026" is Oct 5), "27-Oct",
// "28-Oct-2026", "Oct 27, 2026".
export function dayOf(v, XLSX, ctx = {}) {
  if (typeof v === 'number') {
    if (!XLSX || v < 36526 || v > 73051) return null; // 2000 to 2099
    const d = XLSX.SSF.parse_date_code(v);
    return d ? iso(d.y, d.m, d.d) : null;
  }
  const s = String(v ?? '').trim().replace(/(\d)(st|nd|rd|th)\b/i, '$1');
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})([/.-])(\d{1,2})\2(\d{4}|\d{2})$/.exec(s);
  // With dashes the team writes the day first (05-10-2026 is Oct 5), unless the second part cannot be a month.
  if (m) return ctx.dmy || +m[1] > 12 || (m[2] === '-' && +m[3] <= 12) ? iso(fullYear(m[4]), +m[3], +m[1]) : iso(fullYear(m[4]), +m[1], +m[3]);
  m = /^(\d{1,2})[\s-]([a-z]{3,9})\.?(?:[\s,-]+(\d{4}|\d{2}))?$/i.exec(s);
  if (m && monthOf(m[2])) return m[3] ? iso(fullYear(m[3]), monthOf(m[2]), +m[1]) : withYear(monthOf(m[2]), +m[1], ctx);
  m = /^([a-z]{3,9})\.?\s+(\d{1,2}),?(?:\s+(\d{4}))?$/i.exec(s);
  if (m && monthOf(m[1])) return m[3] ? iso(+m[3], monthOf(m[1]), +m[2]) : withYear(monthOf(m[1]), +m[2], ctx);
  return null;
}

// A date anywhere in a title: "OCT 20, 2026 - Financial Overview", "28-Oct-2026", "Oct 22, 2026 · Financial Overview".
const DATES_IN = [/\d{4}-\d{1,2}-\d{1,2}/g, /\d{1,2}([/-])\d{1,2}\1(?:\d{4}|\d{2})/g, /[a-z]{3,9}\.? \d{1,2},? \d{4}/gi, /\d{1,2}[ -][a-z]{3,9}[ -](?:\d{4}|\d{2})/gi];
export function dayIn(v, XLSX, ctx) {
  const whole = dayOf(v, XLSX, ctx);
  if (whole || typeof v !== 'string') return whole;
  for (const re of DATES_IN) {
    for (const m of v.matchAll(re)) {
      const d = dayOf(m[0], XLSX, ctx);
      if (d) return d;
    }
  }
  return null;
}

// An amount: a number, or text such as "$1,000.00", "-$575.00", "($575)" or "Due- $2173" (owed: negative).
export function amountOf(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v ?? '').trim();
  if (!s) return null;
  const owed = /\bdue\b/i.test(s);
  const m = /(\()?\s*([-−–])?\s*\$?\s*(\d[\d,]*(?:\.\d+)?)/.exec(owed ? s.replace(/^.*?\bdue\b[\s:–—-]*/i, '') : s);
  if (!m) return null;
  const n = Number(m[3].replace(/,/g, ''));
  return m[1] || m[2] || owed ? -n : n;
}

const count = (v) => {
  if (!filled(v)) return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[,\s]/g, ''));
  return Number.isFinite(n) ? n : NaN;
};

// A day's calls as the reports write them: 125, or "125 - 2" for 125 calls with 2 replaced.
export function callsOf(v) {
  const m = /^(\d[\d,]*)\s*[-−–]\s*(\d[\d,]*)$/.exec(String(v ?? '').trim());
  if (!m) return { calls: count(v), replacements: null };
  return { calls: count(m[1]), replacements: count(m[2]) };
}

const round2 = (n) => Math.round(n * 100) / 100;
const cents = (n) => Math.round(n * 100);

// Checks a day's balance against the portal's rule at `price` (null: the price that would make it add up, when it is a
// whole number of dollars). A positive opening or closing balance is read as negative when only that makes it add up
// (`flipped`: 'opening', 'closing' or 'both'). -> the day with adds_up (null: no balance to check), flipped and
// implied_price.
export function settle(d, price = d.price) {
  const { opening, closing } = d;
  if (opening === null || closing === null || d.calls === null) return { ...d, adds_up: null, flipped: null, implied_price: null };
  const billable = d.calls - d.replacements;
  const paid = d.payment ?? 0;
  if (!billable) price = 0;
  const ways = [[1, 1, null], [-1, 1, 'opening'], [1, -1, 'closing'], [-1, -1, 'both']]
    .filter(([so, sc]) => (so > 0 || opening > 0) && (sc > 0 || closing > 0));
  for (const [so, sc, flipped] of ways) {
    const o = so * opening;
    const c = sc * closing;
    if (price !== null && price !== undefined && Number.isFinite(Number(price))) {
      if (cents(o + paid - billable * Number(price)) === cents(c)) return { ...d, opening: o, closing: c, adds_up: true, flipped, implied_price: null };
    } else if (billable > 0) {
      const p = (o + paid - c) / billable;
      if (p > 0 && p <= 500 && Math.abs(p - Math.round(p)) < 1e-9) return { ...d, opening: o, closing: c, adds_up: true, flipped, implied_price: Math.round(p) };
    }
  }
  return { ...d, adds_up: false, flipped: null, implied_price: null };
}

// A day's figures as read -> { day } or { reason } it is left out.
function dayFrom(f, XLSX, ctx) {
  const date = f.date ?? dayOf(f.day, XLSX, ctx);
  if (!date) return { reason: `"${f.day ?? ''}" is not a date` };
  const counted = callsOf(f.calls);
  const final = count(f.final);
  let calls = counted.calls;
  let replacements = counted.replacements;
  if (replacements === null && final !== null && calls !== null && !Number.isNaN(calls)) replacements = calls - final;
  if (replacements === null) replacements = count(f.replacements) ?? 0;
  if (calls === null && final !== null) calls = final + replacements;
  const payment = amountOf(f.payment);
  if (calls === null && payment === null) return { reason: 'no calls entered' };
  if (calls !== null && (!Number.isInteger(calls) || calls < 0 || calls > 1_000_000)) return { reason: 'the calls are not a whole number' };
  if (calls !== null && (!Number.isInteger(replacements) || replacements < 0 || replacements > calls)) return { reason: 'the replacements are not a whole number up to the calls' };
  if (calls === null) replacements = 0;

  const notes = [];
  const billable = (calls ?? 0) - replacements;
  let price = amountOf(f.price);
  if (price !== null) price = Math.abs(price) || null;
  const charges = amountOf(f.charges);
  if (price === null && charges && billable > 0) {
    const each = Math.abs(charges) / billable;
    if (Math.abs(each * 100 - cents(each)) < 1e-6) price = round2(each);
  } else if (price !== null && charges !== null && billable > 0 && cents(Math.abs(charges)) !== cents(billable * price)) {
    notes.push(`the report charges ${Math.abs(charges)}, not ${round2(billable * price)} (${billable} x ${price})`);
  }
  if (price !== null && (!Number.isFinite(price) || price < 0)) return { reason: 'the price is not a number' };
  const sign = (v, owed) => (v === null ? null : owed && v > 0 ? -v : v);
  const opening = sign(amountOf(f.opening), f.openingOwed);
  const closing = sign(amountOf(f.closing), f.closingOwed);
  // `read`: the balances as written, for checking again at the buyer's own price (billing-import.js).
  const day = { date, calls, replacements, price: price ? price.toFixed(2) : null, opening, payment: payment === null ? null : Math.abs(payment), closing, read: { opening, closing }, notes };
  return { day: settle(day, day.price === null ? null : Number(day.price)) };
}

const nonEmpty = (row) => (row || []).some(filled);

// A sheet as a table -> { days, skipped } or null when it has no header row with a Date column and a day's figures.
function readTable(rows, ctx, where) {
  for (let at = 0; at < Math.min(rows.length, 15); at++) {
    const cols = {};
    (rows[at] || []).forEach((c, j) => {
      const f = fieldOf(c);
      if (f && !(f.key in cols)) cols[f.key] = { j, owed: f.owed };
    });
    if (!('date' in cols) || !['calls', 'final', 'opening', 'closing', 'payment'].some((k) => k in cols)) continue;

    const cell = (r, k) => (k in cols ? r[cols[k].j] ?? null : null);
    const dmy = ctx.dmy || rows.slice(at + 1).some((r) => {
      const m = /^(\d{1,2})[/.-]\d{1,2}[/.-]/.exec(String(cell(r || [], 'date') ?? '').trim());
      return m && +m[1] > 12;
    });
    const days = [];
    const skipped = [];
    let carry = null; // the first day's opening, from the row above it; then each day's closing
    for (let i = at + 1; i < rows.length; i++) {
      const r = rows[i] || [];
      if (!nonEmpty(r)) continue;
      const date = dayOf(cell(r, 'date'), ctx.XLSX, { ...ctx, dmy });
      if (!date) {
        // A totals or notes row ("Total Due", "Due"), or the opening balance above the first day.
        if (filled(cell(r, 'calls')) || filled(cell(r, 'final'))) skipped.push({ ...where, row: where.first + i, reason: `"${cell(r, 'date') ?? ''}" is not a date` });
        else if (!days.length) {
          const k = filled(cell(r, 'opening')) ? 'opening' : 'closing';
          const v = amountOf(cell(r, k));
          if (v !== null) carry = cols[k].owed && v > 0 ? -v : v;
        }
        continue;
      }
      const own = filled(cell(r, 'opening'));
      const read = dayFrom({
        date, calls: cell(r, 'calls'), final: cell(r, 'final'), replacements: cell(r, 'replacements'), price: cell(r, 'price'), charges: cell(r, 'charges'),
        opening: own ? cell(r, 'opening') : carry, openingOwed: own && cols.opening.owed, payment: cell(r, 'payment'), closing: cell(r, 'closing'), closingOwed: cols.closing?.owed,
      }, ctx.XLSX, ctx);
      if (read.day) {
        days.push(read.day);
        carry = read.day.closing;
      } else skipped.push({ ...where, row: where.first + i, reason: read.reason });
    }
    return { days, skipped };
  }
  return null;
}

// "Old Due : $ 2,350 /-" -> ["Old Due ", "$ 2,350 /-"]; a cell without a colon -> [the cell, null].
function splitLabel(c) {
  const m = typeof c === 'string' && /^([^:]{1,40}):(.*)$/.exec(c);
  return m ? [m[1], m[2].trim()] : [c, null];
}
const valueOf = (v) => (typeof v === 'string' ? v.replace(/^\s*:\s*/, '') : v); // ": 70-1", as a line split in columns leaves it

// A sheet's label and value boxes -> { days, skipped } or null when it has none. Each label's value is the rest of its
// cell after a colon, else the first filled cell to its right; labels in one column belong to one box until a gap of more than three rows, a date title between
// them, or a label met twice. An opening balance met again after the payment is the closing ("Advance" in the 28-Oct
// statement, at the top and the bottom).
function readBoxes(rows, ctx, where) {
  const labels = [];
  rows.forEach((r, i) => (r || []).forEach((c, j) => {
    const [label, inline] = splitLabel(c);
    const f = fieldOf(label);
    if (!f) return;
    if (filled(inline)) return labels.push({ i, j, ...f, value: inline });
    const k = r.findIndex((v, x) => x > j && filled(valueOf(v)));
    if (k >= 0) labels.push({ i, j, ...f, value: valueOf(r[k]) });
  }));
  if (!labels.length) return null;

  const titleAt = (i, j) => {
    for (let y = i; y >= Math.max(0, i - 4); y--) {
      for (let x = Math.max(0, j - 1); x <= j + 4; x++) {
        const v = rows[y]?.[x];
        if (filled(v) && !fieldOf(v)) {
          const d = dayIn(v, ctx.XLSX, ctx);
          if (d) return d;
        }
      }
    }
    return null;
  };
  const boxes = [];
  for (const j of [...new Set(labels.map((l) => l.j))]) {
    let box = null;
    for (const l of labels.filter((x) => x.j === j).sort((a, b) => a.i - b.i)) {
      const reopens = box && l.key === 'opening' && 'opening' in box.f && !('closing' in box.f) && 'payment' in box.f;
      const titled = box && l.i - box.last > 1 && titleAt(l.i - 1, j) && titleAt(l.i - 1, j) !== titleAt(box.first - 1, j);
      if (!box || l.i - box.last > 4 || titled || (l.key in box.f && !reopens)) {
        box = { first: l.i, last: l.i, j, f: {} };
        boxes.push(box);
      }
      box.last = l.i;
      if (reopens) box.f.closing = { value: l.value, owed: l.owed };
      else box.f[l.key] = { value: l.value, owed: l.owed };
    }
  }

  const days = [];
  const skipped = [];
  for (const b of boxes) {
    if (!['calls', 'final', 'payment'].some((k) => k in b.f)) continue;
    const v = (k) => b.f[k]?.value ?? null;
    const date = (b.f.date && dayIn(v('date'), ctx.XLSX, ctx)) || titleAt(b.first - 1, b.j);
    const read = date ? dayFrom({
      date, calls: v('calls'), final: v('final'), replacements: v('replacements'), price: v('price'), charges: v('charges'),
      opening: v('opening'), openingOwed: b.f.opening?.owed, payment: v('payment'), closing: v('closing'), closingOwed: b.f.closing?.owed,
    }, ctx.XLSX, ctx) : { reason: 'no date found for it' };
    if (read.day) days.push(read.day);
    else skipped.push({ ...where, row: where.first + b.first, reason: read.reason });
  }
  return days.length || skipped.length ? { days, skipped } : null;
}

// A workbook -> { days, skipped, titles } or null when no sheet is a billing report. `titles`: the file name and each
// sheet's first words ("VGK", "P30-Balance Data"), to check the report is for the buyer chosen.
export function readBook(book, fileName, XLSX, { now } = {}) {
  const days = [];
  const skipped = [];
  const titles = [fileName];
  for (const name of book.SheetNames) {
    const sheet = book.Sheets[name];
    if (!sheet['!ref']) continue;
    const first = XLSX.utils.decode_range(sheet['!ref']).s.r + 1;
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, blankrows: true, defval: null });
    const top = rows.flat().find((c) => typeof c === 'string' && c.trim());
    if (top) titles.push(top.trim());
    const year = /\b(20\d{2})\b/.exec([fileName, name, top].join(' '))?.[1];
    // A day written 19-10-2026 anywhere on the sheet: 05-10-2026 on it is Oct 5 too.
    const dmy = rows.flat().some((c) => typeof c === 'string' && [...c.matchAll(/(?:^|\D)(\d{1,2})[/.-]\d{1,2}[/.-](?:\d{4}|\d{2})(?!\d)/g)].some((m) => +m[1] > 12));
    const ctx = { XLSX, now, dmy, year: year ? Number(year) : undefined };
    const where = { file: fileName, first };
    const read = readTable(rows, ctx, where) ?? readBoxes(rows, ctx, where);
    if (!read) continue;
    days.push(...read.days);
    skipped.push(...read.skipped);
  }
  return days.length || skipped.length ? { days, skipped, titles } : null;
}

const sameDay = (a, b) => ['calls', 'replacements', 'price', 'payment', 'opening'].every((k) => a[k] === b[k]);

// Read workbooks -> { days, skipped, titles } across them all, oldest day first, or null when none is a billing
// report. A day listed twice with different figures is left out: which one is right is for the team to say.
export function mergeBooks(read) {
  const found = read.filter(Boolean);
  if (!found.length) return null;
  const byDate = new Map();
  const skipped = found.flatMap((r) => r.skipped);
  const twice = new Set();
  for (const d of found.flatMap((r) => r.days)) {
    const seen = byDate.get(d.date);
    if (!seen) byDate.set(d.date, d);
    else if (!sameDay(seen, d)) twice.add(d.date);
  }
  for (const date of twice) {
    byDate.delete(date);
    skipped.push({ date, reason: 'listed twice with different figures' });
  }
  return { days: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)), skipped, titles: found.flatMap((r) => r.titles) };
}

// Every chosen file (File objects) -> as mergeBooks.
export async function readBillingDays(files) {
  const XLSX = await import('xlsx');
  const readFile = async (file) => {
    // CSV as plain text, so "2026-10-19" stays as written instead of becoming a date number in the browser's zone.
    const book = XLSX.read(await file.arrayBuffer(), { raw: /\.csv$/i.test(file.name) });
    return readBook(book, file.name, XLSX);
  };
  return mergeBooks(await Promise.all([...files].map((f) => readFile(f).catch(() => null))));
}

// Text sent by message (an "Account Summary") -> a workbook with a line a row, read like any other (readBook) and
// uploaded as Excel, so the sheet viewer shows it as it was sent.
export function textBook(text, XLSX) {
  const lines = String(text).replace(/\r\n?/g, '\n').trim().split('\n').map((l) => [l.replace(/\s+$/, '')]);
  const sheet = XLSX.utils.aoa_to_sheet(lines);
  sheet['!cols'] = [{ wch: Math.min(80, Math.max(30, ...lines.map(([l]) => l.length))) }];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Report');
  return book;
}

// Nicknames ("VGK", "P30") that the report's titles name, of those given.
export function namedIn(titles, nicknames) {
  const words = new Set((titles || []).flatMap((t) => String(t).toUpperCase().split(/[^A-Z0-9]+/)).filter(Boolean));
  return nicknames.filter((n) => n && words.has(n.toUpperCase()));
}
