// Admin calls (server/src/admin.js): logins, setup links and each customer's billing.
import { authed, SignedOut } from '../../src/lib/portal.js';

// Runs an admin call; when the session has ended, sends the admin to log in instead of showing an error.
export const signedIn = (onSignedOut, load) => () => load().catch((err) => {
  if (err instanceof SignedOut) onSignedOut();
  throw err;
});

const json = (method, body) => ({ method, body });
const user = (id) => `/admin/users/${encodeURIComponent(id)}`;

export const listUsers = async () => (await authed('/admin/users')).results;
export const createUser = (form) => authed('/admin/users', json('POST', form));
export const updateUser = (id, change) => authed(user(id), json('PATCH', change));
export const sendLink = (id) => authed(`${user(id)}/invite`, json('POST'));
export const removeUser = (id) => authed(user(id), json('DELETE'));

export const fetchBilling = (id) => authed(`${user(id)}/billing`);
export const saveTerms = (id, terms) => authed(`${user(id)}/billing`, json('PUT', terms));
export const saveDay = (id, date, calls, price) => authed(`${user(id)}/days/${date}`, json('PUT', { calls: Number(calls), ...(price !== '' && price != null && { price_per_call: price }) }));
export const clearDay = (id, date) => authed(`${user(id)}/days/${date}`, json('DELETE'));
export const addPayment = (id, payment) => authed(`${user(id)}/payments`, json('POST', payment));
export const removePayment = (id, paymentId) => authed(`${user(id)}/payments/${encodeURIComponent(paymentId)}`, json('DELETE'));

// Where the person stands: waiting for their link, using the portal, or turned off.
export function loginState(u) {
  if (u.status === 'disabled') return { label: 'Turned Off', tone: 'off' };
  if (u.status === 'active') return { label: 'Active', tone: 'ok' };
  if (u.invite_expires_at) return { label: 'Link Sent', tone: 'wait' };
  return { label: 'Link Expired', tone: 'warn' };
}

export const TIME_ZONES = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Europe/London', 'Africa/Nairobi', 'UTC'];
