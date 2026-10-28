// Admin side of the portal: logins for customers and admins, and each customer's billing.
// Admin logins, and staff for a customer's page (STAFF_ROUTES below: everything but a role change or deleting).
//
//   GET    /api/admin/users                      a page of logins (?q, ?role, ?limit, ?offset), with setup-link state and price
//   GET    /api/admin/users/options              everyone, briefly, for filters
//   GET    /api/admin/users/:id                  one login
//   POST   /api/admin/users                      new login (+ billing terms for a customer); emails the setup link (staff: customers only)
//   PATCH  /api/admin/users/:id                  name, company, nickname (customers), role, status (active | disabled)
//   PATCH  /api/admin/users/:id/nickname         a customer's nickname ("Q10"), for staff too
//   POST   /api/admin/users/:id/invite           new setup link; for a login in use this resets password and code app
//   DELETE /api/admin/users/:id                  removes the login and everything stored for it
//   GET    /api/admin/users/:id/billing          terms, the last 31 days' statement and replaced calls, and their contact methods
//   GET    /api/admin/users/:id/activity         the latest audit entries by or about the login
//   PUT    /api/admin/users/:id/billing          terms: price per call, opening balance, start date, time zone
//   PUT    /api/admin/users/:id/days/:date       a day's calls and replacements (not charged); price defaults to the current one.
//                                                A day billed from its Call Summaries keeps their calls (portal.js)
//   DELETE /api/admin/users/:id/days/:date
//   POST   /api/admin/users/:id/replaced-calls   { report, calls: [{ date, called_at, caller, duration }], reason }: calls
//                                                from a Call Summary taken off their days' bills, one replacement each
//   GET    /api/admin/users/:id/replaced-calls?from=&to=  calls replaced on those days (default the last 7), latest first
//   DELETE /api/admin/users/:id/replaced-calls/:callId   puts a replaced call back on its day's bill
//   POST   /api/admin/users/:id/payments         a payment received (bank transfer, USDT...)
//   DELETE /api/admin/users/:id/payments/:paymentId
//   GET    /api/admin/audit...                   the audit trail (audit.js)
//   GET    /api/admin/finance                    billed, collected and owed across customers (finance.js)
//   GET    /api/admin/notifications              the team's billing notices on Telegram (billing-notices.js)

import { Router } from 'express';
import { auditRouter } from './audit.js';
import { financeRouter } from './finance.js';
import { billingNoticesRouter, paymentReceived } from './billing-notices.js';
import { telegramOf } from './telegram-link.js';
import { config } from './config.js';
import { hashToken, newToken, newTotpSecret } from './auth-crypto.js';
import { requireUser } from './accounts.js';
import { addDays, localDate, statement, validTimeZone } from './billing.js';
import { UUID } from './db.js';
import { emailInvite } from './email.js';
import { contactsOf } from './contacts.js';
import {
  addPayment, countReplacedCalls, createInvite, createUser, deleteDay, deletePayment, deleteUser, deleteUserSessions, getDay, getReportInfo,
  findUserByEmail, findUserByNickname, getAccount, getUser, listAudit, listDays, listPayments, listReplacedCalls, getUserRow, listUserOptions, listUsersPage,
  replaceCalls, saveAccount, saveDay, syncAllCallDays, undoReplacedCall, updateUser, withAdminLock,
} from './portal-db.js';
import { HttpError } from './routes.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
// customer: billing and reports · staff: customer reports, and customers' logins and billing (no roles or deleting)
// · admin: everything
const ROLES = ['customer', 'staff', 'admin'];
const CURRENCIES = ['USD'];
const DEFAULT_TZ = 'America/New_York';

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const dayText = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });

// Concurrency control: a change carries the `version` it was made from (portal-db.js). Left out, the change
// applies to whatever is there, as before.
const versionOf = (body) => (Number.isInteger(body?.version) && body.version >= 0 ? body.version : null);
// A day billed from its Call Summaries (portal-db.js syncCallDays) takes its calls from them alone.
const fromCallLog = (date, calls) => new HttpError(400, `The calls on ${dayText(date)} (${calls}) come from its Call Summaries. To change them, upload the corrected call log under Reports, or delete the wrong one.`);
const outOfDate = () => new HttpError(409, 'Someone else saved a change here a moment ago, so yours was not saved. The page now shows the latest: check it, then save again.');

// A customer's nickname ("Q10"), or '' for none: no two logins share one, whatever the case.
async function nickname(v, exceptId = null) {
  const nick = str(v, 40);
  const taken = nick && await findUserByNickname(nick, exceptId);
  if (taken) throw new HttpError(400, `${taken.name || taken.email} already has the nickname ${nick}.`);
  return nick;
}
// The database's own check, for two saves of the same nickname at once.
const nicknameTaken = (err) => {
  if (err.code === '23505' && err.constraint === 'portal_users_nickname') throw new HttpError(400, 'Another customer has just taken that nickname.');
  throw err;
};

function amount(v, label, { min = -1e9, required = true } = {}) {
  if ((v === undefined || v === null || v === '') && !required) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > 1e9) throw new HttpError(400, `Please enter a valid ${label}.`);
  return n.toFixed(2);
}

function day(v, label = 'date') {
  if (typeof v !== 'string' || !DAY.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) throw new HttpError(400, `Please enter a valid ${label}.`);
  return v;
}

// Billing terms from a form; `current` fills what was left out.
function terms(body, current = {}) {
  const timezone = str(body.timezone, 60) || current.timezone || DEFAULT_TZ;
  if (!validTimeZone(timezone)) throw new HttpError(400, 'That time zone is not known. Use one like America/New_York.');
  const currency = (str(body.currency, 3) || current.currency || 'USD').toUpperCase();
  if (!CURRENCIES.includes(currency)) throw new HttpError(400, 'Only USD is supported for now.');
  return {
    currency,
    timezone,
    price_per_call: amount(body.price_per_call ?? current.price_per_call ?? 0, 'price per call', { min: 0 }),
    opening_balance: amount(body.opening_balance ?? current.opening_balance ?? 0, 'opening balance'),
    start_date: day(body.start_date || current.start_date || localDate(new Date(), timezone), 'start date'),
  };
}

// A moment on the customer's calendar day: now for today, otherwise midday there.
function onDay(date, timeZone) {
  if (date === localDate(new Date(), timeZone)) return new Date();
  let t = new Date(`${date}T12:00:00Z`);
  for (let i = 0; i < 3 && localDate(t, timeZone) !== date; i++) {
    t = new Date(t.getTime() + (localDate(t, timeZone) > date ? -1 : 1) * 6 * 3_600_000);
  }
  return t;
}

// The token rides in the #fragment, which browsers never send to a server: it stays out of access logs and Referer headers.
const setupLink = (token) => `${config.portalUrl}/setup#token=${encodeURIComponent(token)}`;

// Makes a setup link, emails it and returns it, so the admin can also pass it on another way.
export async function sendInvite(user, { createdBy = null, reset = false } = {}) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + config.portal.inviteDays * 86_400_000);
  await createInvite(user.id, { tokenHash: hashToken(token), secret: newTotpSecret(), createdBy, expiresAt, reset });
  const link = setupLink(token);
  let emailed = false;
  let emailError = '';
  try {
    // The expiry is written in the customer's own time zone (their billing account's), not the team's.
    const timeZone = (await getAccount(user.id).catch(() => null))?.timezone || DEFAULT_TZ;
    emailed = await emailInvite({ name: user.name, email: user.email, link, expiresAt, reset, timeZone });
    if (!emailed) emailError = 'Email is not set up on the server (SMTP), so send the link yourself.';
  } catch (err) {
    console.error(`[portal] could not email the setup link to ${user.email}:`, err.message);
    emailError = 'The email could not be sent, so send the link yourself.';
  }
  return { invite_url: link, expires_at: expiresAt, emailed, email_error: emailError };
}

async function loadUser(req) {
  const user = UUID.test(req.params.id) && await getUser(req.params.id);
  if (!user) throw new HttpError(404, 'That login no longer exists.');
  return user;
}

async function loadCustomer(req) {
  const user = await loadUser(req);
  if (user.role !== 'customer') throw new HttpError(400, 'Billing is only kept for customer logins.');
  return user;
}

async function billingView(user) {
  const account = await getAccount(user.id);
  const [contacts, telegram] = await Promise.all([contactsOf(user.id), telegramOf(user.id)]);
  if (!account) return { account: null, statement: null, contacts, telegram };
  const today = localDate(new Date(), account.timezone);
  const from = [addDays(today, -30), account.start_date].sort().pop();
  const [days, payments, replaced] = await Promise.all([listDays(user.id, today), listPayments(user.id), listReplacedCalls(user.id, from)]);
  const result = statement({ user, account, days, payments, from });
  // Each shown day's version, sent back with a change to it (concurrency control).
  const dayVersions = Object.fromEntries(days.filter((d) => d.date >= from).map((d) => [d.date, d.version]));
  return { account, statement: result, replaced_calls: replaced, contacts, telegram, day_versions: dayVersions };
}

const userView = ({ password_hash: _p, totp_secret: _t, totp_last_step: _s, session_id: _i, ...u }) => u;

// What staff may do here besides adding customers and their nicknames: work a customer's page, as admins do (their
// login, billing terms, calls, replaced calls, payments and recent activity), but not change a role or delete a
// login. Anything not listed, including routes added later, is for admins only.
const ID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const STAFF_ROUTES = [
  ['GET', `/users/${ID}`], ['PATCH', `/users/${ID}`], ['POST', `/users/${ID}/invite`],
  ['GET', `/users/${ID}/billing`], ['PUT', `/users/${ID}/billing`], ['GET', `/users/${ID}/activity`],
  ['PUT', `/users/${ID}/days/[^/]+`], ['DELETE', `/users/${ID}/days/[^/]+`],
  ['POST', `/users/${ID}/payments`], ['DELETE', `/users/${ID}/payments/[^/]+`],
  ['GET', `/users/${ID}/replaced-calls`], ['POST', `/users/${ID}/replaced-calls`], ['DELETE', `/users/${ID}/replaced-calls/[^/]+`],
].map(([method, path]) => [method, new RegExp(`^${path}$`)]);

async function staffOnCustomers(req, res, next) {
  if (req.user.role === 'admin' || (req.method === 'POST' && req.path === '/users') || /^\/users\/[^/]+\/nickname$/.test(req.path)) return next();
  if (!STAFF_ROUTES.some(([method, re]) => method === req.method && re.test(req.path))) throw new HttpError(403, 'You do not have permission to access this page.');
  const user = await getUser(req.path.split('/')[2]);
  if (user && user.role !== 'customer') throw new HttpError(403, 'Staff can only open customer logins.');
  next();
}

export const adminRouter = Router();
adminRouter.use(requireUser('staff', 'admin'), staffOnCustomers);
// Staff can add buyers (customer logins) and change their nicknames too.
adminRouter.post('/users', requireUser('staff', 'admin'), createLogin);
adminRouter.patch('/users/:id/nickname', requireUser('staff', 'admin'), async (req, res) => {
  const user = await loadUser(req);
  if (user.role !== 'customer') throw new HttpError(400, 'Only customers have a nickname.');
  const nick = await nickname(req.body?.nickname, user.id);
  const row = await updateUser(user.id, { nickname: nick }, versionOf(req.body)).catch(nicknameTaken);
  if (!row) throw outOfDate();
  res.json({ user: row });
});
adminRouter.use('/audit', auditRouter);
adminRouter.use('/finance', financeRouter);
adminRouter.use('/notifications', billingNoticesRouter);

// A page of logins: ?q= (name, email or company), ?role=, ?limit= (50, at most 200), ?offset=.
// -> { results, total, counts: { customer, staff, admin }, waiting, limit, offset }
adminRouter.get('/users', async (req, res) => {
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 50, 1), 200);
  const offset = Math.min(Math.max(Number.parseInt(req.query.offset, 10) || 0, 0), 100_000);
  const role = ROLES.includes(req.query.role) ? req.query.role : null;
  const q = str(req.query.q, 100);
  res.json({ ...await listUsersPage({ q, role, limit, offset }), limit, offset });
});

// Everyone, briefly (id, name, company, email, role): for the person and customer filters.
adminRouter.get('/users/options', async (req, res) => {
  res.json({ results: await listUserOptions() });
});

// One login, as in the list.
adminRouter.get('/users/:id', async (req, res) => {
  const user = UUID.test(req.params.id) && await getUserRow(req.params.id);
  if (!user) throw new HttpError(404, 'That login no longer exists.');
  res.json({ user });
});

async function createLogin(req, res) {
  const body = req.body || {};
  const email = str(body.email, 200).toLowerCase();
  const name = str(body.name, 100);
  const company = str(body.company, 120);
  const role = ROLES.includes(body.role) ? body.role : 'customer';
  if (req.user.role !== 'admin' && role !== 'customer') throw new HttpError(403, 'Staff can only add customer logins.');
  if (!EMAIL.test(email)) throw new HttpError(400, 'Please enter a valid email address.');
  if (!name) throw new HttpError(400, 'Please enter the person\'s name.');
  if (role === 'customer' && !company) throw new HttpError(400, 'Please enter the customer\'s company.');
  if (await findUserByEmail(email)) throw new HttpError(409, 'A login with this email already exists.');
  const billing = role === 'customer' ? terms(body) : null;
  const nick = role === 'customer' ? await nickname(body.nickname) : '';

  const user = await createUser({ email, name, company, nickname: nick, role }).catch(nicknameTaken);
  if (billing) await saveAccount(user.id, billing);
  res.status(201).json({ user, ...await sendInvite(user, { createdBy: req.user.id }) });
}

adminRouter.patch('/users/:id', async (req, res) => {
  const user = await loadUser(req);
  const body = req.body || {};
  const self = user.id === req.user.id;
  const change = {};
  if (body.name !== undefined) change.name = str(body.name, 100) || user.name;
  if (body.company !== undefined) change.company = str(body.company, 120);
  if (body.nickname !== undefined) change.nickname = await nickname(body.nickname, user.id);
  if (body.role !== undefined && body.role !== user.role) {
    if (req.user.role !== 'admin') throw new HttpError(403, 'Only admins can change a login\'s role.');
    if (!ROLES.includes(body.role)) throw new HttpError(400, 'Unknown role.');
    if (self) throw new HttpError(400, 'You cannot change your own role.');
    change.role = body.role;
  }
  if (body.status !== undefined && body.status !== user.status) {
    if (!['active', 'disabled'].includes(body.status)) throw new HttpError(400, 'Unknown status.');
    if (self) throw new HttpError(400, 'You cannot deactivate your own login.');
    // Turning a login back on: it is active again if it was set up, otherwise it waits for its link.
    change.status = body.status === 'active' && !user.password_hash ? 'invited' : body.status;
  }
  // Checked against the login as it is inside the lock, not as it was read above.
  const updated = await withAdminLock(user.id, async (db, admins, now) => {
    if (!now) throw new HttpError(404, 'That login no longer exists.');
    const removesAdmin = now.role === 'admin' && now.status !== 'disabled' && ((change.role && change.role !== 'admin') || change.status === 'disabled');
    if (removesAdmin && admins <= 1) throw new HttpError(400, 'Keep at least one admin login.');
    const row = await updateUser(user.id, change, versionOf(body), db).catch(nicknameTaken);
    if (!row) throw outOfDate();
    return row;
  });
  if (change.status === 'disabled' || change.role) await deleteUserSessions(user.id);
  res.json({ user: updated });
});

adminRouter.post('/users/:id/invite', async (req, res) => {
  const user = await loadUser(req);
  if (user.id === req.user.id) throw new HttpError(400, 'Ask another admin to reset your own login.');
  if (user.status === 'disabled') throw new HttpError(400, 'Reactivate this login first.');
  const reset = Boolean(user.password_hash);
  res.json({ reset, ...await sendInvite(user, { createdBy: req.user.id, reset }) });
});

adminRouter.delete('/users/:id', async (req, res) => {
  const user = await loadUser(req);
  if (user.id === req.user.id) throw new HttpError(400, 'You cannot delete your own login.');
  await withAdminLock(user.id, async (db, admins, now) => {
    if (now?.role === 'admin' && now.status !== 'disabled' && admins <= 1) throw new HttpError(400, 'Keep at least one admin login.');
    if (now) await deleteUser(user.id, db);
  });
  res.json({ ok: true });
});

adminRouter.get('/users/:id/billing', async (req, res) => {
  const user = await loadCustomer(req);
  res.json({ user: userView(user), ...await billingView(user) });
});

// The latest audit entries by or about this login (?limit=, 8, at most 30): the page's Recent Activity. Staff see
// these for customers; the whole Audit Log is for admins.
adminRouter.get('/users/:id/activity', async (req, res) => {
  const user = await loadUser(req);
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 8, 1), 30);
  const { rows } = await listAudit({ tz: 'UTC', about: user.id }, { limit, count: false });
  res.json({ rows });
});

adminRouter.put('/users/:id/billing', async (req, res) => {
  const user = await loadCustomer(req);
  const saved = await saveAccount(user.id, terms(req.body || {}, await getAccount(user.id) || {}), versionOf(req.body));
  if (!saved) throw outOfDate();
  await syncAllCallDays(user.id); // Call Summaries uploaded before the terms were set, or before a new start date
  res.json({ user: userView(user), ...await billingView(user) });
});

adminRouter.put('/users/:id/days/:date', async (req, res) => {
  const user = await loadCustomer(req);
  const account = await getAccount(user.id);
  if (!account) throw new HttpError(400, 'Set this customer\'s billing terms first.');
  const date = day(req.params.date);
  if (date < account.start_date) throw new HttpError(400, 'That day is before this customer\'s billing start date.');
  if (date > localDate(new Date(), account.timezone)) throw new HttpError(400, 'Calls can only be entered for today or earlier.');
  const calls = Number(req.body?.calls);
  if (!Number.isInteger(calls) || calls < 0 || calls > 1_000_000) throw new HttpError(400, 'Please enter the number of calls as a whole number.');
  // Replacements left out keep what the day already has.
  const existing = await getDay(user.id, date);
  if (existing?.from_calls && calls !== existing.calls) throw fromCallLog(date, existing.calls);
  const replacements = req.body?.replacements === undefined || req.body.replacements === '' ? existing?.replacements ?? 0 : Number(req.body.replacements);
  if (!Number.isInteger(replacements) || replacements < 0) throw new HttpError(400, 'Please enter replacements as a whole number (0 for none).');
  if (replacements > calls) throw new HttpError(400, `Replacements (${replacements}) cannot be more than the day's calls (${calls}).`);
  // Calls replaced one by one stay counted until they are put back.
  const picked = await countReplacedCalls(user.id, date);
  if (replacements < picked) throw new HttpError(400, `${picked} call${picked === 1 ? ' was' : 's were'} replaced on ${dayText(date)}, so the day needs at least ${picked} replacement${picked === 1 ? '' : 's'}. Undo them under Replaced Calls first.`);
  const price = amount(req.body?.price_per_call, 'price per call', { min: 0, required: false }) ?? existing?.price_per_call ?? account.price_per_call;
  if (!await saveDay(user.id, { date, calls, replacements, price_per_call: price }, versionOf(req.body))) throw outOfDate();
  res.json({ user: userView(user), ...await billingView(user) });
});

adminRouter.delete('/users/:id/days/:date', async (req, res) => {
  const user = await loadCustomer(req);
  const date = day(req.params.date);
  const expected = /^\d{1,9}$/.test(req.query.version || '') ? Number(req.query.version) : null;
  const picked = await countReplacedCalls(user.id, date);
  if (picked) throw new HttpError(400, `${picked} call${picked === 1 ? ' was' : 's were'} replaced on ${dayText(date)}. Undo ${picked === 1 ? 'it' : 'them'} under Replaced Calls first, then clear the day.`);
  const existing = await getDay(user.id, date);
  if (existing?.from_calls) throw fromCallLog(date, existing.calls);
  if (!await deleteDay(user.id, date, expected)) throw outOfDate();
  res.json({ user: userView(user), ...await billingView(user) });
});

// The calls replaced on a period's days (?from=, ?to=; the last 7 days by default), latest day first. Replacements
// are asked for a day or two after the calls, so the team looks them up by the day of the call.
adminRouter.get('/users/:id/replaced-calls', async (req, res) => {
  const user = await loadCustomer(req);
  const account = await getAccount(user.id);
  if (!account) return res.json({ results: [] });
  const to = DAY.test(req.query.to || '') ? req.query.to : localDate(new Date(), account.timezone);
  const from = DAY.test(req.query.from || '') ? req.query.from : addDays(to, -6);
  if (from > to) throw new HttpError(400, 'The start date is after the end date.');
  res.json({ results: await listReplacedCalls(user.id, from, to) });
});

// Calls the buyer asked to have replaced, picked in one of their Call Summaries. Each call's day must have its calls
// entered, with room for the new replacements; otherwise nothing is saved. Calls already replaced are left as they are.
adminRouter.post('/users/:id/replaced-calls', async (req, res) => {
  const user = await loadCustomer(req);
  const account = await getAccount(user.id);
  if (!account) throw new HttpError(400, 'Set this customer\'s billing terms first.');
  const body = req.body || {};
  const report = UUID.test(body.report) && await getReportInfo(body.report);
  if (!report || report.user_id !== user.id || report.kind !== 'calls') throw new HttpError(400, 'Choose one of this customer\'s Call Summaries.');
  const list = Array.isArray(body.calls) ? body.calls : [];
  if (!list.length) throw new HttpError(400, 'Choose the calls to replace.');
  if (list.length > 500) throw new HttpError(400, 'Replace up to 500 calls at a time.');
  const today = localDate(new Date(), account.timezone);
  const calls = list.map((c) => {
    const call = { date: day(c?.date, 'call day'), called_at: str(c?.called_at, 40), caller: str(c?.caller, 40), duration: str(c?.duration, 20) };
    if (!call.called_at) throw new HttpError(400, 'Each call needs its time, as the Call Summary shows it.');
    if (call.date < report.period_from || call.date > report.period_to) throw new HttpError(400, `A call on ${dayText(call.date)} is outside the days this Call Summary covers.`);
    if (call.date < account.start_date || call.date > today) throw new HttpError(400, `Calls on ${dayText(call.date)} are not billed.`);
    return call;
  });
  const result = await replaceCalls(user.id, calls, { reportId: report.id, reason: str(body.reason, 200), by: req.user });
  if (result.refused) {
    const { date, calls: entered, replacements, adding } = result.refused;
    throw new HttpError(400, entered === null
      ? `${dayText(date)} has no calls in billing yet. Enter the day's calls first, then replace.`
      : `${dayText(date)} has ${entered} call${entered === 1 ? '' : 's'} in billing with ${replacements} replaced, so ${adding} more cannot be replaced.`);
  }
  res.json({ replaced: result.replaced, user: userView(user), ...await billingView(user) });
});

adminRouter.delete('/users/:id/replaced-calls/:callId', async (req, res) => {
  const user = await loadCustomer(req);
  if (UUID.test(req.params.callId)) await undoReplacedCall(user.id, req.params.callId);
  res.json({ user: userView(user), ...await billingView(user) });
});

adminRouter.post('/users/:id/payments', async (req, res) => {
  const user = await loadCustomer(req);
  const account = await getAccount(user.id);
  if (!account) throw new HttpError(400, 'Set this customer\'s billing terms first.');
  const body = req.body || {};
  const date = day(body.date || localDate(new Date(), account.timezone));
  if (date > localDate(new Date(), account.timezone)) throw new HttpError(400, 'Payments can only be recorded for today or earlier.');
  const status = ['completed', 'pending', 'failed'].includes(body.status) ? body.status : 'completed';
  const paid = amount(body.amount, 'amount', { min: 0.01 });
  await addPayment(user.id, {
    amount: paid,
    currency: account.currency,
    status,
    reference: str(body.reference, 120),
    note: str(body.note, 200),
    paid_at: onDay(date, account.timezone),
  });
  // The team and the buyer hear of every completed payment, whoever recorded it (billing-notices.js).
  if (status === 'completed') {
    paymentReceived(user.id, {
      amount: paid, method: `Recorded by ${req.user.name || req.user.email}`, buyerMethod: 'Recorded by our team',
      note: str(body.note, 200), reference: str(body.reference, 120), on: date,
    });
  }
  res.status(201).json({ user: userView(user), ...await billingView(user) });
});

adminRouter.delete('/users/:id/payments/:paymentId', async (req, res) => {
  const user = await loadCustomer(req);
  if (!UUID.test(req.params.paymentId)) throw new HttpError(404, 'That payment no longer exists.');
  await deletePayment(user.id, req.params.paymentId);
  res.json({ user: userView(user), ...await billingView(user) });
});
