import { useState } from 'react';
import { TelegramIcon } from '../../../src/components/ContactLinks.jsx';
import { SUPPORT_EMAIL, TELEGRAM_HANDLE } from '../../../src/legal.js';
import { BILLING_FROM, changePassword, fetchProfile } from '../../../src/lib/portal.js';
import Icon from '../components/Icons.jsx';
import { ErrorNote, logOut, PageHead } from '../components/Shell.jsx';
import { dayLabel, money } from '../format.js';
import useLoad from '../useLoad.js';
import { AvatarEditor } from '../avatar.jsx';

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
      {status === 'done' && <p className="p-ok" role="status"><Icon name="check" />Password changed. Other devices are signed out.</p>}
      <div className="p-admin__actions">
        <button type="submit" className="btn btn--light" disabled={status === 'sending'}>
          {status === 'sending' ? 'Checking…' : step === 'code' ? 'Confirm and Change Password' : 'Continue'}
        </button>
        {step === 'code' && <button type="button" className="btn btn--quiet" onClick={back} disabled={status === 'sending'}>Back</button>}
      </div>
    </form>
  );
}

// Admins and staff (`team`) have no billing account, so they get their login and password only.
export default function Settings({ statement, team }) {
  const label = { admin: 'Admin', staff: 'Staff' }[team];
  const profile = useLoad(fetchProfile, []);
  const p = profile.data;
  const s = statement?.data;
  const name = p ? [p.first_name, p.last_name].filter(Boolean).join(' ') : '';

  return (
    <>
      <PageHead title="Settings" sub={team ? `Your ${team} login.` : 'Your login, your account and how to reach us.'} />
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
          <p className="p-admin__note">Logging in asks for your password and then the code from your authenticator app. Lost your phone? {team === 'admin' ? 'Another admin' : team ? 'An admin' : 'Our team'} can reset your login.</p>
          <button type="button" className="btn btn--quiet btn--sm p-logout" onClick={logOut}><Icon name="logout" />Log Out</button>
        </section>
        {!team && (
          <section className="p-card">
            <header className="p-card__head"><div><h2>Your Account</h2><p>Set by our team. Ask us if anything should change.</p></div></header>
            <dl className="p-facts">
              <div><dt>Price per Converted Call</dt><dd>{s ? money(s.price_per_call, s.currency) : '—'}</dd></div>
              <div><dt>Currency</dt><dd>{s?.currency || '—'}</dd></div>
              <div><dt>Days Counted In</dt><dd>{s ? s.timezone.replace(/_/g, ' ') : '—'}</dd></div>
              <div><dt>Billing Since</dt><dd>{dayLabel(s?.billing_since || BILLING_FROM)}</dd></div>
            </dl>
          </section>
        )}
        {team && <PasswordForm />}
      </div>
      {!team && <div className="p-grid">
        <PasswordForm />
        <section className="p-card">
          <header className="p-card__head"><div><h2>Help</h2><p>Questions about calls, your price or a bill.</p></div></header>
          <ul className="contact">
            <li><a href={`https://t.me/${TELEGRAM_HANDLE}`} target="_blank" rel="noopener noreferrer"><TelegramIcon /><span><small>Telegram</small>@{TELEGRAM_HANDLE}</span></a></li>
            <li><a href={`mailto:${SUPPORT_EMAIL}`}><svg className="contact__icon contact__icon--mail" viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="5" width="19" height="14" rx="3" /><path d="m3.5 7 8.5 6 8.5-6" /></svg><span><small>Email</small>{SUPPORT_EMAIL}</span></a></li>
          </ul>
        </section>
      </div>}
    </>
  );
}
