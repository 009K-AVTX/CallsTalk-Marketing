// Client for the support chat API (server/ in this repo).
//
//   POST /support/chat                   start a session   -> { session_id, message }
//   POST /support/chat/{session_id}      visitor follow-up -> { message }
//   GET  /support/chat/{session_id}      full transcript   -> { session_id, status, messages }
//   POST /support/chat/{session_id}/end  close it          -> { status }
//
// The backend posts each chat to the team's Telegram; their replies come back as `agent` messages.

const BASE = (import.meta.env.VITE_SUPPORT_API_URL || '').replace(/\/$/, '');
const STORAGE_KEY = 'callstalk.chats';
const LEGACY_KEY = 'callstalk.chat'; // one session, before visitors could keep several

export const liveChatEnabled = Boolean(BASE);
// A visitor keeps at most this many chats; starting another drops the oldest.
export const MAX_CHATS = 3;

async function request(path, options = {}) {
  const res = await fetch(`${BASE}/support/chat${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json' },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || `The chat service returned an error (HTTP ${res.status}).`);
  return data;
}

// The user agent string hides the real browser (Brave says Chrome) and OS version (Windows 11 says 10),
// so Chromium browsers are asked directly. Safari and Firefox can't say, and the server reads the user agent.
async function reportedDevice() {
  try {
    const hints = await navigator.userAgentData?.getHighEntropyValues(['platformVersion', 'model', 'fullVersionList']);
    const brands = hints?.fullVersionList || [];
    const brand = brands.find((b) => !/not.?a.?brand|chromium/i.test(b.brand)) || brands.find((b) => /chromium/i.test(b.brand));
    if (!brand) return undefined;
    return {
      browser: brand.brand, version: brand.version.split('.')[0],
      platform: hints.platform, platformVersion: hints.platformVersion, model: hints.model,
    };
  } catch {
    return undefined;
  }
}

// Name and email are optional; without them the team sees the chat as "Visitor".
export async function startChat({ name, email, message }) {
  const body = { name, email, message, referrer: document.referrer, device: await reportedDevice() };
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
