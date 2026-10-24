// Portal logins (portal/ in the site, src/lib/portal.js). Every login has a password and an
// authenticator app; both are set on the one-use setup link our team sends.
//
//   POST /api/accounts/login            email + password    -> { mfa_required, temp_token }
//   POST /api/accounts/verify-mfa       temp_token + token  -> { access, refresh, email, role }
//   POST /api/accounts/refresh          refresh             -> { access }
//   POST /api/accounts/logout           (Bearer)            -> { ok }
//   GET  /api/accounts/me               (Bearer)            -> profile
//   POST /api/accounts/change-password  (Bearer) current_password, new_password -> { code_required }
//                                        ... and again with code (authenticator) -> { ok }
//   PUT  /api/accounts/avatar           (Bearer) content_base64 (JPG, PNG or WebP) -> { avatar_version }
//   DELETE /api/accounts/avatar         (Bearer)            -> { avatar_version: null }
//   GET  /api/accounts/avatar/:userId   (Bearer)            -> the photo (own; staff: customers'; admin: all)
//   GET  /api/accounts/invite/:token                        -> who it is for, QR code and key
//   POST /api/accounts/invite/:token    password + code     -> signed in, as verify-mfa
//
// Errors are returned as { detail }, which the portal shows as written.

import { Router } from 'express';
import QRCode from 'qrcode';
import { config } from './config.js';
import {
  burnPasswordCheck, checkPassword, checkTotp, groupKey, hashPassword, hashToken, newToken, otpauthUrl,
} from './auth-crypto.js';
import {
  completeInvite, createSession, deleteAvatar, deleteExpiredSessions, deleteSession, deleteUserSessions, findInvite,
  findSessionUser, findUserByEmail, getAvatar, getUser, renewAccess, saveAvatar, setPassword, setTotpStep, touchLogin,
} from './portal-db.js';
import { UUID } from './db.js';
import { rateLimit } from './rate-limit.js';
import { HttpError } from './routes.js';

const CHALLENGE_MS = 5 * 60_000;
const CODE_TRIES = 5;
const MIN_PASSWORD = 8;
const WRONG_LOGIN = 'The login ID or password is not correct.';
const WRONG_CODE = 'That code is not correct. Check that the time on your phone is right and try again.';
const LINK_GONE = 'This setup link has already been used or has expired. Ask our team for a new one.';
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

async function signIn(user) {
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
  return { access, refresh, email: user.email, name: user.name, role: user.role };
}

const bearer = (req) => /^Bearer (.+)$/.exec(req.get('authorization') || '')?.[1];

// Puts the signed-in user on req.user. With roles given, only those roles get through.
export const requireUser = (...roles) => async (req, res, next) => {
  const token = bearer(req);
  const user = token && await findSessionUser(hashToken(token));
  if (!user) throw new HttpError(401, 'Please log in again.');
  if (roles.length && !roles.includes(user.role)) throw new HttpError(403, 'This login cannot open that page.');
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
  if (!ok) throw new HttpError(401, WRONG_LOGIN);
  if (user.status === 'disabled') throw new HttpError(403, 'This login is turned off. Contact us if you need it back.');

  const temp = newToken();
  challenges.set(hashToken(temp), { userId: user.id, expires: Date.now() + CHALLENGE_MS, tries: 0 });
  res.json({ mfa_required: true, temp_token: temp });
});

accountsRouter.post('/verify-mfa', tooMany('codes'), async (req, res) => {
  const key = hashToken(str(req.body?.temp_token));
  const challenge = challenges.get(key);
  if (!challenge || challenge.expires < Date.now()) {
    challenges.delete(key);
    throw new HttpError(401, 'Your sign-in timed out. Please enter your password again.');
  }
  const user = await getUser(challenge.userId);
  if (!user || user.status !== 'active') throw new HttpError(401, WRONG_LOGIN);

  const step = checkTotp(user.totp_secret, req.body?.token, Number(user.totp_last_step));
  if (!step) {
    if (++challenge.tries >= CODE_TRIES) challenges.delete(key);
    throw new HttpError(401, WRONG_CODE);
  }
  challenges.delete(key);
  await setTotpStep(user.id, step);
  res.json(await signIn(user));
});

accountsRouter.post('/refresh', async (req, res) => {
  const access = newToken();
  const renewed = await renewAccess(hashToken(str(req.body?.refresh)), hashToken(access),
    new Date(Date.now() + config.portal.accessMinutes * 60_000));
  if (!renewed) throw new HttpError(401, 'Please log in again.');
  res.json({ access });
});

accountsRouter.post('/logout', requireUser(), async (req, res) => {
  await deleteSession(req.user.session_id);
  res.json({ ok: true });
});

accountsRouter.get('/me', requireUser(), (req, res) => res.json(profile(req.user)));

// Two calls: without `code` it checks the passwords and answers { code_required: true }; with the code from
// the authenticator app it changes the password. Nothing changes without a valid code.
accountsRouter.post('/change-password', requireUser(), tooMany('password changes'), async (req, res) => {
  const current = typeof req.body?.current_password === 'string' ? req.body.current_password : '';
  const next = checkNewPassword(req.body?.new_password);
  if (!await checkPassword(current, req.user.password_hash)) throw new HttpError(400, 'Your current password is not correct.');
  if (req.body?.code === undefined || req.body.code === '') return res.json({ code_required: true });
  const step = checkTotp(req.user.totp_secret, req.body.code, Number(req.user.totp_last_step));
  if (!step) throw new HttpError(400, WRONG_CODE);
  await setTotpStep(req.user.id, step);
  await setPassword(req.user.id, await hashPassword(next));
  await deleteUserSessions(req.user.id, req.user.session_id); // other devices sign in again
  res.json({ ok: true });
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
  if (!content.length) throw new HttpError(400, 'Choose a photo to upload.');
  if (content.length > MAX_AVATAR_BYTES) throw new HttpError(413, 'That photo is too large. Try a smaller one.');
  const type = imageType(content);
  if (!type) throw new HttpError(400, 'Use a JPG, PNG or WebP photo.');
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
  let allowed = self || req.user.role === 'admin';
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
  if (!step) throw new HttpError(400, 'That code is not correct. Scan the QR code again, or check that the time on your phone is right.');

  const userId = await completeInvite(tokenHash, { passwordHash: await hashPassword(password), step });
  if (!userId) throw new HttpError(410, LINK_GONE);
  res.json(await signIn(await getUser(userId)));
});
