// Support chat API used by the website widget (src/lib/support.js in the site).
//
//   POST /support/chat                  start a session   -> 201 { session_id, message }
//   POST /support/chat/:sessionId       visitor follow-up -> 200 { message }
//   GET  /support/chat/:sessionId       full transcript   -> 200 { session_id, status, messages }
//   POST /support/chat/:sessionId/end   closed by visitor -> 200 { status }
//
// Errors are returned as { detail }, which the widget shows to the visitor as written.

import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { addMessage, createSession, getSession, linkTelegramMessage, listMessages, setStatus } from './db.js';
import { notifyNewChat, notifyVisitorEnded, notifyVisitorMessage } from './telegram.js';
import { emailNewChat, emailVisitorMessage } from './email.js';
import { rateLimit } from './rate-limit.js';
import { ANONYMOUS_NAME } from './format.js';
import { config } from './config.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

class HttpError extends Error {
  constructor(status, detail) {
    super(detail);
    this.status = status;
  }
}

function text(value, field, { max, required = true } = {}) {
  const s = typeof value === 'string' ? value.trim() : '';
  if (!s && required) throw new HttpError(400, `Please enter your ${field}.`);
  if (s.length > max) throw new HttpError(400, `Your ${field} is too long (${max} characters at most).`);
  return s;
}

// The browser's own report of its name, version, OS and model (see reportedDevice in src/lib/support.js).
function reportedDevice(device) {
  if (!device || typeof device !== 'object') return undefined;
  return Object.fromEntries(['browser', 'version', 'platform', 'platformVersion', 'model']
    .map((key) => [key, typeof device[key] === 'string' ? device[key].trim().slice(0, 40) : '']));
}

async function loadSession(req) {
  const session = await getSession(req.params.sessionId);
  if (!session) throw new HttpError(404, 'Chat session not found. Please start a new chat.');
  return session;
}

// Email is a second channel: if it fails, the chat still works through Telegram.
const emailFailed = (err) => console.error('[email] could not send notification:', err.message);

function teamUnreachable(err) {
  console.error('[support] could not reach Telegram:', err.message);
  return new HttpError(502, 'We could not reach our team just now. Please try again in a moment.');
}

export const router = Router();

router.post('/chat', rateLimit({ windowMs: 10 * 60_000, max: 5 }), async (req, res) => {
  const body = req.body || {};
  // Name and email are optional: a visitor can just type a question into the chat.
  const givenName = text(body.name, 'name', { max: 100, required: false });
  const email = text(body.email, 'email', { max: 200, required: false });
  if (email && !EMAIL.test(email)) throw new HttpError(400, 'Please enter a valid email address.');
  const name = givenName || ANONYMOUS_NAME;
  const message = text(body.message, 'message', { max: 2000 });
  const referrer = text(body.referrer, 'referrer', { max: 500, required: false });
  const transcript = (Array.isArray(body.transcript) ? body.transcript : [])
    .filter((m) => m && typeof m.text === 'string' && m.text.trim())
    .slice(-20)
    .map((m) => ({ from: m.from === 'visitor' ? 'visitor' : 'assistant', text: m.text.trim().slice(0, 2000) }));

  const id = randomUUID();
  const chat = {
    id, name, email, message, referrer, transcript,
    anonymous: !givenName,
    userAgent: req.get('user-agent'),
    device: reportedDevice(body.device),
  };
  let posted;
  try {
    posted = await notifyNewChat(chat);
  } catch (err) {
    throw teamUnreachable(err);
  }

  const messageId = await createSession({ id, name, email, threadId: posted.threadId, message });
  await linkTelegramMessage(config.telegram.chatId, posted.messageId, id);
  emailNewChat(chat, messageId).catch(emailFailed);
  res.status(201).json({ session_id: id, message: 'Thanks. Our team has your message and will reply here shortly.' });
});

router.post('/chat/:sessionId', rateLimit({ windowMs: 60_000, max: 30 }), async (req, res) => {
  const session = await loadSession(req);
  const message = text(req.body?.message, 'message', { max: 2000 });
  if (session.status !== 'open') throw new HttpError(409, 'This chat has ended. Start a new chat to keep talking to our team.');

  try {
    await notifyVisitorMessage(session, message);
  } catch (err) {
    throw teamUnreachable(err);
  }
  const messageId = await addMessage(session.id, 'visitor', session.name, message);
  emailVisitorMessage(session, message, messageId).catch(emailFailed);
  res.json({ message: 'Sent.' });
});

router.get('/chat/:sessionId', rateLimit({ windowMs: 60_000, max: 120 }), async (req, res) => {
  const session = await loadSession(req);
  res.setHeader('Cache-Control', 'no-store');
  res.json({ session_id: session.id, status: session.status, messages: await listMessages(session.id) });
});

router.post('/chat/:sessionId/end', rateLimit({ windowMs: 60_000, max: 10 }), async (req, res) => {
  const session = await loadSession(req);
  if (session.status === 'open') {
    await setStatus(session.id, 'ended');
    notifyVisitorEnded(session).catch((err) => console.error('[support] could not post chat end:', err.message));
  }
  res.json({ status: 'ended' });
});

export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  if (err instanceof HttpError) return res.status(err.status).json({ detail: err.message });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ detail: 'The request was not valid JSON.' });
  if (err.type === 'entity.too.large') return res.status(413).json({ detail: 'That message is too large.' });
  console.error('[server]', err);
  res.status(500).json({ detail: 'Something went wrong on our side. Please try again.' });
}
