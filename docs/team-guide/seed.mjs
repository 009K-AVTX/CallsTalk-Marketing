// Fills the demo copy (demo-server.mjs must be running) with made-up buyers, staff and admins, a month of calls and
// payments, Call Summaries for the last five days and a few replaced calls, the way the team would: through the API,
// so the Audit Log and every figure are the portal's own. Starts from empty each time. Writes the demo logins to
// .demo/logins.json and the files capture.mjs uploads to .demo/.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { API, PASSWORD, here, repo, serverModules } from './demo-env.mjs';

const { pool, db, crypto } = await serverModules();
const XLSX = createRequire(path.join(repo, 'package.json'))('xlsx');
const { callOf } = await import(pathToFileURL(path.join(repo, 'portal/src/call-summary.js')).href);
const files = path.join(here, '.demo');
mkdirSync(files, { recursive: true });

const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
const addDays = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const days = (from, to) => { const out = []; for (let d = from; d <= to; d = addDays(d, 1)) out.push(d); return out; };
let seed = 20261028;
const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const between = (a, b) => a + Math.floor(rand() * (b - a + 1));

await pool.query('TRUNCATE portal_users, audit_log CASCADE');

// ── the team ─────────────────────────────────────────────────────────────────
const logins = {};
async function person({ email, name, company = '', role }) {
  const u = await db.createUser({ email, name, company, role });
  const secret = crypto.newTotpSecret();
  await pool.query(`UPDATE portal_users SET password_hash = $2, totp_secret = $3, status = 'active', created_at = now() - interval '30 days',
    activated_at = now() - interval '29 days', last_login_at = now() - interval '1 day' WHERE id = $1`,
    [u.id, await crypto.hashPassword(PASSWORD), secret]);
  logins[role] ??= { email, secret, id: u.id }; // the first of each role signs in for the screenshots
  return u;
}
const signIn = async (user) => {
  const access = crypto.newToken();
  await db.createSession({ userId: user.id, accessHash: crypto.hashToken(access), accessExpires: new Date(Date.now() + 3_600_000), refreshHash: crypto.hashToken(crypto.newToken()), refreshExpires: new Date(Date.now() + 86_400_000) });
  return async (method, p, body) => {
    const res = await fetch(API + p, { method, headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) throw new Error(`${method} ${p}: ${data.detail}`);
    return data;
  };
};
const admin = await person({ email: 'dana.brooks@callstalk.example', name: 'Dana Brooks', company: 'CallsTalk', role: 'admin' });
const staff = await person({ email: 'sam.ortiz@callstalk.example', name: 'Sam Ortiz', company: 'CallsTalk', role: 'staff' });
await person({ email: 'priya.nair@callstalk.example', name: 'Priya Nair', company: 'CallsTalk', role: 'staff' });
const asAdmin = await signIn(admin);
const asStaff = await signIn(staff);

// ── buyers ───────────────────────────────────────────────────────────────────
const BUYERS = [
  { key: 'nlm', company: 'Northline Media', nickname: 'NLM', name: 'Marcus Hale', email: 'billing@northline.example', price: 35, opening: 0, start: '2026-10-01', calls: [32, 58] },
  { key: 'bpi', company: 'Bluepeak Insurance Leads', nickname: 'BPI', name: 'Rachel Kim', email: 'accounts@bluepeak.example', price: 42, opening: -1250, start: '2026-10-01', calls: [26, 44] },
  { key: 'hhp', company: 'Harbor Health Partners', nickname: 'HHP', name: 'Lena Duarte', email: 'lena@harborhealth.example', price: 28, opening: 500, start: '2026-10-14', calls: [14, 30] },
  { key: 'sal', company: 'Summit Auto Leads', nickname: 'SAL', name: 'Owen Price', email: 'owen@summitauto.example', price: 38, opening: 0, start: '2026-10-05', calls: [18, 36] },
  { key: 'cso', company: 'Crestline Solar', nickname: 'CSO', name: 'Ava Lindqvist', email: 'ava@crestlinesolar.example', price: 45, opening: 2000, start: '2026-10-08', calls: [10, 24] },
  { key: 'mdr', company: 'Meridian Debt Relief', nickname: 'MDR', name: 'Tom Becker', email: 'tom@meridiandebt.example', price: 40, opening: 0, start: TODAY, calls: null },
  { key: 'omr', company: 'Old Mill Roofing', nickname: '', name: 'Gail Foster', email: 'gail@oldmillroofing.example', price: 30, opening: 0, start: '2026-10-01', calls: null },
];
const ids = {};
let inviteUrl = '';
for (const b of BUYERS) {
  const r = await asAdmin('POST', '/admin/users', {
    email: b.email, name: b.name, company: b.company, nickname: b.nickname, role: 'customer',
    price_per_call: b.price, opening_balance: b.opening, start_date: b.start, timezone: 'America/New_York',
  });
  ids[b.key] = r.user.id;
  if (b.key === 'mdr') inviteUrl = r.invite_url; // left waiting for its setup link
  else if (b.key === 'hhp') logins.buyer = { email: b.email, id: r.user.id };
  else await pool.query(`UPDATE portal_users SET password_hash = 'set', status = 'active', created_at = now() - interval '28 days',
    activated_at = now() - interval '27 days', last_login_at = now() - interval '2 days' WHERE id = $1`, [r.user.id]);
}
// Harbor is the buyer whose portal the guide shows: a real password and code app.
const hhpSecret = crypto.newTotpSecret();
await pool.query(`UPDATE portal_users SET password_hash = $2, totp_secret = $3, status = 'active', created_at = now() - interval '16 days',
  activated_at = now() - interval '15 days', last_login_at = now() - interval '1 day' WHERE id = $1`, [ids.hhp, await crypto.hashPassword(PASSWORD), hhpSecret]);
logins.buyer.secret = hhpSecret;
await asAdmin('PATCH', `/admin/users/${ids.omr}`, { status: 'disabled' });
// Only Meridian is still waiting for its setup link.
await pool.query('DELETE FROM portal_invites WHERE user_id <> $1', [ids.mdr]);
await db.saveCustomerTelegram(ids.nlm, { chatId: 9001, username: 'marcus_northline', firstName: 'Marcus' });
await db.saveCustomerTelegram(ids.hhp, { chatId: 9002, username: 'lena_harbor', firstName: 'Lena' });
await db.saveContacts(ids.hhp, { telegram: '@lena_harbor', whatsapp: '+1 555 010 4477', element: '', zangi: '', signal: '', email: 'billing@harborhealth.example' });
await db.saveContacts(ids.nlm, { telegram: '@marcus_northline', whatsapp: '', element: '@marcus:matrix.org', zangi: '', signal: '', email: '' });

// ── the days before the call logs: typed in, as the team did ─────────────────
const LOGGED_FROM = addDays(TODAY, -4); // the last five days come from Call Summaries
for (const b of BUYERS.filter((x) => x.calls)) {
  for (const d of days(b.start, addDays(LOGGED_FROM, -1))) {
    if (b.key === 'bpi' && d === addDays(LOGGED_FROM, -1)) continue; // left for the billing report (chapter on billing reports)
    const calls = between(...b.calls);
    const replacements = rand() < 0.15 ? between(1, 3) : 0;
    await asAdmin('PUT', `/admin/users/${ids[b.key]}/days/${d}`, { calls, replacements });
  }
}

// ── payments ─────────────────────────────────────────────────────────────────
const pay = (key, amount, date, note, status = 'completed', reference = '') =>
  asAdmin('POST', `/admin/users/${ids[key]}/payments`, { amount, date, note, status, reference });
// About nine tenths of what is billed comes in: some buyers owe, some are in credit.
await pay('nlm', 12000, '2026-10-06', 'Bank transfer', 'completed', 'WIRE-2207');
await pay('nlm', 15000, '2026-10-14', 'Bank transfer', 'completed', 'WIRE-2251');
await pay('nlm', 19000, '2026-10-22', 'Bank transfer', 'completed', 'WIRE-2291');
await pay('bpi', 14000, '2026-10-09', 'Bank transfer');
await pay('bpi', 16000, '2026-10-20', 'Bank transfer');
await pay('bpi', 6000, '2026-10-24', 'Bank transfer');
await pay('bpi', 2500, addDays(TODAY, -1), 'Bank transfer', 'pending', 'WIRE-2318');
await pay('hhp', 3000, '2026-10-19', 'Bank transfer');
await pay('hhp', 2600, '2026-10-24', 'Bank transfer');
await pay('sal', 10000, '2026-10-13', 'Bank transfer');
await pay('sal', 1500, '2026-10-25', 'Card', 'failed');
await pay('cso', 7000, '2026-10-15', 'Bank transfer');
await pay('cso', 8000, '2026-10-23', 'Bank transfer');
// A USDT deposit, as the payment check records them.
await db.saveProviderPayment(ids.sal, { provider: 'wellwallet', reference: '9f3c1e7ab2d04c6e8a51f0b7d2c9e4a1b6f8d3c2e5a7b9c1d4e6f8a0b2c4d6e8', amount: '9000.00', currency: 'USD', status: 'completed', note: 'USDT (TRC-20)', paid_at: new Date('2026-10-26T15:30:00Z') });

// ── call logs for the last five days ─────────────────────────────────────────
const AREAS = ['201', '212', '305', '312', '404', '512', '602', '614', '702', '713', '718', '813', '904', '917'];
function callLog(day, n, { from = 8, to = 18, first = 0 } = {}) {
  const span = (to - from) * 3600;
  const times = Array.from({ length: n }, () => from * 3600 + Math.floor(rand() * span)).sort((a, b) => a - b);
  const rows = times.map((t, i) => {
    const hh = String(Math.floor(t / 3600)).padStart(2, '0');
    const mm = String(Math.floor((t % 3600) / 60)).padStart(2, '0');
    const ss = String(t % 60).padStart(2, '0');
    const short = rand() < 0.08;
    const secs = short ? between(2, 25) : between(60, 1500);
    const dur = `00:${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
    return [`${day} ${hh}:${mm}:${ss}`, `1${AREAS[(first + i) % AREAS.length]}555${String(1000 + ((first + i) * 37) % 9000).padStart(4, '0')}`,
      '18779642010', dur, rand() < 0.3 ? 'Completed - With Conversion' : 'Completed', rand() < 0.7 ? 'Caller' : 'Callee'];
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Sheet1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
const callsIn = (buf) => {
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
  return wb.SheetNames.flatMap((n) => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: false, blankrows: false, defval: '' })).map(callOf).filter(Boolean);
};
const reports = {};
async function upload(key, day, buf, filename) {
  const calls = callsIn(buf);
  const r = await asStaff('POST', '/staff/reports', {
    customer: ids[key], kind: 'calls', title: `Call Summary, ${calls.length} calls`, note: '', period_from: day, period_to: day,
    filename, content_base64: buf.toString('base64'), calls,
  });
  return { ...r, buf };
}
for (const b of BUYERS.filter((x) => x.calls)) {
  for (const d of days(LOGGED_FROM, TODAY)) {
    const today = d === TODAY;
    const n = today ? Math.round(between(...b.calls) / 2) : between(...b.calls);
    const buf = callLog(d, n, { to: today ? 13 : 18, first: between(0, 500) });
    reports[`${b.key} ${d}`] = await upload(b.key, d, buf, `${b.nickname} - ${n}.xlsx`);
  }
}

// ── replaced calls the buyers asked for ──────────────────────────────────────
const replace = async (who, key, day, picks, reason) => {
  const r = reports[`${key} ${day}`];
  const calls = callsIn(r.buf);
  await who('POST', `/admin/users/${ids[key]}/replaced-calls`, { report: r.id, calls: picks.map((i) => calls[i]), reason });
};
await replace(asStaff, 'hhp', addDays(TODAY, -3), [2, 9], 'Under 30 seconds');
await replace(asAdmin, 'bpi', addDays(TODAY, -2), [4], 'Same caller twice');
await replace(asStaff, 'nlm', addDays(TODAY, -1), [11], 'Wrong state');

// ── files capture.mjs uploads ────────────────────────────────────────────────
writeFileSync(path.join(files, 'HHP - afternoon.xlsx'), callLog(TODAY, 9, { from: 13, to: 17, first: 900 }));
// Bluepeak's billing report for the three days before the logs: one the same, one with replacements added, one new.
const [d1, d2, d3] = [addDays(LOGGED_FROM, -3), addDays(LOGGED_FROM, -2), addDays(LOGGED_FROM, -1)];
const now1 = await db.getDay(ids.bpi, d1);
const now2 = await db.getDay(ids.bpi, d2);
const head = ['Date', 'Opening Balance ($)', 'Total Calls', 'Replacements', 'Price per Call ($)', 'Call Charges ($)', 'Payment Received ($)', 'Balance ($)'];
const sheet = XLSX.utils.aoa_to_sheet([head, [d1, null, now1.calls, now1.replacements, 42], [d2, null, now2.calls, now2.replacements + 2, 42], [d3, null, 38, 0, 42]]);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, sheet, 'Daily Bills');
writeFileSync(path.join(files, 'Bluepeak billing report.xlsx'), XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));

writeFileSync(path.join(files, 'logins.json'), JSON.stringify({ ...logins, inviteUrl, ids, today: TODAY }, null, 2));
console.log(`Seeded: ${BUYERS.length} buyers, ${Object.keys(reports).length} Call Summaries. Today is ${TODAY}.`);
await pool.end();
