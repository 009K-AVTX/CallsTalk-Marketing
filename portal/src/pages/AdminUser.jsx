import { useCallback, useEffect, useRef, useState } from 'react';
import { isAdmin, loadSession } from '../../../src/lib/portal.js';
import {
  addPayment, clearDay, fetchActivity, fetchBilling, fetchCallDays, fetchReplacedCalls, getUser, isConflict, removePayment, removeUser, replaceCalls, saveDay, saveTerms,
  sendLink, signedIn, TIME_ZONES, undoReplacedCall, updateUser,
} from '../admin.js';
import SheetViewer from '../components/SheetViewer.jsx';
import DateRange, { presetRange } from '../components/DateRange.jsx';
import { callsIn } from '../call-summary.js';
import { fetchFile, listCallSummariesOf, setReportCalls } from '../reports.js';
import { actor, describe, failed, groupOf, outcome, stamp } from '../audit-text.js';
import Icon from '../components/Icons.jsx';
import { CONTACT_METHODS, contactLink } from '../contacts.js';
import { ErrorNote, PageHead } from '../components/Shell.jsx';
import { buyerName, dayLabel, money, today } from '../format.js';
import { callsLabel, callTime } from '../../../src/components/BillingPage.jsx';
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
      {customer && <label>Nickname<input value={f.form.nickname} onChange={f.set('nickname')} maxLength={40} placeholder="e.g. Q10" /></label>}
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

// The login's state: when it was made, set up and last used, and its setup link.
function AccessCard({ user }) {
  return (
    <section className="p-card">
      <header className="p-card__head"><div><h2>Access</h2></div><StatePill user={user} /></header>
      <dl className="p-facts">
        <div><dt>Created</dt><dd>{when(user.created_at)}</dd></div>
        <div><dt>Set Up</dt><dd>{when(user.activated_at)}</dd></div>
        <div><dt>Last Log In</dt><dd>{when(user.last_login_at)}</dd></div>
        <div><dt>Setup Link</dt><dd>{user.invite_expires_at ? `Valid until ${when(user.invite_expires_at)}` : '—'}</dd></div>
      </dl>
    </section>
  );
}

// What locks a person out or removes them, kept apart at the foot of the page in red (as Vercel's Danger Zone):
// resetting the login, deactivating it, and (admins) deleting it. Each asks to be confirmed.
function DangerZone({ user, onSaved, onConflict }) {
  const f = useForm({}, onConflict);
  const [link, setLink] = useState(null);
  const self = user.email === loadSession()?.email;
  const setUp = Boolean(user.activated_at) && user.status !== 'invited';
  const on = user.status !== 'disabled';

  const newLink = (e) => {
    if (setUp && !window.confirm(`Reset ${user.email}? They'll need the new link to sign in.`)) return;
    f.run(e, async () => {
      const result = await sendLink(user.id);
      setLink(result);
      onSaved();
    });
  };
  const toggle = (e) => {
    if (on && !window.confirm(`Deactivate ${user.email}?`)) return;
    f.run(e, async () => onSaved((await updateUser(user.id, { status: on ? 'disabled' : 'active', version: user.version })).user), on ? 'Login deactivated.' : 'Login reactivated.');
  };
  const remove = (e) => {
    if (!window.confirm(`Delete ${user.email} and all their data? This can't be undone.`)) return;
    f.run(e, async () => {
      await removeUser(user.id);
      navigate('/admin', { replace: true });
    });
  };

  const actions = [
    on && {
      title: setUp ? 'Reset Login' : 'Send a New Setup Link',
      text: setUp ? 'Signs them out and emails a new setup link.' : 'Emails a new setup link.',
      label: setUp ? 'Reset and Send Link' : 'Send Setup Link',
      run: newLink,
    },
    {
      title: on ? 'Deactivate Login' : 'Reactivate Login',
      text: on ? 'Blocks sign-in. Nothing is deleted.' : 'Allows sign-in again.',
      label: on ? 'Deactivate' : 'Reactivate',
      run: toggle,
      safe: !on,
    },
    isAdmin() && {
      title: 'Delete Login',
      text: 'Permanently deletes the login and its data.',
      label: 'Delete Login',
      run: remove,
      worst: true,
    },
  ].filter(Boolean);

  return (
    <section className="p-card p-danger-zone">
      <header className="p-card__head"><div><h2>Danger Zone</h2></div></header>
      {self ? <p className="p-admin__note">This is your own login.</p> : (
        <ul className="p-danger-zone__list">
          {actions.map((a) => (
            <li key={a.title}>
              <span><b>{a.title}</b><small>{a.text}</small></span>
              <button type="button" className={`btn btn--sm ${a.safe ? 'btn--quiet' : `p-danger-btn${a.worst ? ' is-solid' : ''}`}`} onClick={a.run} disabled={f.status === 'sending'}>
                {a.label}
              </button>
            </li>
          ))}
        </ul>
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
    ? `Connected${telegram.username ? ` as @${telegram.username}` : ''}`
    : 'Not connected';
  return (
    <section className="p-card">
      <header className="p-card__head">
        <div><h2>Contact Methods</h2>{contacts.updated_at && <p>Updated {when(contacts.updated_at)}</p>}</div>
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
      <header className="p-card__head"><div><h2>Billing Terms</h2></div></header>
      <div className="p-form__row">
        <label>Price per Call ($)<input required type="number" min="0" step="0.01" value={f.form.price_per_call} onChange={f.set('price_per_call')} /></label>
        <label>Opening Balance ($)<input required type="number" step="0.01" value={f.form.opening_balance} onChange={f.set('opening_balance')} /></label>
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
      <header className="p-card__head"><div><h2>Calls</h2></div></header>
      <div className="p-form__row">
        <label>Day<input required type="date" value={f.form.date} min={account.start_date} max={today()} onChange={f.set('date')} /></label>
        <label>
          <span>Total Calls {logged && <i className="p-optional">from call log</i>}</span>
          <input required type="number" min="0" step="1" value={typed} onChange={f.set('calls')} placeholder="0" readOnly={logged} />
        </label>
      </div>
      {logged && <p className="p-admin__note">Set by the call log.</p>}
      {typed !== '' && (
        <p className="p-admin__note p-calls__sum">
          Shown as <b>{replaced ? `${calls} − ${replaced}` : calls}</b>{replaced > 0 && ` (${replaced} replaced)`}: {charged} charged × {money(price)} = <b>{money(charged * price)}</b>
          {replaced > calls && <span className="is-neg"> (fewer calls than the {replaced} replaced)</span>}
        </p>
      )}
      <label><span>Price per Call ($) <i className="p-optional">default {money(account.price_per_call)}</i></span><input type="number" min="0" step="0.01" value={f.form.price} onChange={f.set('price')} /></label>
      <Note f={f} />
      <div className="p-admin__actions">
        <button type="submit" className="btn btn--light btn--sm" disabled={f.status === 'sending'}>{f.status === 'sending' ? 'Saving…' : logged ? 'Save Price' : 'Save Calls'}</button>
        <button type="button" className="btn btn--quiet btn--sm" disabled={f.status === 'sending' || logged} onClick={(e) => f.run(e, async () => onSaved(await clearDay(id, f.form.date, versionOf(f.form.date))), `Calls cleared for ${dayLabel(f.form.date)}.`)}>Clear This Day</button>
      </div>
    </form>
  );
}

const plural = (n, word) => `${n.toLocaleString('en-US')} ${word}${n === 1 ? '' : 's'}`;
const dateOf = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const longDay = (iso) => dateOf(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
const shortDay = (iso) => dateOf(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
const SUMMARIES_SHOWN = 8;

// The calls on the chosen dates, from their Call Summaries and billing (fetchCallDays): all of them, those replaced (not
// charged), those billed, and what they come to. Days with calls in the logs but not in billing (before billing starts,
// or no billing terms yet) are counted apart. `load`: useLoad of fetchCallDays.
function CallTotals({ load, currency }) {
  if (!load.data) return load.error ? <ErrorNote error={load.error} onRetry={load.reload} /> : <div className="p-rc__totals is-skeleton" />;
  const t = load.data.results.reduce((sum, d) => {
    if (d.billed_calls === null) return { ...sum, unbilled: sum.unbilled + d.logged_calls };
    return {
      ...sum,
      calls: sum.calls + d.billed_calls,
      replaced: sum.replaced + d.billed_replacements,
      charges: sum.charges + Math.round((d.billed_calls - d.billed_replacements) * Number(d.price_per_call) * 100),
    };
  }, { calls: 0, replaced: 0, charges: 0, unbilled: 0 });
  return (
    <div className={`p-rc__totals${load.loading ? ' is-refreshing' : ''}`}>
      <span><small>Calls</small><b>{t.calls.toLocaleString('en-US')}</b></span>
      <span><small>Replaced</small><b className={t.replaced ? 'is-warn' : ''}>{t.replaced.toLocaleString('en-US')}</b></span>
      <span><small>Billable</small><b>{(t.calls - t.replaced).toLocaleString('en-US')}</b></span>
      <span><small>Charges</small><b>{money(t.charges / 100, currency)}</b></span>
      {t.unbilled > 0 && <small className="p-rc__unbilled is-warn">{plural(t.unbilled, 'more call')} in the Call Summaries, not billed: {load.data.start_date ? 'before billing starts' : 'no billing terms yet'}.</small>}
    </div>
  );
}

// A buyer with no billing terms yet: their Call Summaries' calls are kept, and shown here until billing starts.
function UnbilledCalls({ id, onSignedOut }) {
  const [range, setRange] = useState(() => presetRange('Last 30 Days'));
  const callDays = useLoad(signedIn(onSignedOut, () => fetchCallDays(id, range)), [id, range.from, range.to]);
  return (
    <section className="p-card p-rc">
      <header className="p-card__head">
        <div><h2>Calls</h2></div>
        <DateRange value={range} onChange={setRange} label="Dates of the calls" />
      </header>
      <CallTotals load={callDays} currency="USD" />
    </section>
  );
}

// Calls the buyer asked (in the portal chat) to have replaced. They ask a day or two after the calls (up to 48 hours,
// and Friday's calls on Monday or Tuesday), so one date filter, on the days the calls were made, scopes the card:
// the Call Summaries of those days, where the calls are ticked (SheetViewer pick), and the calls replaced on them.
// Each replaced call comes off its day's bill: the day reads "125 − 2", and that day's balance and every one after it
// move by the call's price. The buyer sees them on their Billing page, and marked in their Call Summary; Put Back
// charges one again. A Call Summary uploaded before calls were read into billing has "Read Calls": its file is read
// here and its days counted from it, as a new upload's are. `days`: the statement's days. `onBilling`: loads the
// billing again.
function ReplacedCalls({ id, account, days, onSaved, onBilling, onSignedOut }) {
  const reports = useLoad(signedIn(onSignedOut, () => listCallSummariesOf(id)), [id]);
  const [range, setRange] = useState(() => presetRange('Last 7 Days'));
  const [find, setFind] = useState('');
  const [all, setAll] = useState(false); // every Call Summary of the dates, not just the latest few
  const [changes, setChanges] = useState(0); // each replacement or put-back loads the list again
  const history = useLoad(signedIn(onSignedOut, () => fetchReplacedCalls(id, range)), [id, range.from, range.to, changes]);
  // Each day's calls in the dates, billed or not; loaded again when the billing or the Call Summaries change.
  const callDays = useLoad(signedIn(onSignedOut, () => fetchCallDays(id, range)), [id, range.from, range.to, changes, days, reports.data]);
  const [open, setOpen] = useState(null); // the Call Summary being picked from
  const [reading, setReading] = useState(null);
  const [error, setError] = useState('');
  const card = useRef(null);

  // The Call Summaries with a day in the dates, the latest day first.
  const summaries = (reports.data || []).filter((r) => r.period_from <= range.to && r.period_to >= range.from)
    .sort((a, b) => b.period_to.localeCompare(a.period_to) || b.uploaded_at.localeCompare(a.uploaded_at));
  const listed = all ? summaries : summaries.slice(0, SUMMARIES_SHOWN);
  const uploadPath = isAdmin() ? '/admin/reports' : '/upload';
  const chooseRange = (r) => {
    setRange(r);
    setAll(false);
  };

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
    setChanges((n) => n + 1);
    return result.replaced;
  };
  const undo = async (c) => {
    if (!window.confirm(`Put back the call at ${callTime(c)}${c.caller ? ` from ${c.caller}` : ''}?`)) return;
    setError('');
    try {
      onSaved(await undoReplacedCall(id, c.id));
      reports.reload();
      setChanges((n) => n + 1);
    } catch (err) {
      setError(err.message);
    }
  };

  // The replaced calls on those days that match the search, by day, latest first.
  const needle = find.trim().toLowerCase();
  const digits = needle.replace(/\D/g, '');
  const found = (history.data || []).filter((c) => !needle || [c.called_at, c.caller, c.reason, c.duration].some((v) => {
    const s = String(v || '').toLowerCase();
    return s.includes(needle) || (digits.length >= 3 && s.replace(/\D/g, '').includes(digits));
  }));
  const groups = [...found.reduce((m, c) => m.set(c.date, [...(m.get(c.date) || []), c]), new Map())];

  // A Call Summary's days (those in the dates) as billing has them, or why their calls are not billed.
  const dayNote = (r) => {
    if (!callDays.data) return null;
    const own = callDays.data.results.filter((d) => d.date >= r.period_from && d.date <= r.period_to);
    const billed = own.filter((d) => d.billed_calls !== null);
    if (billed.length) {
      const calls = billed.reduce((t, d) => t + d.billed_calls, 0);
      const replaced = billed.reduce((t, d) => t + d.billed_replacements, 0);
      return <small>{plural(calls, 'call')} in billing{replaced > 0 && <>, <span className="is-warn">{replaced} replaced</span></>}</small>;
    }
    const logged = own.reduce((t, d) => t + d.logged_calls, 0);
    if (logged) return <small className="is-warn">{plural(logged, 'call')} logged, not billed: before billing starts</small>;
    return <small className="is-warn">No calls in billing</small>;
  };

  return (
    <section className="p-card p-rc" ref={card}>
      <header className="p-card__head">
        <div><h2>Replaced Calls</h2></div>
        <DateRange value={range} onChange={chooseRange} min={account.start_date} label="Dates of the calls" />
      </header>
      <ErrorNote error={error || reports.error} onRetry={reports.error ? reports.reload : null} />
      <CallTotals load={callDays} currency={account.currency} />

      <div className="p-rc__step">
        <h3 className="p-rc__title">Call Summaries{reports.data && <span className="p-pill">{summaries.length}</span>}</h3>
        {!reports.data && !reports.error && <div className="p-rows is-skeleton p-rc__loading" />}
        {listed.length > 0 && (
          <ul className="p-rc__reports">
            {listed.map((r) => (
              <li key={r.id}>
                <span className="p-rc__when">
                  <b>{r.period_from === r.period_to ? shortDay(r.period_from) : `${shortDay(r.period_from)} – ${shortDay(r.period_to)}`}</b>
                  {dayNote(r)}
                </span>
                <span className="p-rc__what">
                  <span>{r.title}</span>
                  <small>
                    {r.calls !== null && <><b className="p-rc__count">{plural(r.calls, 'call')}</b> · </>}
                    {[r.replaced.length > 0 && `${r.replaced.length} replaced`, `uploaded ${when(r.uploaded_at)}`].filter(Boolean).join(' · ')}
                  </small>
                  {r.calls === null && <small className="is-warn">Not in billing yet</small>}
                </span>
                <span className="p-rc__go">
                  {r.calls === null && <button type="button" className="btn btn--quiet btn--sm" disabled={reading === r.id} onClick={() => readCalls(r)}>{reading === r.id ? 'Reading…' : 'Read Calls'}</button>}
                  <button type="button" className="btn btn--light btn--sm" onClick={() => setOpen(r.id)}><Icon name="check" />Choose Calls</button>
                </span>
              </li>
            ))}
          </ul>
        )}
        {summaries.length > listed.length && (
          <button type="button" className="p-linkbtn p-rc__more" onClick={() => setAll(true)}>Show all {summaries.length} Call Summaries</button>
        )}
        {reports.data && !summaries.length && (
          <p className="p-rc__none">
            No Call Summaries for these dates. <Link to={uploadPath}>Upload</Link>
          </p>
        )}
      </div>

      <div className="p-rc__history">
        <div className="p-rc__bar">
          <h3 className="p-rc__title">
            Replaced on These Days
            {history.data && <span className="p-pill">{needle ? `${found.length} of ${history.data.length}` : history.data.length}</span>}
          </h3>
          <label className="p-search p-filters__search p-rc__search">
            <span className="sr-only">Find a replaced call</span>
            <input type="search" value={find} onChange={(e) => setFind(e.target.value)} placeholder="Search" autoComplete="off" />
          </label>
        </div>
        <ErrorNote error={history.error} onRetry={history.reload} />
        {!history.data && !history.error && <div className="p-rows is-skeleton p-rc__loading" />}
        {groups.length > 0 && (
          <div className={`p-rc__groups${history.loading ? ' is-refreshing' : ''}`}>
            {groups.map(([date, list]) => (
              <section key={date} className="p-rc__group" aria-label={longDay(date)}>
                <h4>
                  <span>{longDay(date)}</span>
                  <small>{plural(list.length, 'call')} replaced</small>
                  {(range.from !== date || range.to !== date) && (
                    <button type="button" className="p-linkbtn" onClick={() => { chooseRange({ from: date, to: date }); card.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>Only This Day</button>
                  )}
                </h4>
                <ul className="p-rc__calls">
                  {list.map((c) => (
                    <li key={c.id}>
                      <span className="p-rc__time">{callTime(c)}</span>
                      <span className="p-rc__call">
                        <b>{c.caller || 'Unknown caller'}</b>
                        <small>{[c.duration, c.reason].filter(Boolean).join(' · ')}</small>
                      </span>
                      <small className="p-rc__by">{c.replaced_by_email || 'Our team'}<br />{when(c.created_at)}</small>
                      <button type="button" className="btn btn--quiet btn--sm p-rc__undo" onClick={() => undo(c)}>Put Back</button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
        {history.data && !groups.length && (
          <p className="p-empty">{needle ? 'No matches.' : 'No replaced calls.'}</p>
        )}
      </div>
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
      <header className="p-card__head"><div><h2>Record a Payment</h2></div></header>
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

// The shown days as the customer sees them; picking one opens it in Calls.
function Ledger({ statement, onPick }) {
  const { currency } = statement;
  return (
    <section className="p-card p-card--flush">
        <header className="p-card__head"><div><h2>Last {statement.days.length} Days</h2></div></header>
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
  );
}

// The payments of the shown days; × deletes one entered by mistake.
function Payments({ id, statement, onSaved }) {
  const [error, setError] = useState('');
  const drop = async (p) => {
    if (!window.confirm(`Delete the ${money(p.amount, statement.currency)} payment from ${dayLabel(p.date.slice(0, 10))}?`)) return;
    try {
      onSaved(await removePayment(id, p.id));
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <section className="p-card">
      <header className="p-card__head"><div><h2>Payments</h2></div></header>
      <ErrorNote error={error} />
      {statement.payments.length ? (
        <ul className="p-admin__payments">
          {statement.payments.map((p) => (
            <li key={p.id}>
              <span>{dayLabel(p.date.slice(0, 10))}<small>{[p.note, p.reference].filter(Boolean).join(' · ')}</small></span>
              <span className={`billing__status is-${p.status}`}>{p.status}</span>
              <b className={p.status === 'completed' ? 'is-pos' : ''}>{money(p.amount, p.currency)}</b>
              <button type="button" className="p-iconbtn" aria-label="Delete payment" onClick={() => drop(p)}><Icon name="close" /></button>
            </li>
          ))}
        </ul>
      ) : <p className="p-empty">No payments.</p>}
    </section>
  );
}

// The latest audit entries by or about this login, refreshed after each change made on this page.
function Activity({ id, onSignedOut, watch }) {
  const log = useLoad(signedIn(onSignedOut, () => fetchActivity(id)), [id, ...watch]);
  const rows = log.data?.rows || [];
  return (
    <section className="p-card p-card--flush">
      <header className="p-card__head">
        <div><h2>Recent Activity</h2></div>
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
      ) : log.data && <p className="p-empty">No activity yet.</p>}
    </section>
  );
}

// The page in three tabs: the day-to-day work first (calls and replacements), then billing terms and payments, then
// the login itself with its Danger Zone. The tab is kept in the address (?tab=), so a reload or a shared link opens it.
const TABS = [
  { key: 'calls', label: 'Calls & Replacements', short: 'Calls', icon: 'calls' },
  { key: 'billing', label: 'Billing & Payments', short: 'Billing', icon: 'billing' },
  { key: 'account', label: 'Account', short: 'Account', icon: 'settings' },
];
const tabInUrl = () => {
  const t = new URLSearchParams(window.location.search).get('tab');
  return TABS.some((x) => x.key === t) ? t : 'calls';
};

function Tabs({ tab, onChange }) {
  const keys = (e) => {
    const i = TABS.findIndex((t) => t.key === tab);
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: TABS.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const t = TABS[(next + TABS.length) % TABS.length];
    onChange(t.key);
    document.getElementById(`tab-${t.key}`)?.focus();
  };
  return (
    <div className="p-tabs" role="tablist" aria-label="Buyer" onKeyDown={keys}>
      {TABS.map((t) => (
        <button key={t.key} id={`tab-${t.key}`} type="button" role="tab" aria-selected={tab === t.key} aria-controls="tab-panel" tabIndex={tab === t.key ? 0 : -1}
          className={`p-tabs__tab${tab === t.key ? ' is-on' : ''}`} aria-label={t.label} onClick={() => onChange(t.key)}>
          <Icon name={t.icon} /><span className="p-tabs__long" aria-hidden="true">{t.label}</span><span className="p-tabs__short" aria-hidden="true">{t.short}</span>
        </button>
      ))}
    </div>
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
  const [tab, setTab] = useState(tabInUrl);

  const loadBilling = useCallback(() => {
    setBillingError('');
    signedIn(onSignedOut, () => fetchBilling(id))().then(setBilling, (err) => setBillingError(err.message));
  }, [id, onSignedOut]);
  useEffect(() => {
    if (customer) loadBilling();
  }, [customer, loadBilling]);

  useEffect(() => {
    if (user === null && !person.loading && !person.error) navigate(home.to, { replace: true });
  }, [user, person.loading, person.error, home.to]);

  const chooseTab = (key) => {
    setTab(key);
    const q = new URLSearchParams(window.location.search);
    if (key === 'calls') q.delete('tab');
    else q.set('tab', key);
    const query = q.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
  };

  // Someone else saved first: show the latest of everything on the page.
  const latest = () => {
    person.reload();
    if (customer) loadBilling();
  };

  if (!user) return <><p className="p-crumb"><Link to={home.to}><Icon name="back" />{home.label}</Link></p><ErrorNote error={person.error} onRetry={person.reload} /></>;
  const s = billing?.statement;
  const owes = s && Number(s.balance) < 0;
  const noBilling = (
    <section className="p-card p-empty-card">
      <h2>No billing yet</h2>
      <p>Set the billing terms first.</p>
      {tab !== 'billing' && <button type="button" className="btn btn--light btn--sm p-empty-card__cta" onClick={() => chooseTab('billing')}>Set Up Billing</button>}
    </section>
  );

  const account = (
    <>
      <div className="p-grid">
        <Profile key={user.id + user.role} user={user} onSaved={person.reload} onConflict={latest} />
        <AccessCard user={user} />
      </div>
      {customer && billing && <ContactsCard contacts={billing.contacts} telegram={billing.telegram} />}
      <Activity id={id} onSignedOut={onSignedOut} watch={[billing, person.data]} />
      <DangerZone user={user} onSaved={person.reload} onConflict={latest} />
    </>
  );

  return (
    <>
      <p className="p-crumb"><Link to={home.to}><Icon name="back" />{home.label}</Link></p>
      <PageHead title={<span className="p-person p-person--head"><Avatar userId={user.id} version={user.avatar_version} name={user.name || user.email} size="lg" />{buyerName(user)}</span>} sub={[user.nickname && user.name, user.company, user.email, ROLE_LABEL[user.role] || user.role].filter(Boolean).join(' · ')}>
        {s && (
          <span className={`p-balance ${owes ? 'is-due' : 'is-ok'}`}>
            <span className="p-balance__dot" aria-hidden="true" />
            <span className="p-balance__label">{owes ? 'Owes' : 'In Credit'}</span>
            <b>{money(owes ? s.amount_due : s.balance, s.currency)}</b>
          </span>
        )}
      </PageHead>
      {!customer ? account : (
        <>
          <Tabs tab={tab} onChange={chooseTab} />
          <div id="tab-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
            {tab !== 'account' && <ErrorNote error={billingError} onRetry={loadBilling} />}
            {!billing && !billingError && tab !== 'account' && <div className="p-rows is-skeleton" />}
            {tab === 'calls' && billing && (billing.account ? (
              <>
                <ReplacedCalls id={id} account={billing.account} days={s.days} onSaved={setBilling} onBilling={loadBilling} onSignedOut={onSignedOut} />
                <Calls id={id} account={billing.account} picked={picked} versions={billing.day_versions} days={s.days} onSaved={setBilling} onConflict={latest} />
                <Ledger statement={s} onPick={(d) => { setPicked(d); window.scrollTo({ top: document.querySelector('.p-admin__calls')?.offsetTop ?? 0, behavior: 'smooth' }); }} />
              </>
            ) : <>{noBilling}<UnbilledCalls id={id} onSignedOut={onSignedOut} /></>)}
            {tab === 'billing' && billing && (
              <>
                <div className="p-grid">
                  <Terms key={billing.account ? 'set' : 'new'} id={id} account={billing.account} onSaved={(b) => { setBilling(b); person.reload(); }} onConflict={latest} />
                  {billing.account ? <Payment id={id} account={billing.account} onSaved={setBilling} /> : noBilling}
                </div>
                {s && <Payments id={id} statement={s} onSaved={setBilling} />}
              </>
            )}
            {tab === 'account' && account}
          </div>
        </>
      )}
    </>
  );
}
