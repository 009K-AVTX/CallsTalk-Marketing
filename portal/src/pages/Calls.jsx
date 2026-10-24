import { useEffect, useState } from 'react';
import { fetchCalls } from '../../../src/lib/portal.js';
import Icon from '../components/Icons.jsx';
import { CallDrawer, ErrorNote, PageHead, RangeBar, StatusBadge } from '../components/Shell.jsx';
import { dateTime, duration, money, num, RANGES, rangeOf, STATUS } from '../format.js';
import useLoad from '../useLoad.js';

const PAGE = 25;
const FILTERS = [
  ['', 'All Calls'],
  ['converted', 'Converted'],
  ['not_converted', 'Answered, Not Converted'],
  ['missed', 'Missed'],
  ['busy', 'Busy'],
];

const csvCell = (v) => `"${String(v).replace(/"/g, '""')}"`;

export default function Calls({ statement }) {
  const [range, setRange] = useState('7d');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(null);
  const [exporting, setExporting] = useState(false);
  const { from, to } = rangeOf(range);

  // Search as they type, once they pause.
  useEffect(() => {
    const t = setTimeout(() => { setQ(search); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, error, loading, reload } = useLoad(() => fetchCalls({ from, to, status, q, page, pageSize: PAGE }), [from, to, status, q, page]);
  const pages = data ? Math.max(1, Math.ceil(data.count / PAGE)) : 1;

  const exportCsv = async () => {
    setExporting(true);
    try {
      const all = await fetchCalls({ from, to, status, q, page: 1, pageSize: 10000 });
      const head = ['Time', 'Caller', 'State', 'Duration (s)', 'Status', 'Converted', 'Charged'];
      const lines = all.results.map((c) => [c.started_at, c.caller, c.state, c.duration, STATUS[c.status] || c.status, c.converted ? 'Yes' : 'No', c.cost].map(csvCell).join(','));
      const url = URL.createObjectURL(new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' }));
      const a = Object.assign(document.createElement('a'), { href: url, download: `callstalk-calls-${from}-to-${to}.csv` });
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <PageHead title="Calls" sub={data ? `${num(data.count)} calls from ${from === to ? from : `${from} to ${to}`}` : 'Loading your calls…'}>
        <button type="button" className="btn btn--quiet btn--sm" onClick={exportCsv} disabled={exporting || !data?.count}><Icon name="download" />{exporting ? 'Preparing…' : 'Export CSV'}</button>
      </PageHead>

      <div className="p-filters">
        <RangeBar value={range} onChange={(r) => { setRange(r); setPage(1); }} ranges={RANGES} />
        <label className="p-select">
          <span className="sr-only">Status</span>
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            {FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="p-search">
          <span className="sr-only">Search by caller number</span>
          <input type="search" placeholder="Search caller number" value={search} onChange={(e) => setSearch(e.target.value)} inputMode="tel" />
        </label>
      </div>
      <ErrorNote error={error} onRetry={reload} />

      <section className="p-card p-card--flush">
        <div className="p-tablewrap">
          <table className={`p-table p-table--click${loading ? ' is-loading' : ''}`}>
            <thead><tr><th scope="col">Time</th><th scope="col">Caller</th><th scope="col">State</th><th scope="col">Duration</th><th scope="col">Status</th><th scope="col">Charged</th></tr></thead>
            <tbody>
              {data?.results.map((c) => (
                <tr key={c.id} onClick={() => setOpen(c)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setOpen(c)}>
                  <th scope="row">{dateTime(c.started_at)}</th><td>{c.caller}</td><td>{c.state}</td><td>{duration(c.duration)}</td><td><StatusBadge call={c} /></td><td>{money(c.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && !data.results.length && <p className="p-empty">No calls match these filters.</p>}
          {!data && !error && <div className="p-rows is-skeleton" />}
        </div>
        {data && data.count > PAGE && (
          <footer className="p-pager">
            <span>Page {page} of {pages}</span>
            <div>
              <button type="button" className="btn btn--quiet btn--sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
              <button type="button" className="btn btn--quiet btn--sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
            </div>
          </footer>
        )}
      </section>
      <CallDrawer call={open} price={statement.data?.price_per_call} onClose={() => setOpen(null)} />
    </>
  );
}
