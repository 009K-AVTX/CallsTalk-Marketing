// A customer's statement, worked out from their billing terms, daily calls and payments.
// The shape and the rules are the ones in docs/customer-billing-api.md:
//   charges = (calls - replacements) x price per call; balance = opening - charges + completed payments;
//   each day opens on the previous day's balance; amount_due = max(-balance, 0).

// Customers see the last five days, today included (src/lib/portal.js HISTORY_DAYS).
export const HISTORY_DAYS = 5;

const cents = (v) => Math.round(Number(v || 0) * 100);
const money = (c) => (c / 100).toFixed(2);

// The calendar day a moment falls on in a time zone, as YYYY-MM-DD.
export function localDate(when, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(when);
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const validTimeZone = (tz) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

// `from` is the first day to return (never before the account's first day). Every day is counted
// from the account's start so balances carry over; only the asked-for days and their payments are returned.
export function statement({ user, account, days, payments, from, now = new Date() }) {
  const { timezone, currency } = account;
  const today = localDate(now, timezone);
  const perDay = new Map(days.map((d) => [d.date, d]));
  const paidOn = new Map();
  for (const p of payments) {
    if (p.status !== 'completed') continue;
    const day = localDate(p.paid_at, timezone);
    paidOn.set(day, (paidOn.get(day) || 0) + cents(p.amount));
  }

  const out = [];
  let balance = cents(account.opening_balance);
  for (let date = account.start_date; date <= today; date = addDays(date, 1)) {
    const row = perDay.get(date);
    const calls = row ? row.calls : 0;
    // Replaced calls are not charged: "125 - 2" bills 123.
    const replacements = row ? Math.min(row.replacements || 0, calls) : 0;
    const billable = calls - replacements;
    const price = cents(row ? row.price_per_call : account.price_per_call);
    const charges = billable * price;
    const received = paidOn.get(date) || 0;
    const opening = balance;
    balance = opening - charges + received;
    if (date >= from) {
      out.push({
        date, is_today: date === today, opening_balance: money(opening), calls, replacements, billable_calls: billable, price_per_call: money(price),
        charges: money(charges), payment_received: money(received), balance: money(balance),
      });
    }
  }

  return {
    customer: user.company || user.name || user.email,
    currency,
    price_per_call: money(cents(account.price_per_call)),
    timezone,
    billing_since: account.start_date,
    as_of: now.toISOString(),
    balance: money(balance),
    amount_due: money(Math.max(-balance, 0)),
    days: out.reverse(),
    payments: payments
      .filter((p) => localDate(p.paid_at, timezone) >= from)
      .map((p) => ({
        id: p.id, amount: money(cents(p.amount)), currency: p.currency, status: p.status,
        // How it was paid, without naming the payment provider: "manual" (recorded by our team) or "usdt_trc20".
        method: p.provider === 'manual' ? 'manual' : 'usdt_trc20',
        reference: p.reference, note: p.note, date: new Date(p.paid_at).toISOString(),
      }))
      .reverse(),
  };
}
