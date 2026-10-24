// Client for the customer billing portal (call_platform's accounts + billing routers).
//
//   POST /accounts/login            email + password    -> { access, refresh } or { mfa_required, temp_token }
//   POST /accounts/verify-mfa       temp_token + code   -> { access, refresh }
//   POST /accounts/refresh          refresh             -> { access }
//   GET  /billing/statement                             -> balance, today and the last three days
//   POST /billing/statement/pay     amount              -> { payment_url } (Capitalist checkout)
//
// Customers get their login from us; there is no sign-up.

const BASE = (import.meta.env.VITE_PORTAL_API_URL || import.meta.env.VITE_SUPPORT_API_URL || '').replace(/\/$/, '');
const STORAGE_KEY = 'callstalk.session';

// Local development without an API: sign in with any login and see sample figures.
// Never on in a production build.
const PREVIEW = !BASE && import.meta.env.DEV;

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
    const err = new Error(data.detail || `The server returned an error (HTTP ${res.status}).`);
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

export const fetchStatement = () => (PREVIEW ? previewStatement() : authed('/billing/statement?days=3'));

export const startPayment = (amount) => (PREVIEW
  ? Promise.reject(new Error(`Preview mode: a real login would now open the checkout for $${amount}.`))
  : authed('/billing/statement/pay', { method: 'POST', body: { amount: String(amount) } }));

// Illustrative figures: today opens at -$320, 64 calls at $35 and a $2,500 payment leave -$60.
function previewStatement() {
  if (!loadSession()?.access) return Promise.reject(new SignedOut());
  const price = 35;
  const now = new Date();
  const day = (n) => { const d = new Date(now); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
  const plan = [[3, 0, 0], [2, 18, 1500], [1, 52, 0], [0, 64, 2500]]; // [days ago, calls, received]
  let balance = 630; // so today opens at -$320
  const days = plan.map(([ago, calls, received]) => {
    const opening = balance;
    balance = opening - calls * price + received;
    const m = (v) => v.toFixed(2);
    return { date: day(ago), is_today: ago === 0, opening_balance: m(opening), calls, price_per_call: m(price), charges: m(calls * price), payment_received: m(received), balance: m(balance) };
  }).reverse();
  return Promise.resolve({
    customer: 'Preview Customer', currency: 'USD', price_per_call: '35.00', timezone: 'America/New_York',
    as_of: now.toISOString(), balance: balance.toFixed(2), amount_due: Math.max(-balance, 0).toFixed(2), days,
    payments: [{ id: 'p1', amount: '2500.00', currency: 'USD', status: 'completed', provider: 'manual', reference: '', note: 'Bank transfer', date: `${day(0)}T14:20:00Z` }],
  });
}
