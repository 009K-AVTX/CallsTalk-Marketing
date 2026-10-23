import { useState } from 'react';

const VOLUMES = ['Under 100', '100–1,000', '1,000–10,000', 'Over 10,000'];
const EMPTY = { name: '', email: '', company: '', phone: '', volume: '', message: '', website: '' };

// The request-access card: posts to /api/request-access, which forwards it to the team on Telegram.
export default function RequestAccess() {
  const [form, setForm] = useState(EMPTY);
  const [status, setStatus] = useState('idle'); // idle | sending | sent | error
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setStatus('sending');
    setError('');
    try {
      const res = await fetch('/api/request-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
      setStatus('sent');
      setForm(EMPTY);
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  };

  if (status === 'sent') {
    return (
      <div className="access-card access-card--sent" role="status">
        <span className="access-card__check" aria-hidden="true" />
        <h3>Request Received</h3>
        <p>Our team is reviewing it. Once it is approved, we will send your CallsTalk.io login link to the email address you provided.</p>
        <button type="button" className="btn btn--quiet btn--sm" onClick={() => setStatus('idle')}>Send Another</button>
      </div>
    );
  }

  return (
    <form className="access-card" onSubmit={submit} noValidate={false}>
      <h3>Request Access</h3>
      <p className="access-card__lead">Tell us about your business. Once your request is approved, we will email you a login link to your CallsTalk.io account.</p>
      <div className="access-card__grid">
        <label>Full Name<input required value={form.name} onChange={set('name')} autoComplete="name" maxLength={80} /></label>
        <label>Work Email<input required type="email" value={form.email} onChange={set('email')} autoComplete="email" maxLength={120} /></label>
        <label>Company<input required value={form.company} onChange={set('company')} autoComplete="organization" maxLength={120} /></label>
        <label><span className="access-card__name">Phone <i>optional</i></span><input type="tel" value={form.phone} onChange={set('phone')} autoComplete="tel" maxLength={40} /></label>
        <label className="access-card__wide">Calls per Month
          <select value={form.volume} onChange={set('volume')}>
            <option value="">Select a Range</option>
            {VOLUMES.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </label>
        <label className="access-card__wide"><span className="access-card__name">What would you like to track? <i>optional</i></span>
          <textarea rows="3" value={form.message} onChange={set('message')} maxLength={1000} />
        </label>
        {/* Hidden from people; bots that fill it are ignored. */}
        <input className="access-card__trap" tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} aria-hidden="true" name="website" />
      </div>
      {status === 'error' && <p className="access-card__error" role="alert">{error}</p>}
      <button type="submit" className="btn btn--light" disabled={status === 'sending'}>
        {status === 'sending' ? 'Sending…' : 'Request Access'}
      </button>
    </form>
  );
}
