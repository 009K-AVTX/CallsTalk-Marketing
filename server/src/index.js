// CallsTalk chat server: the support chat API, the Telegram bot, email notifications and the
// email reply page, in one process.
// Optionally also serves the built marketing site and the AI assistant (SERVE_SITE=true),
// so the whole site can run from the VPS instead of Vercel.

import { existsSync } from 'node:fs';
import path from 'node:path';
import express from 'express';
import { assertConfig, config } from './config.js';
import { errorHandler, router } from './routes.js';
import { accessRouter } from './access.js';
import { initReplyLinks, replyRouter } from './reply.js';
import { verifyEmail } from './email.js';
import { startBot } from './telegram.js';
import { startExpiry } from './expire.js';
import { initDb } from './db.js';
import { initPortalDb } from './portal-db.js';
import { accountsRouter, startSessionCleanup } from './accounts.js';
import { adminRouter } from './admin.js';
import { portalRouter } from './portal.js';
import { paymentsRouter, startPaymentSync } from './payments.js';

assertConfig();

try {
  await initDb();
  await initPortalDb();
  await initReplyLinks();
} catch (err) {
  const { host, port, database, user } = config.db;
  console.error(`[db] cannot use PostgreSQL database "${database}" as "${user}" on ${host}:${port}: ${err.message}`);
  process.exit(1);
}

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback'); // nginx on the same machine passes the visitor's IP

// The site may live on another domain (e.g. Vercel), so allow the configured origins.
app.use((req, res, next) => {
  const origin = req.get('origin')?.replace(/\/$/, '');
  if (origin && config.corsOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Report uploads carry an Excel file (up to 3 MB, base64) and profile photos a small image; everything else stays small.
app.use('/api/staff/reports', express.json({ limit: '5mb' }));
app.use('/api/accounts/avatar', express.json({ limit: '1mb' }));
app.use(express.json({ limit: '64kb' }));
app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/support', router);
app.use('/api/request-access', accessRouter);
app.use('/reply', replyRouter);
// Customer portal (portal.callstalk.com): logins, admin, billing and reports.
app.use('/api/accounts', accountsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api', portalRouter);

if (config.serveSite) {
  // Same handler Vercel runs, so the AI assistant behaves identically here.
  const { default: assistant } = await import('../../api/chat.js');
  app.all('/api/chat', assistant);

  const index = path.join(config.siteDir, 'index.html');
  const notFound = path.join(config.siteDir, '404.html');
  if (!existsSync(index)) console.warn(`[server] SERVE_SITE is on but ${index} is missing. Run "npm run build" in the site folder.`);
  // Customers log in on the portal; old links redirect there, as vercel.json does.
  app.get('/login', (req, res) => res.redirect(302, `${config.portalUrl}/login`));
  app.get(['/dashboard', '/billing'], (req, res) => res.redirect(302, `${config.portalUrl}/`));
  app.use('/assets', express.static(path.join(config.siteDir, 'assets'), { immutable: true, maxAge: '1y' }));
  // Pre-rendered pages are served without .html (/legal -> legal.html), as Vercel's cleanUrls does.
  app.use(express.static(config.siteDir, { maxAge: '1h', extensions: ['html'] }));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || !req.accepts('html')) return next();
    if (existsSync(notFound)) return res.status(404).sendFile(notFound);
    res.sendFile(index);
  });
}

app.use((req, res) => res.status(404).json({ detail: 'Not found.' }));
app.use(errorHandler);

app.listen(config.port, config.host, () => {
  console.log(`[server] listening on http://${config.host}:${config.port}`);
  if (!config.corsOrigins.length && !config.serveSite) console.warn('[server] CORS_ALLOWED_ORIGINS is empty, so browsers on other domains cannot reach the chat API.');
});

if (config.telegram.polling) startBot();
else console.log('[telegram] TELEGRAM_POLLING=false: not listening for replies');
verifyEmail();
startExpiry();
startSessionCleanup();
startPaymentSync();
