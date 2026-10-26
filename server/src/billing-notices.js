// Billing notices for the team on Telegram, apart from the website chats (TELEGRAM_BILLING_CHAT_ID / _THREAD_ID):
//  - Payment Received: each payment that completes, a USDT deposit found by the payment check or one an admin
//    records, with where that buyer now stands.
//  - Daily Billing Summary: every buyer as Paid (in credit, and how many more calls it covers at their price) or
//    Pending (what they owe, the calls it stands for, and any payment still confirming).
// Both follow the same rules as each buyer's own bill and the admin's Finance page, so the figures always agree.
// Admins switch each one on or off and set the summary's time in portal Settings.
//
//   GET  /api/admin/notifications        -> { settings, time_zone, separate_chat, available }
//   PUT  /api/admin/notifications        { payments, summary, summary_time: "HH:MM" } -> as GET
//   POST /api/admin/notifications/test   sends the daily summary now -> { sent: true }

import { Router } from 'express';
import { config } from './config.js';
import { addDays, localDate, statement } from './billing.js';
import { getValue, setValue } from './db.js';
import { financeReport } from './finance.js';
import { clip, escapeHtml as escape, fitLines, formatClock, TELEGRAM_BUDGET } from './format.js';
import { getAccount, getUser, listDays, listPayments } from './portal-db.js';
import { rateLimit } from './rate-limit.js';
import { HttpError } from './routes.js';
import { sendTo } from './telegram.js';

const SETTINGS = 'billing_notices';
const SENT = 'billing_summary_sent';
const TZ = config.timezone; // the team's clock (EST), as in every other Telegram message
const DEFAULTS = { payments: true, summary: true, summary_time: '09:00' };
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const cents = (v) => Math.round(Number(v || 0) * 100);
const usd = (c) => `${c < 0 ? '-' : ''}$${(Math.abs(c) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const calls = (k) => `${k.toLocaleString('en-US')} call${k === 1 ? '' : 's'}`;
const nameOf = (u) => u.company || u.name || u.email;

export async function noticeSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse((await getValue(SETTINGS)) || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

// The team's billing chat: its own, or the support chat (in TELEGRAM_BILLING_THREAD_ID, else the chat's usual topic).
function target() {
  const t = config.telegram;
  return t.billingChatId ? { chat: t.billingChatId, threadId: t.billingThreadId } : { chat: t.chatId, threadId: t.billingThreadId ?? t.threadId };
}
// Only the live server tells the team on its own. A local copy that borrows the live bot token
// (TELEGRAM_POLLING=false, or NODE_ENV=development) would otherwise post figures from its own test database into the
// team's chat; there, only "Post Summary Now" posts, labelled as a test.
const live = config.telegram.polling && !config.isDev;
const post = (text) => {
  const { chat, threadId } = target();
  return sendTo(chat, live ? text : `<b>Local test</b>\n\n${text}`, { threadId });
};

// Where a buyer stands, as on the Finance page: Paid (nothing owed; the calls their credit covers) or Pending
// (owed; the calls that stands for). Balances and prices in cents.
export function standing(balance, price) {
  if (balance < 0) return { paid: false, owed: -balance, calls: price ? Math.ceil(-balance / price) : null };
  return { paid: true, credit: balance, calls: price ? Math.floor(balance / price) : null };
}

function standingText(s, price) {
  if (!s.paid) return `Pending · ${usd(s.owed)} still owed${s.calls !== null ? ` (${calls(s.calls)} at ${usd(price)})` : ''}`;
  return `Paid · ${s.calls !== null ? `covers ${s.calls.toLocaleString('en-US')} more call${s.calls === 1 ? '' : 's'} at ${usd(price)}` : 'nothing owed'}`;
}

// ── Payment Received ─────────────────────────────────────────────────────────

export function paymentReceivedText({ buyer, amount, method, note, balance, price, at = new Date() }) {
  const s = standing(balance, price);
  return '<b>Payment Received</b>\n\n'
    + [
      ['Buyer', escape(buyer)],
      ['Amount', usd(cents(amount))],
      ['Method', escape(method)],
      ...(note ? [['Note', escape(clip(note, 200))]] : []),
      ['Balance', usd(balance)],
      ['Status', standingText(s, price)],
      ['Time', formatClock(at)],
    ].map(([k, v]) => `<b>${k}:</b> ${v}`).join('\n');
}

// Called once a payment is completed. Never throws: a notice must not get in the way of recording the payment.
export function paymentReceived(userId, { amount, method, note = '' }) {
  return (async () => {
    if (!live || !(await noticeSettings()).payments) return;
    const [user, account] = await Promise.all([getUser(userId), getAccount(userId)]);
    if (!user || !account) return;
    const today = localDate(new Date(), account.timezone);
    const bill = statement({ user, account, days: await listDays(userId, today), payments: await listPayments(userId), from: today });
    await post(paymentReceivedText({ buyer: nameOf(user), amount, method, note, balance: cents(bill.balance), price: cents(account.price_per_call) }));
  })().catch((err) => console.error('[billing] could not post the payment notice:', err.message));
}

// ── Daily Billing Summary ────────────────────────────────────────────────────

// `customers`: rows from financeReport (finance.js). Pure, so it can be checked without a database.
export function summaryText(customers, now = new Date()) {
  const rows = customers.map((c) => ({
    name: c.customer, price: cents(c.price_per_call), confirming: cents(c.pending), ...standing(cents(c.balance_now), cents(c.price_per_call)),
  }));
  const pending = rows.filter((r) => !r.paid).sort((a, b) => b.owed - a.owed || a.name.localeCompare(b.name));
  // Paid buyers closest to running out of credit first.
  const paid = rows.filter((r) => r.paid).sort((a, b) => (a.calls ?? Infinity) - (b.calls ?? Infinity) || a.name.localeCompare(b.name));
  const sum = (list, k) => list.reduce((t, r) => t + (r[k] || 0), 0);
  const day = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).format(now);

  // Whole lines only, within Telegram's limit; whatever does not fit is counted and pointed to Finance.
  const MORE = 60; // room kept for an "…and N more" line
  const list = (lines, room) => {
    const { shown, rest } = fitLines(lines, room - MORE);
    return [...shown, ...(rest ? [`…and ${rest} more (Finance in the portal)`] : [])].join('\n');
  };
  const pendingLine = (r) => `• <b>${escape(r.name)}</b> · owes ${usd(r.owed)}${r.calls !== null ? ` · ${calls(r.calls)} unpaid` : ''}`
    + (r.confirming ? ` · ${usd(r.confirming)} confirming` : '');
  const paidLine = (r) => `• <b>${escape(r.name)}</b> · ${r.credit ? `${usd(r.credit)} credit` : 'settled'}`
    + (r.calls !== null ? ` · covers ${calls(r.calls)}` : '') + (r.confirming ? ` · ${usd(r.confirming)} confirming` : '');

  const head = [
    `<b>Daily Billing Summary</b> · ${day}`,
    '',
    `<b>Owed now:</b> ${usd(sum(pending, 'owed'))} by ${pending.length} buyer${pending.length === 1 ? '' : 's'}`,
    `<b>Held in credit:</b> ${usd(sum(paid, 'credit'))}`,
    ...(sum(rows, 'confirming') ? [`<b>Confirming:</b> ${usd(sum(rows, 'confirming'))}`] : []),
  ];
  if (!rows.length) return [...head, '', 'No buyers have billing set up yet.'].join('\n');
  // Pending comes first and gets the room it needs, leaving at least a few paid lines' worth for Paid.
  const paidLines = paid.map(paidLine);
  const pendingLines = pending.map(pendingLine);
  const top = head.join('\n').length + 80; // the head and both group titles
  const keepForPaid = Math.min(paidLines.join('\n').length + MORE, 800);
  const pendingText = pending.length ? list(pendingLines, TELEGRAM_BUDGET - top - keepForPaid) : 'None. Every buyer is paid up.';
  const paidText = paid.length ? list(paidLines, TELEGRAM_BUDGET - top - pendingText.length) : 'None.';
  return [
    ...head,
    '', `<b>Pending (${pending.length})</b>`, pendingText,
    '', `<b>Paid (${paid.length})</b>`, paidText,
  ].join('\n');
}

export async function sendSummary(now = new Date()) {
  const today = localDate(now, 'UTC');
  // Payments still confirming are counted over the last 60 days; balances always run from each buyer's start.
  const report = await financeReport({ from: addDays(today, -60), to: addDays(today, 1), now });
  const live = report.customers.filter((c) => c.status !== 'disabled' && c.billing_since <= localDate(now, 'UTC'));
  await post(summaryText(live, now));
}

const clock = (now) => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);

// Once a day, at the chosen time or as soon after it as the server is running.
async function summaryIfDue(now = new Date()) {
  const settings = await noticeSettings();
  const day = localDate(now, TZ);
  const last = await getValue(SENT);
  // First run after this was installed: start tomorrow rather than posting the moment the server starts.
  if (!last) return setValue(SENT, day);
  if (!settings.summary || last === day || clock(now) < settings.summary_time) return undefined;
  await setValue(SENT, day); // claimed before sending: a failed send is not retried every minute
  return sendSummary(now);
}

export function startBillingNotices() {
  if (!live) return console.log('[billing] not the live server (TELEGRAM_POLLING=false or development): no daily summary or payment notices');
  const tick = () => summaryIfDue().catch((err) => console.error('[billing] could not post the daily summary:', err.message));
  setInterval(tick, 60_000).unref();
  tick();
}

// ── admin settings ───────────────────────────────────────────────────────────

const settingsView = async () => ({
  settings: await noticeSettings(),
  time_zone: TZ,
  separate_chat: Boolean(config.telegram.billingChatId || config.telegram.billingThreadId),
  available: Boolean(config.telegram.token),
});

export const billingNoticesRouter = Router(); // under /api/admin, so admins only

billingNoticesRouter.get('/', async (req, res) => res.json(await settingsView()));

billingNoticesRouter.put('/', async (req, res) => {
  const body = req.body || {};
  const now = await noticeSettings();
  const next = {
    payments: typeof body.payments === 'boolean' ? body.payments : now.payments,
    summary: typeof body.summary === 'boolean' ? body.summary : now.summary,
    summary_time: body.summary_time === undefined ? now.summary_time : String(body.summary_time),
  };
  if (!TIME.test(next.summary_time)) throw new HttpError(400, 'Please choose a time for the daily summary, such as 09:00.');
  await setValue(SETTINGS, JSON.stringify(next));
  res.json(await settingsView());
});

billingNoticesRouter.post('/test', rateLimit({ windowMs: 10 * 60_000, max: 5, detail: 'The summary was sent several times just now. Please wait a few minutes.' }), async (req, res) => {
  try {
    await sendSummary();
  } catch (err) {
    console.error('[billing] could not post the summary on request:', err.message);
    throw new HttpError(502, 'Telegram did not accept the summary. Check that the bot is still in the billing chat.');
  }
  res.json({ sent: true });
});
