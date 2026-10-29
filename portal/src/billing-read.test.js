// The billing report layouts the team uses, built as the sample reports show them, and what is read from each.
// Run with `npm test`.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as XLSX from 'xlsx';
import { amountOf, dayOf, fieldOf, mergeBooks, namedIn, readBook, settle, textBook } from './billing-read.js';

const NOW = new Date('2026-10-29T12:00:00Z');

// rows -> a workbook as it comes back from an .xlsx file.
function book(rows, name = 'Sheet1') {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  return XLSX.read(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}
const read = (rows, file = 'report.xlsx') => readBook(book(rows), file, XLSX, { now: NOW });
const pick = (d) => ({ date: d.date, calls: d.calls, replacements: d.replacements, opening: d.opening, payment: d.payment, closing: d.closing, adds_up: d.adds_up });

test('labels are matched loosely', () => {
  assert.equal(fieldOf('Opening Balanace ($)').key, 'opening');
  assert.equal(fieldOf('Cloing Balance ($)').key, 'closing');
  assert.equal(fieldOf('Total No.').key, 'calls');
  assert.equal(fieldOf('Fund Received').key, 'payment');
  assert.equal(fieldOf('Total Received'), null);
  assert.equal(fieldOf('Remaining Calls'), null);
  assert.equal(fieldOf('Missed Counted'), null);
  assert.equal(fieldOf('Caller'), null);
});

test('amounts and days as the team types them', () => {
  assert.equal(amountOf('Due- $2173'), -2173);
  assert.equal(amountOf('-$1,339.00'), -1339);
  assert.equal(amountOf('($575)'), -575);
  assert.equal(amountOf('$13,000'), 13000);
  assert.equal(dayOf('27/10/2026'), '2026-10-27');
  assert.equal(dayOf('10/27/2026'), '2026-10-27');
  assert.equal(dayOf('19-10-2026'), '2026-10-19');
  assert.equal(dayOf('05-10-2026'), '2026-10-05');
  assert.equal(dayOf('10-27-2026'), '2026-10-27');
  assert.equal(amountOf('$ 2,350 /-'), 2350);
  assert.deepEqual([fieldOf('• Old Due ').key, fieldOf('Total Due').key, fieldOf('Total Number').key], ['opening', 'closing', 'calls']);
  assert.equal(dayOf('28-Oct-2026'), '2026-10-28');
  assert.equal(dayOf('27-Oct', null, { now: NOW }), '2026-10-27');
  assert.equal(dayOf('Dec 30', null, { now: new Date('2027-01-02T12:00:00Z') }), '2026-12-30');
});

test('Financial Overview box', () => {
  const r = read([
    ['OCT 20, 2026 - Financial Overview'], ['Metric', 'Amount'],
    ['Opening Balanace ($)', 2217], ['Total No.', 10], ['Payment Received ($)', 0], ['Balance ($)', 1737],
  ]);
  assert.deepEqual(pick(r.days[0]), { date: '2026-10-20', calls: 10, replacements: 0, opening: 2217, payment: 0, closing: 1737, adds_up: true });
  assert.equal(r.days[0].implied_price, 48);
});

test('the portal\'s own Financial Overview boxes, side by side', () => {
  const r = read([
    ['Oct 26, 2026 · Financial Overview', null, null, 'Oct 25, 2026 · Financial Overview'],
    ['Metric', 'Amount', null, 'Metric', 'Amount'],
    ['Opening Balance', -1460, null, 'Opening Balance', -816],
    ['Total Calls', '23 – 2', null, 'Total Calls', '25 - 2'],
    ['Price per Call', 28, null, 'Price per Call', 28],
    ['Call Charges', -588, null, 'Call Charges', -644],
    ['Payment Received', 0, null, 'Payment Received', 0],
    ['Closing Balance', -2048, null, 'Closing Balance', -1460],
  ]);
  assert.deepEqual(r.days.map(pick), [
    { date: '2026-10-26', calls: 23, replacements: 2, opening: -1460, payment: 0, closing: -2048, adds_up: true },
    { date: '2026-10-25', calls: 25, replacements: 2, opening: -816, payment: 0, closing: -1460, adds_up: true },
  ]);
  assert.equal(r.days[0].price, '28.00');
});

test('Daily Report table: "Due" above the first day, a balance that does not add up', () => {
  const r = read([
    ['DAILY REPORT'],
    ['Date', 'Calls', 'Replacement', 'Final', 'Total', 'Closing Day Balance', 'Fund Received'],
    [null, null, null, null, null, 'Due- $2173', null],
    ['27/10/2026', 1, 0, 1, 48, 1581, 0],
    ['28/10/2026', 1, 0, 1, 48, 1629, 0],
    ['Total Due', null, null, null, null, 1629, null],
  ]);
  assert.equal(r.days.length, 2);
  assert.deepEqual(pick(r.days[0]), { date: '2026-10-27', calls: 1, replacements: 0, opening: -2173, payment: 0, closing: 1581, adds_up: false });
  assert.equal(r.days[0].price, '48.00');
  // Both balances there are amounts owed, written without a minus sign.
  assert.deepEqual(pick(r.days[1]), { date: '2026-10-28', calls: 1, replacements: 0, opening: -1581, payment: 0, closing: -1629, adds_up: true });
  assert.equal(r.days[1].flipped, 'both');
  assert.deepEqual(r.skipped, []);
});

test('P30-Balance Data table: days without a year', () => {
  const r = read([
    ['P30-Balance Data'], [],
    ['Date', 'Advance ($)', 'Total No.', 'Payment Received ($)', 'Cloing Balance ($)'], [],
    ['27-Oct', 1823, 10, 0, 1823],
    ['28-Oct', 1535, 7, 0, 1199],
  ]);
  assert.deepEqual(r.days.map(pick), [
    { date: '2026-10-27', calls: 10, replacements: 0, opening: 1823, payment: 0, closing: 1823, adds_up: false },
    { date: '2026-10-28', calls: 7, replacements: 0, opening: 1535, payment: 0, closing: 1199, adds_up: true },
  ]);
  assert.ok(namedIn(r.titles, ['VGK', 'P30', 'HOZ']).includes('P30'));
});

test('VGK table: a red opening balance, replacements and payments', () => {
  const r = read([
    ['VGK'],
    ['Date', 'Lead', 'Replacement', 'Final Lead', 'Total', 'Closing Balance', 'Received', 'Total Received'],
    [null, null, null, null, null, 420, null, null],
    ['22/10/2026', 10, 0, 10, 490, 90, 1000, 1000],
    ['23/10/2026', 8, 1, 7, 343, 747, 1000, 1000],
    ['26/10/2026', 13, 0, 13, 637, 110, 0, 0],
    ['27/10/2026', 19, 0, 19, 931, 179, 1000, 1000],
    ['28/10/2026', 10, 0, 10, 490, 1389, 1700, 1700],
    [null, null, null, null, 'Due', 1389],
  ]);
  assert.equal(r.days.length, 5);
  assert.ok(r.days.every((d) => d.adds_up && d.price === '49.00'));
  assert.deepEqual(pick(r.days[0]), { date: '2026-10-22', calls: 10, replacements: 0, opening: -420, payment: 1000, closing: 90, adds_up: true });
  assert.equal(r.days[0].flipped, 'opening');
  assert.deepEqual(pick(r.days[1]), { date: '2026-10-23', calls: 8, replacements: 1, opening: 90, payment: 1000, closing: 747, adds_up: true });
  assert.deepEqual(r.days.map((d) => d.payment), [1000, 1000, 0, 1000, 1700]);
});

test('28-Oct statement box: Advance at the top and the bottom', () => {
  const r = read([
    ['28-Oct-2026'],
    ['Calls', 36], ['Missed', 0], ['Missed Counted', 0], ['Price', 49], ['Final Calls count', 36, 1764],
    ['Advance', -575], ['Payment Received', 1000], ['Remaining Calls', -27], ['Advance', -1339],
  ]);
  assert.deepEqual(pick(r.days[0]), { date: '2026-10-28', calls: 36, replacements: 0, opening: -575, payment: 1000, closing: -1339, adds_up: true });
  assert.equal(r.days[0].price, '49.00');
});

test('Leads & Transactions box', () => {
  const r = read([
    ['LEADS & TRANSACTIONS'], [],
    ['Date', '28-Oct'], ['Queue', null], ['Calls', 2], ['Missed Calls', 0], ['Cost per Call', 48], ['Final Calls', 2],
    ['Final Calls Amount', 96], ['Previous Advance', 168], ['Payment Received', 0], ['Current Advance Balance', 72],
  ]);
  assert.deepEqual(pick(r.days[0]), { date: '2026-10-28', calls: 2, replacements: 0, opening: 168, payment: 0, closing: 72, adds_up: true });
  assert.equal(r.days[0].price, '48.00');
});

test('one-row table: a red opening balance and a large payment', () => {
  const r = read([
    ['Date', 'Opening Balance ($)', 'Total No.', 'Payment Received ($)', 'Balance ($)'],
    ['10/27/2026', 3147, 122, 13000, 3997],
  ], 'HOZ-122.xlsx');
  assert.deepEqual(pick(r.days[0]), { date: '2026-10-27', calls: 122, replacements: 0, opening: -3147, payment: 13000, closing: 3997, adds_up: true });
  assert.equal(r.days[0].implied_price, 48);
  // With the buyer's price the day is checked again: (opening + payment) - (calls x price - replacements x price).
  assert.equal(settle({ ...r.days[0], opening: 3147, closing: 3997 }, 48).adds_up, true);
  assert.equal(settle({ ...r.days[0], opening: 3147, closing: 3997 }, 50).adds_up, false);
});

test('the Excel template', () => {
  const r = read([
    ['Date', 'Opening Balance ($)', 'Total Calls', 'Replacements', 'Price per Call ($)', 'Call Charges ($)', 'Payment Received ($)', 'Balance ($)'],
    ['2026-10-26', 0, 20, 2, 28, 504, 600, 96],
    ['2026-10-27', 96, 5, 0, 28, 140, 0, -44],
  ]);
  assert.deepEqual(r.days.map(pick), [
    { date: '2026-10-26', calls: 20, replacements: 2, opening: 0, payment: 600, closing: 96, adds_up: true },
    { date: '2026-10-27', calls: 5, replacements: 0, opening: 96, payment: 0, closing: -44, adds_up: true },
  ]);
});

test('Account Summary text, sent by message and pasted a line a row', () => {
  const text = [
    '==========================', '==========================', '',
    'Date: 23-09-2026', '• Old Due : $ 19', '• Total Number: 10', '• Payment Received: $ 480', '• Total Due   : $ 19', '',
    '==========================', '==========================', '',
    '==========================', 'Account Summary', '==========================', '',
    'Date              : 19-10-2026', 'Old Due         : $ 2,350 /-', 'Total Number      : 70-1', 'Payment Received  : $ 2,000 /-', 'Total Due         : $ 3,800 /-',
    '------------------------------',
    'Date              : 05-10-2026', 'Old Due         : $ 3,800 /-', 'Total Number      : 13', 'Payment Received  : $ 0 /-', 'Total Due         : $ 4,500 /-',
    '', '==========================',
  ].join('\r\n');
  const r = readBook(XLSX.read(XLSX.write(textBook(text, XLSX), { type: 'buffer', bookType: 'xlsx' })), 'Pasted report.xlsx', XLSX, { now: NOW });
  // Due is owed: Old Due is a negative opening, Total Due a negative closing. 05-10-2026 is Oct 5, as 19-10-2026 shows.
  assert.deepEqual(r.days.map(pick), [
    { date: '2026-09-23', calls: 10, replacements: 0, opening: -19, payment: 480, closing: -19, adds_up: true },
    { date: '2026-10-19', calls: 70, replacements: 1, opening: -2350, payment: 2000, closing: -3800, adds_up: true },
    { date: '2026-10-05', calls: 13, replacements: 0, opening: -3800, payment: 0, closing: -4500, adds_up: false },
  ]);
  assert.deepEqual(r.days.map((d) => d.implied_price), [48, 50, null]);
  // 13 calls at $50 from $3,800 owed is $4,450 owed, not $4,500.
  assert.equal(settle({ ...r.days[2], ...r.days[2].read }, 50).adds_up, false);
  assert.deepEqual(r.skipped, []);
});

test('a label and its value split across cells', () => {
  const r = read([['Date', ': 19-10-2026'], ['Old Due', ': $ 2,350 /-'], ['Total Number', ': 70-1'], ['Payment Received', ': $ 2,000 /-'], ['Total Due', ': $ 3,800 /-']]);
  assert.deepEqual(pick(r.days[0]), { date: '2026-10-19', calls: 70, replacements: 1, opening: -2350, payment: 2000, closing: -3800, adds_up: true });
});

test('call logs are not billing reports', () => {
  assert.equal(read([['Call Date', 'Caller Id', 'Destination', 'Destination #', 'Duration'], ['10/28/26 18:27', '15550100001', 'Q04|1511|', '18660000000', '0:00:02']]), null);
  assert.equal(read([['10/28/26 14:39', '15550100002', 'BUB|2828|', '18660000000', 'BUB', '$1.00', '$1.00', '0:02:04', '0:00:05', 'Caller', '[]']]), null);
});

test('a day in two files with different figures is left out', () => {
  const a = read([['Date', 'Total Calls'], ['2026-10-27', 5]]);
  const b = read([['Date', 'Total Calls'], ['2026-10-27', 6], ['2026-10-28', 2]]);
  const merged = mergeBooks([a, b]);
  assert.deepEqual(merged.days.map((d) => d.date), ['2026-10-28']);
  assert.equal(merged.skipped[0].reason, 'listed twice with different figures');
});
