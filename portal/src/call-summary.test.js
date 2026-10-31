// The dialer's call logs in each layout it exports (made-up numbers): every row is a call, counted once.
// Run with `npm test`.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as XLSX from 'xlsx';
import { callKey, callsIn, isReplaced, readCallSummary } from './call-summary.js';

// 10/28/26 at the given time, and a duration, as Excel keeps them (day numbers shown as "10/28/26 18:27", "0:01:31").
const at = (h, m, s = 0) => 46323 + (h * 3600 + m * 60 + s) / 86400;
const dur = (s) => s / 86400;

function file(rows) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  for (const [ref, cell] of Object.entries(ws)) {
    if (ref.startsWith('!') || cell.t !== 'n') continue;
    if (cell.v > 40000 && cell.v < 80000) cell.z = 'm/d/yy h:mm';
    else if (cell.v < 1) cell.z = 'h:mm:ss';
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const data = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return { name: 'log.xlsx', data, arrayBuffer: async () => data };
}

const LAYOUTS = {
  'with a header row': file([
    ['Call Date', 'Caller Id', 'Destination', 'Destination #', 'Duration'],
    [at(18, 27), 15550100001, 'Q04|1511|', 18660000001, dur(2)],
    [at(17, 47), 15550100002, 'Q04|1511|', 18660000001, dur(91)],
    [at(17, 8), 15550100003, 'Q04|1511|', 18660000001, dur(45)],
  ]),
  'no header, two durations': file([
    [at(14, 39), 15550100004, 'BUB|2828|', 18660000002, 'BUB', '$1.00 ', '$1.00 ', dur(124), dur(5), 'Caller', '[]'],
    [at(14, 36), 15550100005, 'BUB|2828|', 18660000002, 'BUB', '$1.00 ', '$1.00 ', dur(191), dur(5), 'Caller', '[]'],
  ]),
  'no header, recordings and status': file([
    [at(16, 53), 15550100006, 'HOZ|3067|', 18660000003, 'HOZ', '$1.00 ', '$5.00 ', dur(12), dur(16), 'https://example.com/a.wav', 'Completed - With Conversion', 'Caller', '[]'],
    [at(16, 49), 15550100007, 'HOZ|3067|', 18660000003, 'HOZ', '$1.00 ', '$1.00 ', dur(821), dur(18), 'https://example.com/b.wav', 'Completed - With Conversion', 'Caller', '[]'],
    [at(16, 45), 15550100008, 'HOZ|3067|', 18660000003, 'HOZ', '$1.00 ', '$5.00 ', dur(2), dur(14), 'https://example.com/c.wav', 'Completed - With Conversion', 'Caller', '[]'],
  ]),
  'no header, short': file([
    [at(15, 54), 15550100009, 18660000004, 'R48', '$1.00 ', dur(17), dur(10), 'https://example.com/d.wav', 'Completed - With Conversion'],
  ]),
};
const COUNTS = { 'with a header row': 3, 'no header, two durations': 2, 'no header, recordings and status': 3, 'no header, short': 1 };

for (const [name, f] of Object.entries(LAYOUTS)) {
  test(`call log ${name}`, async () => {
    const calls = await callsIn(f.data);
    assert.equal(calls.length, COUNTS[name]);
    assert.ok(calls.every((c) => c.date === '2026-10-28' && /^1555010000\d$/.test(c.caller) && /^\d:\d{2}:\d{2}$/.test(c.duration)));
    assert.equal(new Set(calls.map(callKey)).size, calls.length);
    assert.deepEqual(await readCallSummary([f]), { calls: COUNTS[name], from: '2026-10-28', to: '2026-10-28', unread: [] });
  });
}

test('the first duration after the caller is the call\'s', async () => {
  const [c] = await callsIn(LAYOUTS['no header, two durations'].data);
  assert.deepEqual(c, {
    date: '2026-10-28', called_at: '10/28/26 14:39', caller: '15550100004', duration: '0:02:04', call_time: '2026-10-28 14:39:00', number_called: '18660000002',
  });
});

test('logs for two toll-free numbers: one caller twice in a minute is two calls, the same call in two files one', async () => {
  const one = file([
    [at(14, 39, 5), 15550100004, 'BUB|2828|', 18660000002, 'BUB', dur(30)],
    [at(14, 39, 48), 15550100004, 'BUB|2828|', 18660000002, 'BUB', dur(12)], // dropped and called back
  ]);
  const two = file([
    ['Call Date', 'Caller Id', 'Destination', 'Destination #', 'Duration'],
    [at(14, 39, 20), 15550100004, 'Q04|1511|', 18660000001, dur(9)], // the same caller, the other number, that minute
    [at(16, 2, 7), 15550100005, 'Q04|1511|', 18660000001, dur(61)],
  ]);
  const calls = [...await callsIn(one.data), ...await callsIn(two.data), ...await callsIn(one.data)]; // one uploaded twice
  assert.ok(calls.slice(0, 3).every((c) => c.called_at === '10/28/26 14:39'));
  assert.deepEqual(calls.slice(0, 3).map((c) => [c.call_time, c.number_called]), [
    ['2026-10-28 14:39:05', '18660000002'], ['2026-10-28 14:39:48', '18660000002'], ['2026-10-28 14:39:20', '18660000001'],
  ]);
  assert.equal(new Set(calls.map(callKey)).size, 4);
});

test('a text log keeps its seconds; a call replaced before seconds were kept still marks its calls', async () => {
  const csv = '10/28/2026 2:39:05 PM,(555) 010-0004,+1 (866) 000-0002,0:00:30\n2026-10-28 14:39:48,5550100004,8660000002,0:00:12\n';
  const data = new TextEncoder().encode(csv).buffer;
  const calls = await callsIn(data);
  assert.deepEqual(calls.map((c) => [c.call_time, c.number_called]), [['2026-10-28 14:39:05', '18660000002'], ['2026-10-28 14:39:48', '18660000002']]);
  const [c] = await callsIn(LAYOUTS['no header, two durations'].data);
  assert.ok(isReplaced(new Set([callKey({ called_at: c.called_at, caller: c.caller })]), c));
  assert.ok(isReplaced(new Set([callKey(c)]), c));
  assert.ok(!isReplaced(new Set([callKey({ ...c, call_time: '2026-10-28 14:39:59' })]), c));
});
