# CallsTalk Portal: what the backend must provide

**From:** CallsTalk Portal (frontend, done, in `portal/`) · **For:** backend developer

The portal is the customer's logged-in app, planned for **app.callstalk.io**. It has Overview, Calls, Reports, Billing and Settings. Sign-in, billing and payments use the endpoints already described in [customer-billing-api.md](customer-billing-api.md). This page adds the two endpoints for calls and reports. Every request carries the customer's Bearer token. Only a buyer login sees data, and only for its own buyer.

**Dates:** `from` and `to` are `YYYY-MM-DD`, both included, counted in the customer's own time zone (`Buyer.timezone`, the same days as their bills). The portal never asks for days before 2026-09-01.

**Calls:** "converted" means the same rule as billing: the calls the customer is charged for.

## `GET /portal/calls?from=&to=&status=&q=&page=1&page_size=25`

| Param | Meaning |
|---|---|
| `status` | empty = all · `converted` · `not_converted` (answered, not converted) · `missed` · `busy` |
| `q` | digits of the caller number to match anywhere in it |
| `page_size` | 25 on screen; the CSV export asks for up to 10000 |

```json
{
  "count": 323, "page": 1, "page_size": 25,
  "results": [
    { "id": "20261024-9", "started_at": "2026-10-24T20:57:00Z", "caller": "+1 (215) 294-1499",
      "state": "PA", "duration": 11, "status": "completed", "converted": false, "cost": "0.00" }
  ]
}
```

Newest first. `duration` is seconds. `status` is one of `completed`, `missed`, `busy` or `failed`. `cost` is what this call was charged (the customer's price when converted, else `0.00`). `state` is the caller's state from their area code.

## `GET /portal/summary?from=&to=&group=day`

`group` is `hour`, `day`, `week` (weeks start on Monday) or `month`.

```json
{
  "from": "2026-09-25", "to": "2026-10-24", "group": "day",
  "totals": { "calls": 1494, "answered": 1340, "converted": 905, "spend": "31675.00",
              "avg_duration": 237, "short_calls": 215, "repeat_callers": 370 },
  "series": [ { "bucket": "2026-09-25", "calls": 61, "converted": 38, "spend": "1330.00" } ],
  "by_state": [ { "state": "FL", "calls": 235, "converted": 146, "spend": "5110.00" } ],
  "heatmap": [[0, 0, 1, "… 24 counts, hours 0–23"], "… 7 rows, Monday first"],
  "durations": [ { "from": 0, "to": 30, "calls": 210 }, { "from": 300, "to": null, "calls": 380 } ]
}
```

- `series`: one row per bucket, oldest first. Bucket keys: `"00"`–`"23"` for hours, `YYYY-MM-DD` for days and weeks (the Monday), `YYYY-MM` for months. For `hour` and `day`, include empty buckets with zeros.
- `avg_duration`: mean seconds of answered calls. `short_calls`: answered calls under 30 seconds. `repeat_callers`: numbers that called more than once in the range.
- `by_state`: sorted by calls, descending.
- `heatmap`: 7 rows (Monday to Sunday) of 24 hourly call counts.
- `durations`: answered calls in these length bands, in seconds: 0–30, 30–60, 60–90, 90–180, 180–300, 300+ (`to: null`).

## Settings (existing endpoints, used as they are)

- `GET /accounts/me` → `email`, `first_name`, `last_name`, `role`
- `POST /accounts/change-password` with `{ current_password, new_password }`. Errors come back as `detail` or `message`, and the portal shows either.

## Running the portal locally

```
npm run portal          # http://localhost:5180
npm run portal:build    # production build into portal/dist/
```

With no `VITE_PORTAL_API_URL` (or `VITE_SUPPORT_API_URL`) set, the dev server runs in preview mode: any login works, and every page shows generated calls since 1 September, with bills, reports and the call list worked out from the same calls. Production builds leave the preview data out, unless they are built with `VITE_PORTAL_DEMO=true`. The shareable demo deployment (Vercel project `callstalk-portal`) sets that, and it shows a "Demo · Sample Data" label. Remove that variable and set `VITE_PORTAL_API_URL` to go live.

The portal deploys as its own Vercel project with root directory `portal/`; `portal/vercel.json` holds its install, build, output and page-routing settings.
