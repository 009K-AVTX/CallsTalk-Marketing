import { useCallback, useEffect, useRef, useState } from 'react';
import { LogoMark } from './Logo.jsx';
import {
  askAssistant, fetchMessages, liveChatEnabled, loadSession, saveSession, sendMessage, startChat,
} from '../lib/support.js';

const POLL_OPEN_MS = 3000;
const POLL_CLOSED_MS = 15000;

const suggestions = ['How does call tracking work?', 'Which plan fits my business?'];

const greeting = {
  id: 'greeting',
  from: 'assistant',
  text: 'Hi, this is CallsTalk. Ask me anything, or reach a person on our team.',
};

function HandoffForm({ initialMessage, onStart, onCancel }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState(initialMessage);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onStart({ name: name.trim(), email: email.trim(), message: message.trim() });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <form className="handoff" onSubmit={submit}>
      <p>Leave your details and our team will reply in this chat and by email.</p>
      <label>Name<input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" /></label>
      <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></label>
      <label>Message<textarea rows="3" value={message} onChange={(e) => setMessage(e.target.value)} required /></label>
      {error && <p className="chat__error" role="alert">{error}</p>}
      <div className="handoff__actions">
        <button type="button" className="chat__text-btn" onClick={onCancel}>Back</button>
        <button type="submit" className="btn btn--dark btn--sm" disabled={busy}>{busy ? 'Starting chat' : 'Start chat'}</button>
      </div>
    </form>
  );
}

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(null);
  const sessionRef = useRef(null);
  sessionRef.current = session;
  const [handoff, setHandoff] = useState(false);
  const [aiMessages, setAiMessages] = useState([greeting]);
  const [teamMessages, setTeamMessages] = useState([]);
  const [pending, setPending] = useState(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [unread, setUnread] = useState(false);
  const seenTeamReplies = useRef(0);
  const listRef = useRef(null);
  const inputRef = useRef(null);

  const refresh = useCallback(async () => {
    if (!session) return;
    try {
      const messages = await fetchMessages(session.sessionId);
      setTeamMessages(messages);
      setPending(null);
      const replies = messages.filter((m) => m.from === 'team').length;
      if (replies > seenTeamReplies.current && !open) setUnread(true);
      if (open) seenTeamReplies.current = replies;
    } catch (err) {
      if (/not found/i.test(err.message)) {
        saveSession(null);
        setSession(null);
      }
    }
  }, [session, open]);

  // Poll for team replies: often while the panel is open, rarely while closed, never in a hidden tab.
  useEffect(() => {
    if (!session) return undefined;
    refresh();
    const id = setInterval(() => {
      if (!document.hidden) refresh();
    }, open ? POLL_OPEN_MS : POLL_CLOSED_MS);
    return () => clearInterval(id);
  }, [session, open, refresh]);

  useEffect(() => {
    if (liveChatEnabled) setSession(loadSession());
  }, []);

  // Other parts of the page (the hero picker) can open the chat.
  useEffect(() => {
    const openChat = (e) => {
      setOpen(true);
      if (e.detail?.team && liveChatEnabled) setHandoff((h) => h || !sessionRef.current);
    };
    window.addEventListener('callstalk:open-chat', openChat);
    return () => window.removeEventListener('callstalk:open-chat', openChat);
  }, []);

  useEffect(() => {
    if (open) {
      setUnread(false);
      inputRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [aiMessages, teamMessages, pending, handoff, busy]);

  const ask = async (text) => {
    const next = [...aiMessages, { id: `u${Date.now()}`, from: 'visitor', text }];
    setAiMessages(next);
    setBusy(true);
    try {
      const history = next
        .filter((m) => m.id !== 'greeting')
        .map((m) => ({ role: m.from === 'visitor' ? 'user' : 'assistant', content: m.text }));
      const reply = await askAssistant(history);
      setAiMessages((list) => [...list, { id: `a${Date.now()}`, from: 'assistant', text: reply }]);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const send = async (e) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setDraft('');
    setError('');
    if (!session) {
      ask(text);
      return;
    }
    setBusy(true);
    setPending(text);
    try {
      await sendMessage(session.sessionId, text);
      await refresh();
    } catch (err) {
      setPending(null);
      setDraft(text);
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const start = async ({ name, email, message }) => {
    const sessionId = await startChat({ name, email, message });
    const next = { sessionId, name, email };
    saveSession(next);
    setSession(next);
    setHandoff(false);
  };

  const endChat = () => {
    saveSession(null);
    setSession(null);
    setTeamMessages([]);
    seenTeamReplies.current = 0;
  };

  const lastQuestion = [...aiMessages].reverse().find((m) => m.from === 'visitor')?.text || '';
  const showSuggestions = !session && !handoff && aiMessages.length === 1;

  return (
    <div className="chat">
      {open && (
        <section className="chat__panel" role="dialog" aria-label="Chat with CallsTalk" onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}>
          <header className="chat__head">
            <LogoMark />
            <div>
              <b>{session ? 'CallsTalk team' : 'CallsTalk assistant'}</b>
              <small>{session ? 'Replies here and by email' : 'Answers in seconds'}</small>
            </div>
            <button className="chat__close" aria-label="Close chat" onClick={() => setOpen(false)} />
          </header>

          <div className="chat__list" ref={listRef} aria-live="polite">
            {aiMessages.map((m) => <p key={m.id} className={`bubble bubble--${m.from}`}>{m.text}</p>)}
            {session && (
              <>
                <p className="chat__note">You are chatting with the CallsTalk team as {session.name}.</p>
                {teamMessages.map((m) => <p key={m.id} className={`bubble bubble--${m.from}`}>{m.text}</p>)}
                {pending && <p className="bubble bubble--visitor is-pending">{pending}</p>}
              </>
            )}
            {busy && !session && <p className="bubble bubble--assistant is-typing" aria-label="Assistant is typing"><i /><i /><i /></p>}
            {showSuggestions && (
              <div className="chat__suggestions">
                {suggestions.map((s) => <button key={s} onClick={() => ask(s)}>{s}</button>)}
              </div>
            )}
            {handoff && <HandoffForm initialMessage={lastQuestion} onStart={start} onCancel={() => setHandoff(false)} />}
          </div>

          {error && <p className="chat__error" role="alert">{error}</p>}

          {!handoff && (
            <form className="chat__compose" onSubmit={send}>
              <input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={session ? 'Message the team' : 'Ask a question'}
                aria-label="Message"
                maxLength={2000}
              />
              <button type="submit" className="chat__send" disabled={!draft.trim() || busy} aria-label="Send message" />
            </form>
          )}

          <footer className="chat__foot">
            {session && <button className="chat__text-btn" onClick={endChat}>End this chat</button>}
            {!session && !handoff && liveChatEnabled && (
              <button className="chat__text-btn" onClick={() => setHandoff(true)}>Talk to our team</button>
            )}
          </footer>
        </section>
      )}

      <button className="chat__launcher" aria-expanded={open} aria-label={open ? 'Close chat' : 'Chat with us'} onClick={() => setOpen(!open)}>
        <span className={`chat__dot${unread ? ' is-unread' : ''}`} aria-hidden="true" />
        <svg className="chat__icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H10l-4.5 3.4A.6.6 0 0 1 4.5 21l.6-3.1A3 3 0 0 1 2 15V7a3 3 0 0 1 3-3Z" /></svg>
        <span className="chat__label">{open ? 'Close chat' : 'Chat with us'}</span>
        {unread && <span className="sr-only">New reply from the team</span>}
      </button>
    </div>
  );
}
