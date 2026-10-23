# Website chat: backend setup

The chat widget on the CallsTalk site has two parts.

1. **AI assistant** answers first. It calls `api/chat.js`, a Vercel function that proxies Groq.
   Set `GROQ_API_KEY` in the Vercel project's environment variables.
2. **Talk to our team** hands the visitor to a person. It uses the existing `support` router
   from `call_platform` (`support/api.py`), unchanged. Set `VITE_SUPPORT_API_URL` in Vercel to the
   API base, for example `https://api.callstalk.com/api`, then redeploy.

## Endpoints the widget calls

| Method | Path | Body | Response |
| --- | --- | --- | --- |
| POST | `/support/chat` | `{ name, email, message }` | `201 { session_id, message }` |
| POST | `/support/chat/{session_id}` | `{ message }` | `200 { message }` |
| GET | `/support/chat/{session_id}` | | `200 { session_id, status, messages: [{ id, sender, message, created_at }] }` |

- `sender` is `visitor` for the website visitor; anything else is shown as a team reply.
- Errors return `{ detail }`, which the widget shows to the visitor as written.
- The widget checks for replies every 3 seconds while open and every 15 seconds while closed.

## Backend checklist

- Add the website's domain to `CORS_ALLOWED_ORIGINS`.
- Set `TELEGRAM_BOT_TOKEN`, `TELEGRAM_SUPPORT_CHAT_ID` (and `TELEGRAM_SUPPORT_THREAD_ID` if using a topic).
  The team replies in Telegram with `<first 8 characters of the session id> <reply>`.
- **Email is not implemented yet.** The widget now collects a real name and email for every
  conversation (stored on `SupportSession`). To reply by email as well, the backend needs to send
  agent replies to `session.email`, and to forward new visitor messages to the support inbox.
