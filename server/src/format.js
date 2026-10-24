// Formatting shared by the Telegram posts, the notification emails and the reply page.

import { config } from './config.js';

export const escapeHtml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
// Name used when a visitor starts chatting without leaving their details.
export const ANONYMOUS_NAME = 'Visitor';

// Shown to the visitor when the team ends a chat without writing their own goodbye.
export const TEAM_ENDED_MESSAGE = 'Our team has ended this chat. Thanks for reaching out, and start a new chat any time.';

export const shortId =(session) => session.short_id ?? session.id.slice(0, 8);

// "3:20 PM EDT"
export function formatClock(date = new Date()) {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric', minute: '2-digit', timeZone: config.timezone, timeZoneName: 'short',
  }).format(date);
}

// [label, value] pairs describing a new visitor, as plain text.
export function visitorDetails({ name, email, anonymous }) {
  return [
    ['Name', !anonymous && name],
    ['Email', email],
    ['Time', formatClock()],
  ].filter(([, value]) => value);
}

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
