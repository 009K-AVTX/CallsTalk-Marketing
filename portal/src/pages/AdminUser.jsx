import { useCallback, useEffect, useState } from 'react';
import { loadSession } from '../../../src/lib/portal.js';
import {
  addPayment, clearDay, fetchAudit, fetchBilling, getUser, isConflict, removePayment, removeUser, saveDay, saveTerms, sendLink, signedIn,
  TIME_ZONES, updateUser,
} from '../admin.js';
import { actor, describe, failed, groupOf, stamp } from '../audit-text.js';
import Icon from '../components/Icons.jsx';
import { CONTACT_METHODS, contactLink } from '../contacts.js';
import { ErrorNote, PageHead } from '../components/Shell.jsx';
import { dayLabel, money, today } from '../format.js';
import { callsLabel } from '../../../src/components/BillingPage.jsx';
import { Link, navigate } from '../router.jsx';
import useLoad from '../useLoad.js';
import { LinkResult, ROLE_LABEL, StatePill, when } from './AdminUsers.jsx';
import { Avatar } from '../avatar.jsx';

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

function Profile({ user, onSaved, onConflict }) {
  const f = useForm({ name: user.name, company: user.company, role: user.role }, onConflict);
  const self = user.email === loadSession()?.email;
  return (
    <form className="p-card p-form" onSubmit={(e) => f.run(e, async () => onSaved((await updateUser(user.id, { ...f.form, version: user.version })).user), 'Saved.')}>
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
          <button type="button" className="btn btn--quiet btn--sm p-danger" onClick={remove} disabled={f.status === 'sending'}><Icon name="close" />Delete</button>
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
        <label>Days Counted In<select value={f.form.timezone} onChange={f.set('timezone')}>{[...new Set([f.form.timezone, ...TIME_ZONES])].map((z) => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}</select></label>
      </div>
      <Note f={f} />
      <button type="submit" className="btn btn--light btn--sm" disabled={f.status === 'sending'}>{f.status === 'sending' ? 'Saving…' : account ? 'Save Terms' : 'Set Up Billing'}</button>
    </form>
  );
}

// A day's calls and replacements. Replacements (calls not charged) are often added after the day, which
// changes that day's balance and every day after it, as on the "125 - 2" bill sheets.
// `versions`: each shown day's version (0 for a shown day with nothing entered); older days are not checked.
function Calls({ id, account, picked, versions, shown, onSaved, onConflict }) {
  const f = useForm({ date: today(), calls: '', replacements: '0', price: '' }, onConflict);
  const versionOf = (date) => versions?.[date] ?? (shown.includes(date) ? 0 : undefined);
  useEffect(() => {
    if (picked) f.setForm({ date: picked.date, calls: String(picked.calls), replacements: String(picked.replacements || 0), price: '' });
  }, [picked]); // eslint-disable-line react-hooks/exhaustive-deps
  const calls = Number(f.form.calls) || 0;
  const replaced = Number(f.form.replacements) || 0;
  const price = f.form.price !== '' ? Number(f.form.price) : Number(picked?.date === f.form.date ? picked.price_per_call : account.price_per_call);
  const charged = Math.max(calls - replaced, 0);
  return (
    <form className="p-card p-form p-admin__calls" onSubmit={(e) => f.run(e, async () => onSaved(await saveDay(id, f.form.date, f.form.calls, f.form.price, f.form.replacements, versionOf(f.form.date))), `Calls saved for ${dayLabel(f.form.date)}.`)}>
      <header className="p-card__head"><div><h2>Calls and Replacements</h2><p>The day's total calls, and how many were replaced (not charged). Pick a day in the table to change it, even days later.</p></div></header>
      <div className="p-form__row p-form__row--3">
        <label>Day<input required type="date" value={f.form.date} min={account.start_date} max={today()} onChange={f.set('date')} /></label>
        <label>Total Calls<input required type="number" min="0" step="1" value={f.form.calls} onChange={f.set('calls')} placeholder="0" /></label>
        <label><span>Replacements <i className="p-optional">not charged</i></span><input type="number" min="0" max={calls || undefined} step="1" value={f.form.replacements} onChange={f.set('replacements')} placeholder="0" /></label>
      </div>
      {f.form.calls !== '' && (
        <p className="p-admin__note p-calls__sum">
          Shown as <b>{replaced ? `${calls} − ${replaced}` : calls}</b>: {charged} charged × {money(price)} = <b>{money(charged * price)}</b>
          {replaced > calls && <span className="is-neg"> (more replacements than calls)</span>}
        </p>
      )}
      <label><span>Price per Call ($) <i className="p-optional">optional, default {money(account.price_per_call)}</i></span><input type="number" min="0" step="0.01" value={f.form.price} onChange={f.set('price')} /></label>
      <Note f={f} />
      <div className="p-admin__actions">
        <button type="submit" className="btn btn--light btn--sm" disabled={f.status === 'sending'}>{f.status === 'sending' ? 'Saving…' : 'Save Calls'}</button>
        <button type="button" className="btn btn--quiet btn--sm" disabled={f.status === 'sending'} onClick={(e) => f.run(e, async () => onSaved(await clearDay(id, f.form.date, versionOf(f.form.date))), `Calls cleared for ${dayLabel(f.form.date)}.`)}>Clear This Day</button>
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
      <header className="p-card__head"><div><h2>Record a Payment</h2><p>Completed payments are deducted from the amount the customer owes on that day.</p></div></header>
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
        <header className="p-card__head"><div><h2>Last {statement.days.length} Days</h2><p>As the customer sees them (customers see the last five days). Select a day to change its calls.</p></div></header>
        <div className="p-tablewrap">
          <table className="p-table p-table--click">
            <thead><tr><th scope="col">Day</th><th scope="col">Opening</th><th scope="col">Calls</th><th scope="col">Price</th><th scope="col">Charges</th><th scope="col">Paid</th><th scope="col">Balance</th></tr></thead>
            <tbody>
              {statement.days.map((d) => (
                <tr key={d.date} tabIndex={0} onClick={() => onPick(d)} onKeyDown={(e) => e.key === 'Enter' && onPick(d)}>
                  <th scope="row">{dayLabel(d.date)}{d.is_today && <span className="bill__live"><i aria-hidden="true" />Today</span>}</th>
                  <td className={Number(d.opening_balance) < 0 ? 'is-neg' : ''}>{money(d.opening_balance, currency)}</td>
                  <td title={d.replacements ? `${d.replacements} replaced, not charged` : undefined}>{callsLabel(d)}</td>
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
  const log = useLoad(signedIn(onSignedOut, () => fetchAudit({ about: id }, { limit: 8 })), [id, ...watch]);
  const rows = log.data?.rows || [];
  return (
    <section className="p-card p-card--flush">
      <header className="p-card__head">
        <div><h2>Recent Activity</h2><p>Changes to this login and what it did, newest first.</p></div>
        <Link to={`/admin/audit?about=${id}`} className="btn btn--quiet btn--sm"><Icon name="audit" />Open in Audit Log</Link>
      </header>
      <ErrorNote error={log.error} onRetry={log.reload} />
      {rows.length ? (
        <ol className={`p-activity${log.loading ? ' is-refreshing' : ''}`}>
          {rows.map((r) => (
            <li key={r.id} className={failed(r) ? 'is-bad' : ''}>
              <span className={`p-audit__dot is-${groupOf(r.action)}`} aria-hidden="true" />
              <span className="p-activity__what">{describe(r)}<small>{actor(r)} · {stamp(r.created_at)}</small></span>
              {failed(r) && <span className="p-pill is-off">Refused</span>}
            </li>
          ))}
        </ol>
      ) : log.data && <p className="p-empty">Nothing recorded yet. Sign-ins and changes show here as they happen.</p>}
    </section>
  );
}

export default function AdminUser({ id, onSignedOut }) {
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
    if (user === null && !person.loading && !person.error) navigate('/admin', { replace: true });
  }, [user, person.loading, person.error]);

  // Someone else saved first: show the latest of everything on the page.
  const latest = () => {
    person.reload();
    if (customer) loadBilling();
  };

  if (!user) return <ErrorNote error={person.error} onRetry={person.reload} />;
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
              <Calls id={id} account={billing.account} picked={picked} versions={billing.day_versions} shown={s.days.map((d) => d.date)} onSaved={setBilling} onConflict={latest} />
              <Ledger id={id} statement={s} onPick={(d) => { setPicked(d); window.scrollTo({ top: document.querySelector('.p-admin__calls')?.offsetTop ?? 0, behavior: 'smooth' }); }} onSaved={setBilling} />
            </>
          )}
        </>
      )}
      <Activity id={id} onSignedOut={onSignedOut} watch={[billing, person.data]} />
    </>
  );
}
