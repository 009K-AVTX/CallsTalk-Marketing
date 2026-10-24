import { useEffect, useState } from 'react';
import { loadSession } from '../../../src/lib/portal.js';
import {
  addPayment, clearDay, fetchBilling, listUsers, removePayment, removeUser, saveDay, saveTerms, sendLink, signedIn, TIME_ZONES, updateUser,
} from '../admin.js';
import Icon from '../components/Icons.jsx';
import { ErrorNote, PageHead } from '../components/Shell.jsx';
import { dayLabel, money, today } from '../format.js';
import { Link, navigate } from '../router.jsx';
import useLoad from '../useLoad.js';
import { LinkResult, ROLE_LABEL, StatePill, when } from './AdminUsers.jsx';
import { Avatar } from '../avatar.jsx';

// A form's own state: what was typed, sending, and the last error or confirmation.
function useForm(initial) {
  const [form, setForm] = useState(initial);
  const [state, setState] = useState({ status: 'idle', message: '' });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const run = async (e, action, done) => {
    e?.preventDefault();
    setState({ status: 'sending', message: '' });
    try {
      const result = await action();
      setState({ status: 'done', message: done || '' });
      return result;
    } catch (err) {
      setState({ status: 'error', message: err.message });
      return null;
    }
  };
  return { form, setForm, set, run, ...state };
}

function Note({ f }) {
  if (f.status === 'error') return <p className="access-card__error" role="alert">{f.message}</p>;
  if (f.status === 'done' && f.message) return <p className="p-ok" role="status"><Icon name="check" />{f.message}</p>;
  return null;
}

function Profile({ user, onSaved }) {
  const f = useForm({ name: user.name, company: user.company, role: user.role });
  const self = user.email === loadSession()?.email;
  return (
    <form className="p-card p-form" onSubmit={(e) => f.run(e, async () => onSaved((await updateUser(user.id, f.form)).user), 'Saved.')}>
      <header className="p-card__head"><div><h2>Details</h2><p>Login ID: <b>{user.email}</b></p></div></header>
      <label>Full Name<input required value={f.form.name} onChange={f.set('name')} maxLength={100} /></label>
      <label>Company<input value={f.form.company} onChange={f.set('company')} maxLength={120} /></label>
      <label>Role
        <select value={f.form.role} onChange={f.set('role')} disabled={self}>
          <option value="customer">Customer</option>
          <option value="staff">Staff (report uploads only)</option>
          <option value="admin">Admin</option>
        </select>
      </label>
      <Note f={f} />
      <button type="submit" className="btn btn--light btn--sm" disabled={f.status === 'sending'}>{f.status === 'sending' ? 'Saving…' : 'Save Details'}</button>
    </form>
  );
}

function Access({ user, onSaved }) {
  const f = useForm({});
  const [link, setLink] = useState(null);
  const self = user.email === loadSession()?.email;
  const setUp = Boolean(user.activated_at) && user.status !== 'invited';

  const newLink = (e) => {
    if (setUp && !window.confirm(`Reset ${user.email}? Their password and authenticator app stop working, and they are signed out until they use the new link.`)) return;
    f.run(e, async () => {
      const result = await sendLink(user.id);
      setLink(result);
      onSaved();
    });
  };
  const toggle = (e) => {
    const off = user.status !== 'disabled';
    if (off && !window.confirm(`Turn off ${user.email}? They are signed out and cannot log in until you turn the login back on.`)) return;
    f.run(e, async () => onSaved((await updateUser(user.id, { status: off ? 'disabled' : 'active' })).user), off ? 'Login turned off.' : 'Login turned back on.');
  };
  const remove = (e) => {
    if (!window.confirm(`Delete ${user.email}? This also deletes their billing, payments and reports, and cannot be undone.`)) return;
    f.run(e, async () => {
      await removeUser(user.id);
      navigate('/admin', { replace: true });
    });
  };

  return (
    <section className="p-card">
      <header className="p-card__head"><div><h2>Access</h2><p>Logins need a password and a code from an authenticator app.</p></div><StatePill user={user} /></header>
      <dl className="p-facts">
        <div><dt>Created</dt><dd>{when(user.created_at)}</dd></div>
        <div><dt>Set Up</dt><dd>{when(user.activated_at)}</dd></div>
        <div><dt>Last Log In</dt><dd>{when(user.last_login_at)}</dd></div>
        <div><dt>Setup Link</dt><dd>{user.invite_expires_at ? `Valid until ${when(user.invite_expires_at)}` : '—'}</dd></div>
      </dl>
      {self ? <p className="p-admin__note">This is your own login. Another admin can reset or turn it off.</p> : (
        <div className="p-admin__actions">
          {user.status !== 'disabled' && (
            <button type="button" className="btn btn--light btn--sm" onClick={newLink} disabled={f.status === 'sending'}>
              <Icon name="link" />{setUp ? 'Reset Login and Send Link' : 'Send a New Setup Link'}
            </button>
          )}
          <button type="button" className="btn btn--quiet btn--sm" onClick={toggle} disabled={f.status === 'sending'}>{user.status === 'disabled' ? 'Turn Login Back On' : 'Turn Login Off'}</button>
          <button type="button" className="btn btn--quiet btn--sm p-danger" onClick={remove} disabled={f.status === 'sending'}><Icon name="close" />Delete</button>
        </div>
      )}
      <Note f={f} />
      {link && <LinkResult result={link} email={user.email} />}
    </section>
  );
}

function Terms({ id, account, onSaved }) {
  const f = useForm({
    price_per_call: account?.price_per_call ?? '', opening_balance: account?.opening_balance ?? '0',
    start_date: account?.start_date ?? today(), timezone: account?.timezone ?? TIME_ZONES[0],
  });
  return (
    <form className="p-card p-form" onSubmit={(e) => f.run(e, async () => onSaved(await saveTerms(id, f.form)), 'Billing terms saved.')}>
      <header className="p-card__head"><div><h2>Billing Terms</h2><p>A new price applies to days entered from now on; past days keep theirs.</p></div></header>
      <div className="p-form__row">
        <label>Price per Call ($)<input required type="number" min="0" step="0.01" value={f.form.price_per_call} onChange={f.set('price_per_call')} /></label>
        <label><span>Opening Balance ($) <i className="p-optional">on the start date</i></span><input required type="number" step="0.01" value={f.form.opening_balance} onChange={f.set('opening_balance')} /></label>
      </div>
      <div className="p-form__row">
        <label>Billing Starts<input required type="date" value={f.form.start_date} max={today()} onChange={f.set('start_date')} /></label>
        <label>Days Counted In<select value={f.form.timezone} onChange={f.set('timezone')}>{[...new Set([f.form.timezone, ...TIME_ZONES])].map((z) => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}</select></label>
      </div>
      <Note f={f} />
      <button type="submit" className="btn btn--light btn--sm" disabled={f.status === 'sending'}>{f.status === 'sending' ? 'Saving…' : account ? 'Save Terms' : 'Set Up Billing'}</button>
    </form>
  );
}

function Calls({ id, account, picked, onSaved }) {
  const f = useForm({ date: today(), calls: '', price: '' });
  useEffect(() => { if (picked) f.setForm({ date: picked.date, calls: String(picked.calls), price: '' }); }, [picked]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <form className="p-card p-form p-admin__calls" onSubmit={(e) => f.run(e, async () => onSaved(await saveDay(id, f.form.date, f.form.calls, f.form.price)), `Calls saved for ${dayLabel(f.form.date)}.`)}>
      <header className="p-card__head"><div><h2>Billable Calls</h2><p>The day's total. Entering a day again replaces it. Pick a day in the table to change it.</p></div></header>
      <div className="p-form__row">
        <label>Day<input required type="date" value={f.form.date} min={account.start_date} max={today()} onChange={f.set('date')} /></label>
        <label>Calls<input required type="number" min="0" step="1" value={f.form.calls} onChange={f.set('calls')} placeholder="0" /></label>
      </div>
      <label><span>Price per Call ($) <i className="p-optional">optional, default {money(account.price_per_call)}</i></span><input type="number" min="0" step="0.01" value={f.form.price} onChange={f.set('price')} /></label>
      <Note f={f} />
      <div className="p-admin__actions">
        <button type="submit" className="btn btn--light btn--sm" disabled={f.status === 'sending'}>{f.status === 'sending' ? 'Saving…' : 'Save Calls'}</button>
        <button type="button" className="btn btn--quiet btn--sm" disabled={f.status === 'sending'} onClick={(e) => f.run(e, async () => onSaved(await clearDay(id, f.form.date)), `Calls cleared for ${dayLabel(f.form.date)}.`)}>Clear This Day</button>
      </div>
    </form>
  );
}

function Payment({ id, account, onSaved }) {
  const blank = { amount: '', date: today(), note: '', reference: '', status: 'completed' };
  const f = useForm(blank);
  const submit = (e) => f.run(e, async () => {
    const result = await addPayment(id, f.form);
    f.setForm(blank);
    onSaved(result);
  }, 'Payment recorded.');
  return (
    <form className="p-card p-form" onSubmit={submit}>
      <header className="p-card__head"><div><h2>Record a Payment</h2><p>Completed payments come off what the customer owes on that day.</p></div></header>
      <div className="p-form__row">
        <label>Amount ($)<input required type="number" min="0.01" step="0.01" value={f.form.amount} onChange={f.set('amount')} /></label>
        <label>Day Received<input required type="date" value={f.form.date} min={account.start_date} max={today()} onChange={f.set('date')} /></label>
      </div>
      <div className="p-form__row">
        <label><span>Shown to Customer <i className="p-optional">optional</i></span><input value={f.form.note} onChange={f.set('note')} maxLength={200} placeholder="Bank transfer" /></label>
        <label><span>Reference <i className="p-optional">optional</i></span><input value={f.form.reference} onChange={f.set('reference')} maxLength={120} /></label>
      </div>
      <label>Status<select value={f.form.status} onChange={f.set('status')}><option value="completed">Completed</option><option value="pending">Pending</option><option value="failed">Failed</option></select></label>
      <Note f={f} />
      <button type="submit" className="btn btn--light btn--sm" disabled={f.status === 'sending'}>{f.status === 'sending' ? 'Saving…' : 'Record Payment'}</button>
    </form>
  );
}

function Ledger({ id, statement, onPick, onSaved }) {
  const [error, setError] = useState('');
  const { currency } = statement;
  const drop = async (p) => {
    if (!window.confirm(`Delete the ${money(p.amount, currency)} payment from ${dayLabel(p.date.slice(0, 10))}?`)) return;
    try {
      onSaved(await removePayment(id, p.id));
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <>
      <section className="p-card p-card--flush">
        <header className="p-card__head"><div><h2>Last {statement.days.length} Days</h2><p>As the customer sees them; they see the last five. Click a day to change its calls.</p></div></header>
        <div className="p-tablewrap">
          <table className="p-table p-table--click">
            <thead><tr><th scope="col">Day</th><th scope="col">Opening</th><th scope="col">Calls</th><th scope="col">Price</th><th scope="col">Charges</th><th scope="col">Paid</th><th scope="col">Balance</th></tr></thead>
            <tbody>
              {statement.days.map((d) => (
                <tr key={d.date} tabIndex={0} onClick={() => onPick(d)} onKeyDown={(e) => e.key === 'Enter' && onPick(d)}>
                  <th scope="row">{dayLabel(d.date)}{d.is_today && <span className="bill__live"><i aria-hidden="true" />Today</span>}</th>
                  <td className={Number(d.opening_balance) < 0 ? 'is-neg' : ''}>{money(d.opening_balance, currency)}</td>
                  <td>{d.calls.toLocaleString('en-US')}</td>
                  <td>{money(d.price_per_call, currency)}</td>
                  <td className={d.calls ? 'is-neg' : ''}>{d.calls ? `-${money(d.charges, currency)}` : money(0, currency)}</td>
                  <td className={Number(d.payment_received) ? 'is-pos' : ''}>{Number(d.payment_received) ? `+${money(d.payment_received, currency)}` : money(0, currency)}</td>
                  <td className={Number(d.balance) < 0 ? 'is-neg' : 'is-pos'}><b>{money(d.balance, currency)}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!statement.days.length && <p className="p-empty">Billing starts later than today.</p>}
        </div>
      </section>
      <section className="p-card">
        <header className="p-card__head"><div><h2>Payments</h2><p>In the last {statement.days.length} days.</p></div></header>
        <ErrorNote error={error} />
        {statement.payments.length ? (
          <ul className="p-admin__payments">
            {statement.payments.map((p) => (
              <li key={p.id}>
                <span>{dayLabel(p.date.slice(0, 10))}<small>{[p.note, p.reference].filter(Boolean).join(' · ') || 'Recorded by our team'}</small></span>
                <span className={`billing__status is-${p.status}`}>{p.status}</span>
                <b className={p.status === 'completed' ? 'is-pos' : ''}>{money(p.amount, p.currency)}</b>
                <button type="button" className="p-iconbtn" aria-label="Delete payment" onClick={() => drop(p)}><Icon name="close" /></button>
              </li>
            ))}
          </ul>
        ) : <p className="p-empty">No payments in these days.</p>}
      </section>
    </>
  );
}

export default function AdminUser({ id, onSignedOut }) {
  const people = useLoad(signedIn(onSignedOut, listUsers), [id]);
  const user = people.data?.find((u) => u.id === id);
  const customer = user?.role === 'customer';
  const [billing, setBilling] = useState(null);
  const [billingError, setBillingError] = useState('');
  const [picked, setPicked] = useState(null);

  useEffect(() => {
    if (!customer) return;
    signedIn(onSignedOut, () => fetchBilling(id))().then(setBilling, (err) => setBillingError(err.message));
  }, [id, customer, onSignedOut]);

  useEffect(() => {
    if (people.data && !user) navigate('/admin', { replace: true });
  }, [people.data, user]);

  if (!user) return <ErrorNote error={people.error} onRetry={people.reload} />;
  const s = billing?.statement;
  const owes = s && Number(s.balance) < 0;

  return (
    <>
      <p className="p-crumb"><Link to="/admin"><Icon name="back" />All Logins</Link></p>
      <PageHead title={<span className="p-person p-person--head"><Avatar userId={user.id} version={user.avatar_version} name={user.name || user.email} size="lg" />{user.company || user.name}</span>} sub={<>{user.name}{user.company ? ` · ${user.email}` : ''} · {ROLE_LABEL[user.role] || user.role}</>}>
        {s && (
          <span className={`p-balance ${owes ? 'is-due' : 'is-ok'}`}>
            <span className="p-balance__dot" aria-hidden="true" />
            <span className="p-balance__label">{owes ? 'Owes' : 'In Credit'}</span>
            <b>{money(owes ? s.amount_due : s.balance, s.currency)}</b>
          </span>
        )}
      </PageHead>
      <div className="p-grid">
        <Access user={user} onSaved={people.reload} />
        <Profile key={user.id + user.role} user={user} onSaved={people.reload} />
      </div>
      {customer && (
        <>
          <ErrorNote error={billingError} />
          <div className="p-grid">
            <Terms key={billing?.account ? 'set' : 'new'} id={id} account={billing?.account} onSaved={(b) => { setBilling(b); people.reload(); }} />
            {billing?.account ? <Payment id={id} account={billing.account} onSaved={setBilling} /> : <section className="p-card p-empty-card"><h2>No billing yet</h2><p>Set the billing terms first. Then enter calls and payments here.</p></section>}
          </div>
          {billing?.account && (
            <>
              <Calls id={id} account={billing.account} picked={picked} onSaved={setBilling} />
              <Ledger id={id} statement={s} onPick={(d) => { setPicked(d); window.scrollTo({ top: document.querySelector('.p-admin__calls')?.offsetTop ?? 0, behavior: 'smooth' }); }} onSaved={setBilling} />
            </>
          )}
        </>
      )}
    </>
  );
}
