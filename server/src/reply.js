// Reply page linked from the notification emails: /reply/<signed token>.
//
// The token is the session id plus an expiry, signed with a server-side secret, so only links
// this server emailed work. The visitor's own session id is not enough to open the page.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express, { Router } from 'express';
import { config } from './config.js';
import { addMessage, getSession, getValue, listTranscript, setStatus, setValue } from './db.js';
import { clip, escapeHtml, formatClock, shortId, TEAM_ENDED_MESSAGE } from './format.js';
import { rateLimit } from './rate-limit.js';
import { notifyAgentReply, notifyEndedFromEmail } from './telegram.js';

let secret;

// Loads the signing secret (created on first run) so links can be signed without a database call.
export async function initReplyLinks() {
  secret = await getValue('reply_link_secret');
  if (!secret) {
    await setValue('reply_link_secret', randomBytes(32).toString('hex'));
    secret = await getValue('reply_link_secret');
  }
}

function sign(payload) {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

// `messageId` scrolls the page to, and highlights, the message the email was about.
export function replyLink(sessionId, messageId) {
  const expires = Math.floor(Date.now() / 1000) + config.replyLinkDays * 86400;
  const payload = `${sessionId}.${expires.toString(36)}`;
  return `${config.publicUrl}/reply/${payload}.${sign(payload)}${messageId ? `#m${messageId}` : ''}`;
}

async function verify(token) {
  const parts = /^([0-9a-f-]{36})\.([0-9a-z]+)\.([\w-]{43})$/.exec(token || '');
  if (!parts) return { error: 'invalid' };
  const expected = Buffer.from(sign(`${parts[1]}.${parts[2]}`));
  const given = Buffer.from(parts[3]);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { error: 'invalid' };
  if (parseInt(parts[2], 36) * 1000 < Date.now()) return { error: 'expired' };
  const session = await getSession(parts[1]);
  return session ? { session } : { error: 'invalid' };
}

// Styled after the site's chat panel (src/index.css, "Chat widget"): black page, plum panel, lilac accent,
// the same head, bubbles and pill compose. The visitor's details sit in a side column, like the widget's chat list.
// Fonts are the site's own files, served from /reply/_fonts (see the router below).
const CSS = `
@font-face { font-family: Geist; font-weight: 400 600; font-display: swap; src: url(/reply/_fonts/geist-400-600.woff2) format('woff2'); }
@font-face { font-family: Poppins; font-weight: 500; font-display: swap; src: url(/reply/_fonts/poppins-500.woff2) format('woff2'); }
@font-face { font-family: Poppins; font-weight: 600; font-display: swap; src: url(/reply/_fonts/poppins-600.woff2) format('woff2'); }
:root {
  color-scheme: dark;
  --abyss: #000; --raised: #17141b; --rule: #2a2430; --rule-strong: #4d4555;
  --accent: #d6a3ff; --accent-hover: #e2bcff; --white: #fff; --slate: #949494; --ice: #d4d4d4;
  --head: Poppins, system-ui, sans-serif; --sans: Geist, system-ui, -apple-system, 'Segoe UI', sans-serif;
  --ease: cubic-bezier(.2, .7, .2, 1);
}
* { box-sizing: border-box; }
html { background: var(--abyss); }
body {
  margin: 0; min-height: 100dvh; color: var(--white); font: 16px/1.55 var(--sans); -webkit-font-smoothing: antialiased;
  background: radial-gradient(60% 45% at 80% 0%, rgba(126, 72, 190, .2), transparent 70%) no-repeat, var(--abyss);
}
a { color: var(--accent); text-decoration-thickness: 1px; text-underline-offset: 4px; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; border-radius: 6px; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

.shell { max-width: 940px; margin: 0 auto; padding: 32px 24px; }
.panel {
  display: grid; grid-template-columns: 210px minmax(0, 1fr); grid-template-rows: auto 1fr;
  min-height: min(680px, calc(100dvh - 64px)); background: var(--raised); border: 1px solid var(--rule); border-radius: 24px;
  overflow: clip; box-shadow: 0 40px 90px -30px rgba(0, 0, 0, .7), 0 0 0 4px rgba(214, 163, 255, .05);
}

/* Head: the widget's chat__head */
.head {
  grid-column: 1 / -1; display: flex; align-items: center; gap: 12px; padding: 16px 16px 14px 20px;
  background: var(--abyss); border-bottom: 1px solid var(--rule);
}
.mark { flex: none; width: 30px; height: 30px; display: block; }
.head div { min-width: 0; }
.head h1 { margin: 0; font: 500 1.15rem/1.25 var(--head); letter-spacing: -.01em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.head small { display: flex; flex-wrap: wrap; align-items: center; gap: 0 8px; color: var(--slate); font-size: .84rem; }
.status { display: inline-flex; align-items: center; gap: 6px; color: var(--ice); }
.status::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: var(--accent); }
.status.is-ended::before { background: var(--rule-strong); }
.round {
  flex: none; display: grid; place-items: center; width: 38px; height: 38px; margin-left: auto; border-radius: 50%;
  border: 1px solid var(--rule); color: var(--white); transition: border-color .2s var(--ease), transform .15s var(--ease);
}
.round:hover { border-color: var(--accent); }
.round:active { transform: scale(.94); }
.round svg { width: 16px; height: 16px; }

/* Visitor column: the widget's chat__sidebar */
.side { display: flex; flex-direction: column; gap: 14px; padding: 18px 16px; background: var(--abyss); border-right: 1px solid var(--rule); }
.side dl { display: grid; gap: 12px; margin: 0; }
.side dt { font-size: .76rem; color: var(--slate); }
.side dd { margin: 1px 0 0; font-size: .9rem; overflow-wrap: anywhere; }
.side p { margin: auto 0 0; padding-top: 14px; border-top: 1px solid var(--rule); font-size: .8rem; line-height: 1.5; color: var(--slate); text-wrap: pretty; }

/* Messages: the widget's chat__list and bubbles, seen from the team's side */
.main { display: flex; flex-direction: column; min-width: 0; }
.list { flex: 1; list-style: none; margin: 0; padding: 20px 20px 12px; display: flex; flex-direction: column; gap: 10px; background: var(--abyss); }
.msg { display: flex; flex-direction: column; align-items: flex-start; gap: 3px; max-width: min(80%, 540px); scroll-margin: 88px 0 150px; }
.msg--team { align-self: flex-end; align-items: flex-end; }
.bubble {
  margin: 0; padding: 10px 15px; border-radius: 18px; font-size: .95rem; line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere;
  background: var(--raised); border: 1px solid var(--rule); border-bottom-left-radius: 6px;
}
.msg--team .bubble { background: var(--white); color: var(--abyss); border-color: var(--white); border-radius: 18px 18px 6px 18px; }
.msg small { padding: 0 6px; font-size: .74rem; color: var(--slate); font-variant-numeric: tabular-nums; }
.msg:target .bubble { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(214, 163, 255, .22); }
.msg:target small::after { content: " · from the email"; color: var(--accent); }
.note { align-self: center; max-width: 100%; margin: 4px 0; text-align: center; font-size: .8rem; color: var(--slate); }
.note b { color: var(--white); font-weight: 600; }
.note--ok { padding: 7px 14px; border: 1px solid var(--rule); border-radius: 999px; color: var(--ice); scroll-margin-bottom: 150px; }

/* Compose: the widget's chat__compose and chat__foot */
.compose { position: sticky; bottom: 0; display: grid; gap: 8px; padding: 12px 14px 8px; background: var(--raised); border-top: 1px solid var(--rule); }
.compose__row { display: flex; align-items: flex-end; gap: 8px; }
.compose textarea {
  flex: 1; min-width: 0; min-height: 44px; max-height: 40dvh; field-sizing: content; resize: none;
  font: inherit; font-size: .97rem; line-height: 1.45; padding: 10px 16px; color: var(--white);
  background: var(--abyss); border: 1px solid var(--rule); border-radius: 22px; outline: none; transition: border-color .2s var(--ease);
}
.compose textarea:focus, .compose input:focus { border-color: var(--accent); }
.send {
  flex: none; width: 44px; height: 44px; border-radius: 50%; border: 0; background: var(--accent); cursor: pointer; position: relative;
  transition: background .2s var(--ease), transform .15s var(--ease);
}
.send:hover { background: var(--accent-hover); }
.send:active { transform: scale(.94); }
.send::before { content: ""; position: absolute; left: 16px; top: 14px; border-style: solid; border-width: 8px 0 8px 13px; border-color: transparent transparent transparent var(--abyss); }
.compose__foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0 4px; }
.as { display: flex; align-items: center; gap: 8px; min-width: 0; font-size: .84rem; color: var(--slate); }
.as input {
  width: 12em; min-width: 0; font: inherit; font-size: .86rem; padding: 5px 12px; color: var(--white);
  background: var(--abyss); border: 1px solid var(--rule); border-radius: 999px; outline: none;
}
.text-btn {
  flex: none; background: none; border: 0; font: inherit; font-size: .88rem; font-weight: 500; color: var(--white); cursor: pointer;
  text-decoration: underline; text-decoration-color: var(--accent); text-underline-offset: 4px; padding: 8px 4px;
}
.text-btn:hover { text-decoration-color: currentColor; }
.alert { margin: 0; padding: 9px 14px; border: 1px solid #6a3346; border-radius: 14px; background: #1f1217; color: #ffd6e0; font-size: .86rem; }
.closed { position: sticky; bottom: 0; margin: 0; padding: 16px 20px calc(16px + env(safe-area-inset-bottom)); text-align: center; background: var(--raised); border-top: 1px solid var(--rule); font-size: .9rem; color: var(--slate); }
.closed b { color: var(--white); }

/* Error pages: just the head and a line of text */
.panel--msg { display: block; min-height: 0; max-width: 460px; margin: 12vh auto 0; }
.panel--msg .body { margin: 0; padding: 20px 20px 24px; color: var(--slate); text-wrap: pretty; }
.panel--msg b { color: var(--white); font-weight: 600; }

/* Phones: the panel fills the screen, head and compose stay in reach, visitor details become one line */
@media (max-width: 720px) {
  .shell { padding: 0; }
  .panel { grid-template-columns: 1fr; grid-template-rows: auto auto 1fr; min-height: 100dvh; border: 0; border-radius: 0; box-shadow: none; }
  .panel--msg { min-height: 0; margin: 0; max-width: none; }
  .head { position: sticky; top: 0; z-index: 1; padding: 10px 10px 10px 14px; padding-top: max(10px, env(safe-area-inset-top)); gap: 10px; }
  .mark { width: 26px; height: 26px; }
  .head h1 { font-size: 1.05rem; }
  .round { width: 44px; height: 44px; }
  .side { flex-direction: row; padding: 8px 14px; border-right: 0; border-bottom: 1px solid var(--rule); }
  .side dl { display: flex; flex-wrap: wrap; gap: 2px 16px; }
  .side dl div { display: flex; gap: 6px; align-items: baseline; min-width: 0; }
  .side dt, .side dd { font-size: .8rem; margin: 0; }
  .side .is-name, .side p { display: none; }
  .list { padding: 16px 12px 10px; gap: 8px; }
  .msg { max-width: 86%; }
  .compose { padding: 8px 10px calc(6px + env(safe-area-inset-bottom)); gap: 4px; }
  .as { flex: 1; }
  .as input { flex: 1; width: auto; }
}
@media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
`;

// The CallsTalk mark (src/components/Logo.jsx), inline so the page needs no image requests.
const MARK = `<svg class="mark" viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="mk" x1="4" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#d6a3ff"/><stop offset="1" stop-color="#7f4bd0"/></linearGradient></defs>
<path fill="url(#mk)" d="M9 3h14a7 7 0 0 1 7 7v8a7 7 0 0 1-7 7H12.5l-6.2 4.6A1 1 0 0 1 4.7 28.8L5.6 24.3A7 7 0 0 1 2 18v-8a7 7 0 0 1 7-7Z"/>
<rect x="9" y="14" width="3.6" height="6" rx="1.8" fill="#fff" opacity=".75"/><rect x="14.2" y="11" width="3.6" height="9" rx="1.8" fill="#fff" opacity=".88"/><rect x="19.4" y="8" width="3.6" height="12" rx="1.8" fill="#fff"/></svg>`;

const REFRESH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v5h-5"/></svg>';

// Bubbles show just the time; the day goes in a note whenever it changes.
const clock = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: config.timezone });
const dayOf = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: config.timezone });

function page(res, status, title, body) {
  res.status(status).type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="robots" content="noindex">
<meta name="theme-color" content="#000000"><title>${escapeHtml(title)}</title><style>${CSS}</style></head>
<body><main class="shell">${body}</main></body></html>`);
}

function renderError(res, error) {
  const expired = error === 'expired';
  page(res, expired ? 410 : 404, 'Link not valid', `<section class="panel panel--msg">
<header class="head">${MARK}<div><h1>${expired ? 'This link has expired' : 'This link is not valid'}</h1><small>CallsTalk team reply</small></div></header>
<p class="body">${expired ? 'Reply links stop working after a while for safety. <b>Use a link from a newer email</b>, or reply in Telegram.' : '<b>Check that the whole link was copied</b>, or reply in Telegram instead.'}</p>
</section>`);
}

async function renderChat(res, session, { notice, error, agentName = '', draft = '' } = {}) {
  const name = escapeHtml(session.name);
  const started = new Date(session.created_at);
  let day = dayOf.format(started);
  const messages = (await listTranscript(session.id)).map((m) => {
    const at = new Date(m.created_at);
    const visitor = m.sender === 'visitor';
    const meta = visitor ? clock.format(at) : `${escapeHtml(m.sender_name || 'Team')} · ${clock.format(at)}`;
    const newDay = dayOf.format(at) !== day && (day = dayOf.format(at));
    return `${newDay ? `<li class="note">${newDay}</li>` : ''}<li id="m${m.id}" class="msg msg--${visitor ? 'visitor' : 'team'}"><p class="bubble">${escapeHtml(m.message)}</p><small>${meta}</small></li>`;
  }).join('');

  const ended = session.status !== 'open';
  const email = session.email ? `<a href="mailto:${escapeHtml(session.email)}">${escapeHtml(session.email)}</a>` : '';
  const compose = ended
    ? `<p class="closed"><b>This chat has ended.</b>${email ? ` To follow up, email ${name} at ${email}.` : ''}</p>`
    : `<form class="compose" method="post">
${error ? `<p class="alert" role="alert">${escapeHtml(error)}</p>` : ''}
<div class="compose__row">
<label class="sr-only" for="message">Reply to ${name}</label>
<textarea id="message" name="message" rows="1" maxlength="4000" required placeholder="Reply to ${name}">${escapeHtml(draft)}</textarea>
<button class="send" type="submit" aria-label="Send reply" title="Send reply"></button>
</div>
<div class="compose__foot">
<label class="as">Sending as<input name="name" value="${escapeHtml(agentName)}" maxlength="60" autocomplete="name" placeholder="Your name"></label>
<button class="text-btn" type="submit" name="action" value="end" formnovalidate title="Anything typed above is sent as your last message">End chat</button>
</div>
</form>`;

  page(res, error ? 400 : 200, `Chat with ${session.name}`, `<section class="panel">
<header class="head">${MARK}
<div><h1>${name}</h1><small><span class="status${ended ? ' is-ended' : ''}">${ended ? 'Ended' : 'Open'}</span><span>Chat #${escapeHtml(shortId(session))}</span></small></div>
<a class="round" href="?" aria-label="Refresh" title="Refresh">${REFRESH}</a>
</header>
<aside class="side" aria-label="Visitor">
<dl>
<div class="is-name"><dt>Name</dt><dd>${name}</dd></div>
<div><dt>Email</dt><dd>${email || 'Not given'}</dd></div>
<div><dt>Started</dt><dd>${dayOf.format(started)}, ${escapeHtml(formatClock(started))}</dd></div>
</dl>
<p>Your reply shows in their chat within a few seconds and is posted to Telegram.</p>
</aside>
<div class="main">
<ol class="list" aria-live="polite">
<li class="note">${dayOf.format(started)}</li>
${messages}
${notice ? `<li id="done" class="note note--ok" role="status">${notice}</li>` : ''}
</ol>
${compose}
</div>
</section>`);
}

const savedName = (req) => decodeURIComponent(/(?:^|;\s*)reply_name=([^;]*)/.exec(req.get('cookie') || '')?.[1] || '');
// Shown as HTML, so these must stay fixed strings.
const NOTICES = { sent: '<b>Reply sent.</b> It shows in their chat within a few seconds.', ended: '<b>Chat ended.</b> The visitor sees your last message.' };

export const replyRouter = Router();
replyRouter.use('/_fonts', express.static(fileURLToPath(new URL('../assets/fonts', import.meta.url)), { immutable: true, maxAge: '1y', fallthrough: false }));
replyRouter.use(express.urlencoded({ extended: false, limit: '16kb' }));
replyRouter.use((req, res, next) => {
  res.set({
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer', // the token is in the URL; never leak it to other sites
    'X-Robots-Tag': 'noindex, nofollow',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  });
  next();
});

replyRouter.get('/:token', rateLimit({ windowMs: 60_000, max: 60 }), async (req, res) => {
  const { session, error } = await verify(req.params.token);
  if (error) return renderError(res, error);
  const notice = Object.hasOwn(NOTICES, req.query.done ?? '') ? NOTICES[req.query.done] : '';
  await renderChat(res, session, { notice, agentName: savedName(req) });
});

replyRouter.post('/:token', rateLimit({ windowMs: 60_000, max: 20 }), async (req, res) => {
  const { session, error } = await verify(req.params.token);
  if (error) return renderError(res, error);

  const agentName = clip(String(req.body?.name || '').trim(), 60);
  const shownName = agentName || 'CallsTalk team';
  if (agentName) res.cookie('reply_name', agentName, { maxAge: 365 * 86400_000, httpOnly: true, sameSite: 'lax', secure: req.secure, path: '/reply' });

  if (session.status !== 'open') return await renderChat(res, session, { agentName });
  const message = String(req.body?.message || '').trim();
  if (message.length > 4000) return await renderChat(res, session, { error: 'That reply is too long (4000 characters at most).', agentName, draft: message });

  // Ends the chat: the visitor sees the last message and can no longer reply; anything typed is sent as that message.
  if (req.body?.action === 'end') {
    await addMessage(session.id, 'agent', agentName || null, message || TEAM_ENDED_MESSAGE);
    await setStatus(session.id, 'ended');
    notifyEndedFromEmail(session, shownName).catch((err) => console.error('[reply] could not post to Telegram:', err.message));
    return res.redirect(303, `${req.params.token}?done=ended#done`);
  }

  if (!message) return await renderChat(res, session, { error: 'Please write a reply first.', agentName });
  await addMessage(session.id, 'agent', agentName || null, message);
  notifyAgentReply(session, shownName, message).catch((err) => console.error('[reply] could not post to Telegram:', err.message));
  res.redirect(303, `${req.params.token}?done=sent#done`);
});
