// Client for the support chat API (server/ in this repo).
//
//   POST /support/chat                   start a session   -> { session_id, message }
//   POST /support/chat/{session_id}      visitor follow-up -> { message }
//   GET  /support/chat/{session_id}      full transcript   -> { session_id, status, messages }
//   POST /support/chat/{session_id}/end  close it          -> { status }
//
// The backend posts each chat to the team's Telegram; their replies come back as `agent` messages.

let BASE = (import.meta.env.VITE_SUPPORT_API_URL || '').replace(/\/$/, '');
let STORAGE_KEY = 'callstalk.chats';
const LEGACY_KEY = 'callstalk.chat'; // one session, before visitors could keep several
let authToken = () => '';
let extraHeaders = {};
let beforeStart = async () => {};

export let liveChatEnabled = Boolean(BASE);
// A visitor keeps at most this many chats; starting another drops the oldest.
export const MAX_CHATS = 3;

// The customer portal uses the same chat as a signed-in customer: its own API address, the login's token
// (so the team sees who it is) and chats kept per login. `refresh` renews the login before a chat starts.
export function configureSupportChat({ base, token, headers, storageKey, refresh }) {
  if (headers) extraHeaders = headers;
  if (refresh) beforeStart = refresh;
  if (base !== undefined) {
    BASE = base.replace(/\/$/, '');
    liveChatEnabled = Boolean(BASE);
  }
  if (token) authToken = token;
  if (storageKey) STORAGE_KEY = storageKey;
}

async function request(path, options = {}) {
  const token = authToken();
  const res = await fetch(`${BASE}/support/chat${path}`, {
    ...options,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...extraHeaders, ...(token && { Authorization: `Bearer ${token}` }) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || `The chat service returned an error (HTTP ${res.status}).`);
  return data;
}

// Name and email are optional; without them the team sees the chat as "Visitor".
export async function startChat({ name, email, message }) {
  const body = { name, email, message };
  await beforeStart();
  const data = await request('', { method: 'POST', body: JSON.stringify(body) });
  return data.session_id;
}

export function sendMessage(sessionId, message) {
  return request(`/${encodeURIComponent(sessionId)}`, { method: 'POST', body: JSON.stringify({ message }) });
}

// Closes a chat for the team (used when a newer chat pushes it out).
export function endChat(sessionId) {
  return request(`/${encodeURIComponent(sessionId)}/end`, { method: 'POST' });
}

// `ended` is true once either side has ended the chat.
export async function fetchMessages(sessionId) {
  const data = await request(`/${encodeURIComponent(sessionId)}`);
  const messages = (data.messages || []).map((m) => ({
    id: m.id,
    from: m.sender === 'visitor' ? 'visitor' : 'team',
    text: m.message,
  }));
  return { ended: data.status !== 'open', messages };
}

// The visitor's chats survive reloads: [{ sessionId, name, email, title, startedAt, ended }], oldest first.
export function loadChats() {
  try {
    const chats = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(chats)) return chats;
    if (STORAGE_KEY !== 'callstalk.chats') return []; // the old single-chat key is the website's only
    const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY));
    localStorage.removeItem(LEGACY_KEY);
    return legacy?.sessionId ? [{ ...legacy, title: '', startedAt: Date.now() }] : [];
  } catch {
    return [];
  }
}

export function saveChats(chats) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
  } catch {
    /* storage unavailable: the chats last for this page view only */
  }
}
