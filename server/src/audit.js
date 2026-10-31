// Audit trail: who did what in the portal, and when. Built like the CRM's (server/src/Audit.php there).
//
// Two ways in:
//  - auditTrail, one middleware in front of every /api route, writes a row for each signed-in change it knows
//    (ROUTES below) once the reply has gone out, with the status actually sent. A route added later and left
//    out of ROUTES is not logged, so add it here when you add it to the API, and give the action a sentence in
//    portal/src/audit-text.js.
//  - recordAudit() writes a row straight away, for what has no signed-in request behind it: sign-ins, failed
//    sign-ins, setup links being used and deposits credited by the payment check.
//
// Secrets (passwords, codes, tokens) never reach the log, and uploaded files are logged by size only.
// Reads are not logged, except downloads of the audit log and finance report (export=csv|pdf on their calls).
//
//   GET /api/admin/audit?from&to&tz&action&kind&user&target&about&outcome&q&limit&offset  -> { rows, total }
//     user: done by that login · target: about it · about: either
//   GET /api/admin/audit/summary  (same filters)        -> { per_day, totals, people }
//   GET /api/admin/audit/actions                         -> every action in the log, for the filter

import { Router } from 'express';
import { validTimeZone } from './billing.js';
import { UUID } from './db.js';
import { buyerName } from './format.js';
import {
  addAuditEntry, auditActions, auditSummary, getAccount, getDay, getPayment, getReplacedCall, getReportInfo, getUser, listAudit, paymentStatuses,
} from './portal-db.js';
import { reportLimits } from './rate-limit.js';
import { HttpError } from './routes.js';

const SECRET = new Set(['password', 'current_password', 'new_password', 'code', 'token', 'temp_token', 'refresh']);
const FILES = new Set(['content_base64']);

// What was sent, fit for the log: secrets masked, files reduced to their size.
function clean(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return {};
  const out = {};
  for (const [k, v] of Object.entries(body)) {
    if (SECRET.has(k)) out[k] = '***';
    else if (FILES.has(k)) out.file_bytes = typeof v === 'string' ? Math.floor((v.length * 3) / 4) : 0;
    else out[k] = typeof v === 'string' ? v.slice(0, 300) : v;
  }
  return out;
}

const label = buyerName;
const dayChange = ({ date, before, after }) => `${date}: ${before ?? 'none'} to ${after ?? 'none'} call${after === 1 ? '' : 's'}`;
const pick = (o, keys) => o && Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));

// The login a change is about, loaded before the change so a deleted login still has a name in the log.
const subject = async (m) => {
  const user = UUID.test(m.user) ? await getUser(m.user) : null;
  return user && { id: user.id, label: label(user), email: user.email, before: pick(user, ['name', 'company', 'nickname', 'role', 'status']) };
};

// method, path (under /api), action, and what to read before the change happens.
// `before` returns { id, label, email, before }: the target and how it looked.
const ROUTES = [
  ['POST', /^\/admin\/users$/, 'login.create'],
  ['PATCH', /^\/admin\/users\/(?<user>[^/]+)$/, 'login.update', subject],
  ['PATCH', /^\/admin\/users\/(?<user>[^/]+)\/nickname$/, 'login.update', subject],
  ['POST', /^\/admin\/users\/(?<user>[^/]+)\/invite$/, 'login.link', subject],
  ['DELETE', /^\/admin\/users\/(?<user>[^/]+)$/, 'login.delete', subject],
  ['PUT', /^\/admin\/users\/(?<user>[^/]+)\/billing$/, 'billing.terms', async (m) => {
    const s = await subject(m);
    return s && { ...s, before: await getAccount(s.id) };
  }],
  ['PUT', /^\/admin\/users\/(?<user>[^/]+)\/days\/(?<day>[^/]+)$/, 'calls.save', async (m) => {
    const s = await subject(m);
    const day = s && /^\d{4}-\d{2}-\d{2}$/.test(m.day) ? await getDay(s.id, m.day) : null;
    return s && { ...s, before: day ? pick(day, ['calls', 'replacements', 'price_per_call']) : null };
  }],
  ['DELETE', /^\/admin\/users\/(?<user>[^/]+)\/days\/(?<day>[^/]+)$/, 'calls.clear', async (m) => {
    const s = await subject(m);
    const day = s && /^\d{4}-\d{2}-\d{2}$/.test(m.day) ? await getDay(s.id, m.day) : null;
    return s && { ...s, before: day ? { date: m.day, ...pick(day, ['calls', 'replacements', 'price_per_call']) } : { date: m.day } };
  }],
  ['POST', /^\/admin\/users\/(?<user>[^/]+)\/replaced-calls$/, 'calls.replace', subject],
  ['DELETE', /^\/admin\/users\/(?<user>[^/]+)\/replaced-calls\/(?<call>[^/]+)$/, 'calls.unreplace', async (m) => {
    const s = await subject(m);
    const c = s && UUID.test(m.call) ? await getReplacedCall(s.id, m.call) : null;
    return s && { ...s, before: c ? pick(c, ['date', 'called_at', 'caller', 'duration', 'reason']) : null };
  }],
  ['POST', /^\/admin\/users\/(?<user>[^/]+)\/payments$/, 'payment.create', subject],
  ['POST', /^\/admin\/users\/(?<user>[^/]+)\/report-payments$/, 'payment.report', subject],
  ['DELETE', /^\/admin\/users\/(?<user>[^/]+)\/payments\/(?<payment>[^/]+)$/, 'payment.delete', async (m) => {
    const s = await subject(m);
    const p = s && UUID.test(m.payment) ? await getPayment(s.id, m.payment) : null;
    return s && { ...s, before: p ? { ...pick(p, ['amount', 'status', 'reference', 'note']), paid_at: p.paid_at } : null };
  }],
  ['POST', /^\/staff\/reports$/, 'report.upload', async (m, body) => {
    const user = UUID.test(body?.customer) ? await getUser(body.customer) : null;
    return user && { id: user.id, label: label(user), email: user.email };
  }],
  ['PUT', /^\/staff\/reports\/(?<report>[^/]+)\/calls$/, 'report.calls', async (m) => {
    const r = UUID.test(m.report) ? await getReportInfo(m.report) : null;
    return r && { id: r.user_id, label: r.customer, before: pick(r, ['title', 'calls']) };
  }],
  ['DELETE', /^\/staff\/reports\/(?<report>[^/]+)$/, 'report.delete', async (m) => {
    const r = UUID.test(m.report) ? await getReportInfo(m.report) : null;
    return r && { id: r.user_id, label: r.customer, before: pick(r, ['kind', 'title', 'filename', 'period_from', 'period_to']) };
  }],
  ['PUT', /^\/accounts\/contacts$/, 'contacts.update'],
  ['PUT', /^\/accounts\/avatar$/, 'photo.update'],
  ['DELETE', /^\/accounts\/avatar$/, 'photo.delete'],
  // The first call only checks the current password and asks for the code: that one is not a change.
  ['POST', /^\/accounts\/change-password$/, 'password.change', null, (reply) => reply?.code_required],
  ['POST', /^\/accounts\/logout$/, 'auth.logout'],
  ['POST', /^\/billing\/statement\/pay$/, 'payment.address'],
  // Telegram: a customer disconnecting it in Settings (connecting happens in the bot: telegram-link.js), telling a
  // customer about new reports, and the team's billing notices.
  ['DELETE', /^\/accounts\/telegram$/, 'telegram.disconnect'],
  ['POST', /^\/staff\/reports\/notify$/, 'report.notify', async (m, body) => {
    const user = UUID.test(body?.customer) ? await getUser(body.customer) : null;
    return user && { id: user.id, label: label(user), email: user.email };
  }],
  ['PUT', /^\/admin\/notifications$/, 'notify.settings'],
  ['POST', /^\/admin\/notifications\/test$/, 'notify.test'],
];

const requestInfo = (req) => ({
  method: req.method,
  path: req.originalUrl.split('?')[0].slice(0, 300),
  ip: req.ip?.replace(/^::ffff:/, '') || null,
  userAgent: (req.get('user-agent') || '').slice(0, 300) || null,
});

// Writes a row now. `user` is who did it (null for the system); `email` names someone who isn't signed in.
export async function recordAudit(action, { req, user = null, email = '', target = null, details = null, status = null } = {}) {
  try {
    await addAuditEntry({
      action,
      userId: user?.id ?? null,
      userEmail: user?.email || email,
      userRole: user?.role || '',
      targetId: target?.id ?? null,
      targetLabel: target?.label || '',
      details,
      status,
      ...(req ? requestInfo(req) : {}),
    });
  } catch (err) {
    // The log must never break what it records.
    console.error(`[audit] could not record ${action}:`, err.message);
  }
}

// The middleware: mounted on /api, in front of every router.
export async function auditTrail(req, res, next) {
  // Read now: the routers further on rewrite req.url (and so req.path) while they run.
  const path = req.path;
  const route = ROUTES.find(([method, re]) => method === req.method && re.test(path));
  if (!route) return next();
  const [, re, action, before, skip] = route;
  const params = re.exec(path).groups || {};

  const body = req.body;
  let target = null;
  try {
    target = before ? await before(params, body) : null;
  } catch (err) {
    console.error(`[audit] could not read the target of ${action}:`, err.message);
  }

  let reply;
  const json = res.json.bind(res);
  res.json = (data) => {
    reply = data;
    return json(data);
  };

  res.on('finish', () => {
    try {
      const user = req.user; // set by requireUser; a request without a valid login is not anyone's to log
      if (!user || skip?.(reply)) return;
      const failed = res.statusCode >= 400;
      const details = clean(body);
      if (target?.before) details.before = target.before;
      if (failed && reply?.detail) details.error = String(reply.detail).slice(0, 300);
      if (params.day) details.date ??= params.day;

      // Who the change was about: read before it (above), or from the reply for something new.
      let about = target;
      if (action === 'login.create' && reply?.user) about = { id: reply.user.id, label: label(reply.user), email: reply.user.email };
      else if (action === 'login.link' && reply) details.emailed = reply.emailed;
      else if (action === 'report.upload' && reply?.id) details.report_id = reply.id;
      // A Call Summary's calls are logged as how many there were, and the days of billing they changed, one line each
      // ("Oct 28, 2026: 60 to 73 calls").
      if (action.startsWith('report.')) {
        if (Array.isArray(body?.calls)) details.calls = body.calls.length;
        if (reply?.billing_days?.length) details.billing_days = reply.billing_days.map(dayChange);
      }
      else if (action === 'report.notify' && reply) Object.assign(details, { emailed: reply.emailed, telegram_sent: reply.telegram?.sent });
      // The report's Payment Received (amount), and what was recorded from it: the part no other payment that day covers.
      else if (action === 'payment.report' && reply?.report_payment) Object.assign(details, { recorded: reply.report_payment.amount, was: reply.report_payment.before });
      else if (action === 'calls.replace') {
        // Each call as one line ("2026-10-22 14:37:25 · 19736517174"), and its day when they share one.
        const calls = Array.isArray(body?.calls) ? body.calls : [];
        details.calls = calls.slice(0, 100).map((c) => [c?.called_at, c?.caller].filter(Boolean).join(' · '));
        const days = [...new Set(calls.map((c) => c?.date))];
        if (days.length === 1 && DAY.test(days[0])) details.date = days[0];
        if (reply?.replaced !== undefined) details.replaced = reply.replaced;
      }
      else if (!about && /^\/(accounts|billing)\//.test(path)) about = { id: user.id, label: label(user), email: user.email };
      if (about?.email && about.email !== about.label) details.target_email = about.email;

      recordAudit(action, { req, user, target: about, details, status: res.statusCode });
    } catch (err) {
      // Never let the log take the server down: the reply has already gone out.
      console.error(`[audit] could not record ${action}:`, err.message);
    }
  });
  next();
}

// ── the admin's view ─────────────────────────────────────────────────────────

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const KINDS = ['auth', 'login', 'password', 'contacts', 'telegram', 'photo', 'billing', 'calls', 'payment', 'notify', 'report', 'audit', 'finance'];

export function auditFilters(query) {
  const tz = typeof query.tz === 'string' && validTimeZone(query.tz) ? query.tz : 'UTC';
  const f = { tz };
  if (DAY.test(query.from)) f.from = query.from;
  if (DAY.test(query.to)) f.to = query.to;
  if (f.from && f.to && f.from > f.to) throw new HttpError(400, 'The start date is after the end date.');
  if (typeof query.action === 'string' && /^[a-z_]+\.[a-z_]+$/.test(query.action)) f.action = query.action;
  const kinds = String(query.kind || '').split(',').filter((k) => KINDS.includes(k));
  if (kinds.length) f.kind = kinds;
  if (UUID.test(query.user)) f.user = query.user;
  if (typeof query.target === 'string' && query.target && query.target.length <= 64) f.target = query.target;
  if (UUID.test(query.about)) f.about = query.about;
  if (query.outcome === 'failed') f.outcome = 'failed';
  if (typeof query.q === 'string' && query.q.trim()) f.q = query.q.trim().slice(0, 100);
  return f;
}

// The filters as they were, for the log entry of a download: which rows left the system, not merely that some did.
export const filterNote = ({ tz: _tz, ...f }) => f;

export const auditRouter = Router();

// A page: 30 entries (at most 200), then ?before=<next> for the following page; the total comes with the first.
// A download takes the newest 5,000 matching entries, through the same queue as the finance report.
async function listEntries(req, res) {
  const filters = auditFilters(req.query);
  const format = ['csv', 'pdf'].includes(req.query.export) ? req.query.export : null;
  const limit = format ? 5000 : Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 30, 1), 200);
  const before = !format && /^\d{1,18}$/.test(req.query.before || '') ? req.query.before : null;
  const result = await listAudit(filters, { limit, before, count: !before });
  if (format) await recordAudit('audit.export', { req, user: req.user, details: { format, rows: result.rows.length, ...filterNote(filters) }, status: 200 });
  res.json({ ...result, rows: await withPaymentStatus(result.rows), limit });
}

// A deposit is logged when first seen (often still confirming) and again when it completes. An entry written
// before it completed gets `payment_status`, where the payment stands now, so it never reads as still pending.
async function withPaymentStatus(rows) {
  const open = (r) => r.action === 'payment.deposit' && r.details?.reference && r.details.status !== 'completed';
  const references = [...new Set(rows.filter(open).map((r) => r.details.reference))];
  if (!references.length) return rows;
  const now = await paymentStatuses('wellwallet', references);
  return rows.map((r) => (open(r) && now.has(r.details.reference) ? { ...r, payment_status: now.get(r.details.reference) } : r));
}
const downloadsOnly = (req, res, next) => next(req.query.export ? undefined : 'route');
auditRouter.get('/', downloadsOnly, ...reportLimits, listEntries);
auditRouter.get('/', listEntries);

auditRouter.get('/summary', ...reportLimits, async (req, res) => {
  res.json(await auditSummary(auditFilters(req.query)));
});

auditRouter.get('/actions', async (req, res) => {
  res.json({ results: await auditActions() });
});
