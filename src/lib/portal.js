// Client for the customer portal: our server's accounts, billing and reports routes (server/src/accounts.js,
// server/src/portal.js), the same calls call_platform was going to provide.
//
//   POST /accounts/login            email + password    -> { mfa_required, temp_token }
//   POST /accounts/verify-mfa       temp_token + code   -> { email, name, role }, and the session cookies
//   POST /accounts/refresh          (refresh cookie)    -> a new session cookie
//   GET  /billing/statement?from=  YYYY-MM-DD          -> balance and every day's bill since that date
//   POST /billing/statement/pay     amount              -> { address, network, currency, amount, qr_svg } (USDT TRC-20)
//   GET  /accounts/me                                   -> profile
//   POST /accounts/change-password  current_password, new_password
//   GET  /accounts/invite/:token                        -> setup link: who it is for, QR code and key
//   POST /accounts/invite/:token    password + code     -> as verify-mfa
//
// Logins are made by our admins (portal /admin) and set up from a one-use link; there is no sign-up.
//
// The session itself is in HttpOnly cookies (server/src/security.js) that no script can read, so the API must be
// on the portal's own address (VITE_PORTAL_API_URL=/api, as nginx serves it). This browser keeps only who is
// signed in, for drawing the page: { access: 'cookie', email, name, role }. `access` is a marker, not a token.
// The role decides the pages: "customer" sees billing, "staff" the report uploads, "admin" everything; the server
// checks it again on every call.

import { previewProfile, previewStatement } from './preview.js';

const BASE = (import.meta.env.VITE_PORTAL_API_URL || import.meta.env.VITE_SUPPORT_API_URL || '').replace(/\/$/, '');
const STORAGE_KEY = 'callstalk.session';

// Sample figures instead of the API: in local development without an API, or in a build made with
// VITE_PORTAL_DEMO=true (the portal's shareable demo). Any login works. Off in every other build.
export const DEMO = import.meta.env.VITE_PORTAL_DEMO === 'true';
const PREVIEW = DEMO || (!BASE && import.meta.env.DEV);
export const previewMode = PREVIEW;

export const portalEnabled = Boolean(BASE) || PREVIEW;

export function loadSession() {
  try {
    const session = JSON.parse(localStorage.getItem(STORAGE_KEY)) || null;
    // Kept by an older version of the portal, with the tokens themselves: drop them and sign in again.
    if (session?.refresh) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

const signedInAs = (data, email) => saveSession({ access: 'cookie', email: data.email || email, name: data.name || '', role: data.role || 'customer' });

// Sent with every call: the server only accepts changes made with the session cookie when this header is there,
// which another website cannot add (server/src/security.js).
export const SESSION_HEADERS = { 'X-CallsTalk': '1' };

function saveSession(session) {
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable: the customer stays signed in for this page view only */
  }
  window.dispatchEvent(new Event('callstalk:session'));
}

export class SignedOut extends Error {}

async function call(path, { method = 'GET', body } = {}) {
  if (!BASE) throw new Error('Billing is not available right now. Please contact us.');
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...SESSION_HEADERS },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Unable to connect to the server. Please check your internet connection and try again.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.detail || data.message || `The server returned an error (HTTP ${res.status}).`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// Returns { mfa: tempToken } when the account has two-step sign-in, otherwise signs in.
export async function signIn(email, password) {
  if (PREVIEW) {
    saveSession({ access: 'preview', email: email.trim(), role: 'customer' });
    return {};
  }
  const data = await call('/accounts/login', { method: 'POST', body: { email: email.trim(), password } });
  if (data.mfa_required) return { mfa: data.temp_token };
  signedInAs(data, email.trim());
  return {};
}

export async function verifyCode(tempToken, code, email) {
  const data = await call('/accounts/verify-mfa', { method: 'POST', body: { temp_token: tempToken, token: code.trim() } });
  signedInAs(data, email);
}

// The Owner is an admin who also sets clients' rates and has the Owner Panel (the server checks it again).
export const isOwner = () => loadSession()?.role === 'owner';
export const isAdmin = () => ['admin', 'owner'].includes(loadSession()?.role);
// Staff upload customer reports and work customers' pages (logins, billing, calls, payments); admins can too.
export const canUploadReports = () => ['staff', 'admin', 'owner'].includes(loadSession()?.role);

// The one-use setup link from the email: set a password and add the authenticator app.
export const fetchInvite = (token) => call(`/accounts/invite/${encodeURIComponent(token)}`);

export async function completeSetup(token, password, code) {
  const data = await call(`/accounts/invite/${encodeURIComponent(token)}`, { method: 'POST', body: { password, code: code.trim() } });
  signedInAs(data, data.email);
}

// Forgotten password: request a link by email (the reply is the same whether or not the login exists),
// then choose a new password on that link with the authenticator code.
export const requestPasswordReset = (email) => (PREVIEW
  ? Promise.resolve({ message: 'Preview mode: with a live account, a reset link is emailed to you.' })
  : call('/accounts/forgot', { method: 'POST', body: { email: email.trim() } }));

export const fetchReset = (token) => call(`/accounts/reset/${encodeURIComponent(token)}`);

export async function completeReset(token, password, code) {
  const data = await call(`/accounts/reset/${encodeURIComponent(token)}`, { method: 'POST', body: { password, code: code.trim() } });
  signedInAs(data, data.email);
}

export function signOut() {
  const session = loadSession();
  saveSession(null);
  if (session?.access === 'cookie') call('/accounts/logout', { method: 'POST' }).catch(() => {});
}

// Renews the 60-minute session cookie from the refresh cookie. Calls that find it expired at the same moment
// share one renewal instead of each sending their own.
let renewing = null;
export function renewSession() {
  renewing ||= call('/accounts/refresh', { method: 'POST' }).finally(() => { renewing = null; });
  return renewing;
}

// An authorised request (the session cookie goes with it); renews the session once when it has expired.
export async function authed(path, options) {
  const session = loadSession();
  if (!session?.access) throw new SignedOut();
  try {
    return await call(path, options);
  } catch (err) {
    if (err.status !== 401 || session.access !== 'cookie') throw err;
  }
  try {
    await renewSession();
    return await call(path, options);
  } catch (err) {
    if (err.status === 401) {
      saveSession(null);
      throw new SignedOut();
    }
    throw err;
  }
}

// Bills are shown from the start of September 2026: every day since, newest first.
export const BILLING_FROM = '2026-09-01';

// Customers see their last five days of bills and payments, today included. Older ones are in the
// Excel reports our team uploads.
export const HISTORY_DAYS = 5;
export function historyFrom() {
  const d = new Date();
  d.setDate(d.getDate() - (HISTORY_DAYS - 1));
  const from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return from < BILLING_FROM ? BILLING_FROM : from;
}

export const fetchStatement = () => (PREVIEW
  ? previewGuard(() => previewStatement(BILLING_FROM, historyFrom()))
  : authed(`/billing/statement?from=${historyFrom()}`));

export const startPayment = (amount) => (PREVIEW
  ? Promise.reject(new Error(`Preview mode: your USDT (TRC-20) deposit address for $${amount} is shown here when signed in to a live account.`))
  : authed('/billing/statement/pay', { method: 'POST', body: { amount: String(amount) } }));


const PREVIEW_AVATAR = 'callstalk.previewAvatar';
const previewAvatar = () => { try { return localStorage.getItem(PREVIEW_AVATAR); } catch { return null; } };

export const fetchProfile = () => (PREVIEW
  ? previewGuard(() => ({ ...previewProfile(loadSession()?.email), id: 'preview', avatar_version: previewAvatar() ? 1 : null }))
  : authed('/accounts/me'));

// ── contact methods (Telegram, WhatsApp, Element X, Zangi, Signal, another email) ──

const PREVIEW_CONTACTS = 'callstalk.previewContacts';

export const fetchContacts = async () => {
  if (!PREVIEW) return (await authed('/accounts/contacts')).contacts;
  try { return JSON.parse(localStorage.getItem(PREVIEW_CONTACTS)) || {}; } catch { return {}; }
};

// Returns { contacts, changed, notified }: the saved values (as the server wrote them down), what changed,
// and whether our team was emailed.
export async function saveContacts(contacts) {
  if (!PREVIEW) return authed('/accounts/contacts', { method: 'PUT', body: contacts });
  try { localStorage.setItem(PREVIEW_CONTACTS, JSON.stringify(contacts)); } catch { /* preview only */ }
  return { contacts, changed: Object.keys(contacts), notified: false };
}

// ── Telegram notifications (server/src/telegram-link.js) ─────────────────────
// The customer links their own Telegram chat with our bot: a one-use link opens the bot, they press Start.
// -> { available, connected, username, first_name, linked_at, bot }

const PREVIEW_TELEGRAM = 'callstalk.previewTelegram';
const previewTelegram = () => { try { return JSON.parse(localStorage.getItem(PREVIEW_TELEGRAM)) || {}; } catch { return {}; } };
const keepPreviewTelegram = (v) => { try { localStorage.setItem(PREVIEW_TELEGRAM, JSON.stringify(v)); } catch { /* preview only */ } };

export async function fetchTelegram() {
  if (!PREVIEW) return authed('/accounts/telegram');
  // Preview: "pressing Start" is pretended a few seconds after the link is opened.
  const t = previewTelegram();
  if (t.pendingSince && Date.now() - t.pendingSince > 4000) keepPreviewTelegram({ linkedAt: new Date().toISOString() });
  const now = previewTelegram();
  return { available: true, connected: Boolean(now.linkedAt), username: now.linkedAt ? 'preview_buyer' : '', first_name: now.linkedAt ? 'Preview' : '', linked_at: now.linkedAt || null, bot: 'CTLKMBOT' };
}

// -> { url, expires_at, bot }: open `url` in Telegram and press Start there.
export async function linkTelegram() {
  if (!PREVIEW) return authed('/accounts/telegram/link', { method: 'POST' });
  keepPreviewTelegram({ pendingSince: Date.now() });
  return { url: 'https://t.me/CTLKMBOT', expires_at: new Date(Date.now() + 15 * 60_000).toISOString(), bot: 'CTLKMBOT' };
}

export async function unlinkTelegram() {
  if (!PREVIEW) return authed('/accounts/telegram', { method: 'DELETE' });
  keepPreviewTelegram({});
  return fetchTelegram();
}

// ── profile photos ───────────────────────────────────────────────────────────
// Photos are not public: they are fetched with the session and shown from an object URL, one per version.

export const profileChanged = () => window.dispatchEvent(new Event('callstalk:profile'));

// `dataUrl` is the photo already cropped and resized in the browser (portal/src/avatar.jsx).
export async function uploadAvatar(dataUrl) {
  if (PREVIEW) {
    try { localStorage.setItem(PREVIEW_AVATAR, dataUrl); } catch { throw new Error('There is not enough browser storage to save this photo.'); }
  } else {
    await authed('/accounts/avatar', { method: 'PUT', body: { content_base64: dataUrl.split(',')[1] || '' } });
  }
  profileChanged();
}

export async function removeAvatar() {
  if (PREVIEW) {
    try { localStorage.removeItem(PREVIEW_AVATAR); } catch { /* nothing kept */ }
  } else {
    await authed('/accounts/avatar', { method: 'DELETE' });
  }
  profileChanged();
}

const photos = new Map(); // `${userId}:${version}` -> Promise<object URL>

export function avatarUrl(userId, version) {
  if (PREVIEW) return Promise.resolve(previewAvatar());
  const key = `${userId}:${version}`;
  if (!photos.has(key)) {
    const get = () => fetch(`${BASE}/accounts/avatar/${encodeURIComponent(userId)}?v=${version}`, { credentials: 'same-origin', headers: SESSION_HEADERS });
    photos.set(key, (async () => {
      let res = await get();
      if (res.status === 401) {
        await renewSession().catch(() => {}); // an expired session cookie
        res = await get();
      }
      if (!res.ok) throw new Error('No photo');
      return URL.createObjectURL(await res.blob());
    })().catch((err) => {
      photos.delete(key);
      throw err;
    }));
  }
  return photos.get(key);
}

// Without `code`: checks the passwords and returns { code_required: true }. With the authenticator code: changes it.
export const changePassword = (current, next, code) => (PREVIEW
  ? Promise.reject(new Error('Preview mode: passwords cannot be changed here.'))
  : authed('/accounts/change-password', { method: 'POST', body: { current_password: current, new_password: next, ...(code && { code: code.trim() }) } }));

function previewGuard(make) {
  if (!loadSession()?.access) return Promise.reject(new SignedOut());
  return new Promise((resolve) => setTimeout(() => resolve(make()), 250));
}
