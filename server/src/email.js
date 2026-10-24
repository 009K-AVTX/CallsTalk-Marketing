// Notification emails: one for each new chat and each later visitor message, all in one
// email thread per chat. Each email has a button that opens the reply page for that message.
// Hitting "Reply" in the mail app writes to the visitor's own inbox instead (Reply-To).

import { readFileSync } from 'node:fs';
import nodemailer from 'nodemailer';
import { config, emailEnabled } from './config.js';
import { accessDetails, clip, escapeHtml, formatClock, shortId, transcriptLines, visitorDetails } from './format.js';
import { replyLink } from './reply.js';

const { to, from, smtp } = config.email;
const transport = emailEnabled && nodemailer.createTransport({
  host: smtp.host,
  port: smtp.port,
  secure: smtp.port === 465, // 465 = SSL; 587 upgrades with STARTTLS
  auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
});
const domain = (/<([^>]+)>/.exec(from)?.[1] ?? from).split('@').pop();

const html = (s) => escapeHtml(s).replace(/\n/g, '<br>');
const subject = (session) => `Website chat: ${session.name} (#${shortId(session)})`;
const threadId = (session) => `<chat-${session.id}@${domain}>`;

// Sent as inline (cid:) images, since Gmail shows neither SVG nor images from localhost.
// The .svg files next to the PNGs are their sources.
const images = ['logo', 'hero', 'waves'].map((name) => ({
  filename: `${name}.png`,
  content: readFileSync(new URL(`../assets/email/${name}.png`, import.meta.url)),
  cid: `${name}@callstalk`,
}));

// The site's palette (src/index.css) moved onto a light card: lilac accent, plum surfaces.
const c = {
  canvas: '#f1ecf9', card: '#fdfcfe', ink: '#16121b', body: '#4a4357', muted: '#6b6478', rule: '#ece6f4',
  panel: '#f4eefc', accent: '#d6a3ff', accentDeep: '#7f4bd0', plum: '#17141b', plumRule: '#2a2430',
  onPlum: '#c9c1d3', onPlumSoft: '#949494',
};
const HEAD = "Poppins,'Segoe UI',Helvetica,Arial,sans-serif";
const BODY = "Geist,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";

const wordmark = (talk, ink, size = 24) => `<span style="white-space:nowrap"><img src="cid:logo@callstalk" width="${size}" height="${size}" alt="" style="display:inline-block;vertical-align:middle;border:0">
<span style="display:inline-block;vertical-align:middle;margin-left:7px;font:600 ${Math.round(size * 0.7)}px/1 ${HEAD};letter-spacing:-.02em;color:${ink}">Calls<span style="color:${talk}">Talk</span></span></span>`;

function layout({ preview, heading, sub, body, link, name, email }) {
  const answer = email
    ? `<b style="color:#fff">Reply to this email</b> to write to ${escapeHtml(name)} at <a href="mailto:${escapeHtml(email)}" style="color:${c.accent};text-decoration:none">${escapeHtml(email)}</a>.`
    : `<b style="color:#fff">No email address given</b>, so answer in the chat.`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Poppins:wght@600&display=swap" rel="stylesheet">
<style>
@media (max-width:620px) {
  .px { padding-left:20px !important; padding-right:20px !important; }
  .col { display:block !important; max-width:100% !important; }
  .art { display:none !important; }
  .h1 { font-size:22px !important; }
  .stack { display:block !important; width:100% !important; padding-right:0 !important; text-align:left !important; }
}
</style>
<!--[if mso]><style>* { font-family:'Segoe UI',Arial,sans-serif !important; }</style><![endif]-->
</head>
<body style="margin:0;padding:0;background:${c.canvas}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${c.canvas}">${escapeHtml(preview)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${c.canvas}" style="background:${c.canvas} linear-gradient(180deg,#e4dbf4,${c.canvas} 320px)">
<tr><td align="center" style="padding:24px 10px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${c.card};border-radius:18px;box-shadow:0 24px 48px -36px rgba(80,40,140,.45)">

<tr><td class="px" style="padding:24px 28px 20px;font-size:0">
<!--[if mso]><table role="presentation" width="504" cellpadding="0" cellspacing="0"><tr><td width="364" valign="middle"><![endif]-->
<div class="col" style="display:inline-block;vertical-align:middle;width:100%;max-width:364px">
<div style="margin:0 0 16px">${wordmark(c.accentDeep, c.ink)}</div>
<h1 class="h1" style="margin:0 0 4px;font:600 24px/1.2 ${HEAD};letter-spacing:-.02em;color:${c.ink}">${heading}</h1>
<p style="margin:0 0 16px;font:400 14px/1.5 ${BODY};color:${c.body}">${sub}</p>
${link ? `<a href="${escapeHtml(link)}" style="display:inline-block;background:${c.accent};color:#0c0a0e;font:600 14px/1 ${BODY};text-decoration:none;padding:12px 22px;border-radius:999px">Reply to ${escapeHtml(name)}</a>` : ''}
</div><!--[if mso]></td><td width="140" valign="middle"><![endif]--><div class="col art" style="display:inline-block;vertical-align:middle;width:100%;max-width:140px;text-align:right">
<img src="cid:hero@callstalk" width="140" height="117" alt="" style="display:inline-block;width:100%;max-width:140px;height:auto;border:0">
</div>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>

${body}

<tr><td class="px" bgcolor="${c.plum}" style="background:${c.plum};border-radius:0 0 18px 18px;padding:18px 28px">
<p style="margin:0 0 12px;font:400 13px/1.55 ${BODY};color:${c.onPlum}">${answer}</p>
<div style="height:1px;line-height:1px;font-size:0;background:${c.plumRule};margin:0 0 12px">&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td class="stack">${wordmark(c.accent, '#fff', 20)}</td>
<td class="stack" align="right" style="font:400 12px/1.5 ${BODY};color:${c.onPlumSoft}">${link ? `Reply button works for <b style="color:${c.onPlum}">${config.replyLinkDays} days</b>` : ''}</td>
</tr></table>
</td></tr>

</table>
</td></tr></table>
</body></html>`;
}

// The visitor's message in a tinted panel, with the contour lines from the hero art.
const messagePanel = (label, text) => `<tr><td class="px" style="padding:0 28px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${c.panel}" style="background:${c.panel};border-radius:14px">
<tr><td style="padding:16px 20px 0">
<p style="margin:0 0 4px;font:600 12px/1.4 ${BODY};color:${c.accentDeep}">${label}</p>
<p style="margin:0;font:500 16px/1.5 ${BODY};color:${c.ink};overflow-wrap:anywhere">${html(text)}</p>
</td></tr>
<tr><td style="font-size:0;line-height:0"><img src="cid:waves@callstalk" width="504" alt="" style="display:block;width:100%;height:auto;border:0;border-radius:0 0 14px 14px"></td></tr>
</table>
</td></tr>`;

const sectionHeading = (text) => `<p style="margin:0 0 6px;font:600 14px/1.3 ${HEAD};letter-spacing:-.01em;color:${c.ink}">${text}</p>`;

// Visitor details as a two-column grid of label-over-value cells (one column on phones).
function detailGrid(details) {
  const cell = ([label, value]) => `<td class="stack" width="50%" valign="top" style="padding:8px 12px 8px 0;border-top:1px solid ${c.rule}">
<p style="margin:0;font:400 12px/1.4 ${BODY};color:${c.muted}">${label}</p>
<p style="margin:0;font:500 14px/1.45 ${BODY};color:${c.ink};overflow-wrap:anywhere">${label === 'Email'
    ? `<a href="mailto:${escapeHtml(value)}" style="color:${c.accentDeep};text-decoration:none">${html(value)}</a>`
    : html(value)}</p></td>`;
  const rows = [];
  for (let i = 0; i < details.length; i += 2) rows.push(`<tr>${cell(details[i])}${details[i + 1] ? cell(details[i + 1]) : '<td class="stack"></td>'}</tr>`);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows.join('')}</table>`;
}

function sendMail(session, { subject: subjectLine, text, link, first, ...content }) {
  return transport.sendMail({
    from,
    to,
    ...(session.email && { replyTo: { name: session.name, address: session.email } }),
    subject: subjectLine,
    ...(first ? { messageId: threadId(session) } : { inReplyTo: threadId(session), references: [threadId(session)] }),
    html: layout({ ...content, link, name: session.name, email: session.email }),
    text: `${text}\n\nReply in the website chat: ${link}\n`,
    attachments: images,
  });
}

export function newChatMail(chat, link) {
  const session = { id: chat.id, name: chat.name, email: chat.email };
  const details = visitorDetails(chat);
  const history = transcriptLines(chat.transcript);

  // The heading already names the visitor, so the grid leaves the name out.
  const shown = details.filter(([label]) => label !== 'Name');
  const earlier = (chat.transcript ?? []).map((m) => `<p style="margin:0 0 6px;font:400 13px/1.55 ${BODY};color:${c.body};overflow-wrap:anywhere">`
    + `<b style="font-weight:600;color:${m.from === 'visitor' ? c.accentDeep : c.muted}">${m.from === 'visitor' ? 'Visitor' : 'Assistant'}:</b> ${html(m.text)}</p>`).join('');

  const body = `${messagePanel('Their message', chat.message)}
<tr><td class="px" style="padding:12px 28px ${history.length ? 4 : 20}px">${detailGrid(shown)}</td></tr>
${history.length ? `<tr><td class="px" style="padding:12px 28px 18px">${sectionHeading('Earlier, with the AI assistant')}${earlier}</td></tr>` : ''}`;

  const text = `New website chat #${shortId(session)}\n\n${details.map(([l, v]) => `${l}: ${v}`).join('\n')}\n\nMessage:\n${chat.message}`
    + (history.length ? `\n\nEarlier, with the AI assistant:\n${history.join('\n\n')}` : '');

  return {
    session,
    subject: subject(session),
    preview: clip(chat.message, 110),
    heading: `New chat from ${escapeHtml(chat.name)}`,
    sub: 'Waiting in the website chat.',
    body,
    text,
    link,
    first: true,
  };
}

export function visitorMessageMail(session, message, link) {
  return {
    session,
    subject: `Re: ${subject(session)}`,
    preview: clip(message, 110),
    heading: `${escapeHtml(session.name)} sent a new message`,
    sub: `Chat #${shortId(session)} at ${formatClock()}.`,
    body: `${messagePanel('New message', message)}<tr><td style="padding:0 0 24px"></td></tr>`,
    text: `${session.name} (#${shortId(session)}): ${message}`,
    link,
  };
}

// A request-access form submission: its own email, not part of any chat thread, with no reply page.
export function accessRequestMail(request) {
  const details = accessDetails(request);
  // The heading already names the person, so the grid leaves the name out.
  const shown = details.filter(([label]) => label !== 'Name');
  const body = `${request.message ? messagePanel('Their message', request.message) : ''}
<tr><td class="px" style="padding:${request.message ? 12 : 0}px 28px 20px">${detailGrid(shown)}</td></tr>`;
  return {
    subject: `Access request: ${request.company} (${request.name})`,
    preview: `${request.name} from ${request.company} asked for access.`,
    heading: `Access request from ${escapeHtml(request.name)}`,
    sub: 'Approve it to send a CallsTalk.io login link.',
    body,
    text: `New access request\n\n${details.map(([l, v]) => `${l}: ${v}`).join('\n')}`
      + (request.message ? `\n\nMessage:\n${request.message}` : '')
      + '\n\nApprove it to send a CallsTalk.io login link.\n',
  };
}

// Returns false when email is turned off (EMAIL_TO empty).
export async function emailAccessRequest(request) {
  if (!transport) return false;
  const { subject: subjectLine, text, ...content } = accessRequestMail(request);
  await transport.sendMail({
    from,
    to,
    replyTo: { name: request.name, address: request.email },
    subject: subjectLine,
    html: layout({ ...content, name: request.name, email: request.email }),
    text,
    attachments: images,
  });
  return true;
}

export async function emailNewChat(chat, messageId) {
  if (!transport) return;
  const { session, ...mail } = newChatMail(chat, replyLink(chat.id, messageId));
  await sendMail(session, mail);
}

export async function emailVisitorMessage(session, message, messageId) {
  if (!transport) return;
  const { session: _, ...mail } = visitorMessageMail(session, message, replyLink(session.id, messageId));
  await sendMail(session, mail);
}

// For previewing the design (layout without sending).
export const renderMail = ({ session, ...mail }) => layout({ ...mail, name: session.name, email: session.email });

export function verifyEmail() {
  if (!transport) return;
  transport.verify()
    .then(() => console.log(`[email] SMTP ready, notifying ${to.join(', ')}`))
    .catch((err) => console.error(`[email] cannot log in to ${smtp.host}:${smtp.port}: ${err.message}`));
}
