import { useState } from 'react';
import { TelegramIcon } from '../../../src/components/ContactLinks.jsx';
import { SUPPORT_EMAIL, TELEGRAM_HANDLE } from '../../../src/legal.js';
import { BILLING_FROM, changePassword, fetchContacts, fetchProfile, saveContacts } from '../../../src/lib/portal.js';
import { CONTACT_METHODS } from '../contacts.js';
import Icon from '../components/Icons.jsx';
import { ErrorNote, logOut, PageHead } from '../components/Shell.jsx';
import { dayLabel, money } from '../format.js';
import useLoad from '../useLoad.js';
import { AvatarEditor } from '../avatar.jsx';
import TelegramConnect from '../components/TelegramConnect.jsx';
import BillingNotices from '../components/BillingNotices.jsx';

// Two steps: the passwords, then the code from the authenticator app. Nothing changes until the code is right.
function PasswordForm() {
  const blank = { current: '', next: '', again: '', code: '' };
  const [form, setForm] = useState(blank);
  const [step, setStep] = useState('passwords'); // passwords | code
  const [status, setStatus] = useState('idle'); // idle | sending | done | error
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.next.length < 8) return setError('Use at least 8 characters for the new password.') || setStatus('error');
    if (form.next !== form.again) return setError('The new passwords do not match.') || setStatus('error');
    setStatus('sending');
    try {
      if (step === 'passwords') {
        await changePassword(form.current, form.next); // checks the passwords, asks for the code
        setStep('code');
        setStatus('idle');
        return;
      }
      await changePassword(form.current, form.next, form.code);
      setForm(blank);
      setStep('passwords');
      setStatus('done');
    } catch (err) {
      if (/current password/.test(err.message)) setStep('passwords');
      setForm((f) => ({ ...f, code: '' }));
      setError(err.message);
      setStatus('error');
    }
  };

  const back = () => {
    setStep('passwords');
    setForm({ ...form, code: '' });
    setError('');
    setStatus('idle');
  };

  return (
    <form className="p-card p-form" onSubmit={submit}>
      <header className="p-card__head">
        <div>
          <h2>Change Password</h2>
          <p>{step === 'code' ? 'Enter the 6-digit code from your authenticator app to confirm.' : 'At least 8 characters.'}</p>
        </div>
      </header>
      {step === 'passwords' ? (
        <>
          <label>Current Password<input type="password" required value={form.current} onChange={set('current')} autoComplete="current-password" /></label>
          <label>New Password<input type="password" required value={form.next} onChange={set('next')} autoComplete="new-password" minLength={8} /></label>
          <label>Repeat New Password<input type="password" required value={form.again} onChange={set('again')} autoComplete="new-password" minLength={8} /></label>
        </>
      ) : (
        <label>Code from the App<input required value={form.code} onChange={set('code')} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} placeholder="123456" autoFocus /></label>
      )}
      {status === 'error' && <p className="access-card__error" role="alert">{error}</p>}
      {status === 'done' && <p className="p-ok" role="status"><Icon name="check" />Your password has been updated. All other devices have been signed out.</p>}
      <div className="p-admin__actions">
        <button type="submit" className="btn btn--light" disabled={status === 'sending'}>
          {status === 'sending' ? 'Checking…' : step === 'code' ? 'Confirm and Change Password' : 'Continue'}
        </button>
        {step === 'code' && <button type="button" className="btn btn--quiet" onClick={back} disabled={status === 'sending'}>Back</button>}
      </div>
    </form>
  );
}

// Other ways our team can reach the customer. Saving a change emails our team what changed.
function ContactsForm() {
  const loaded = useLoad(fetchContacts, []);
  const [form, setForm] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | sending | done | error
  const [message, setMessage] = useState('');
  const values = form ?? Object.fromEntries(CONTACT_METHODS.map(({ key }) => [key, loaded.data?.[key] || '']));
  const set = (k) => (e) => {
    setForm({ ...values, [k]: e.target.value });
    if (status !== 'sending') setStatus('idle');
  };

  const submit = async (e) => {
    e.preventDefault();
    setStatus('sending');
    setMessage('');
    try {
      const { contacts, changed } = await saveContacts(values);
      setForm(Object.fromEntries(CONTACT_METHODS.map(({ key }) => [key, contacts[key] || ''])));
      setMessage(changed.length ? 'Your contact details have been updated and our team has been notified.' : 'There are no changes to save.');
      setStatus('done');
    } catch (err) {
      setMessage(err.message);
      setStatus('error');
    }
  };

  return (
    <form className="p-card p-form p-contacts" onSubmit={submit}>
      <header className="p-card__head">
        <div><h2>Contact Methods</h2><p>Additional channels through which our team may contact you. All fields are optional; clear a field to remove it.</p></div>
      </header>
      <ErrorNote error={loaded.error} onRetry={loaded.reload} />
      <div className="p-contacts__grid">
        {CONTACT_METHODS.map(({ key, label, icon: AppIcon, placeholder, hint, type }) => (
          <label key={key}>
            <span className="p-contacts__label"><AppIcon />{label}</span>
            <input type={type || 'text'} value={values[key]} onChange={set(key)} placeholder={placeholder} maxLength={120} autoComplete="off" disabled={loaded.loading && !form} />
            <small className="p-up__hint">{hint}</small>
          </label>
        ))}
      </div>
      {status === 'error' && <p className="access-card__error" role="alert">{message}</p>}
      {status === 'done' && <p className="p-ok" role="status"><Icon name="check" />{message}</p>}
      <button type="submit" className="btn btn--light btn--sm" disabled={status === 'sending'}>{status === 'sending' ? 'Saving…' : 'Save Contact Methods'}</button>
    </form>
  );
}

// Admins and staff (`team`) have no billing account, so they get their login and password only.
export default function Settings({ statement, team }) {
  const label = { owner: 'Owner', admin: 'Admin', staff: 'Billing' }[team];
  const profile = useLoad(fetchProfile, []);
  const p = profile.data;
  const s = statement?.data;
  const name = p ? [p.first_name, p.last_name].filter(Boolean).join(' ') : '';

  return (
    <>
      <PageHead title="Settings" sub={team ? `Your ${label.toLowerCase()} login.` : 'Your login, your account and how to reach us.'} />
      <ErrorNote error={profile.error} onRetry={profile.reload} />
      <div className="p-grid">
        <section className="p-card">
          <header className="p-card__head"><div><h2>Your Login</h2></div></header>
          <AvatarEditor />
          <dl className="p-facts">
            <div><dt>Name</dt><dd>{name || '—'}</dd></div>
            <div><dt>Login ID</dt><dd>{p?.email || '—'}</dd></div>
            <div><dt>Company</dt><dd>{(team ? p?.company : s?.customer) || '—'}</dd></div>
            <div><dt>Access</dt><dd>{label || 'Customer'}</dd></div>
          </dl>
          <p className="p-admin__note">Signing in requires your password and a verification code from your authenticator app. If you lose access to the app, {team === 'owner' ? 'another Owner' : team === 'admin' ? 'another admin' : team ? 'an admin' : 'our support team'} can reset your login.</p>
          <button type="button" className="btn btn--quiet btn--sm p-logout" onClick={logOut}><Icon name="logout" />Log Out</button>
        </section>
        {!team && (
          <section className="p-card">
            <header className="p-card__head"><div><h2>Your Account</h2><p>Set by our team. Please contact us if any changes are required.</p></div></header>
            <dl className="p-facts">
              <div><dt>Price per Converted Call</dt><dd>{s ? (Number(s.price_per_call) ? money(s.price_per_call, s.currency) : 'Not set yet') : '—'}</dd></div>
              <div><dt>Currency</dt><dd>{s?.currency || '—'}</dd></div>
              <div><dt>Days Counted In</dt><dd>{s ? s.timezone.replace(/_/g, ' ') : '—'}</dd></div>
              <div><dt>Billing Since</dt><dd>{dayLabel(s?.billing_since || BILLING_FROM)}</dd></div>
            </dl>
          </section>
        )}
        {team && <PasswordForm />}
      </div>
      {(team === 'admin' || team === 'owner') && <BillingNotices />}
      {!team && <TelegramConnect />}
      {!team && <ContactsForm />}
      {!team && <div className="p-grid">
        <PasswordForm />
        <section className="p-card">
          <header className="p-card__head"><div><h2>Help</h2><p>For questions regarding calls, pricing or billing.</p></div></header>
          <ul className="contact">
            <li><a href={`https://t.me/${TELEGRAM_HANDLE}`} target="_blank" rel="noopener noreferrer"><TelegramIcon /><span><small>Telegram</small>@{TELEGRAM_HANDLE}</span></a></li>
            <li><a href={`mailto:${SUPPORT_EMAIL}`}><svg className="contact__icon contact__icon--mail" viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="5" width="19" height="14" rx="3" /><path d="m3.5 7 8.5 6 8.5-6" /></svg><span><small>Email</small>{SUPPORT_EMAIL}</span></a></li>
          </ul>
        </section>
      </div>}
    </>
  );
}
