// What the portal shows a signed-in customer, and the team's report uploads.
// Same calls as docs/customer-billing-api.md and docs/portal-reports-api.md, served from our own database.
//
//   GET    /api/billing/statement?from=YYYY-MM-DD  (customer)  balance, the last five days' bills and their replaced calls
//   POST   /api/billing/statement/pay              (customer)  their USDT (TRC-20) payment address (payments.js)
//   GET    /api/portal/reports                     (customer)  their Call Summary reports, newest first
//   GET    /api/portal/reports/:id/file            (customer for their Call Summaries, or staff/admin for any report)
//   GET    /api/staff/customers                    (staff, admin)  customers who have a login
//   GET    /api/staff/reports?customer=&kind=      (staff, admin)  every report, of both kinds, or one customer's / kind's
//   POST   /api/staff/reports                      (staff, admin)  upload a report for a customer
//   PUT    /api/staff/reports/:id/calls            (staff, admin)  { calls }: a Call Summary's calls, read in the browser
//   POST   /api/staff/reports/notify               (staff, admin)  { customer, reports: [ids], email, telegram }: tell the customer
//   DELETE /api/staff/reports/:id                  (staff, admin)
//
// A report is one of two kinds. A billing report ('billing') is for the team: an admin can enter its calls in the
// buyer's billing with the upload (portal/src/billing-import.js), and the buyer never sees it. A Call Summary ('calls'),
// the day's call log, is what the buyer views and downloads, and what they are told about. Its calls come with it
// ([{ date, called_at, caller, duration }], read as its viewer shows them: call-summary.js callOf) and bill their
// days: each day's calls are counted from the buyer's logs (portal-db.js syncCallDays). Replies that change billing
// say how, in `billing_days`: [{ date, before, after }].

import { Router } from 'express';
import { requireUser } from './accounts.js';
import { addDays, HISTORY_DAYS, localDate, statement } from './billing.js';
import { UUID } from './db.js';
import {
  addReport, deleteReportAndSync, getAccount, getReportFile, getReportInfo, getUser, listDays, listPayments, listReplacedCalls, listReports,
  listUsers, setReportCalls, telegramLinked,
} from './portal-db.js';
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
const KINDS = ['billing', 'calls'];
const MAX_CALLS = 5000;

const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const dayText = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });

// A Call Summary's calls as sent, checked: each on a day the report covers.
function callsOf(list, from, to) {
  if (list.length > MAX_CALLS) throw new HttpError(400, `A Call Summary can list up to ${MAX_CALLS.toLocaleString('en-US')} calls.`);
  return list.map((c) => {
    const call = { date: c?.date, called_at: text(c?.called_at, 40), caller: text(c?.caller, 40), duration: text(c?.duration, 20) };
    if (!DAY.test(call.date || '') || !call.called_at) throw new HttpError(400, 'The calls in this file could not be read. Choose the file again.');
    if (call.date < from || call.date > to) {
      throw new HttpError(400, `The file has calls on ${dayText(call.date)}, outside the days chosen (${dayText(from)}${to === from ? '' : ` to ${dayText(to)}`}).`);
    }
    return call;
  });
}

export const portalRouter = Router();

portalRouter.get('/billing/statement', requireUser('customer'), async (req, res) => {
  const account = await getAccount(req.user.id);
  if (!account) throw new HttpError(404, 'Your billing account has not been set up yet. Our team will notify you once it is ready.');
  const today = localDate(new Date(), account.timezone);
  // Customers get the last five days at most; older bills reach them as reports.
  const asked = DAY.test(req.query.from) ? req.query.from : today;
  const from = [asked, addDays(today, -(HISTORY_DAYS - 1)), account.start_date].sort().pop();
  const [days, payments, replaced] = await Promise.all([listDays(req.user.id, today), listPayments(req.user.id), listReplacedCalls(req.user.id, from)]);
  res.json({
    ...statement({ user: req.user, account, days, payments, from }),
    // The calls our team replaced at their request on these days, without who did it.
    replaced_calls: replaced.map((c) => ({
      date: c.date, called_at: c.called_at, caller: c.caller, duration: c.duration, reason: c.reason, replaced_at: c.created_at,
    })),
  });
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
  // Without their nickname: that is the team's name for them.
  res.json({ results: (await listReports(req.user.id, 'calls')).map(({ customer_name, ...r }) => r) });
});

portalRouter.get('/portal/reports/:id/file', requireUser('customer', 'staff', 'admin'), async (req, res) => {
  const report = UUID.test(req.params.id) && await getReportFile(req.params.id);
  const theirs = report && report.user_id === req.user.id && report.kind === 'calls';
  if (!report || (req.user.role === 'customer' && !theirs)) throw new HttpError(404, 'That report no longer exists.');
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
    id: u.id, name: u.name || u.email, company: u.company, login: u.email, nickname: u.nickname, version: u.version,
    avatar_version: u.avatar_version, telegram: linked.has(u.id),
  })) });
});

staff.get('/reports', async (req, res) => {
  const customer = UUID.test(req.query.customer) ? req.query.customer : null;
  res.json({ results: await listReports(customer, KINDS.includes(req.query.kind) ? req.query.kind : null) });
});

staff.post('/reports', async (req, res) => {
  const body = req.body || {};
  const customer = UUID.test(body.customer) && await getUser(body.customer);
  if (!customer || customer.role !== 'customer') throw new HttpError(400, 'Choose a customer.');
  if (!KINDS.includes(body.kind)) throw new HttpError(400, 'Choose whether this is a billing report or a Call Summary.');
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
  const calls = body.kind === 'calls' && Array.isArray(body.calls) ? callsOf(body.calls, body.period_from, body.period_to) : null;
  const report = await addReport({
    userId: customer.id, kind: body.kind, title, note, periodFrom: body.period_from, periodTo: body.period_to, filename, contentType: TYPES[ext], content,
  });
  const billingDays = calls ? await setReportCalls(report, calls) : [];
  res.status(201).json({ ...report, calls: calls ? calls.length : report.calls, billing_days: billingDays });
});

// A Call Summary's calls, for one uploaded before calls were read (or read again): its days are billed from them.
staff.put('/reports/:id/calls', async (req, res) => {
  const report = UUID.test(req.params.id) && await getReportInfo(req.params.id);
  if (!report) throw new HttpError(404, 'That report no longer exists.');
  if (report.kind !== 'calls') throw new HttpError(400, 'Only a Call Summary\'s calls are read into billing.');
  const calls = callsOf(Array.isArray(req.body?.calls) ? req.body.calls : [], report.period_from, report.period_to);
  const billingDays = await setReportCalls(report, calls);
  res.json({ ...await getReportInfo(report.id), billing_days: billingDays });
});

// After an upload (one file or several): tell the customer about the new Call Summaries, once for the whole upload.
// Billing reports are never announced: the customer cannot open them.
// body: { customer, reports: [ids], email = true, telegram = false }
// -> { emailed, email | reason, telegram: { sent, username | reason } }. Each channel's outcome is reported on its own,
// and a failed notice never undoes the upload. Only customers who can log in are told.
staff.post('/reports/notify', rateLimit({ windowMs: 10 * 60_000, max: 30 }), async (req, res) => {
  const body = req.body || {};
  const customer = UUID.test(body.customer) && await getUser(body.customer);
  if (!customer || customer.role !== 'customer') throw new HttpError(400, 'Choose a customer.');
  const ids = new Set((Array.isArray(body.reports) ? body.reports : []).filter((id) => UUID.test(id)));
  const reports = (await listReports(customer.id, 'calls')).filter((r) => ids.has(r.id)).reverse(); // oldest first
  if (!reports.length) throw new HttpError(400, 'No Call Summary reports to notify the customer about.');
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
  res.json({ ok: true, billing_days: UUID.test(req.params.id) ? await deleteReportAndSync(req.params.id) : [] });
});

portalRouter.use('/staff', staff);
