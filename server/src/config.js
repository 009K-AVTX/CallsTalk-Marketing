// All settings come from the environment (see .env.example).

import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = (key, fallback = '') => (process.env[key] ?? fallback).trim();

const isDev = env('NODE_ENV', 'production') === 'development';

export const config = {
  isDev,
  port: Number(env('PORT', '3001')),
  host: env('HOST', '127.0.0.1'),
  // PostgreSQL connection (same setting names as the CRM).
  db: {
    host: env('DB_HOST', '127.0.0.1'),
    port: Number(env('DB_PORT', '5432')),
    database: env('DB_NAME', 'callstalk_chat'),
    user: env('DB_USER', 'callstalk_chat'),
    password: process.env.DB_PASSWORD ?? '',
  },
  // Times in Telegram, team emails and the reply page: always EST (UTC-5, no daylight time). Fixed here, so an
  // old TIMEZONE=America/New_York in .env cannot switch them to EDT. Customers' own times use their account's zone.
  timezone: 'EST',
  // Open chats end by themselves after this many hours without a new message.
  chatTimeoutHours: Number(env('CHAT_TIMEOUT_HOURS', '24')),
  corsOrigins: env('CORS_ALLOWED_ORIGINS').split(',').map((o) => o.trim().replace(/\/$/, '')).filter(Boolean),

  telegram: {
    token: env('TELEGRAM_BOT_TOKEN'),
    chatId: env('TELEGRAM_CHAT_ID'),
    // Optional: post everything into one topic of a forum group.
    threadId: env('TELEGRAM_THREAD_ID') ? Number(env('TELEGRAM_THREAD_ID')) : undefined,
    // Optional: open a separate forum topic for every visitor.
    topicPerChat: env('TELEGRAM_TOPIC_PER_CHAT') === 'true',
    // false on a local copy, so it does not take the live server's updates from the same bot.
    polling: env('TELEGRAM_POLLING', 'true') !== 'false',
    // Billing notices for the team (each payment, the daily paid/pending summary): their own chat or topic, so
    // they stay apart from website chats. Empty: the support chat (and TELEGRAM_THREAD_ID).
    billingChatId: env('TELEGRAM_BILLING_CHAT_ID'),
    billingThreadId: env('TELEGRAM_BILLING_THREAD_ID') ? Number(env('TELEGRAM_BILLING_THREAD_ID')) : undefined,
    // How long the Connect Telegram link in a customer's Settings works.
    linkMinutes: Number(env('TELEGRAM_LINK_MINUTES', '15')),
  },

  // Optional: email every visitor message, with a link to answer it from the browser.
  email: {
    to: env('EMAIL_TO').split(',').map((a) => a.trim()).filter(Boolean),
    from: env('EMAIL_FROM') || env('SMTP_USER'),
    smtp: {
      host: env('SMTP_HOST'),
      port: Number(env('SMTP_PORT', '465')),
      user: env('SMTP_USER'),
      pass: env('SMTP_PASS'),
    },
  },
  // Base of the reply links in emails. In development they go through the Vite dev server,
  // which passes /reply/* on to this server (see vite.config.js).
  publicUrl: (isDev ? env('DEV_PUBLIC_URL', 'http://localhost:5173') : env('PUBLIC_URL')).replace(/\/$/, ''),
  replyLinkDays: Number(env('REPLY_LINK_DAYS', '30')),

  // Optional: serve the built marketing site and the AI assistant from this server too.
  serveSite: env('SERVE_SITE') === 'true',
  siteDir: path.resolve(root, env('SITE_DIR', '../dist')),
  // Customer portal (portal/ in the site): /login, /dashboard and /billing redirect there, and setup links
  // in emails open it. In development it is the portal's Vite dev server.
  portalUrl: (isDev ? env('DEV_PORTAL_URL', 'http://localhost:5180') : env('VITE_PORTAL_APP_URL', 'https://portal.callstalk.com')).replace(/\/$/, ''),
  // Customer payments in USDT (TRC-20) through Well Wallet. Without a token, Pay tells customers to contact us.
  payments: {
    apiUrl: env('WELLWALLET_API_URL', 'https://tag.alfa-bot.com/api/prod/v1').replace(/\/$/, ''),
    token: env('WELLWALLET_API_TOKEN'),
    webhookKey: env('WELLWALLET_WEBHOOK_KEY'),
    // "accounting" = exchange wallet (as the TOPUP bot uses in production), "user" = private wallet.
    walletType: env('WELLWALLET_WALLET_TYPE', 'accounting'),
    pollSeconds: Math.max(30, Number(env('WELLWALLET_POLL_SECONDS', '120'))),
  },
  portal: {
    inviteDays: Number(env('PORTAL_INVITE_DAYS', '7')),
    resetMinutes: Number(env('PORTAL_RESET_MINUTES', '30')), // how long a "forgot password" link works
    accessMinutes: 60,
    refreshDays: Number(env('PORTAL_SESSION_DAYS', '30')),
  },
};

export function assertConfig() {
  const missing = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'DB_PASSWORD'].filter((k) => !env(k));
  if (missing.length) {
    console.error(`[config] Missing required settings: ${missing.join(', ')}. See server/.env.example.`);
    process.exit(1);
  }
  if (config.email.to.length) {
    const missingEmail = ['SMTP_HOST', ...(isDev ? [] : ['PUBLIC_URL'])].filter((k) => !env(k));
    if (!config.email.from) missingEmail.push('EMAIL_FROM');
    if (missingEmail.length) {
      console.error(`[config] EMAIL_TO is set, so these are needed too: ${missingEmail.join(', ')}.`);
      process.exit(1);
    }
  }
}

export const emailEnabled = config.email.to.length > 0;
