// Formatting shared by the Telegram posts, the notification emails and the reply page.

import { config } from './config.js';

export const escapeHtml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
// Name used when a visitor starts chatting without leaving their details.
export const ANONYMOUS_NAME = 'Visitor';

// Shown to the visitor when the team ends a chat without writing their own goodbye.
export const TEAM_ENDED_MESSAGE = 'Our team has ended this chat. Thanks for reaching out, and start a new chat any time.';

export const shortId =(session) => session.short_id ?? session.id.slice(0, 8);

const BRAND_NAMES = { 'Google Chrome': 'Chrome', 'Microsoft Edge': 'Edge' };

// What a Chromium browser reports about itself (sent by the chat widget): "Chrome 141 on Windows 11",
// "Chrome 141 on Android 14 (SM-S918B)". Windows 11 reports platform version 13 or higher.
function describeReported({ browser, version, platform, platformVersion, model } = {}) {
  if (!browser || !platform) return '';
  const major = parseInt(platformVersion, 10) || 0;
  const os = platform === 'Windows' ? (major >= 13 ? 'Windows 11' : major >= 1 ? 'Windows 10' : 'Windows')
    : ['macOS', 'Android'].includes(platform) && major ? `${platform} ${platformVersion.replace(/(\.0)+$/, '')}`
    : platform;
  return `${BRAND_NAMES[browser] || browser}${version ? ` ${version}` : ''} on ${os}${model ? ` (${model})` : ''}`;
}

export function describeDevice(ua = '', reported) {
  const real = describeReported(reported);
  if (real) return real;
  const browser = [['Edg/', 'Edge'], ['OPR/', 'Opera'], ['SamsungBrowser', 'Samsung Internet'], ['Firefox/', 'Firefox'],
    ['CriOS', 'Chrome'], ['Chrome/', 'Chrome'], ['Safari/', 'Safari']].find(([needle]) => ua.includes(needle))?.[1];
  const os = [['iPhone', 'iPhone'], ['iPad', 'iPad'], ['Android', 'Android'], ['Windows', 'Windows'],
    ['Mac OS X', 'macOS'], ['Linux', 'Linux']].find(([needle]) => ua.includes(needle))?.[1];
  return [browser, os].filter(Boolean).join(' on ') || clip(ua, 80) || 'Unknown';
}

// "3:20 PM EDT"
export function formatClock(date = new Date()) {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric', minute: '2-digit', timeZone: config.timezone, timeZoneName: 'short',
  }).format(date);
}

// [label, value] pairs describing a new visitor, as plain text.
export function visitorDetails({ name, email, referrer, userAgent, device, anonymous }) {
  return [
    ['Name', !anonymous && name],
    ['Email', email],
    ['Origin', referrer],
    ['Device', describeDevice(userAgent, device)],
    ['Time', formatClock()],
  ].filter(([, value]) => value);
}

export const transcriptLines = (transcript = []) =>
  transcript.map((m) => `${m.from === 'visitor' ? 'Visitor' : 'Assistant'}: ${m.text}`);
