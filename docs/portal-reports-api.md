# CallsTalk Portal: what Avortyx must provide

**From:** CallsTalk Portal (frontend, done, in `portal/`) · **For:** Avortyx backend developer · **Switch-over:** next week

The portal is a **billing portal**. Customers see their balance and daily bills, pay online, and open the **billing reports** our team uploads as Excel files. They never see caller numbers or call lists.

Two links:

| Link | Who | What |
|---|---|---|
| `/` · `/reports` · `/settings` | Customers (buyer logins) | Billing, their uploaded reports, account settings |
| `/upload` | CallsTalk billing team | Upload an Excel report for a customer; it appears in that customer's Reports straight away |

Sign-in, billing and payments use the endpoints in [customer-billing-api.md](customer-billing-api.md). This page adds the report endpoints. Errors: any non-2xx with `{ "detail": "message shown on screen" }`.

## Report object

```json
{
  "id": "7c1d…", "customer": "bills@q32.com", "title": "Billing Report, Oct 17 to 23",
  "note": "Includes the Oct 22 payment", "period_from": "2026-10-17", "period_to": "2026-10-23",
  "filename": "billing-report-oct-17-23.xlsx", "size": 18793, "uploaded_at": "2026-10-24T14:48:00Z"
}
```

`period_from` / `period_to` are the days the report covers (`YYYY-MM-DD`). The portal groups reports by the month of `period_to`, newest first, and marks a report "New" for 3 days after `uploaded_at`.

## Customer endpoints (buyer login, Bearer token)

| Call | Returns |
|---|---|
| `GET /portal/reports` | `{ "results": [report, …] }`, this buyer's reports only, newest `uploaded_at` first |
| `GET /portal/reports/{id}/file` | The file bytes, with its content type. 404 unless the report belongs to this buyer |

## Billing-team endpoints (staff login, Bearer token)

The upload page signs in with `POST /accounts/login` (staff account) and sends that token. Refuse buyer and publisher logins with 403.

| Call | Body / Returns |
|---|---|
| `GET /staff/customers` | `{ "results": [{ "id": "<buyer id>", "name": "Q32", "login": "bills@q32.com" }] }`, the buyers who have a portal login |
| `GET /staff/reports` | `{ "results": [report, …] }`, every report, newest first |
| `POST /staff/reports` | `{ customer, title, note, period_from, period_to, filename, content_base64 }` → 201 with the report |
| `DELETE /staff/reports/{id}` | `{ "ok": true }`; the customer stops seeing it |

For `POST`:
- `customer` is the buyer `id` from `/staff/customers`.
- Accept `.xlsx`, `.xls` and `.csv`, up to 3 MB, sent as base64 in `content_base64`.
- `title` may be empty; default it to the file name without its extension.
- Reject `period_from > period_to`.

## This week: the demo deployment

Until Avortyx has these endpoints, the demo at **callstalk-portal.vercel.app** keeps reports in its own Vercel Blob store through `portal/api/reports.mjs`.
- **Customers** are matched by their login email.
- **The upload page** uses a shared upload key (Vercel env `UPLOAD_KEY`) instead of a staff login.
- **Not secure enough for real customers:** anyone who knows a customer's email can list that customer's reports.

## Switching to Avortyx

In the `callstalk-portal` Vercel project:
1. Set `VITE_PORTAL_API_URL` to the Avortyx API base, e.g. `https://api.avortyx.io/api`.
2. Remove `VITE_PORTAL_DEMO`.
3. Redeploy.

The same screens then call the endpoints above, and the upload page asks for a staff email and password instead of the key. Reports uploaded to the demo store don't move over by themselves: re-upload any you need to keep, or ask for a one-off copy.

## Running locally

`npm run portal` opens http://localhost:5180. With no API URL set, any customer login works. The upload key is `local-upload-key`, and uploads are kept in that browser only.
