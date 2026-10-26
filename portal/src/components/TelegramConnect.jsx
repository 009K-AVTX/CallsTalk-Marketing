import { useEffect, useRef, useState } from 'react';
import { TelegramIcon } from '../../../src/components/ContactLinks.jsx';
import { fetchTelegram, linkTelegram, unlinkTelegram } from '../../../src/lib/portal.js';
import { dayLabel } from '../format.js';
import useLoad from '../useLoad.js';
import Icon from './Icons.jsx';
import { ErrorNote } from './Shell.jsx';

const POLL_MS = 3000;

// Customer Settings: link their own Telegram chat with our bot, so a new report is announced there
// (server/src/telegram-link.js). Connect opens the bot with a one-use link; pressing Start in Telegram finishes it,
// and this card notices by asking every few seconds while it waits.
export default function TelegramConnect() {
  const state = useLoad(fetchTelegram, []);
  const [t, setT] = useState(null); // latest known state, once this card has changed it
  const [link, setLink] = useState(null); // { url, expires_at, bot } while waiting for Start
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [justConnected, setJustConnected] = useState(false);
  const opened = useRef(null);
  const data = t || state.data;

  // While waiting: check until Telegram reports the chat linked, or the link runs out.
  useEffect(() => {
    if (!link) return undefined;
    const id = setInterval(async () => {
      if (document.hidden) return;
      if (Date.now() > new Date(link.expires_at).getTime()) {
        setLink(null);
        setError('The link has expired. Press Connect Telegram to get a new one.');
        return;
      }
      try {
        const now = await fetchTelegram();
        if (now.connected) {
          setT(now);
          setLink(null);
          setJustConnected(true);
        }
      } catch { /* try again on the next tick */ }
    }, POLL_MS);
    return () => clearInterval(id);
  }, [link]);

  const connect = async () => {
    setError('');
    setJustConnected(false);
    setBusy(true);
    // Opened during the click, so the browser allows it; pointed at the bot once the link is known.
    opened.current = window.open('', '_blank');
    try {
      const next = await linkTelegram();
      setLink(next);
      if (opened.current) {
        opened.current.opener = null;
        opened.current.location.href = next.url;
      }
    } catch (err) {
      opened.current?.close();
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!window.confirm('Stop receiving CallsTalk notifications on Telegram?')) return;
    setError('');
    setBusy(true);
    try {
      setT(await unlinkTelegram());
      setJustConnected(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const who = data?.username ? `@${data.username}` : data?.first_name || 'Your Telegram';

  return (
    <section className="p-card p-telegram" aria-live="polite">
      <header className="p-card__head">
        <div>
          <h2><TelegramIcon />Telegram Notifications</h2>
          <p>Receive a Telegram message as soon as a new billing report is ready to download.</p>
        </div>
        {data && <span className={`p-pill ${data.connected ? 'is-ok' : link ? 'is-wait' : ''}`}>{data.connected ? 'Connected' : link ? 'Waiting' : 'Not Connected'}</span>}
      </header>
      <ErrorNote error={state.error} onRetry={state.reload} />

      {!data && !state.error && <div className="p-rows is-skeleton" />}

      {data && !data.available && !data.connected && (
        <p className="p-admin__note">Telegram notifications are not available at the moment. Reports remain available under Reports, and we will also email you.</p>
      )}

      {data?.connected && (
        <>
          <dl className="p-facts">
            <div><dt>Connected As</dt><dd>{who}</dd></div>
            <div><dt>Since</dt><dd>{data.linked_at ? dayLabel(data.linked_at.slice(0, 10)) : '—'}</dd></div>
          </dl>
          {justConnected && <p className="p-ok" role="status"><Icon name="check" />Telegram is connected. We have sent a confirmation to your chat.</p>}
          <p className="p-admin__note">Messages come from <b>@{data.bot || 'our bot'}</b>. You can also send /stop in that chat to turn them off.</p>
          <button type="button" className="btn btn--quiet btn--sm" onClick={disconnect} disabled={busy}>{busy ? 'Disconnecting…' : 'Disconnect'}</button>
        </>
      )}

      {data?.available && !data.connected && !link && (
        <>
          <p className="p-admin__note">Telegram will open the <b>@{data.bot}</b> chat. Press <b>Start</b> there and this page will confirm the connection.</p>
          <button type="button" className="btn btn--light btn--sm" onClick={connect} disabled={busy}><TelegramIcon />{busy ? 'Opening Telegram…' : 'Connect Telegram'}</button>
        </>
      )}

      {link && (
        <div className="p-telegram__wait">
          <p><span className="billing__pulse is-busy" aria-hidden="true" /><span>Waiting for you to press <b>Start</b> in Telegram…</span></p>
          <p className="p-admin__note">If Telegram did not open, use the button below. The link works once and expires at {new Date(link.expires_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}.</p>
          <div className="p-admin__actions">
            <a className="btn btn--light btn--sm" href={link.url} target="_blank" rel="noopener noreferrer"><TelegramIcon />Open Telegram</a>
            <button type="button" className="btn btn--quiet btn--sm" onClick={() => setLink(null)}>Cancel</button>
          </div>
        </div>
      )}

      {error && <p className="access-card__error" role="alert">{error}</p>}
    </section>
  );
}
