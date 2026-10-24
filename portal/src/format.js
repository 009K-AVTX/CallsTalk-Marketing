export { money, dayLabel, clock } from '../../src/components/BillingPage.jsx';

export const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const today = () => iso(new Date());
export const addDays = (date, n) => {
  const [y, m, d] = date.split('-').map(Number);
  return iso(new Date(y, m - 1, d + n));
};
export const monthName = (key) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};
