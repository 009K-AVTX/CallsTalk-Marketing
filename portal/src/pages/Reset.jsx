import { useEffect, useState } from 'react';
import { LogoMark } from '../../../src/components/Logo.jsx';
import { completeReset, fetchReset, loadSession } from '../../../src/lib/portal.js';
import { navigate } from '../router.jsx';

const SITE = import.meta.env.VITE_SITE_URL || 'https://callstalk-marketing.vercel.app';
const token = () => new URLSearchParams(window.location.search).get('token') || '';
const home = () => ({ admin: '/admin', staff: '/upload' }[loadSession()?.role] || '/');

// The link from the "forgot password" email: a new password, confirmed with the authenticator code.
// The link works once and for a limited time; afterwards every other device is signed out.
export default function Reset() {
  const [reset, setReset] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState({ password: '', again: '', code: '' });
  const [status, setStatus] = useState('idle'); // idle | sending | error
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  useEffect(() => {
    document.title = 'Reset Your Password | CallsTalk Portal';
    if (!token()) return setLoadError('This reset link is incomplete. Please open it again from your email.');
    fetchReset(token()).then(setReset, (err) => setLoadError(err.message));
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password.length < 8) return setError('Use at least 8 characters for the password.') || setStatus('error');
    if (form.password !== form.again) return setError('The passwords do not match.') || setStatus('error');
    setStatus('sending');
    try {
      await completeReset(token(), form.password, form.code);
      window.history.replaceState({}, '', '/reset'); // the token is spent; keep it out of the history
      navigate(home(), { replace: true });
    } catch (err) {
      setForm((f) => ({ ...f, code: '' }));
      setError(err.message);
      setStatus('error');
    }
  };

  return (
    <main className="p-login">
      <div className="p-login__brand">
        <a href={SITE} className="p-brand" aria-label="CallsTalk website">
          <LogoMark className="p-brand__mark" />
          <span>Calls<b>Talk</b></span>
          <em>Portal</em>
        </a>
        <h1>Reset Your Password.</h1>
        <p>Choose a new password, then confirm the change with the 6-digit code from your authenticator app.</p>
        <ul className="p-login__points">
          <li>Your authenticator app stays the same</li>
          <li>All other devices are signed out</li>
          <li>We email you to confirm the change</li>
        </ul>
      </div>

      {!reset ? (
        <div className="access-card p-login__card">
          {loadError ? (
            <>
              <h2>Link Not Valid</h2>
              <p className="access-card__error" role="alert">{loadError}</p>
              <p className="portal-login__help"><a href="/login?forgot=1">Request a new reset link</a> or <a href="/login">log in</a>.</p>
            </>
          ) : <p className="access-card__lead">Verifying your reset link…</p>}
        </div>
      ) : (
        <form className="access-card p-login__card" onSubmit={submit}>
          <h2>Choose a New Password</h2>
          <p className="access-card__lead">For your login ID <b>{reset.email}</b>.</p>
          <label>New Password<input required type="password" value={form.password} onChange={set('password')} autoComplete="new-password" minLength={8} maxLength={200} autoFocus /></label>
          <label>Repeat New Password<input required type="password" value={form.again} onChange={set('again')} autoComplete="new-password" minLength={8} maxLength={200} /></label>
          <label>Verification Code<input required value={form.code} onChange={set('code')} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} placeholder="123456" /></label>
          {status === 'error' && <p className="access-card__error" role="alert">{error}</p>}
          <button type="submit" className="btn btn--light" disabled={status === 'sending'}>{status === 'sending' ? 'Updating…' : 'Update Password'}</button>
          <p className="portal-login__help">This link can be used once and expires at {new Date(reset.expires_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}. Lost access to your authenticator app? Please contact our support team.</p>
        </form>
      )}
    </main>
  );
}
