# Customer billing endpoints

Served by our own server (`server/src/accounts.js`, `server/src/portal.js`, `server/src/billing.js`, data in PostgreSQL, entered by admins in the portal). Every login also has a 6-digit authenticator code, so `/accounts/login` always answers `mfa_required`. Running it: [maintenance.md, section 16](maintenance.md#16-customer-portal-portalcallstalkcom).

Customers log in to the **CallsTalk Portal** (portal.callstalk.com; the website's Log In links there) with the login we give them. Its **Billing** page shows their wallet balance, today's bill (live, refreshed every 30 s), the last three days' bills, a Billing History of the **last 5 days** (with a total) and their payments from those 5 days, and lets them pay online. Under Reports they open the Call Summaries (call logs) our team uploads as Excel files.

The site calls `VITE_PORTAL_API_URL` (falls back to `VITE_SUPPORT_API_URL`), e.g. `https://api.example.com/api`. Add the CallsTalk site origin to `CORS_ALLOWED_ORIGINS`, with the `Authorization` header allowed.

## Sign in

| Call | Body | Response |
|---|---|---|
| `POST /accounts/login` | `{ email, password }` | `{ access, refresh, email }` or `{ mfa_required: true, temp_token }` |
| `POST /accounts/verify-mfa` | `{ temp_token, token }` | `{ access, refresh }` |
| `POST /accounts/refresh` | `{ refresh }` | `{ access }`, or 401 → the site signs the customer out |
| `POST /accounts/logout` | none (Bearer) | anything |

Errors: any non-2xx with `{ "detail": "message shown to the customer" }`.

## `GET /billing/statement?from=YYYY-MM-DD` (Bearer)

Every day from `from` up to and including today (today counted so far), **newest first**. Days are the customer's own days (their time zone's midnight). The portal asks for the **last 5 days**: `from` is 4 days before today (never earlier than 2026-09-01). Return only those days and **only the payments made in those days**. Customers must not receive older history. Balances still carry over: billing is counted from 1 September 2026, so the first day returned opens on the real running balance, with each customer's opening balance as of 1 September plus their calls and payments since. If a customer's account starts later, return days from their start date only.

```json
{
  "customer": "Example Customer",
  "currency": "USD",
  "price_per_call": "35.00",
  "timezone": "America/New_York",
  "as_of": "2026-10-24T15:23:29Z",
  "balance": "-60.00",
  "amount_due": "60.00",
  "days": [
    { "date": "2026-10-24", "is_today": true,
      "opening_balance": "-320.00", "calls": 64, "replacements": 0, "billable_calls": 64, "price_per_call": "35.00",
      "charges": "2240.00", "payment_received": "2500.00", "balance": "-60.00", "from_call_log": true }
  ],
  "payments": [
    { "id": "…", "amount": "2500.00", "currency": "USD", "status": "completed",
      "method": "manual", "reference": "", "note": "Bank transfer", "date": "2026-10-24T14:20:00Z" }
  ],
  "replaced_calls": [
    { "date": "2026-10-22", "called_at": "2026-10-22 14:37:25", "caller": "19736517174", "duration": "00:00:55",
      "call_time": "2026-10-22 14:37:25", "number_called": "18779642010",
      "reason": "Under 30 seconds", "replaced_at": "2026-10-23T09:12:00Z" }
  ]
}
```

Rules the page relies on:
- Money values are strings with 2 decimals. Negative balance = the customer owes us.
- `balance` (per day) = `opening_balance − charges + payment_received`; the next day's `opening_balance` is the previous day's `balance`.
- `charges` = `(calls − replacements) × price_per_call`. Each customer has their own price.
- `replacements`: calls from that day that are replaced and **not charged**; shown as "125 − 2" (125 calls, 2 replaced, 123 charged). Our team often adds them after the day, and the corrected balance carries into every later day. `billable_calls` = `calls − replacements`.
- `from_call_log`: the day's `calls` were counted from its Call Summaries (the call logs under Reports): every distinct call (time and caller) in them, replaced ones included. Each upload or deletion of a Call Summary counts its days again, so the balance follows the logs at once. `false`: the calls were entered by our team (a day with no Call Summary).
- `replaced_calls`: the calls replaced on the returned days, latest day first, as their Call Summary shows them (`called_at`, `caller`, `duration`; `call_time` to the second and the toll-free `number_called`, `''` for calls replaced before these were kept), with the team's `reason` ('' when none). Buyers ask for a replacement in the portal chat; an admin chooses the call in that day's Call Summary, which adds one to the day's `replacements`. Who replaced it is not returned. A day's `replacements` can be more than its listed calls when a billing report gave them as a number ("125 − 2").
- `amount_due` = `max(−balance, 0)`.
- `payments.status`: `pending` | `completed` | `failed`. Only completed payments count towards the balance.
- 403 for a login that is not a customer, 404 when their billing is not set up; the `detail` is shown on the page.

## `POST /billing/statement/pay` (Bearer)

Body `{ "amount": "250.00" }` → `{ "method": "usdt_trc20", "currency": "USDT", "network": "TRON (TRC-20)", "address": "T…", "amount": "250.00", "qr_svg": "<svg…" }`. The page shows the customer's own TRC-20 address and a QR code; the amount is a guide. Payments go through Well Wallet (server/src/payments.js): every customer has one deposit address, any USDT sent to it is credited 1:1 in USD, shown as `pending` while in progress and `completed` once confirmed. The portal never names the provider. 503 while `WELLWALLET_API_TOKEN` is not set.

## Trying the page without the backend

`npm run dev` with neither URL set: any login works and the page shows sample figures (today: opening −$320, 64 calls at $35, a $2,500 payment, balance −$60). Production builds never show sample data.
