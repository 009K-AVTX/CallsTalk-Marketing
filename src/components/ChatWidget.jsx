import { useCallback, useEffect, useRef, useState } from 'react';
import { LogoMark } from './Logo.jsx';
import {
  endChat as closeChat, fetchMessages, liveChatEnabled, loadChats, MAX_CHATS, saveChats, sendMessage, startChat,
} from '../lib/support.js';

const POLL_OPEN_MS = 3000;
const POLL_CLOSED_MS = 15000;

const suggestions = ['How does call tracking work?', 'Which plan fits my business?'];

const GREETING = 'Hello. Ask us anything about CallsTalk and our team will reply right here.';

const startedAt = (time) => new Date(time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

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
  // Up to MAX_CHATS chats, oldest first. `activeId` null means the "new chat" screen.
  const [chats, setChats] = useState([]);
  const chatsRef = useRef(chats);
  chatsRef.current = chats;
  const [activeId, setActiveId] = useState(null);
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;
  const [messages, setMessages] = useState({});
  const [unread, setUnread] = useState({});
  const seenReplies = useRef({});
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [handoff, setHandoff] = useState(false);
  // Details of a chat waiting for the visitor to agree to end their oldest one.
  const [confirm, setConfirm] = useState(null);
  const [pending, setPending] = useState(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const listRef = useRef(null);
  const inputRef = useRef(null);

  const active = chats.find((c) => c.sessionId === activeId) || null;
  const hasUnread = Object.values(unread).some(Boolean);

  const updateChats = useCallback((change) => {
    const next = change(chatsRef.current);
    chatsRef.current = next;
    saveChats(next);
    setChats(next);
  }, []);

  // Drops a chat from the sidebar and from memory.
  const forget = useCallback((sessionId) => {
    updateChats((all) => all.filter((c) => c.sessionId !== sessionId));
    setMessages(({ [sessionId]: _, ...rest }) => rest);
    setUnread(({ [sessionId]: _, ...rest }) => rest);
    delete seenReplies.current[sessionId];
  }, [updateChats]);

  const refresh = useCallback(async (sessionId) => {
    try {
      const { ended, messages: list } = await fetchMessages(sessionId);
      // Ended chats clear themselves; the one being read stays until the visitor moves on.
      if (ended && sessionId !== activeIdRef.current) {
        forget(sessionId);
        return;
      }
      setMessages((all) => ({ ...all, [sessionId]: list }));
      if (ended) updateChats((all) => all.map((c) => (c.sessionId === sessionId && !c.ended ? { ...c, ended: true } : c)));
      const replies = list.filter((m) => m.from === 'team').length;
      const watching = open && sessionId === activeId;
      if (watching) seenReplies.current[sessionId] = replies;
      else if (replies > (seenReplies.current[sessionId] ?? replies)) setUnread((u) => ({ ...u, [sessionId]: true }));
      seenReplies.current[sessionId] ??= replies;
    } catch (err) {
      if (/not found/i.test(err.message)) forget(sessionId);
    }
  }, [open, activeId, updateChats, forget]);

  // Poll every open chat for replies: often while the panel is open, rarely while closed, never in a hidden tab.
  const openIds = chats.filter((c) => !c.ended).map((c) => c.sessionId).join(',');
  useEffect(() => {
    if (!openIds) return undefined;
    const poll = () => openIds.split(',').forEach(refresh);
    poll();
    const id = setInterval(() => {
      if (!document.hidden) poll();
    }, open ? POLL_OPEN_MS : POLL_CLOSED_MS);
    return () => clearInterval(id);
  }, [openIds, open, refresh]);

  // Restore the visitor's chats, leaving out any that ended. Open ones that no longer exist on the
  // server drop out on the first poll.
  useEffect(() => {
    if (!liveChatEnabled) return;
    updateChats(() => loadChats().filter((c) => !c.ended));
    setActiveId(chatsRef.current.at(-1)?.sessionId ?? null);
  }, [updateChats]);

  // Other parts of the page (the hero picker) can open the chat.
  useEffect(() => {
    const openChat = (e) => {
      setOpen(true);
      if (e.detail?.team && liveChatEnabled) {
        setActiveId(null);
        setHandoff(true);
      }
    };
    window.addEventListener('callstalk:open-chat', openChat);
    return () => window.removeEventListener('callstalk:open-chat', openChat);
  }, []);

  useEffect(() => {
    if (open && activeId) setUnread((u) => ({ ...u, [activeId]: false }));
  }, [open, activeId, messages]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open, activeId]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, activeId, pending, handoff]);

  const selectChat = (sessionId) => {
    if (active?.ended && active.sessionId !== sessionId) forget(active.sessionId);
    setActiveId(sessionId);
    setHandoff(false);
    setConfirm(null);
    setError('');
    setSidebarOpen(false);
  };

  // Name and email are optional (empty when the visitor just types a question).
  const start = async ({ name = '', email = '', message }) => {
    const sessionId = await startChat({ name, email, message });
    const chat = { sessionId, name, email, title: message.slice(0, 60), startedAt: Date.now() };
    let next = [...chatsRef.current, chat];
    // Over the limit: drop chats the team already ended first, then close the oldest open one.
    while (next.length > MAX_CHATS) {
      const drop = next.find((c) => c.ended) || next[0];
      if (!drop.ended) closeChat(drop.sessionId).catch(() => { /* the team just won't see the notice */ });
      next = next.filter((c) => c !== drop);
    }
    updateChats(() => next);
    setActiveId(sessionId);
    setHandoff(false);
  };

  // With MAX_CHATS chats already open, a new one would end the oldest, so the visitor is asked first.
  const oldestOpen = chats.length >= MAX_CHATS && !chats.some((c) => c.ended) ? chats[0] : null;

  const run = async (text, action) => {
    setDraft('');
    setError('');
    setBusy(true);
    setPending(text);
    try {
      await action();
    } catch (err) {
      setDraft(text);
      setError(err.message);
      if (active) refresh(active.sessionId); // picks up a chat the team has just ended
    } finally {
      setPending(null);
      setBusy(false);
    }
  };

  // A message typed into the chat goes to the team: it starts a new chat if none is selected.
  const submit = (text) => {
    if (active) {
      run(text, async () => {
        await sendMessage(active.sessionId, text);
        await refresh(active.sessionId);
      });
    } else if (oldestOpen) {
      setDraft('');
      setConfirm({ message: text });
    } else {
      run(text, () => start({ message: text }));
    }
  };

  const startFromForm = (details) => {
    if (!oldestOpen) return start(details);
    setHandoff(false);
    setConfirm(details);
    return undefined;
  };

  const acceptConfirm = () => {
    const details = confirm;
    setConfirm(null);
    run(details.message, () => start(details));
  };

  const cancelConfirm = () => {
    setDraft(confirm.message);
    setConfirm(null);
  };

  const send = (e) => {
    e.preventDefault();
    const text = draft.trim();
    if (text && !busy) submit(text);
  };

  const thread = active ? messages[active.sessionId] || [] : [];
  const showSuggestions = !active && !handoff && !pending && !confirm;

  return (
    <div className="chat">
      {open && (
        <section
          className={`chat__panel${chats.length ? ' has-sidebar' : ''}${sidebarOpen ? ' is-sidebar-open' : ''}`}
          role="dialog"
          aria-label="Chat with CallsTalk"
          onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        >
          <header className="chat__head">
            {chats.length > 0 && (
              <button className="chat__menu" aria-label="Your chats" aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(!sidebarOpen)}>
                <span />
              </button>
            )}
            <LogoMark />
            <div>
              <b>CallsTalk Support</b>
              <small>{active?.ended ? 'This chat has ended' : active?.email ? 'Replies here and by email' : 'Replies right here'}</small>
            </div>
            <button className="chat__close" aria-label="Close chat" onClick={() => setOpen(false)} />
          </header>

          <div className="chat__body">
            {chats.length > 0 && (
              <nav className="chat__sidebar" aria-label="Your chats">
                <button className={`chat__thread chat__thread--new${!active ? ' is-active' : ''}`} onClick={() => selectChat(null)}>New chat</button>
                {[...chats].reverse().map((c) => (
                  <button
                    key={c.sessionId}
                    className={`chat__thread${c.sessionId === activeId ? ' is-active' : ''}${c.ended ? ' is-ended' : ''}`}
                    aria-current={c.sessionId === activeId ? 'true' : undefined}
                    onClick={() => selectChat(c.sessionId)}
                  >
                    <span className="chat__thread-title">{c.title || 'Chat'}</span>
                    <small>
                      {unread[c.sessionId] && <i className="chat__thread-dot" aria-label="New reply" />}
                      {c.ended ? 'Ended' : startedAt(c.startedAt)}
                    </small>
                  </button>
                ))}
              </nav>
            )}

            <div className="chat__main">
              <div className="chat__list" ref={listRef} aria-live="polite">
                {active ? (
                  <>
                    <p className="chat__note">You are chatting with the CallsTalk team{active.name ? ` as ${active.name}` : ''}.</p>
                    {thread.map((m) => <p key={m.id} className={`bubble bubble--${m.from}`}>{m.text}</p>)}
                    {active.ended && <p className="chat__note">This chat has ended. Start a new chat any time.</p>}
                  </>
                ) : (
                  <p className="bubble bubble--assistant">{GREETING}</p>
                )}
                {pending && <p className="bubble bubble--visitor is-pending">{pending}</p>}
                {showSuggestions && (
                  <div className="chat__suggestions">
                    {suggestions.map((s) => <button key={s} onClick={() => !busy && submit(s)}>{s}</button>)}
                  </div>
                )}
                {confirm && (
                  <div className="handoff" role="alertdialog" aria-labelledby="chat-confirm-text">
                    {oldestOpen ? (
                      <p id="chat-confirm-text">
                        <b>You already have {MAX_CHATS} open chats.</b> Starting a new one will end your oldest
                        chat, &ldquo;{oldestOpen.title || 'Chat'}&rdquo;, started at {startedAt(oldestOpen.startedAt)}.
                      </p>
                    ) : (
                      <p id="chat-confirm-text">Start a new chat with this message?</p>
                    )}
                    <div className="handoff__actions">
                      <button type="button" className="chat__text-btn" onClick={cancelConfirm}>Cancel</button>
                      <button type="button" className="btn btn--dark btn--sm" onClick={acceptConfirm} disabled={busy}>End it and start</button>
                    </div>
                  </div>
                )}
                {handoff && <HandoffForm initialMessage={draft} onStart={startFromForm} onCancel={() => setHandoff(false)} />}
              </div>

              {error && <p className="chat__error" role="alert">{error}</p>}

              {!handoff && !confirm && !active?.ended && (
                <form className="chat__compose" onSubmit={send}>
                  <input
                    ref={inputRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder={active ? 'Message the team' : 'Ask a question'}
                    aria-label="Message"
                    maxLength={2000}
                  />
                  <button type="submit" className="chat__send" disabled={!draft.trim() || busy} aria-label="Send message" />
                </form>
              )}

              <footer className="chat__foot">
                {active && <button className="chat__text-btn" onClick={() => selectChat(null)}>Start a new chat</button>}
                {!active && !handoff && liveChatEnabled && (
                  <button className="chat__text-btn" onClick={() => setHandoff(true)}>Talk to our team</button>
                )}
              </footer>
            </div>
          </div>
        </section>
      )}

      <button className="chat__launcher" aria-expanded={open} aria-label={open ? 'Close chat' : 'Chat with us'} onClick={() => setOpen(!open)}>
        <span className={`chat__dot${hasUnread ? ' is-unread' : ''}`} aria-hidden="true" />
        <svg className="chat__icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H10l-4.5 3.4A.6.6 0 0 1 4.5 21l.6-3.1A3 3 0 0 1 2 15V7a3 3 0 0 1 3-3Z" /></svg>
        <span className="chat__label">{open ? 'Close chat' : 'Chat with us'}</span>
        {hasUnread && <span className="sr-only">New reply from the team</span>}
      </button>
    </div>
  );
}
