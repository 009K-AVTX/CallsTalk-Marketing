// What the portal shows a signed-in customer, and the billing team's report uploads.
// Same calls as docs/customer-billing-api.md and docs/portal-reports-api.md, served from our own database.
//
//   GET    /api/billing/statement?from=YYYY-MM-DD  (customer)  balance and the last five days' bills
//   POST   /api/billing/statement/pay              (customer)  their USDT (TRC-20) payment address (payments.js)
//   GET    /api/portal/reports                     (customer)  their reports, newest first
//   GET    /api/portal/reports/:id/file            (customer, or staff/admin for any report)
//   GET    /api/staff/customers                    (staff, admin)  customers who have a login
//   GET    /api/staff/reports                      (staff, admin)  every report
//   POST   /api/staff/reports                      (staff, admin)  upload a report for a customer
//   POST   /api/staff/reports/notify               (staff, admin)  { customer, reports: [ids], email, telegram }: tell the customer
//   DELETE /api/staff/reports/:id                  (staff, admin)

import { Router } from 'express';
import { requireUser } from './accounts.js';
import { addDays, HISTORY_DAYS, localDate, statement } from './billing.js';
import { UUID } from './db.js';
import { addReport, deleteReport, getAccount, getReportFile, getUser, listDays, listPayments, listReports, listUsers, telegramLinked } from './portal-db.js';
import { HttpError } from './routes.js';
import { paymentDetails, paymentsEnabled } from './payments.js';
import { config } from './config.js';
import { emailReportReady } from './email.js';
import { reportReadyToTelegram } from './telegram-link.js';
import { rateLimit } from './rate-limit.js';

export const MAX_REPORT_BYTES = 3 * 1024 * 1024;
const TYPES = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  csv: 'text/csv',
};
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const portalRouter = Router();

portalRouter.get('/billing/statement', requireUser('customer'), async (req, res) => {
  const account = await getAccount(req.user.id);
  if (!account) throw new HttpError(404, 'Your billing account has not been set up yet. Our team will notify you once it is ready.');
  const today = localDate(new Date(), account.timezone);
  // Customers get the last five days at most; older bills reach them as reports.
  const asked = DAY.test(req.query.from) ? req.query.from : today;
  const from = [asked, addDays(today, -(HISTORY_DAYS - 1)), account.start_date].sort().pop();
  res.json(statement({
    user: req.user, account, days: await listDays(req.user.id, today), payments: await listPayments(req.user.id), from,
  }));
});

// Where to send the payment: the customer's own USDT (TRC-20) address. It counts once confirmed on the blockchain.
portalRouter.post('/billing/statement/pay', requireUser('customer'), async (req, res) => {
  if (!paymentsEnabled) throw new HttpError(503, 'Online payments are not yet available. Please contact our support team via Telegram or email for payment assistance.');
  if (!await getAccount(req.user.id)) throw new HttpError(404, 'Your billing account has not been set up yet. Our team will notify you once it is ready.');
  const amount = Number(req.body?.amount);
  if (!Number.isFinite(amount) || amount < 1 || amount > 1e7) throw new HttpError(400, 'Please enter an amount of at least $1.00.');
  try {
    res.json(await paymentDetails(req.user, amount.toFixed(2)));
  } catch (err) {
    console.error(`[payments] no payment address for ${req.user.email}:`, err.message);
    throw new HttpError(502, 'Your deposit address could not be retrieved at this time. Please try again shortly.');
  }
});

portalRouter.get('/portal/reports', requireUser('customer'), async (req, res) => {
  res.json({ results: await listReports(req.user.id) });
});

portalRouter.get('/portal/reports/:id/file', requireUser('customer', 'staff', 'admin'), async (req, res) => {
  const report = UUID.test(req.params.id) && await getReportFile(req.params.id);
  if (!report || (req.user.role === 'customer' && report.user_id !== req.user.id)) throw new HttpError(404, 'That report no longer exists.');
  res.setHeader('Content-Type', report.content_type);
  res.setHeader('Content-Disposition', `attachment; filename="${report.filename.replace(/["\\\r\n]/g, '_')}"`);
  res.send(report.content);
});

// ── billing team: staff (reports only) and admins ────────────────────────────

const staff = Router();
staff.use(requireUser('staff', 'admin'));

staff.get('/customers', async (req, res) => {
  const customers = (await listUsers()).filter((u) => u.role === 'customer' && u.status !== 'disabled');
  // `telegram`: they connected Telegram in their Settings, so a new report can be announced there too.
  const linked = await telegramLinked(customers.map((u) => u.id));
  res.json({ results: customers.map((u) => ({
    id: u.id, name: u.company || u.name || u.email, login: u.email, avatar_version: u.avatar_version, telegram: linked.has(u.id),
  })) });
});

staff.get('/reports', async (req, res) => {
  res.json({ results: await listReports() });
});

staff.post('/reports', async (req, res) => {
  const body = req.body || {};
  const customer = UUID.test(body.customer) && await getUser(body.customer);
  if (!customer || customer.role !== 'customer') throw new HttpError(400, 'Choose a customer.');
  const filename = typeof body.filename === 'string' ? body.filename.trim().slice(0, 200) : '';
  const ext = filename.split('.').pop().toLowerCase();
  if (!TYPES[ext] || !filename.includes('.')) throw new HttpError(400, 'Only Excel (.xlsx, .xls) and .csv files can be uploaded.');
  if (!DAY.test(body.period_from) || !DAY.test(body.period_to)) throw new HttpError(400, 'Please choose the days the report covers.');
  if (body.period_from > body.period_to) throw new HttpError(400, 'The start date is after the end date.');
  const content = Buffer.from(typeof body.content_base64 === 'string' ? body.content_base64 : '', 'base64');
  if (!content.length) throw new HttpError(400, 'That file is empty.');
  if (content.length > MAX_REPORT_BYTES) throw new HttpError(413, 'Files up to 3 MB can be uploaded.');

  const title = (typeof body.title === 'string' ? body.title.trim().slice(0, 120) : '') || filename.replace(/\.[^.]+$/, '');
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 300) : '';
  res.status(201).json(await addReport({
    userId: customer.id, title, note, periodFrom: body.period_from, periodTo: body.period_to, filename, contentType: TYPES[ext], content,
  }));
});

// After an upload (one file or several): tell the customer about the new reports, once for the whole upload.
// body: { customer, reports: [ids], email = true, telegram = false }
// -> { emailed, email | reason, telegram: { sent, username | reason } }. Each channel's outcome is reported on its own,
// and a failed notice never undoes the upload. Only customers who can log in are told.
staff.post('/reports/notify', rateLimit({ windowMs: 10 * 60_000, max: 30 }), async (req, res) => {
  const body = req.body || {};
  const customer = UUID.test(body.customer) && await getUser(body.customer);
  if (!customer || customer.role !== 'customer') throw new HttpError(400, 'Choose a customer.');
  const ids = new Set((Array.isArray(body.reports) ? body.reports : []).filter((id) => UUID.test(id)));
  const reports = (await listReports(customer.id)).filter((r) => ids.has(r.id)).reverse(); // oldest first
  if (!reports.length) throw new HttpError(400, 'No reports to notify the customer about.');
  const wantEmail = body.email !== false;
  const wantTelegram = body.telegram === true;

  if (customer.status !== 'active') {
    const reason = customer.status === 'disabled' ? 'their login is deactivated' : 'they have not activated their login yet';
    return res.json({ emailed: false, reason, telegram: { sent: false, reason } });
  }
  const link = `${config.portalUrl}/reports${reports.length === 1 ? `?open=${encodeURIComponent(reports[0].id)}` : ''}`;

  const email = async () => {
    if (!wantEmail) return { emailed: false, reason: 'not asked for' };
    try {
      return await emailReportReady({ name: customer.name, email: customer.email, reports, link })
        ? { emailed: true, email: customer.email }
        : { emailed: false, reason: 'email is not set up on the server' };
    } catch (err) {
      console.error(`[email] could not send the report notice to ${customer.email}:`, err.message);
      return { emailed: false, reason: 'the email could not be sent' };
    }
  };
  const telegram = async () => (wantTelegram ? reportReadyToTelegram(customer.id, reports, link) : { sent: false, reason: 'not asked for' });

  const [byEmail, byTelegram] = await Promise.all([email(), telegram()]);
  res.json({ ...byEmail, telegram: byTelegram });
});

staff.delete('/reports/:id', async (req, res) => {
  if (UUID.test(req.params.id)) await deleteReport(req.params.id);
  res.json({ ok: true });
});

portalRouter.use('/staff', staff);
