// Money across all customers, for the admin's Finance page: what was billed, what came in, and who owes what.
// Every figure comes from statement() in billing.js, the same rules each customer's own bill follows, so the
// two always agree. Days are each customer's own calendar days (their billing time zone).
//
//   GET /api/admin/finance?from=YYYY-MM-DD&to=YYYY-MM-DD&customer=<id>&payments_offset=0&payments_limit=25[&export=csv|pdf]
//     -> { from, to, totals, days, customers, payments, payments_total }
//   Payments come a page at a time (newest first); a download (export=...) gets them all.
//
// The data is read in three queries whatever the number of customers, and at most two reports are worked out at
// once (others wait their turn briefly), so a burst of downloads cannot take every database connection.

import { Router } from 'express';
import { recordAudit } from './audit.js';
import { addDays, localDate, statement } from './billing.js';
import { UUID } from './db.js';
import { listBillingCustomers, listDaysOf, listPaymentsOf } from './portal-db.js';
import { reportLimits } from './rate-limit.js';
import { HttpError } from './routes.js';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const cents = (v) => Math.round(Number(v || 0) * 100);
const money = (c) => (c / 100).toFixed(2);
const METHOD = { manual: 'Recorded by our team', wellwallet: 'USDT (TRC-20)' };

const blankDay = () => ({ calls: 0, replacements: 0, billable_calls: 0, charges: 0, received: 0 });

const groupBy = (rows) => {
  const m = new Map();
  for (const r of rows) (m.get(r.user_id) || m.set(r.user_id, []).get(r.user_id)).push(r);
  return m;
};

export async function financeReport({ from, to, customer = null, now = new Date() }) {
  const people = await listBillingCustomers(customer);
  const ids = people.map((u) => u.id);
  // Every customer's days up to the latest "today" anywhere; statement() stops at each one's own today.
  const [dayRows, paymentRows] = ids.length ? await Promise.all([listDaysOf(ids, addDays(localDate(now, 'UTC'), 1)), listPaymentsOf(ids)]) : [[], []];
  const daysOf = groupBy(dayRows);
  const paymentsOf = groupBy(paymentRows);
  const perDay = new Map();
  const customers = [];
  const payments = [];
  const sum = { calls: 0, replacements: 0, billable_calls: 0, charges: 0, received: 0, pending: 0, failed: 0, opening: 0, closing: 0, due_now: 0, credit_now: 0 };

  for (const user of people) {
    const account = user; // the billing terms came with the login
    const allPayments = paymentsOf.get(user.id) || [];
    // Every day since billing started, oldest first, so the period's opening and closing balances are right.
    const all = statement({ user, account, days: daysOf.get(user.id) || [], payments: allPayments, from: account.start_date, now }).days.reverse();
    const inRange = all.filter((d) => d.date >= from && d.date <= to);
    const before = all.filter((d) => d.date < from).pop();
    const last = inRange[inRange.length - 1];

    const row = { ...blankDay(), pending: 0, failed: 0 };
    for (const d of inRange) {
      const slot = perDay.get(d.date) || blankDay();
      for (const k of ['calls', 'replacements', 'billable_calls']) {
        slot[k] += d[k];
        row[k] += d[k];
      }
      slot.charges += cents(d.charges);
      slot.received += cents(d.payment_received);
      row.charges += cents(d.charges);
      row.received += cents(d.payment_received);
      perDay.set(d.date, slot);
    }

    for (const p of allPayments) {
      const date = localDate(p.paid_at, account.timezone);
      if (date < from || date > to) continue;
      if (p.status === 'pending') row.pending += cents(p.amount);
      if (p.status === 'failed') row.failed += cents(p.amount);
      payments.push({
        id: p.id, date, customer_id: user.id, customer: user.company || user.name || user.email, amount: money(cents(p.amount)),
        currency: p.currency, status: p.status, method: METHOD[p.provider] || p.provider, reference: p.reference, note: p.note,
      });
    }

    // The period's opening: the balance the day before it, or the opening balance if billing started inside it.
    const opening = before ? cents(before.balance) : inRange.length ? cents(inRange[0].opening_balance) : 0;
    const closing = last ? cents(last.balance) : before ? cents(before.balance) : opening;
    const current = cents(all[all.length - 1]?.balance ?? account.opening_balance);
    const started = account.start_date <= to;

    customers.push({
      id: user.id, customer: user.company || user.name || user.email, email: user.email, status: user.status,
      currency: account.currency, price_per_call: account.price_per_call, billing_since: account.start_date,
      calls: row.calls, replacements: row.replacements, billable_calls: row.billable_calls,
      opening_balance: money(started ? opening : 0), charges: money(row.charges), received: money(row.received),
      pending: money(row.pending), failed: money(row.failed), closing_balance: money(started ? closing : 0),
      balance_now: money(current), amount_due_now: money(Math.max(-current, 0)),
    });

    for (const k of ['calls', 'replacements', 'billable_calls', 'charges', 'received', 'pending', 'failed']) sum[k] += row[k];
    if (started) {
      sum.opening += opening;
      sum.closing += closing;
    }
    sum.due_now += Math.max(-current, 0);
    sum.credit_now += Math.max(current, 0);
  }

  // Every day of the period, with nothing billed shown as zero, so the charts keep an honest time axis.
  const days = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const d = perDay.get(date) || blankDay();
    days.push({ date, calls: d.calls, replacements: d.replacements, billable_calls: d.billable_calls, charges: money(d.charges), received: money(d.received) });
  }

  customers.sort((a, b) => cents(a.balance_now) - cents(b.balance_now) || a.customer.localeCompare(b.customer));
  payments.sort((a, b) => b.date.localeCompare(a.date) || cents(b.amount) - cents(a.amount));

  return {
    from,
    to,
    currency: 'USD',
    as_of: now.toISOString(),
    totals: {
      customers: customers.length,
      calls: sum.calls,
      replacements: sum.replacements,
      billable_calls: sum.billable_calls,
      charges: money(sum.charges),
      received: money(sum.received),
      pending: money(sum.pending),
      failed: money(sum.failed),
      net: money(sum.received - sum.charges),
      // Share of what was billed in the period that came in during it (null when nothing was billed).
      collection_rate: sum.charges ? Math.round((sum.received / sum.charges) * 1000) / 10 : null,
      average_price: sum.billable_calls ? money(Math.round(sum.charges / sum.billable_calls)) : null,
      opening_balance: money(sum.opening),
      closing_balance: money(sum.closing),
      amount_due_now: money(sum.due_now),
      credit_now: money(sum.credit_now),
    },
    days,
    customers,
    payments,
  };
}

export const financeRouter = Router();

financeRouter.get('/', ...reportLimits, async (req, res) => {
  const today = localDate(new Date(), 'UTC');
  const to = DAY.test(req.query.to) ? req.query.to : today;
  const from = DAY.test(req.query.from) ? req.query.from : addDays(to, -29);
  if (from > to) throw new HttpError(400, 'The start date is after the end date.');
  if (addDays(from, 731) <= to) throw new HttpError(400, 'Choose a period of two years or less.');
  const customer = UUID.test(req.query.customer) ? req.query.customer : null;
  if (req.query.customer && !customer) throw new HttpError(400, 'That customer is not known.');

  const report = await financeReport({ from, to, customer });
  const format = ['csv', 'pdf'].includes(req.query.export) ? req.query.export : null;
  // The page gets one page of payments; a download gets them all.
  report.payments_total = report.payments.length;
  if (!format) {
    const limit = Math.min(Math.max(Number.parseInt(req.query.payments_limit, 10) || 25, 1), 100);
    const offset = Math.max(Number.parseInt(req.query.payments_offset, 10) || 0, 0);
    report.payments = report.payments.slice(offset, offset + limit);
    Object.assign(report, { payments_limit: limit, payments_offset: offset });
  }
  if (format) {
    const name = customer ? report.customers[0]?.customer : '';
    await recordAudit('finance.export', {
      req, user: req.user, target: customer ? { id: customer, label: name } : null, details: { format, from, to }, status: 200,
    });
  }
  res.json(report);
});
