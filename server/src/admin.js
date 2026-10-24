// Admin side of the portal: logins for customers and admins, and each customer's billing.
// Admin logins only (Bearer token from /api/accounts).
//
//   GET    /api/admin/users                      everyone, with setup-link state and price
//   POST   /api/admin/users                      new login (+ billing terms for a customer); emails the setup link
//   PATCH  /api/admin/users/:id                  name, company, role, status (active | disabled)
//   POST   /api/admin/users/:id/invite           new setup link; for a login in use this resets password and code app
//   DELETE /api/admin/users/:id                  removes the login and everything stored for it
//   GET    /api/admin/users/:id/billing          terms and the last 31 days' statement
//   PUT    /api/admin/users/:id/billing          terms: price per call, opening balance, start date, time zone
//   PUT    /api/admin/users/:id/days/:date       billable calls on a day (price defaults to the current one)
//   DELETE /api/admin/users/:id/days/:date
//   POST   /api/admin/users/:id/payments         a payment received (bank transfer, USDT...)
//   DELETE /api/admin/users/:id/payments/:paymentId

import { Router } from 'express';
import { config } from './config.js';
import { hashToken, newToken, newTotpSecret } from './auth-crypto.js';
import { requireUser } from './accounts.js';
import { addDays, localDate, statement, validTimeZone } from './billing.js';
import { UUID } from './db.js';
import { emailInvite } from './email.js';
import {
  addPayment, countAdmins, createInvite, createUser, deleteDay, deletePayment, deleteUser, deleteUserSessions,
  findUserByEmail, getAccount, getUser, listDays, listPayments, listUsers, saveAccount, saveDay, updateUser,
} from './portal-db.js';
import { HttpError } from './routes.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
// customer: billing and reports · staff: uploads customer reports only · admin: everything
const ROLES = ['customer', 'staff', 'admin'];
const CURRENCIES = ['USD'];
const DEFAULT_TZ = 'America/New_York';

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

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

const setupLink = (token) => `${config.portalUrl}/setup?token=${encodeURIComponent(token)}`;

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
  if (!account) return { account: null, statement: null };
  const today = localDate(new Date(), account.timezone);
  const from = [addDays(today, -30), account.start_date].sort().pop();
  const result = statement({ user, account, days: await listDays(user.id, today), payments: await listPayments(user.id), from });
  return { account, statement: result };
}

const userView = ({ password_hash: _p, totp_secret: _t, totp_last_step: _s, session_id: _i, ...u }) => u;

export const adminRouter = Router();
adminRouter.use(requireUser('admin'));

adminRouter.get('/users', async (req, res) => {
  res.json({ results: await listUsers() });
});

adminRouter.post('/users', async (req, res) => {
  const body = req.body || {};
  const email = str(body.email, 200).toLowerCase();
  const name = str(body.name, 100);
  const company = str(body.company, 120);
  const role = ROLES.includes(body.role) ? body.role : 'customer';
  if (!EMAIL.test(email)) throw new HttpError(400, 'Please enter a valid email address.');
  if (!name) throw new HttpError(400, 'Please enter the person\'s name.');
  if (role === 'customer' && !company) throw new HttpError(400, 'Please enter the customer\'s company.');
  if (await findUserByEmail(email)) throw new HttpError(409, 'A login with this email already exists.');
  const billing = role === 'customer' ? terms(body) : null;

  const user = await createUser({ email, name, company, role });
  if (billing) await saveAccount(user.id, billing);
  res.status(201).json({ user, ...await sendInvite(user, { createdBy: req.user.id }) });
});

adminRouter.patch('/users/:id', async (req, res) => {
  const user = await loadUser(req);
  const body = req.body || {};
  const self = user.id === req.user.id;
  const change = {};
  if (body.name !== undefined) change.name = str(body.name, 100) || user.name;
  if (body.company !== undefined) change.company = str(body.company, 120);
  if (body.role !== undefined && body.role !== user.role) {
    if (!ROLES.includes(body.role)) throw new HttpError(400, 'Unknown role.');
    if (self) throw new HttpError(400, 'You cannot change your own role.');
    change.role = body.role;
  }
  if (body.status !== undefined && body.status !== user.status) {
    if (!['active', 'disabled'].includes(body.status)) throw new HttpError(400, 'Unknown status.');
    if (self) throw new HttpError(400, 'You cannot turn off your own login.');
    // Turning a login back on: it is active again if it was set up, otherwise it waits for its link.
    change.status = body.status === 'active' && !user.password_hash ? 'invited' : body.status;
  }
  if (user.role === 'admin' && ((change.role && change.role !== 'admin') || change.status === 'disabled') && await countAdmins() <= 1) {
    throw new HttpError(400, 'Keep at least one admin login.');
  }
  const updated = await updateUser(user.id, change);
  if (change.status === 'disabled' || change.role) await deleteUserSessions(user.id);
  res.json({ user: updated });
});

adminRouter.post('/users/:id/invite', async (req, res) => {
  const user = await loadUser(req);
  if (user.id === req.user.id) throw new HttpError(400, 'Ask another admin to reset your own login.');
  if (user.status === 'disabled') throw new HttpError(400, 'Turn this login back on first.');
  const reset = Boolean(user.password_hash);
  res.json({ reset, ...await sendInvite(user, { createdBy: req.user.id, reset }) });
});

adminRouter.delete('/users/:id', async (req, res) => {
  const user = await loadUser(req);
  if (user.id === req.user.id) throw new HttpError(400, 'You cannot delete your own login.');
  if (user.role === 'admin' && user.status !== 'disabled' && await countAdmins() <= 1) throw new HttpError(400, 'Keep at least one admin login.');
  await deleteUser(user.id);
  res.json({ ok: true });
});

adminRouter.get('/users/:id/billing', async (req, res) => {
  const user = await loadCustomer(req);
  res.json({ user: userView(user), ...await billingView(user) });
});

adminRouter.put('/users/:id/billing', async (req, res) => {
  const user = await loadCustomer(req);
  await saveAccount(user.id, terms(req.body || {}, await getAccount(user.id) || {}));
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
  const price = amount(req.body?.price_per_call, 'price per call', { min: 0, required: false }) ?? account.price_per_call;
  await saveDay(user.id, { date, calls, price_per_call: price });
  res.json({ user: userView(user), ...await billingView(user) });
});

adminRouter.delete('/users/:id/days/:date', async (req, res) => {
  const user = await loadCustomer(req);
  await deleteDay(user.id, day(req.params.date));
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
  await addPayment(user.id, {
    amount: amount(body.amount, 'amount', { min: 0.01 }),
    currency: account.currency,
    status,
    reference: str(body.reference, 120),
    note: str(body.note, 200),
    paid_at: onDay(date, account.timezone),
  });
  res.status(201).json({ user: userView(user), ...await billingView(user) });
});

adminRouter.delete('/users/:id/payments/:paymentId', async (req, res) => {
  const user = await loadCustomer(req);
  if (!UUID.test(req.params.paymentId)) throw new HttpError(404, 'That payment no longer exists.');
  await deletePayment(user.id, req.params.paymentId);
  res.json({ user: userView(user), ...await billingView(user) });
});
