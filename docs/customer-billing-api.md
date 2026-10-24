# Customer billing: what the backend must provide

**From:** CallsTalk website (frontend, done) · **For:** backend developer

Customers stop receiving their bill in Telegram. They log in at **/login** with the login ID and password we give them, and **/billing** shows their wallet balance, today's bill (live, refreshed every 30 s), the last three days' bills, a Billing History of every day since **1 September 2026** (one tab per month, with monthly totals) and their payments, and lets them pay online.

The site calls `VITE_PORTAL_API_URL` (falls back to `VITE_SUPPORT_API_URL`), e.g. `https://api.example.com/api`. Add the CallsTalk site origin to `CORS_ALLOWED_ORIGINS`, with the `Authorization` header allowed.

## Sign in (existing endpoints, used as they are)

| Call | Body | Response |
|---|---|---|
| `POST /accounts/login` | `{ email, password }` | `{ access, refresh, email }` or `{ mfa_required: true, temp_token }` |
| `POST /accounts/verify-mfa` | `{ temp_token, token }` | `{ access, refresh }` |
| `POST /accounts/refresh` | `{ refresh }` | `{ access }`, or 401 → the site signs the customer out |
| `POST /accounts/logout` | none (Bearer) | anything |

Errors: any non-2xx with `{ "detail": "message shown to the customer" }`.

## `GET /billing/statement?from=2026-09-01` (Bearer)

Every day from `from` up to and including today (today counted so far), **newest first**. Days are the customer's own days (their time zone's midnight). The site always asks for `from=2026-09-01`, so billing must be backdated to 1 September: each customer needs an opening balance as of that date, and their calls and payments since then must be counted. If a customer's account starts later, return days from their start date only.

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
      "opening_balance": "-320.00", "calls": 64, "price_per_call": "35.00",
      "charges": "2240.00", "payment_received": "2500.00", "balance": "-60.00" }
  ],
  "payments": [
    { "id": "…", "amount": "2500.00", "currency": "USD", "status": "completed",
      "provider": "manual", "reference": "", "note": "Bank transfer", "date": "2026-10-24T14:20:00Z" }
  ]
}
```

Rules the page relies on:
- Money values are strings with 2 decimals. Negative balance = the customer owes us.
- `balance` (per day) = `opening_balance − charges + payment_received`; the next day's `opening_balance` is the previous day's `balance`.
- `charges` = `calls × price_per_call`. Each customer has their own price.
- `amount_due` = `max(−balance, 0)`.
- `payments.status`: `pending` | `completed` | `failed`. Only completed payments count towards the balance.
- 403 for a login that is not a customer, 404 when their billing is not set up; the `detail` is shown on the page.

## `POST /billing/statement/pay` (Bearer)

Body `{ "amount": "250.00" }` → `{ "payment_url": "https://capitalist.net/merchant/pay?…" }`. The site redirects the customer there. When the provider confirms, the payment appears in `payments` as completed and the balance moves.

## Trying the page without the backend

`npm run dev` with neither URL set: any login works and the page shows sample figures (today: opening −$320, 64 calls at $35, a $2,500 payment, balance −$60). Production builds never show sample data.
