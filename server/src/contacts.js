// Customers' other contact methods (Telegram, WhatsApp, Element X, Zangi, Signal, another email), set in portal
// Settings and shown on the customer's admin page. When a customer changes them, the team is emailed what changed.
//
//   GET /api/accounts/contacts   (customer)  -> { contacts }
//   PUT /api/accounts/contacts   (customer)  { telegram, whatsapp, element, zangi, signal, email } -> { contacts, changed, notified }

import { Router } from 'express';
import { requireUser } from './accounts.js';
import { emailContactsChanged } from './email.js';
import { getContacts, saveContacts } from './portal-db.js';
import { rateLimit } from './rate-limit.js';
import { HttpError } from './routes.js';

const PHONE = /^\+?[0-9][0-9 ()-]{5,19}$/;
const tidy = (s) => s.replace(/\s+/g, ' ').trim();

// Each method: its label (for the email) and how a value is checked and written down. Empty means "not given".
export const CONTACT_METHODS = {
  telegram: {
    label: 'Telegram',
    check(v) {
      const handle = v.replace(/^(https?:\/\/)?(t\.me|telegram\.me)\//i, '').replace(/^@/, '');
      if (/^[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(handle)) return `@${handle}`;
      if (PHONE.test(v)) return tidy(v);
      throw new HttpError(400, 'Please enter a valid Telegram @username or phone number.');
    },
  },
  whatsapp: {
    label: 'WhatsApp',
    check(v) {
      const number = v.replace(/^(https?:\/\/)?(wa\.me|api\.whatsapp\.com\/send\?phone=)\/?/i, '');
      // With the country code, so the team's wa.me link reaches them: 7 to 15 digits.
      if (PHONE.test(number) && /^\d{7,15}$/.test(number.replace(/\D/g, ''))) return tidy(number);
      throw new HttpError(400, 'Please enter a valid WhatsApp number with the country code, for example +1 555 123 4567.');
    },
  },
  element: {
    label: 'Element X',
    check(v) {
      const id = v.replace(/^(https?:\/\/)?matrix\.to\/#\//i, '');
      const full = id.startsWith('@') ? id : `@${id}`;
      if (/^@[a-z0-9._=/+-]+:[a-z0-9.-]+\.[a-z]{2,}(:\d{1,5})?$/i.test(full)) return full;
      throw new HttpError(400, 'Please enter a valid Element X (Matrix) ID, for example @name:matrix.org.');
    },
  },
  zangi: {
    label: 'Zangi',
    check(v) {
      if (/^\+?[0-9][0-9 -]{4,19}$/.test(v)) return tidy(v);
      throw new HttpError(400, 'Please enter a valid Zangi number.');
    },
  },
  signal: {
    label: 'Signal',
    check(v) {
      if (PHONE.test(v)) return tidy(v);
      const name = v.replace(/^@/, '');
      if (/^[a-z][a-z0-9_]{2,31}\.[0-9]{2,9}$/i.test(name)) return name;
      throw new HttpError(400, 'Please enter a valid Signal phone number or username, for example name.01.');
    },
  },
  email: {
    label: 'Email',
    check(v) {
      if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) && v.length <= 200) return v.toLowerCase();
      throw new HttpError(400, 'Please enter a valid email address.');
    },
  },
};

const empty = () => Object.fromEntries(Object.keys(CONTACT_METHODS).map((k) => [k, '']));
const view = (row) => ({ ...empty(), ...(row && Object.fromEntries(Object.keys(CONTACT_METHODS).map((k) => [k, row[k]]))), updated_at: row?.updated_at ?? null });

export async function contactsOf(userId) {
  return view(await getContacts(userId));
}

export const contactsRouter = Router();
contactsRouter.use(requireUser('customer'));

contactsRouter.get('/', async (req, res) => {
  res.json({ contacts: await contactsOf(req.user.id) });
});

contactsRouter.put('/', rateLimit({ windowMs: 10 * 60_000, max: 10, detail: 'Too many updates in a short period. Please wait a few minutes and try again.' }), async (req, res) => {
  const body = req.body || {};
  const next = empty();
  for (const [key, method] of Object.entries(CONTACT_METHODS)) {
    const raw = typeof body[key] === 'string' ? tidy(body[key]).slice(0, 120) : '';
    next[key] = raw ? method.check(raw) : '';
  }

  const before = await contactsOf(req.user.id);
  const changed = Object.keys(CONTACT_METHODS).filter((k) => before[k] !== next[k]);
  if (!changed.length) return res.json({ contacts: before, changed, notified: false });

  const contacts = view(await saveContacts(req.user.id, next));
  // The team hears about it by email; a failed email never undoes the save.
  let notified = false;
  try {
    const labels = Object.fromEntries(Object.entries(CONTACT_METHODS).map(([k, m]) => [k, m.label]));
    notified = await emailContactsChanged({ user: req.user, before, after: contacts, changed, labels });
  } catch (err) {
    console.error(`[email] could not send the contact change for ${req.user.email}:`, err.message);
  }
  res.json({ contacts, changed, notified });
});
