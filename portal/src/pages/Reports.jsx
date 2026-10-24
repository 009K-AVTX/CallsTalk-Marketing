import { useState } from 'react';
import { fetchSummary } from '../../../src/lib/portal.js';
import { Bars, ChartCard, Heatmap, SERIES } from '../components/Charts.jsx';
import { ErrorNote, Kpi, PageHead, RangeBar } from '../components/Shell.jsx';
import { bucketLabel, duration, hourLabel, money, num, pct, RANGES, rangeOf } from '../format.js';
import useLoad from '../useLoad.js';

const REPORT_RANGES = RANGES.filter((r) => r.id !== 'today' && r.id !== 'yesterday');
const GROUPS = [['day', 'Daily'], ['week', 'Weekly'], ['month', 'Monthly']];
const lengthLabel = (b) => (b.to == null ? `${b.from / 60}+ min` : b.from < 60 && b.to <= 60 ? `${b.from}–${b.to}s` : `${b.from / 60}–${b.to / 60} min`);

export default function Reports() {
  const [range, setRange] = useState('30d');
  const [group, setGroup] = useState('day');
  const { from, to } = rangeOf(range);
  const { data, error, reload } = useLoad(() => fetchSummary({ from, to, group }), [from, to, group]);
  const t = data?.totals;

  const series = data?.series || [];
  const every = Math.ceil(series.length / 10);
  const callRows = series.map((b) => ({
    label: bucketLabel(b.bucket, group).replace('Week of ', ''),
    values: [b.converted, b.calls - b.converted],
    tip: { title: bucketLabel(b.bucket, group), lines: [['Converted', num(b.converted), SERIES.converted], ['Not converted', num(b.calls - b.converted), SERIES.other], ['Conversion', pct(b.converted, b.calls)]] },
  }));
  const spendRows = series.map((b) => ({
    label: bucketLabel(b.bucket, group).replace('Week of ', ''),
    values: [Number(b.spend)],
    tip: { title: bucketLabel(b.bucket, group), lines: [['Spend', money(b.spend), SERIES.converted], ['Converted calls', num(b.converted)]] },
  }));
  const lengthRows = (data?.durations || []).map((b) => ({
    label: lengthLabel(b),
    values: [b.calls],
    tip: { title: lengthLabel(b), lines: [['Answered calls', num(b.calls), SERIES.converted], ['Share', pct(b.calls, t?.answered)]] },
  }));
  const maxState = Math.max(1, ...(data?.by_state || []).map((s) => s.calls));

  return (
    <>
      <PageHead title="Reports" sub={`${from} to ${to}`}>
        <div className="p-ranges" role="group" aria-label="Group by">
          {GROUPS.map(([id, label]) => (
            <button key={id} type="button" className={group === id ? 'is-on' : ''} aria-pressed={group === id} onClick={() => setGroup(id)}>{label}</button>
          ))}
        </div>
      </PageHead>
      <div className="p-filters"><RangeBar value={range} onChange={setRange} ranges={REPORT_RANGES} /></div>
      <ErrorNote error={error} onRetry={reload} />

      <div className="p-kpis">
        {t ? (
          <>
            <Kpi label="Calls" icon="calls" value={num(t.calls)} note={`${num(t.answered)} answered`} />
            <Kpi label="Converted" icon="check" value={num(t.converted)} note={`${pct(t.converted, t.calls)} conversion rate`} />
            <Kpi label="Spend" icon="billing" value={money(t.spend)} note={`${money(t.calls ? Number(t.spend) / t.calls : 0)} per call received`} />
            <Kpi label="Avg Call Length" icon="clock" value={duration(t.avg_duration)} note={`${num(t.short_calls)} under 30 seconds`} />
            <Kpi label="Repeat Callers" icon="repeat" value={num(t.repeat_callers)} note="Called more than once" />
          </>
        ) : Array.from({ length: 5 }, (_, i) => <div key={i} className="p-kpi is-skeleton" />)}
      </div>

      <div className="p-grid">
        <ChartCard
          title="Calls"
          sub={`${GROUPS.find(([id]) => id === group)[1]} calls, converted and not.`}
          legend={[{ name: 'Converted', color: SERIES.converted }, { name: 'Not converted', color: SERIES.other }]}
          table={data && { head: ['Period', 'Calls', 'Converted', 'Conversion'], rows: series.map((b) => [bucketLabel(b.bucket, group), num(b.calls), num(b.converted), pct(b.converted, b.calls)]) }}
        >
          {data ? <Bars rows={callRows} series={[{ color: SERIES.converted }, { color: SERIES.other }]} labelEvery={every} ariaLabel="Calls per period" /> : <div className="p-chart is-skeleton" />}
        </ChartCard>
        <ChartCard
          title="Spend"
          sub="What your converted calls cost."
          table={data && { head: ['Period', 'Spend', 'Converted Calls'], rows: series.map((b) => [bucketLabel(b.bucket, group), money(b.spend), num(b.converted)]) }}
        >
          {data ? <Bars rows={spendRows} series={[{ color: SERIES.converted }]} labelEvery={every} yFormat={(v) => `$${num(Math.round(v))}`} ariaLabel="Spend per period" /> : <div className="p-chart is-skeleton" />}
        </ChartCard>
      </div>

      <div className="p-grid">
        <ChartCard
          title="When Calls Arrive"
          sub="Calls by weekday and hour, so you can staff for the busy times."
          table={data && { head: ['Day', ...Array.from({ length: 24 }, (_, h) => hourLabel(h))], rows: data.heatmap.map((row, d) => [['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][d], ...row.map(num)]) }}
        >
          {data ? <Heatmap grid={data.heatmap} format={hourLabel} /> : <div className="p-chart is-skeleton" />}
        </ChartCard>
        <ChartCard
          title="Call Length"
          sub="How long answered calls lasted."
          table={data && { head: ['Length', 'Answered Calls', 'Share'], rows: data.durations.map((b) => [lengthLabel(b), num(b.calls), pct(b.calls, t.answered)]) }}
        >
          {data ? <Bars rows={lengthRows} series={[{ color: SERIES.converted }]} ariaLabel="Answered calls by length" /> : <div className="p-chart is-skeleton" />}
        </ChartCard>
      </div>

      <section className="p-card p-card--flush">
        <header className="p-card__head"><div><h2>Calls by State</h2><p>Where your callers are, from their area code.</p></div></header>
        <div className="p-tablewrap">
          <table className="p-table">
            <thead><tr><th scope="col">State</th><th scope="col">Calls</th><th scope="col" className="p-table__bar">Share</th><th scope="col">Converted</th><th scope="col">Conversion</th><th scope="col">Spend</th></tr></thead>
            <tbody>
              {data?.by_state.map((s) => (
                <tr key={s.state}>
                  <th scope="row">{s.state}</th>
                  <td>{num(s.calls)}</td>
                  <td className="p-table__bar"><span className="p-share"><i style={{ width: `${(s.calls / maxState) * 100}%` }} /></span>{pct(s.calls, t.calls)}</td>
                  <td>{num(s.converted)}</td>
                  <td>{pct(s.converted, s.calls)}</td>
                  <td>{money(s.spend)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && !data.by_state.length && <p className="p-empty">No calls in this period.</p>}
        </div>
      </section>
    </>
  );
}
