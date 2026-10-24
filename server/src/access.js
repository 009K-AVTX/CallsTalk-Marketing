// Request-access form on the website (src/components/RequestAccess.jsx).
//
//   POST /api/request-access  { name, email, company, phone?, volume?, message? } -> 200 { ok: true }
//
// Posted to the team's Telegram chat and emailed to EMAIL_TO. It counts as received when either
// one gets through. Errors are returned as { detail }, which the form shows as written.

import { Router } from 'express';
import { notifyAccessRequest } from './telegram.js';
import { emailAccessRequest } from './email.js';
import { rateLimit } from './rate-limit.js';
import { clientIp } from './format.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const LIMITS = { name: 80, email: 120, company: 120, phone: 40, volume: 40, message: 1000 };
const VOLUMES = ['Under 100', '100–1,000', '1,000–10,000', 'Over 10,000'];

export const accessRouter = Router();

accessRouter.post('/', rateLimit({ windowMs: 10 * 60_000, max: 5 }), async (req, res) => {
  const body = req.body || {};
  // Bots fill the hidden "website" field; pretend success so they move on.
  if (body.website) return res.json({ ok: true });

  const request = Object.fromEntries(Object.entries(LIMITS)
    .map(([key, max]) => [key, typeof body[key] === 'string' ? body[key].trim().slice(0, max) : '']));
  if (!request.name || !request.email || !request.company) {
    return res.status(400).json({ detail: 'Please fill in your name, work email and company.' });
  }
  if (!EMAIL.test(request.email)) return res.status(400).json({ detail: 'Please enter a valid email address.' });
  if (request.volume && !VOLUMES.includes(request.volume)) request.volume = '';
  request.ip = clientIp(req); // for the team in Telegram

  const [telegram, email] = await Promise.allSettled([notifyAccessRequest(request), emailAccessRequest(request)]);
  if (telegram.status === 'rejected') console.error('[access] could not reach Telegram:', telegram.reason.message);
  if (email.status === 'rejected') console.error('[email] could not send access request:', email.reason.message);

  if (telegram.status === 'rejected' && email.value !== true) {
    return res.status(502).json({ detail: 'We could not send your request. Please try the chat instead.' });
  }
  res.json({ ok: true });
});
