import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchStatement, HISTORY_DAYS, loadSession, signOut, SignedOut, startPayment } from '../lib/portal.js';

const REFRESH_MS = 30_000;
const PRESETS = [500, 1000, 2500];

export const money = (v, currency = 'USD') => {
  const n = Number(v) || 0;
  const s = Math.abs(n).toLocaleString('en-US', { style: 'currency', currency, minimumFractionDigits: 2 });
  return n < 0 ? `-${s}` : s;
};
export const tone = (v) => (Number(v) < 0 ? 'is-neg' : Number(v) > 0 ? 'is-pos' : '');
// "2026-10-23" is the customer's own day; read it as a calendar date, not a UTC instant.
export const dayLabel = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};
// The viewer's own time, with its zone name so it is never mistaken for another zone's.
export const clock = (iso) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });

// Calls charged on a day: replaced calls are not charged.
export const billable = (day) => day.billable_calls ?? day.calls - (day.replacements || 0);
// "125" or, with replacements, "125 − 2" as on the daily bill sheets.
export const callsLabel = (day) => (day.replacements
  ? `${day.calls.toLocaleString('en-US')} − ${day.replacements.toLocaleString('en-US')}`
  : day.calls.toLocaleString('en-US'));

// A call's time as its log gives it, without the day when the log writes that too ("2026-10-26 11:17:24" -> "11:17:24").
export const callTime = (call) => {
  const at = call.call_time || call.called_at; // to the second when the log was read with it
  return at.startsWith(`${call.date} `) ? at.slice(call.date.length + 1) : at;
};

// The day's bill: the Telegram picture's four lines, plus the price and what the calls came to.
export function Statement({ day, currency }) {
  const charged = billable(day);
  const rows = [
    ['Opening Balance', money(day.opening_balance, currency), tone(day.opening_balance)],
    [<>Total Calls{day.from_call_log && <small className="bill__from">From your call log</small>}</>, callsLabel(day), '', 'Total Calls'],
    ['Price per Call', money(day.price_per_call, currency), ''],
    ['Call Charges', charged ? `-${money(day.charges, currency)}` : money(0, currency), charged ? 'is-neg' : ''],
    ['Payment Received', Number(day.payment_received) ? `+${money(day.payment_received, currency)}` : money(0, currency), Number(day.payment_received) ? 'is-pos' : ''],
  ];
  return (
    <article className={`bill${day.is_today ? ' bill--today' : ''}`}>
      <header className="bill__head">
        <h3>{dayLabel(day.date)} <span>· Financial Overview</span></h3>
        {day.is_today && <span className="bill__live"><i aria-hidden="true" />Live</span>}
      </header>
      <table className="bill__table">
        {day.replacements > 0 && (
          <caption className="bill__note">{day.replacements} {day.replacements === 1 ? 'call was' : 'calls were'} replaced and {day.replacements === 1 ? 'has' : 'have'} not been charged ({charged.toLocaleString('en-US')} billable × {money(day.price_per_call, currency)}).</caption>
        )}
        <thead><tr><th scope="col">Metric</th><th scope="col">Amount</th></tr></thead>
        <tbody>
          {rows.map(([label, value, cls, key = label]) => (
            <tr key={key}><th scope="row">{label}</th><td className={cls}>{value}</td></tr>
          ))}
        </tbody>
        <tfoot>
          <tr><th scope="row">{day.is_today ? 'Balance Now' : 'Closing Balance'}</th><td className={tone(day.balance)}>{money(day.balance, currency)}</td></tr>
        </tfoot>
      </table>
    </article>
  );
}

// "−$1,505.00": the large balance uses a true minus sign, as on the billing mockup.
const bigMoney = (v, currency) => money(v, currency).replace(/^-/, '−');
// "America/New_York" -> "New York".
const zoneName = (tz) => tz.split('/').pop().replace(/_/g, ' ');

// The account at a glance: what is owed (or held in credit), the price, today's calls and the time zone the days are
// counted in.
export function BalanceCard({ data }) {
  const owes = Number(data.balance) < 0;
  const credit = Number(data.balance) > 0;
  const today = data.days.find((d) => d.is_today);
  return (
    <section className="acct acct--balance" aria-labelledby="balance-title">
      <p className="acct__label" id="balance-title">{owes ? 'Balance due' : 'Balance'}</p>
      <p className={`acct__amount ${tone(data.balance)}`}>{bigMoney(data.balance, data.currency)}</p>
      <p className="acct__note">
        {owes ? `Pay ${money(data.amount_due, data.currency)} to clear your balance.`
          : credit ? `${money(data.balance, data.currency)} in credit. Nothing to pay right now.`
            : 'Your balance is clear. Nothing to pay right now.'}
      </p>
      <dl className="acct__facts">
        <div><dt>Price</dt><dd>{money(data.price_per_call, data.currency)} / call</dd></div>
        <div><dt>Calls today</dt><dd>{today ? callsLabel(today) : '0'}</dd></div>
        <div><dt>Time zone</dt><dd>{zoneName(data.timezone)}</dd></div>
      </dl>
    </section>
  );
}

// Paying: an amount (the full balance, a preset or typed), then the customer's own USDT (TRC-20) address to send it to.
export function PayCard({ data, onPaid }) {
  const due = Number(data.amount_due);
  const [amount, setAmount] = useState(due > 0 ? data.amount_due : '');
  const [status, setStatus] = useState('idle'); // idle | sending | error
  const [error, setError] = useState('');
  const [details, setDetails] = useState(null); // where to send it, once Pay is pressed
  const valid = Number(amount) >= 1;

  const pay = async (e) => {
    e.preventDefault();
    if (!valid) return;
    setStatus('sending');
    setError('');
    try {
      setDetails(await startPayment(Number(amount).toFixed(2)));
      setStatus('idle');
      onPaid(); // keep the statement fresh; it also refreshes every 30 seconds
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  };

  return (
    <section className="acct acct--pay" aria-labelledby="pay-title">
      <h2 className="acct__title" id="pay-title">Make a payment</h2>
      {details ? <PayDetails details={details} currency={data.currency} onBack={() => setDetails(null)} /> : (
        <form className="acct__form" onSubmit={pay}>
          <label className="sr-only" htmlFor="pay-amount">Amount to pay in US dollars</label>
          <div className="wallet__amount">
            <span aria-hidden="true">$</span>
            <input id="pay-amount" type="number" inputMode="decimal" min="1" step="0.01" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="wallet__presets">
            {due > 0 && <button type="button" className={Number(amount) === due ? 'is-on' : ''} onClick={() => setAmount(data.amount_due)}>Full balance</button>}
            {PRESETS.map((p) => (
              <button key={p} type="button" className={Number(amount) === p ? 'is-on' : ''} onClick={() => setAmount(String(p))}>${p.toLocaleString('en-US')}</button>
            ))}
          </div>
          {status === 'error' && <p className="access-card__error" role="alert">{error}</p>}
          <button type="submit" className="btn btn--light acct__pay" disabled={!valid || status === 'sending'}>
            {status === 'sending' ? 'Preparing your deposit address…' : valid ? `Pay ${money(amount, data.currency)}` : 'Pay'}
          </button>
          <p className="acct__fine">Paid in USDT (TRC-20). Credited once confirmed on the blockchain.</p>
        </form>
      )}
    </section>
  );
}

// Where to send the payment: the customer's own TRC-20 address, as text and a QR code.
function PayDetails({ details, currency, onBack }) {
  const [copied, setCopied] = useState('');
  const copy = async (what, text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(''), 2000);
    } catch { /* clipboard blocked: both are on screen to type */ }
  };
  const usdt = Number(details.amount).toFixed(2);

  return (
    <div className="wallet__pay wallet__send" role="region" aria-label="Payment details">
      <p className="wallet__send-title">Amount to transfer: <b>{Number(usdt).toLocaleString('en-US', { minimumFractionDigits: 2 })} USDT</b> <span>({money(details.amount, currency)})</span></p>
      <div className="wallet__send-body">
        <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(details.qr_svg)}`} alt="QR code of your payment address" width="132" height="132" />
        <div>
          <p className="wallet__send-label">Your Deposit Address · {details.network}</p>
          <button type="button" className="wallet__address" onClick={() => copy('address', details.address)}>
            <code>{details.address}</code>
            <span>{copied === 'address' ? 'Copied' : 'Copy Address'}</span>
          </button>
          <button type="button" className="wallet__copy-amount" onClick={() => copy('amount', usdt)}>{copied === 'amount' ? 'Amount Copied' : 'Copy Amount'}</button>
        </div>
      </div>
      <ul className="wallet__send-rules">
        <li>Send only <b>USDT</b> on the <b>TRON (TRC-20)</b> network. Funds sent in any other currency or on any other network cannot be recovered.</li>
        <li>This deposit address is assigned exclusively to your account and may be used for all future payments.</li>
        <li>Your funds will be credited to your account once the transaction has been confirmed on the blockchain, typically within a few minutes.</li>
      </ul>
      <button type="button" className="btn btn--quiet btn--sm" onClick={onBack}>Change Amount</button>
    </div>
  );
}

const sum = (rows, k) => rows.reduce((t, r) => t + Number(r[k]), 0);

// The days the statement covers (the last five), newest first, with their total.
export function History({ days, currency }) {
  const rows = days;
  if (!rows.length) return null;
  // The total row reads like a day: all calls, minus those replaced.
  const total = { calls: rows.reduce((t, r) => t + r.calls, 0), replacements: rows.reduce((t, r) => t + (r.replacements || 0), 0) };
  const charged = billable(total);
  const paid = sum(rows, 'payment_received');

  return (
    <section className="billing__history" aria-labelledby="history-title">
      <div className="billing__history-head">
        <h2 id="history-title">Billing History</h2>
        <span className="billing__history-range">Last {rows.length} Days</span>
      </div>
      <div className="history" role="region" aria-label={`Daily bills for the last ${rows.length} days`} tabIndex={0}>
        <table className="history__table">
          <thead>
            <tr>
              <th scope="col">Date</th><th scope="col">Opening Balance</th><th scope="col">Calls</th>
              <th scope="col">Price</th><th scope="col">Call Charges</th><th scope="col">Payment Received</th><th scope="col">Balance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.date} className={d.is_today ? 'is-today' : ''}>
                <th scope="row">{dayLabel(d.date)}{d.is_today && <span className="bill__live"><i aria-hidden="true" />Live</span>}</th>
                <td className={tone(d.opening_balance)}>{money(d.opening_balance, currency)}</td>
                <td title={[d.from_call_log && 'From your call log', d.replacements && `${d.replacements} replaced, not charged`].filter(Boolean).join('. ') || undefined}>{callsLabel(d)}</td>
                <td>{money(d.price_per_call, currency)}</td>
                <td className={billable(d) ? 'is-neg' : ''}>{billable(d) ? `-${money(d.charges, currency)}` : money(0, currency)}</td>
                <td className={Number(d.payment_received) ? 'is-pos' : ''}>{Number(d.payment_received) ? `+${money(d.payment_received, currency)}` : money(0, currency)}</td>
                <td className={tone(d.balance)}><b>{money(d.balance, currency)}</b></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">{rows.length}-Day Total</th>
              <td />
              <td>{callsLabel(total)}</td>
              <td />
              <td className={charged ? 'is-neg' : ''}>{charged ? `-${money(sum(rows, 'charges'), currency)}` : money(0, currency)}</td>
              <td className={paid ? 'is-pos' : ''}>{paid ? `+${money(paid, currency)}` : money(0, currency)}</td>
              <td className={tone(rows[0].balance)}>{money(rows[0].balance, currency)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="billing__history-note">Statements for the last {HISTORY_DAYS} days. An entry such as “125 − 2” indicates 2 replaced calls, which are not charged. Each day's calls are counted from your call log once its Call Summary is uploaded, and the balances update with them; the logs are under Reports. To have a call replaced, send us its time and caller number in the chat.</p>
    </section>
  );
}

// The live statement, refreshed every 30 seconds while the tab is visible.
// `onSignedOut` runs when the session has ended (the caller sends them to log in).
export function useStatement(onSignedOut) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const timer = useRef();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fetchStatement());
      setError('');
    } catch (err) {
      if (err instanceof SignedOut) return onSignedOut();
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [onSignedOut]);

  useEffect(() => {
    if (!loadSession()?.access) return onSignedOut();
    load();
    timer.current = setInterval(() => document.visibilityState === 'visible' && load(), REFRESH_MS);
    const onShow = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onShow);
    return () => {
      clearInterval(timer.current);
      document.removeEventListener('visibilitychange', onShow);
    };
  }, [load, onSignedOut]);

  return { data, error, loading, load };
}

// The balance and Make a payment side by side, then the last three days, and the last five days of bills and
// payments (today is in Billing History, marked Live).
export function BillingSections({ data, onPaid }) {
  if (!data) {
    return <div className="billing__top" aria-hidden="true"><div className="acct is-skeleton" /><div className="acct is-skeleton" /></div>;
  }
  const past = data.days.filter((d) => !d.is_today).slice(0, 3);
  return (
    <>
      <div className="billing__top">
        <BalanceCard data={data} />
        <PayCard data={data} onPaid={onPaid} />
      </div>

      <section className="billing__days" aria-labelledby="days-title">
        <h2 id="days-title">Last {past.length} Days</h2>
        <div className="billing__grid">
          {past.map((d) => <Statement key={d.date} day={d} currency={data.currency} />)}
        </div>
      </section>

      <History days={data.days} currency={data.currency} />

      {data.replaced_calls?.length > 0 && (
        <section className="billing__payments billing__replaced" aria-labelledby="replaced-title">
          <div className="billing__history-head">
            <h2 id="replaced-title">Replaced Calls</h2>
            <span className="billing__history-range">Last {HISTORY_DAYS} Days</span>
          </div>
          <ul>
            {data.replaced_calls.map((c) => (
              <li key={`${c.date} ${c.called_at} ${c.caller} ${c.call_time} ${c.number_called}`}>
                <span>{dayLabel(c.date)} · {callTime(c)}<small>{[c.caller, c.number_called && `to ${c.number_called}`, c.duration, c.reason].filter(Boolean).join(' · ')}</small></span>
                <span className="billing__status is-completed">Replaced</span>
                <b>Not charged</b>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="billing__payments" aria-labelledby="payments-title">
        <div className="billing__history-head">
          <h2 id="payments-title">Payments</h2>
          <span className="billing__history-range">Last {HISTORY_DAYS} Days</span>
        </div>
        {data.payments.length ? (
          <ul>
            {data.payments.map((p) => (
              <li key={p.id}>
                <span>{dayLabel(p.date.slice(0, 10))}<small>{p.note || (p.method === 'manual' ? 'Recorded by CallsTalk' : 'USDT (TRC-20)')}</small></span>
                <span className={`billing__status is-${p.status}`}>{p.status}</span>
                <b className={p.status === 'completed' ? 'is-pos' : ''}>{money(p.amount, p.currency)}</b>
              </li>
            ))}
          </ul>
        ) : <p className="billing__empty">No payments in the last {HISTORY_DAYS} days.</p>}
      </section>
    </>
  );
}

const toLogin = () => window.location.replace('/login');

// The Buyer Dashboard at /dashboard, seen only after logging in: live wallet balance, today's bill,
// the last three days and every day since September.
export default function BillingPage() {
  const { data, error, loading, load } = useStatement(toLogin);
  const [email, setEmail] = useState('');
  useEffect(() => setEmail(loadSession()?.email || ''), []);

  const leave = () => {
    signOut();
    window.location.assign('/login');
  };

  return (
    <main className="billing">
      <div className="container">
        <div className="billing__head">
          <div>
            <p className="legal__crumb"><a href="/">Home</a> / Buyer Dashboard</p>
            <h1>{data ? data.customer : 'Buyer Dashboard'}</h1>
            <p className="billing__sub">
              <span className={`billing__pulse${loading ? ' is-busy' : ''}`} aria-hidden="true" />
              {data ? <>Live · updated {clock(data.as_of)}</> : 'Loading your bill…'}
              {email && <span className="billing__who">{email}</span>}
            </p>
          </div>
          <div className="billing__actions">
            <button type="button" className="btn btn--quiet btn--sm" onClick={load} disabled={loading}>Refresh</button>
            <button type="button" className="btn btn--quiet btn--sm" onClick={leave}>Log Out</button>
          </div>
        </div>

        {error && <p className="access-card__error billing__error" role="alert">{error}</p>}
        {(data || !error) && <BillingSections data={data} onPaid={load} />}
      </div>
    </main>
  );
}
