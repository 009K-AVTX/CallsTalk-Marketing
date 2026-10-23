// Request-access form: validates the submission, pings the team on Telegram and emails the full
// request for review. Env (Vercel project):
//   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, optional TELEGRAM_THREAD_ID   -> Telegram notification
//   RESEND_API_KEY, ACCESS_REQUEST_EMAIL_TO, ACCESS_REQUEST_EMAIL_FROM  -> review email (resend.com)
// The request counts as received when at least one channel delivers it.

const LIMITS = { name: 80, email: 120, company: 120, phone: 40, volume: 40, message: 1000 };
const VOLUMES = ['Under 100', '100–1,000', '1,000–10,000', 'Over 10,000'];

// Light per-instance throttle: 5 requests per IP every 10 minutes.
const hits = new Map();
function throttled(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 5;
}

const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const body = req.body || {};
  // Bots fill the hidden field; pretend success so they move on.
  if (body.website) return res.status(200).json({ ok: true });

  const data = Object.fromEntries(Object.entries(LIMITS).map(([k, max]) => [k, clean(body[k], max)]));
  if (!data.name || !data.email || !data.company) {
    return res.status(400).json({ error: 'Please fill in your name, work email and company.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(data.email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  if (data.volume && !VOLUMES.includes(data.volume)) data.volume = '';

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (throttled(ip)) return res.status(429).json({ error: 'Too many requests. Please try again in a few minutes.' });

  const results = await Promise.all([sendTelegram(data, req), sendEmail(data, req)]);
  if (results.every((r) => r === 'off')) {
    console.error('[api/request-access] neither Telegram nor email is configured');
    return res.status(500).json({ error: 'Requests are not set up yet. Please use the chat instead.' });
  }
  if (!results.includes('sent')) {
    return res.status(502).json({ error: 'We could not send your request. Please try the chat instead.' });
  }
  return res.status(200).json({ ok: true });
}

const source = (req) => req.headers.referer || 'CallsTalk website';

// Returns 'sent', 'failed' or 'off' (not configured).
async function sendTelegram(data, req) {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
  if (!token || !chatId) return 'off';
  const lines = [
    '🆕 <b>New access request</b>',
    '',
    `👤 <b>${escape(data.name)}</b>`,
    `🏢 ${escape(data.company)}`,
    `✉️ ${escape(data.email)}`,
    data.phone && `📞 ${escape(data.phone)}`,
    data.volume && `📈 Calls per month: ${escape(data.volume)}`,
    data.message && `\n💬 ${escape(data.message)}`,
    '',
    '📥 Full request sent to email for review. Approve to send a CallsTalk.io login link.',
    `🌐 ${escape(source(req))}`,
  ].filter(Boolean);
  const thread = process.env.TELEGRAM_THREAD_ID?.trim();
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: lines.join('\n'), parse_mode: 'HTML', disable_web_page_preview: true, ...(thread ? { message_thread_id: Number(thread) } : {}) }),
    });
    if (r.ok) return 'sent';
    console.error('[api/request-access] Telegram', r.status, (await r.text()).slice(0, 300));
  } catch (err) {
    console.error('[api/request-access] Telegram network error', err);
  }
  return 'failed';
}

async function sendEmail(data, req) {
  const key = process.env.RESEND_API_KEY?.trim();
  const to = process.env.ACCESS_REQUEST_EMAIL_TO?.trim();
  if (!key || !to) return 'off';
  const from = process.env.ACCESS_REQUEST_EMAIL_FROM?.trim() || 'CallsTalk <onboarding@resend.dev>';
  const rows = [['Name', data.name], ['Company', data.company], ['Email', data.email], ['Phone', data.phone], ['Calls per month', data.volume], ['Message', data.message], ['Page', source(req)]]
    .filter(([, v]) => v)
    .map(([k, v]) => `<tr><td style="padding:8px 16px 8px 0;color:#666;vertical-align:top;white-space:nowrap">${k}</td><td style="padding:8px 0;white-space:pre-wrap">${escape(v)}</td></tr>`)
    .join('');
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;color:#111"><h2 style="margin:0 0 4px">New access request</h2><p style="margin:0 0 16px;color:#666">Review this request. If approved, send ${escape(data.name)} a CallsTalk.io login link. Replying to this email reaches them directly.</p><table style="border-collapse:collapse">${rows}</table></div>`;
  const text = [`New access request`, '', `Name: ${data.name}`, `Company: ${data.company}`, `Email: ${data.email}`, data.phone && `Phone: ${data.phone}`, data.volume && `Calls per month: ${data.volume}`, data.message && `Message: ${data.message}`, `Page: ${source(req)}`].filter(Boolean).join('\n');
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ from, to: to.split(',').map((x) => x.trim()), reply_to: data.email, subject: `Access request: ${data.company} (${data.name})`, html, text }),
    });
    if (r.ok) return 'sent';
    console.error('[api/request-access] Resend', r.status, (await r.text()).slice(0, 300));
  } catch (err) {
    console.error('[api/request-access] email network error', err);
  }
  return 'failed';
}
