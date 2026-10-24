// What keeps the portal's API hard to misuse from a browser:
//  - Sessions live in HttpOnly cookies, so no script on the page (ours, an extension's, or injected) can read
//    the tokens. The portal keeps only the login's email and role in its own storage, for drawing the page.
//  - Changes sent with those cookies must come from our own pages: the Origin has to be ours, and the portal
//    adds an X-CallsTalk header, which another site cannot send without our CORS allowing it.
//  - API replies carry headers that stop them being framed, sniffed, cached or read cross-site.

import { config } from './config.js';
import { HttpError } from './routes.js';

// __Host- cookies are only accepted over HTTPS, for this exact host and path /: nothing else can set or read
// them. Local development is plain http, so it uses plain names.
const secure = !config.isDev;
export const ACCESS_COOKIE = secure ? '__Host-ct_session' : 'ct_session';
export const REFRESH_COOKIE = secure ? '__Secure-ct_refresh' : 'ct_refresh';
const REFRESH_PATH = '/api/accounts/refresh';

export const CSRF_HEADER = 'x-callstalk';

export function readCookies(req) {
  const out = {};
  for (const part of (req.get('cookie') || '').split(';')) {
    const at = part.indexOf('=');
    if (at < 1) continue;
    const name = part.slice(0, at).trim();
    if (!(name in out)) out[name] = decodeURIComponent(part.slice(at + 1).trim());
  }
  return out;
}

function cookie(name, value, { maxAge, path = '/' }) {
  return [
    `${name}=${encodeURIComponent(value)}`, `Path=${path}`, `Max-Age=${maxAge}`, 'HttpOnly', 'SameSite=Strict', ...(secure ? ['Secure'] : []),
  ].join('; ');
}

export function setSessionCookies(res, { access, refresh }) {
  const list = [];
  if (access) list.push(cookie(ACCESS_COOKIE, access, { maxAge: config.portal.accessMinutes * 60 }));
  if (refresh) list.push(cookie(REFRESH_COOKIE, refresh, { maxAge: config.portal.refreshDays * 86_400, path: REFRESH_PATH }));
  res.append('Set-Cookie', list);
}

export function clearSessionCookies(res) {
  res.append('Set-Cookie', [cookie(ACCESS_COOKIE, '', { maxAge: 0 }), cookie(REFRESH_COOKIE, '', { maxAge: 0, path: REFRESH_PATH })]);
}

// The token a request is signed in with: the session cookie, else an Authorization header (scripts).
// `viaCookie` says which, for the cross-site check.
export function sessionToken(req) {
  const token = readCookies(req)[ACCESS_COOKIE];
  if (token) return { token, viaCookie: true };
  const bearer = /^Bearer (.+)$/.exec(req.get('authorization') || '')?.[1];
  return { token: bearer || null, viaCookie: false };
}
export const refreshToken = (req) => readCookies(req)[REFRESH_COOKIE] || '';

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const ownOrigin = (req) => `${req.protocol}://${req.get('host')}`;

// Our own pages: the portal and the site (as configured), the other allowed origins, and the address the request
// came in on. The last is not enough by itself: a proxy in front may change the Host (Vite's dev proxy does).
const OUR_ORIGINS = new Set([config.portalUrl, config.publicUrl, ...config.corsOrigins].filter(Boolean));
// While developing, any page on this computer (localhost, 127.0.0.1, [::1], any port) counts as ours.
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
const ours = (req, origin) => origin === ownOrigin(req) || OUR_ORIGINS.has(origin) || (config.isDev && LOCAL.test(origin));

// Changes from a browser must come from one of our own pages. Requests without an Origin (servers, such as the
// payment provider's webhook, and curl) are not browsers acting for someone, and carry no session cookie.
export function sameOriginOnly(req, res, next) {
  if (!UNSAFE.has(req.method)) return next();
  const origin = req.get('origin')?.replace(/\/$/, '');
  if (origin && !ours(req, origin)) {
    throw new HttpError(403, 'This request did not come from the CallsTalk portal.');
  }
  next();
}

// For requireUser: a change signed in by cookie must also carry the portal's own header.
export function checkCsrf(req, viaCookie) {
  if (viaCookie && UNSAFE.has(req.method) && req.get(CSRF_HEADER) !== '1') {
    throw new HttpError(403, 'This request did not come from the CallsTalk portal.');
  }
}

// Headers on every API reply: nothing here is a page to frame, a file to sniff or something to cache.
export function apiHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  if (!res.getHeader('Cache-Control')) res.setHeader('Cache-Control', 'no-store');
  next();
}
