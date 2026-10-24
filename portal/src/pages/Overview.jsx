import { useState } from 'react';
import { fetchCalls, fetchSummary } from '../../../src/lib/portal.js';
import { Bars, ChartCard, SERIES } from '../components/Charts.jsx';
import Icon from '../components/Icons.jsx';
import { CallDrawer, ErrorNote, Kpi, PageHead, StatusBadge } from '../components/Shell.jsx';
import { addDays, clock, dateTime, duration, greeting, hourLabel, money, num, pct, today } from '../format.js';
import { Link } from '../router.jsx';
import useLoad from '../useLoad.js';

const change = (now, before) => {
  if (!before) return null;
  return Math.round(((now - before) / before) * 100);
};

// Plain-language observations from the last seven days, most useful first.
function insights({ week, todayS, yesterdayAtTime, statement }) {
  const out = [];
  const t = week.totals;
  const dailySpend = Number(t.spend) / 7;
  const balance = Number(statement?.balance || 0);
  if (statement && balance < 0) {
    out.push({ icon: 'alert', tone: 'is-warn', title: `${money(statement.amount_due)} to pay`, text: `Your balance is below zero. At this week's pace your calls cost about ${money(dailySpend)} a day.`, to: '/billing', cta: 'Pay Now' });
  } else if (statement && dailySpend > 0) {
    const days = Math.floor(balance / dailySpend);
    out.push({ icon: 'billing', tone: days < 3 ? 'is-warn' : '', title: `About ${days} day${days === 1 ? '' : 's'} of calls left`, text: `Your ${money(balance)} credit covers roughly ${days} day${days === 1 ? '' : 's'} at this week's pace of ${money(dailySpend)} a day.`, to: '/billing', cta: 'Top Up' });
  }
  const delta = change(todayS.totals.calls, yesterdayAtTime);
  if (delta !== null && Math.abs(delta) >= 10) {
    out.push({ icon: delta > 0 ? 'trendUp' : 'trendDown', title: `Calls ${delta > 0 ? 'up' : 'down'} ${Math.abs(delta)}% on yesterday`, text: `${num(todayS.totals.calls)} calls so far today against ${num(yesterdayAtTime)} by this time yesterday.` });
  }
  const hours = week.heatmap[0].map((_, h) => week.heatmap.reduce((s, row) => s + row[h], 0));
  const peak = hours.indexOf(Math.max(...hours));
  if (hours[peak]) out.push({ icon: 'clock', title: `Busiest hour: ${hourLabel(peak)} to ${hourLabel((peak + 1) % 24)}`, text: `${pct(hours[peak], t.calls)} of this week's calls arrived in that hour. Make sure your team is ready for it.` });
  if (t.answered) {
    out.push({ icon: 'spark', title: `${pct(t.converted, t.calls)} of calls converted`, text: `You paid for ${num(t.converted)} of ${num(t.calls)} calls this week, an effective ${money(t.calls ? Number(t.spend) / t.calls : 0)} per call received.` });
  }
  if (t.short_calls / Math.max(t.answered, 1) >= 0.1) {
    out.push({ icon: 'alert', title: `${pct(t.short_calls, t.answered)} of answered calls under 30 seconds`, text: `${num(t.short_calls)} short calls this week. They are not charged, but a quick greeting can turn more of them into conversations.` });
  }
  const top = week.by_state[0];
  if (top) out.push({ icon: 'map', title: `Most calls from ${top.state}`, text: `${num(top.calls)} calls (${pct(top.calls, t.calls)}) this week, ${pct(top.converted, top.calls)} converted.` });
  if (t.repeat_callers) out.push({ icon: 'repeat', title: `${num(t.repeat_callers)} repeat callers`, text: 'People who called more than once this week. They are often your warmest leads.' });
  return out.slice(0, 5);
}

export default function Overview({ statement }) {
  const [open, setOpen] = useState(null);
  const day = today();
  const { data, error, loading, reload } = useLoad(async () => {
    const [todayS, yesterdayS, week, recent] = await Promise.all([
      fetchSummary({ from: day, to: day, group: 'hour' }),
      fetchSummary({ from: addDays(day, -1), to: addDays(day, -1), group: 'hour' }),
      fetchSummary({ from: addDays(day, -6), to: day, group: 'day' }),
      fetchCalls({ from: addDays(day, -6), to: day, pageSize: 8 }),
    ]);
    return { todayS, yesterdayS, week, recent };
  }, [day]);

  const s = statement.data;
  const name = s?.customer?.split(' ')[0];
  const hourNow = new Date().getHours();

  let kpis = null;
  let notes = [];
  let hourly = [];
  if (data) {
    const t = data.todayS.totals;
    const yesterdayAtTime = data.yesterdayS.series.filter((b) => Number(b.bucket) <= hourNow).reduce((n, b) => n + b.calls, 0);
    const d = change(t.calls, yesterdayAtTime);
    kpis = [
      { label: 'Calls Today', icon: 'calls', value: num(t.calls), note: d === null ? 'No calls by this time yesterday' : `${d >= 0 ? '+' : ''}${d}% vs this time yesterday`, tone: d > 0 ? 'is-up' : d < 0 ? 'is-down' : '' },
      { label: 'Converted', icon: 'check', value: num(t.converted), note: `${pct(t.converted, t.calls)} conversion rate` },
      { label: 'Spend Today', icon: 'billing', value: money(t.spend), note: s ? `${money(s.price_per_call)} per converted call` : '' },
      { label: 'Avg Call Length', icon: 'clock', value: duration(t.avg_duration), note: `${num(t.answered)} answered calls` },
    ];
    notes = insights({ week: data.week, todayS: data.todayS, yesterdayAtTime, statement: s });
    hourly = data.todayS.series.filter((b) => Number(b.bucket) <= hourNow).map((b) => ({
      label: hourLabel(b.bucket).replace(' ', '').toLowerCase(),
      values: [b.converted, b.calls - b.converted],
      tip: { title: `${hourLabel(b.bucket)} to ${hourLabel((Number(b.bucket) + 1) % 24)}`, lines: [['Converted', num(b.converted), SERIES.converted], ['Not converted', num(b.calls - b.converted), SERIES.other], ['Spend', money(b.spend)]] },
    }));
  }

  return (
    <>
      <PageHead title={`${greeting()}${name ? `, ${name}` : ''}`} sub={<><span className="p-live" aria-hidden="true" />Live{s ? ` · updated ${clock(s.as_of)}` : ''}</>}>
        <button type="button" className="btn btn--quiet btn--sm" onClick={() => { reload(); statement.load(); }} disabled={loading}><Icon name="refresh" />Refresh</button>
      </PageHead>
      <ErrorNote error={error} onRetry={reload} />

      <div className="p-kpis">
        {kpis ? kpis.map((k) => <Kpi key={k.label} {...k} />) : Array.from({ length: 4 }, (_, i) => <div key={i} className="p-kpi is-skeleton" />)}
        {s ? (
          <Link to="/billing" className={`p-kpi p-kpi--balance ${Number(s.balance) < 0 ? 'is-due' : 'is-ok'}`}>
            <p className="p-kpi__label"><Icon name="billing" />{Number(s.balance) < 0 ? 'Amount Due' : 'Balance'}</p>
            <p className="p-kpi__value">{money(Number(s.balance) < 0 ? s.amount_due : s.balance)}</p>
            <p className="p-kpi__note">{Number(s.balance) < 0 ? 'Pay now' : 'In credit'} →</p>
          </Link>
        ) : <div className="p-kpi is-skeleton" />}
      </div>

      <div className="p-grid p-grid--overview">
        <ChartCard
          title="Today, Hour by Hour"
          sub="Calls received so far today."
          legend={[{ name: 'Converted', color: SERIES.converted }, { name: 'Not converted', color: SERIES.other }]}
          table={data && { head: ['Hour', 'Calls', 'Converted', 'Spend'], rows: data.todayS.series.filter((b) => Number(b.bucket) <= hourNow).map((b) => [hourLabel(b.bucket), num(b.calls), num(b.converted), money(b.spend)]) }}
        >
          {data ? <Bars rows={hourly} series={[{ color: SERIES.converted }, { color: SERIES.other }]} labelEvery={hourly.length > 12 ? 3 : 1} ariaLabel="Calls per hour today" /> : <div className="p-chart is-skeleton" />}
        </ChartCard>

        <section className="p-card">
          <header className="p-card__head"><div><h2>Insights</h2><p>From your last 7 days.</p></div></header>
          {data ? (
            <ul className="p-insights">
              {notes.map((n) => (
                <li key={n.title} className={n.tone || ''}>
                  <span className="p-insights__icon"><Icon name={n.icon} /></span>
                  <div>
                    <b>{n.title}</b>
                    <p>{n.text}</p>
                    {n.to && <Link to={n.to} className="p-insights__cta">{n.cta} →</Link>}
                  </div>
                </li>
              ))}
            </ul>
          ) : <div className="p-insights is-skeleton" />}
        </section>
      </div>

      <section className="p-card">
        <header className="p-card__head">
          <div><h2>Recent Calls</h2><p>Your latest calls from the last 7 days.</p></div>
          <Link to="/calls" className="btn btn--quiet btn--sm">All Calls</Link>
        </header>
        <div className="p-tablewrap">
          <table className="p-table p-table--click">
            <thead><tr><th scope="col">Time</th><th scope="col">Caller</th><th scope="col">State</th><th scope="col">Duration</th><th scope="col">Status</th><th scope="col">Charged</th></tr></thead>
            <tbody>
              {data?.recent.results.map((c) => (
                <tr key={c.id} onClick={() => setOpen(c)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setOpen(c)}>
                  <th scope="row">{dateTime(c.started_at)}</th><td>{c.caller}</td><td>{c.state}</td><td>{duration(c.duration)}</td><td><StatusBadge call={c} /></td><td>{money(c.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && !data.recent.results.length && <p className="p-empty">No calls in the last 7 days.</p>}
        </div>
      </section>
      <CallDrawer call={open} price={s?.price_per_call} onClose={() => setOpen(null)} />
    </>
  );
}
