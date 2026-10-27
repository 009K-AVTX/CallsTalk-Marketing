// A customer's own Telegram chat with the bot, for the notices meant for them (a new report is ready, a payment came in).
//
// Linking: Connect Telegram in portal Settings asks for a one-use code and opens t.me/<bot>?start=<code>. The
// customer presses Start, Telegram sends the bot "/start <code>", and that chat is stored for their login. The
// code is the only proof needed, so it is long, random, stored as a hash, single-use and short-lived.
//
//   GET    /api/accounts/telegram        (customer)  -> { available, connected, username, first_name, linked_at, bot }
//   POST   /api/accounts/telegram/link   (customer)  -> { url, expires_at, bot }
//   DELETE /api/accounts/telegram        (customer)  -> as GET, disconnected
//
// In the bot's private chat: /start <code> links, /stop unlinks, anything else gets a short note. The team's
// support group never sees these messages (telegram.js routes private chats here).

import { Router } from 'express';
import { config } from './config.js';
import { requireUser } from './accounts.js';
import { hashToken, newToken } from './auth-crypto.js';
import { recordAudit } from './audit.js';
import { escapeHtml as escape, fitLines, TELEGRAM_BUDGET } from './format.js';
import {
  createTelegramCode, deleteCustomerTelegram, deleteTelegramChat, getCustomerTelegram, getUser, saveCustomerTelegram, useTelegramCode,
} from './portal-db.js';
import { rateLimit } from './rate-limit.js';
import { botUsername, sendTo } from './telegram.js';

const label = (u) => u?.company || u?.name || u?.email || '';

async function bot() {
  try {
    return await botUsername();
  } catch (err) {
    console.error('[telegram] could not read the bot\'s username:', err.message);
    return null;
  }
}

async function view(userId) {
  const [row, name] = await Promise.all([getCustomerTelegram(userId), bot()]);
  return {
    available: Boolean(name),
    connected: Boolean(row),
    username: row?.username || '',
    first_name: row?.first_name || '',
    linked_at: row?.linked_at ?? null,
    bot: name || '',
  };
}

// For the admin's page about a customer: whether their notices reach Telegram.
export async function telegramOf(userId) {
  const row = await getCustomerTelegram(userId);
  return row ? { connected: true, username: row.username, first_name: row.first_name, linked_at: row.linked_at } : { connected: false };
}

export const telegramLinkRouter = Router();
telegramLinkRouter.use(requireUser('customer'));

telegramLinkRouter.get('/', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(await view(req.user.id));
});

telegramLinkRouter.post('/link', rateLimit({ windowMs: 10 * 60_000, max: 10, detail: 'Too many attempts in a short time. Please wait a few minutes and try again.' }), async (req, res) => {
  const name = await bot();
  if (!name) return res.status(503).json({ detail: 'Telegram notifications are not available right now. Please try again later.' });
  const code = newToken(); // 43 URL-safe characters: Telegram allows up to 64 in a start link
  const expiresAt = new Date(Date.now() + config.telegram.linkMinutes * 60_000);
  await createTelegramCode(req.user.id, hashToken(code), expiresAt);
  res.json({ url: `https://t.me/${name}?start=${code}`, expires_at: expiresAt, bot: name });
});

telegramLinkRouter.delete('/', async (req, res) => {
  await deleteCustomerTelegram(req.user.id);
  res.json(await view(req.user.id));
});

// ── the bot's private chats ──────────────────────────────────────────────────

const NOT_LINKED = '<b>CallsTalk Notifications</b>\n\n'
  + 'This bot sends notices from your CallsTalk Portal, such as new Call Summary reports and payment confirmations.\n\n'
  + 'To turn them on, log in to the portal, open <b>Settings</b> and press <b>Connect Telegram</b>.';

const reply = (msg, text) => sendTo(msg.chat.id, text).catch((err) => console.error('[telegram] could not answer a private chat:', err.message));

// `command`: the message split as [, name, rest] when it is a /command (telegram.js), else null.
export async function handlePrivateMessage(msg, command) {
  if (command?.[1] === 'start') {
    const code = command[2].trim();
    if (!code) return reply(msg, NOT_LINKED);
    const userId = /^[A-Za-z0-9_-]{20,64}$/.test(code) ? await useTelegramCode(hashToken(code)) : null;
    const user = userId && await getUser(userId);
    if (!user || user.role !== 'customer' || user.status !== 'active') {
      return reply(msg, '<b>This link has expired or was already used.</b>\n\nOpen <b>Settings</b> in your CallsTalk Portal and press <b>Connect Telegram</b> again.');
    }
    await saveCustomerTelegram(user.id, { chatId: msg.chat.id, username: msg.from?.username, firstName: msg.from?.first_name });
    console.log(`[telegram] ${user.email} connected Telegram${msg.from?.username ? ` as @${msg.from.username}` : ''}`);
    await recordAudit('telegram.connect', {
      user: { id: user.id, email: user.email, role: user.role },
      target: { id: user.id, label: label(user) },
      details: { username: msg.from?.username ? `@${msg.from.username}` : '', name: msg.from?.first_name || '' },
    });
    return reply(msg, '<b>Telegram Connected</b>\n\n'
      + `This chat is now linked to your CallsTalk Portal login <b>${escape(user.email)}</b>. `
      + 'We will message you here when a new Call Summary report is ready or a payment is received.\n\n'
      + 'To stop these messages, send /stop or press <b>Disconnect</b> in your portal Settings.');
  }

  if (command?.[1] === 'stop') {
    const removed = await deleteTelegramChat(msg.chat.id);
    for (const id of removed) {
      const user = await getUser(id);
      await recordAudit('telegram.disconnect', {
        user: user && { id: user.id, email: user.email, role: user.role }, target: { id, label: label(user) }, details: { via: 'Telegram /stop' },
      });
    }
    return reply(msg, removed.length
      ? '<b>Notifications Turned Off</b>\n\nYou can connect again at any time from <b>Settings</b> in your CallsTalk Portal.'
      : 'This chat is not connected to a CallsTalk Portal login.');
  }

  return reply(msg, `${NOT_LINKED}\n\nThis chat is not monitored. For help, please use the chat in your CallsTalk Portal.`);
}

// ── notices to a customer ────────────────────────────────────────────────────

// Sends to the customer's linked chat. -> { sent: true } or { sent: false, reason } (reason reads after "not sent: ").
export async function sendToCustomer(userId, text, extra = {}) {
  const row = await getCustomerTelegram(userId);
  if (!row) return { sent: false, reason: 'they have not connected Telegram in their portal Settings' };
  try {
    await sendTo(row.chat_id, text, extra);
    return { sent: true, username: row.username };
  } catch (err) {
    // 403: they blocked the bot or deleted the chat. The link is dropped, so the portal shows it as disconnected.
    if (err.code === 403) {
      await deleteCustomerTelegram(userId);
      return { sent: false, reason: 'they blocked the bot or deleted the chat, so Telegram has been disconnected for them' };
    }
    console.error(`[telegram] could not message customer ${userId}:`, err.message);
    return { sent: false, reason: 'Telegram did not accept the message' };
  }
}

const dayText = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
const periodText = (r) => (r.period_from === r.period_to ? dayText(r.period_from) : `${dayText(r.period_from)} to ${dayText(r.period_to)}`);

// "Your report has been updated for <the days it covers>. You can view your Call Summary report from your portal (link)."
// with the new report(s) and a button to the portal. `reports`: oldest first.
export function reportReadyText(reports, link) {
  const one = reports.length === 1;
  const span = periodText({
    period_from: reports.map((r) => r.period_from).sort()[0],
    period_to: reports.map((r) => r.period_to).sort().at(-1),
  });
  const lines = one
    ? [
      `<b>Report:</b> ${escape(reports[0].title)}`,
      ...(reports[0].note ? [`<b>Note:</b> ${escape(reports[0].note)}`] : []),
    ]
    : reports.map((r) => `• ${escape(r.title)} · ${escape(periodText(r))}`);
  // Whole lines within Telegram's limit (a long upload lists what fits, then how many more are in the portal).
  const { shown, rest } = fitLines(lines, TELEGRAM_BUDGET - 300);
  if (rest) shown.push(`…and ${rest} more in your portal`);
  return `<b>${one ? 'Your report has been updated' : 'Your reports have been updated'} for ${escape(span)}.</b>\n`
    + `You can view your Call Summary report${one ? '' : 's'} from your portal: ${escape(link)}\n\n` + shown.join('\n');
}

// Telegram only takes public https links on buttons (not a local http://localhost portal).
const linkButton = (text, url) => (/^https:\/\//.test(url) ? { reply_markup: { inline_keyboard: [[{ text, url }]] } } : {});

export function reportReadyToTelegram(userId, reports, link) {
  return sendToCustomer(userId, reportReadyText(reports, link), linkButton(reports.length === 1 ? 'Open Report' : 'Open Reports', link));
}

// A completed payment: `amount` and `details` ([label, value, kind] rows) as in the buyer's email (billing-notices.js).
// Wallets and hashes ("code") are monospace, so a tap copies them.
export function paymentReceivedCustomerText({ amount, details }) {
  return `<b>Payment received.</b>\nThank you, we have received your payment of <b>${escape(amount)}</b>.\n\n`
    + details.map(([k, v, kind]) => `<b>${escape(k)}:</b> ${kind === 'code' ? `<code>${escape(v)}</code>` : escape(v)}`).join('\n');
}

export function paymentReceivedToTelegram(userId, notice) {
  return sendToCustomer(userId, paymentReceivedCustomerText(notice), linkButton('Open Billing', notice.link));
}
