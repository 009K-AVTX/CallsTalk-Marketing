// Passwords (scrypt), one-time codes (TOTP, RFC 6238) and random tokens, on Node's own crypto.

import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

// ── passwords ────────────────────────────────────────────────────────────────

const N = 16384, R = 8, P = 1, KEYLEN = 64;

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scryptAsync(password.normalize('NFKC'), salt, KEYLEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function checkPassword(password, stored) {
  const [kind, n, r, p, salt, key] = (stored || '').split('$');
  if (kind !== 'scrypt' || !key) return false;
  const expected = Buffer.from(key, 'base64');
  const actual = await scryptAsync(password.normalize('NFKC'), Buffer.from(salt, 'base64'), expected.length,
    { N: Number(n), r: Number(r), p: Number(p) });
  return timingSafeEqual(actual, expected);
}

// Same work as a real check, so a missing login takes as long to refuse as a wrong password.
const DUMMY = await hashPassword(randomBytes(12).toString('hex'));
export const burnPasswordCheck = (password) => checkPassword(password, DUMMY).then(() => false);

// ── one-time codes ───────────────────────────────────────────────────────────

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP = 30;
const DIGITS = 6;

function base32(buf) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function unbase32(s) {
  const bytes = [];
  let bits = 0, value = 0;
  for (const ch of s.replace(/[\s=]/g, '').toUpperCase()) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) continue;
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export const newTotpSecret = () => base32(randomBytes(20));

export function totpCode(secret, step = Math.floor(Date.now() / 1000 / STEP)) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac('sha1', unbase32(secret)).update(counter).digest();
  const at = mac[mac.length - 1] & 15;
  const n = (mac.readUInt32BE(at) & 0x7fffffff) % 10 ** DIGITS;
  return String(n).padStart(DIGITS, '0');
}

// Returns the time step the code belongs to (one step either side allowed for clock drift),
// or null. Callers store it so the same code cannot be used twice.
export function checkTotp(secret, code, lastStep = 0) {
  const given = String(code || '').replace(/\D/g, '');
  if (given.length !== DIGITS) return null;
  const now = Math.floor(Date.now() / 1000 / STEP);
  for (const step of [now, now - 1, now + 1]) {
    if (step <= lastStep) continue;
    if (timingSafeEqual(Buffer.from(totpCode(secret, step)), Buffer.from(given))) return step;
  }
  return null;
}

// What authenticator apps scan: otpauth://totp/CallsTalk:jane@acme.com?secret=...&issuer=CallsTalk
export const otpauthUrl = (secret, email, issuer = 'CallsTalk') =>
  `otpauth://totp/${encodeURIComponent(`${issuer}:${email}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP}`;

// The key in groups of four, as people type it into an app.
export const groupKey = (secret) => secret.match(/.{1,4}/g).join(' ');

// ── tokens ───────────────────────────────────────────────────────────────────

export const newToken = () => randomBytes(32).toString('base64url');
// Only hashes of tokens are stored, so a copy of the database cannot be used to sign in.
export const hashToken = (token) => createHash('sha256').update(String(token)).digest('hex');
