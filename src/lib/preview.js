// Sample data for running the portal locally without the API (`npm run dev` / `npm run portal`
// with no API URL set). One generated set of calls since BILLING_FROM drives the bill, the
// reports and the call list, so every screen agrees. Never part of a production build.

const PRICE = 35;
const CUSTOMER = 'Preview Customer';
const STATES = [
  ['212', 'NY'], ['718', 'NY'], ['305', 'FL'], ['407', 'FL'], ['713', 'TX'], ['214', 'TX'], ['312', 'IL'],
  ['404', 'GA'], ['602', 'AZ'], ['702', 'NV'], ['213', 'CA'], ['415', 'CA'], ['617', 'MA'], ['215', 'PA'],
];

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

let cache = null;
function dataset(from) {
  const now = new Date();
  if (cache && cache.key === `${from}|${iso(now)}|${now.getHours()}`) return cache;
  const rand = rng(20260901);
  const [y, mo, d0] = from.split('-').map(Number);
  const callers = Array.from({ length: 1400 }, (_, i) => {
    const [area, state] = STATES[i % STATES.length];
    return { number: `+1 (${area}) ${String(200 + Math.floor(rand() * 799))}-${String(1000 + Math.floor(rand() * 8999))}`, state };
  });
  const calls = [];
  for (let day = new Date(y, mo - 1, d0), i = 0; iso(day) <= iso(now); day.setDate(day.getDate() + 1), i++) {
    const weekend = day.getDay() === 0 || day.getDay() === 6;
    const n = Math.round((30 + ((i * 37 + 11) % 53)) * (weekend ? 0.6 : 1));
    for (let k = 0; k < n; k++) {
      // Business hours carry most of the traffic, peaking early afternoon.
      const hour = Math.min(23, Math.max(0, Math.round(14 + (rand() + rand() + rand() - 1.5) * 7)));
      const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, Math.floor(rand() * 60), Math.floor(rand() * 60));
      if (at > now) continue;
      const r = rand();
      const status = r < 0.07 ? 'missed' : r < 0.1 ? 'busy' : 'completed';
      const duration = status !== 'completed' ? 0 : r < 0.24 ? 5 + Math.floor(rand() * 25) : 40 + Math.floor(-Math.log(1 - rand()) * 240);
      const converted = status === 'completed' && duration >= 90;
      const caller = callers[Math.floor(rand() * rand() * callers.length)];
      calls.push({
        id: `${iso(day).replace(/-/g, '')}-${k}`, started_at: at.toISOString(), date: iso(day), hour, weekday: (at.getDay() + 6) % 7,
        caller: caller.number, state: caller.state, duration, status, converted, cost: converted ? m(PRICE) : '0.00',
      });
    }
  }
  calls.sort((a, b) => (a.started_at < b.started_at ? 1 : -1));
  cache = { key: `${from}|${iso(now)}|${now.getHours()}`, calls, now };
  return cache;
}

export function previewStatement(from) {
  const { calls, now } = dataset(from);
  const perDay = {};
  for (const c of calls) if (c.converted) perDay[c.date] = (perDay[c.date] || 0) + 1;
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
    days: days.reverse(), payments: payments.reverse().slice(0, 10),
  };
}

const inRange = (c, from, to) => c.date >= from && c.date <= to;

function weekStart(date) {
  const [y, mo, d] = date.split('-').map(Number);
  const dt = new Date(y, mo - 1, d);
  dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
  return iso(dt);
}

export function previewSummary(billingFrom, { from, to, group = 'day' }) {
  const calls = dataset(billingFrom).calls.filter((c) => inRange(c, from, to));
  const answered = calls.filter((c) => c.status === 'completed');
  const converted = calls.filter((c) => c.converted);
  const byCaller = {};
  for (const c of calls) byCaller[c.caller] = (byCaller[c.caller] || 0) + 1;

  const key = { hour: (c) => String(c.hour).padStart(2, '0'), day: (c) => c.date, week: (c) => weekStart(c.date), month: (c) => c.date.slice(0, 7) }[group];
  const buckets = {};
  if (group === 'hour') for (let h = 0; h < 24; h++) buckets[String(h).padStart(2, '0')] = { calls: 0, converted: 0 };
  else if (group === 'day') {
    const [y, mo, d] = from.split('-').map(Number);
    for (let dt = new Date(y, mo - 1, d); iso(dt) <= to; dt.setDate(dt.getDate() + 1)) buckets[iso(dt)] = { calls: 0, converted: 0 };
  }
  for (const c of calls) {
    const b = (buckets[key(c)] ||= { calls: 0, converted: 0 });
    b.calls += 1;
    if (c.converted) b.converted += 1;
  }
  const series = Object.entries(buckets).sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([bucket, v]) => ({ bucket, calls: v.calls, converted: v.converted, spend: m(v.converted * PRICE) }));

  const states = {};
  for (const c of calls) {
    const s = (states[c.state] ||= { state: c.state, calls: 0, converted: 0 });
    s.calls += 1;
    if (c.converted) s.converted += 1;
  }
  const heatmap = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const c of calls) heatmap[c.weekday][c.hour] += 1;
  const edges = [0, 30, 60, 90, 180, 300];
  const durations = edges.map((lo, i) => ({ from: lo, to: edges[i + 1] ?? null, calls: answered.filter((c) => c.duration >= lo && (edges[i + 1] == null || c.duration < edges[i + 1])).length }));

  return {
    from, to, group,
    totals: {
      calls: calls.length, answered: answered.length, converted: converted.length, spend: m(converted.length * PRICE),
      avg_duration: answered.length ? Math.round(answered.reduce((t, c) => t + c.duration, 0) / answered.length) : 0,
      short_calls: answered.filter((c) => c.duration < 30).length,
      repeat_callers: Object.values(byCaller).filter((n) => n > 1).length,
    },
    series,
    by_state: Object.values(states).map((s) => ({ ...s, spend: m(s.converted * PRICE) })).sort((a, b) => b.calls - a.calls),
    heatmap,
    durations,
  };
}

export function previewCalls(billingFrom, { from, to, status = '', q = '', page = 1, pageSize = 25 }) {
  const needle = q.replace(/\D/g, '');
  const rows = dataset(billingFrom).calls.filter((c) => inRange(c, from, to)
    && (!status || (status === 'converted' ? c.converted : status === 'not_converted' ? c.status === 'completed' && !c.converted : c.status === status))
    && (!needle || c.caller.replace(/\D/g, '').includes(needle)));
  const start = (page - 1) * pageSize;
  return { count: rows.length, page, page_size: pageSize, results: rows.slice(start, start + pageSize).map(({ date, hour, weekday, ...c }) => c) };
}

export const previewProfile = (email) => ({ email: email || 'buyer@example.com', first_name: 'Preview', last_name: 'Customer', role: 'buyer' });
