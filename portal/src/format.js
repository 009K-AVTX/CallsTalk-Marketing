import { BILLING_FROM } from '../../src/lib/portal.js';

export { money, dayLabel, clock } from '../../src/components/BillingPage.jsx';

export const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const today = () => iso(new Date());
export const addDays = (date, n) => {
  const [y, m, d] = date.split('-').map(Number);
  return iso(new Date(y, m - 1, d + n));
};

// Date ranges offered above every list and report. `from` and `to` are the customer's own days.
export const RANGES = [
  { id: 'today', label: 'Today', range: () => [today(), today()] },
  { id: 'yesterday', label: 'Yesterday', range: () => [addDays(today(), -1), addDays(today(), -1)] },
  { id: '7d', label: 'Last 7 Days', range: () => [addDays(today(), -6), today()] },
  { id: '30d', label: 'Last 30 Days', range: () => [addDays(today(), -29), today()] },
  { id: 'month', label: 'This Month', range: () => [`${today().slice(0, 8)}01`, today()] },
  { id: 'all', label: 'Since Sep 1', range: () => [BILLING_FROM, today()] },
];
export const rangeOf = (id) => {
  const [from, to] = RANGES.find((r) => r.id === id).range();
  return { from: from < BILLING_FROM ? BILLING_FROM : from, to };
};

export const num = (n) => Number(n || 0).toLocaleString('en-US');
export const pct = (part, whole) => (whole ? `${Math.round((part / whole) * 100)}%` : '0%');
export const duration = (s) => {
  if (!s) return '0:00';
  const h = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(mm).padStart(2, '0')}:${ss}` : `${mm}:${ss}`;
};
export const dateTime = (isoString) => new Date(isoString).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
export const shortDay = (date) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
export const monthName = (key) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
};
export const hourLabel = (h) => {
  const n = Number(h);
  return `${n % 12 || 12} ${n < 12 ? 'AM' : 'PM'}`;
};
export const bucketLabel = (bucket, group) => ({
  hour: () => hourLabel(bucket),
  day: () => shortDay(bucket),
  week: () => `Week of ${shortDay(bucket)}`,
  month: () => monthName(bucket),
}[group]());
export const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

export const STATUS = {
  completed: 'Answered',
  missed: 'Missed',
  busy: 'Busy',
  failed: 'Failed',
};
