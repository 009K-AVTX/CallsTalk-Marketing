import { useEffect, useState } from 'react';
import { loadSession, signIn, verifyCode } from '../lib/portal.js';

// Customer sign-in at /login. Logins are issued by our team, so there is no sign-up here.
export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [mfa, setMfa] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | sending | error
  const [error, setError] = useState('');

  useEffect(() => {
    if (loadSession()?.access) window.location.replace('/dashboard');
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setStatus('sending');
    setError('');
    try {
      if (mfa) {
        await verifyCode(mfa, code, email);
      } else {
        const result = await signIn(email, password);
        if (result.mfa) {
          setMfa(result.mfa);
          setStatus('idle');
          return;
        }
      }
      window.location.assign('/dashboard');
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  };

  return (
    <main className="access-page portal-login">
      <div className="container access-page__inner">
        <div className="access-page__copy">
          <p className="legal__crumb"><a href="/">Home</a> / Log In</p>
          <h1>Your bill, live.</h1>
          <p className="lead">See your balance, today's calls and the last three days of statements, and pay whenever you are ready.</p>
          <ul className="assurances portal-login__points">
            <li>Updated as your calls arrive</li>
            <li>Your own price per call</li>
            <li>Pay online in a few clicks</li>
          </ul>
        </div>
        <form className="access-card" onSubmit={submit}>
          <h2>{mfa ? 'Enter Your Code' : 'Customer Log In'}</h2>
          <p className="access-card__lead">
            {mfa ? 'Open your authenticator app and enter the 6-digit code.' : 'Use the login ID and password our team gave you.'}
          </p>
          {mfa ? (
            <label>Code<input required value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={8} autoFocus /></label>
          ) : (
            <>
              <label>Login ID<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" maxLength={120} /></label>
              <label>Password<input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" maxLength={200} /></label>
            </>
          )}
          {status === 'error' && <p className="access-card__error" role="alert">{error}</p>}
          <button type="submit" className="btn btn--light" disabled={status === 'sending'}>
            {status === 'sending' ? 'Signing In…' : mfa ? 'Verify' : 'Log In'}
          </button>
          <p className="portal-login__help">No login yet? <a href="/request-access">Request access</a> or chat with us.</p>
        </form>
      </div>
    </main>
  );
}
