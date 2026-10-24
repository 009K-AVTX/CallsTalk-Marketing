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
export const clock = (iso) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });

// The day's bill: the Telegram picture's four lines, plus the price and what the calls came to.
export function Statement({ day, currency }) {
  const rows = [
    ['Opening Balance', money(day.opening_balance, currency), tone(day.opening_balance)],
    ['Total Calls', day.calls.toLocaleString('en-US'), ''],
    ['Price per Call', money(day.price_per_call, currency), ''],
    ['Call Charges', day.calls ? `-${money(day.charges, currency)}` : money(0, currency), day.calls ? 'is-neg' : ''],
    ['Payment Received', Number(day.payment_received) ? `+${money(day.payment_received, currency)}` : money(0, currency), Number(day.payment_received) ? 'is-pos' : ''],
  ];
  return (
    <article className={`bill${day.is_today ? ' bill--today' : ''}`}>
      <header className="bill__head">
        <h3>{dayLabel(day.date)} <span>· Financial Overview</span></h3>
        {day.is_today && <span className="bill__live"><i aria-hidden="true" />Live</span>}
      </header>
      <table className="bill__table">
        <thead><tr><th scope="col">Metric</th><th scope="col">Amount</th></tr></thead>
        <tbody>
          {rows.map(([label, value, cls]) => (
            <tr key={label}><th scope="row">{label}</th><td className={cls}>{value}</td></tr>
          ))}
        </tbody>
        <tfoot>
          <tr><th scope="row">{day.is_today ? 'Balance Now' : 'Closing Balance'}</th><td className={tone(day.balance)}>{money(day.balance, currency)}</td></tr>
        </tfoot>
      </table>
    </article>
  );
}

export function Wallet({ data, onPaid }) {
  const due = Number(data.amount_due);
  const [amount, setAmount] = useState(due > 0 ? data.amount_due : '');
  const [status, setStatus] = useState('idle'); // idle | sending | error
  const [error, setError] = useState('');
  const owes = Number(data.balance) < 0;
  const valid = Number(amount) >= 1;

  const [details, setDetails] = useState(null); // where to send it, once Pay is pressed

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
    <section className="wallet" aria-labelledby="wallet-title">
      <div className="wallet__top">
        <p className="wallet__label" id="wallet-title"><WalletIcon />Wallet Balance</p>
        <span className={`wallet__state ${owes ? 'is-due' : 'is-ok'}`}>{owes ? 'Payment Due' : 'In Credit'}</span>
      </div>
      <p className={`wallet__balance ${tone(data.balance)}`}>{money(data.balance, data.currency)}</p>
      <p className="wallet__note">
        {owes
          ? <>Pay <b>{money(data.amount_due, data.currency)}</b> to clear your balance. It goes down by {money(data.price_per_call, data.currency)} with every call.</>
          : <>Nothing to pay right now. Each call costs {money(data.price_per_call, data.currency)} and comes off this balance.</>}
      </p>
      <dl className="wallet__facts">
        <div><dt>Your Price</dt><dd>{money(data.price_per_call, data.currency)} / call</dd></div>
        <div><dt>Days Counted In</dt><dd>{data.timezone.replace(/_/g, ' ')}</dd></div>
      </dl>

      {details ? <PayDetails details={details} currency={data.currency} onBack={() => setDetails(null)} /> : (
      <form className="wallet__pay" onSubmit={pay}>
        <label htmlFor="pay-amount">Pay for Your Calls</label>
        <div className="wallet__amount">
          <span aria-hidden="true">$</span>
          <input id="pay-amount" type="number" inputMode="decimal" min="1" step="0.01" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="wallet__presets">
          {due > 0 && <button type="button" className={Number(amount) === due ? 'is-on' : ''} onClick={() => setAmount(data.amount_due)}>Full Balance</button>}
          {PRESETS.map((p) => (
            <button key={p} type="button" className={Number(amount) === p ? 'is-on' : ''} onClick={() => setAmount(String(p))}>${p.toLocaleString('en-US')}</button>
          ))}
        </div>
        <p className="wallet__method"><span aria-hidden="true">₮</span>USDT on the TRON network (TRC-20)</p>
        {status === 'error' && <p className="access-card__error" role="alert">{error}</p>}
        <button type="submit" className="btn btn--light" disabled={!valid || status === 'sending'}>
          {status === 'sending' ? 'Getting Your Address…' : valid ? `Pay ${money(amount, data.currency)}` : 'Pay Now'}
        </button>
        <p className="wallet__secure">You send USDT from your own wallet. It shows here once it is confirmed on the blockchain.</p>
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
      <p className="wallet__send-title">Send <b>{usdt} USDT</b> <span>({money(details.amount, currency)})</span></p>
      <div className="wallet__send-body">
        <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(details.qr_svg)}`} alt="QR code of your payment address" width="132" height="132" />
        <div>
          <p className="wallet__send-label">Your payment address · {details.network}</p>
          <button type="button" className="wallet__address" onClick={() => copy('address', details.address)}>
            <code>{details.address}</code>
            <span>{copied === 'address' ? 'Copied' : 'Copy'}</span>
          </button>
          <button type="button" className="wallet__copy-amount" onClick={() => copy('amount', usdt)}>{copied === 'amount' ? 'Amount copied' : 'Copy amount'}</button>
        </div>
      </div>
      <ul className="wallet__send-rules">
        <li>Send <b>USDT</b> on the <b>TRON (TRC-20)</b> network only. Other coins or networks cannot be recovered.</li>
        <li>This address is yours alone and stays the same, so you can use it for every payment.</li>
        <li>Your payment shows under Payments once it is confirmed, usually within a few minutes.</li>
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
  const calls = rows.reduce((t, r) => t + r.calls, 0);
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
                <td>{d.calls.toLocaleString('en-US')}</td>
                <td>{money(d.price_per_call, currency)}</td>
                <td className={d.calls ? 'is-neg' : ''}>{d.calls ? `-${money(d.charges, currency)}` : money(0, currency)}</td>
                <td className={Number(d.payment_received) ? 'is-pos' : ''}>{Number(d.payment_received) ? `+${money(d.payment_received, currency)}` : money(0, currency)}</td>
                <td className={tone(d.balance)}><b>{money(d.balance, currency)}</b></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">{rows.length}-Day Total</th>
              <td />
              <td>{calls.toLocaleString('en-US')}</td>
              <td />
              <td className={calls ? 'is-neg' : ''}>{calls ? `-${money(sum(rows, 'charges'), currency)}` : money(0, currency)}</td>
              <td className={paid ? 'is-pos' : ''}>{paid ? `+${money(paid, currency)}` : money(0, currency)}</td>
              <td className={tone(rows[0].balance)}>{money(rows[0].balance, currency)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="billing__history-note">Your bills for the last {HISTORY_DAYS} days. For earlier days, see the billing reports from our team under Reports.</p>
    </section>
  );
}

function WalletIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3" /><rect x="4" y="8" width="16" height="11" rx="2.5" /><circle cx="16" cy="13.5" r="1.2" />
    </svg>
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

// Wallet and today, the last three days, and the last five days of bills and payments.
export function BillingSections({ data, onPaid }) {
  if (!data) {
    return <div className="billing__top" aria-hidden="true"><div className="wallet is-skeleton" /><div className="bill is-skeleton" /></div>;
  }
  const today = data.days.find((d) => d.is_today);
  const past = data.days.filter((d) => !d.is_today).slice(0, 3);
  return (
    <>
      <div className="billing__top">
        <Wallet data={data} onPaid={onPaid} />
        {today && <Statement day={today} currency={data.currency} />}
      </div>

      <section className="billing__days" aria-labelledby="days-title">
        <h2 id="days-title">Last {past.length} Days</h2>
        <div className="billing__grid">
          {past.map((d) => <Statement key={d.date} day={d} currency={data.currency} />)}
        </div>
      </section>

      <History days={data.days} currency={data.currency} />

      <section className="billing__payments" aria-labelledby="payments-title">
        <div className="billing__history-head">
          <h2 id="payments-title">Payments</h2>
          <span className="billing__history-range">Last {HISTORY_DAYS} Days</span>
        </div>
        {data.payments.length ? (
          <ul>
            {data.payments.map((p) => (
              <li key={p.id}>
                <span>{dayLabel(p.date.slice(0, 10))}<small>{p.note || (p.provider === 'manual' ? 'Recorded by our team' : 'USDT (TRC-20)')}</small></span>
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
