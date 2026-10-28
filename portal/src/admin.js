// Admin calls (server/src/admin.js): logins, setup links and each customer's billing.
import { authed, SignedOut } from '../../src/lib/portal.js';

// Runs an admin call; when the session has ended, sends the admin to log in instead of showing an error.
export const signedIn = (onSignedOut, load) => () => load().catch((err) => {
  if (err instanceof SignedOut) onSignedOut();
  throw err;
});

const json = (method, body) => ({ method, body });
const user = (id) => `/admin/users/${encodeURIComponent(id)}`;

// A page of logins: { results, total, counts: { customer, staff, admin }, waiting }. params: q, role, limit, offset.
export const listUsers = (params = {}) => authed(`/admin/users${query(params)}`);
// Everyone, briefly (id, name, company, email, role), for the filters on Finance and the Audit Log.
export const listUserOptions = async () => (await authed('/admin/users/options')).results;
// One login, or null when it no longer exists.
export const getUser = (id) => authed(user(id)).then((r) => r.user, (err) => {
  if (err.status === 404) return null;
  throw err;
});
export const createUser = (form) => authed('/admin/users', json('POST', form));

// Concurrency control: changes carry the `version` they were made from. When someone else saved in between, the
// server refuses with 409 (isConflict) and the page reloads the latest.
export const isConflict = (err) => err?.status === 409;
export const updateUser = (id, change) => authed(user(id), json('PATCH', change));
export const sendLink = (id) => authed(`${user(id)}/invite`, json('POST'));
export const removeUser = (id) => authed(user(id), json('DELETE'));

export const fetchBilling = (id) => authed(`${user(id)}/billing`);
// The latest audit entries by or about a login: { rows }. Staff get these for customers too.
export const fetchActivity = (id, limit = 8) => authed(`${user(id)}/activity?limit=${limit}`);
export const saveTerms = (id, terms) => authed(`${user(id)}/billing`, json('PUT', terms));
// `replacements`: calls from that day that are not charged (shown as "125 - 2"); undefined keeps what the day has.
// `version`: the day's version as shown (0: no calls entered yet; undefined: not known, the save wins).
export const saveDay = (id, date, calls, price, replacements, version) => authed(`${user(id)}/days/${date}`, json('PUT', {
  calls: Number(calls),
  ...(replacements !== undefined && { replacements: Number(replacements || 0) }),
  ...(price !== '' && price != null && { price_per_call: price }),
  ...(Number.isInteger(version) && { version }),
}));
export const clearDay = (id, date, version) => authed(`${user(id)}/days/${date}${Number.isInteger(version) ? `?version=${version}` : ''}`, json('DELETE'));
// Calls the buyer asked (in the portal chat) to have replaced, picked in one of their Call Summaries: each is taken off
// its day's bill. `calls`: [{ date, called_at, caller, duration }] as the log shows them (call-summary.js callOf).
// -> the billing, with `replaced`: how many were newly replaced.
export const replaceCalls = (id, report, calls, reason) => authed(`${user(id)}/replaced-calls`, json('POST', { report, calls, reason }));
export const undoReplacedCall = (id, callId) => authed(`${user(id)}/replaced-calls/${encodeURIComponent(callId)}`, json('DELETE'));
export const addPayment = (id, payment) => authed(`${user(id)}/payments`, json('POST', payment));
export const removePayment = (id, paymentId) => authed(`${user(id)}/payments/${encodeURIComponent(paymentId)}`, json('DELETE'));

// Where the person stands: waiting for their link, using the portal, or deactivated.
export function loginState(u) {
  if (u.status === 'disabled') return { label: 'Deactivated', tone: 'off' };
  if (u.status === 'active') return { label: 'Active', tone: 'ok' };
  if (u.invite_expires_at) return { label: 'Link Sent', tone: 'wait' };
  return { label: 'Link Expired', tone: 'warn' };
}

export const TIME_ZONES = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Europe/London', 'Africa/Nairobi', 'UTC'];

// ── audit trail and finance (server/src/audit.js, server/src/finance.js) ─────

// The admin's own time zone: the audit log's days are counted in it.
export const myTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

const query = (params) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '' && v !== false) q.set(k, Array.isArray(v) ? v.join(',') : v);
  const s = q.toString();
  return s ? `?${s}` : '';
};

// filters: from, to, kind (list), user, target, about, outcome, q · page: limit, offset · exportAs: csv | pdf (logged)
export const fetchAudit = (filters, page = {}, exportAs) => authed(`/admin/audit${query({ tz: myTimeZone(), ...filters, ...page, export: exportAs })}`);
export const fetchAuditSummary = (filters) => authed(`/admin/audit/summary${query({ tz: myTimeZone(), ...filters })}`);
// Payments come a page at a time (payments_offset, payments_limit); a download gets them all.
export const fetchFinance = ({ from, to, customer, payments_offset, payments_limit }, exportAs) => authed(`/admin/finance${query({
  from, to, customer, payments_offset, payments_limit, export: exportAs,
})}`);

// ── the team's billing notices on Telegram (server/src/billing-notices.js) ───
// -> { settings: { payments, summary, summary_time }, time_zone, separate_chat, available }
export const fetchNotices = () => authed('/admin/notifications');
export const saveNotices = (settings) => authed('/admin/notifications', json('PUT', settings));
export const sendSummaryNow = () => authed('/admin/notifications/test', json('POST'));
