// Billing reports: Excel files the billing team uploads for a customer, shown in that customer's portal.
//
// Three backends behind one set of functions:
//   VITE_PORTAL_API_URL set  -> our server (server/src/portal.js), per docs/portal-reports-api.md;
//                               the billing team signs in with a staff or admin login
//   demo deployment          -> /api/reports, this project's own Vercel Blob store
//   local development        -> the browser's storage, so upload and view can be tried on one machine
import { authed, canUploadReports, DEMO, loadSession, signOut } from '../../src/lib/portal.js';

const BASE = (import.meta.env.VITE_PORTAL_API_URL || import.meta.env.VITE_SUPPORT_API_URL || '').replace(/\/$/, '');
const MODE = BASE && !DEMO ? 'api' : import.meta.env.DEV ? 'local' : 'demo';
const KEY_STORE = 'callstalk.uploadKey';
const STAFF_STORE = 'callstalk.staff';
const LOCAL_STORE = 'callstalk.localReports';

export const MAX_MB = 3;
export const staffSignInKind = MODE === 'api' ? 'login' : 'key';

async function send(url, { method = 'GET', body, headers = {} } = {}) {
  let res;
  try {
    res = await fetch(url, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
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

const toBase64 = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(',')[1] || '');
  r.onerror = () => reject(new Error('That file could not be read.'));
  r.readAsDataURL(file);
});

// ── staff access ─────────────────────────────────────────────────────────────

const read = (store, k) => { try { return JSON.parse(store.getItem(k)); } catch { return null; } };
const write = (store, k, v) => { try { if (v == null) store.removeItem(k); else store.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } };

// API: the portal's own staff or admin login (password and code, on /login). Demo and local: the upload key.
export const staffSession = () => (MODE === 'api' ? (canUploadReports() ? loadSession() : null) : read(sessionStorage, KEY_STORE));

export async function staffSignIn({ key }) {
  if (MODE === 'api') throw new Error('Log in to the portal with a staff or admin login to upload reports.');
  write(sessionStorage, KEY_STORE, { key: key.trim() });
  await listAll(); // checks the key
}

export function staffSignOut() {
  if (MODE === 'api' && canUploadReports()) signOut();
  write(localStorage, STAFF_STORE, null);
  write(sessionStorage, KEY_STORE, null);
}

// API calls carry the signed-in login and renew it when needed (src/lib/portal.js).
const api = (path, method = 'GET', body) => authed(path, { method, body });

function staffHeaders() {
  const s = staffSession();
  if (!s) throw new Error('Sign in to upload reports.');
  return MODE === 'api' ? { Authorization: `Bearer ${s.access}` } : { 'x-upload-key': s.key };
}

// ── local development store ──────────────────────────────────────────────────

const localAll = () => read(localStorage, LOCAL_STORE) || [];
const LOCAL_KEY = 'local-upload-key';

// ── the functions the pages use ──────────────────────────────────────────────

// The signed-in customer's reports, newest first.
export async function listMine() {
  const session = loadSession();
  if (MODE === 'api') return (await api('/portal/reports')).results;
  const me = (session?.email || '').toLowerCase();
  if (MODE === 'local') return localAll().filter((r) => r.customer === me);
  return (await send(`/api/reports?customer=${encodeURIComponent(me)}`)).results;
}

export async function listAll() {
  if (MODE === 'api') return (await api('/staff/reports')).results;
  if (MODE === 'local') {
    if (staffSession()?.key !== LOCAL_KEY) {
      write(sessionStorage, KEY_STORE, null);
      throw new Error(`The upload key is not correct. Locally it is "${LOCAL_KEY}".`);
    }
    return localAll();
  }
  try {
    return (await send('/api/reports', { headers: staffHeaders() })).results;
  } catch (err) {
    if (err.status === 401) write(sessionStorage, KEY_STORE, null);
    throw err;
  }
}

// Customers the billing team can upload for. Demo and local: anyone who already has a report.
export async function listCustomers() {
  if (MODE === 'api') return (await api('/staff/customers')).results;
  return [...new Set((await listAll()).map((r) => r.customer))].map((c) => ({ id: c, name: c, login: c }));
}

export async function uploadReport({ customer, title, note, periodFrom, periodTo, file }) {
  if (file.size > MAX_MB * 1024 * 1024) throw new Error(`Files must be ${MAX_MB} MB or smaller.`);
  const content = await toBase64(file);
  const body = { customer, title, note, period_from: periodFrom, period_to: periodTo, filename: file.name, content_base64: content };
  if (MODE === 'api') return api('/staff/reports', 'POST', body);
  if (MODE === 'demo') return send('/api/reports', { method: 'POST', headers: staffHeaders(), body });
  await listAll();
  const report = {
    id: crypto.randomUUID(), customer: customer.trim().toLowerCase(), title: title.trim() || file.name.replace(/\.[^.]+$/, ''), note: note.trim(),
    period_from: periodFrom, period_to: periodTo, filename: file.name, size: file.size, uploaded_at: new Date().toISOString(),
    url: `data:application/octet-stream;base64,${content}`,
  };
  try {
    localStorage.setItem(LOCAL_STORE, JSON.stringify([report, ...localAll()]));
  } catch {
    throw new Error('This browser has no space left for test uploads. Please delete some first.');
  }
  return report;
}

export async function deleteReport(id) {
  if (MODE === 'api') return api(`/staff/reports/${encodeURIComponent(id)}`, 'DELETE');
  if (MODE === 'demo') return send(`/api/reports?id=${encodeURIComponent(id)}`, { method: 'DELETE', headers: staffHeaders() });
  write(localStorage, LOCAL_STORE, localAll().filter((r) => r.id !== id));
  return { ok: true };
}

// The file itself. API downloads need the signed-in login's token; the others are plain URLs.
export async function fetchFile(report) {
  if (MODE !== 'api') {
    const res = await fetch(report.url);
    if (!res.ok) throw new Error('The report file could not be opened.');
    return res.arrayBuffer();
  }
  const get = () => fetch(`${BASE}/portal/reports/${encodeURIComponent(report.id)}/file`, { headers: { Authorization: `Bearer ${loadSession()?.access}` } });
  let res = await get();
  if (res.status === 401) {
    await authed('/accounts/me'); // renews an expired access token, then try again
    res = await get();
  }
  if (!res.ok) throw new Error('The report file could not be opened.');
  return res.arrayBuffer();
}

export const localKeyHint = MODE === 'local' ? LOCAL_KEY : '';

// Where the billing team uploads. Shown inside the portal in the demo and locally, and to anyone signed in
// as the billing team; real customers never see it.
export const UPLOAD_PATH = '/upload';
export const showUploadLink = () => MODE !== 'api' || Boolean(staffSession());
