// CallsTalk chat server: the support chat API, the Telegram bot, email notifications and the
// email reply page, in one process.
// Optionally also serves the built marketing site and the AI assistant (SERVE_SITE=true),
// so the whole site can run from the VPS instead of Vercel.

import { existsSync } from 'node:fs';
import path from 'node:path';
import express from 'express';
import { assertConfig, config } from './config.js';
import { errorHandler, router } from './routes.js';
import { initReplyLinks, replyRouter } from './reply.js';
import { verifyEmail } from './email.js';
import { startBot } from './telegram.js';
import { startExpiry } from './expire.js';
import { initDb } from './db.js';

assertConfig();

try {
  await initDb();
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
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: '64kb' }));
app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/support', router);
app.use('/reply', replyRouter);

if (config.serveSite) {
  // Same handler Vercel runs, so the AI assistant behaves identically here.
  const { default: assistant } = await import('../../api/chat.js');
  app.all('/api/chat', assistant);

  const index = path.join(config.siteDir, 'index.html');
  if (!existsSync(index)) console.warn(`[server] SERVE_SITE is on but ${index} is missing. Run "npm run build" in the site folder.`);
  app.use('/assets', express.static(path.join(config.siteDir, 'assets'), { immutable: true, maxAge: '1y' }));
  app.use(express.static(config.siteDir, { maxAge: '1h' }));
  app.use((req, res, next) => (req.method === 'GET' && req.accepts('html') ? res.sendFile(index) : next()));
}

app.use((req, res) => res.status(404).json({ detail: 'Not found.' }));
app.use(errorHandler);

app.listen(config.port, config.host, () => {
  console.log(`[server] listening on http://${config.host}:${config.port}`);
  if (!config.corsOrigins.length && !config.serveSite) console.warn('[server] CORS_ALLOWED_ORIGINS is empty, so browsers on other domains cannot reach the chat API.');
});

startBot();
verifyEmail();
startExpiry();
