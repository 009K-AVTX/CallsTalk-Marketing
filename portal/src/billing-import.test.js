// A billing report's days set against a buyer's billing: calls kept from the call log, payments counted once.
// Run with `npm test`.
import assert from 'node:assert/strict';
import test from 'node:test';
import { planBillingDays, termsFrom, toEnter, toPay } from './billing-import.js';
import { settle } from './billing-read.js';

const NOW = new Date('2026-10-29T16:00:00Z');
const reportDay = (d) => {
  const day = { replacements: 0, price: null, opening: null, payment: null, closing: null, notes: [], ...d };
  return settle({ ...day, read: { opening: day.opening, closing: day.closing } }, day.price);
};
const billing = (over = {}) => ({
  account: { timezone: 'America/New_York', start_date: '2026-10-01', price_per_call: '49.00' },
  statement: {
    days: [
      { date: '2026-10-22', calls: 0, replacements: 0, price_per_call: '49.00', opening_balance: '-420.00', payment_received: '0.00', from_call_log: false },
      { date: '2026-10-23', calls: 8, replacements: 1, price_per_call: '49.00', opening_balance: '90.00', payment_received: '1000.00', from_call_log: true },
      { date: '2026-10-28', calls: 12, replacements: 0, price_per_call: '49.00', opening_balance: '179.00', payment_received: '1700.00', from_call_log: true },
    ],
  },
  day_versions: { '2026-10-23': 3, '2026-10-28': 1 },
  replaced_calls: [{ date: '2026-10-23' }],
  report_payments: { '2026-10-28': '700.00' }, // the rest of that day's 1700 was typed in
  ...over,
});

test('a new day: its calls and its payment are entered, a red opening read as owed', () => {
  const [d] = planBillingDays([reportDay({ date: '2026-10-22', calls: 10, opening: 420, payment: 1000, closing: 90 })], billing(), NOW);
  assert.equal(d.action, 'new');
  assert.deepEqual(d.save, { calls: 10, replacements: 0 });
  assert.deepEqual(d.pay, { action: 'new', amount: 1000, was: 0, reason: '' });
  assert.equal(d.opening, -420);
  assert.deepEqual(d.checks, ['opening read as owed']);
});

test('a day from the call log keeps its count; a payment already typed in is not recorded again', () => {
  const [d] = planBillingDays([reportDay({ date: '2026-10-23', calls: 8, replacements: 1, opening: 90, payment: 1000, closing: 747 })], billing(), NOW);
  assert.equal(d.action, 'same');
  assert.equal(d.pay.action, 'same');
  assert.equal(d.pay.reason, 'already recorded');
  assert.deepEqual(toEnter([d]), []);
  assert.deepEqual(toPay([d]), []);
});

test('the call log wins over the report; replacements picked one by one stay', () => {
  const [d] = planBillingDays([reportDay({ date: '2026-10-23', calls: 9, replacements: 0 })], billing(), NOW);
  assert.deepEqual(d.save, { calls: 8, replacements: 1 });
  assert.equal(d.action, 'same');
  assert.match(d.reason, /call log has 8 calls, the report 9/);
  assert.match(d.reason, /1 call was replaced one by one/);
});

test('a report uploaded again changes only what is new', () => {
  const same = planBillingDays([reportDay({ date: '2026-10-28', calls: 12, payment: 1700 })], billing(), NOW)[0];
  assert.equal(same.pay.action, 'same');
  const more = planBillingDays([reportDay({ date: '2026-10-28', calls: 12, payment: 2000 })], billing(), NOW)[0];
  assert.deepEqual({ action: more.pay.action, amount: more.pay.amount, was: more.pay.was }, { action: 'change', amount: 1000, was: 700 });
});

test('opening balances that differ from the portal\'s are pointed out', () => {
  const [d] = planBillingDays([reportDay({ date: '2026-10-28', calls: 12, opening: 200, payment: 1700, closing: 1312 })], billing(), NOW);
  assert.ok(d.checks.includes('billing opens at $179.00'));
});

test('days before billing or in the future are skipped', () => {
  const plan = planBillingDays([
    reportDay({ date: '2026-09-30', calls: 3, payment: 100 }),
    reportDay({ date: '2026-10-30', calls: 3, payment: 100 }),
  ], billing(), NOW);
  assert.deepEqual(plan.map((d) => [d.action, d.pay.action]), [['skip', 'skip'], ['skip', 'skip']]);
});

test('terms suggested from a report for a buyer without billing', () => {
  const days = [reportDay({ date: '2026-10-27', calls: 122, opening: 3147, payment: 13000, closing: 3997 })];
  assert.deepEqual(termsFrom(days), { start_date: '2026-10-27', opening_balance: '-3147.00', price_per_call: '48.00' });
});
