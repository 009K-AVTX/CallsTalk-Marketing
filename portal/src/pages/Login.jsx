import { useEffect, useState } from 'react';
import { LogoMark } from '../../../src/components/Logo.jsx';
import { loadSession, previewMode, signIn, verifyCode } from '../../../src/lib/portal.js';
import { navigate } from '../router.jsx';

const SITE = import.meta.env.VITE_SITE_URL || 'https://callstalk-marketing.vercel.app';

const next = () => {
  const n = new URLSearchParams(window.location.search).get('next') || '/';
  return n.startsWith('/') && !n.startsWith('//') && n !== '/login' ? n : '/';
};

// Logins are issued by our team, so there is no sign-up here.
export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [mfa, setMfa] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | sending | error
  const [error, setError] = useState('');

  useEffect(() => {
    document.title = 'Log In | CallsTalk Portal';
    if (loadSession()?.access) navigate(next(), { replace: true });
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setStatus('sending');
    setError('');
    try {
      if (mfa) await verifyCode(mfa, code, email);
      else {
        const result = await signIn(email, password);
        if (result.mfa) {
          setMfa(result.mfa);
          setStatus('idle');
          return;
        }
      }
      navigate(next(), { replace: true });
    } catch (err) {
      // The password step lasts five minutes; after that, start again from the password.
      if (mfa && /timed out/.test(err.message)) setMfa(null);
      setError(err.message);
      setStatus('error');
    }
  };

  const restart = () => {
    setMfa(null);
    setCode('');
    setError('');
    setStatus('idle');
  };

  return (
    <main className="p-login">
      <div className="p-login__brand">
        <a href={SITE} className="p-brand" aria-label="CallsTalk website">
          <LogoMark className="p-brand__mark" />
          <span>Calls<b>Talk</b></span>
          <em>Portal</em>
        </a>
        <h1>Your CallsTalk Bill, Always Up to Date.</h1>
        <p>See Your Balance and Daily Bills, Open the Billing Reports Our Team Sends You, and Settle Your Account Online.</p>
        <ul className="p-login__points">
          <li>Live Balance and Your Last 5 Days of Bills</li>
          <li>Billing Reports from Our Team, in Excel</li>
          <li>Pay in USDT (TRC-20) to Your Own Address</li>
        </ul>
      </div>
      <form className="access-card p-login__card" onSubmit={submit}>
        {previewMode && <p className="p-demo p-demo--login">Demo: enter any email and password to explore with sample data.</p>}
        <h2>{mfa ? 'Enter Your Code' : 'Log In'}</h2>
        <p className="access-card__lead">
          {mfa ? 'Open your authenticator app and enter the 6-digit code it shows for CallsTalk.' : 'Use your login ID and the password you chose when you set up your login.'}
        </p>
        {mfa ? (
          <label>Code<input required value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={8} placeholder="123456" autoFocus /></label>
        ) : (
          <>
            <label>Login ID<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" maxLength={120} autoFocus /></label>
            <label>Password<input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" maxLength={200} /></label>
          </>
        )}
        {status === 'error' && <p className="access-card__error" role="alert">{error}</p>}
        <button type="submit" className="btn btn--light" disabled={status === 'sending'}>
          {status === 'sending' ? 'Signing In…' : mfa ? 'Verify' : 'Log In'}
        </button>
        {mfa ? (
          <p className="portal-login__help">Lost your phone? Ask our team to reset your login. <button type="button" className="p-linkbtn" onClick={restart}>Use Another Login</button></p>
        ) : (
          <p className="portal-login__help">No login yet? <a href={`${SITE}/request-access`}>Request Access</a>.</p>
        )}
      </form>
    </main>
  );
}
