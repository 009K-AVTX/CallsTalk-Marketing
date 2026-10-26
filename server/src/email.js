// Notification emails: one for each new chat and each later visitor message, all in one
// email thread per chat. Each email has a button that opens the reply page for that message.
// Hitting "Reply" in the mail app writes to the visitor's own inbox instead (Reply-To).

import { readFileSync } from 'node:fs';
import nodemailer from 'nodemailer';
import { config, emailEnabled } from './config.js';
import { accessDetails, chatKind, clip, escapeHtml, formatClock, shortId, transcriptLines, visitorDetails } from './format.js';
import { replyLink } from './reply.js';

const { to, from, smtp } = config.email;
const makeTransport = () => nodemailer.createTransport({
  host: smtp.host,
  port: smtp.port,
  secure: smtp.port === 465, // 465 = SSL; 587 upgrades with STARTTLS
  auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
});
const transport = emailEnabled && makeTransport();
// Portal setup links go to customers, so they only need SMTP, not EMAIL_TO.
const customerTransport = transport || (smtp.host && from && makeTransport());
const domain = (/<([^>]+)>/.exec(from)?.[1] ?? from).split('@').pop();

const html = (s) => escapeHtml(s).replace(/\n/g, '<br>');
// Chats from a local copy of the server (NODE_ENV=development) say so, so the team can tell them from real ones.
const subject = (session) => `${config.isDev ? '[Local test] ' : ''}${chatKind(session) === 'customer' ? 'Customer' : 'Website'} chat: ${session.company || session.name} (#${shortId(session)})`;
const threadId = (session) => `<chat-${session.id}@${domain}>`;

// Sent as inline (cid:) images, since Gmail shows neither SVG nor images from localhost.
// The .svg files next to the PNGs are their sources.
const images = ['logo', 'hero', 'waves'].map((name) => ({
  filename: `${name}.png`,
  content: readFileSync(new URL(`../assets/email/${name}.png`, import.meta.url)),
  cid: `${name}@callstalk`,
}));
// Only the images an email's HTML shows: mail apps list an inline image the HTML never uses as an attachment.
const send = (via, mail) => via.sendMail({ ...mail, attachments: images.filter((img) => mail.html.includes(`cid:${img.cid}`)) });

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

// `cta` and `footer` replace the chat's reply button and footer line (portal emails).
function layout({ preview, heading, sub, body, link, name, email, cta, footer, footnote }) {
  const answer = footer || (email
    ? `<b style="color:#fff">Reply to this email</b> to write to ${escapeHtml(name)} at <a href="mailto:${escapeHtml(email)}" style="color:${c.accent};text-decoration:none">${escapeHtml(email)}</a>.`
    : `<b style="color:#fff">No email address given</b>, so answer in the chat.`);
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
${link || cta ? `<a href="${escapeHtml(cta?.href || link)}" style="display:inline-block;background:${c.accent};color:#0c0a0e;font:600 14px/1 ${BODY};text-decoration:none;padding:12px 22px;border-radius:999px">${escapeHtml(cta?.label || `Reply to ${name}`)}</a>` : ''}
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
<td class="stack" align="right" style="font:400 12px/1.5 ${BODY};color:${c.onPlumSoft}">${footnote || (link ? `Reply button works for <b style="color:${c.onPlum}">${config.replyLinkDays} days</b>` : '')}</td>
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
// A third item "code" (wallet addresses, transaction hashes) gets a row of its own in a fixed-width font.
const MONO = "ui-monospace,Menlo,Consolas,'Courier New',monospace";
function detailGrid(details) {
  const cell = ([label, value, kind]) => `<td class="stack" ${kind === 'code' ? 'colspan="2" width="100%"' : 'width="50%"'} valign="top" style="padding:8px 12px 8px 0;border-top:1px solid ${c.rule}">
<p style="margin:0;font:400 12px/1.4 ${BODY};color:${c.muted}">${label}</p>
<p style="margin:0;font:500 ${kind === 'code' ? `12px/1.5 ${MONO}` : `14px/1.45 ${BODY}`};color:${c.ink};overflow-wrap:anywhere">${label === 'Email'
    ? `<a href="mailto:${escapeHtml(value)}" style="color:${c.accentDeep};text-decoration:none">${html(value)}</a>`
    : html(value)}</p></td>`;
  const pair = (a, b) => `<tr>${cell(a)}${b ? cell(b) : '<td class="stack"></td>'}</tr>`;
  const rows = [];
  let waiting = null; // a half-width cell still looking for its neighbour
  for (const d of details) {
    if (d[2] === 'code') {
      if (waiting) rows.push(pair(waiting));
      waiting = null;
      rows.push(`<tr>${cell(d)}</tr>`);
    } else if (waiting) {
      rows.push(pair(waiting, d));
      waiting = null;
    } else waiting = d;
  }
  if (waiting) rows.push(pair(waiting));
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows.join('')}</table>`;
}

function sendMail(session, { subject: subjectLine, text, link, first, ...content }) {
  return send(transport, {
    from,
    to,
    ...(session.email && { replyTo: { name: session.name, address: session.email } }),
    subject: subjectLine,
    ...(first ? { messageId: threadId(session) } : { inReplyTo: threadId(session), references: [threadId(session)] }),
    html: layout({ ...content, link, name: session.name, email: session.email }),
    text: `${text}\n\nReply in the website chat: ${link}\n`,
  });
}

export function newChatMail(chat, link) {
  const session = { id: chat.id, name: chat.name, email: chat.email, company: chat.company, portal_user_id: chat.portal ? chat.portalUserId : null };
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
    sub: chat.portal ? `A signed-in customer${chat.company ? ` at ${escapeHtml(chat.company)}` : ''}, in the portal chat.` : 'Waiting in the website chat.',
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
    sub: 'Sent from the Request Access form on the website.',
    body,
    text: `New access request\n\n${details.map(([l, v]) => `${l}: ${v}`).join('\n')}`
      + (request.message ? `\n\nMessage:\n${request.message}` : '') + '\n',
  };
}

// Returns false when email is turned off (EMAIL_TO empty).
export async function emailAccessRequest(request) {
  if (!transport) return false;
  const { subject: subjectLine, text, ...content } = accessRequestMail(request);
  await send(transport, {
    from,
    to,
    replyTo: { name: request.name, address: request.email },
    subject: subjectLine,
    html: layout({ ...content, name: request.name, email: request.email }),
    text,
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

// A customer changed their contact methods in portal Settings: every method, before and now, changes in bold.
export function contactsChangedMail({ user, before, after, changed, labels }) {
  const who = user.company || user.name || user.email;
  const show = (v) => (v ? html(v) : `<span style="color:${c.muted}">not given</span>`);
  const cell = 'padding:9px 10px 9px 0;border-top:1px solid ' + c.rule + ';font:400 13px/1.45 ' + BODY + ';vertical-align:top;overflow-wrap:anywhere';
  const rows = Object.keys(labels).map((k) => {
    const on = changed.includes(k);
    const weight = on ? `font-weight:600;color:${c.ink}` : `color:${c.body}`;
    return `<tr><td style="${cell};${weight};width:24%">${labels[k]}${on ? ` <span style="color:${c.accentDeep}">(changed)</span>` : ''}</td>`
      + `<td style="${cell};color:${c.muted};width:38%">${on ? show(before[k]) : ''}</td>`
      + `<td style="${cell};${weight};width:38%">${show(after[k])}</td></tr>`;
  }).join('');
  const head = (t) => `<td style="padding:0 10px 6px 0;font:600 11px/1.3 ${BODY};letter-spacing:.06em;text-transform:uppercase;color:${c.accentDeep}">${t}</td>`;
  const body = `<tr><td class="px" style="padding:0 28px 22px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed"><tr>${head('Method')}${head('Before')}${head('Now')}</tr>${rows}</table>
</td></tr>`;
  const list = changed.map((k) => labels[k]).join(', ');
  return {
    subject: `${config.isDev ? '[Local test] ' : ''}Contact details updated: ${who}`,
    preview: `${who} changed ${list}.`,
    heading: `${escapeHtml(who)} updated their contact details`,
    sub: `<b>${escapeHtml(list)}</b> changed in the portal by ${escapeHtml(user.name || user.email)} (${escapeHtml(user.email)}) at ${formatClock()}.`,
    body,
    text: `${who} updated their contact details in the portal (${user.email}).\n\n`
      + Object.keys(labels).map((k) => `${labels[k]}: ${after[k] || 'not given'}${changed.includes(k) ? `  (was: ${before[k] || 'not given'})` : ''}`).join('\n') + '\n',
  };
}

// Returns false when email is turned off (EMAIL_TO empty).
export async function emailContactsChanged(change) {
  if (!transport) return false;
  const { subject: subjectLine, text, ...content } = contactsChangedMail(change);
  await send(transport, {
    from,
    to,
    replyTo: { name: change.user.name || change.user.email, address: change.user.email },
    subject: subjectLine,
    html: layout({ ...content, name: change.user.name || change.user.email, email: change.user.email }),
    text,
  });
  return true;
}

// A portal setup link for a new login, or a fresh one after a reset. Returns false when SMTP is not set up.
export function inviteMail({ name, email, link, expiresAt, reset, timeZone = config.timezone }) {
  // "October 31, 11:12 PM EDT", in the customer's own time zone.
  const until = expiresAt.toLocaleString('en-US', { timeZone, month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  const steps = [
    ['Open Your Setup Link', 'This link can be used <b>once</b> and is valid until <b>' + escapeHtml(until) + '</b>.'],
    ['Add CallsTalk to Your Authenticator App', 'Scan the QR code with <b>Google Authenticator</b>, Microsoft Authenticator or Authy.'],
    ['Create Your Password', 'Then enter the <b>6-digit code</b> from the app to complete activation.'],
  ];
  const body = `<tr><td class="px" style="padding:0 28px 22px">${steps.map(([title, text], i) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${c.rule}"><tr>
<td width="34" valign="top" style="padding:12px 0"><span style="display:inline-block;width:24px;height:24px;border-radius:12px;background:${c.panel};color:${c.accentDeep};font:600 12px/24px ${BODY};text-align:center">${i + 1}</span></td>
<td valign="top" style="padding:12px 0"><p style="margin:0;font:600 14px/1.45 ${BODY};color:${c.ink}">${title}</p><p style="margin:2px 0 0;font:400 13px/1.5 ${BODY};color:${c.body}">${text}</p></td>
</tr></table>`).join('')}</td></tr>`;
  return {
    subject: reset ? 'Your New CallsTalk Portal Setup Link' : 'Activate Your CallsTalk Portal Account',
    preview: 'Set your password and add your authenticator app.',
    heading: reset ? 'Reactivate Your Account' : 'Your CallsTalk Portal Account Is Ready',
    sub: `${name ? `Dear ${escapeHtml(name)}, y` : 'Y'}our login ID is <b>${escapeHtml(email)}</b>. Please complete the three steps below to activate your account.`,
    body,
    cta: { href: link, label: 'Activate My Account' },
    footer: `<b style="color:#fff">Not expecting this email?</b> You may safely disregard it; no action is taken unless the link is used.`,
    footnote: `Single-use link`,
    text: `${reset ? 'Reactivate your CallsTalk Portal account' : 'Your CallsTalk Portal account is ready'}\n\nLogin ID: ${email}\n\n`
      + `1. Open your setup link (single use, valid until ${until}):\n${link}\n`
      + '2. Scan the QR code with an authenticator app (Google Authenticator, Microsoft Authenticator or Authy).\n'
      + '3. Create your password and enter the 6-digit code from the app to complete activation.\n',
  };
}

export async function emailInvite(invite) {
  if (!customerTransport) return false;
  const { subject: subjectLine, text, ...content } = inviteMail(invite);
  await send(customerTransport, { from, to: invite.email, subject: subjectLine, html: layout(content), text });
  return true;
}

const atTime = (when) => when.toLocaleString('en-US', { timeZone: config.timezone, month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
const securityFooter = `<b style="color:#fff">Did not make this request?</b> Your password stays the same unless this link is used. If you are concerned, please contact our support team.`;

// "Forgot password": a one-use link to choose a new password (the authenticator code is still asked for).
export function passwordResetMail({ name, email, link, expiresAt }) {
  const until = atTime(expiresAt);
  const body = `<tr><td class="px" style="padding:0 28px 22px"><p style="margin:0;padding:12px 0 0;border-top:1px solid ${c.rule};font:400 13px/1.55 ${BODY};color:${c.body}">`
    + `The link can be used <b>once</b> and is valid until <b>${escapeHtml(until)}</b>. You will be asked for the <b>6-digit code</b> from your authenticator app to confirm the change.</p></td></tr>`;
  return {
    subject: 'Reset Your CallsTalk Portal Password',
    preview: 'Use this link to choose a new password for your CallsTalk Portal account.',
    heading: 'Reset Your Password',
    sub: `${name ? `Dear ${escapeHtml(name)}, w` : 'W'}e received a request to reset the password for <b>${escapeHtml(email)}</b>. Use the button below to choose a new password.`,
    body,
    cta: { href: link, label: 'Choose a New Password' },
    footer: securityFooter,
    footnote: 'Single-use link',
    text: `Reset your CallsTalk Portal password\n\nWe received a request to reset the password for ${email}.\n\n`
      + `Choose a new password (single use, valid until ${until}):\n${link}\n\n`
      + 'You will be asked for the 6-digit code from your authenticator app to confirm the change.\n'
      + 'If you did not make this request, your password stays the same unless this link is used.\n',
  };
}

// Sent after any password change, so the owner notices one they did not make.
export function passwordChangedMail({ name, email, when, how }) {
  const at = atTime(when);
  const way = how === 'reset' ? 'using a password reset link' : 'from the account settings';
  return {
    subject: 'Your CallsTalk Portal Password Was Changed',
    preview: `The password for ${email} was changed on ${at}.`,
    heading: 'Your Password Was Changed',
    sub: `${name ? `Dear ${escapeHtml(name)}, t` : 'T'}he password for <b>${escapeHtml(email)}</b> was changed on <b>${escapeHtml(at)}</b>, ${way}. All other devices have been signed out.`,
    body: '<tr><td style="padding:0 0 8px"></td></tr>',
    footer: `<b style="color:#fff">Did not make this change?</b> Please contact our support team immediately so we can secure your account.`,
    footnote: '',
    text: `The password for your CallsTalk Portal account (${email}) was changed on ${at}, ${way}. All other devices have been signed out.\n\n`
      + 'If you did not make this change, please contact our support team immediately so we can secure your account.\n',
  };
}

// New billing report(s) in the customer's portal. The files are never attached: they are only in the portal.
const dayText = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
const periodText = (r) => (r.period_from === r.period_to ? dayText(r.period_from) : `${dayText(r.period_from)} to ${dayText(r.period_to)}`);

export function reportReadyMail({ name, reports, link }) {
  const one = reports.length === 1;
  const span = (() => {
    const from = reports.map((r) => r.period_from).sort()[0];
    const to = reports.map((r) => r.period_to).sort().at(-1);
    return periodText({ period_from: from, period_to: to });
  })();
  const cell = `padding:9px 12px 9px 0;border-top:1px solid ${c.rule};font:400 13px/1.45 ${BODY};vertical-align:top;overflow-wrap:anywhere`;
  const rows = reports.map((r) => `<tr><td style="${cell};font-weight:600;color:${c.ink}">${escapeHtml(r.title)}</td>`
    + `<td style="${cell};color:${c.body};white-space:nowrap">${escapeHtml(periodText(r))}</td></tr>`
    + (r.note ? `<tr><td colspan="2" style="padding:0 0 10px;font:400 12px/1.45 ${BODY};color:${c.muted}">Note from our team: ${escapeHtml(r.note)}</td></tr>` : '')).join('');
  const head = (t) => `<td style="padding:0 12px 6px 0;font:600 11px/1.3 ${BODY};letter-spacing:.06em;text-transform:uppercase;color:${c.accentDeep}">${t}</td>`;
  const body = `<tr><td class="px" style="padding:0 28px 22px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${head(one ? 'Report' : 'Reports')}${head('Period')}</tr>${rows}</table>
</td></tr>`;
  return {
    subject: one ? `New Billing Report Available: ${periodText(reports[0])}` : `New Billing Reports Available: ${span}`,
    preview: one ? `A new billing report covering ${periodText(reports[0])} is now available in your CallsTalk Portal.` : `${reports.length} new billing reports are now available in your CallsTalk Portal.`,
    heading: one ? 'Your Billing Report Is Ready' : 'Your Billing Reports Are Ready',
    sub: (() => {
      const news = one
        ? `a new billing report covering <b>${escapeHtml(periodText(reports[0]))}</b> is now available in your CallsTalk Portal.`
        : `<b>${reports.length} new billing reports</b> covering <b>${escapeHtml(span)}</b> are now available in your CallsTalk Portal.`;
      return name ? `Dear ${escapeHtml(name)}, ${news}` : news.charAt(0).toUpperCase() + news.slice(1);
    })(),
    body,
    cta: { href: link, label: one ? 'View Report' : 'View Reports' },
    footer: '<b style="color:#fff">For your security,</b> reports are not attached to emails. They are available only through your secure portal login.',
    footnote: '',
    text: `${one ? 'Your billing report is ready' : 'Your billing reports are ready'}\n\n`
      + `${one ? `A new billing report covering ${periodText(reports[0])} is` : `${reports.length} new billing reports covering ${span} are`} now available in your CallsTalk Portal.\n\n`
      + reports.map((r) => `- ${r.title} (${periodText(r)})${r.note ? `\n  Note from our team: ${r.note}` : ''}`).join('\n')
      + `\n\nView ${one ? 'it' : 'them'} here: ${link}\n\n`
      + 'For your security, reports are not attached to emails. They are available only through your secure portal login.\n',
  };
}

// A completed payment, for the buyer. `amount` and `details` ([label, value] pairs) come worked out from
// billing-notices.js, so the figures match their bill.
export function paymentReceivedMail({ name, amount, details, link }) {
  return {
    subject: `Payment Received: ${amount}`,
    preview: `We have received your payment of ${amount}. Thank you.`,
    heading: 'Payment Received',
    sub: `${name ? `Dear ${escapeHtml(name)}, w` : 'W'}e have received your payment of <b>${escapeHtml(amount)}</b>. Thank you.`,
    body: `<tr><td class="px" style="padding:0 28px 22px">${detailGrid(details)}</td></tr>`,
    cta: { href: link, label: 'View My Billing' },
    footer: '<b style="color:#fff">Questions about this payment?</b> Please contact our support team through the chat in your portal.',
    footnote: '',
    text: `Payment received\n\nWe have received your payment of ${amount}. Thank you.\n\n`
      + `${details.map(([l, v]) => `${l}: ${v}`).join('\n')}\n\nView your billing: ${link}\n`,
  };
}

// The same payment for the team's inbox (EMAIL_TO), with the figures from the billing chat's notice.
export function paymentTeamMail({ buyer, amount, details, link }) {
  return {
    subject: `${config.isDev ? '[Local test] ' : ''}Payment received: ${buyer} (${amount})`,
    preview: `${buyer} paid ${amount}.`,
    heading: `Payment from ${escapeHtml(buyer)}`,
    sub: `<b>${escapeHtml(amount)}</b> received and added to their balance.`,
    body: `<tr><td class="px" style="padding:0 28px 22px">${detailGrid(details)}</td></tr>`,
    cta: { href: link, label: 'Open Customer' },
    footnote: '',
    text: `Payment received from ${buyer}\n\n${details.map(([l, v]) => `${l}: ${v}`).join('\n')}\n\nOpen the customer: ${link}\n`,
  };
}

// Returns false when email is turned off (EMAIL_TO empty).
export async function emailPaymentToTeam(notice) {
  if (!transport) return false;
  const { subject: subjectLine, text, ...content } = paymentTeamMail(notice);
  const { user } = notice;
  await send(transport, {
    from,
    to,
    replyTo: { name: user.name || user.email, address: user.email },
    subject: subjectLine,
    html: layout({ ...content, name: user.name || user.email, email: user.email }),
    text,
  });
  return true;
}

// Customer security emails. Return false when SMTP is not set up.
async function sendCustomerMail(to, mail) {
  if (!customerTransport) return false;
  const { subject: subjectLine, text, ...content } = mail;
  await send(customerTransport, { from, to, subject: subjectLine, html: layout(content), text });
  return true;
}
export const emailPasswordReset = (reset) => sendCustomerMail(reset.email, passwordResetMail(reset));
export const emailPasswordChanged = (change) => sendCustomerMail(change.email, passwordChangedMail(change));
export const emailReportReady = (notice) => sendCustomerMail(notice.email, reportReadyMail(notice));
export const emailPaymentReceived = (notice) => sendCustomerMail(notice.email, paymentReceivedMail(notice));

// For previewing the design (layout without sending).
export const renderMail = ({ session, ...mail }) => layout({ ...mail, name: session.name, email: session.email });

export function verifyEmail() {
  if (!transport) return;
  transport.verify()
    .then(() => console.log(`[email] SMTP ready, notifying ${to.join(', ')}`))
    .catch((err) => console.error(`[email] cannot log in to ${smtp.host}:${smtp.port}: ${err.message}`));
}
