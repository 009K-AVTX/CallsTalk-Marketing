// Billing notices, for the team on Telegram apart from the website chats (TELEGRAM_BILLING_CHAT_ID / _THREAD_ID),
// the team's inbox and the buyer:
//  - Payment Received: each payment that completes, a USDT deposit found by the payment check or one an admin
//    records, with where that buyer now stands. Posted in the billing chat, emailed to EMAIL_TO, and confirmed to
//    the buyer by email and, if they connected it, on Telegram.
//  - Daily Billing Summary: every buyer as Paid (in credit, and how many more calls it covers) or Pending (what
//    they owe, the calls it stands for, and any payment still confirming), in aligned monospace tables. /buyers in
//    the support chat or the billing chat posts the same, as of that moment.
// No notice shows a buyer's price per call: the calls are worked out from it, but only the count is shown.
// Both follow the same rules as each buyer's own bill and the admin's Finance page, so the figures always agree.
// Admins switch each one on or off and set the summary's time in portal Settings.
//
//   GET  /api/admin/notifications        -> { settings, time_zone, separate_chat, available, team_email }
//   PUT  /api/admin/notifications        { payments, payment_email, buyer_payments, summary, summary_time: "HH:MM" } -> as GET
//   POST /api/admin/notifications/test   sends the daily summary now -> { sent: true }

import { Router } from 'express';
import { config, emailEnabled } from './config.js';
import { addDays, localDate, statement } from './billing.js';
import { getValue, setValue } from './db.js';
import { emailPaymentReceived, emailPaymentToTeam } from './email.js';
import { financeReport } from './finance.js';
import { clip, escapeHtml as escape, fitLines, formatClock, TELEGRAM_BUDGET } from './format.js';
import { getAccount, getUser, listDays, listPayments } from './portal-db.js';
import { rateLimit } from './rate-limit.js';
import { HttpError } from './routes.js';
import { sendTo } from './telegram.js';
import { paymentReceivedToTelegram } from './telegram-link.js';

const SETTINGS = 'billing_notices';
const SENT = 'billing_summary_sent';
const TZ = config.timezone; // the team's clock (EST), as in every other Telegram message
const DEFAULTS = { payments: true, payment_email: true, buyer_payments: true, summary: true, summary_time: '09:00' };
const SWITCHES = ['payments', 'payment_email', 'buyer_payments', 'summary'];
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

// "Status: Paid" then "Capacity: 29 calls" (what their credit covers), or "Status: Pending" then the calls they owe
// for. The buyer's price is never shown in a notice; without one, only the status.
const standingRows = (s) => [
  ['Status', s.paid ? 'Paid' : 'Pending'],
  ...(s.calls === null ? [] : [[s.paid ? 'Capacity' : 'Unpaid Calls', calls(s.calls)]]),
];

// ── Payment Received ─────────────────────────────────────────────────────────

// What identifies a payment: a deposit's wallet and blockchain hash, or the reference an admin entered. Marked "code"
// so Telegram shows them in monospace (tap to copy) and emails in a fixed-width font.
const idRows = ({ sender, hash, reference }) => [
  ...(sender ? [['From Wallet', sender, 'code']] : []),
  ...(hash ? [['Transaction Hash', hash, 'code']] : []),
  ...(reference && !hash ? [['Reference', reference, 'code']] : []),
];

// The team's view of a payment as [label, plain text, kind] rows: the billing chat's notice and the team's email.
function teamRows({ buyer, amount, method, note, balance, price, at = new Date(), ...ids }) {
  return [
    ['Buyer', buyer],
    ['Amount', usd(cents(amount))],
    ['Method', method],
    ...idRows(ids),
    ...(note ? [['Note', clip(note, 200)]] : []),
    ['Balance', usd(balance)],
    ...standingRows(standing(balance, price)),
    ['Time', formatClock(at)],
  ];
}

export function paymentReceivedText(payment) {
  return '<b>Payment Received</b>\n\n' + teamRows(payment).map(([k, v, kind]) => `<b>${k}:</b> ${kind === 'code' ? `<code>${escape(v)}</code>` : escape(v)}`).join('\n');
}

// The buyer's view: how it was paid, when (in their own time zone) and where their account now stands.
// `at`: when a deposit arrived; `on`: the day ("YYYY-MM-DD") an admin recorded a payment for, shown without a time.
export function buyerRows({ method, note, balance, at = new Date(), on, timeZone, ...ids }) {
  const when = on
    ? new Date(`${on}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric' })
    : at.toLocaleString('en-US', { timeZone, month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  return [
    ['Method', method],
    ['Received', when],
    ...idRows(ids),
    ['Account Balance', balance < 0 ? `${usd(-balance)} still due` : balance > 0 ? `${usd(balance)} in credit` : 'Paid in full'],
    ...(note ? [['Note', clip(note, 200)]] : []),
  ];
}

// Called once a payment is completed. Tells whoever Settings has switched on: the billing chat, the team's inbox,
// and the buyer (by email, and on Telegram if they connected it). `buyerMethod`: how it was paid, in the buyer's words;
// `sender` and `hash`: a deposit's wallet and blockchain hash; `reference`: what an admin entered for one they record.
// Never throws: a notice must not get in the way of recording the payment, and one channel failing leaves the others.
export function paymentReceived(userId, { amount, method, buyerMethod = method, note = '', at, on, sender, hash, reference }) {
  return (async () => {
    if (!live) return;
    const settings = await noticeSettings();
    if (!settings.payments && !settings.payment_email && !settings.buyer_payments) return;
    const [user, account] = await Promise.all([getUser(userId), getAccount(userId)]);
    if (!user || !account) return;
    const today = localDate(new Date(), account.timezone);
    const bill = statement({ user, account, days: await listDays(userId, today), payments: await listPayments(userId), from: today });
    const ids = { sender, hash, reference };
    const payment = { buyer: nameOf(user), amount, method, note, balance: cents(bill.balance), price: cents(account.price_per_call), ...ids };
    const paid = usd(cents(amount));

    const sends = [];
    if (settings.payments) sends.push(['the billing chat', post(paymentReceivedText(payment))]);
    if (settings.payment_email) {
      const details = teamRows(payment).filter(([k]) => k !== 'Buyer');
      sends.push(['the team by email', emailPaymentToTeam({ buyer: payment.buyer, user, amount: paid, details, link: `${config.portalUrl}/admin/users/${user.id}` })]);
    }
    // As with report notices, only buyers who can log in are told: the button opens their portal.
    if (settings.buyer_payments && user.status === 'active') {
      const notice = {
        name: user.name, email: user.email, amount: paid, link: `${config.portalUrl}/`,
        details: buyerRows({ method: buyerMethod, note, balance: payment.balance, at, on, timeZone: account.timezone, ...ids }),
      };
      sends.push(['the buyer by email', emailPaymentReceived(notice)]);
      sends.push(['the buyer on Telegram', paymentReceivedToTelegram(user.id, notice)]);
    }
    const results = await Promise.allSettled(sends.map(([, sending]) => sending));
    results.forEach((r, i) => r.status === 'rejected' && console.error(`[billing] could not tell ${sends[i][0]} about a payment from ${user.email}:`, r.reason?.message));
  })().catch((err) => console.error('[billing] could not send the payment notices:', err.message));
}

// ── Daily Billing Summary ────────────────────────────────────────────────────

// Telegram shows <pre> in a fixed-width font, so the figures line up in columns. A table stays within TABLE_WIDTH
// characters, what a narrow phone (an iPhone held upright) shows without wrapping; a wider row would push the Calls
// column onto a line of its own. The buyer's name gets the room the figures leave (at least 8 characters, cut with
// "…"). Amounts are in US dollars, without the "$", and without cents when every amount in the column is whole.
const TABLE_WIDTH = 32;
const amounts = (list) => {
  const whole = list.every((c) => c % 100 === 0);
  return list.map((c) => (whole ? (c / 100).toLocaleString('en-US') : usd(c).replace('$', '')));
};
const count = (k) => (k === null ? '-' : k.toLocaleString('en-US'));
const cut = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

// `header` and each row: [name, ...figures] as plain text. -> [header line, ...row lines], unescaped.
function table(header, rows) {
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const figures = widths.slice(1).reduce((t, w) => t + w + 2, 0);
  widths[0] = Math.min(widths[0], Math.max(TABLE_WIDTH - figures, 8));
  const line = (r) => r.map((v, i) => (i ? v.padStart(widths[i]) : cut(v, widths[0]).padEnd(widths[0]))).join('  ');
  return [header, ...rows].map(line);
}

// `customers`: rows from financeReport (finance.js). Pure, so it can be checked without a database.
// The scheduled post and /buyers in the team's chat look the same.
export function summaryText(customers, now = new Date()) {
  const rows = customers.map((c) => ({
    name: c.customer, confirming: cents(c.pending), ...standing(cents(c.balance_now), cents(c.price_per_call)),
  }));
  const pending = rows.filter((r) => !r.paid).sort((a, b) => b.owed - a.owed || a.name.localeCompare(b.name));
  // Paid buyers closest to running out of credit first.
  const paid = rows.filter((r) => r.paid).sort((a, b) => (a.calls ?? Infinity) - (b.calls ?? Infinity) || a.name.localeCompare(b.name));
  const sum = (list, k) => list.reduce((t, r) => t + (r[k] || 0), 0);
  const day = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric' }).format(now);

  const head = [
    '<b>Daily Billing Summary</b>',
    '',
    day,
    '',
    `• <b>Owed:</b> ${usd(sum(pending, 'owed'))}`,
    `• <b>Credit:</b> ${usd(sum(paid, 'credit'))}`,
    ...(sum(rows, 'confirming') ? [`• <b>Confirming:</b> ${usd(sum(rows, 'confirming'))}`] : []),
  ];
  if (!rows.length) return [...head, '', 'No buyers yet.'].join('\n');

  // A block per buyer, all in one monospace box per group: Buyer and Balance (negative when they owe) as a table,
  // then the calls that balance stands for: Remaining Calls on credit, or Unpaid Calls. Buyers are set apart by a
  // dotted line with a blank line either side. Every block shares one set of column widths, so they line up.
  const listed = [...pending, ...paid];
  const balances = amounts(listed.map((r) => (r.paid ? r.credit : -r.owed)));
  const [header, ...lines] = table(['Buyer', 'Balance'], listed.map((r, i) => [r.name, balances[i]]));
  const blocks = listed.map((r, i) => escape([
    header, lines[i], `${r.paid ? 'Remaining Calls' : 'Unpaid Calls'} - ${r.calls === null ? 'no price set' : count(r.calls)}`,
  ].join('\n')));
  const between = `\n\n${'.'.repeat(header.length)}\n\n`;

  // Whole blocks only, within Telegram's limit; whatever does not fit is counted and pointed to Finance.
  const MORE = 60; // room kept for an "…and N more" line
  const group = (list, room) => {
    const { shown, rest } = fitLines(list.map((b) => `${b}${between}`), room - MORE - 11); // 11: <pre></pre>
    return `<pre>${list.slice(0, shown.length).join(between)}</pre>` + (rest ? `\n…and ${rest} more in Finance` : '');
  };
  const pendingBlocks = blocks.slice(0, pending.length);
  const paidBlocks = blocks.slice(pending.length);

  // Paid is shown first, but Pending gets the room it needs, leaving at least a few buyers' worth for Paid.
  const top = head.join('\n').length + 60; // the head and both group titles
  const keepForPaid = Math.min(paidBlocks.join(between).length + MORE, 800);
  const section = (name, list, text) => ['', `<b>${name}</b>`, list.length ? text : 'None'];
  const pendingText = pending.length ? group(pendingBlocks, TELEGRAM_BUDGET - top - keepForPaid) : '';
  const paidText = paid.length ? group(paidBlocks, TELEGRAM_BUDGET - top - pendingText.length) : '';
  return [...head, ...section('Paid', paid, paidText), ...section('Pending', pending, pendingText)].join('\n');
}

// The summary as of `now`, with every buyer who is billed and can still log in.
export async function billingSummary(now = new Date()) {
  const today = localDate(now, 'UTC');
  // Payments still confirming are counted over the last 60 days; balances always run from each buyer's start.
  const report = await financeReport({ from: addDays(today, -60), to: addDays(today, 1), now });
  const live = report.customers.filter((c) => c.status !== 'disabled' && c.billing_since <= today);
  return summaryText(live, now);
}

export async function sendSummary(now = new Date()) {
  await post(await billingSummary(now));
}

// /buyers in the support chat or the billing chat: the same summary, as of now, as a reply.
export async function buyersReply() {
  const text = await billingSummary(new Date());
  return live ? text : `<b>Local test</b>\n\n${text}`;
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
  if (!live) return console.log('[billing] not the live server (TELEGRAM_POLLING=false or development): no daily summary or payment notices to the team or buyers');
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
  team_email: emailEnabled ? config.email.to.join(', ') : '', // where payment emails go; empty when EMAIL_TO is not set
});

export const billingNoticesRouter = Router(); // under /api/admin, so admins only

billingNoticesRouter.get('/', async (req, res) => res.json(await settingsView()));

billingNoticesRouter.put('/', async (req, res) => {
  const body = req.body || {};
  const now = await noticeSettings();
  const next = {
    ...Object.fromEntries(SWITCHES.map((k) => [k, typeof body[k] === 'boolean' ? body[k] : now[k]])),
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
