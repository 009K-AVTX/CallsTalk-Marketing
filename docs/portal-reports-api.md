# CallsTalk Portal: report endpoints

Served by our own server (`server/src/accounts.js`, `server/src/portal.js`, data in PostgreSQL, entered by admins in the portal). Every login also has a 6-digit authenticator code, so `/accounts/login` always answers `mfa_required`. Running it: [maintenance.md, section 16](maintenance.md#16-customer-portal-portalcallstalkcom).

The portal is a **billing portal**. Customers see their balance and daily bills, pay online, and open the **Call Summary** reports our team uploads as Excel files: the day's call log (date and time, caller, number called, duration, status, who hung up). Billing reports are uploaded too, but only the team sees them.

Two links:

| Link | Who | What |
|---|---|---|
| `/` · `/reports` · `/settings` | Customers (buyer logins) | Billing, their Call Summaries, account settings |
| `/upload` | CallsTalk billing team | Upload a Call Summary (it appears in that customer's Reports straight away) or a billing report (team only) |

Sign-in, billing and payments use the endpoints in [customer-billing-api.md](customer-billing-api.md). This page adds the report endpoints. Errors: any non-2xx with `{ "detail": "message shown on screen" }`.

## Report object

```json
{
  "id": "7c1d…", "customer": "bills@q32.com", "kind": "calls", "title": "Call Summary, 72 calls",
  "note": "", "period_from": "2026-10-26", "period_to": "2026-10-26",
  "filename": "C4V - 72.xlsx", "size": 11516, "uploaded_at": "2026-10-27T14:48:00Z", "calls": 72,
  "replaced": [{ "called_at": "2026-10-26 15:22:51", "caller": "5743447831" }]
}
```

`calls`: for a Call Summary, how many calls it lists (`null` when they were never read: uploaded before calls were read into billing).

`kind` is `calls` (a Call Summary, the buyer's to see) or `billing` (a billing report, for the team only). `period_from` / `period_to` are the days the report covers (`YYYY-MM-DD`). The portal groups reports by the month of `period_to`, newest first, and marks a report "New" for 3 days after `uploaded_at`. `replaced`: for a Call Summary, the buyer's calls replaced on the days it covers, by the time and caller the log shows (`[]` for none, and always for a billing report); the viewer marks those rows **Replaced**.

## Customer endpoints (buyer login, Bearer token)

| Call | Returns |
|---|---|
| `GET /portal/reports` | `{ "results": [report, …] }`, this buyer's Call Summaries only, newest `uploaded_at` first |
| `GET /portal/reports/{id}/file` | The file bytes, with its content type. 404 unless it is a Call Summary of this buyer's |

## Billing-team endpoints (staff login, Bearer token)

The upload page signs in with `POST /accounts/login` (staff account) and sends that token. Refuse buyer and publisher logins with 403.

| Call | Body / Returns |
|---|---|
| `GET /staff/customers` | `{ "results": [{ "id": "<buyer id>", "name": "Q32", "login": "bills@q32.com" }] }`, the buyers who have a portal login |
| `GET /staff/reports?customer=&kind=` | `{ "results": [report, …] }`, every report of both kinds, newest first; `customer` (a buyer id) and `kind` narrow it |
| `POST /staff/reports` | `{ customer, kind, title, note, period_from, period_to, filename, content_base64, calls }` → 201 with the report and `billing_days` |
| `PUT /staff/reports/{id}/calls` | `{ calls }` → the report and `billing_days`: a Call Summary's calls read now (one uploaded before calls were read) |
| `DELETE /staff/reports/{id}` | `{ "ok": true, "billing_days": […] }`; the customer stops seeing it, and its calls come off their billing |

A Call Summary's `calls` (`[{ date, called_at, caller, duration }]`, up to 5,000, each on a day from `period_from` to `period_to`) are read in the browser exactly as the report viewer reads the file (`portal/src/call-summary.js` `callsIn`). They bill their days: a day's calls become every distinct call (time and caller) in the buyer's Call Summaries for that day, with their replaced calls, so a second or corrected log never counts a call twice. Such a day cannot be typed over on the customer's page; a corrected log, or deleting the wrong one, changes it. `billing_days`: `[{ date, before, after }]` for each day whose calls changed (`null`: none). The Audit Log keeps the same.

For `POST`:
- `customer` is the buyer `id` from `/staff/customers`.
- `kind` is `calls` or `billing`; anything else is refused.
- Accept `.xlsx`, `.xls` and `.csv`, up to 3 MB, sent as base64 in `content_base64`.
- `title` may be empty; default it to the file name without its extension.
- Reject `period_from > period_to`.

## The shareable demo (Vercel)

A production build with `VITE_PORTAL_DEMO=true` (or with no API URL) keeps reports in a Vercel Blob store through `portal/api/reports.mjs`.
- **Customers** are matched by their login email.
- **The upload page** uses a shared upload key (Vercel env `UPLOAD_KEY`) instead of a staff login.
- **Not secure enough for real customers:** anyone who knows a customer's email can list that customer's reports. Real customers use portal.callstalk.com.

## Running locally

`npm run portal` opens http://localhost:5180 with sample data: any customer login works, the upload key is `local-upload-key`, and uploads are kept in that browser only. `npm run portal:live` uses the server in `server/` through `/api`, with real logins.
