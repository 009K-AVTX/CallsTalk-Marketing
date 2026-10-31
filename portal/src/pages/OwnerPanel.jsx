import { useMemo, useState } from 'react';
import { fetchOwnerMonths, signedIn } from '../admin.js';
import Icon from '../components/Icons.jsx';
import { ErrorNote, PageHead } from '../components/Shell.jsx';
import { downloadCsv } from '../exports.js';
import { monthName, money } from '../format.js';
import { Link } from '../router.jsx';
import useLoad from '../useLoad.js';

// The Owner Panel: every client's records month by month (server/src/owner.js), for the Owner only. Each month:
// its totals, then every client with their rate, calls, replaced and charged calls, billed, collected, and the
// balance the month opened and closed on. The same figures as each client's own bill and the Finance page.

const n = (v) => Number(v) || 0;
const count = (v) => n(v).toLocaleString('en-US');
const tone = (v) => (n(v) < 0 ? 'is-neg' : n(v) > 0 ? 'is-pos' : '');
const rate = (r) => (r === null ? 'Not set' : r.includes(' to ') ? r.split(' to ').map((x) => money(x)).join(' to ') : money(r));

const thisMonth = () => new Date().toISOString().slice(0, 7);
const monthsBack = (k) => {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - (k - 1));
  return d.toISOString().slice(0, 7);
};
const RANGES = [
  { key: '3', label: '3 Months', from: () => monthsBack(3) },
  { key: '6', label: '6 Months', from: () => monthsBack(6) },
  { key: '12', label: '12 Months', from: () => monthsBack(12) },
  { key: 'year', label: 'This Year', from: () => `${new Date().getUTCFullYear()}-01` },
];

function Month({ m, open, onToggle }) {
  const t = m.totals;
  return (
    <section className="p-card p-card--flush p-owner__month">
      <header className="p-card__head">
        <button type="button" className="p-owner__toggle" onClick={onToggle} aria-expanded={open}>
          <h2>{monthName(m.month)}</h2>
          <Icon name="back" className={`p-icon p-owner__chevron${open ? ' is-open' : ''}`} />
        </button>
        <dl className="p-owner__totals">
          <div><dt>Clients</dt><dd>{count(t.clients)}</dd></div>
          <div><dt>Calls</dt><dd>{count(t.calls)}{t.replacements > 0 && <small> − {count(t.replacements)}</small>}</dd></div>
          <div><dt>Billed</dt><dd>{money(t.charges)}</dd></div>
          <div><dt>Collected</dt><dd className={n(t.received) ? 'is-pos' : ''}>{money(t.received)}</dd></div>
          <div><dt>Owed at Month End</dt><dd className={n(t.owed) ? 'is-neg' : ''}>{money(t.owed)}</dd></div>
          <div><dt>Credit at Month End</dt><dd>{money(t.credit)}</dd></div>
        </dl>
      </header>
      {open && (m.clients.length ? (
        <div className="p-tablewrap">
          <table className="p-table p-table--figures">
            <thead>
              <tr>
                <th scope="col">Client</th><th scope="col">Rate</th><th scope="col">Calls</th><th scope="col">Replaced</th><th scope="col">Charged Calls</th>
                <th scope="col">Opening Balance</th><th scope="col">Billed</th><th scope="col">Collected</th><th scope="col">Closing Balance</th>
              </tr>
            </thead>
            <tbody>
              {m.clients.map((c) => (
                <tr key={c.id}>
                  <th scope="row"><Link to={`/admin/users/${c.id}`}>{c.client}</Link>{c.nickname && c.name && <small className="p-up__file">{c.name}</small>}</th>
                  <td className={c.rate === null ? 'is-neg' : ''}>{rate(c.rate)}</td>
                  <td>{count(c.calls)}</td>
                  <td>{count(c.replacements)}</td>
                  <td>{count(c.billable_calls)}</td>
                  <td className={tone(c.opening_balance)}>{money(c.opening_balance)}</td>
                  <td>{money(c.charges)}</td>
                  <td className={n(c.received) ? 'is-pos' : ''}>{money(c.received)}</td>
                  <td className={tone(c.closing_balance)}><b>{money(c.closing_balance)}</b></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Total</th><td />
                <td>{count(t.calls)}</td><td>{count(t.replacements)}</td><td>{count(t.billable_calls)}</td>
                <td className={tone(t.opening_balance)}>{money(t.opening_balance)}</td>
                <td>{money(t.charges)}</td><td className={n(t.received) ? 'is-pos' : ''}>{money(t.received)}</td>
                <td className={tone(t.closing_balance)}>{money(t.closing_balance)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : <p className="p-empty">No client was billed this month.</p>)}
    </section>
  );
}

export default function OwnerPanel({ onSignedOut }) {
  const [range, setRange] = useState('6');
  const from = RANGES.find((r) => r.key === range).from();
  const to = thisMonth();
  const report = useLoad(signedIn(onSignedOut, () => fetchOwnerMonths({ from, to })), [from, to]);
  const r = report.data;
  // The newest month starts open; the others open on a tap.
  const [opened, setOpened] = useState(() => new Set([thisMonth()]));
  const toggle = (m) => setOpened((s) => {
    const next = new Set(s);
    if (next.has(m)) next.delete(m);
    else next.add(m);
    return next;
  });

  const all = useMemo(() => r?.months.flatMap((m) => m.clients.map((c) => ({ ...c, month: m.month }))) || [], [r]);
  const csv = () => downloadCsv(`CallsTalk-owner-records-${r.from}-to-${r.to}.csv`,
    ['Month', 'Client', 'Name', 'Rate ($)', 'Calls', 'Replaced', 'Charged Calls', 'Opening Balance ($)', 'Billed ($)', 'Collected ($)', 'Closing Balance ($)'],
    all.map((c) => [monthName(c.month), c.client, c.name, c.rate ?? 'Not set', c.calls, c.replacements, c.billable_calls, n(c.opening_balance), n(c.charges), n(c.received), n(c.closing_balance)]));

  return (
    <>
      <PageHead title="Owner Panel" sub={r ? `Every client's records by month · ${monthName(r.from)} to ${monthName(r.to)}` : 'Loading…'}>
        <button type="button" className="btn btn--quiet btn--sm" onClick={report.reload}><Icon name="refresh" />Refresh</button>
        <button type="button" className="btn btn--light btn--sm" onClick={csv} disabled={!all.length}><Icon name="download" />Download CSV</button>
      </PageHead>
      <div className="p-filters">
        <div className="p-ranges" role="radiogroup" aria-label="Months">
          {RANGES.map((x) => (
            <button key={x.key} type="button" role="radio" aria-checked={range === x.key} className={range === x.key ? 'is-on' : ''} onClick={() => setRange(x.key)}>{x.label}</button>
          ))}
        </div>
      </div>
      <ErrorNote error={report.error} onRetry={report.reload} />
      {!r && !report.error && <div className="p-card"><div className="p-rows is-skeleton" /></div>}
      {r && (
        <div className={report.loading ? 'is-refreshing' : ''}>
          {r.months.map((m) => <Month key={m.month} m={m} open={opened.has(m.month)} onToggle={() => toggle(m.month)} />)}
          <p className="fine">Rates are set by the Owner only. Each client's month opens on the balance before its first billed day and closes on its last (today, for this month). Figures follow each client's own bill.</p>
        </div>
      )}
    </>
  );
}
