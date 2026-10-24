// Sample figures for running the portal without the API (local development, or the demo build).
// Only daily totals of billable calls are generated: the portal is a billing portal and holds no
// caller details, not even in the demo.

const PRICE = 35;
const CUSTOMER = 'Preview Customer';

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const m = (v) => v.toFixed(2);

// Small seeded generator so the figures are the same on every load.
function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Billable (converted) calls per day since `from`; today only counts the part of the day gone by.
function dataset(from) {
  const now = new Date();
  const rand = rng(20260901);
  const perDay = {};
  const [y, mo, d0] = from.split('-').map(Number);
  for (let day = new Date(y, mo - 1, d0), i = 0; iso(day) <= iso(now); day.setDate(day.getDate() + 1), i++) {
    const weekend = day.getDay() === 0 || day.getDay() === 6;
    const full = Math.round((18 + ((i * 37 + 11) % 32) + rand() * 6) * (weekend ? 0.6 : 1));
    const share = iso(day) === iso(now) ? Math.min(1, Math.max(0, (now.getHours() - 7) / 13)) : 1;
    perDay[iso(day)] = Math.round(full * share);
  }
  return { perDay, now };
}

// Worked out from the account's first day so balances carry over, then cut to the days asked for.
export function previewStatement(from, viewFrom = from) {
  const { perDay, now } = dataset(from);
  const days = [];
  const payments = [];
  let balance = 0;
  let unpaid = 0;
  const [y, mo, d0] = from.split('-').map(Number);
  for (let d = new Date(y, mo - 1, d0), i = 0; iso(d) <= iso(now); d.setDate(d.getDate() + 1), i++) {
    const date = iso(d);
    const n = perDay[date] || 0;
    const charges = n * PRICE;
    // Every third day the customer pays what the previous days came to, rounded down to $100.
    const received = i % 3 === 2 ? Math.floor(unpaid / 100) * 100 : 0;
    unpaid += charges - received;
    const opening = balance;
    balance = opening - charges + received;
    days.push({ date, is_today: date === iso(now), opening_balance: m(opening), calls: n, price_per_call: m(PRICE), charges: m(charges), payment_received: m(received), balance: m(balance) });
    if (received) payments.push({ id: date, amount: m(received), currency: 'USD', status: 'completed', provider: 'manual', reference: '', note: 'Bank transfer', date: `${date}T14:20:00Z` });
  }
  return {
    customer: CUSTOMER, currency: 'USD', price_per_call: m(PRICE), timezone: 'America/New_York',
    as_of: now.toISOString(), balance: m(balance), amount_due: m(Math.max(-balance, 0)),
    days: days.filter((d) => d.date >= viewFrom).reverse(),
    payments: payments.filter((p) => p.date.slice(0, 10) >= viewFrom).reverse(),
  };
}


export const previewProfile = (email) => ({ email: email || 'buyer@example.com', first_name: 'Preview', last_name: 'Customer', role: 'buyer' });
