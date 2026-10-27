# CallsTalk chat server

Backend for the website's "Talk to Our Team" chat.

- Each new chat is posted to your team's Telegram with the visitor's name, time (for example 3:20 PM EST)
  and their message. The name appears only if the visitor filled in the "Talk to Our Team" form;
  a question typed straight into the chat shows up as **Visitor**. Chats from customers signed in to the
  portal also show their company and login email.
- Each later visitor message is forwarded to the same Telegram chat.
- When someone on the team replies in Telegram, the reply appears in the visitor's chat window
  within a few seconds.
- Optionally, every new chat and visitor message is also **emailed** to an address you choose.
  Each email has a **Reply in the chat** button that opens a page with the conversation, scrolled
  to that message, where you can type an answer. It reaches the visitor's chat like a Telegram reply.
- The website's **Request Access** form is posted to the same Telegram chat as a **New access request**
  (name, company, email, phone, calls per month, time and message) and emailed to the same address.
  It isn't a chat, so replying to it in Telegram goes nowhere; reply to the email to reach the person.

It runs as one Node.js process and stores conversations in PostgreSQL 18 (the same Postgres
server as the CRM, with its own database and user). The tables are created on first start.
The bot long-polls Telegram, so Telegram doesn't need to reach your server and no webhook is used.

## How the team replies in Telegram

| Do this | Result |
| --- | --- |
| Tap **Reply >** under a visitor's message | The bot opens a reply box for that chat (only for you). Type the answer and send. The bot's line changes to **Sent to Jane** once it's delivered. |
| **Reply** to any message about a chat (swipe left on mobile, right-click > Reply on desktop) | Sent to that visitor. |
| Type inside the visitor's topic (only with `TELEGRAM_TOPIC_PER_CHAT=true`) | Sent to that visitor. |
| `a1b2c3d4 Your answer`, where `a1b2c3d4` is the chat's `#id` | Sent to that visitor. |
| `/close` as a reply (or `/close a1b2c3d4`) | Ends the chat: the visitor sees a goodbye and that chat becomes read-only for them. `/close Your message` sends your own goodbye instead of the default. |
| `/help` | Shows these instructions. |
| `/chatid` | Shows the chat id and topic id, for setup. |

A chat with no new message from either side for 24 hours ends by itself, the same way as
`/close`. The visitor is told and Telegram shows **Chat ended automatically**. Change the hours
with `CHAT_TIMEOUT_HOURS` in `.env` (`0` turns this off). The server checks every 10 minutes.

Any other message in the group is ignored, so the team can talk among themselves there.
Only text is relayed; photos and files are not.

## Email notifications

Set `EMAIL_TO`, the `SMTP_*` settings, `EMAIL_FROM` and `PUBLIC_URL` in `.env` (see `.env.example`).

- All emails for one chat are grouped into a single thread in your inbox.
- **Reply in the chat** opens `https://<PUBLIC_URL>/reply/<link>`. On that page you can send
  an answer or end the chat (anything typed is sent as the goodbye). Telegram is told about anything sent from the page, so the team
  stays in sync.
- For a portal customer's chat, pressing **Reply** in your mail app emails the customer directly, because
  Reply-To is their login email. That reply does not appear in the chat. Website visitors give no email
  address, so answer them with **Reply in the chat**.
- Links are signed with a secret that the server creates and stores in its database. They expire after
  `REPLY_LINK_DAYS` (30 by default). Anyone who has a link can reply as the team, so don't forward
  the emails outside the team.
- If email fails, chats still work through Telegram, and the error is logged.
- With `NODE_ENV=development`, reply links use `http://localhost:5173` instead of `PUBLIC_URL`.
  The Vite dev server passes `/reply/...` on to the chat server, so run both. On the VPS, use
  `NODE_ENV=production`.

With Hostinger Mail, create a mailbox (for example `chat@yourdomain.com`) in hPanel under **Emails**,
then use `SMTP_HOST=smtp.hostinger.com`, `SMTP_PORT=465`, that address as `SMTP_USER` and
`EMAIL_FROM`, and its password as `SMTP_PASS`. On startup, `pm2 logs` shows `[email] SMTP ready` when the login works.

---

## Deploy on a Hostinger VPS

These steps assume Ubuntu 22.04 or 24.04, which is Hostinger's default VPS template, and a
subdomain such as `chat.callstalk.com` for the API. Replace that name everywhere below.

### 1. Create the Telegram bot and group

1. In Telegram, open **@BotFather**, send `/newbot`, and follow the prompts. Copy the **token**.
2. Create a group (for example "CallsTalk Support"), add your team, and add the bot.
3. Make the bot an **admin** of the group. Admins see every message in the group, which the
   bot needs to see replies.
4. Optional: to give every visitor their own thread, open the group settings, turn on **Topics**,
   and give the bot the **Manage topics** admin right. Then set `TELEGRAM_TOPIC_PER_CHAT=true` later.

### 2. Point the domain at the VPS

In Hostinger hPanel go to **Domains > DNS / Nameservers** and add an **A record**:
`chat` → your VPS IP address. Changes usually take a few minutes to apply.

### 3. Install Node.js, nginx and PM2

SSH in (`ssh root@YOUR_VPS_IP`), then:

```bash
apt update && apt install -y nginx git
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt install -y nodejs
npm install -g pm2
node --version   # must be 22.13 or newer
```

### 4. Create the database

PostgreSQL 18 is already installed on the VPS for the CRM. Give the chat server its own user and
database there, so it can never touch CRM data (pick a strong password):

```bash
sudo -u postgres psql -c "CREATE ROLE callstalk_chat LOGIN PASSWORD 'choose-a-strong-password';"
sudo -u postgres psql -c "CREATE DATABASE callstalk_chat OWNER callstalk_chat;"
```

The same two commands work on your PC (`psql -U postgres -h 127.0.0.1 -c "…"`), which is what
`npm start` uses locally.

### 5. Get the code and configure it

```bash
git clone https://github.com/009K-AVTX/CallsTalk-Marketing.git /var/www/callstalk
cd /var/www/callstalk/server
npm ci --omit=dev
cp .env.example .env
nano .env
```

Fill in `TELEGRAM_BOT_TOKEN`, `DB_PASSWORD` (from step 4) and `CORS_ALLOWED_ORIGINS` (your
website's address, for example `https://callstalk.com,https://www.callstalk.com`). Check `DB_PORT`
matches the Postgres port on the VPS (5432 unless the CRM setup changed it).

To find `TELEGRAM_CHAT_ID`:

1. Set `TELEGRAM_CHAT_ID=0` for now and run `npm start`.
2. In the Telegram group, send `/chatid`. The bot replies with an id such as `-1001234567890`.
3. Stop the server (Ctrl+C), put that id in `.env`, and continue.

### 6. Run it permanently with PM2

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup     # run the command it prints, so the server starts again after a reboot
pm2 logs callstalk-chat   # should show "listening for replies as @YourBot"
```

### 7. Put nginx and HTTPS in front

```bash
cp deploy/nginx.conf /etc/nginx/sites-available/callstalk-chat
nano /etc/nginx/sites-available/callstalk-chat      # set server_name to your domain
ln -s /etc/nginx/sites-available/callstalk-chat /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

apt install -y certbot python3-certbot-nginx
certbot --nginx -d chat.callstalk.com
```

Open the firewall for SSH and web traffic:

```bash
ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw enable
```

If you also use the firewall in hPanel (**VPS > Security > Firewall**), allow ports 22, 80 and 443 there.

Check it: `https://chat.callstalk.com/api/health` should return `{"ok":true}`.

### 8. Connect the website

In the Vercel project, set the environment variable

```
VITE_SUPPORT_API_URL=https://chat.callstalk.com/api
```

then redeploy. The variable is read at build time, so the redeploy is required. The chat widget
now shows **Talk to Our Team**.

---

## Optional: host the whole website on the VPS

The same server can serve the built site and the AI assistant (`/api/chat`), so Vercel isn't needed.

```bash
cd /var/www/callstalk
npm ci
VITE_SUPPORT_API_URL=/api npm run build
```

In `server/.env` set `SERVE_SITE=true` and `GROQ_API_KEY=...`. In the nginx file, set `server_name`
to `callstalk.com www.callstalk.com`. Then run `pm2 restart callstalk-chat` and
`certbot --nginx -d callstalk.com -d www.callstalk.com`.

## Updating

```bash
cd /var/www/callstalk && git pull
cd server && npm ci --omit=dev && pm2 restart callstalk-chat
```

If you host the site here too, also run `npm ci && VITE_SUPPORT_API_URL=/api npm run build` in
`/var/www/callstalk` before the restart.

## Data and backups

Conversations, the Telegram links and the reply-link signing secret are all in the
`callstalk_chat` PostgreSQL database. To back it up (safe while the server is running):

```bash
sudo -u postgres pg_dump callstalk_chat > ~/chat-backup-$(date +%F).sql
```

To restore: `sudo -u postgres psql -d callstalk_chat -f ~/chat-backup-YYYY-MM-DD.sql`. If the
database is lost, links in emails already sent stop working (a new signing secret is created).

## Troubleshooting

| Symptom (`pm2 logs callstalk-chat`) | Fix |
| --- | --- |
| `[db] cannot use PostgreSQL database …` | Check `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` and that step 4 was run. `password authentication failed` means the password doesn't match the one in `CREATE ROLE`. |
| `TELEGRAM_BOT_TOKEN was rejected` | Copy the token from @BotFather again. |
| `Another copy of this server is already polling` | Only one process may use the bot token. Stop the other one (a second PM2 app, or `npm start` left running on another machine). |
| `ignored a message from chat -100…` | `TELEGRAM_CHAT_ID` doesn't match the group. Use the id from `/chatid`. |
| Visitor sees "We could not reach our team" | The bot can't post to the group. Check that it's still a member and an admin. With topics, it also needs **Manage topics**. |
| Team replies don't arrive | Make sure people use **Reply** (or type in the visitor's topic), and that the bot is an admin. |
| `[email] cannot log in to …` | Check `SMTP_USER` / `SMTP_PASS`. For Gmail use an App Password; for port 587 set `SMTP_PORT=587`. |
| Emails arrive but the button says the link is not valid | `PUBLIC_URL` must be this server's public `https://` address. |
| The browser console shows a CORS error | Add the website's exact address (with `https://`, no trailing slash) to `CORS_ALLOWED_ORIGINS`, then `pm2 restart callstalk-chat`. |

## API (used by `src/lib/support.js`)

| Method | Path | Body | Response |
| --- | --- | --- | --- |
| POST | `/api/support/chat` | `{ name, email, message, transcript? }` | `201 { session_id, message }` |
| POST | `/api/support/chat/:id` | `{ message }` | `200 { message }` |
| GET | `/api/support/chat/:id` | | `200 { session_id, status, messages: [{ id, sender, message, created_at }] }` |
| POST | `/api/support/chat/:id/end` | | `200 { status }` |
| POST | `/api/request-access` | `{ name, email, company, phone?, volume?, message? }` | `200 { ok: true }` |
| GET | `/api/health` | | `200 { ok: true }` |

Portal additions for Telegram notices (buyers connect their own chat; the team gets payment notices and a daily
paid/pending summary): see `docs/maintenance.md` §16.3.1, `server/src/telegram-link.js` and `server/src/billing-notices.js`.
| GET / POST | `/reply/:signedToken` | form: `name`, `message` or `action=end` | HTML reply page (from email links) |

`sender` is `visitor` or `agent`. `status` is `open` or `ended` (by either side). Messages to an ended chat return `409`.
Errors return `{ detail }`, which the widget shows as written.
