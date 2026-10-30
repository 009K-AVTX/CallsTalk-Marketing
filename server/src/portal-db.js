// PostgreSQL storage for the customer portal: logins, setup links, sessions, billing and reports.
// The tables are created on startup if they don't exist yet, next to the chat tables in db.js.

import { pool } from './db.js';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS portal_users (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email          text NOT NULL UNIQUE,
    name           text NOT NULL DEFAULT '',
    company        text NOT NULL DEFAULT '',
    role           text NOT NULL DEFAULT 'customer',   -- customer | staff | admin
    status         text NOT NULL DEFAULT 'invited',    -- invited | active | disabled
    password_hash  text,
    totp_secret    text,
    totp_last_step bigint NOT NULL DEFAULT 0,
    created_at     timestamptz NOT NULL DEFAULT now(),
    activated_at   timestamptz,
    last_login_at  timestamptz
  );

  -- One-use setup links: set a password and add the authenticator app.
  CREATE TABLE IF NOT EXISTS portal_invites (
    token_hash   text PRIMARY KEY,
    user_id      uuid NOT NULL REFERENCES portal_users (id) ON DELETE CASCADE,
    totp_secret  text NOT NULL,
    created_by   uuid REFERENCES portal_users (id) ON DELETE SET NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    expires_at   timestamptz NOT NULL,
    used_at      timestamptz
  );
  CREATE INDEX IF NOT EXISTS portal_invites_user ON portal_invites (user_id);

  -- "Forgot password" links: one use, short-lived, only their hash stored. The authenticator code is still
  -- needed to set the new password, so the link alone cannot take over a login.
  CREATE TABLE IF NOT EXISTS portal_password_resets (
    token_hash   text PRIMARY KEY,
    user_id      uuid NOT NULL REFERENCES portal_users (id) ON DELETE CASCADE,
    created_at   timestamptz NOT NULL DEFAULT now(),
    expires_at   timestamptz NOT NULL,
    used_at      timestamptz
  );
  CREATE INDEX IF NOT EXISTS portal_password_resets_user ON portal_password_resets (user_id);

  -- Profile photos: a small square image (resized in the browser), checked by its bytes on upload.
  CREATE TABLE IF NOT EXISTS portal_avatars (
    user_id       uuid PRIMARY KEY REFERENCES portal_users (id) ON DELETE CASCADE,
    content_type  text NOT NULL,
    content       bytea NOT NULL,
    updated_at    timestamptz NOT NULL DEFAULT now()
  );

  -- Other ways a customer can be reached, filled in by them in Settings. Empty text = not given.
  CREATE TABLE IF NOT EXISTS customer_contacts (
    user_id     uuid PRIMARY KEY REFERENCES portal_users (id) ON DELETE CASCADE,
    telegram    text NOT NULL DEFAULT '',
    element     text NOT NULL DEFAULT '',
    zangi       text NOT NULL DEFAULT '',
    signal      text NOT NULL DEFAULT '',
    email       text NOT NULL DEFAULT '',
    updated_at  timestamptz NOT NULL DEFAULT now()
  );
  ALTER TABLE customer_contacts ADD COLUMN IF NOT EXISTS whatsapp text NOT NULL DEFAULT '';

  -- The Telegram chat a customer linked in Settings (Connect Telegram), where the bot sends them their own
  -- notices, such as a new report. One login has one chat; one person may link the same chat to several logins.
  CREATE TABLE IF NOT EXISTS customer_telegram (
    user_id     uuid PRIMARY KEY REFERENCES portal_users (id) ON DELETE CASCADE,
    chat_id     text NOT NULL,
    username    text NOT NULL DEFAULT '',
    first_name  text NOT NULL DEFAULT '',
    linked_at   timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS customer_telegram_chat ON customer_telegram (chat_id);

  -- One-use codes behind the t.me/<bot>?start=<code> link that Connect Telegram opens. Only their hash is kept.
  CREATE TABLE IF NOT EXISTS telegram_link_codes (
    code_hash   text PRIMARY KEY,
    user_id     uuid NOT NULL REFERENCES portal_users (id) ON DELETE CASCADE,
    expires_at  timestamptz NOT NULL
  );

  CREATE TABLE IF NOT EXISTS portal_sessions (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          uuid NOT NULL REFERENCES portal_users (id) ON DELETE CASCADE,
    access_hash      text NOT NULL UNIQUE,
    access_expires   timestamptz NOT NULL,
    refresh_hash     text NOT NULL UNIQUE,
    refresh_expires  timestamptz NOT NULL,
    created_at       timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS portal_sessions_user ON portal_sessions (user_id);

  -- A customer's billing terms. Balances are counted from start_date, opening on opening_balance.
  CREATE TABLE IF NOT EXISTS billing_accounts (
    user_id          uuid PRIMARY KEY REFERENCES portal_users (id) ON DELETE CASCADE,
    currency         text NOT NULL DEFAULT 'USD',
    price_per_call   numeric(12, 2) NOT NULL DEFAULT 0,
    opening_balance  numeric(12, 2) NOT NULL DEFAULT 0,
    start_date       date NOT NULL,
    timezone         text NOT NULL DEFAULT 'America/New_York'
  );

  -- Billable calls per customer day. The price is kept per day, so a new price never rewrites old bills.
  CREATE TABLE IF NOT EXISTS billing_days (
    user_id         uuid NOT NULL REFERENCES portal_users (id) ON DELETE CASCADE,
    date            date NOT NULL,
    calls           integer NOT NULL,
    price_per_call  numeric(12, 2) NOT NULL,
    updated_at      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, date)
  );
  -- Replacements: calls from that day that are not charged (shown as "125 - 2"). Often added after the day.
  ALTER TABLE billing_days ADD COLUMN IF NOT EXISTS replacements integer NOT NULL DEFAULT 0;

  -- Versions for concurrency control: each save adds one, and a save made from an older version is refused
  -- (409), so two admins editing the same thing cannot silently overwrite each other.
  ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
  ALTER TABLE billing_accounts ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
  ALTER TABLE billing_days ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

  -- A customer's short name for the team ("Q10"): how they are picked when uploading reports. One per customer.
  ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS nickname text NOT NULL DEFAULT '';
  CREATE UNIQUE INDEX IF NOT EXISTS portal_users_nickname ON portal_users (lower(nickname)) WHERE nickname <> '';

  CREATE TABLE IF NOT EXISTS billing_payments (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES portal_users (id) ON DELETE CASCADE,
    amount      numeric(12, 2) NOT NULL,
    currency    text NOT NULL DEFAULT 'USD',
    status      text NOT NULL DEFAULT 'completed',  -- pending | completed | failed
    provider    text NOT NULL DEFAULT 'manual',
    reference   text NOT NULL DEFAULT '',
    note        text NOT NULL DEFAULT '',
    paid_at     timestamptz NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS billing_payments_user ON billing_payments (user_id, paid_at);
  -- A deposit is recorded once, however many times it is seen (reference = blockchain transaction hash).
  CREATE UNIQUE INDEX IF NOT EXISTS billing_payments_provider_ref ON billing_payments (provider, reference) WHERE provider <> 'manual';

  -- Each customer's own USDT (TRC-20) deposit address, kept for good.
  CREATE TABLE IF NOT EXISTS billing_wallets (
    user_id     uuid PRIMARY KEY REFERENCES portal_users (id) ON DELETE CASCADE,
    provider    text NOT NULL,
    network     text NOT NULL,
    address     text NOT NULL UNIQUE,
    created_at  timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS portal_reports (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       uuid NOT NULL REFERENCES portal_users (id) ON DELETE CASCADE,
    title         text NOT NULL,
    note          text NOT NULL DEFAULT '',
    period_from   date NOT NULL,
    period_to     date NOT NULL,
    filename      text NOT NULL,
    content_type  text NOT NULL,
    size          integer NOT NULL,
    content       bytea NOT NULL,
    uploaded_at   timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS portal_reports_user ON portal_reports (user_id, uploaded_at);
  -- 'billing': for the team only (an admin can enter its calls in billing). 'calls': a Call Summary, the buyer's to
  -- view and download.
  ALTER TABLE portal_reports ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'billing';

  -- Replaced calls: calls a buyer asked (in the portal chat) to have replaced, picked by an admin in a Call Summary.
  -- Each is taken off its day's bill, and the day's billing_days.replacements counts it. A call is the time, caller
  -- and number called as the log shows them, so the same call in a corrected log is not replaced twice, and the
  -- record stays readable after its Call Summary is deleted.
  CREATE TABLE IF NOT EXISTS replaced_calls (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            uuid NOT NULL REFERENCES portal_users (id) ON DELETE CASCADE,
    report_id          uuid REFERENCES portal_reports (id) ON DELETE SET NULL,
    date               date NOT NULL,
    called_at          text NOT NULL,
    caller             text NOT NULL DEFAULT '',
    duration           text NOT NULL DEFAULT '',
    reason             text NOT NULL DEFAULT '',
    replaced_by        uuid REFERENCES portal_users (id) ON DELETE SET NULL,
    replaced_by_email  text NOT NULL DEFAULT '',
    created_at         timestamptz NOT NULL DEFAULT now()
  );

  -- The calls each Call Summary lists, read in the browser as its viewer shows them (call-summary.js callOf). A day
  -- with any is billed from them (syncCallDays): its calls are every distinct call in the buyer's logs for that day,
  -- whichever toll-free number they came in on, replaced ones included, so a corrected or second log of the same day
  -- never counts a call twice.
  -- portal_reports.calls: how many it lists; null for a report whose calls were never read (uploaded before this).
  CREATE TABLE IF NOT EXISTS report_calls (
    report_id  uuid NOT NULL REFERENCES portal_reports (id) ON DELETE CASCADE,
    user_id    uuid NOT NULL REFERENCES portal_users (id) ON DELETE CASCADE,
    date       date NOT NULL,
    called_at  text NOT NULL,
    caller     text NOT NULL DEFAULT '',
    duration   text NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS report_calls_day ON report_calls (user_id, date);
  CREATE INDEX IF NOT EXISTS report_calls_report ON report_calls (report_id);
  ALTER TABLE portal_reports ADD COLUMN IF NOT EXISTS calls integer;
  -- A call to the second and the toll-free number called (call-summary.js callOf): a buyer's logs for several numbers
  -- on one day count each call once, even two from one caller in the same minute. '' in calls read before these were
  -- kept: such a call is its minute and caller (portal-db.js CALLS). calls_exact: the report's calls were read with them.
  ALTER TABLE report_calls ADD COLUMN IF NOT EXISTS call_time text NOT NULL DEFAULT '';
  ALTER TABLE report_calls ADD COLUMN IF NOT EXISTS number_called text NOT NULL DEFAULT '';
  ALTER TABLE replaced_calls ADD COLUMN IF NOT EXISTS call_time text NOT NULL DEFAULT '';
  ALTER TABLE replaced_calls ADD COLUMN IF NOT EXISTS number_called text NOT NULL DEFAULT '';
  ALTER TABLE portal_reports ADD COLUMN IF NOT EXISTS calls_exact boolean NOT NULL DEFAULT false;
  DROP INDEX IF EXISTS replaced_calls_call;
  CREATE UNIQUE INDEX IF NOT EXISTS replaced_calls_exact ON replaced_calls (user_id, date, called_at, caller, call_time, number_called);
  -- A day whose calls come from its Call Summaries rather than being typed in.
  ALTER TABLE billing_days ADD COLUMN IF NOT EXISTS from_calls boolean NOT NULL DEFAULT false;
  -- A payment taken from a billing report's Payment Received (setReportPayment): at most one a day per customer,
  -- updated when the report is uploaded again.
  ALTER TABLE billing_payments ADD COLUMN IF NOT EXISTS report_day date;
  CREATE UNIQUE INDEX IF NOT EXISTS billing_payments_report_day ON billing_payments (user_id, report_day) WHERE report_day IS NOT NULL;

  -- Audit trail (audit.js): who did what, and when. One row per signed-in change, plus sign-ins, failed
  -- sign-ins and deposits. The person's email and role, and the target's name, are copied in when the row is
  -- written, so the trail still reads properly after a login is deleted. Never pruned.
  CREATE TABLE IF NOT EXISTS audit_log (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id       uuid REFERENCES portal_users (id) ON DELETE SET NULL,  -- null: the system, or an unknown login
    user_email    text NOT NULL DEFAULT '',
    user_role     text NOT NULL DEFAULT '',
    action        text NOT NULL,                       -- 'payment.create', 'auth.login_failed', ...
    target_id     text,                                -- the login, report or payment it was about
    target_label  text NOT NULL DEFAULT '',
    details       jsonb,                               -- what was sent, without secrets; before/after for changes
    status_code   integer,
    method        text,
    path          text,
    ip            text,
    user_agent    text,
    created_at    timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS audit_log_created ON audit_log (created_at DESC);
  CREATE INDEX IF NOT EXISTS audit_log_user ON audit_log (user_id);
  CREATE INDEX IF NOT EXISTS audit_log_target ON audit_log (target_id);
  CREATE INDEX IF NOT EXISTS audit_log_action ON audit_log (action);
`;

export const initPortalDb = () => pool.query(SCHEMA);

// Dates are read as 'YYYY-MM-DD' text (::text below): they are the customer's calendar days, not instants.
const one = async (sql, params) => (await pool.query(sql, params)).rows[0];
const all = async (sql, params) => (await pool.query(sql, params)).rows;

// ── users ────────────────────────────────────────────────────────────────────

const USER_FIELDS = 'id, email, name, company, nickname, role, status, created_at, activated_at, last_login_at, version';

export const findUserByEmail = (email) => one('SELECT * FROM portal_users WHERE email = $1', [email.toLowerCase()]);
// Whoever else has this nickname (any case), if anyone.
export const findUserByNickname = (nickname, exceptId = null) =>
  one('SELECT id, email, name, company FROM portal_users WHERE lower(nickname) = lower($1) AND ($2::uuid IS NULL OR id <> $2)', [nickname, exceptId]);
export const getUser = (id) => one('SELECT * FROM portal_users WHERE id = $1', [id]);
export const countAdmins = async () => Number((await one("SELECT count(*) FROM portal_users WHERE role = 'admin' AND status <> 'disabled'")).count);

export const createUser = ({ email, name, company, nickname = '', role }) => one(
  `INSERT INTO portal_users (email, name, company, nickname, role) VALUES ($1, $2, $3, $4, $5) RETURNING ${USER_FIELDS}`,
  [email.toLowerCase(), name, company, nickname, role]);

// `expected`: the version the change was made from (null: whatever is there). Returns nothing when it was out of
// date. `db` is a transaction's client, for withAdminLock.
export const updateUser = async (id, { name, company, nickname, role, status }, expected = null, db = pool) => (await db.query(
  `UPDATE portal_users SET name = coalesce($2, name), company = coalesce($3, company), nickname = coalesce($7, nickname),
     role = coalesce($4, role), status = coalesce($5, status), version = version + 1
   WHERE id = $1 AND ($6::int IS NULL OR version = $6) RETURNING ${USER_FIELDS}`,
  [id, name ?? null, company ?? null, role ?? null, status ?? null, expected, nickname ?? null])).rows[0];

// Changes that could leave no admin run one at a time (a transaction lock), each seeing the count as it is then:
// two admins demoting each other at the same moment cannot both pass "keep at least one admin".
// fn(db, admins, row): db is the transaction's client, admins the active admins, row the login as it is now.
export async function withAdminLock(userId, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(731400)');
    const admins = Number((await client.query("SELECT count(*) FROM portal_users WHERE role = 'admin' AND status <> 'disabled'")).rows[0].count);
    const row = (await client.query('SELECT * FROM portal_users WHERE id = $1 FOR UPDATE', [userId])).rows[0];
    const result = await fn(client, admins, row);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export const deleteUser = (id, db = pool) => db.query('DELETE FROM portal_users WHERE id = $1', [id]);

// When the profile photo last changed (ms), or null: the portal uses it to fetch and cache the image.
const AVATAR_VERSION = '(SELECT (extract(epoch FROM v.updated_at) * 1000)::bigint FROM portal_avatars v WHERE v.user_id = u.id) AS avatar_version';

// A login as the admin pages show it: with the latest unused setup link and the customer's billing terms.
const USER_ROW = `
  SELECT ${USER_FIELDS.split(', ').map((f) => `u.${f}`).join(', ')},
    (SELECT max(i.expires_at) FROM portal_invites i WHERE i.user_id = u.id AND i.used_at IS NULL AND i.expires_at > now()) AS invite_expires_at,
    a.price_per_call, a.currency, a.start_date::text AS start_date, ${AVATAR_VERSION}
  FROM portal_users u LEFT JOIN billing_accounts a ON a.user_id = u.id`;
const USER_ORDER = "ORDER BY u.role = 'admin' DESC, u.role = 'staff' DESC, lower(coalesce(nullif(u.nickname, ''), nullif(u.name, ''), u.email)), u.id";

// Everyone (the server's own uses: staff's customer list).
export const listUsers = () => all(`${USER_ROW} ${USER_ORDER}`);
export const getUserRow = (id) => one(`${USER_ROW} WHERE u.id = $1`, [id]);

// A page of logins for the admin's list: optionally one role, and matching `q` in name, email, company or nickname.
export async function listUsersPage({ q = '', role = null, limit, offset }) {
  const like = q ? `%${q.replace(/[\\%_]/g, '\\$&')}%` : null;
  const where = `WHERE ($1::text IS NULL OR u.role = $1)
    AND ($2::text IS NULL OR u.name ILIKE $2 OR u.email ILIKE $2 OR u.company ILIKE $2 OR u.nickname ILIKE $2)`;
  const [rows, counts] = await Promise.all([
    all(`${USER_ROW} ${where} ${USER_ORDER} LIMIT $3 OFFSET $4`, [role, like, limit, offset]),
    // Per role for the filter tabs (with the search, without the role), and how many are still to set up.
    all(`SELECT u.role, count(*)::int AS n, count(*) FILTER (WHERE u.status = 'invited')::int AS waiting
      FROM portal_users u WHERE ($1::text IS NULL OR u.name ILIKE $1 OR u.email ILIKE $1 OR u.company ILIKE $1 OR u.nickname ILIKE $1) GROUP BY u.role`, [like]),
  ]);
  const byRole = Object.fromEntries(counts.map((c) => [c.role, c.n]));
  const total = role ? byRole[role] || 0 : counts.reduce((a, c) => a + c.n, 0);
  return { results: rows, total, counts: byRole, waiting: counts.reduce((a, c) => a + c.waiting, 0) };
}

// Just enough to choose someone in a filter: id, name, company, nickname, email and role.
export const listUserOptions = () => all(`SELECT u.id, u.name, u.company, u.nickname, u.email, u.role FROM portal_users u ${USER_ORDER} LIMIT 5000`);

export const setTotpStep = (id, step) => pool.query('UPDATE portal_users SET totp_last_step = $2 WHERE id = $1 AND totp_last_step < $2', [id, step]);
export const setPassword = (id, hash) => pool.query('UPDATE portal_users SET password_hash = $2 WHERE id = $1', [id, hash]);
export const touchLogin = (id) => pool.query('UPDATE portal_users SET last_login_at = now() WHERE id = $1', [id]);

// A new setup link replaces any older one. Resetting a login also clears its password and code app.
export async function createInvite(userId, { tokenHash, secret, createdBy, expiresAt, reset }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM portal_invites WHERE user_id = $1', [userId]);
    if (reset) {
      await client.query("UPDATE portal_users SET password_hash = NULL, totp_secret = NULL, totp_last_step = 0, status = 'invited' WHERE id = $1", [userId]);
      await client.query('DELETE FROM portal_sessions WHERE user_id = $1', [userId]);
    }
    await client.query('INSERT INTO portal_invites (token_hash, user_id, totp_secret, created_by, expires_at) VALUES ($1, $2, $3, $4, $5)',
      [tokenHash, userId, secret, createdBy ?? null, expiresAt]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// ── forgotten passwords ──────────────────────────────────────────────────────

// A new reset link replaces any unused one for the same login.
export async function createPasswordReset(userId, { tokenHash, expiresAt }) {
  await pool.query('DELETE FROM portal_password_resets WHERE user_id = $1 AND used_at IS NULL', [userId]);
  await pool.query('INSERT INTO portal_password_resets (token_hash, user_id, expires_at) VALUES ($1, $2, $3)', [tokenHash, userId, expiresAt]);
}

export const findPasswordReset = (tokenHash) => one(`
  SELECT r.*, u.email, u.name, u.status, u.password_hash IS NOT NULL AS set_up FROM portal_password_resets r
  JOIN portal_users u ON u.id = r.user_id WHERE r.token_hash = $1`, [tokenHash]);

// Uses the link up: only one request can win. Returns the login's id, or null if it was already used or expired.
export async function usePasswordReset(tokenHash) {
  const row = await one(`UPDATE portal_password_resets SET used_at = now()
    WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() RETURNING user_id`, [tokenHash]);
  if (row) await pool.query('DELETE FROM portal_password_resets WHERE user_id = $1 AND token_hash <> $2', [row.user_id, tokenHash]);
  return row?.user_id ?? null;
}

export const forgetOldPasswordResets = () => pool.query("DELETE FROM portal_password_resets WHERE expires_at < now() - interval '7 days'");

export const findInvite = (tokenHash) => one(`
  SELECT i.*, u.email, u.name, u.company, u.role, u.status FROM portal_invites i JOIN portal_users u ON u.id = i.user_id
  WHERE i.token_hash = $1`, [tokenHash]);

// Uses the link up: only one request can win, even if two arrive at once.
export async function completeInvite(tokenHash, { passwordHash, step }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'UPDATE portal_invites SET used_at = now() WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() RETURNING user_id, totp_secret',
      [tokenHash]);
    if (!rows[0]) {
      await client.query('ROLLBACK');
      return null;
    }
    const { user_id: userId, totp_secret: secret } = rows[0];
    await client.query(`UPDATE portal_users SET password_hash = $2, totp_secret = $3, totp_last_step = $4, status = 'active',
      activated_at = coalesce(activated_at, now()) WHERE id = $1`, [userId, passwordHash, secret, step]);
    await client.query('DELETE FROM portal_invites WHERE user_id = $1 AND token_hash <> $2', [userId, tokenHash]);
    await client.query('COMMIT');
    return userId;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// ── sessions ─────────────────────────────────────────────────────────────────

export const createSession = ({ userId, accessHash, accessExpires, refreshHash, refreshExpires }) => pool.query(
  'INSERT INTO portal_sessions (user_id, access_hash, access_expires, refresh_hash, refresh_expires) VALUES ($1, $2, $3, $4, $5)',
  [userId, accessHash, accessExpires, refreshHash, refreshExpires]);

export const findSessionUser = (accessHash) => one(`
  SELECT u.*, s.id AS session_id, ${AVATAR_VERSION} FROM portal_sessions s JOIN portal_users u ON u.id = s.user_id
  WHERE s.access_hash = $1 AND s.access_expires > now() AND u.status = 'active'`, [accessHash]);

// ── contact methods ──────────────────────────────────────────────────────────

const CONTACT_FIELDS = 'telegram, whatsapp, element, zangi, signal, email, updated_at';
export const getContacts = (userId) => one(`SELECT ${CONTACT_FIELDS} FROM customer_contacts WHERE user_id = $1`, [userId]);
export const saveContacts = (userId, c) => one(`
  INSERT INTO customer_contacts (user_id, telegram, whatsapp, element, zangi, signal, email) VALUES ($1, $2, $3, $4, $5, $6, $7)
  ON CONFLICT (user_id) DO UPDATE SET telegram = excluded.telegram, whatsapp = excluded.whatsapp, element = excluded.element,
    zangi = excluded.zangi, signal = excluded.signal, email = excluded.email, updated_at = now()
  RETURNING ${CONTACT_FIELDS}`, [userId, c.telegram, c.whatsapp, c.element, c.zangi, c.signal, c.email]);

// ── the customer's Telegram chat with the bot (telegram-link.js) ─────────────

// A new code replaces the login's unused ones.
export async function createTelegramCode(userId, codeHash, expiresAt) {
  await pool.query('DELETE FROM telegram_link_codes WHERE user_id = $1 OR expires_at < now()', [userId]);
  await pool.query('INSERT INTO telegram_link_codes (code_hash, user_id, expires_at) VALUES ($1, $2, $3)', [codeHash, userId, expiresAt]);
}

// Uses the code up: only one Start can win. Returns the login it belongs to, or null if used or expired.
export const useTelegramCode = async (codeHash) =>
  (await one('DELETE FROM telegram_link_codes WHERE code_hash = $1 AND expires_at > now() RETURNING user_id', [codeHash]))?.user_id ?? null;

export const saveCustomerTelegram = (userId, { chatId, username, firstName }) => one(`
  INSERT INTO customer_telegram (user_id, chat_id, username, first_name) VALUES ($1, $2, $3, $4)
  ON CONFLICT (user_id) DO UPDATE SET chat_id = excluded.chat_id, username = excluded.username, first_name = excluded.first_name, linked_at = now()
  RETURNING *`, [userId, String(chatId), username || '', firstName || '']);

export const getCustomerTelegram = (userId) => one('SELECT * FROM customer_telegram WHERE user_id = $1', [userId]);
export const deleteCustomerTelegram = (userId) => pool.query('DELETE FROM customer_telegram WHERE user_id = $1', [userId]);
// /stop in the bot, or the person blocked it: every login linked to that chat. Returns those logins' ids.
export const deleteTelegramChat = async (chatId) =>
  (await all('DELETE FROM customer_telegram WHERE chat_id = $1 RETURNING user_id', [String(chatId)])).map((r) => r.user_id);
// Which of these logins have a chat linked.
export const telegramLinked = async (userIds) =>
  new Set((await all('SELECT user_id FROM customer_telegram WHERE user_id = ANY($1)', [userIds])).map((r) => r.user_id));

// ── profile photos ───────────────────────────────────────────────────────────

export const getAvatar = (userId) => one('SELECT content_type, content, updated_at FROM portal_avatars WHERE user_id = $1', [userId]);
export const saveAvatar = (userId, contentType, content) => one(`
  INSERT INTO portal_avatars (user_id, content_type, content) VALUES ($1, $2, $3)
  ON CONFLICT (user_id) DO UPDATE SET content_type = excluded.content_type, content = excluded.content, updated_at = now()
  RETURNING (extract(epoch FROM updated_at) * 1000)::bigint AS avatar_version`, [userId, contentType, content]);
export const deleteAvatar = (userId) => pool.query('DELETE FROM portal_avatars WHERE user_id = $1', [userId]);

export const renewAccess = (refreshHash, accessHash, accessExpires) => one(`
  UPDATE portal_sessions s SET access_hash = $2, access_expires = $3
  FROM portal_users u WHERE u.id = s.user_id AND u.status = 'active' AND s.refresh_hash = $1 AND s.refresh_expires > now()
  RETURNING s.id`, [refreshHash, accessHash, accessExpires]);

export const deleteSession = (id) => pool.query('DELETE FROM portal_sessions WHERE id = $1', [id]);
export const deleteUserSessions = (userId, exceptId = null) =>
  pool.query('DELETE FROM portal_sessions WHERE user_id = $1 AND id IS DISTINCT FROM $2', [userId, exceptId]);
export const deleteExpiredSessions = () => pool.query('DELETE FROM portal_sessions WHERE refresh_expires < now()');

// ── billing ──────────────────────────────────────────────────────────────────

const ACCOUNT_FIELDS = 'currency, price_per_call, opening_balance, start_date::text AS start_date, timezone, version';
export const getAccount = (userId) => one(`SELECT ${ACCOUNT_FIELDS} FROM billing_accounts WHERE user_id = $1`, [userId]);

// `expected` as for updateUser; 0 means "not set up yet". Returns nothing when out of date.
export const saveAccount = (userId, { currency, price_per_call, opening_balance, start_date, timezone }, expected = null) => one(`
  INSERT INTO billing_accounts (user_id, currency, price_per_call, opening_balance, start_date, timezone)
  VALUES ($1, $2, $3, $4, $5, $6)
  ON CONFLICT (user_id) DO UPDATE SET currency = excluded.currency, price_per_call = excluded.price_per_call,
    opening_balance = excluded.opening_balance, start_date = excluded.start_date, timezone = excluded.timezone,
    version = billing_accounts.version + 1
  WHERE $7::int IS NULL OR billing_accounts.version = $7
  RETURNING ${ACCOUNT_FIELDS}`, [userId, currency, price_per_call, opening_balance, start_date, timezone, expected]);

const DAY_FIELDS = 'date::text AS date, calls, replacements, price_per_call, from_calls, version';

export const listDays = (userId, upTo) =>
  all(`SELECT ${DAY_FIELDS} FROM billing_days WHERE user_id = $1 AND date <= $2 ORDER BY date`, [userId, upTo]);

export const getDay = (userId, date) => one(`SELECT ${DAY_FIELDS} FROM billing_days WHERE user_id = $1 AND date = $2`, [userId, date]);

// `expected` as for updateUser; 0 means "no calls entered for that day yet". Returns nothing when out of date.
export const saveDay = (userId, { date, calls, replacements, price_per_call }, expected = null) => one(`
  INSERT INTO billing_days (user_id, date, calls, replacements, price_per_call) VALUES ($1, $2, $3, $4, $5)
  ON CONFLICT (user_id, date) DO UPDATE SET calls = excluded.calls, replacements = excluded.replacements,
    price_per_call = excluded.price_per_call, updated_at = now(), version = billing_days.version + 1
  WHERE $6::int IS NULL OR billing_days.version = $6
  RETURNING ${DAY_FIELDS}`, [userId, date, calls, replacements, price_per_call, expected]);

// Returns false when `expected` was given and the day had changed since.
export const deleteDay = async (userId, date, expected = null) => (await pool.query(
  'DELETE FROM billing_days WHERE user_id = $1 AND date = $2 AND ($3::int IS NULL OR version = $3)', [userId, date, expected])).rowCount > 0
  || expected === null || !(await getDay(userId, date));

export const listPayments = (userId) =>
  all('SELECT * FROM billing_payments WHERE user_id = $1 ORDER BY paid_at', [userId]);

export const addPayment = (userId, { amount, currency, status, reference, note, paid_at }) => one(`
  INSERT INTO billing_payments (user_id, amount, currency, status, reference, note, paid_at)
  VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`, [userId, amount, currency, status, reference, note, paid_at]);

// For reports across customers: three queries in all, however many customers there are.
export const listBillingCustomers = (userId = null) => all(`
  SELECT u.id, u.email, u.name, u.company, u.nickname, u.status, a.currency, a.price_per_call, a.opening_balance,
    a.start_date::text AS start_date, a.timezone
  FROM portal_users u JOIN billing_accounts a ON a.user_id = u.id
  WHERE u.role = 'customer' AND ($1::uuid IS NULL OR u.id = $1)`, [userId]);
export const listDaysOf = (userIds, upTo) =>
  all(`SELECT user_id, ${DAY_FIELDS} FROM billing_days WHERE user_id = ANY($1) AND date <= $2 ORDER BY date`, [userIds, upTo]);
export const listPaymentsOf = (userIds) =>
  all('SELECT * FROM billing_payments WHERE user_id = ANY($1) ORDER BY paid_at', [userIds]);

export const deletePayment = (userId, id) => pool.query('DELETE FROM billing_payments WHERE user_id = $1 AND id = $2', [userId, id]);

// A billing report's Payment Received for a day (`total`): the part of it not already recorded that day in the
// customer's time zone (typed in, or a deposit) is kept as one completed payment, which a later upload of the report
// updates, or removes when nothing is left over. -> { amount: the report's payment now (0: none), before: what it was
// (0: none), others: the day's other completed payments }
export const setReportPayment = (userId, { date, total, currency, timezone, paid_at }) => inTransaction(async (db) => {
  await db.query('SELECT 1 FROM billing_accounts WHERE user_id = $1 FOR UPDATE', [userId]);
  const others = Number((await db.query(`SELECT coalesce(sum(amount), 0) AS sum FROM billing_payments
    WHERE user_id = $1 AND status = 'completed' AND report_day IS DISTINCT FROM $2::date AND (paid_at AT TIME ZONE $3)::date = $2::date`,
  [userId, date, timezone])).rows[0].sum);
  const before = (await db.query('SELECT id, amount FROM billing_payments WHERE user_id = $1 AND report_day = $2 FOR UPDATE', [userId, date])).rows[0];
  const amount = Math.max(0, Math.round((total - others) * 100)) / 100;
  if (!amount) {
    if (before) await db.query('DELETE FROM billing_payments WHERE id = $1', [before.id]);
  } else if (!before) {
    await db.query(`INSERT INTO billing_payments (user_id, amount, currency, status, note, paid_at, report_day)
      VALUES ($1, $2, $3, 'completed', 'From the billing report', $4, $5)`, [userId, amount, currency, paid_at, date]);
  } else if (Number(before.amount) !== amount) {
    await db.query('UPDATE billing_payments SET amount = $2 WHERE id = $1', [before.id, amount]);
  }
  return { amount, before: before ? Number(before.amount) : 0, others };
});

// ── call records (report_calls) and replaced calls ───────────────────────────

// The buyer's distinct calls (`calls`, a WITH query; $1 is the buyer) on the days `range` picks (SQL on `date`): each
// call in their Call Summaries, for every toll-free number, and each replaced call, once. A call is its time to the
// second, caller and number called; one read before those were kept (call_time '') is its minute and caller, and is
// left out when a call read since has that minute and caller (it is the same call, or one of them).
const CALLS = (range) => `
  c AS (SELECT date, called_at, caller, call_time, number_called FROM report_calls WHERE user_id = $1 AND ${range}
    UNION SELECT date, called_at, caller, call_time, number_called FROM replaced_calls WHERE user_id = $1 AND ${range}),
  calls AS (SELECT * FROM c WHERE call_time <> '' OR NOT EXISTS (SELECT 1 FROM c x
    WHERE x.call_time <> '' AND x.date = c.date AND x.called_at = c.called_at AND x.caller = c.caller))`;

// Bills these days from the buyer's call records, inside the caller's transaction (`db`). A day is billed from them
// once any Call Summary lists calls on it, and stays so: its calls are the distinct calls (CALLS) in their logs and
// their replaced calls; with none left, the day is removed. Days typed in and never in a log are left
// alone, as are days before billing starts. -> [{ date, before, after }] for each day that changed (null: none).
export async function syncCallDays(db, userId, dates) {
  const account = (await db.query('SELECT start_date::text AS start_date, price_per_call FROM billing_accounts WHERE user_id = $1', [userId])).rows[0];
  if (!account) return [];
  const changes = [];
  for (const date of [...new Set(dates)].sort()) {
    if (date < account.start_date) continue;
    const day = (await db.query('SELECT calls, from_calls FROM billing_days WHERE user_id = $1 AND date = $2 FOR UPDATE', [userId, date])).rows[0];
    const { logged, calls } = (await db.query(`WITH ${CALLS('date = $2')}
      SELECT EXISTS (SELECT 1 FROM report_calls WHERE user_id = $1 AND date = $2) AS logged, (SELECT count(*)::int FROM calls) AS calls`, [userId, date])).rows[0];
    if (!logged && !day?.from_calls) continue;
    if (calls > 0) {
      if (day?.from_calls && day.calls === calls) continue;
      await db.query(`INSERT INTO billing_days (user_id, date, calls, replacements, price_per_call, from_calls) VALUES ($1, $2, $3, 0, $4, true)
        ON CONFLICT (user_id, date) DO UPDATE SET calls = excluded.calls, from_calls = true, updated_at = now(), version = billing_days.version + 1`,
      [userId, date, calls, account.price_per_call]);
    } else {
      await db.query('DELETE FROM billing_days WHERE user_id = $1 AND date = $2', [userId, date]);
    }
    changes.push({ date, before: day?.calls ?? null, after: calls || null });
  }
  return changes;
}

// Runs fn(client) in a transaction.
async function inTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// A Call Summary's calls ([{ date, called_at, caller, duration, call_time, number_called }]), replacing any it had, and
// its days billed from them. `exact`: they were read with their time to the second and number called (an up-to-date
// portal). -> the days that changed, as syncCallDays.
export const setReportCalls = (report, calls, exact = true) => inTransaction(async (db) => {
  const before = (await db.query('DELETE FROM report_calls WHERE report_id = $1 RETURNING date::text AS date', [report.id])).rows.map((r) => r.date);
  const col = (k) => calls.map((c) => c[k] || '');
  await db.query(`INSERT INTO report_calls (report_id, user_id, date, called_at, caller, duration, call_time, number_called)
    SELECT $1::uuid, $2::uuid, * FROM unnest($3::date[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[])`,
  [report.id, report.user_id, col('date'), col('called_at'), col('caller'), col('duration'), col('call_time'), col('number_called')]);
  await db.query('UPDATE portal_reports SET calls = $2, calls_exact = $3 WHERE id = $1', [report.id, calls.length, exact]);
  return syncCallDays(db, report.user_id, [...before, ...calls.map((c) => c.date)]);
});

// Every day the buyer's call records touch, again: after their billing terms are set (or start on another day).
export const syncAllCallDays = (userId) => inTransaction(async (db) => {
  const dates = (await db.query(`SELECT date::text AS date FROM report_calls WHERE user_id = $1
    UNION SELECT date::text FROM billing_days WHERE user_id = $1 AND from_calls`, [userId])).rows.map((r) => r.date);
  return syncCallDays(db, userId, dates);
});

// Deletes a report; days billed from its calls are counted again without them. -> the days that changed.
export const deleteReportAndSync = (id) => inTransaction(async (db) => {
  const report = (await db.query('SELECT user_id FROM portal_reports WHERE id = $1 FOR UPDATE', [id])).rows[0];
  if (!report) return [];
  const dates = (await db.query('SELECT DISTINCT date::text AS date FROM report_calls WHERE report_id = $1', [id])).rows.map((r) => r.date);
  await db.query('DELETE FROM portal_reports WHERE id = $1', [id]);
  return syncCallDays(db, report.user_id, dates);
});

// Each day from `from` to `to` with calls in the buyer's Call Summaries or in billing, whether billed or not (no billing
// terms yet, or before billing starts): logged_calls are the distinct calls (CALLS) in the logs and the replaced
// calls, as syncCallDays counts them; billed_calls and billed_replacements are what billing has (null: none).
export const listCallDays = (userId, from, to) => all(`
  WITH ${CALLS('date BETWEEN $2 AND $3')},
  logged AS (SELECT date, count(*)::int AS calls FROM calls GROUP BY date),
  replaced AS (SELECT date, count(*)::int AS calls FROM replaced_calls WHERE user_id = $1 AND date BETWEEN $2 AND $3 GROUP BY date),
  billed AS (SELECT date, calls, replacements, price_per_call FROM billing_days WHERE user_id = $1 AND date BETWEEN $2 AND $3)
  SELECT coalesce(l.date, b.date)::text AS date, coalesce(l.calls, 0) AS logged_calls, coalesce(r.calls, 0) AS replaced_calls,
    b.calls AS billed_calls, b.replacements AS billed_replacements, b.price_per_call
  FROM logged l FULL JOIN billed b ON b.date = l.date LEFT JOIN replaced r ON r.date = coalesce(l.date, b.date)
  ORDER BY 1`, [userId, from, to]);

// The same calls (CALLS) by day and toll-free number called: [{ date, number_called, calls, replaced }]. number_called
// is '' for calls read before numbers were kept.
export const listCallNumbers = (userId, from, to) => all(`
  WITH ${CALLS('date BETWEEN $2 AND $3')},
  logged AS (SELECT date, number_called, count(*)::int AS calls FROM calls GROUP BY 1, 2),
  replaced AS (SELECT date, number_called, count(*)::int AS calls FROM replaced_calls WHERE user_id = $1 AND date BETWEEN $2 AND $3 GROUP BY 1, 2)
  SELECT coalesce(l.date, r.date)::text AS date, coalesce(l.number_called, r.number_called) AS number_called,
    coalesce(l.calls, 0) AS calls, coalesce(r.calls, 0) AS replaced
  FROM logged l FULL JOIN replaced r ON r.date = l.date AND r.number_called = l.number_called
  ORDER BY 1, 2`, [userId, from, to]);

// ── replaced calls ───────────────────────────────────────────────────────────

const REPLACED_FIELDS = `id, report_id, date::text AS date, called_at, caller, duration, call_time, number_called, reason, replaced_by_email, created_at`;

// From `from` on (to `to`, when given), the latest day first.
export const listReplacedCalls = (userId, from, to = null) => all(`SELECT ${REPLACED_FIELDS} FROM replaced_calls
  WHERE user_id = $1 AND date >= $2 AND ($3::date IS NULL OR date <= $3) ORDER BY date DESC, called_at DESC`, [userId, from, to]);
export const getReplacedCall = (userId, id) => one(`SELECT ${REPLACED_FIELDS} FROM replaced_calls WHERE user_id = $1 AND id = $2`, [userId, id]);
export const countReplacedCalls = async (userId, date) =>
  Number((await one('SELECT count(*) FROM replaced_calls WHERE user_id = $1 AND date = $2', [userId, date])).count);

// Takes calls off their days' bills, all or none: each day's replacements go up by its newly replaced calls.
// Calls already replaced are left as they are, as is a call replaced before calls kept their seconds and number
// called that has the same minute and caller (or the other way round). -> { replaced } (how many were new), or { refused: { date, calls,
// replacements, adding } } when a day has no calls entered (calls null) or too few for them, and nothing is saved.
// A refusal stops the transaction without saving anything.
class Refused extends Error {
  constructor(refused) {
    super('refused');
    this.refused = refused;
  }
}

export const replaceCalls = (userId, calls, { reportId, reason, by }) => inTransaction(async (db) => {
  const perDay = new Map();
  for (const c of calls) {
    const { rows } = await db.query(`
      INSERT INTO replaced_calls (user_id, report_id, date, called_at, caller, duration, reason, replaced_by, replaced_by_email, call_time, number_called)
      SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11 WHERE NOT EXISTS (SELECT 1 FROM replaced_calls
        WHERE user_id = $1 AND date = $3 AND called_at = $4 AND caller = $5 AND (call_time = '' OR $10 = ''))
      ON CONFLICT DO NOTHING RETURNING date::text AS date`,
    [userId, reportId, c.date, c.called_at, c.caller, c.duration, reason, by.id, by.email, c.call_time || '', c.number_called || '']);
    if (rows[0]) perDay.set(rows[0].date, (perDay.get(rows[0].date) || 0) + 1);
  }
  // A replaced call missing from the day's logs still counts as one of its calls.
  await syncCallDays(db, userId, [...perDay.keys()]);
  for (const [date, adding] of perDay) {
    const { rows } = await db.query(`UPDATE billing_days SET replacements = replacements + $3, updated_at = now(), version = version + 1
      WHERE user_id = $1 AND date = $2 AND replacements + $3 <= calls RETURNING date`, [userId, date, adding]);
    if (!rows[0]) {
      const day = (await db.query('SELECT calls, replacements FROM billing_days WHERE user_id = $1 AND date = $2', [userId, date])).rows[0];
      throw new Refused({ date, calls: day?.calls ?? null, replacements: day?.replacements ?? 0, adding });
    }
  }
  return { replaced: [...perDay.values()].reduce((a, n) => a + n, 0) };
}).catch((err) => {
  if (err instanceof Refused) return { refused: err.refused };
  throw err;
});

// Puts a replaced call back on its day's bill. Returns the call, or nothing when it was not replaced.
export const undoReplacedCall = (userId, id) => inTransaction(async (db) => {
  const call = (await db.query(`DELETE FROM replaced_calls WHERE user_id = $1 AND id = $2 RETURNING ${REPLACED_FIELDS}`, [userId, id])).rows[0];
  if (call) {
    await db.query(`UPDATE billing_days SET replacements = greatest(replacements - 1, 0), updated_at = now(), version = version + 1
      WHERE user_id = $1 AND date = $2`, [userId, call.date]);
    await syncCallDays(db, userId, [call.date]);
  }
  return call;
});

// A deposit seen by the payment check: new, or moving on from pending. Returns true when something changed.
// A completed payment is never changed back.
export const saveProviderPayment = async (userId, { provider, reference, amount, currency, status, note, paid_at }) => Boolean(await one(`
  INSERT INTO billing_payments (user_id, amount, currency, status, provider, reference, note, paid_at)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  ON CONFLICT (provider, reference) WHERE provider <> 'manual'
  DO UPDATE SET status = excluded.status, amount = excluded.amount, paid_at = excluded.paid_at
    WHERE billing_payments.status <> 'completed' AND billing_payments.status <> excluded.status
  RETURNING id`, [userId, amount, currency, status, provider, reference, note, paid_at]));

export const getWallet = (userId) => one('SELECT * FROM billing_wallets WHERE user_id = $1', [userId]);
export const saveWallet = (userId, { provider, network, address }) =>
  pool.query('INSERT INTO billing_wallets (user_id, provider, network, address) VALUES ($1, $2, $3, $4)', [userId, provider, network, address]);

// address -> customer id, for the addresses given.
export const findWalletOwners = async (addresses) => new Map(
  (await all('SELECT address, user_id FROM billing_wallets WHERE address = ANY($1)', [[...new Set(addresses.filter(Boolean))]]))
    .map((r) => [r.address, r.user_id]));

// ── reports ──────────────────────────────────────────────────────────────────

// `replaced`: for a Call Summary, the calls replaced on the days it covers ({ called_at, caller, call_time,
// number_called }), so its viewer can mark them.
// `calls`: for a Call Summary, how many calls it lists (null: never read, uploaded before calls were read).
// `calls_exact`: its calls were read with their time to the second and number called (false: read before; Read Again).
const REPORT_FIELDS = `r.id, u.email AS customer, coalesce(nullif(u.nickname, ''), nullif(u.name, ''), u.email) AS customer_name, r.user_id, r.kind, r.title, r.note, r.period_from::text AS period_from,
  r.period_to::text AS period_to, r.filename, r.size, r.uploaded_at, r.calls, r.calls_exact,
  (SELECT coalesce(json_agg(json_build_object('called_at', c.called_at, 'caller', c.caller, 'call_time', c.call_time, 'number_called', c.number_called)), '[]') FROM replaced_calls c
    WHERE r.kind = 'calls' AND c.user_id = r.user_id AND c.date BETWEEN r.period_from AND r.period_to) AS replaced`;

// `kind`: 'billing' or 'calls' only, or null for both.
export const listReports = (userId = null, kind = null) => all(`
  SELECT ${REPORT_FIELDS} FROM portal_reports r JOIN portal_users u ON u.id = r.user_id
  WHERE ($1::uuid IS NULL OR r.user_id = $1) AND ($2::text IS NULL OR r.kind = $2) ORDER BY r.uploaded_at DESC`, [userId, kind]);

export const getReportFile = (id) =>
  one('SELECT id, user_id, kind, filename, content_type, content FROM portal_reports WHERE id = $1', [id]);

export const addReport = (r) => one(`
  WITH r AS (
    INSERT INTO portal_reports (user_id, kind, title, note, period_from, period_to, filename, content_type, size, content)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *)
  SELECT ${REPORT_FIELDS} FROM r JOIN portal_users u ON u.id = r.user_id`,
  [r.userId, r.kind, r.title, r.note, r.periodFrom, r.periodTo, r.filename, r.contentType, r.content.length, r.content]);


export const getReportInfo = (id) => one(`SELECT ${REPORT_FIELDS} FROM portal_reports r JOIN portal_users u ON u.id = r.user_id WHERE r.id = $1`, [id]);
export const getPayment = (userId, id) =>
  one('SELECT id, amount, status, reference, note, paid_at FROM billing_payments WHERE user_id = $1 AND id = $2', [userId, id]);
// reference -> status now, for a provider's payments (a deposit's audit entries show where it stands).
export const paymentStatuses = async (provider, references) => new Map(
  (await all('SELECT reference, status FROM billing_payments WHERE provider = $1 AND reference = ANY($2)', [provider, references]))
    .map((r) => [r.reference, r.status]));

// ── audit trail ──────────────────────────────────────────────────────────────

export const addAuditEntry = (e) => pool.query(`
  INSERT INTO audit_log (user_id, user_email, user_role, action, target_id, target_label, details, status_code, method, path, ip, user_agent)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
[e.userId ?? null, e.userEmail || '', e.userRole || '', e.action, e.targetId ?? null, e.targetLabel || '',
  e.details && Object.keys(e.details).length ? JSON.stringify(e.details) : null, e.status ?? null, e.method ?? null, e.path ?? null,
  e.ip ?? null, e.userAgent ?? null]);

// The WHERE clause for the audit filters. Days are calendar days in `tz` (the admin's own time zone).
// $1 is always the time zone, so the summary can group by day with it.
function auditWhere({ from, to, tz, action, kind, user, target, about, outcome, q }) {
  const where = [];
  const params = [tz];
  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replaceAll('?', `$${params.length}`));
  };
  if (from) add('created_at >= (?::date)::timestamp AT TIME ZONE $1', from);
  if (to) add('created_at < (?::date + 1)::timestamp AT TIME ZONE $1', to);
  if (action) add('action = ?', action);
  if (kind) add("split_part(action, '.', 1) = ANY(?)", kind);
  if (user) add('user_id = ?', user);
  if (target) add('target_id = ?', target);
  if (about) add('(target_id = ? OR user_id::text = ?)', about);
  if (outcome === 'failed') where.push("(status_code >= 400 OR action LIKE '%failed')");
  if (q) add("(user_email ILIKE ? OR action ILIKE ? OR target_label ILIKE ? OR coalesce(ip, '') ILIKE ?)", `%${q.replace(/[\\%_]/g, '\\$&')}%`);
  return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

const AUDIT_FIELDS = `id, user_id, user_email, user_role, action, target_id, target_label, details, status_code, method, path, ip,
  user_agent, created_at`;

// Every statement uses $1 (the time zone): PostgreSQL wants each numbered parameter to appear in the query.
const TZ_USED = '$1::text IS NOT NULL';

// Newest first, a page at a time by id (rows are numbered in the order written): `before` is the last id of the
// previous page. Unlike OFFSET, a page deep in the log costs the same as the first. The total is only counted when
// asked (the first page), as counting is the slow part on a large log.
export async function listAudit(filters, { limit, before = null, count = true }) {
  const { sql, params } = auditWhere(filters);
  const and = sql ? `${sql} AND ${TZ_USED}` : `WHERE ${TZ_USED}`;
  const total = count ? (await one(`SELECT count(*)::int AS count FROM audit_log ${and}`, params)).count : null;
  const page = await all(`SELECT ${AUDIT_FIELDS} FROM audit_log ${and} AND ($${params.length + 1}::bigint IS NULL OR id < $${params.length + 1})
    ORDER BY id DESC LIMIT $${params.length + 2}`, [...params, before, limit + 1]);
  const rows = page.slice(0, limit);
  return { rows, total, next: page.length > limit ? rows[rows.length - 1].id : null };
}

// Counts for the activity chart and the figures above it, under the same filters as the list.
export async function auditSummary(filters) {
  const { sql, params } = auditWhere(filters);
  const and = sql ? `${sql} AND` : 'WHERE';
  const [perDay, totals, people] = await Promise.all([
    all(`SELECT (created_at AT TIME ZONE $1)::date::text AS day, split_part(action, '.', 1) AS kind, count(*)::int AS count
      FROM audit_log ${sql} GROUP BY 1, 2 ORDER BY 1`, params),
    one(`SELECT count(*)::int AS events, count(DISTINCT user_id)::int AS people,
        count(*) FILTER (WHERE action = 'auth.login')::int AS sign_ins,
        count(*) FILTER (WHERE action = 'auth.login_failed')::int AS failed_sign_ins,
        count(*) FILTER (WHERE status_code >= 400 AND action <> 'auth.login_failed')::int AS refused
      FROM audit_log ${and} ${TZ_USED}`, params),
    all(`SELECT user_id, max(user_email) AS email, max(user_role) AS role, count(*)::int AS count
      FROM audit_log ${and} user_id IS NOT NULL AND ${TZ_USED} GROUP BY user_id ORDER BY count DESC LIMIT 6`, params),
  ]);
  return { per_day: perDay, totals, people };
}

export const auditActions = async () => (await all('SELECT DISTINCT action FROM audit_log ORDER BY action')).map((r) => r.action);
