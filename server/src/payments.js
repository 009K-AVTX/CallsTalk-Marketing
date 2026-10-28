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
import { findWalletOwners, getUser, getWallet, saveProviderPayment, saveWallet } from './portal-db.js';
import { recordAudit } from './audit.js';
import { buyerName } from './format.js';
import { paymentReceived } from './billing-notices.js';

const PROVIDER = 'wellwallet';
const NETWORK = 'trx';
const CURRENCY = 'USDT';
// The transaction list says "completed"; webhooks say "confirmed".
const STATUS = { in_progress: 'pending', pending: 'pending', completed: 'completed', confirmed: 'completed', error: 'failed', failed: 'failed' };
// Any other word counts as pending, and is logged once so it can be added above: otherwise a completed deposit
// would wait as pending with nothing to say why.
const unknownStatuses = new Set();
function statusOf(t) {
  const status = STATUS[String(t.status ?? '').trim().toLowerCase()];
  if (!status && !unknownStatuses.has(t.status)) {
    unknownStatuses.add(t.status);
    console.warn(`[payments] Well Wallet gave the unknown status "${t.status}" for ${t.hash.slice(0, 12)}…: counted as pending`);
  }
  return status || 'pending';
}
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
  const raw = await res.text();
  let data;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = null;
  }
  // A bare body (e.g. "403") comes from Well Wallet's edge: this server's IP is not on their allowlist.
  if (!data || typeof data !== 'object') {
    throw new Error(res.ok
      ? `${method} ${path}: the reply was not JSON (HTTP ${res.status})`
      : `${method} ${path}: blocked (HTTP ${res.status}), is this server's IP on Well Wallet's allowlist?`);
  }
  // The live API answers errors in camelCase (errorMessage/errorCode), the docs in snake_case: read both.
  const code = data.errorCode ?? data.error_code;
  if (!res.ok || code) {
    const why = data.errorMessage || data.error_message || data.message || `HTTP ${res.status}`;
    const hint = method === 'POST' && path === '/wallets' && res.status === 404 ? ' (the account may be at its 500-wallet limit)' : '';
    throw new Error(`${method} ${path}: ${Array.isArray(why) ? why.join(', ') : why}${hint}`);
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

const PAGE = 300; // the largest page the API gives
// At most 3,000 transfers per check, to stay well inside the account's 10,000 requests a day.
const MAX_PAGES = 10;

// All incoming USDT transfers that match, page by page. The account may be shared with other bots (TOPUP),
// so there can be more than one page. A transfer that arrives meanwhile only repeats one, which is harmless.
async function incomingTransfers(search) {
  const list = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const data = await api('GET', '/transactions', {
      query: {
        direction: 'in', network: NETWORK, currency: CURRENCY, search,
        created_from: search ? undefined : new Date(Date.now() - 3 * 86_400_000).toISOString(),
        sort_by: 'created_at', sort_direction: 'desc', limit: PAGE, offset: page * PAGE,
      },
    });
    const batch = Array.isArray(data) ? data : data?.transactions ?? data?.items ?? [];
    list.push(...batch);
    if (batch.length < PAGE || (data?.count != null && list.length >= Number(data.count))) return list;
  }
  console.warn(`[payments] more than ${MAX_PAGES * PAGE} incoming transfers in 3 days: only the newest were checked`);
  return list;
}

// Reads incoming USDT transfers from the API and records the ones sent to a customer's address.
// `search` narrows it to one transaction hash (a webhook); without it, the last few days are checked.
export async function syncDeposits({ search } = {}) {
  if (!paymentsEnabled) return 0;
  const list = await incomingTransfers(search);
  const deposits = list.filter((t) => t.direction === 'in' && t.currency === CURRENCY && t.hash && Number(t.amount) > 0);
  if (!deposits.length) return 0;

  const owners = await findWalletOwners(deposits.map((t) => t.recipient_wallet));
  let saved = 0;
  for (const t of deposits) {
    const userId = owners.get(t.recipient_wallet);
    if (!userId) continue; // a transfer to one of our own wallets that is not a customer's
    const status = statusOf(t);
    const changed = await saveProviderPayment(userId, {
      provider: PROVIDER,
      reference: t.hash,
      amount: Number(t.amount).toFixed(2),
      currency: 'USD', // USDT is counted one to one in US dollars
      status,
      note: 'USDT (TRC-20)',
      paid_at: when(t.created_at),
    });
    if (changed) {
      saved++;
      // The team and the buyer hear of it once it completes (billing-notices.js); a pending one is shown in the summary.
      if (status === 'completed') {
        paymentReceived(userId, {
          amount: Number(t.amount).toFixed(2), method: 'USDT (TRC-20)', at: when(t.created_at), hash: t.hash, sender: t.sender_wallet,
        });
      }
      console.log(`[payments] ${t.amount} USDT ${status} (Well Wallet: ${t.status}) for customer ${userId} (${t.hash.slice(0, 12)}…)`);
      // In the audit trail as the system's doing: no one in the team entered it. Once when first seen and again when
      // its status changes; the log shows older entries with the payment's status now (audit.js).
      const owner = await getUser(userId);
      await recordAudit('payment.deposit', {
        target: { id: userId, label: buyerName(owner) },
        details: { amount: Number(t.amount).toFixed(2), status, reference: t.hash, method: 'USDT (TRC-20)' },
      });
    }
  }
  return saved;
}

export function startPaymentSync() {
  if (!paymentsEnabled) return console.log('[payments] WELLWALLET_API_TOKEN is not set: online payment is off');
  // A lasting failure (a missing permission, say) is logged once, not on every check, and so is the recovery.
  let failing = '';
  const run = () => syncDeposits().then(() => {
    if (failing) console.log('[payments] deposit checks work again');
    failing = '';
  }, (err) => {
    if (err.message !== failing) console.error('[payments] could not check deposits:', err.message, '(logged again only if this changes)');
    failing = err.message;
  });
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
  res.json({ result: 'success' }); // answer at once (Well Wallet retries otherwise); the check below reads the API
  const tx = req.body?.data ?? req.body; // sent as { data: {...} } in practice, unwrapped in the docs
  const hash = typeof tx?.hash === 'string' && /^[0-9a-fA-F]{16,128}$/.test(tx.hash) ? tx.hash : undefined;
  if (tx?.direction === 'in' || !tx?.direction) {
    syncDeposits({ search: hash }).catch((err) => console.error('[payments] webhook check failed:', err.message));
  }
});
