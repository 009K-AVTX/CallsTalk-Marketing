import { useState } from 'react';
import { TelegramIcon } from '../../../src/components/ContactLinks.jsx';
import { fetchNotices, saveNotices, sendSummaryNow } from '../admin.js';
import useLoad from '../useLoad.js';
import Icon from './Icons.jsx';
import { ErrorNote } from './Shell.jsx';

// Admin Settings: which billing notices the bot posts to the team (server/src/billing-notices.js).
export default function BillingNotices() {
  const loaded = useLoad(fetchNotices, []);
  const [form, setForm] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | saving | sending | done | error
  const [message, setMessage] = useState('');
  const saved = loaded.data?.settings;
  const values = form ?? saved;
  const dirty = Boolean(form && saved && ['payments', 'summary', 'summary_time'].some((k) => form[k] !== saved[k]));

  const set = (k, v) => {
    setForm({ ...values, [k]: v });
    setStatus('idle');
  };

  const run = async (kind, fn, done) => {
    setStatus(kind);
    setMessage('');
    try {
      await fn();
      setStatus('done');
      setMessage(done);
    } catch (err) {
      setStatus('error');
      setMessage(err.message);
    }
  };

  const save = (e) => {
    e.preventDefault();
    run('saving', async () => {
      await saveNotices(values);
      setForm(null);
      loaded.reload();
    }, 'Saved. The bot will follow these settings from now on.');
  };

  const test = () => run('sending', sendSummaryNow, 'The summary has been posted to the billing chat.');

  return (
    <form className="p-card p-form p-notices" onSubmit={save}>
      <header className="p-card__head">
        <div>
          <h2><TelegramIcon />Billing Notifications</h2>
          <p>What the bot posts to the team on Telegram about buyers' payments.</p>
        </div>
      </header>
      <ErrorNote error={loaded.error} onRetry={loaded.reload} />
      {!values && !loaded.error && <div className="p-rows is-skeleton" />}

      {values && (
        <>
          {!loaded.data.available && <p className="access-card__error" role="alert">The Telegram bot is not set up on the server, so nothing will be posted.</p>}
          <label className="p-check">
            <input type="checkbox" checked={values.payments} onChange={(e) => set('payments', e.target.checked)} />
            <span>
              <b>Each Payment Received</b>
              <small>When a USDT deposit completes or someone records a payment: the buyer, the amount, their new balance, and whether they are now Paid or still Pending.</small>
            </span>
          </label>
          <label className="p-check">
            <input type="checkbox" checked={values.summary} onChange={(e) => set('summary', e.target.checked)} />
            <span>
              <b>Daily Paid and Pending Summary</b>
              <small>Every buyer once a day: Paid, with how many more calls their credit covers at their price, or Pending, with what they owe and how many calls that is.</small>
            </span>
          </label>
          <label className="p-notices__time">
            <span>Send the Summary At</span>
            <span className="p-notices__clock">
              <input type="time" required value={values.summary_time} onChange={(e) => set('summary_time', e.target.value)} disabled={!values.summary} step={60} />
              <small>{loaded.data.time_zone}</small>
            </span>
          </label>
          {!loaded.data.separate_chat && (
            <p className="p-admin__note">These currently post in the website support chat. To keep them apart, set a billing topic or group on the server (TELEGRAM_BILLING_THREAD_ID or TELEGRAM_BILLING_CHAT_ID).</p>
          )}
          {message && <p className={status === 'error' ? 'access-card__error' : 'p-ok'} role={status === 'error' ? 'alert' : 'status'}>{status !== 'error' && <Icon name="check" />}{message}</p>}
          <div className="p-admin__actions">
            <button type="submit" className="btn btn--light btn--sm" disabled={!dirty || status === 'saving'}>{status === 'saving' ? 'Saving…' : 'Save'}</button>
            <button type="button" className="btn btn--quiet btn--sm" onClick={test} disabled={status === 'sending' || !loaded.data.available}>{status === 'sending' ? 'Posting…' : 'Post Summary Now'}</button>
          </div>
        </>
      )}
    </form>
  );
}
