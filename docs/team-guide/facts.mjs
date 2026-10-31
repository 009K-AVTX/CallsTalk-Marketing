// Prints the figures the guide's text quotes, from the demo copy as the screenshots show it: Finance for the last 30
// days, and Harbor's last five days (the worked example). Run after capture.mjs.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { API, here, serverModules } from './demo-env.mjs';

const { pool, db, crypto } = await serverModules();
const L = JSON.parse(readFileSync(path.join(here, '.demo', 'logins.json'), 'utf8'));
const access = crypto.newToken();
await db.createSession({ userId: L.admin.id, accessHash: crypto.hashToken(access), accessExpires: new Date(Date.now() + 600_000), refreshHash: crypto.hashToken(crypto.newToken()), refreshExpires: new Date(Date.now() + 600_000) });
const get = async (p) => (await fetch(API + p, { headers: { Authorization: `Bearer ${access}` } })).json();
const ago = (n) => { const d = new Date(`${L.today}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };

const f = await get(`/admin/finance?from=${ago(29)}&to=${L.today}`);
const { payments, ...rest } = f;
console.log(JSON.stringify({ ...rest, days: undefined, payments: payments?.total ?? payments?.results?.length }, null, 1).slice(0, 6000));
const h = await get(`/admin/users/${L.ids.hhp}/billing`);
console.log(JSON.stringify({ price: h.account.price_per_call, balance: h.statement.balance, days: h.statement.days.slice(0, 6).map(({ date, opening_balance, calls, replacements, charges, payment_received, balance }) => ({ date, opening_balance, calls, replacements, charges, payment_received, balance })) }, null, 1));
await pool.query('DELETE FROM portal_sessions WHERE access_hash = $1', [crypto.hashToken(access)]);
await pool.end();
