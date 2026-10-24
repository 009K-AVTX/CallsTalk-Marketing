// Client for the customer portal: our server's accounts, billing and reports routes (server/src/accounts.js,
// server/src/portal.js), the same calls call_platform was going to provide.
//
//   POST /accounts/login            email + password    -> { access, refresh } or { mfa_required, temp_token }
//   POST /accounts/verify-mfa       temp_token + code   -> { access, refresh, role }
//   POST /accounts/refresh          refresh             -> { access }
//   GET  /billing/statement?from=  YYYY-MM-DD          -> balance and every day's bill since that date
//   POST /billing/statement/pay     amount              -> { address, network, currency, amount, qr_svg } (USDT TRC-20)
//   GET  /accounts/me                                   -> profile
//   POST /accounts/change-password  current_password, new_password
//   GET  /accounts/invite/:token                        -> setup link: who it is for, QR code and key
//   POST /accounts/invite/:token    password + code     -> { access, refresh, role }
//
// Logins are made by our admins (portal /admin) and set up from a one-use link; there is no sign-up.
// The session keeps the login's role: "customer" sees billing, "staff" the report uploads, "admin" everything.

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
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || null;
  } catch {
    return null;
  }
}

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

async function call(path, { method = 'GET', body, token } = {}) {
  if (!BASE) throw new Error('Billing is not available right now. Please contact us.');
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('We could not reach the server. Check your connection and try again.');
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
    saveSession({ access: 'preview', refresh: 'preview', email: email.trim(), role: 'customer' });
    return {};
  }
  const data = await call('/accounts/login', { method: 'POST', body: { email: email.trim(), password } });
  if (data.mfa_required) return { mfa: data.temp_token };
  saveSession({ access: data.access, refresh: data.refresh, email: data.email || email.trim(), role: data.role || 'customer' });
  return {};
}

export async function verifyCode(tempToken, code, email) {
  const data = await call('/accounts/verify-mfa', { method: 'POST', body: { temp_token: tempToken, token: code.trim() } });
  saveSession({ access: data.access, refresh: data.refresh, email: data.email || email, role: data.role || 'customer' });
}

export const isAdmin = () => loadSession()?.role === 'admin';
// Staff upload customer reports and nothing else; admins can too.
export const canUploadReports = () => ['staff', 'admin'].includes(loadSession()?.role);

// The one-use setup link from the email: set a password and add the authenticator app.
export const fetchInvite = (token) => call(`/accounts/invite/${encodeURIComponent(token)}`);

export async function completeSetup(token, password, code) {
  const data = await call(`/accounts/invite/${encodeURIComponent(token)}`, { method: 'POST', body: { password, code: code.trim() } });
  saveSession({ access: data.access, refresh: data.refresh, email: data.email, role: data.role });
}

export function signOut() {
  const session = loadSession();
  saveSession(null);
  if (session?.access) call('/accounts/logout', { method: 'POST', token: session.access }).catch(() => {});
}

// An authorised request; renews the 60-minute access token once when it has expired.
export async function authed(path, options) {
  const session = loadSession();
  if (!session?.access) throw new SignedOut();
  try {
    return await call(path, { ...options, token: session.access });
  } catch (err) {
    if (err.status !== 401 || !session.refresh) throw err;
  }
  try {
    const { access } = await call('/accounts/refresh', { method: 'POST', body: { refresh: session.refresh } });
    saveSession({ ...session, access });
    return await call(path, { ...options, token: access });
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
  ? Promise.reject(new Error(`Preview mode: with a real login, your USDT (TRC-20) address for $${amount} appears here.`))
  : authed('/billing/statement/pay', { method: 'POST', body: { amount: String(amount) } }));


const PREVIEW_AVATAR = 'callstalk.previewAvatar';
const previewAvatar = () => { try { return localStorage.getItem(PREVIEW_AVATAR); } catch { return null; } };

export const fetchProfile = () => (PREVIEW
  ? previewGuard(() => ({ ...previewProfile(loadSession()?.email), id: 'preview', avatar_version: previewAvatar() ? 1 : null }))
  : authed('/accounts/me'));

// ── profile photos ───────────────────────────────────────────────────────────
// Photos are not public: they are fetched with the session and shown from an object URL, one per version.

export const profileChanged = () => window.dispatchEvent(new Event('callstalk:profile'));

// `dataUrl` is the photo already cropped and resized in the browser (portal/src/avatar.jsx).
export async function uploadAvatar(dataUrl) {
  if (PREVIEW) {
    try { localStorage.setItem(PREVIEW_AVATAR, dataUrl); } catch { throw new Error('This browser has no room to keep the photo.'); }
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
    const get = () => fetch(`${BASE}/accounts/avatar/${encodeURIComponent(userId)}?v=${version}`, { headers: { Authorization: `Bearer ${loadSession()?.access}` } });
    photos.set(key, (async () => {
      let res = await get();
      if (res.status === 401) {
        await authed('/accounts/me'); // renews an expired access token
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
