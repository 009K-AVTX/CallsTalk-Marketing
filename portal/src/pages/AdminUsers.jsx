import { useEffect, useState } from 'react';
import { Avatar } from '../avatar.jsx';
import { createUser, listUsers, loginState, signedIn, TIME_ZONES } from '../admin.js';
import Icon from '../components/Icons.jsx';
import { ErrorNote, PageHead } from '../components/Shell.jsx';
import { money, today } from '../format.js';
import { navigate } from '../router.jsx';
import useLoad from '../useLoad.js';
import Select from '../../../src/components/Select.jsx';

export const ROLE_LABEL = { customer: 'Customer', staff: 'Staff', admin: 'Admin' };

export const when = (iso) => (iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');

export function StatePill({ user }) {
  const s = loginState(user);
  return <span className={`p-pill is-${s.tone}`}>{s.label}</span>;
}

// The setup link after it is made: whether it was emailed, and the link itself to pass on another way.
export function LinkResult({ result, email }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result.invite_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked: the link is on screen */ }
  };
  return (
    <div className={`p-linkbox${result.emailed ? '' : ' is-warn'}`} role="status">
      <p>
        {result.emailed
          ? <><Icon name="check" /><span>Setup link <b>emailed to {email}</b>. It works once, until {when(result.expires_at)}.</span></>
          : <><Icon name="alert" /><span><b>Not emailed.</b> {result.email_error} It works once, until {when(result.expires_at)}.</span></>}
      </p>
      <div className="p-linkbox__url">
        <code>{result.invite_url}</code>
        <button type="button" className="btn btn--quiet btn--sm" onClick={copy}><Icon name={copied ? 'check' : 'link'} />{copied ? 'Copied' : 'Copy Link'}</button>
      </div>
    </div>
  );
}

const BLANK = { role: 'customer', name: '', email: '', company: '', price_per_call: '', opening_balance: '0', start_date: '', timezone: TIME_ZONES[0] };

// `roles`: the kinds of login this person may add (staff: customers only).
export function NewLogin({ onCreated, roles = ['customer', 'staff', 'admin'] }) {
  const [form, setForm] = useState({ ...BLANK, start_date: today() });
  const [status, setStatus] = useState('idle'); // idle | sending | error
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const customer = form.role === 'customer';

  const submit = async (e) => {
    e.preventDefault();
    setStatus('sending');
    setError('');
    try {
      const done = await createUser(customer ? form : { role: form.role, name: form.name, email: form.email, company: form.company });
      setResult({ ...done, email: done.user.email });
      setForm({ ...BLANK, start_date: today() });
      setStatus('idle');
      onCreated();
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  };

  return (
    <form className="p-card p-form p-admin__new" onSubmit={submit}>
      <header className="p-card__head">
        <div><h2>New Login</h2><p>We will email them a single-use link to choose a password and add their authenticator app.</p></div>
        {roles.length > 1 && (
          <div className="p-ranges" role="radiogroup" aria-label="Role">
            {roles.map((r) => (
              <button key={r} type="button" role="radio" aria-checked={form.role === r} className={form.role === r ? 'is-on' : ''} onClick={() => setForm({ ...form, role: r })}>
                {ROLE_LABEL[r]}
              </button>
            ))}
          </div>
        )}
      </header>
      <div className="p-form__row">
        <label>Full Name<input required value={form.name} onChange={set('name')} maxLength={100} autoComplete="off" /></label>
        <label>Email (Login ID)<input required type="email" value={form.email} onChange={set('email')} maxLength={200} autoComplete="off" /></label>
      </div>
      <label><span>Company {!customer && <i className="p-optional">optional</i>}</span><input required={customer} value={form.company} onChange={set('company')} maxLength={120} autoComplete="off" /></label>
      {customer ? (
        <>
          <div className="p-form__row">
            <label>Price per Call ($)<input required type="number" min="0" step="0.01" value={form.price_per_call} onChange={set('price_per_call')} placeholder="35.00" /></label>
            <label><span>Opening Balance ($) <i className="p-optional">negative = owes us</i></span><input required type="number" step="0.01" value={form.opening_balance} onChange={set('opening_balance')} /></label>
          </div>
          <div className="p-form__row">
            <label>Billing Starts<input required type="date" value={form.start_date} max={today()} onChange={set('start_date')} /></label>
            <label>Days Counted In<Select value={form.timezone} onChange={set('timezone')}>{TIME_ZONES.map((z) => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}</Select></label>
          </div>
        </>
      ) : <p className="p-admin__note">{form.role === 'staff'
        ? 'Staff can upload and remove customer reports and add customers; they cannot see billing, payments or logins.'
        : 'Admins can add and turn off logins, enter calls and payments, and upload reports for every customer.'}</p>}
      {status === 'error' && <p className="access-card__error" role="alert">{error}</p>}
      <button type="submit" className="btn btn--light" disabled={status === 'sending'}>{status === 'sending' ? 'Creating…' : 'Create Login and Send Link'}</button>
      {result && <LinkResult result={result} email={result.email} />}
    </form>
  );
}

const PAGE = 50;

export default function AdminUsers({ onSignedOut }) {
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState('');
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [offset, setOffset] = useState(0);
  // The server searches and pages (50 at a time); typing waits a moment before asking.
  useEffect(() => {
    const t = setTimeout(() => setQ(filter.trim()), 300);
    return () => clearTimeout(t);
  }, [filter]);
  useEffect(() => setOffset(0), [q, role]);
  const users = useLoad(signedIn(onSignedOut, () => listUsers({ q, role, limit: PAGE, offset })), [q, role, offset]);
  // The heading counts everyone, so it keeps the figures from the last page loaded without a search.
  const [overall, setOverall] = useState(null);
  useEffect(() => {
    if (users.data && !q) setOverall(users.data);
  }, [users.data, q]);

  const page = users.data;
  const shown = page?.results || [];
  const total = page?.total || 0;
  const count = (r) => page?.counts?.[r] || 0;
  const everyone = count('customer') + count('staff') + count('admin');
  const counted = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const all = (r) => overall?.counts?.[r] || 0;
  const waiting = overall?.waiting || 0;
  const summary = [counted(all('customer'), 'customer'), all('staff') && `${all('staff')} staff`, counted(all('admin'), 'admin'), waiting && `${waiting} not set up yet`];

  return (
    <>
      <PageHead title="Logins" sub={overall ? summary.filter(Boolean).join(' · ') : 'Loading…'}>
        <button type="button" className="btn btn--quiet btn--sm" onClick={users.reload}><Icon name="refresh" />Refresh</button>
        <button type="button" className="btn btn--light btn--sm" onClick={() => setAdding(!adding)} aria-expanded={adding}><Icon name={adding ? 'close' : 'plus'} />{adding ? 'Close' : 'New Login'}</button>
      </PageHead>
      <ErrorNote error={users.error} onRetry={users.reload} />
      {adding && <NewLogin onCreated={users.reload} />}

      <section className="p-card p-card--flush">
        <header className="p-card__head">
          <div><h2>Everyone Who Can Sign In</h2><p>Open a login to change it, send a new link, or enter a customer's calls and payments.</p></div>
          <div className="p-card__tools p-card__tools--wrap">
            <div className="p-ranges" role="radiogroup" aria-label="Show">
              {[['', 'Everyone', everyone], ['customer', 'Customers', count('customer')], ['staff', 'Staff', count('staff')], ['admin', 'Admins', count('admin')]].map(([key, label, n]) => (
                <button key={key || 'all'} type="button" role="radio" aria-checked={role === key} className={role === key ? 'is-on' : ''} onClick={() => setRole(key)}>
                  {label}<span className="p-ranges__count">{n}</span>
                </button>
              ))}
            </div>
            <label className="p-search"><span className="sr-only">Filter</span><input type="search" placeholder="Name, email or company" value={filter} onChange={(e) => setFilter(e.target.value)} /></label>
          </div>
        </header>
        <div className="p-tablewrap">
          <table className={`p-table p-table--click${users.loading ? ' is-loading' : ''}`}>
            <thead><tr><th scope="col">Name</th><th scope="col">Login ID</th><th scope="col">Role</th><th scope="col">Status</th><th scope="col">Price / Call</th><th scope="col">Last Log In</th></tr></thead>
            <tbody>
              {shown.map((u) => {
                const open = () => navigate(`/admin/users/${u.id}`);
                return (
                  <tr key={u.id} tabIndex={0} onClick={open} onKeyDown={(e) => e.key === 'Enter' && open()}>
                    <th scope="row">
                      <span className="p-person">
                        <Avatar userId={u.id} version={u.avatar_version} name={u.name || u.email} size="sm" />
                        <span>{u.name || '—'}{u.company && <small className="p-up__file">{u.company}</small>}</span>
                      </span>
                    </th>
                    <td>{u.email}</td>
                    <td>{ROLE_LABEL[u.role] || u.role}</td>
                    <td><StatePill user={u} /></td>
                    <td>{u.role === 'customer' && u.price_per_call != null ? money(u.price_per_call, u.currency) : '—'}</td>
                    <td>{when(u.last_login_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {page && !shown.length && <p className="p-empty">{q || role ? 'No logins match. Clear the filter or pick Everyone.' : 'No logins yet. Use New Login to add the first one.'}</p>}
        </div>
        {total > PAGE && (
          <div className="p-pager">
            <span>{offset + 1}–{offset + shown.length} of {total}</span>
            <div>
              <button type="button" className="btn btn--quiet btn--sm" disabled={!offset || users.loading} onClick={() => setOffset(Math.max(0, offset - PAGE))}>Previous</button>
              <button type="button" className="btn btn--quiet btn--sm" disabled={offset + PAGE >= total || users.loading} onClick={() => setOffset(offset + PAGE)}>Next</button>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
