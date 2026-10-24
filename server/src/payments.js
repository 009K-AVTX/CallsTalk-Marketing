// Customer payments in USDT on the TRON network (TRC-20), through Well Wallet (docs.wellwallet.io).
//
// Each customer gets their own deposit address, made the first time they press Pay and kept for good, so
// every deposit to it is theirs. Deposits are read back from the Well Wallet API, never taken from a
// webhook's body: a webhook (from Well Wallet's published IPs) only asks for a check, and a timer checks
// every few minutes as well. In-progress deposits show as pending; completed ones count towards the balance.
// The portal never names the provider.
//
//   POST /api/payments/webhook?key=...   Well Wallet's deposit notification (set this URL in their bot)

import { Router } from 'express';
import QRCode from 'qrcode';
import { config } from './config.js';
import { findWalletOwners, getWallet, saveProviderPayment, saveWallet } from './portal-db.js';

const PROVIDER = 'wellwallet';
const NETWORK = 'trx';
const CURRENCY = 'USDT';
const STATUS = { in_progress: 'pending', completed: 'completed', error: 'failed' };
// Webhooks only come from these addresses (docs.wellwallet.io/webhook).
const WEBHOOK_IPS = ['54.171.15.37', '108.128.68.222', '63.33.226.230'];

const { apiUrl, token, webhookKey, walletType, pollSeconds } = config.payments;
export const paymentsEnabled = Boolean(token);

async function api(method, path, { query, body } = {}) {
  const url = new URL(`${apiUrl}${path}`);
  for (const [k, v] of Object.entries(query || {})) if (v !== undefined && v !== '') url.searchParams.set(k, v);
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', token },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error_code) {
    const why = data.error_message || data.message || `HTTP ${res.status}`;
    throw new Error(`${method} ${path}: ${Array.isArray(why) ? why.join(', ') : why}`);
  }
  return data.data;
}

// ── deposit addresses ────────────────────────────────────────────────────────

const making = new Map(); // one address per customer, even if Pay is pressed twice at once

export async function depositAddress(user) {
  const saved = await getWallet(user.id);
  if (saved) return saved.address;
  if (!making.has(user.id)) {
    making.set(user.id, (async () => {
      const wallet = await api('POST', '/wallets', {
        body: { name: `CallsTalk ${user.company || user.name || user.email}`.slice(0, 60), network: NETWORK, type: walletType },
      });
      if (!wallet?.address) throw new Error('POST /wallets: no address in the reply');
      await saveWallet(user.id, { provider: PROVIDER, network: NETWORK, address: wallet.address });
      console.log(`[payments] TRC-20 address made for ${user.email}`);
      return wallet.address;
    })().finally(() => making.delete(user.id)));
  }
  return making.get(user.id);
}

// What the customer sees: where to send, and how much (the amount is only a guide; any deposit counts).
export async function paymentDetails(user, amount) {
  const address = await depositAddress(user);
  return {
    method: 'usdt_trc20',
    currency: CURRENCY,
    network: 'TRON (TRC-20)',
    address,
    amount,
    // The bare address: wallet apps read it for TRC-20 tokens, amounts in the code are not widely supported.
    qr_svg: await QRCode.toString(address, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }),
  };
}

// ── crediting deposits ───────────────────────────────────────────────────────

// "2026-06-15 12:02:37.869609+00" -> a Date (now, if it cannot be read).
function when(s) {
  const d = new Date(String(s || '').replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00'));
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

// Reads incoming USDT transfers from the API and records the ones sent to a customer's address.
// `search` narrows it to one transaction hash (a webhook); without it, the last few days are checked.
export async function syncDeposits({ search } = {}) {
  if (!paymentsEnabled) return 0;
  const data = await api('GET', '/transactions', {
    query: {
      direction: 'in', network: NETWORK, currency: CURRENCY, search,
      created_from: search ? undefined : new Date(Date.now() - 3 * 86_400_000).toISOString(),
      sort_by: 'created_at', sort_direction: 'desc', limit: 300,
    },
  });
  const deposits = (data?.transactions || []).filter((t) => t.direction === 'in' && t.currency === CURRENCY && t.hash && Number(t.amount) > 0);
  if (!deposits.length) return 0;

  const owners = await findWalletOwners(deposits.map((t) => t.recipient_wallet));
  let saved = 0;
  for (const t of deposits) {
    const userId = owners.get(t.recipient_wallet);
    if (!userId) continue; // a transfer to one of our own wallets that is not a customer's
    const changed = await saveProviderPayment(userId, {
      provider: PROVIDER,
      reference: t.hash,
      amount: Number(t.amount).toFixed(2),
      currency: 'USD', // USDT is counted one to one in US dollars
      status: STATUS[t.status] || 'pending',
      note: 'USDT (TRC-20)',
      paid_at: when(t.created_at),
    });
    if (changed) {
      saved++;
      console.log(`[payments] ${t.amount} USDT ${STATUS[t.status] || t.status} for customer ${userId} (${t.hash.slice(0, 12)}…)`);
    }
  }
  return saved;
}

export function startPaymentSync() {
  if (!paymentsEnabled) return console.log('[payments] WELLWALLET_API_TOKEN is not set: online payment is off');
  const run = () => syncDeposits().catch((err) => console.error('[payments] could not check deposits:', err.message));
  run();
  setInterval(run, pollSeconds * 1000).unref();
}

export const paymentsRouter = Router();

paymentsRouter.post('/webhook', async (req, res) => {
  if (!paymentsEnabled || !webhookKey || req.query.key !== webhookKey) return res.status(404).json({ detail: 'Not found.' });
  if (!WEBHOOK_IPS.includes(req.ip?.replace(/^::ffff:/, ''))) {
    console.warn(`[payments] webhook refused from ${req.ip}`);
    return res.status(403).json({ detail: 'Forbidden.' });
  }
  res.json({ ok: true }); // answer at once; the check below reads the transaction from the API
  const hash = typeof req.body?.hash === 'string' && /^[0-9a-fA-F]{16,128}$/.test(req.body.hash) ? req.body.hash : undefined;
  if (req.body?.direction === 'in' || !req.body?.direction) {
    syncDeposits({ search: hash }).catch((err) => console.error('[payments] webhook check failed:', err.message));
  }
});
