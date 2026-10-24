// Client for the customer billing portal (call_platform's accounts + billing routers).
//
//   POST /accounts/login            email + password    -> { access, refresh } or { mfa_required, temp_token }
//   POST /accounts/verify-mfa       temp_token + code   -> { access, refresh }
//   POST /accounts/refresh          refresh             -> { access }
//   GET  /billing/statement?from=  YYYY-MM-DD          -> balance and every day's bill since that date
//   POST /billing/statement/pay     amount              -> { payment_url } (Capitalist checkout)
//   GET  /portal/summary            from, to, group     -> totals, series, states, heatmap, call lengths
//   GET  /portal/calls              from, to, status, q, page, page_size -> { count, results }
//   GET  /accounts/me                                   -> profile
//   POST /accounts/change-password  current_password, new_password
//
// Customers get their login from us; there is no sign-up.

import { previewCalls, previewProfile, previewStatement, previewSummary } from './preview.js';

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
    saveSession({ access: 'preview', refresh: 'preview', email: email.trim() });
    return {};
  }
  const data = await call('/accounts/login', { method: 'POST', body: { email: email.trim(), password } });
  if (data.mfa_required) return { mfa: data.temp_token };
  saveSession({ access: data.access, refresh: data.refresh, email: data.email || email.trim() });
  return {};
}

export async function verifyCode(tempToken, code, email) {
  const data = await call('/accounts/verify-mfa', { method: 'POST', body: { temp_token: tempToken, token: code.trim() } });
  saveSession({ access: data.access, refresh: data.refresh, email });
}

export function signOut() {
  const session = loadSession();
  saveSession(null);
  if (session?.access) call('/accounts/logout', { method: 'POST', token: session.access }).catch(() => {});
}

// An authorised request; renews the 60-minute access token once when it has expired.
async function authed(path, options) {
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

const qs = (params) => new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null)).toString();

export const fetchStatement = () => (PREVIEW
  ? previewGuard(() => previewStatement(BILLING_FROM))
  : authed(`/billing/statement?from=${BILLING_FROM}`));

export const startPayment = (amount) => (PREVIEW
  ? Promise.reject(new Error(`Preview mode: a real login would now open the checkout for $${amount}.`))
  : authed('/billing/statement/pay', { method: 'POST', body: { amount: String(amount) } }));

// Totals, a time series, states, a weekday x hour grid and call lengths for a date range.
export const fetchSummary = ({ from, to, group = 'day' }) => (PREVIEW
  ? previewGuard(() => previewSummary(BILLING_FROM, { from, to, group }))
  : authed(`/portal/summary?${qs({ from, to, group })}`));

// One page of the customer's calls, newest first.
export const fetchCalls = ({ from, to, status = '', q = '', page = 1, pageSize = 25 }) => (PREVIEW
  ? previewGuard(() => previewCalls(BILLING_FROM, { from, to, status, q, page, pageSize }))
  : authed(`/portal/calls?${qs({ from, to, status, q, page, page_size: pageSize })}`));

export const fetchProfile = () => (PREVIEW
  ? previewGuard(() => previewProfile(loadSession()?.email))
  : authed('/accounts/me'));

export const changePassword = (current, next) => (PREVIEW
  ? Promise.reject(new Error('Preview mode: passwords cannot be changed here.'))
  : authed('/accounts/change-password', { method: 'POST', body: { current_password: current, new_password: next } }));

function previewGuard(make) {
  if (!loadSession()?.access) return Promise.reject(new SignedOut());
  return new Promise((resolve) => setTimeout(() => resolve(make()), 250));
}
