// Client for the support chat API (call_platform's `support` router).
//
//   POST /support/chat               start a session   -> { session_id, message }
//   POST /support/chat/{session_id}  visitor follow-up -> { message }
//   GET  /support/chat/{session_id}  full transcript   -> { session_id, status, messages }
//
// The backend pings the team on Telegram; their replies come back as `agent` messages.

const BASE = (import.meta.env.VITE_SUPPORT_API_URL || '').replace(/\/$/, '');
const STORAGE_KEY = 'callstalk.chat';

export const liveChatEnabled = Boolean(BASE);

async function request(path, options = {}) {
  const res = await fetch(`${BASE}/support/chat${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json' },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || `The chat service returned an error (HTTP ${res.status}).`);
  return data;
}

export async function startChat({ name, email, message }) {
  const data = await request('', { method: 'POST', body: JSON.stringify({ name, email, message }) });
  return data.session_id;
}

export function sendMessage(sessionId, message) {
  return request(`/${encodeURIComponent(sessionId)}`, { method: 'POST', body: JSON.stringify({ message }) });
}

export async function fetchMessages(sessionId) {
  const data = await request(`/${encodeURIComponent(sessionId)}`);
  return (data.messages || []).map((m) => ({
    id: m.id,
    from: m.sender === 'visitor' ? 'visitor' : 'team',
    text: m.message,
  }));
}

// The open session survives reloads so the visitor keeps their Telegram thread.
export function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || null;
  } catch {
    return null;
  }
}

export function saveSession(session) {
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable: the session lasts for this page view only */
  }
}

// The AI assistant runs through our own serverless proxy so the API key stays server-side.
export async function askAssistant(messages) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.reply) throw new Error(data.error || 'The assistant is unavailable right now.');
  return data.reply;
}
