// The demo copy of the portal that the Team Guide's screenshots are taken from: the real server, on its own
// database schema (guide_demo, in the local database from server/.env) and its own ports, with Telegram answered
// in-process (fake-telegram.mjs) and no email or payments. Nothing it does reaches the live data or the team.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const here = path.dirname(fileURLToPath(import.meta.url));
export const repo = path.resolve(here, '../..');
export const server = path.join(repo, 'server');

export const SCHEMA = 'guide_demo';
export const API_PORT = 3101;
export const PORTAL_PORT = 5190;
export const PORTAL = `http://localhost:${PORTAL_PORT}`;
export const REAL_PORTAL = 'https://portal.callstalk.com';
export const SMTP_PORT = 2525;
export const API = `http://127.0.0.1:${API_PORT}/api`;
export const PASSWORD = 'DemoPass-2026!';

// The settings the demo server runs with: only the database login is taken from server/.env.
export function demoEnv() {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (/^(TELEGRAM|SMTP|EMAIL|WELLWALLET|GROQ|PUBLIC_URL|CORS|SERVE_SITE)/.test(k)) delete env[k];
  for (const line of readFileSync(path.join(server, '.env'), 'utf8').split(/\r?\n/)) {
    const m = /^(DB_(?:HOST|PORT|NAME|USER|PASSWORD))=(.*)$/.exec(line);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  if (!['127.0.0.1', 'localhost'].includes(env.DB_HOST)) throw new Error('The demo only runs on a local database.');
  // Email goes to the mail catcher in demo-server.mjs and Telegram to fake-telegram.mjs, so the screens look as on a
  // set-up server; links name the real portal (capture.mjs opens them on the demo's own address).
  return Object.assign(env, {
    PGOPTIONS: `-c search_path=${SCHEMA}`, NODE_ENV: 'development', PORT: String(API_PORT), HOST: '127.0.0.1',
    TELEGRAM_BOT_TOKEN: 'demo:token', TELEGRAM_CHAT_ID: '-100', TELEGRAM_BILLING_CHAT_ID: '-200', TELEGRAM_POLLING: 'false',
    SMTP_HOST: '127.0.0.1', SMTP_PORT: String(SMTP_PORT), EMAIL_FROM: 'CallsTalk <billing@callstalk.example>', EMAIL_TO: 'team@callstalk.example',
    DEV_PORTAL_URL: REAL_PORTAL,
  });
}

// The server's own modules, on the demo schema (for seeding what the API cannot do, like passwords).
export async function serverModules() {
  Object.assign(process.env, demoEnv());
  const load = (p) => import(pathToFileURL(path.join(server, 'src', p)).href);
  const { pool } = await load('db.js');
  await pool.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);
  const { s } = (await pool.query('SELECT current_schema() AS s')).rows[0];
  if (s !== SCHEMA) throw new Error(`Connected to schema ${s}, not ${SCHEMA}: stopping.`);
  return { pool, db: await load('portal-db.js'), crypto: await load('auth-crypto.js') };
}
