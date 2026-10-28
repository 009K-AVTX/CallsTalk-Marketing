// Formatting shared by the Telegram posts, the notification emails and the reply page.

import { config } from './config.js';

export const escapeHtml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
// Name used when a visitor starts chatting without leaving their details.
export const ANONYMOUS_NAME = 'Visitor';
// How the team knows a buyer everywhere (portal, Telegram, team emails, Audit Log): their nickname ("Q10"), else
// their name.
export const buyerName = (u) => u?.nickname || u?.name || u?.email || '';

// The visitor's address. Behind nginx it is the real one (trust proxy in index.js), not the server's.
export const clientIp = (req) => (req.ip || '').replace(/^::ffff:/, '');

// Shown to the visitor when the team ends a chat without writing their own goodbye.
export const TEAM_ENDED_MESSAGE = 'This conversation has been closed by our team. Thank you for contacting CallsTalk; you are welcome to start a new chat at any time.';

export const shortId =(session) => session.short_id ?? session.id.slice(0, 8);

// "3:20 PM EDT"
export function formatClock(date = new Date()) {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric', minute: '2-digit', timeZone: config.timezone, timeZoneName: 'short',
  }).format(date);
}

// [label, value] pairs describing a new visitor, as plain text. A signed-in customer's chat is named by their
// nickname (`name`), with their own name (`fullName`) beside it.
export function visitorDetails({ name, fullName, nickname, email, anonymous, company, portal }) {
  return [
    ['Nickname', nickname],
    ['Name', !anonymous && (fullName || name)],
    ['Company', company],
    ['Email', email],
    ['From', portal && 'Customer portal (signed in)'],
    ['Time', formatClock()],
  ].filter(([, value]) => value);
}

// Signed-in customers' chats are labelled apart from website visitors' (Telegram and email).
export const chatKind = (chat) => (chat.portal || chat.portal_user_id ? 'customer' : 'website');

// [label, value] pairs from the request-access form, as plain text. Empty optional fields are left out.
export function accessDetails({ name, company, email, phone, volume }) {
  return [
    ['Name', name],
    ['Company', company],
    ['Email', email],
    ['Phone', phone],
    ['Calls per month', volume],
    ['Time', formatClock()],
  ].filter(([, value]) => value);
}

export const transcriptLines = (transcript = []) =>
  transcript.map((m) => `${m.from === 'visitor' ? 'Visitor' : 'Assistant'}: ${m.text}`);

// Telegram refuses a message over 4,096 characters, and cutting HTML anywhere else breaks its tags. Messages that
// list many things keep whole lines within a budget instead: -> { shown: lines that fit in `room`, rest: how many not }.
export const TELEGRAM_BUDGET = 3800;
export function fitLines(lines, room) {
  const shown = [];
  let used = 0;
  for (const line of lines) {
    if (used + line.length + 1 > room) break;
    shown.push(line);
    used += line.length + 1;
  }
  return { shown, rest: lines.length - shown.length };
}
