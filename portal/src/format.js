export { money, dayLabel, clock } from '../../src/components/BillingPage.jsx';

export const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const today = () => iso(new Date());
// How the team knows a buyer everywhere: their nickname ("Q10"), else their name (as server/src/format.js).
export const buyerName = (u) => u?.nickname || u?.name || u?.email || '';
// By that name, Q2 before Q10.
export const byBuyerName = (a, b) => buyerName(a).localeCompare(buyerName(b), 'en', { numeric: true, sensitivity: 'base' });
export const addDays = (date, n) => {
  const [y, m, d] = date.split('-').map(Number);
  return iso(new Date(y, m - 1, d + n));
};
export const monthName = (key) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};
