// The statement's balances: final balance = (opening balance + payment received) - (calls x price - replacements x price).
// Run with `npm test` from the project root.
import assert from 'node:assert/strict';
import test from 'node:test';
import { statement } from './billing.js';

const user = { email: 'buyer@example.com' };
const account = { timezone: 'America/New_York', currency: 'USD', price_per_call: '49.00', opening_balance: '-420.00', start_date: '2026-10-22' };
const day = (date, calls, replacements = 0) => ({ date, calls, replacements, price_per_call: '49.00', from_calls: true });
const paid = (date, amount, more = {}) => ({ id: date, amount, currency: 'USD', status: 'completed', provider: 'manual', reference: '', note: '', paid_at: new Date(`${date}T16:00:00Z`), ...more });

// The VGK report: 22 to 28 Oct 2026, $49 a call, opening $420 owed.
const days = [day('2026-10-22', 10), day('2026-10-23', 8, 1), day('2026-10-26', 13), day('2026-10-27', 19), day('2026-10-28', 10)];
const payments = [paid('2026-10-22', '1000.00'), paid('2026-10-23', '1000.00'), paid('2026-10-27', '1000.00'), paid('2026-10-28', '1700.00', { report_day: new Date('2026-10-28') })];
const now = new Date('2026-10-28T22:00:00Z');

test('each day closes on (opening + payment received) - (calls - replacements) x price', () => {
  const s = statement({ user, account, days, payments, from: account.start_date, now });
  const byDate = Object.fromEntries(s.days.map((d) => [d.date, d]));
  assert.equal(byDate['2026-10-22'].balance, '90.00');
  assert.equal(byDate['2026-10-23'].balance, '747.00');
  assert.equal(byDate['2026-10-23'].billable_calls, 7);
  assert.equal(byDate['2026-10-26'].balance, '110.00');
  assert.equal(byDate['2026-10-27'].balance, '179.00');
  assert.equal(byDate['2026-10-28'].balance, '1389.00');
  assert.equal(s.balance, '1389.00');
  assert.equal(s.amount_due, '0.00');
  for (const d of s.days) {
    const expected = Number(d.opening_balance) + Number(d.payment_received) - (d.calls * Number(d.price_per_call) - d.replacements * Number(d.price_per_call));
    assert.equal(Number(d.balance), expected, d.date);
  }
});

test('a payment from a billing report counts once and shows as recorded by the team', () => {
  const s = statement({ user, account, days, payments, from: '2026-10-28', now });
  assert.equal(s.days[0].payment_received, '1700.00');
  assert.deepEqual(s.payments.map((p) => p.method), ['manual']);
});
