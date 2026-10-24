// Billing reports: Excel files the billing team uploads for a customer, shown in that customer's portal.
//
// Three backends behind one set of functions:
//   VITE_PORTAL_API_URL set  -> the platform API (Avortyx), per docs/portal-reports-api.md
//   demo deployment          -> /api/reports, this project's own Vercel Blob store
//   local development        -> the browser's storage, so upload and view can be tried on one machine
import { DEMO, loadSession } from '../../src/lib/portal.js';

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

export const staffSession = () => (MODE === 'api' ? read(localStorage, STAFF_STORE) : read(sessionStorage, KEY_STORE));

// Demo and local: the shared upload key. API: a staff login (kept apart from any customer login).
export async function staffSignIn({ key, email, password }) {
  if (MODE === 'api') {
    const data = await send(`${BASE}/accounts/login`, { method: 'POST', body: { email: email.trim(), password } });
    if (data.mfa_required) throw new Error('Two-step sign-in is not supported on the upload page yet.');
    write(localStorage, STAFF_STORE, { access: data.access, email: data.email || email.trim() });
    return;
  }
  write(sessionStorage, KEY_STORE, { key: key.trim() });
  await listAll(); // checks the key
}

export function staffSignOut() {
  write(localStorage, STAFF_STORE, null);
  write(sessionStorage, KEY_STORE, null);
}

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
  if (MODE === 'api') return (await send(`${BASE}/portal/reports`, { headers: { Authorization: `Bearer ${session?.access}` } })).results;
  const me = (session?.email || '').toLowerCase();
  if (MODE === 'local') return localAll().filter((r) => r.customer === me);
  return (await send(`/api/reports?customer=${encodeURIComponent(me)}`)).results;
}

export async function listAll() {
  if (MODE === 'api') return (await send(`${BASE}/staff/reports`, { headers: staffHeaders() })).results;
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
  if (MODE === 'api') return (await send(`${BASE}/staff/customers`, { headers: staffHeaders() })).results;
  return [...new Set((await listAll()).map((r) => r.customer))].map((c) => ({ id: c, name: c, login: c }));
}

export async function uploadReport({ customer, title, note, periodFrom, periodTo, file }) {
  if (file.size > MAX_MB * 1024 * 1024) throw new Error(`Files up to ${MAX_MB} MB can be uploaded.`);
  const content = await toBase64(file);
  const body = { customer, title, note, period_from: periodFrom, period_to: periodTo, filename: file.name, content_base64: content };
  if (MODE === 'api') return send(`${BASE}/staff/reports`, { method: 'POST', headers: staffHeaders(), body });
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
    throw new Error('This browser has no room left for test uploads. Delete some first.');
  }
  return report;
}

export async function deleteReport(id) {
  if (MODE === 'api') return send(`${BASE}/staff/reports/${encodeURIComponent(id)}`, { method: 'DELETE', headers: staffHeaders() });
  if (MODE === 'demo') return send(`/api/reports?id=${encodeURIComponent(id)}`, { method: 'DELETE', headers: staffHeaders() });
  write(localStorage, LOCAL_STORE, localAll().filter((r) => r.id !== id));
  return { ok: true };
}

// The file itself. API downloads need the customer's token; the others are plain URLs.
export async function fetchFile(report) {
  const headers = MODE === 'api' ? { Authorization: `Bearer ${loadSession()?.access || staffSession()?.access}` } : {};
  const res = await fetch(MODE === 'api' ? `${BASE}/portal/reports/${encodeURIComponent(report.id)}/file` : report.url, { headers });
  if (!res.ok) throw new Error('The report file could not be opened.');
  return res.arrayBuffer();
}

export const localKeyHint = MODE === 'local' ? LOCAL_KEY : '';

// Where the billing team uploads. Shown inside the portal in the demo and locally, and to anyone signed in
// as the billing team; real customers never see it.
export const UPLOAD_PATH = '/upload';
export const showUploadLink = () => MODE !== 'api' || Boolean(staffSession());
