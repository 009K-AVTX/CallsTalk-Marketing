import { useEffect, useState } from 'react';
import { LogoMark } from '../../../src/components/Logo.jsx';
import { completeSetup, fetchInvite, loadSession } from '../../../src/lib/portal.js';
import Icon from '../components/Icons.jsx';
import { navigate } from '../router.jsx';

const SITE = import.meta.env.VITE_SITE_URL || 'https://callstalk-marketing.vercel.app';
const token = () => new URLSearchParams(window.location.search).get('token') || '';
const home = () => ({ admin: '/admin', staff: '/upload' }[loadSession()?.role] || '/');

// The one-use link from the setup email: add CallsTalk to an authenticator app, choose a password,
// and confirm with the first code. The link stops working once this is done.
export default function Setup() {
  const [invite, setInvite] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState({ password: '', again: '', code: '' });
  const [status, setStatus] = useState('idle'); // idle | sending | error
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  useEffect(() => {
    document.title = 'Set Up Your Login | CallsTalk Portal';
    if (!token()) return setLoadError('This setup link is not complete. Open it again from your email.');
    fetchInvite(token()).then(setInvite, (err) => setLoadError(err.message));
  }, []);

  const copyKey = async () => {
    try {
      await navigator.clipboard.writeText(invite.secret.replace(/\s/g, ''));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked: the key is on screen to type */ }
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password.length < 8) return setError('Use at least 8 characters for the password.') || setStatus('error');
    if (form.password !== form.again) return setError('The passwords do not match.') || setStatus('error');
    setStatus('sending');
    try {
      await completeSetup(token(), form.password, form.code);
      window.history.replaceState({}, '', '/setup'); // the token is spent; keep it out of the history
      navigate(home(), { replace: true });
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  };

  return (
    <main className="p-login p-setup">
      <div className="p-login__brand">
        <a href={SITE} className="p-brand" aria-label="CallsTalk website">
          <LogoMark className="p-brand__mark" />
          <span>Calls<b>Talk</b></span>
          <em>Portal</em>
        </a>
        <h1>Set up your login.</h1>
        <p>Your login has two parts: a password you choose, and a 6-digit code from an authenticator app on your phone.</p>
        <ol className="p-setup__steps">
          <li><b>Add CallsTalk to your app</b>Google Authenticator, Microsoft Authenticator or Authy all work.</li>
          <li><b>Choose a password</b>At least 8 characters.</li>
          <li><b>Enter the code</b>The 6 digits the app shows for CallsTalk.</li>
        </ol>
      </div>

      {!invite ? (
        <div className="access-card p-login__card">
          {loadError ? (
            <>
              <h2>Link Not Valid</h2>
              <p className="access-card__error" role="alert">{loadError}</p>
              <p className="portal-login__help">Already set up? <a href="/login">Log in</a>.</p>
            </>
          ) : <p className="access-card__lead">Opening your setup link…</p>}
        </div>
      ) : (
        <form className="access-card p-login__card" onSubmit={submit}>
          <h2>Welcome{invite.name ? `, ${invite.name.split(' ')[0]}` : ''}</h2>
          <p className="access-card__lead">Your login ID is <b>{invite.email}</b>.</p>

          <div className="p-setup__qr">
            <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(invite.qr_svg)}`} alt="QR code to add CallsTalk to an authenticator app" width="168" height="168" />
            <div>
              <p><b>1. Scan this code</b> with your authenticator app.</p>
              <p className="p-setup__alt">Can't scan it? Choose <i>enter a setup key</i> in the app and type:</p>
              <button type="button" className="p-setup__key" onClick={copyKey} title="Copy the key">
                <code>{invite.secret}</code>
                <span>{copied ? <><Icon name="check" />Copied</> : 'Copy'}</span>
              </button>
              <a className="p-setup__open" href={invite.otpauth_url}>On this phone? Open in the app</a>
            </div>
          </div>

          <label>2. Choose a Password<input required type="password" value={form.password} onChange={set('password')} autoComplete="new-password" minLength={8} maxLength={200} /></label>
          <label>Repeat Password<input required type="password" value={form.again} onChange={set('again')} autoComplete="new-password" minLength={8} maxLength={200} /></label>
          <label>3. Code from the App<input required value={form.code} onChange={set('code')} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} placeholder="123456" /></label>

          {status === 'error' && <p className="access-card__error" role="alert">{error}</p>}
          <button type="submit" className="btn btn--light" disabled={status === 'sending'}>{status === 'sending' ? 'Setting Up…' : 'Finish Setup'}</button>
          <p className="portal-login__help">This link works once and expires on {new Date(invite.expires_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}.</p>
        </form>
      )}
    </main>
  );
}
