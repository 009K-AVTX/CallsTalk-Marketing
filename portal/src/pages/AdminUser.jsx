import { useCallback, useEffect, useState } from 'react';
import { isAdmin, loadSession } from '../../../src/lib/portal.js';
import {
  addPayment, clearDay, fetchActivity, fetchBilling, getUser, isConflict, removePayment, removeUser, replaceCalls, saveDay, saveTerms, sendLink, signedIn,
  TIME_ZONES, undoReplacedCall, updateUser,
} from '../admin.js';
import SheetViewer from '../components/SheetViewer.jsx';
import { callsIn } from '../call-summary.js';
import { fetchFile, listCallSummariesOf, setReportCalls } from '../reports.js';
import { period } from './Reports.jsx';
import { actor, describe, failed, groupOf, outcome, stamp } from '../audit-text.js';
import Icon from '../components/Icons.jsx';
import { CONTACT_METHODS, contactLink } from '../contacts.js';
import { ErrorNote, PageHead } from '../components/Shell.jsx';
import { dayLabel, money, today } from '../format.js';
import { callsLabel } from '../../../src/components/BillingPage.jsx';
import { Link, navigate } from '../router.jsx';
import useLoad from '../useLoad.js';
import { LinkResult, ROLE_LABEL, StatePill, when } from './AdminUsers.jsx';
import { Avatar } from '../avatar.jsx';
import Select from '../../../src/components/Select.jsx';

// A form's own state: what was typed, sending, and the last error or confirmation.
// `onConflict`: someone else saved this first (409); the page then loads the latest, and what was typed stays.
function useForm(initial, onConflict) {
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
      if (isConflict(err)) onConflict?.();
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

// Staff (on a customer's page) see no role: only admins change one.
function Profile({ user, onSaved, onConflict }) {
  const f = useForm({ name: user.name, company: user.company, nickname: user.nickname || '', role: user.role }, onConflict);
  const self = user.email === loadSession()?.email;
  const customer = user.role === 'customer';
  const admin = isAdmin();
  // Only customers have a nickname; it is sent only while they are one.
  const { role, ...details } = f.form;
  const change = { ...(customer ? details : { name: details.name, company: details.company }), ...(admin && { role }) };
  return (
    <form className="p-card p-form" onSubmit={(e) => f.run(e, async () => onSaved((await updateUser(user.id, { ...change, version: user.version })).user), 'Saved.')}>
      <header className="p-card__head"><div><h2>Details</h2><p>Login ID: <b>{user.email}</b></p></div></header>
      <label>Full Name<input required value={f.form.name} onChange={f.set('name')} maxLength={100} /></label>
      <label>Company<input value={f.form.company} onChange={f.set('company')} maxLength={120} /></label>
      {customer && <label><span>Nickname <i className="p-optional">picks them when uploading reports</i></span><input value={f.form.nickname} onChange={f.set('nickname')} maxLength={40} placeholder="e.g. Q10" /></label>}
      {admin && (
        <label>Role
          <Select value={f.form.role} onChange={f.set('role')} disabled={self}>
            <option value="customer">Customer</option>
            <option value="staff">Staff (reports, and customers' logins and billing)</option>
            <option value="admin">Admin</option>
          </Select>
        </label>
      )}
      <Note f={f} />
      <button type="submit" className="btn btn--light btn--sm" disabled={f.status === 'sending'}>{f.status === 'sending' ? 'Saving…' : 'Save Details'}</button>
    </form>
  );
}

function Access({ user, onSaved, onConflict }) {
  const f = useForm({}, onConflict);
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
    if (off && !window.confirm(`Deactivate ${user.email}? They will be signed out and unable to log in until the login is reactivated.`)) return;
    f.run(e, async () => onSaved((await updateUser(user.id, { status: off ? 'disabled' : 'active', version: user.version })).user), off ? 'Login deactivated.' : 'Login reactivated.');
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
          <button type="button" className="btn btn--quiet btn--sm" onClick={toggle} disabled={f.status === 'sending'}>{user.status === 'disabled' ? 'Reactivate Login' : 'Deactivate Login'}</button>
          {isAdmin() && <button type="button" className="btn btn--quiet btn--sm p-danger" onClick={remove} disabled={f.status === 'sending'}><Icon name="close" />Delete</button>}
        </div>
      )}
      <Note f={f} />
      {link && <LinkResult result={link} email={user.email} />}
    </section>
  );
}

// The customer's own contact methods (they set these in Settings; we get an email when they change).
function ContactsCard({ contacts = {}, telegram }) {
  const given = CONTACT_METHODS.filter(({ key }) => contacts[key]);
  // Their own Telegram chat with our bot (Connect Telegram in their Settings): where report notices go.
  const bot = telegram?.connected
    ? `Connected${telegram.username ? ` as @${telegram.username}` : ''} since ${when(telegram.linked_at)}. New reports can be announced there.`
    : 'Not connected. The customer can connect it under Settings in their portal to get report notices on Telegram.';
  return (
    <section className="p-card">
      <header className="p-card__head">
        <div><h2>Contact Methods</h2><p>{contacts.updated_at ? `Set by the customer, last changed ${when(contacts.updated_at)}.` : 'Set by the customer in their Settings.'}</p></div>
      </header>
      {given.length ? (
        <dl className="p-facts p-facts--contacts">
          {CONTACT_METHODS.map(({ key, label, icon: AppIcon }) => {
            const value = contacts[key];
            const link = contactLink(key, value);
            return (
              <div key={key}>
                <dt className="p-contacts__label"><AppIcon />{label}</dt>
                <dd>{value ? (link ? <a href={link} target="_blank" rel="noopener noreferrer">{value}</a> : value) : '—'}</dd>
              </div>
            );
          })}
        </dl>
      ) : <p className="p-admin__note">None added yet.</p>}
      {telegram && (
        <p className="p-admin__note p-contacts__bot">
          <span className={`p-pill ${telegram.connected ? 'is-ok' : ''}`}>Telegram Notifications</span> {bot}
        </p>
      )}
    </section>
  );
}

function Terms({ id, account, onSaved, onConflict }) {
  const f = useForm({
    price_per_call: account?.price_per_call ?? '', opening_balance: account?.opening_balance ?? '0',
    start_date: account?.start_date ?? today(), timezone: account?.timezone ?? TIME_ZONES[0],
  }, onConflict);
  return (
    <form className="p-card p-form" onSubmit={(e) => f.run(e, async () => onSaved(await saveTerms(id, { ...f.form, version: account?.version ?? 0 })), 'Billing terms saved.')}>
      <header className="p-card__head"><div><h2>Billing Terms</h2><p>A new price applies to days entered from now on; past days keep their original price.</p></div></header>
      <div className="p-form__row">
        <label>Price per Call ($)<input required type="number" min="0" step="0.01" value={f.form.price_per_call} onChange={f.set('price_per_call')} /></label>
        <label><span>Opening Balance ($) <i className="p-optional">on the start date</i></span><input required type="number" step="0.01" value={f.form.opening_balance} onChange={f.set('opening_balance')} /></label>
      </div>
      <div className="p-form__row">
        <label>Billing Starts<input required type="date" value={f.form.start_date} max={today()} onChange={f.set('start_date')} /></label>
        <label>Days Counted In<Select value={f.form.timezone} onChange={f.set('timezone')}>{[...new Set([f.form.timezone, ...TIME_ZONES])].map((z) => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}</Select></label>
      </div>
      <Note f={f} />
      <button type="submit" className="btn btn--light btn--sm" disabled={f.status === 'sending'}>{f.status === 'sending' ? 'Saving…' : account ? 'Save Terms' : 'Set Up Billing'}</button>
    </form>
  );
}

// A day's total calls. A day with a Call Summary is counted from it and cannot be typed over (only its price can
// change). Replacements (calls not charged) are not typed here: they are the calls replaced one by one under Replaced
// Calls, or a billing report's "125 - 2". They are often added after the day, which changes that day's balance and
// every day after it. `days`: the shown days as the statement has them.
// `versions`: each shown day's version (0 for a shown day with nothing entered); older days are not checked.
function Calls({ id, account, picked, versions, days, onSaved, onConflict }) {
  const f = useForm({ date: today(), calls: '', price: '' }, onConflict);
  const shown = days.find((d) => d.date === f.form.date);
  const logged = Boolean(shown?.from_call_log);
  const typed = logged ? String(shown.calls) : f.form.calls;
  const versionOf = (date) => versions?.[date] ?? (days.some((d) => d.date === date) ? 0 : undefined);
  useEffect(() => {
    if (picked) f.setForm({ date: picked.date, calls: String(picked.calls), price: '' });
  }, [picked]); // eslint-disable-line react-hooks/exhaustive-deps
  const calls = Number(typed) || 0;
  const replaced = shown?.replacements || 0;
  const price = Number(f.form.price !== '' ? f.form.price : shown?.price_per_call ?? account.price_per_call);
  const charged = Math.max(calls - replaced, 0);
  return (
    <form className="p-card p-form p-admin__calls" onSubmit={(e) => f.run(e, async () => onSaved(await saveDay(id, f.form.date, typed, f.form.price, undefined, versionOf(f.form.date))), `Calls saved for ${dayLabel(f.form.date)}.`)}>
      <header className="p-card__head"><div><h2>Calls</h2><p>The day's total calls. A day with a Call Summary is counted from it. Pick a day in the table to change it, even days later. Calls the buyer asks to have replaced are taken off under Replaced Calls.</p></div></header>
      <div className="p-form__row">
        <label>Day<input required type="date" value={f.form.date} min={account.start_date} max={today()} onChange={f.set('date')} /></label>
        <label>
          <span>Total Calls {logged && <i className="p-optional">from its Call Summaries</i>}</span>
          <input required type="number" min="0" step="1" value={typed} onChange={f.set('calls')} placeholder="0" readOnly={logged} />
        </label>
      </div>
      {logged && <p className="p-admin__note">To change these calls, upload the corrected call log under Reports, or delete the wrong one.</p>}
      {typed !== '' && (
        <p className="p-admin__note p-calls__sum">
          Shown as <b>{replaced ? `${calls} − ${replaced}` : calls}</b>{replaced > 0 && ` (${replaced} replaced)`}: {charged} charged × {money(price)} = <b>{money(charged * price)}</b>
          {replaced > calls && <span className="is-neg"> (fewer calls than the {replaced} replaced)</span>}
        </p>
      )}
      <label><span>Price per Call ($) <i className="p-optional">optional, default {money(account.price_per_call)}</i></span><input type="number" min="0" step="0.01" value={f.form.price} onChange={f.set('price')} /></label>
      <Note f={f} />
      <div className="p-admin__actions">
        <button type="submit" className="btn btn--light btn--sm" disabled={f.status === 'sending'}>{f.status === 'sending' ? 'Saving…' : logged ? 'Save Price' : 'Save Calls'}</button>
        <button type="button" className="btn btn--quiet btn--sm" disabled={f.status === 'sending' || logged} onClick={(e) => f.run(e, async () => onSaved(await clearDay(id, f.form.date, versionOf(f.form.date))), `Calls cleared for ${dayLabel(f.form.date)}.`)}>Clear This Day</button>
      </div>
    </form>
  );
}

// Calls the buyer asked (in the portal chat) to have replaced. Chosen in their Call Summary, each one comes off its
// day's bill: the day reads "125 − 2", and that day's balance and every one after it move by the call's price. The
// buyer sees the same list on their Billing page, and the calls marked in their Call Summary. Undo puts a call back.
// A Call Summary uploaded before calls were read into billing has "Read Calls": its file is read here and its days
// counted from it, as a new upload's are. `onBilling`: loads the billing again.
function ReplacedCalls({ id, calls, days, onSaved, onBilling, onSignedOut }) {
  const reports = useLoad(signedIn(onSignedOut, () => listCallSummariesOf(id)), [id]);
  const [open, setOpen] = useState(null); // the Call Summary being picked from
  const [reading, setReading] = useState(null);
  const [error, setError] = useState('');
  const readCalls = async (r) => {
    setError('');
    setReading(r.id);
    try {
      await setReportCalls(r.id, await callsIn(await fetchFile(r)));
      reports.reload();
      onBilling();
    } catch (err) {
      setError(err.message);
    } finally {
      setReading(null);
    }
  };
  const close = useCallback(() => setOpen(null), []);
  const report = reports.data?.find((r) => r.id === open);
  const replace = async (picked, reason) => {
    const result = await replaceCalls(id, open, picked, reason);
    onSaved(result);
    reports.reload();
    return result.replaced;
  };
  const undo = async (c) => {
    if (!window.confirm(`Put back the call ${c.called_at}${c.caller ? ` from ${c.caller}` : ''}? It is charged again on ${dayLabel(c.date)}.`)) return;
    setError('');
    try {
      onSaved(await undoReplacedCall(id, c.id));
      reports.reload();
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <section className="p-card">
      <header className="p-card__head">
        <div><h2>Replaced Calls</h2><p>Calls the buyer asked to have replaced in the chat. Choose them in their Call Summary: each one comes off that day's bill, and the buyer sees it on their Billing page.</p></div>
      </header>
      <ErrorNote error={error || reports.error} onRetry={reports.error ? reports.reload : null} />
      {reports.data?.length ? (
        <ul className="p-admin__payments p-admin__payments--flush p-replaced__reports">
          {reports.data.slice(0, 5).map((r) => (
            <li key={r.id}>
              <span>{r.title}<small>{period(r)}{r.calls === null ? ' · calls not read into billing' : ` · ${r.calls} call${r.calls === 1 ? '' : 's'}`}{r.replaced.length > 0 && ` · ${r.replaced.length} replaced`}</small></span>
              {r.calls === null && <button type="button" className="btn btn--quiet btn--sm" disabled={reading === r.id} onClick={() => readCalls(r)}>{reading === r.id ? 'Reading…' : 'Read Calls'}</button>}
              <button type="button" className="btn btn--quiet btn--sm" onClick={() => setOpen(r.id)}>Choose Calls</button>
            </li>
          ))}
        </ul>
      ) : reports.data && <p className="p-admin__note">No Call Summaries for this buyer yet. Upload the day's call log under Reports, then choose its calls here.</p>}
      <h3 className="p-replaced__title">Replaced in the Last {days} Days</h3>
      {calls.length ? (
        <ul className="p-admin__payments">
          {calls.map((c) => (
            <li key={c.id}>
              <span>{dayLabel(c.date)} · {c.called_at}<small>{[c.caller, c.duration, c.reason].filter(Boolean).join(' · ')}</small></span>
              <small>{c.replaced_by_email || 'Our team'}, {when(c.created_at)}</small>
              <button type="button" className="p-iconbtn" aria-label={`Put back the call ${c.called_at}`} title="Put back on the bill" onClick={() => undo(c)}><Icon name="close" /></button>
            </li>
          ))}
        </ul>
      ) : <p className="p-empty">No calls replaced on these days.</p>}
      {report && <SheetViewer report={report} onClose={close} pick={{ onReplace: replace }} />}
    </section>
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
      <header className="p-card__head"><div><h2>Record a Payment</h2><p>Completed payments are deducted from the amount the customer owes on that day.</p></div></header>
      <div className="p-form__row">
        <label>Amount ($)<input required type="number" min="0.01" step="0.01" value={f.form.amount} onChange={f.set('amount')} /></label>
        <label>Day Received<input required type="date" value={f.form.date} min={account.start_date} max={today()} onChange={f.set('date')} /></label>
      </div>
      <div className="p-form__row">
        <label><span>Shown to Customer <i className="p-optional">optional</i></span><input value={f.form.note} onChange={f.set('note')} maxLength={200} placeholder="Bank transfer" /></label>
        <label><span>Reference <i className="p-optional">optional</i></span><input value={f.form.reference} onChange={f.set('reference')} maxLength={120} /></label>
      </div>
      <label>Status<Select value={f.form.status} onChange={f.set('status')}><option value="completed">Completed</option><option value="pending">Pending</option><option value="failed">Failed</option></Select></label>
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
        <header className="p-card__head"><div><h2>Last {statement.days.length} Days</h2><p>As the customer sees them (customers see the last five days). Select a day to change its calls.</p></div></header>
        <div className="p-tablewrap">
          <table className="p-table p-table--click">
            <thead><tr><th scope="col">Day</th><th scope="col">Opening</th><th scope="col">Calls</th><th scope="col">Price</th><th scope="col">Charges</th><th scope="col">Paid</th><th scope="col">Balance</th></tr></thead>
            <tbody>
              {statement.days.map((d) => (
                <tr key={d.date} tabIndex={0} onClick={() => onPick(d)} onKeyDown={(e) => e.key === 'Enter' && onPick(d)}>
                  <th scope="row">{dayLabel(d.date)}{d.is_today && <span className="bill__live"><i aria-hidden="true" />Today</span>}</th>
                  <td className={Number(d.opening_balance) < 0 ? 'is-neg' : ''}>{money(d.opening_balance, currency)}</td>
                  <td title={[d.from_call_log && 'Counted from the Call Summaries', d.replacements && `${d.replacements} replaced, not charged`].filter(Boolean).join('. ') || undefined}>
                    {callsLabel(d)}{d.from_call_log && <small className="p-calls__log">Call log</small>}
                  </td>
                  <td>{money(d.price_per_call, currency)}</td>
                  <td className={Number(d.charges) ? 'is-neg' : ''}>{Number(d.charges) ? `-${money(d.charges, currency)}` : money(0, currency)}</td>
                  <td className={Number(d.payment_received) ? 'is-pos' : ''}>{Number(d.payment_received) ? `+${money(d.payment_received, currency)}` : money(0, currency)}</td>
                  <td className={Number(d.balance) < 0 ? 'is-neg' : 'is-pos'}><b>{money(d.balance, currency)}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!statement.days.length && <p className="p-empty">Billing starts after today.</p>}
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
        ) : <p className="p-empty">No payments on these days.</p>}
      </section>
    </>
  );
}

// The latest audit entries by or about this login, refreshed after each change made on this page.
function Activity({ id, onSignedOut, watch }) {
  const log = useLoad(signedIn(onSignedOut, () => fetchActivity(id)), [id, ...watch]);
  const rows = log.data?.rows || [];
  return (
    <section className="p-card p-card--flush">
      <header className="p-card__head">
        <div><h2>Recent Activity</h2><p>Changes to this login and what it did, newest first.</p></div>
        {isAdmin() && <Link to={`/admin/audit?about=${id}`} className="btn btn--quiet btn--sm"><Icon name="audit" />Open in Audit Log</Link>}
      </header>
      <ErrorNote error={log.error} onRetry={log.reload} />
      {rows.length ? (
        <ol className={`p-activity${log.loading ? ' is-refreshing' : ''}`}>
          {rows.map((r) => (
            <li key={r.id} className={failed(r) ? 'is-bad' : ''}>
              <span className={`p-audit__dot is-${groupOf(r.action)}`} aria-hidden="true" />
              <span className="p-activity__what">{describe(r)}<small>{actor(r)} · {stamp(r.created_at)}</small></span>
              {failed(r) && <span className={`p-pill is-${outcome(r).tone}`}>{outcome(r).label}</span>}
            </li>
          ))}
        </ol>
      ) : log.data && <p className="p-empty">Nothing recorded yet. Sign-ins and changes show here as they happen.</p>}
    </section>
  );
}

// One login's page. Staff open customers' pages here too (from Customers), with all but the role and Delete.
export default function AdminUser({ id, onSignedOut }) {
  const home = isAdmin() ? { to: '/admin', label: 'All Logins' } : { to: '/customers', label: 'All Customers' };
  // Just this login (not the whole list); null once it no longer exists.
  const person = useLoad(signedIn(onSignedOut, () => getUser(id)), [id]);
  const user = person.data;
  const customer = user?.role === 'customer';
  const [billing, setBilling] = useState(null);
  const [billingError, setBillingError] = useState('');
  const [picked, setPicked] = useState(null);

  const loadBilling = useCallback(() => {
    signedIn(onSignedOut, () => fetchBilling(id))().then(setBilling, (err) => setBillingError(err.message));
  }, [id, onSignedOut]);
  useEffect(() => {
    if (customer) loadBilling();
  }, [customer, loadBilling]);

  useEffect(() => {
    if (user === null && !person.loading && !person.error) navigate(home.to, { replace: true });
  }, [user, person.loading, person.error, home.to]);

  // Someone else saved first: show the latest of everything on the page.
  const latest = () => {
    person.reload();
    if (customer) loadBilling();
  };

  if (!user) return <><p className="p-crumb"><Link to={home.to}><Icon name="back" />{home.label}</Link></p><ErrorNote error={person.error} onRetry={person.reload} /></>;
  const s = billing?.statement;
  const owes = s && Number(s.balance) < 0;

  return (
    <>
      <p className="p-crumb"><Link to={home.to}><Icon name="back" />{home.label}</Link></p>
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
        <Access user={user} onSaved={person.reload} onConflict={latest} />
        <Profile key={user.id + user.role} user={user} onSaved={person.reload} onConflict={latest} />
      </div>
      {customer && (
        <>
          <ErrorNote error={billingError} />
          {billing && <ContactsCard contacts={billing.contacts} telegram={billing.telegram} />}
          <div className="p-grid">
            <Terms key={billing?.account ? 'set' : 'new'} id={id} account={billing?.account} onSaved={(b) => { setBilling(b); person.reload(); }} onConflict={latest} />
            {billing?.account ? <Payment id={id} account={billing.account} onSaved={setBilling} /> : <section className="p-card p-empty-card"><h2>No billing yet</h2><p>Set the billing terms first. Then enter calls and payments here.</p></section>}
          </div>
          {billing?.account && (
            <>
              <Calls id={id} account={billing.account} picked={picked} versions={billing.day_versions} days={s.days} onSaved={setBilling} onConflict={latest} />
              <ReplacedCalls id={id} calls={billing.replaced_calls || []} days={s.days.length} onSaved={setBilling} onBilling={loadBilling} onSignedOut={onSignedOut} />
              <Ledger id={id} statement={s} onPick={(d) => { setPicked(d); window.scrollTo({ top: document.querySelector('.p-admin__calls')?.offsetTop ?? 0, behavior: 'smooth' }); }} onSaved={setBilling} />
            </>
          )}
        </>
      )}
      <Activity id={id} onSignedOut={onSignedOut} watch={[billing, person.data]} />
    </>
  );
}
