import { Fragment, useEffect, useState } from 'react';
import { fetchAudit, fetchAuditSummary, listUserOptions, signedIn } from '../admin.js';
import {
  actionName, actor, changes, describe, device, failed, GROUPS, groupOf, outcome, roleName, stamp, timeOnly,
} from '../audit-text.js';
import { BarList, ColumnChart, Legend } from '../components/Charts.jsx';
import { DownloadMenu, period, Period } from '../components/Filters.jsx';
import Icon from '../components/Icons.jsx';
import { ErrorNote, PageHead } from '../components/Shell.jsx';
import { downloadCsv, downloadPdf } from '../exports.js';
import { addDays, dayLabel } from '../format.js';
import { Link, navigate } from '../router.jsx';
import useLoad from '../useLoad.js';
import Select from '../../../src/components/Select.jsx';

const PAGE = 30;
const COLORS = ['var(--viz-1)', 'var(--viz-2)', 'var(--viz-3)', 'var(--viz-4)'];
const HEX = ['#9d70dd', '#2fa8a0', '#c27f14', '#d9628a'];

const longDay = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
};
const localDay = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const plural = (k, word) => `${k.toLocaleString('en-US')} ${word}${k === 1 ? '' : 's'}`;

// The four groups per day, every day of the period shown (quiet days as zero).
function perDay(summary, from, to) {
  const labels = [];
  for (let d = from; d <= to; d = addDays(d, 1)) labels.push(d);
  const at = new Map(labels.map((d, i) => [d, i]));
  const values = GROUPS.map(() => labels.map(() => 0));
  for (const row of summary?.per_day || []) {
    const i = at.get(row.day);
    const g = GROUPS.findIndex((grp) => grp.kinds.includes(row.kind));
    if (i !== undefined) values[g < 0 ? 1 : g][i] += row.count;
  }
  return { labels, values };
}

function Result({ row }) {
  const o = outcome(row);
  const why = [row.status_code >= 400 && `HTTP ${row.status_code}`, row.details?.error].filter(Boolean).join(': ');
  return <span className={`p-pill is-${o.tone}`} title={why || undefined}>{o.label}</span>;
}

function Detail({ row }) {
  const list = changes(row);
  const hasBefore = list.some((c) => c.before !== null);
  const d = row.details || {};
  const about = row.target_label || d.target_email;
  return (
    <div className="p-audit__detail">
      {d.error && <p className="p-error p-audit__why"><Icon name="alert" />{d.error}</p>}
      <dl className="p-audit__facts">
        <div><dt>When</dt><dd>{stamp(row.created_at)}</dd></div>
        <div><dt>By</dt><dd>{actor(row)}{row.user_role && <small> · {roleName(row.user_role)}</small>}</dd></div>
        {about && (
          <div>
            <dt>About</dt>
            <dd>{row.target_id && /^[0-9a-f-]{36}$/.test(row.target_id) && row.action !== 'login.delete'
              ? <Link to={`/admin/users/${row.target_id}`}>{about}</Link> : about}
            {d.target_email && d.target_email !== about && <small> · {d.target_email}</small>}</dd>
          </div>
        )}
        <div><dt>Action</dt><dd><code>{row.action}</code></dd></div>
        {row.path && <div><dt>Request</dt><dd><code>{row.method} {row.path}</code>{row.status_code && <small> · {row.status_code}</small>}</dd></div>}
        {row.ip && <div><dt>IP Address</dt><dd><code>{row.ip}</code></dd></div>}
        {row.user_agent && <div className="p-audit__wide"><dt>Device</dt><dd>{device(row.user_agent)}<small className="p-audit__ua">{row.user_agent}</small></dd></div>}
      </dl>
      {list.length > 0 && (
        <table className="p-table p-audit__changes">
          <thead><tr><th scope="col">Field</th>{hasBefore && <th scope="col">Before</th>}<th scope="col">{hasBefore ? 'After' : 'Value'}</th></tr></thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.key}>
                <th scope="row">{c.field}</th>
                {hasBefore && <td className="p-audit__was">{c.before ?? '—'}</td>}
                <td>{c.after ?? (hasBefore ? 'Removed' : '—')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// One entry: a row that opens to show everything recorded.
function Entry({ row, open, onToggle }) {
  const bad = failed(row);
  const id = `audit-${row.id}`;
  return (
    <>
      <tr className={`p-audit__row${open ? ' is-open' : ''}${bad ? ' is-bad' : ''}`}>
        <td className="p-audit__time">{timeOnly(row.created_at)}</td>
        <td className="p-audit__who">
          <span className="p-audit__person">
            <span className={`p-audit__dot is-${groupOf(row.action)}`} aria-hidden="true" />
            <span>{actor(row)}{row.user_role && <small>{roleName(row.user_role)}</small>}</span>
          </span>
        </td>
        <th scope="row" className="p-audit__what">
          <button type="button" aria-expanded={open} aria-controls={id} onClick={onToggle}>
            <span>{describe(row)}</span>
            <small>{actionName(row.action)}{row.ip ? ` · ${row.ip}` : ''}</small>
          </button>
        </th>
        <td className="p-audit__result"><Result row={row} /></td>
        <td className="p-audit__chev" aria-hidden="true"><Icon name="back" className={`p-icon p-chev${open ? ' is-open' : ''}`} /></td>
      </tr>
      {open && (
        <tr className="p-audit__more" id={id}>
          <td colSpan={5}><Detail row={row} /></td>
        </tr>
      )}
    </>
  );
}

const csvRows = (rows) => rows.map((r) => [
  new Date(r.created_at).toISOString(), actor(r), roleName(r.user_role), actionName(r.action), describe(r), r.target_label,
  outcome(r).label, r.status_code ?? '', r.ip ?? '', device(r.user_agent), r.method ?? '', r.path ?? '',
  r.details ? JSON.stringify(r.details) : '',
]);

export default function AdminAudit({ onSignedOut }) {
  const start = new URLSearchParams(window.location.search);
  const [range, setRange] = useState(() => period(start.get('about') ? '90' : '7'));
  const [group, setGroup] = useState('');
  const [person, setPerson] = useState('');
  const [onlyFailed, setOnlyFailed] = useState(false);
  const [about, setAbout] = useState(start.get('about') || '');
  const [typed, setTyped] = useState('');
  const [q, setQ] = useState('');
  // Pages go by cursor (the server's `next`): the cursors of the pages opened so far, newest page first.
  const [cursors, setCursors] = useState([]);
  const [knownTotal, setKnownTotal] = useState(0);
  const [open, setOpen] = useState(null);

  // Searching waits until typing stops.
  useEffect(() => {
    const t = setTimeout(() => setQ(typed.trim()), 300);
    return () => clearTimeout(t);
  }, [typed]);
  useEffect(() => {
    setCursors([]);
    setOpen(null);
  }, [range.from, range.to, group, person, onlyFailed, about, q]);
  const before = cursors[cursors.length - 1] ?? null;

  const filters = {
    from: range.from, to: range.to, kind: GROUPS.find((g) => g.key === group)?.kinds, user: person, about,
    outcome: onlyFailed ? 'failed' : '', q,
  };
  const deps = [range.from, range.to, range.invalid, group, person, onlyFailed, about, q];
  const guard = (load) => signedIn(onSignedOut, () => (range.invalid ? Promise.reject(new Error('Choose a start date on or before the end date.')) : load()));
  const people = useLoad(signedIn(onSignedOut, listUserOptions), []);
  const summary = useLoad(guard(() => fetchAuditSummary(filters)), deps);
  const log = useLoad(guard(() => fetchAudit(filters, { limit: PAGE, before })), [...deps, before]);
  // The total comes with the first page only (counting is the slow part); later pages keep it.
  useEffect(() => {
    if (Number.isInteger(log.data?.total)) setKnownTotal(log.data.total);
  }, [log.data]);

  const s = summary.data;
  const t = s?.totals;
  const rows = log.data?.rows || [];
  const total = knownTotal;
  const offset = cursors.length * PAGE;
  const chart = perDay(s, range.from, range.to);
  const aboutName = about && (people.data?.find((u) => u.id === about)?.company || people.data?.find((u) => u.id === about)?.name || 'one login');
  const span = range.from === range.to ? dayLabel(range.from) : `${dayLabel(range.from)} to ${dayLabel(range.to)}`;
  const clearAbout = () => {
    setAbout('');
    navigate('/admin/audit', { replace: true });
  };

  // Rows on this page, grouped under their day.
  const days = [];
  for (const r of rows) {
    const day = localDay(r.created_at);
    if (days[days.length - 1]?.day !== day) days.push({ day, rows: [] });
    days[days.length - 1].rows.push(r);
  }

  const scope = [GROUPS.find((g) => g.key === group)?.label, person && people.data?.find((u) => u.id === person)?.email,
    about && `about ${aboutName}`, onlyFailed && 'unsuccessful only', q && `matching "${q}"`].filter(Boolean).join(' · ');
  const stem = `callstalk-audit-log-${range.from}-to-${range.to}`;
  const everything = async (format) => {
    const all = await fetchAudit(filters, {}, format);
    if (!all.rows.length) throw new Error('There is nothing to download for these filters.');
    return all;
  };
  const csv = async () => {
    const all = await everything('csv');
    downloadCsv(`${stem}.csv`, ['Time (UTC)', 'By', 'Role', 'Action', 'What Happened', 'About', 'Result', 'Status', 'IP Address', 'Device', 'Method', 'Path', 'Details'], csvRows(all.rows));
  };
  const pdf = async () => {
    const all = await everything('pdf');
    await downloadPdf({
      filename: `${stem}.pdf`,
      title: 'Audit Log',
      subtitle: `${span}${scope ? ` · ${scope}` : ''} · times in ${Intl.DateTimeFormat().resolvedOptions().timeZone}${all.total > all.rows.length ? ` · latest ${all.rows.length} of ${all.total}` : ''}`,
      figures: t ? [['Events', t.events.toLocaleString('en-US')], ['People', String(t.people)], ['Sign-Ins', String(t.sign_ins)], ['Failed Sign-Ins', String(t.failed_sign_ins)], ['Unsuccessful Actions', String(t.refused)]] : [],
      chart: chart.labels.length > 1 ? {
        title: 'Activity per Day', labels: chart.labels, stacked: true,
        series: GROUPS.map((g, i) => ({ label: g.label, color: HEX[i], values: chart.values[i] })),
      } : null,
      tables: [{
        title: 'Entries',
        head: ['When', 'By', 'What Happened', 'Result', 'IP Address'],
        body: all.rows.map((r) => [stamp(r.created_at), actor(r), describe(r), outcome(r).label, r.ip || '']),
        columns: { 0: { cellWidth: 118 }, 1: { cellWidth: 140 }, 3: { cellWidth: 70 }, 4: { cellWidth: 90 } },
      }],
    });
  };

  return (
    <>
      <PageHead title="Audit Log" sub="Every change made in the portal, every sign-in and every download, with who did it and when. Entries are kept for good.">
        <button type="button" className="btn btn--quiet btn--sm" onClick={() => { summary.reload(); log.reload(); }}><Icon name="refresh" />Refresh</button>
        <DownloadMenu disabled={!total} options={[
          { format: 'PDF', label: 'Audit Report', hint: 'Figures, chart and entries', run: pdf },
          { format: 'CSV', label: 'All Entries', hint: 'Every field, for a spreadsheet', run: csv },
        ]} />
      </PageHead>

      <div className="p-filters">
        <Period value={range} onChange={setRange} presets={['today', '7', '30', '90']} />
        <label className="p-select">
          <span className="sr-only">Kind of activity</span>
          <Select value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="">All Activity</option>
            {GROUPS.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
          </Select>
        </label>
        <label className="p-select">
          <span className="sr-only">Done by</span>
          <Select value={person} onChange={(e) => setPerson(e.target.value)}>
            <option value="">Anyone</option>
            {(people.data || []).map((u) => <option key={u.id} value={u.id}>{u.email}</option>)}
          </Select>
        </label>
        <label className={`p-toggle${onlyFailed ? ' is-on' : ''}`}>
          <input type="checkbox" checked={onlyFailed} onChange={(e) => setOnlyFailed(e.target.checked)} />
          <Icon name="alert" />Unsuccessful Only
        </label>
        <label className="p-search p-filters__search"><span className="sr-only">Search</span>
          <input type="search" placeholder="Search email, name, action or IP" value={typed} onChange={(e) => setTyped(e.target.value)} />
        </label>
      </div>
      {about && (
        <p className="p-chips">
          <span className="p-chip">About {aboutName}<button type="button" aria-label="Show everyone" onClick={clearAbout}><Icon name="close" /></button></span>
        </p>
      )}
      <ErrorNote error={summary.error || log.error} onRetry={range.invalid ? null : () => { summary.reload(); log.reload(); }} />

      {t && (
        <p className={`p-ledger__notes p-audit__totals${summary.loading ? ' is-refreshing' : ''}`}>
          <span><b>{t.events.toLocaleString('en-US')}</b> {t.events === 1 ? 'event' : 'events'}</span>
          <span><b>{t.people}</b> {t.people === 1 ? 'person' : 'people'}</span>
          <span><b>{t.sign_ins}</b> sign-ins</span>
          <span className={t.failed_sign_ins ? 'is-alert' : ''}>{t.failed_sign_ins > 0 && <Icon name="alert" />}<b>{t.failed_sign_ins}</b> failed sign-ins</span>
          <span className={t.refused ? 'is-alert' : ''}><b>{t.refused}</b> unsuccessful {t.refused === 1 ? 'action' : 'actions'}</span>
        </p>
      )}

      <div className={`p-grid p-grid--lead${summary.loading && s ? ' is-refreshing' : ''}`}>
        <section className="p-card">
          <header className="p-card__head"><div><h2>Activity per Day</h2><p>{span}, in your time zone.</p></div></header>
          <Legend items={GROUPS.map((g, i) => ({ label: g.label, color: COLORS[i], value: chart.values[i].reduce((a, b) => a + b, 0) }))} />
          {chart.labels.length > 1
            ? <ColumnChart labels={chart.labels} label={`Audit events per day, ${span}`} totalLabel="All events" height={210}
              series={GROUPS.map((g, i) => ({ key: g.key, label: g.label, color: COLORS[i], values: chart.values[i] }))} />
            : <p className="p-audit__oneday">{t ? plural(t.events, 'event') : '—'} on {span}. Choose a longer period to see the days side by side.</p>}
        </section>
        <section className="p-card">
          <header className="p-card__head"><div><h2>Most Active</h2><p>Who made the most entries.</p></div></header>
          <BarList empty="No one did anything in this period." format={(v) => v.toLocaleString('en-US')}
            items={(s?.people || []).map((p) => ({ key: p.user_id, label: p.email, sub: roleName(p.role), value: p.count }))} />
        </section>
      </div>

      <section className="p-card p-card--flush">
        <header className="p-card__head">
          <div><h2>Entries</h2><p>{log.data ? (total ? `${total.toLocaleString('en-US')} ${total === 1 ? 'entry' : 'entries'}, newest first. Open one to see everything recorded.` : 'Nothing matches these filters.') : 'Loading…'}</p></div>
        </header>
        <div className="p-tablewrap">
          <table className={`p-table p-audit${log.loading ? ' is-loading' : ''}`}>
            <thead className="sr-only"><tr><th scope="col">Time</th><th scope="col">By</th><th scope="col">What Happened</th><th scope="col">Result</th><th scope="col">Open</th></tr></thead>
            <tbody>
              {days.map(({ day, rows: list }) => (
                <Fragment key={day}>
                  <tr className="p-audit__day"><th colSpan={5} scope="rowgroup">{longDay(day)}</th></tr>
                  {list.map((r) => <Entry key={r.id} row={r} open={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)} />)}
                </Fragment>
              ))}
            </tbody>
          </table>
          {log.data && !total && (
            <div className="p-empty-card">
              <span className="p-insights__icon"><Icon name="audit" /></span>
              <h2>No Entries</h2>
              <p>{scope || onlyFailed ? 'Nothing matches these filters. Try a longer period or clear a filter.' : 'Nothing has happened in this period yet. Sign-ins and changes appear here as they happen.'}</p>
            </div>
          )}
        </div>
        {total > PAGE && (
          <div className="p-pager">
            <span>{(offset + 1).toLocaleString('en-US')}–{(offset + rows.length).toLocaleString('en-US')} of {total.toLocaleString('en-US')}</span>
            <div>
              <button type="button" className="btn btn--quiet btn--sm" disabled={!cursors.length || log.loading} onClick={() => { setCursors(cursors.slice(0, -1)); setOpen(null); }}>Newer</button>
              <button type="button" className="btn btn--quiet btn--sm" disabled={!log.data?.next || log.loading} onClick={() => { setCursors([...cursors, log.data.next]); setOpen(null); }}>Older</button>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
