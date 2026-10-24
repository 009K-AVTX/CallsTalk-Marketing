// PostgreSQL storage. The tables are created on startup if they don't exist yet.

import pg from 'pg';
import { config } from './config.js';

// Telegram message and topic ids are BIGINT columns; they stay far below 2^53, so plain numbers are safe.
pg.types.setTypeParser(pg.types.builtins.INT8, Number);

export const pool = new pg.Pool({ ...config.db, max: 10 });
pool.on('error', (err) => console.error('[db] idle connection error:', err.message));

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS sessions (
    id          uuid PRIMARY KEY,
    short_id    text NOT NULL,
    name        text NOT NULL,
    email       text NOT NULL DEFAULT '',
    status      text NOT NULL DEFAULT 'open',
    thread_id   bigint,
    created_at  timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS sessions_short_id ON sessions (short_id);
  CREATE INDEX IF NOT EXISTS sessions_thread_id ON sessions (thread_id);
  CREATE INDEX IF NOT EXISTS sessions_open ON sessions (status) WHERE status = 'open';
  -- Chats started by a signed-in customer in the portal (portal_users.id); null for website visitors.
  ALTER TABLE sessions ADD COLUMN IF NOT EXISTS portal_user_id uuid;
  ALTER TABLE sessions ADD COLUMN IF NOT EXISTS company text NOT NULL DEFAULT '';

  CREATE TABLE IF NOT EXISTS messages (
    id          serial PRIMARY KEY,
    session_id  uuid NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
    sender      text NOT NULL,
    sender_name text,
    message     text NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS messages_session ON messages (session_id, id);

  -- Which Telegram message belongs to which chat, so the team can simply reply to it.
  CREATE TABLE IF NOT EXISTS telegram_links (
    chat_id     text NOT NULL,
    message_id  bigint NOT NULL,
    session_id  uuid NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
    PRIMARY KEY (chat_id, message_id)
  );

  CREATE TABLE IF NOT EXISTS kv (key text PRIMARY KEY, value text NOT NULL);
`;

export async function initDb() {
  await pool.query(SCHEMA);
}

export const closeDb = () => pool.end();

const one = async (sql, params) => (await pool.query(sql, params)).rows[0];
const all = async (sql, params) => (await pool.query(sql, params)).rows;

// Returns the id of the visitor's first message.
export async function createSession({ id, name, email, threadId, message, portalUserId = null, company = '' }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('INSERT INTO sessions (id, short_id, name, email, thread_id, portal_user_id, company) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [id, id.slice(0, 8), name, email, threadId ?? null, portalUserId, company]);
    const { rows } = await client.query(
      "INSERT INTO messages (session_id, sender, sender_name, message) VALUES ($1, 'visitor', $2, $3) RETURNING id",
      [id, name, message]);
    await client.query('COMMIT');
    return rows[0].id;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export const getSession = (id) => (UUID.test(id) ? one('SELECT * FROM sessions WHERE id = $1', [id]) : undefined);
export const findSessionByShortId = (shortId) =>
  one('SELECT * FROM sessions WHERE short_id = $1 ORDER BY created_at DESC LIMIT 1', [shortId.toLowerCase()]);
export const findSessionByThread = (threadId) =>
  one('SELECT * FROM sessions WHERE thread_id = $1 ORDER BY created_at DESC LIMIT 1', [threadId]);
export const findSessionByTelegramMessage = (chatId, messageId) =>
  one('SELECT s.* FROM telegram_links l JOIN sessions s ON s.id = l.session_id WHERE l.chat_id = $1 AND l.message_id = $2',
    [String(chatId), messageId]);
export const setStatus = (id, status) => pool.query('UPDATE sessions SET status = $1 WHERE id = $2', [status, id]);

// Open sessions whose latest message is older than `date`.
export const findIdleSessions = (date) => all(`
  SELECT s.* FROM sessions s
  WHERE s.status = 'open' AND (SELECT max(m.created_at) FROM messages m WHERE m.session_id = s.id) < $1`, [date]);

// Returns the new message's id.
export const addMessage = async (sessionId, sender, senderName, message) =>
  (await one('INSERT INTO messages (session_id, sender, sender_name, message) VALUES ($1, $2, $3, $4) RETURNING id',
    [sessionId, sender, senderName, message])).id;
export const listMessages = (sessionId) =>
  all('SELECT id, sender, message, created_at FROM messages WHERE session_id = $1 ORDER BY id', [sessionId]);
export const listTranscript = (sessionId) =>
  all('SELECT id, sender, sender_name, message, created_at FROM messages WHERE session_id = $1 ORDER BY id', [sessionId]);
export const linkTelegramMessage = (chatId, messageId, sessionId) =>
  pool.query('INSERT INTO telegram_links (chat_id, message_id, session_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
    [String(chatId), messageId, sessionId]);
export const getValue = async (key) => (await one('SELECT value FROM kv WHERE key = $1', [key]))?.value;
export const setValue = (key, value) =>
  pool.query('INSERT INTO kv (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = excluded.value', [key, String(value)]);
