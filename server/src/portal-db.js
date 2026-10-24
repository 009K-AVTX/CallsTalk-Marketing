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

  -- Profile photos: a small square image (resized in the browser), checked by its bytes on upload.
  CREATE TABLE IF NOT EXISTS portal_avatars (
    user_id       uuid PRIMARY KEY REFERENCES portal_users (id) ON DELETE CASCADE,
    content_type  text NOT NULL,
    content       bytea NOT NULL,
    updated_at    timestamptz NOT NULL DEFAULT now()
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
`;

export const initPortalDb = () => pool.query(SCHEMA);

// Dates are read as 'YYYY-MM-DD' text (::text below): they are the customer's calendar days, not instants.
const one = async (sql, params) => (await pool.query(sql, params)).rows[0];
const all = async (sql, params) => (await pool.query(sql, params)).rows;

// ── users ────────────────────────────────────────────────────────────────────

const USER_FIELDS = 'id, email, name, company, role, status, created_at, activated_at, last_login_at';

export const findUserByEmail = (email) => one('SELECT * FROM portal_users WHERE email = $1', [email.toLowerCase()]);
export const getUser = (id) => one('SELECT * FROM portal_users WHERE id = $1', [id]);
export const countAdmins = async () => Number((await one("SELECT count(*) FROM portal_users WHERE role = 'admin' AND status <> 'disabled'")).count);

export const createUser = ({ email, name, company, role }) => one(
  `INSERT INTO portal_users (email, name, company, role) VALUES ($1, $2, $3, $4) RETURNING ${USER_FIELDS}`,
  [email.toLowerCase(), name, company, role]);

export const updateUser = (id, { name, company, role, status }) => one(
  `UPDATE portal_users SET name = coalesce($2, name), company = coalesce($3, company), role = coalesce($4, role),
     status = coalesce($5, status) WHERE id = $1 RETURNING ${USER_FIELDS}`,
  [id, name ?? null, company ?? null, role ?? null, status ?? null]);

export const deleteUser = (id) => pool.query('DELETE FROM portal_users WHERE id = $1', [id]);

// When the profile photo last changed (ms), or null: the portal uses it to fetch and cache the image.
const AVATAR_VERSION = '(SELECT (extract(epoch FROM v.updated_at) * 1000)::bigint FROM portal_avatars v WHERE v.user_id = u.id) AS avatar_version';

// Everyone, with the latest unused setup link and the customer's billing terms.
export const listUsers = () => all(`
  SELECT ${USER_FIELDS.split(', ').map((f) => `u.${f}`).join(', ')},
    (SELECT max(i.expires_at) FROM portal_invites i WHERE i.user_id = u.id AND i.used_at IS NULL AND i.expires_at > now()) AS invite_expires_at,
    a.price_per_call, a.currency, a.start_date::text AS start_date, ${AVATAR_VERSION}
  FROM portal_users u LEFT JOIN billing_accounts a ON a.user_id = u.id
  ORDER BY u.role = 'admin' DESC, u.role = 'staff' DESC, lower(coalesce(nullif(u.company, ''), u.name, u.email))`);

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

const ACCOUNT_FIELDS = 'currency, price_per_call, opening_balance, start_date::text AS start_date, timezone';
export const getAccount = (userId) => one(`SELECT ${ACCOUNT_FIELDS} FROM billing_accounts WHERE user_id = $1`, [userId]);

export const saveAccount = (userId, { currency, price_per_call, opening_balance, start_date, timezone }) => one(`
  INSERT INTO billing_accounts (user_id, currency, price_per_call, opening_balance, start_date, timezone)
  VALUES ($1, $2, $3, $4, $5, $6)
  ON CONFLICT (user_id) DO UPDATE SET currency = excluded.currency, price_per_call = excluded.price_per_call,
    opening_balance = excluded.opening_balance, start_date = excluded.start_date, timezone = excluded.timezone
  RETURNING ${ACCOUNT_FIELDS}`, [userId, currency, price_per_call, opening_balance, start_date, timezone]);

export const listDays = (userId, upTo) =>
  all('SELECT date::text AS date, calls, price_per_call FROM billing_days WHERE user_id = $1 AND date <= $2 ORDER BY date', [userId, upTo]);

export const saveDay = (userId, { date, calls, price_per_call }) => one(`
  INSERT INTO billing_days (user_id, date, calls, price_per_call) VALUES ($1, $2, $3, $4)
  ON CONFLICT (user_id, date) DO UPDATE SET calls = excluded.calls, price_per_call = excluded.price_per_call, updated_at = now()
  RETURNING date::text AS date, calls, price_per_call`, [userId, date, calls, price_per_call]);

export const deleteDay = (userId, date) => pool.query('DELETE FROM billing_days WHERE user_id = $1 AND date = $2', [userId, date]);

export const listPayments = (userId) =>
  all('SELECT * FROM billing_payments WHERE user_id = $1 ORDER BY paid_at', [userId]);

export const addPayment = (userId, { amount, currency, status, reference, note, paid_at }) => one(`
  INSERT INTO billing_payments (user_id, amount, currency, status, reference, note, paid_at)
  VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`, [userId, amount, currency, status, reference, note, paid_at]);

export const deletePayment = (userId, id) => pool.query('DELETE FROM billing_payments WHERE user_id = $1 AND id = $2', [userId, id]);

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

const REPORT_FIELDS = `r.id, u.email AS customer, r.user_id, r.title, r.note, r.period_from::text AS period_from,
  r.period_to::text AS period_to, r.filename, r.size, r.uploaded_at`;

export const listReports = (userId = null) => all(`
  SELECT ${REPORT_FIELDS} FROM portal_reports r JOIN portal_users u ON u.id = r.user_id
  WHERE $1::uuid IS NULL OR r.user_id = $1 ORDER BY r.uploaded_at DESC`, [userId]);

export const getReportFile = (id) =>
  one('SELECT id, user_id, filename, content_type, content FROM portal_reports WHERE id = $1', [id]);

export const addReport = (r) => one(`
  WITH r AS (
    INSERT INTO portal_reports (user_id, title, note, period_from, period_to, filename, content_type, size, content)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *)
  SELECT ${REPORT_FIELDS} FROM r JOIN portal_users u ON u.id = r.user_id`,
  [r.userId, r.title, r.note, r.periodFrom, r.periodTo, r.filename, r.contentType, r.content.length, r.content]);

export const deleteReport = (id) => pool.query('DELETE FROM portal_reports WHERE id = $1', [id]);
