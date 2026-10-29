// A billing report's days (billing-read.js), set against the buyer's billing, for an admin to enter along with the
// upload: each day's calls and replacements, and its Payment Received.
//
// Calls: each day is saved through the same call as the customer page's Calls (PUT /api/admin/users/:id/days/:date),
// so the same checks apply, a day someone else changed meanwhile is refused, and each one is in the Audit Log. A day
// billed from its Call Summaries keeps the call log's count; only its replacements can come from the report.
//
// Payments: a day's Payment Received is recorded as the part of it the day does not already have (typed in by the
// team, a USDT deposit, or this report uploaded before), so the same money is never counted twice
// (POST /api/admin/users/:id/report-payments, server/src/portal-db.js setReportPayment).
//
// Opening and closing balances are not saved: the portal works them out (balance = opening + payment received -
// (calls - replacements) x price). The report's are checked against it, and any difference is shown.

import { settle } from './billing-read.js';

export { readBillingDays } from './billing-read.js';

const cents = (v) => Math.round(Number(v || 0) * 100);
const usd = (v) => `${v < 0 ? '-' : ''}$${Math.abs(Number(v)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
// A red balance typed without its minus sign, read as owed because only that adds up (billing-read.js settle).
const FLIPPED = { opening: 'opening', closing: 'closing', both: 'both balances' };

const localDate = (timeZone, now = new Date()) => {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (t) => p.find((x) => x.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
};

// A day's calls -> { now, version, action, reason, save: { calls, replacements } }: `now` is what billing has
// ({ calls, replacements, price }, or null when nothing is entered), `action` is new | change | same | skip.
function callsPlan(d, s, { version, picked, today, start }) {
  if (d.calls === null) return { now: null, action: 'skip', reason: 'no calls in the report' };
  if (d.date < start) return { now: null, action: 'skip', reason: 'before billing started' };
  if (d.date > today) return { now: null, action: 'skip', reason: 'a future day' };
  // Older days are not shown on the customer page either: entered without comparing (and without a version).
  if (!s) return { now: null, action: 'new', reason: 'older than 30 days, not compared', save: { calls: d.calls, replacements: d.replacements } };
  const why = [];
  let calls = d.calls;
  let { replacements } = d;
  if (s.from_call_log && calls !== s.calls) {
    why.push(`the call log has ${s.calls} calls, the report ${d.calls}: the call log's count stays`);
    calls = s.calls;
  }
  if (replacements < picked) {
    why.push(`${picked} call${picked === 1 ? ' was' : 's were'} replaced one by one and stay${picked === 1 ? 's' : ''} replaced`);
    replacements = picked;
  }
  if (replacements > calls) replacements = calls;
  const save = { calls, replacements };
  if (version === undefined) {
    const empty = !calls && !replacements;
    return { now: null, version: 0, action: empty ? 'same' : 'new', reason: empty ? 'no calls' : why.join('; '), save };
  }
  const now = { calls: s.calls, replacements: s.replacements, price: s.price_per_call };
  const same = now.calls === calls && now.replacements === replacements && (d.price === null || Number(d.price) === Number(now.price));
  return { now, version, action: same ? 'same' : 'change', reason: why.join('; '), save };
}

// A day's Payment Received -> { action, amount, was, reason } or null when the report has none. `amount`: what the
// report's payment for the day will be, after the day's other payments; action is new | change | same | check | skip
// (check: a day older than the customer page shows, set against its payments when saved).
function paymentPlan(d, s, { own, today, start }) {
  if (d.payment === null) return null;
  if (d.date < start) return { action: 'skip', reason: 'before billing started' };
  if (d.date > today) return { action: 'skip', reason: 'a future day' };
  if (!s) return d.payment || own ? { action: 'check', amount: d.payment, reason: 'set against that day\'s other payments when saved' } : { action: 'same', amount: 0 };
  const others = cents(s.payment_received) - cents(own);
  const want = Math.max(0, cents(d.payment) - others);
  const reason = others > cents(d.payment) ? `${usd(others / 100)} is recorded that day, more than the report shows`
    : others && want ? `${usd(others / 100)} of it is already recorded` : others ? 'already recorded' : '';
  if (want === cents(own)) return { action: 'same', amount: want / 100, reason };
  return { action: own ? 'change' : 'new', amount: want / 100, was: Number(own || 0), reason };
}

// What entering `days` would do to the buyer's billing. `billing`: fetchBilling (admin.js) for that buyer.
// -> each day as read, with the calls' { now, version, action, reason, save }, `pay` (paymentPlan) and `checks`: what
// does not match (the report's balance, or its opening balance against the portal's).
export function planBillingDays(days, billing, now = new Date()) {
  const { account, statement, day_versions: versions = {}, replaced_calls: replaced = [], report_payments: reported = {} } = billing;
  const today = localDate(account.timezone, now);
  const shown = new Map(statement.days.map((d) => [d.date, d])); // the last 31 days, as on the customer page
  const picked = replaced.reduce((m, c) => m.set(c.date, (m.get(c.date) || 0) + 1), new Map());
  return days.map((d) => {
    const s = shown.get(d.date);
    const price = Number(d.price ?? s?.price_per_call ?? account.price_per_call);
    const day = settle({ ...d, ...d.read }, price);
    const checks = [...(d.notes || [])];
    if (day.adds_up === false) checks.push(`balance does not add up at ${usd(price)} a call`);
    else if (day.flipped) checks.push(`${FLIPPED[day.flipped]} read as owed`);
    if (s && day.opening !== null && cents(day.opening) !== cents(s.opening_balance)) checks.push(`billing opens at ${usd(Number(s.opening_balance))}`);
    return {
      ...day,
      ...callsPlan(day, s, { version: versions[d.date], picked: picked.get(d.date) || 0, today, start: account.start_date }),
      pay: paymentPlan(day, s, { own: reported[d.date], today, start: account.start_date }),
      checks,
    };
  });
}

export const toEnter = (plan) => plan.filter((d) => d.action === 'new' || d.action === 'change');
export const toPay = (plan) => plan.filter((d) => ['new', 'change', 'check'].includes(d.pay?.action));

// Billing terms suggested by a report for a buyer who has none: from its first day with an opening balance and a price.
// -> { start_date, opening_balance, price_per_call } or null.
export function termsFrom(days) {
  const d = days.find((x) => x.opening !== null && (x.price || x.implied_price));
  return d ? { start_date: d.date, opening_balance: d.opening.toFixed(2), price_per_call: Number(d.price || d.implied_price).toFixed(2) } : null;
}

// Saves the ticked parts of the plan: the new and changed days' calls first, then the days' payments, one at a time.
// -> { saved, paid, failed: ["Oct 19, 2026: why", …] }. `label`: a day's date as shown. One day failing leaves the others.
export async function enterBillingDays(customerId, plan, label, { calls = true, payments = false } = {}) {
  const { isConflict, saveDay, saveReportPayment } = await import('./admin.js');
  let saved = 0;
  let paid = 0;
  const failed = [];
  for (const d of calls ? toEnter(plan) : []) {
    try {
      await saveDay(customerId, d.date, d.save.calls, d.price, d.save.replacements, d.version);
      saved++;
    } catch (err) {
      failed.push(`${label(d.date)}: ${isConflict(err) ? 'someone changed it meanwhile, so it was left as it is' : err.message}`);
    }
  }
  for (const d of payments ? toPay(plan) : []) {
    try {
      await saveReportPayment(customerId, d.date, d.payment);
      paid++;
    } catch (err) {
      failed.push(`${label(d.date)} payment: ${err.message}`);
    }
  }
  return { saved, paid, failed };
}
