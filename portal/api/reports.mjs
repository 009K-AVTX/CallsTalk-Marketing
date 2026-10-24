// Billing reports for the portal's demo deployment, kept in Vercel Blob until the Avortyx API takes
// over (see docs/portal-reports-api.md, which these routes mirror).
//
//   GET    /api/reports?customer=<login id>          a customer's reports, newest first
//   GET    /api/reports            (x-upload-key)    every report, for the staff upload page
//   POST   /api/reports            (x-upload-key)    { customer, title, period_from, period_to, note, filename, content_base64 }
//   DELETE /api/reports?id=<id>    (x-upload-key)
//
// Env: BLOB_READ_WRITE_TOKEN (from the connected Blob store), UPLOAD_KEY (shared with the billing team).
import { del, list, put } from '@vercel/blob';
import { randomUUID, timingSafeEqual } from 'crypto';

const MAX_BYTES = 3 * 1024 * 1024; // the request body limit is 4.5 MB and base64 adds a third
const TYPES = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  csv: 'text/csv',
};

const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const customerKey = (v) => clean(v, 120).toLowerCase();
const folder = (customer) => `reports/${Buffer.from(customer).toString('base64url')}/`;
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v);

function staff(req) {
  const want = process.env.UPLOAD_KEY?.trim();
  const got = String(req.headers['x-upload-key'] || '');
  if (!want || !got || got.length !== want.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

// Every report is a folder holding the file and a meta.json describing it.
async function reportsUnder(prefix) {
  const blobs = [];
  let cursor;
  do {
    const page = await list({ prefix, cursor, limit: 1000 });
    blobs.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  const metas = blobs.filter((b) => b.pathname.endsWith('/meta.json'));
  const reports = await Promise.all(metas.map(async (m) => {
    try {
      const r = await fetch(m.url, { cache: 'no-store' });
      return r.ok ? await r.json() : null;
    } catch {
      return null;
    }
  }));
  return reports.filter(Boolean).sort((a, b) => (a.uploaded_at < b.uploaded_at ? 1 : -1));
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!process.env.BLOB_READ_WRITE_TOKEN) return res.status(500).json({ detail: 'Report storage is not connected yet.' });

  try {
    if (req.method === 'GET') {
      if (staff(req)) return res.status(200).json({ results: await reportsUnder('reports/') });
      const customer = customerKey(req.query.customer);
      if (!customer) return res.status(400).json({ detail: 'Missing customer.' });
      return res.status(200).json({ results: await reportsUnder(folder(customer)) });
    }

    if (!staff(req)) return res.status(401).json({ detail: 'The upload key is not correct.' });

    if (req.method === 'POST') {
      const b = req.body || {};
      const customer = customerKey(b.customer);
      const filename = clean(b.filename, 140).replace(/[^\w.\- ()]/g, '_');
      const ext = filename.split('.').pop().toLowerCase();
      if (!customer || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(customer)) return res.status(400).json({ detail: "Enter the customer's login ID (their email)." });
      if (!TYPES[ext]) return res.status(400).json({ detail: 'Upload an Excel file (.xlsx or .xls) or a .csv file.' });
      if (!isDate(b.period_from) || !isDate(b.period_to) || b.period_from > b.period_to) return res.status(400).json({ detail: 'Choose the dates the report covers.' });
      const file = Buffer.from(String(b.content_base64 || ''), 'base64');
      if (!file.length) return res.status(400).json({ detail: 'The file is empty.' });
      if (file.length > MAX_BYTES) return res.status(413).json({ detail: 'Files up to 3 MB can be uploaded.' });

      const id = randomUUID();
      const base = `${folder(customer)}${id}/`;
      const stored = await put(`${base}${filename}`, file, { access: 'public', contentType: TYPES[ext], addRandomSuffix: true });
      const report = {
        id,
        customer,
        title: clean(b.title, 120) || filename.replace(/\.[^.]+$/, ''),
        note: clean(b.note, 300),
        period_from: b.period_from,
        period_to: b.period_to,
        filename,
        size: file.length,
        uploaded_at: new Date().toISOString(),
        url: stored.url,
        folder: base,
      };
      await put(`${base}meta.json`, JSON.stringify(report), { access: 'public', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true });
      return res.status(201).json(report);
    }

    if (req.method === 'DELETE') {
      const id = clean(req.query.id, 64);
      const target = (await reportsUnder('reports/')).find((r) => r.id === id);
      if (!target) return res.status(404).json({ detail: 'That report no longer exists.' });
      const { blobs } = await list({ prefix: target.folder });
      await del(blobs.map((x) => x.url));
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ detail: 'Method not allowed.' });
  } catch (err) {
    console.error('[api/reports]', err);
    return res.status(502).json({ detail: 'Report storage is unavailable right now. Please try again.' });
  }
}
