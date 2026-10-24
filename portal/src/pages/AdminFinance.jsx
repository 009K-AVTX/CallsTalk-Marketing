import { useEffect, useState } from 'react';
import { fetchFinance, listUserOptions, signedIn } from '../admin.js';
import { BarList, ColumnChart, compact, Legend, LineChart } from '../components/Charts.jsx';
import { DownloadMenu, period, Period } from '../components/Filters.jsx';
import Icon from '../components/Icons.jsx';
import { ErrorNote, PageHead } from '../components/Shell.jsx';
import { downloadCsv, downloadPdf } from '../exports.js';
import { dayLabel, money } from '../format.js';
import { Link } from '../router.jsx';
import useLoad from '../useLoad.js';

const PAYMENTS = 15;
const CUSTOMERS = 25;
const COLORS = { billed: 'var(--viz-1)', collected: 'var(--viz-2)', replaced: 'var(--viz-3)' };
// The same colours for the PDF, which has no CSS (portal.css --viz-1..3).
const HEX = { billed: '#9d70dd', collected: '#2fa8a0', replaced: '#c27f14' };

const n = (v) => Number(v) || 0;
const count = (v) => n(v).toLocaleString('en-US');
const usd = (v) => money(v);
const usdAxis = (v) => `$${compact(v)}`;
const signed = (v) => (n(v) > 0 ? `+${money(v)}` : money(v));
const tone = (v) => (n(v) < 0 ? 'is-neg' : n(v) > 0 ? 'is-pos' : '');
const plural = (k, word) => `${count(k)} ${word}${n(k) === 1 ? '' : 's'}`;

// Running totals: what the period had billed and collected by each day.
const running = (days, key) => {
  let sum = 0;
  return days.map((d) => (sum += n(d[key])));
};

// The ledger across the top: the period's opening balance, less what was billed, plus what came in.
function Statement({ totals }) {
  const cells = [
    { op: null, label: 'Opening Balance', value: money(totals.opening_balance), cls: tone(totals.opening_balance), sub: 'At the start of the period' },
    { op: '−', label: 'Billed', value: money(totals.charges), sub: `${plural(totals.billable_calls, 'call')} charged`, key: COLORS.billed },
    { op: '+', label: 'Collected', value: money(totals.received), sub: totals.collection_rate === null ? 'Nothing billed' : `${totals.collection_rate}% of billed`, key: COLORS.collected },
    { op: '=', label: 'Closing Balance', value: money(totals.closing_balance), cls: tone(totals.closing_balance), sub: n(totals.closing_balance) < 0 ? 'Owed to us' : 'In credit' },
  ];
  return (
    <section className="p-ledger" aria-label="The period in figures">
      {cells.map((c) => (
        <div key={c.label} className="p-ledger__cell">
          {c.op && <span className="p-ledger__op" aria-hidden="true">{c.op}</span>}
          <p className="p-ledger__label">{c.key && <i style={{ '--c': c.key }} aria-hidden="true" />}{c.label}</p>
          <p className={`p-ledger__value ${c.cls || ''}`}>{c.value}</p>
          <p className="p-ledger__sub">{c.sub}</p>
        </div>
      ))}
    </section>
  );
}

// A card's own Chart | Table switch: every chart's numbers can also be read as a table.
function ViewSwitch({ value, onChange, label }) {
  return (
    <div className="p-ranges p-ranges--sm" role="radiogroup" aria-label={`${label}: show as`}>
      {['chart', 'table'].map((v) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} className={value === v ? 'is-on' : ''} onClick={() => onChange(v)}>
          {v === 'chart' ? 'Chart' : 'Table'}
        </button>
      ))}
    </div>
  );
}

function DailyTable({ days, columns }) {
  const shown = days.filter((d) => columns.some((c) => n(d[c.key])));
  return (
    <div className="p-tablewrap p-tablewrap--inset">
      <table className="p-table">
        <thead><tr><th scope="col">Day</th>{columns.map((c) => <th key={c.key} scope="col" className="is-num">{c.label}</th>)}</tr></thead>
        <tbody>
          {[...shown].reverse().map((d) => (
            <tr key={d.date}><th scope="row">{dayLabel(d.date)}</th>{columns.map((c) => <td key={c.key} className="is-num">{c.format(d[c.key])}</td>)}</tr>
          ))}
        </tbody>
      </table>
      {!shown.length && <p className="p-empty">Nothing in this period.</p>}
    </div>
  );
}

const fileStem = (r, customerName) => `callstalk-finance-${customerName ? `${customerName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-` : ''}${r.from}-to-${r.to}`;

export default function AdminFinance({ onSignedOut }) {
  const [range, setRange] = useState(() => period('30'));
  const [customer, setCustomer] = useState('');
  const [views, setViews] = useState({ money: 'chart', calls: 'chart' });
  // Payments: a page of PAYMENTS from the server. The customer table: CUSTOMERS rows at a time on screen.
  const [paid, setPaid] = useState(0);
  const [rowsFrom, setRowsFrom] = useState(0);
  useEffect(() => {
    setPaid(0);
    setRowsFrom(0);
  }, [range.from, range.to, customer]);
  const people = useLoad(signedIn(onSignedOut, listUserOptions), []);
  const report = useLoad(signedIn(onSignedOut, () => (range.invalid
    ? Promise.reject(new Error('Choose a start date on or before the end date.'))
    : fetchFinance({ from: range.from, to: range.to, customer, payments_offset: paid, payments_limit: PAYMENTS }))), [range.from, range.to, range.invalid, customer, paid]);

  const r = report.data;
  const customers = (people.data || []).filter((u) => u.role === 'customer');
  const one = customers.find((c) => c.id === customer);
  const name = one ? one.company || one.name || one.email : '';
  const days = r?.days || [];
  const labels = days.map((d) => d.date);
  const span = r ? `${dayLabel(r.from)} to ${dayLabel(r.to)}` : '';
  const owed = (r?.customers || []).filter((c) => n(c.amount_due_now) > 0);

  // Downloads: asked of the server again with export=..., so the download is in the audit log.
  const fresh = (format) => fetchFinance({ from: r.from, to: r.to, customer }, format);
  const csvByCustomer = async () => {
    const f = await fresh('csv');
    downloadCsv(`${fileStem(f, name)}-by-customer.csv`,
      ['Customer', 'Login', 'Price per Call', 'Calls', 'Replaced', 'Charged Calls', 'Opening Balance', 'Billed', 'Collected', 'Pending', 'Closing Balance', 'Owed Now'],
      f.customers.map((c) => [c.customer, c.email, n(c.price_per_call), c.calls, c.replacements, c.billable_calls, n(c.opening_balance), n(c.charges), n(c.received), n(c.pending), n(c.closing_balance), n(c.amount_due_now)]));
  };
  const csvDaily = async () => {
    const f = await fresh('csv');
    downloadCsv(`${fileStem(f, name)}-daily.csv`, ['Day', 'Calls', 'Replaced', 'Charged Calls', 'Billed', 'Collected'],
      f.days.map((d) => [d.date, d.calls, d.replacements, d.billable_calls, n(d.charges), n(d.received)]));
  };
  const csvPayments = async () => {
    const f = await fresh('csv');
    downloadCsv(`${fileStem(f, name)}-payments.csv`, ['Day', 'Customer', 'Amount', 'Status', 'Method', 'Note', 'Reference'],
      f.payments.map((p) => [p.date, p.customer, n(p.amount), p.status, p.method, p.note, p.reference]));
  };
  const pdf = async () => {
    const f = await fresh('pdf');
    const t = f.totals;
    await downloadPdf({
      filename: `${fileStem(f, name)}.pdf`,
      title: name ? `Finance Report: ${name}` : 'Finance Report',
      subtitle: `${dayLabel(f.from)} to ${dayLabel(f.to)} · ${plural(t.customers, 'customer')} · days are each customer's billing days`,
      figures: [
        ['Opening Balance', money(t.opening_balance)], ['Billed', money(t.charges)], ['Collected', money(t.received)],
        ['Closing Balance', money(t.closing_balance)], ['Owed Now', money(t.amount_due_now)], ['Charged Calls', count(t.billable_calls)],
      ],
      chart: {
        title: 'Billed and Collected per Day',
        labels: f.days.map((d) => d.date),
        series: [
          { label: 'Billed', color: HEX.billed, values: f.days.map((d) => n(d.charges)) },
          { label: 'Collected', color: HEX.collected, values: f.days.map((d) => n(d.received)) },
        ],
        format: usdAxis,
      },
      tables: [
        {
          title: 'By Customer',
          head: ['Customer', 'Price', 'Calls', 'Replaced', 'Opening', 'Billed', 'Collected', 'Pending', 'Closing', 'Owed Now'],
          body: f.customers.map((c) => [c.customer, money(c.price_per_call), count(c.calls), count(c.replacements), money(c.opening_balance), money(c.charges), money(c.received), money(c.pending), money(c.closing_balance), money(c.amount_due_now)]),
          foot: ['Total', '', count(t.calls), count(t.replacements), money(t.opening_balance), money(t.charges), money(t.received), money(t.pending), money(t.closing_balance), money(t.amount_due_now)],
          right: [1, 2, 3, 4, 5, 6, 7, 8, 9],
          empty: 'No customers with billing in this period.',
        },
        {
          title: 'Payments',
          head: ['Day', 'Customer', 'Method', 'Note', 'Status', 'Amount'],
          body: f.payments.map((p) => [dayLabel(p.date), p.customer, p.method, [p.note, p.reference].filter(Boolean).join(' · '), p.status, money(p.amount)]),
          right: [5],
          empty: 'No payments in this period.',
        },
        {
          title: 'Per Day',
          head: ['Day', 'Calls', 'Replaced', 'Charged Calls', 'Billed', 'Collected'],
          body: f.days.filter((d) => d.calls || n(d.received)).reverse().map((d) => [dayLabel(d.date), count(d.calls), count(d.replacements), count(d.billable_calls), money(d.charges), money(d.received)]),
          right: [1, 2, 3, 4, 5],
        },
      ],
    });
  };

  return (
    <>
      <PageHead title="Finance" sub={r ? `${span} · ${one ? name : plural(r.totals.customers, 'customer')}` : 'Loading…'}>
        <button type="button" className="btn btn--quiet btn--sm" onClick={report.reload}><Icon name="refresh" />Refresh</button>
        <DownloadMenu disabled={!r} options={[
          { format: 'PDF', label: 'Finance Report', hint: 'Figures, chart and every table', run: pdf },
          { format: 'CSV', label: 'By Customer', hint: 'One row per customer', run: csvByCustomer },
          { format: 'CSV', label: 'Per Day', hint: 'Calls, billed and collected', run: csvDaily },
          { format: 'CSV', label: 'Payments', hint: 'Every payment in the period', run: csvPayments },
        ]} />
      </PageHead>

      <div className="p-filters">
        <Period value={range} onChange={setRange} />
        <label className="p-select">
          <span className="sr-only">Customer</span>
          <select value={customer} onChange={(e) => setCustomer(e.target.value)}>
            <option value="">All Customers</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.company || c.name || c.email}</option>)}
          </select>
        </label>
      </div>
      <ErrorNote error={report.error} onRetry={range.invalid ? null : report.reload} />

      {!r && !report.error && <div className="p-card"><div className="p-rows is-skeleton" /></div>}
      {r && (
        <div className={report.loading ? 'is-refreshing' : ''}>
          <Statement totals={r.totals} />
          <p className="p-ledger__notes">
            <span><b>{money(r.totals.amount_due_now)}</b> owed to us now</span>
            {n(r.totals.credit_now) > 0 && <span><b>{money(r.totals.credit_now)}</b> held in credit</span>}
            {n(r.totals.pending) > 0 && <span><b>{money(r.totals.pending)}</b> in payments still pending</span>}
            {r.totals.average_price && <span>Average <b>{money(r.totals.average_price)}</b> per charged call</span>}
            {n(r.totals.replacements) > 0 && <span><b>{count(r.totals.replacements)}</b> calls replaced, not charged</span>}
          </p>

          <div className="p-grid p-grid--wide">
            <section className="p-card">
              <header className="p-card__head">
                <div><h2>Billed and Collected</h2><p>Running totals across the period. The gap between them is what went unpaid.</p></div>
                <ViewSwitch label="Billed and Collected" value={views.money} onChange={(v) => setViews({ ...views, money: v })} />
              </header>
              {views.money === 'chart' ? (
                <>
                  <Legend items={[
                    { label: 'Billed', color: COLORS.billed, kind: 'line', value: money(r.totals.charges) },
                    { label: 'Collected', color: COLORS.collected, kind: 'line', value: money(r.totals.received) },
                  ]} />
                  <LineChart labels={labels} format={usdAxis} tipFormat={usd} label={`Billed and collected, running totals, ${span}`}
                    series={[
                      { key: 'billed', label: 'Billed so far', color: COLORS.billed, values: running(days, 'charges') },
                      { key: 'collected', label: 'Collected so far', color: COLORS.collected, values: running(days, 'received') },
                    ]}
                    tipExtra={(i) => `That day: ${money(days[i].charges)} billed, ${money(days[i].received)} collected`} />
                </>
              ) : (
                <DailyTable days={days} columns={[
                  { key: 'charges', label: 'Billed', format: usd },
                  { key: 'received', label: 'Collected', format: usd },
                ]} />
              )}
            </section>

            <section className="p-card">
              <header className="p-card__head">
                <div><h2>Calls per Day</h2><p>Charged calls, with the replaced ones on top. Replaced calls are not billed.</p></div>
                <ViewSwitch label="Calls per Day" value={views.calls} onChange={(v) => setViews({ ...views, calls: v })} />
              </header>
              {views.calls === 'chart' ? (
                <>
                  <Legend items={[
                    { label: 'Charged', color: COLORS.billed, value: count(r.totals.billable_calls) },
                    { label: 'Replaced', color: COLORS.replaced, value: count(r.totals.replacements) },
                  ]} />
                  <ColumnChart labels={labels} label={`Calls per day, ${span}`} totalLabel="All calls" tipFormat={count}
                    series={[
                      { key: 'charged', label: 'Charged', color: COLORS.billed, values: days.map((d) => d.billable_calls) },
                      { key: 'replaced', label: 'Replaced', color: COLORS.replaced, values: days.map((d) => d.replacements) },
                    ]} />
                </>
              ) : (
                <DailyTable days={days} columns={[
                  { key: 'calls', label: 'Calls', format: count },
                  { key: 'replacements', label: 'Replaced', format: count },
                  { key: 'billable_calls', label: 'Charged', format: count },
                ]} />
              )}
            </section>
          </div>

          <div className={`p-grid${one ? ' p-grid--single' : ''}`}>
            {!one && (
              <section className="p-card">
                <header className="p-card__head"><div><h2>Owed Now</h2><p>Today's balance due, by customer.</p></div></header>
                <BarList format={usd} empty="No customer owes anything right now."
                  items={owed.slice(0, 8).map((c) => ({ key: c.id, label: c.customer, sub: `${money(c.price_per_call)} per call`, value: n(c.amount_due_now) }))} />
                {owed.length > 8 && <p className="p-admin__note">And {owed.length - 8} more in the table below.</p>}
              </section>
            )}
            <section className="p-card p-card--flush">
              <header className="p-card__head"><div><h2>Payments</h2><p>{r.payments_total ? `${plural(r.payments_total, 'payment')} in the period, newest first.` : 'None in the period.'}</p></div></header>
              {r.payments.length ? (
                <ul className="p-admin__payments p-admin__payments--flush">
                  {r.payments.map((p) => (
                    <li key={p.id}>
                      <span>{one ? dayLabel(p.date) : <Link to={`/admin/users/${p.customer_id}`}>{p.customer}</Link>}<small>{[one ? '' : dayLabel(p.date), p.method, p.note].filter(Boolean).join(' · ')}</small></span>
                      <span className={`billing__status is-${p.status}`}>{p.status}</span>
                      <b className={p.status === 'completed' ? 'is-pos' : ''}>{money(p.amount, p.currency)}</b>
                    </li>
                  ))}
                </ul>
              ) : <p className="p-empty">No payments were recorded or received.</p>}
              {r.payments_total > PAYMENTS && (
                <div className="p-pager">
                  <span>{paid + 1}–{paid + r.payments.length} of {r.payments_total}</span>
                  <div>
                    <button type="button" className="btn btn--quiet btn--sm" disabled={!paid || report.loading} onClick={() => setPaid(Math.max(0, paid - PAYMENTS))}>Newer</button>
                    <button type="button" className="btn btn--quiet btn--sm" disabled={paid + PAYMENTS >= r.payments_total || report.loading} onClick={() => setPaid(paid + PAYMENTS)}>Older</button>
                  </div>
                </div>
              )}
            </section>
          </div>

          <section className="p-card p-card--flush">
            <header className="p-card__head"><div><h2>By Customer</h2><p>Who owes most comes first. Open a customer to enter calls or payments.</p></div></header>
            <div className="p-tablewrap">
              <table className="p-table p-table--figures">
                <thead>
                  <tr>
                    <th scope="col">Customer</th><th scope="col" className="is-num">Calls</th><th scope="col" className="is-num">Opening</th>
                    <th scope="col" className="is-num">Billed</th><th scope="col" className="is-num">Collected</th><th scope="col" className="is-num">Closing</th>
                    <th scope="col" className="is-num">Owed Now</th>
                  </tr>
                </thead>
                <tbody>
                  {r.customers.slice(rowsFrom, rowsFrom + CUSTOMERS).map((c) => (
                    <tr key={c.id}>
                      <th scope="row"><Link to={`/admin/users/${c.id}`}>{c.customer}</Link><small className="p-up__file">{money(c.price_per_call)} per call{c.status === 'disabled' ? ' · turned off' : ''}</small></th>
                      <td className="is-num" title={c.replacements ? `${c.replacements} replaced, not charged` : undefined}>{count(c.billable_calls)}{c.replacements ? <small className="p-muted"> +{count(c.replacements)}</small> : null}</td>
                      <td className={`is-num ${tone(c.opening_balance)}`}>{money(c.opening_balance)}</td>
                      <td className="is-num">{money(c.charges)}</td>
                      <td className="is-num">{money(c.received)}</td>
                      <td className={`is-num ${tone(c.closing_balance)}`}>{money(c.closing_balance)}</td>
                      <td className="is-num"><b className={n(c.amount_due_now) ? 'is-neg' : ''}>{money(c.amount_due_now)}</b></td>
                    </tr>
                  ))}
                </tbody>
                {r.customers.length > 1 && (
                  <tfoot>
                    <tr>
                      <th scope="row">All Customers</th><td className="is-num">{count(r.totals.billable_calls)}</td>
                      <td className={`is-num ${tone(r.totals.opening_balance)}`}>{money(r.totals.opening_balance)}</td>
                      <td className="is-num">{money(r.totals.charges)}</td><td className="is-num">{money(r.totals.received)}</td>
                      <td className={`is-num ${tone(r.totals.closing_balance)}`}>{money(r.totals.closing_balance)}</td>
                      <td className="is-num"><b>{money(r.totals.amount_due_now)}</b></td>
                    </tr>
                  </tfoot>
                )}
              </table>
              {!r.customers.length && <p className="p-empty">No customers have billing set up yet. Open a customer under Logins to set their terms.</p>}
            </div>
            {r.customers.length > CUSTOMERS && (
              <div className="p-pager">
                <span>{rowsFrom + 1}–{Math.min(rowsFrom + CUSTOMERS, r.customers.length)} of {r.customers.length} customers (totals are for all)</span>
                <div>
                  <button type="button" className="btn btn--quiet btn--sm" disabled={!rowsFrom} onClick={() => setRowsFrom(Math.max(0, rowsFrom - CUSTOMERS))}>Previous</button>
                  <button type="button" className="btn btn--quiet btn--sm" disabled={rowsFrom + CUSTOMERS >= r.customers.length} onClick={() => setRowsFrom(rowsFrom + CUSTOMERS)}>Next</button>
                </div>
              </div>
            )}
            <p className="p-admin__note p-card__foot">Net for the period: <b className={tone(r.totals.net)}>{signed(r.totals.net)}</b> (collected less billed).</p>
          </section>
        </div>
      )}
    </>
  );
}
