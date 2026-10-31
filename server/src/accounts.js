// Portal logins (portal/ in the site, src/lib/portal.js). Every login has a password and an
// authenticator app; both are set on the one-use setup link our team sends.
//
//   POST /api/accounts/login            email + password    -> { mfa_required, temp_token }
//   POST /api/accounts/verify-mfa       temp_token + token  -> { email, name, role } and the session cookies
//   POST /api/accounts/refresh          (refresh cookie)    -> { ok } and a new session cookie
//   POST /api/accounts/logout           (session)           -> { ok }, cookies cleared
//   GET  /api/accounts/me               (session)           -> profile
//
// "(session)" is the HttpOnly session cookie (security.js); an Authorization: Bearer header also works, for
// scripts. Tokens are never put in a reply body, so the portal's scripts never see them.
//   POST /api/accounts/change-password  (Bearer) current_password, new_password -> { code_required }
//                                        ... and again with code (authenticator) -> { ok }
//   PUT  /api/accounts/avatar           (Bearer) content_base64 (JPG, PNG or WebP) -> { avatar_version }
//   DELETE /api/accounts/avatar         (Bearer)            -> { avatar_version: null }
//   GET  /api/accounts/avatar/:userId   (Bearer)            -> the photo (own; staff: customers'; admin: all)
//   GET  /api/accounts/invite/:token                        -> who it is for, QR code and key
//   POST /api/accounts/invite/:token    password + code     -> signed in, as verify-mfa
//   POST /api/accounts/forgot           email               -> { ok } (always the same; emails a reset link if the login exists)
//   GET  /api/accounts/reset/:token                         -> { email, expires_at } for the reset page
//   POST /api/accounts/reset/:token     password + code     -> signed in, as verify-mfa; other sessions signed out
//
// Errors are returned as { detail }, which the portal shows as written.

import { Router } from 'express';
import QRCode from 'qrcode';
import { config } from './config.js';
import {
  burnPasswordCheck, checkPassword, checkTotp, groupKey, hashPassword, hashToken, newToken, otpauthUrl,
} from './auth-crypto.js';
import {
  completeInvite, createPasswordReset, createSession, deleteAvatar, deleteExpiredSessions, deleteSession, deleteUserSessions, findInvite,
  findPasswordReset, forgetOldPasswordResets, usePasswordReset,
  findSessionUser, findUserByEmail, getAvatar, getUser, renewAccess, saveAvatar, setPassword, setTotpStep, touchLogin,
} from './portal-db.js';
import { UUID } from './db.js';
import { rateLimit } from './rate-limit.js';
import { HttpError } from './routes.js';
import { recordAudit } from './audit.js';
import { emailPasswordChanged, emailPasswordReset } from './email.js';
import { checkCsrf, clearSessionCookies, refreshToken, sessionToken, setSessionCookies } from './security.js';

const CHALLENGE_MS = 5 * 60_000;
const CODE_TRIES = 5;
const MIN_PASSWORD = 8;
const WRONG_LOGIN = 'The login ID or password is incorrect.';
const WRONG_CODE = 'The verification code is incorrect. Please ensure the time on your device is set correctly and try again.';
const LINK_GONE = 'This setup link has already been used or has expired. Please contact our support team to request a new one.';
const tooMany = (what) => rateLimit({ windowMs: 10 * 60_000, max: 10, detail: `Too many ${what} in a short time. Please wait a few minutes and try again.` });

// Password accepted, code still to come. Kept in memory: a restart only means typing the password again.
const challenges = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [key, c] of challenges) if (c.expires < now) challenges.delete(key);
}, 60_000).unref();

const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export function checkNewPassword(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) throw new HttpError(400, `Use at least ${MIN_PASSWORD} characters for the password.`);
  if (password.length > 200) throw new HttpError(400, 'That password is too long (200 characters at most).');
  return password;
}

// Starts a session: its tokens go into HttpOnly cookies, and the reply says only who signed in.
async function signIn(res, user) {
  const access = newToken();
  const refresh = newToken();
  const now = Date.now();
  await createSession({
    userId: user.id,
    accessHash: hashToken(access),
    accessExpires: new Date(now + config.portal.accessMinutes * 60_000),
    refreshHash: hashToken(refresh),
    refreshExpires: new Date(now + config.portal.refreshDays * 86_400_000),
  });
  await touchLogin(user.id);
  setSessionCookies(res, { access, refresh });
  return { email: user.email, name: user.name, role: user.role };
}

// The Owner is an admin who also sets clients' rates and has the Owner Panel: wherever admins are let in, so is
// the Owner. Rates are changed by the Owner alone (admin.js).
export const isAdminRole = (role) => role === 'admin' || role === 'owner';
const allows = (roles, role) => !roles.length || roles.includes(role) || (role === 'owner' && roles.includes('admin'));

// Puts the signed-in user on req.user. With roles given, only those roles get through (the Owner wherever 'admin' is).
// Already done for this request (an upload checked before its body was read): only the role is checked again.
export const requireUser = (...roles) => async (req, res, next) => {
  if (req.user) {
    if (!allows(roles, req.user.role)) throw new HttpError(403, 'You do not have permission to access this page.');
    return next();
  }
  const { token, viaCookie } = sessionToken(req);
  const user = token && await findSessionUser(hashToken(token));
  if (!user) throw new HttpError(401, 'Your session has expired. Please log in again.');
  if (!allows(roles, user.role)) throw new HttpError(403, 'You do not have permission to access this page.');
  checkCsrf(req, viaCookie);
  req.user = user;
  res.setHeader('Cache-Control', 'no-store');
  next();
};

export const profile = (u) => {
  const [first = '', ...rest] = (u.name || '').split(' ');
  return {
    id: u.id, email: u.email, name: u.name, first_name: first, last_name: rest.join(' '), company: u.company, role: u.role,
    avatar_version: u.avatar_version ?? null,
  };
};

export function startSessionCleanup() {
  setInterval(() => deleteExpiredSessions().catch((err) => console.error('[portal] session cleanup failed:', err.message)), 3_600_000).unref();
}

export const accountsRouter = Router();

accountsRouter.post('/login', tooMany('log in attempts'), async (req, res) => {
  const email = str(req.body?.email, 200).toLowerCase();
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!email || !password) throw new HttpError(400, 'Please enter your login ID and password.');

  const user = await findUserByEmail(email);
  const ok = user?.password_hash ? await checkPassword(password, user.password_hash) : await burnPasswordCheck(password);
  // Failed sign-ins go in the audit trail, under the login tried (known or not).
  const failed = (reason, status) => recordAudit('auth.login_failed', { req, user, email, details: { reason }, status });
  if (!ok) {
    await failed('password', 401);
    throw new HttpError(401, WRONG_LOGIN);
  }
  if (user.status === 'disabled') {
    await failed('turned off', 403);
    throw new HttpError(403, 'This account has been deactivated. Please contact our support team for assistance.');
  }

  const temp = newToken();
  challenges.set(hashToken(temp), { userId: user.id, expires: Date.now() + CHALLENGE_MS, tries: 0 });
  res.json({ mfa_required: true, temp_token: temp });
});

accountsRouter.post('/verify-mfa', tooMany('codes'), async (req, res) => {
  const key = hashToken(str(req.body?.temp_token));
  const challenge = challenges.get(key);
  if (!challenge || challenge.expires < Date.now()) {
    challenges.delete(key);
    throw new HttpError(401, 'Your sign-in session has expired. Please enter your password again.');
  }
  const user = await getUser(challenge.userId);
  if (!user || user.status !== 'active') throw new HttpError(401, WRONG_LOGIN);

  const step = checkTotp(user.totp_secret, req.body?.token, Number(user.totp_last_step));
  if (!step) {
    if (++challenge.tries >= CODE_TRIES) challenges.delete(key);
    await recordAudit('auth.login_failed', { req, user, details: { reason: 'code' }, status: 401 });
    throw new HttpError(401, WRONG_CODE);
  }
  challenges.delete(key);
  await setTotpStep(user.id, step);
  const session = await signIn(res, user);
  await recordAudit('auth.login', { req, user, status: 200 });
  res.json(session);
});

// A new session cookie from the refresh cookie (sent only to this address). The refresh token itself stays.
accountsRouter.post('/refresh', rateLimit({ windowMs: 10 * 60_000, max: 60, detail: 'Too many session renewals. Please wait a few minutes and log in again.' }), async (req, res) => {
  const access = newToken();
  const refresh = refreshToken(req);
  const renewed = refresh && await renewAccess(hashToken(refresh), hashToken(access),
    new Date(Date.now() + config.portal.accessMinutes * 60_000));
  if (!renewed) {
    clearSessionCookies(res);
    throw new HttpError(401, 'Please log in again.');
  }
  setSessionCookies(res, { access });
  res.json({ ok: true });
});

accountsRouter.post('/logout', requireUser(), async (req, res) => {
  await deleteSession(req.user.session_id);
  clearSessionCookies(res);
  res.json({ ok: true });
});

accountsRouter.get('/me', requireUser(), (req, res) => res.json(profile(req.user)));

// Two calls: without `code` it checks the passwords and answers { code_required: true }; with the code from
// the authenticator app it changes the password. Nothing changes without a valid code.
accountsRouter.post('/change-password', requireUser(), tooMany('password changes'), async (req, res) => {
  const current = typeof req.body?.current_password === 'string' ? req.body.current_password : '';
  const next = checkNewPassword(req.body?.new_password);
  if (!await checkPassword(current, req.user.password_hash)) throw new HttpError(400, 'Your current password is incorrect.');
  if (req.body?.code === undefined || req.body.code === '') return res.json({ code_required: true });
  const step = checkTotp(req.user.totp_secret, req.body.code, Number(req.user.totp_last_step));
  if (!step) throw new HttpError(400, WRONG_CODE);
  await setTotpStep(req.user.id, step);
  await setPassword(req.user.id, await hashPassword(next));
  await deleteUserSessions(req.user.id, req.user.session_id); // other devices sign in again
  noticePasswordChanged(req.user, 'changed');
  res.json({ ok: true });
});

// The owner hears about every password change, in case it was not them. A failed email never undoes it.
function noticePasswordChanged(user, how) {
  emailPasswordChanged({ name: user.name, email: user.email, when: new Date(), how })
    .catch((err) => console.error(`[email] could not send the password-change notice to ${user.email}:`, err.message));
}

// ── forgotten passwords ──────────────────────────────────────────────────────

const RESET_GONE = 'This reset link has already been used or has expired. Please request a new one from the login page.';
const RESET_SENT = 'If an account exists for this login ID, we have sent an email with a link to reset the password. The link is valid for a limited time.';
const RESETS_PER_HOUR = 3; // per login ID, on top of the per-IP limit, so nobody can flood an inbox
const resetsFor = new Map();
setInterval(() => {
  const hourAgo = Date.now() - 3_600_000;
  for (const [email, times] of resetsFor) if (!times.some((t) => t > hourAgo)) resetsFor.delete(email);
  forgetOldPasswordResets().catch(() => {});
}, 600_000).unref();

// Always answers the same, so the form cannot be used to find out which emails have a login.
accountsRouter.post('/forgot', rateLimit({ windowMs: 10 * 60_000, max: 5, detail: 'Too many reset requests in a short period. Please wait a few minutes and try again.' }), async (req, res) => {
  const email = str(req.body?.email, 200).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new HttpError(400, 'Please enter a valid login ID (your email address).');
  res.json({ ok: true, message: RESET_SENT });

  const recent = (resetsFor.get(email) || []).filter((t) => t > Date.now() - 3_600_000);
  if (recent.length >= RESETS_PER_HOUR) return;
  resetsFor.set(email, [...recent, Date.now()]);

  const user = await findUserByEmail(email);
  // Only logins in use get a link: not ones still waiting for their setup link, nor deactivated ones.
  if (!user || user.status !== 'active' || !user.password_hash) {
    await recordAudit('auth.reset_requested', { req, user, email, details: { sent: false }, status: 200 });
    return;
  }
  const token = newToken();
  const expiresAt = new Date(Date.now() + config.portal.resetMinutes * 60_000);
  await createPasswordReset(user.id, { tokenHash: hashToken(token), expiresAt });
  const link = `${config.portalUrl}/reset?token=${encodeURIComponent(token)}`;
  let sent = false;
  try {
    sent = await emailPasswordReset({ name: user.name, email: user.email, link, expiresAt });
  } catch (err) {
    console.error(`[email] could not send the reset link to ${user.email}:`, err.message);
  }
  await recordAudit('auth.reset_requested', { req, user, details: { sent }, status: 200 });
});

async function openReset(token) {
  const reset = await findPasswordReset(hashToken(token));
  if (!reset || reset.used_at || reset.expires_at < new Date() || reset.status !== 'active' || !reset.set_up) throw new HttpError(410, RESET_GONE);
  return reset;
}

accountsRouter.get('/reset/:token', tooMany('requests'), async (req, res) => {
  const reset = await openReset(req.params.token);
  res.setHeader('Cache-Control', 'no-store');
  res.json({ email: reset.email, name: reset.name, expires_at: reset.expires_at });
});

accountsRouter.post('/reset/:token', tooMany('attempts'), async (req, res) => {
  const reset = await openReset(req.params.token);
  const password = checkNewPassword(req.body?.password);
  const user = await getUser(reset.user_id);
  // The authenticator code is still needed: a link from a mailbox alone cannot take over the login.
  const step = checkTotp(user.totp_secret, req.body?.code, Number(user.totp_last_step));
  if (!step) {
    await recordAudit('auth.reset_failed', { req, user, details: { reason: 'code' }, status: 400 });
    throw new HttpError(400, WRONG_CODE);
  }
  if (!await usePasswordReset(hashToken(req.params.token))) throw new HttpError(410, RESET_GONE);

  await setTotpStep(user.id, step);
  await setPassword(user.id, await hashPassword(password));
  await deleteUserSessions(user.id); // every device signs in again with the new password
  const session = await signIn(res, user);
  await recordAudit('auth.password_reset', { req, user, status: 200 });
  noticePasswordChanged(user, 'reset');
  res.json(session);
});

// ── profile photos ───────────────────────────────────────────────────────────

export const MAX_AVATAR_BYTES = 512 * 1024;

// The image type from its first bytes. Only these three: no SVG, which can carry scripts.
function imageType(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length > 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

accountsRouter.put('/avatar', requireUser(), tooMany('photo changes'), async (req, res) => {
  const content = Buffer.from(typeof req.body?.content_base64 === 'string' ? req.body.content_base64 : '', 'base64');
  if (!content.length) throw new HttpError(400, 'Please select an image to upload.');
  if (content.length > MAX_AVATAR_BYTES) throw new HttpError(413, 'This image is too large. Please select a smaller file.');
  const type = imageType(content);
  if (!type) throw new HttpError(400, 'Please upload a JPG, PNG or WebP image.');
  const saved = await saveAvatar(req.user.id, type, content);
  res.json({ avatar_version: saved.avatar_version });
});

accountsRouter.delete('/avatar', requireUser(), async (req, res) => {
  await deleteAvatar(req.user.id);
  res.json({ avatar_version: null });
});

// Your own photo; staff and admins can also see customers' photos (and admins everyone's).
accountsRouter.get('/avatar/:userId', requireUser(), async (req, res) => {
  const { userId } = req.params;
  const self = userId === req.user.id;
  let allowed = self || isAdminRole(req.user.role);
  if (!allowed && req.user.role === 'staff' && UUID.test(userId)) allowed = (await getUser(userId))?.role === 'customer';
  const avatar = allowed && UUID.test(userId) && await getAvatar(userId);
  if (!avatar) throw new HttpError(404, 'No photo.');
  res.setHeader('Content-Type', avatar.content_type);
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'");
  res.send(avatar.content);
});

// ── setup links ──────────────────────────────────────────────────────────────

async function openInvite(token) {
  const invite = await findInvite(hashToken(token));
  if (!invite || invite.used_at || invite.expires_at < new Date() || invite.status === 'disabled') throw new HttpError(410, LINK_GONE);
  return invite;
}

accountsRouter.get('/invite/:token', tooMany('requests'), async (req, res) => {
  const invite = await openInvite(req.params.token);
  const url = otpauthUrl(invite.totp_secret, invite.email);
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    email: invite.email,
    name: invite.name,
    company: invite.company,
    role: invite.role,
    expires_at: invite.expires_at,
    secret: groupKey(invite.totp_secret),
    otpauth_url: url,
    qr_svg: await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }),
  });
});

accountsRouter.post('/invite/:token', tooMany('attempts'), async (req, res) => {
  const tokenHash = hashToken(req.params.token);
  const invite = await openInvite(req.params.token);
  const password = checkNewPassword(req.body?.password);
  const step = checkTotp(invite.totp_secret, req.body?.code);
  if (!step) throw new HttpError(400, 'The verification code is incorrect. Please rescan the QR code or ensure the time on your device is set correctly.');

  const userId = await completeInvite(tokenHash, { passwordHash: await hashPassword(password), step });
  if (!userId) throw new HttpError(410, LINK_GONE);
  const user = await getUser(userId);
  const session = await signIn(res, user);
  await recordAudit('auth.setup', { req, user, status: 200 });
  res.json(session);
});
