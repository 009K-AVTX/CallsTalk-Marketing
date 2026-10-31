// The Owner Panel: every client's records month by month, for the Owner only.
//
//   GET /api/admin/owner/months?from=YYYY-MM&to=YYYY-MM   (Owner)   default: the last 12 months
//     -> { from, to, as_of, currency, months: [{ month, totals, clients: [...] }] }, newest month first
//
// For each month and client: their rate (the price per call that month, or the range when it changed), calls,
// replaced calls, charged calls, billed, collected, the opening balance on the month's first billed day and the
// closing balance on its last (today, for the current month). Every figure comes from statement() in billing.js,
// the same rules as each client's own bill, the Finance page and the billing notices. Days are each client's own
// calendar days. A client appears from the month their billing starts.

import { Router } from 'express';
import { requireUser } from './accounts.js';
import { addDays, localDate, statement } from './billing.js';
import { buyerName } from './format.js';
import { listBillingCustomers, listDaysOf, listPaymentsOf } from './portal-db.js';
import { reportLimits } from './rate-limit.js';
import { HttpError } from './routes.js';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const cents = (v) => Math.round(Number(v || 0) * 100);
const money = (c) => (c / 100).toFixed(2);

const monthAdd = (m, n) => {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};

const groupBy = (rows) => {
  const m = new Map();
  for (const r of rows) (m.get(r.user_id) || m.set(r.user_id, []).get(r.user_id)).push(r);
  return m;
};

const blank = () => ({ calls: 0, replacements: 0, billable_calls: 0, charges: 0, received: 0 });

// Pure, so it can be checked without a database. `people`: billing customers (listBillingCustomers), `daysOf` and
// `paymentsOf`: their rows by client id.
export function monthlyRecords({ people, daysOf, paymentsOf, from, to, now = new Date() }) {
  const months = new Map();
  for (let m = to; m >= from; m = monthAdd(m, -1)) months.set(m, { month: m, totals: { ...blank(), opening: 0, closing: 0, owed: 0, credit: 0, clients: 0 }, clients: [] });

  for (const user of people) {
    const account = user;
    // Every day since billing started, oldest first, so each month's opening and closing balances are right.
    const all = statement({ user, account, days: daysOf.get(user.id) || [], payments: paymentsOf.get(user.id) || [], from: account.start_date, now }).days.reverse();
    const byMonth = new Map();
    for (const d of all) {
      const m = d.date.slice(0, 7);
      if (m < from || m > to) continue;
      (byMonth.get(m) || byMonth.set(m, []).get(m)).push(d);
    }
    for (const [m, days] of byMonth) {
      const row = blank();
      const rates = new Set();
      for (const d of days) {
        row.calls += d.calls;
        row.replacements += d.replacements;
        row.billable_calls += d.billable_calls;
        row.charges += cents(d.charges);
        row.received += cents(d.payment_received);
        if (d.billable_calls || d.calls) rates.add(cents(d.price_per_call));
      }
      if (!rates.size) rates.add(cents(days[days.length - 1].price_per_call));
      const sorted = [...rates].sort((a, b) => a - b);
      const opening = cents(days[0].opening_balance);
      const closing = cents(days[days.length - 1].balance);
      const month = months.get(m);
      month.clients.push({
        id: user.id,
        client: buyerName(user),
        name: user.name || user.email,
        nickname: user.nickname || '',
        status: user.status,
        // "35.00", or "35.00 to 40.00" when the rate changed during the month; null while no rate is set.
        rate: sorted[sorted.length - 1] ? (sorted.length > 1 ? `${money(sorted[0])} to ${money(sorted[sorted.length - 1])}` : money(sorted[0])) : null,
        calls: row.calls,
        replacements: row.replacements,
        billable_calls: row.billable_calls,
        charges: money(row.charges),
        received: money(row.received),
        opening_balance: money(opening),
        closing_balance: money(closing),
        days: days.length,
      });
      const t = month.totals;
      for (const k of ['calls', 'replacements', 'billable_calls', 'charges', 'received']) t[k] += row[k];
      t.opening += opening;
      t.closing += closing;
      t.owed += Math.max(-closing, 0);
      t.credit += Math.max(closing, 0);
      t.clients++;
    }
  }

  const out = [...months.values()].map((m) => ({
    month: m.month,
    totals: {
      clients: m.totals.clients, calls: m.totals.calls, replacements: m.totals.replacements, billable_calls: m.totals.billable_calls,
      charges: money(m.totals.charges), received: money(m.totals.received), opening_balance: money(m.totals.opening),
      closing_balance: money(m.totals.closing), owed: money(m.totals.owed), credit: money(m.totals.credit),
    },
    // Owing most first, then by name.
    clients: m.clients.sort((a, b) => cents(a.closing_balance) - cents(b.closing_balance) || a.client.localeCompare(b.client, 'en', { numeric: true })),
  }));
  return { from, to, as_of: now.toISOString(), currency: 'USD', months: out };
}

export const ownerRouter = Router();
ownerRouter.use(requireUser('owner'));

ownerRouter.get('/months', ...reportLimits, async (req, res) => {
  const now = new Date();
  const thisMonth = localDate(now, 'UTC').slice(0, 7);
  const to = MONTH.test(req.query.to) ? req.query.to : thisMonth;
  const from = MONTH.test(req.query.from) ? req.query.from : monthAdd(to, -11);
  if (from > to) throw new HttpError(400, 'The first month is after the last.');
  if (monthAdd(from, 36) <= to) throw new HttpError(400, 'Choose three years or less.');

  const people = await listBillingCustomers();
  const ids = people.map((u) => u.id);
  const [dayRows, paymentRows] = ids.length ? await Promise.all([listDaysOf(ids, addDays(localDate(now, 'UTC'), 1)), listPaymentsOf(ids)]) : [[], []];
  res.json(monthlyRecords({ people, daysOf: groupBy(dayRows), paymentsOf: groupBy(paymentRows), from, to, now }));
});
