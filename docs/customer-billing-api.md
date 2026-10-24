# Customer billing: what the backend must provide

**From:** CallsTalk website (frontend, done) · **For:** backend developer

Customers stop receiving their bill in Telegram. They log in to the **CallsTalk Portal** (callstalk-portal.vercel.app, later app.callstalk.io; the website's Log In links there) with the login ID and password we give them, and its **Billing** page shows their wallet balance, today's bill (live, refreshed every 30 s), the last three days' bills, a Billing History of the **last 5 days** (with a total) and their payments from those 5 days, and lets them pay online. Older bills reach customers as the Excel reports our team uploads.

The site calls `VITE_PORTAL_API_URL` (falls back to `VITE_SUPPORT_API_URL`), e.g. `https://api.example.com/api`. Add the CallsTalk site origin to `CORS_ALLOWED_ORIGINS`, with the `Authorization` header allowed.

## Sign in (existing endpoints, used as they are)

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
