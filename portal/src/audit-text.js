// How an audit entry reads to an admin (server/src/audit.js writes them). Every action the server logs has a
// name here; one missing still shows, as its raw "thing.verb".
import { dayLabel, money } from './format.js';

// The four groups on the Audit Log's chart and filter, in the chart's colour order.
export const GROUPS = [
  { key: 'signin', label: 'Sign-Ins', kinds: ['auth'] },
  { key: 'access', label: 'Logins and Access', kinds: ['login', 'password', 'contacts', 'telegram', 'photo'] },
  { key: 'billing', label: 'Billing', kinds: ['billing', 'calls', 'payment', 'notify'] },
  { key: 'reports', label: 'Reports and Downloads', kinds: ['report', 'audit', 'finance'] },
];
export const groupOf = (action) => GROUPS.find((g) => g.kinds.includes(action.split('.')[0]))?.key || 'access';

export const ACTIONS = {
  'auth.login': 'Signed In',
  'auth.login_failed': 'Failed Sign-In',
  'auth.logout': 'Signed Out',
  'auth.setup': 'Set Up Their Login',
  'auth.reset_requested': 'Requested a Password Reset',
  'auth.reset_failed': 'Failed Password Reset',
  'auth.password_reset': 'Reset Their Password',
  'login.create': 'Created a Login',
  'login.update': 'Changed a Login',
  'login.link': 'Sent a Setup Link',
  'login.delete': 'Deleted a Login',
  'password.change': 'Changed Their Password',
  'contacts.update': 'Changed Their Contact Methods',
  'telegram.connect': 'Connected Telegram',
  'telegram.disconnect': 'Disconnected Telegram',
  'photo.update': 'Changed Their Photo',
  'photo.delete': 'Removed Their Photo',
  'billing.terms': 'Changed Billing Terms',
  'calls.save': 'Entered Calls',
  'calls.clear': 'Cleared a Day',
  'payment.create': 'Recorded a Payment',
  'payment.delete': 'Deleted a Payment',
  'payment.deposit': 'Deposit Received',
  'payment.address': 'Opened Pay',
  'report.upload': 'Uploaded a Report',
  'report.delete': 'Deleted a Report',
  'report.notify': 'Notified a Customer of Reports',
  'notify.settings': 'Changed Billing Notifications',
  'notify.test': 'Posted the Billing Summary',
  'audit.export': 'Downloaded the Audit Log',
  'finance.export': 'Downloaded the Finance Report',
};
export const actionName = (action) => ACTIONS[action] || action;

const ROLE = { customer: 'Customer', staff: 'Staff', admin: 'Admin' };
export const roleName = (role) => ROLE[role] || '';

export const failed = (row) => row.status_code >= 400 || row.action.endsWith('_failed');

// Who did it: a person, or the system for deposits the payment check credited.
export const actor = (row) => row.user_email || (row.action === 'payment.deposit' ? 'System' : 'Unknown');

const REASON = { password: 'wrong password', code: 'wrong code', 'turned off': 'login turned off' };
const FIELD = {
  name: 'Name', company: 'Company', role: 'Role', status: 'Status', calls: 'Calls', replacements: 'Replaced',
  price_per_call: 'Price per Call', opening_balance: 'Opening Balance', start_date: 'Billing Starts', timezone: 'Time Zone',
  currency: 'Currency', amount: 'Amount', reference: 'Reference', note: 'Note', date: 'Day', telegram: 'Telegram',
  element: 'Element X', zangi: 'Zangi', signal: 'Signal', email: 'Email', title: 'Title', filename: 'File',
  period_from: 'Period From', period_to: 'Period To', format: 'Format', rows: 'Rows', from: 'From', to: 'To',
  file_bytes: 'File Size', emailed: 'Emailed', telegram_sent: 'Sent on Telegram', reports: 'Reports', payments: 'Each Payment',
  summary: 'Daily Summary', summary_time: 'Summary Time', username: 'Telegram User', via: 'Via', reason: 'Reason', customer: 'Customer', kind: 'Groups', q: 'Search',
  outcome: 'Outcome', user: 'Person', target: 'About', about: 'By or About', action: 'Action', method: 'Method',
  paid_at: 'Paid', report_id: 'Report',
};
const MONEY = new Set(['price_per_call', 'opening_balance', 'amount']);

export function show(key, value) {
  if (value === null || value === undefined || value === '') return '—';
  if (MONEY.has(key) && !Number.isNaN(Number(value))) return money(value);
  if (key === 'role') return roleName(value) || value;
  if (key === 'file_bytes') return value >= 1048576 ? `${(value / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(value / 1024))} KB`;
  if (key === 'emailed') return value ? 'Yes' : 'No';
  if (key === 'paid_at') return new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return dayLabel(String(value));
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
export const fieldName = (key) => FIELD[key] || key.replace(/_/g, ' ');

// What was changed, field by field: before (when the server read it first) and what was sent.
// Fields that were sent but did not change are left out, unless nothing changed at all.
const SKIP = new Set(['before', 'error', 'target_email', 'customer', 'content_base64', 'version']);
export function changes(row) {
  const d = row.details || {};
  const before = d.before || {};
  // The database keeps details as jsonb, which reorders keys: show them in FIELD's order instead.
  const rank = (k) => (k in FIELD ? Object.keys(FIELD).indexOf(k) : 999);
  const keys = [...new Set([...Object.keys(d).filter((k) => !SKIP.has(k)), ...Object.keys(before)])].sort((a, b) => rank(a) - rank(b));
  const all = keys.map((k) => ({ key: k, field: fieldName(k), before: k in before ? show(k, before[k]) : null, after: k in d ? show(k, d[k]) : null }));
  const changed = all.filter((c) => c.before === null || c.after === null || c.before !== c.after);
  if (!d.before) return all.filter((c) => c.after !== null);
  return changed.length ? changed : all.filter((c) => c.after !== null);
}

const about = (row) => row.target_label || row.details?.target_email || '';

// One line saying what happened, for the log and the downloads.
export function describe(row) {
  const d = row.details || {};
  const who = about(row);
  const b = d.before || {};
  const on = d.date ? ` on ${dayLabel(d.date)}` : '';
  switch (row.action) {
    case 'auth.reset_requested': return d.sent === false ? `Requested a password reset${row.user_id ? ' (no email sent: login not in use)' : ', no such login'}` : 'Requested a password reset (link emailed)';
    case 'auth.login_failed': return `Failed sign-in${d.reason ? ` (${REASON[d.reason] || d.reason})` : ''}${row.user_id ? '' : ', no such login'}`;
    case 'login.create': return `Created a ${roleName(d.role)?.toLowerCase() || 'customer'} login for ${who || d.email || 'someone'}`;
    case 'login.update': {
      const parts = ['name', 'company', 'role', 'status'].filter((k) => k in d && b[k] !== undefined && d[k] !== b[k])
        .map((k) => `${fieldName(k).toLowerCase()} ${show(k, b[k])} to ${show(k, d[k])}`);
      return `Changed ${who}${parts.length ? `: ${parts.join(', ')}` : ' (nothing different)'}`;
    }
    case 'login.link': return `Sent ${who} a ${b.status === 'invited' ? 'new setup' : 'reset'} link${d.emailed === false ? ' (not emailed)' : ''}`;
    case 'login.delete': return `Deleted the login of ${who}`;
    case 'billing.terms': return `Changed billing terms for ${who}${d.price_per_call && b.price_per_call && Number(d.price_per_call) !== Number(b.price_per_call) ? `: price ${money(b.price_per_call)} to ${money(d.price_per_call)}` : ''}`;
    case 'calls.save': {
      const now = `${d.calls ?? '?'} call${d.calls === 1 ? '' : 's'}${d.replacements ? ` (${d.replacements} replaced)` : ''}`;
      const was = b.calls !== undefined ? `, was ${b.calls}${b.replacements ? ` (${b.replacements} replaced)` : ''}` : '';
      return `Entered ${now} for ${who}${on}${was}`;
    }
    case 'calls.clear': return `Cleared the calls of ${who}${on}${b.calls !== undefined ? ` (${b.calls})` : ''}`;
    case 'payment.create': return `Recorded ${d.amount ? money(d.amount) : 'a payment'}${d.status && d.status !== 'completed' ? ` (${d.status})` : ''} from ${who}${d.date ? ` on ${dayLabel(d.date)}` : ''}`;
    case 'payment.delete': return `Deleted ${b.amount ? `the ${money(b.amount)} payment` : 'a payment'} from ${who}`;
    case 'payment.deposit': return `${d.amount ? money(d.amount) : 'A'} USDT deposit from ${who}, ${d.status || 'pending'}`;
    case 'payment.address': return `Opened Pay${d.amount ? ` for ${money(d.amount)}` : ''}`;
    case 'report.upload': return `Uploaded "${d.title || d.filename || 'a report'}" for ${who}`;
    case 'report.delete': return `Deleted "${b.title || 'a report'}" from ${who}`;
    case 'audit.export': return `Downloaded ${d.rows ?? ''} audit entr${d.rows === 1 ? 'y' : 'ies'} (${String(d.format || '').toUpperCase()})`;
    case 'finance.export': return `Downloaded the finance report for ${dayLabel(d.from)} to ${dayLabel(d.to)}${who ? `, ${who}` : ''} (${String(d.format || '').toUpperCase()})`;
    default: return `${actionName(row.action)}${who && !['auth', 'password', 'contacts', 'photo'].includes(row.action.split('.')[0]) ? `: ${who}` : ''}`;
  }
}

// "Chrome on Windows" from a browser's user agent; the full text is in the entry's details.
export function device(ua) {
  if (!ua) return '';
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox'
    : /Safari\//.test(ua) ? 'Safari' : /curl|node|python|axios/i.test(ua) ? 'Script' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS'
    : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${browser} on ${os}` : browser;
}

export const stamp = (iso) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' });
export const timeOnly = (iso) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
