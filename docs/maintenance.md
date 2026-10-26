# CallsTalk server maintenance

How to run, check, update, back up and repair the CallsTalk production server.

Everything here is run on the VPS as `root` over SSH (`ssh root@168.231.112.65`) unless it says otherwise.
Passwords and keys are never written in this file. They live in `/var/www/Callstalk/server/.env`.

---

## 1. What runs where

One Node.js process serves the whole site:

```
Visitor ──HTTPS──> nginx (callstalk.com, www, chat) ──> 127.0.0.1:3001  Node "callstalk-chat"
                                                              ├─ website (dist/)
                                                              ├─ /api/chat       AI assistant (Groq)
                                                              ├─ /api/request-access  request-access form -> Telegram and email
                                                              ├─ /api/support/*  live chat API
                                                              ├─ /reply/*        email reply page
                                                              └─ Telegram bot (long polling), email (SMTP), idle-chat expiry
                                                                     │
                                                       PostgreSQL 18 ┘ database "callstalk_chat"
```

| Item | Value |
|---|---|
| VPS | Hostinger, `srv1718458`, Ubuntu 24.04, IP `168.231.112.65` |
| Code | `/var/www/Callstalk` (git clone, branch `fullstack-v1`) |
| Built website | `/var/www/Callstalk/dist` |
| Server settings | `/var/www/Callstalk/server/.env` (mode 600) |
| Site build settings | `/var/www/Callstalk/.env` (`VITE_SUPPORT_API_URL`) |
| Node.js | Node 24 in `/opt/node24`, used only by CallsTalk. The system `node` (v20) belongs to the other bots on this VPS. |
| Process manager | PM2, process name `callstalk-chat` |
| Port | `3001`, bound to `127.0.0.1` only (not reachable from the internet) |
| nginx site | `/etc/nginx/sites-available/callstalk.com` (symlinked in `sites-enabled`) |
| TLS | Let's Encrypt via certbot, auto-renewing |
| Database | PostgreSQL 18 cluster `18/main` on `127.0.0.1:5432`, database and user `callstalk_chat` |
| Telegram bot | `@CTLKMBOT` |
| Email | Hostinger Mail, `support@callstalk.com` via `smtp.hostinger.com:465` |
| Logs | `/root/.pm2/logs/callstalk-chat-out.log` and `-error.log` |

**Shared server.** This VPS also runs other sites (crm.keozx.com, n8n and more), 13 other PM2 bots, Redis and a
Docker n8n stack. Anything that restarts nginx, PostgreSQL, PM2 or the whole machine affects them too.
Commands in this file only touch CallsTalk unless they are marked **shared**.

---

## 2. Quick health check

Run this whenever something seems wrong, and after every change:

```bash
curl -s https://callstalk.com/api/health; echo                     # {"ok":true}
curl -sI https://callstalk.com/ | head -1                          # HTTP/1.1 200 OK
pm2 describe callstalk-chat | grep -E "status|restarts|uptime"
pm2 logs callstalk-chat --lines 30 --nostream
```

A healthy start shows these three lines in the log:

```
[server] listening on http://127.0.0.1:3001
[email] SMTP ready, notifying support@callstalk.com
[telegram] listening for replies as @CTLKMBOT
```

A rising `restarts` count means the process keeps crashing. Read `pm2 logs callstalk-chat --err --lines 100 --nostream`.

---

## 3. Routine checklist

| How often | Task | Section |
|---|---|---|
| Daily (automatic) | Database backup | [7.2](#72-automatic-daily-backups) |
| Daily (automatic) | Certificate renewal check | [9](#9-https-certificates) |
| Weekly | Health check, read the error log | [2](#2-quick-health-check), [5](#5-logs) |
| Weekly | Confirm the newest backup exists and is not empty | [7.2](#72-automatic-daily-backups) |
| Monthly | Disk space, log sizes | [12](#12-disk-space) |
| Monthly | Security updates for npm packages | [10.2](#102-npm-packages) |
| Monthly | Ubuntu updates (**shared**, pick a quiet time) | [10.4](#104-ubuntu-packages-shared) |
| Every 3 months | Test-restore a backup | [7.4](#74-test-a-backup) |
| Every 3 months | Clean up old chats (optional) | [7.6](#76-delete-old-chats) |
| Yearly | Rotate the SMTP, Telegram and Groq credentials | [11](#11-changing-credentials-and-settings) |

---

## 4. Start, stop, restart

```bash
pm2 restart callstalk-chat        # after any .env change or code update
pm2 stop callstalk-chat           # takes the whole site offline (nginx returns 502)
pm2 start callstalk-chat          # after a stop
pm2 save                          # remember the current process list for reboots (all PM2 apps)
```

The server reads `.env` only when it starts, so every settings change needs a restart.

**Never run a second copy.** Don't run `npm start` in `server/` while PM2 is running it. Two processes polling
the same Telegram bot conflict (Telegram returns 409 errors and replies get lost). If you need to run it by
hand, `pm2 stop callstalk-chat` first.

### If the PM2 process is lost

For example after `pm2 delete` or a broken dump. Recreate it exactly like this:

```bash
cd /var/www/Callstalk/server
pm2 start src/index.js --name callstalk-chat \
  --interpreter /opt/node24/bin/node --node-args="--env-file=.env" \
  --max-memory-restart 300M --time
pm2 save
```

Don't use `ecosystem.config.cjs` on this VPS. It would start the server with the system Node 20, which is too old.

### After a reboot

PM2 brings back every saved process. Check:

```bash
pm2 list | grep callstalk-chat
```

If it is missing, follow "If the PM2 process is lost" above.

---

## 5. Logs

```bash
pm2 logs callstalk-chat                          # live (Ctrl+C to stop)
pm2 logs callstalk-chat --lines 200 --nostream   # last 200 lines
pm2 logs callstalk-chat --err --lines 100 --nostream
grep -i "error" /root/.pm2/logs/callstalk-chat-error.log | tail -50
```

What the prefixes mean:

| Prefix | Source |
|---|---|
| `[server]` | Startup, site serving |
| `[db]` | PostgreSQL connection |
| `[telegram]` | Bot polling, posting to the group |
| `[email]` | SMTP login and sending |
| `[reply]` | The email reply page |
| `[expire]` | Chats ended after `CHAT_TIMEOUT_HOURS` of silence |
| `[api/chat]` | AI assistant calls to Groq |
| `[config]` | Missing settings at startup (the process exits) |

nginx logs (**shared** files, every site writes to them):

```bash
grep callstalk.com /var/log/nginx/access.log | tail -50
tail -50 /var/log/nginx/error.log
```

PostgreSQL log: `/var/log/postgresql/postgresql-18-main.log`.

### Log rotation

PM2 log files grow forever unless rotated. Check whether `pm2-logrotate` is already installed:

```bash
pm2 ls | grep -i logrotate
```

If it isn't, installing it rotates the logs of **all** PM2 apps on the VPS (**shared**, usually wanted):

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 14
pm2 set pm2-logrotate:compress true
```

To empty the CallsTalk logs only: `pm2 flush callstalk-chat`.

---

## 6. Deploying updates

Pushes to `fullstack-v1` deploy themselves within about a minute ([6.4](#64-automatic-deploys)). The manual steps
below are what that script runs, and still work any time.

### 6.1 Normal update

First push the changes to the `fullstack-v1` branch from your PC. Then, on the VPS:

```bash
export PATH=/opt/node24/bin:$PATH          # Node 24 for this shell only
cd /var/www/Callstalk
git log --oneline -1                       # note the current commit, in case you need to roll back
git pull
npm ci                                     # site dependencies
npm run build                              # rebuilds dist/
VITE_PORTAL_API_URL=/api VITE_SITE_URL=https://callstalk.com npm run portal:build   # rebuilds portal/dist (portal.callstalk.com)
cd server && npm ci --omit=dev             # server dependencies
pm2 restart callstalk-chat
```

Then run the [health check](#2-quick-health-check) and open https://callstalk.com in a private browser window.

If only `server/` changed, you can skip `npm ci` and `npm run build` in the root. If only the website changed,
you can skip `server/` `npm ci`. Running everything is always safe.

### 6.2 Roll back

```bash
export PATH=/opt/node24/bin:$PATH
cd /var/www/Callstalk
git log --oneline -10                      # find the last good commit
git checkout <good-commit>
npm ci && npm run build
cd server && npm ci --omit=dev
pm2 restart callstalk-chat
```

The checkout leaves the folder on a detached commit, which also pauses automatic deploys. When the fix is pushed,
go back to the branch:

```bash
cd /var/www/Callstalk && git checkout fullstack-v1 && git pull
```

and redeploy as in 6.1. Rolling back code never changes the database, and the server only ever adds tables.

### 6.3 If `git pull` refuses to run

`git status` shows which files were changed on the server. The `.env` files and `dist/` are ignored by git, so
they are never the cause. Discard other local edits with `git checkout -- <file>`, or `git stash`.

### 6.4 Automatic deploys

`server/deploy/autodeploy.sh` runs from cron every minute. When `fullstack-v1` has a new commit, it pulls it and
runs only the steps from 6.1 that the changed files need:

| Changed | Steps |
|---|---|
| Site or portal files (anything outside `server/` and `docs/`) | Build the site and the portal; `npm ci` first only if `package-lock.json` changed |
| `server/package.json` or `server/package-lock.json` | `npm ci --omit=dev` in `server/` |
| Anything outside `docs/` | `pm2 restart callstalk-chat`, then wait up to a minute for `/api/health` |

If a build fails or the server does not answer `/api/health`, the previous commit is put back, rebuilt and
restarted. The failed commit is not tried again; push a fix and that deploys as usual. To retry the same commit
(say, after fixing `.env`), run `rm /var/www/Callstalk/.git/autodeploy-failed`.

It does nothing (and logs why, once) when:

- files were changed on the server ([6.3](#63-if-git-pull-refuses-to-run));
- the branch was force-pushed, so the new commit does not follow the deployed one: deploy that one by hand;
- `git fetch` fails, for example because GitHub access on the VPS stopped working.

It is paused, without logging, while the folder is on a detached commit after a [roll back](#62-roll-back).

**Log:** `/var/log/callstalk-deploy.log`. Each deploy starts with `deploying <new> over <old>` and ends with
`deployed <new>`, or `FAILED` and what happened next.

```bash
tail -50 /var/log/callstalk-deploy.log
```

**Set up, once.** The first run deploys everything pushed since the last manual pull, from the new script, in
cron's bare environment, so it also proves cron can find `node`, `npm`, `pm2` and GitHub. It prints nothing if
there is nothing new, and nothing either if `git status` does not say `On branch fullstack-v1`.

```bash
cd /var/www/Callstalk
git fetch origin fullstack-v1
env -i HOME=/root PATH=/usr/bin:/bin bash <(git show FETCH_HEAD:server/deploy/autodeploy.sh)
( crontab -l 2>/dev/null; echo "* * * * * /bin/bash /var/www/Callstalk/server/deploy/autodeploy.sh >> /var/log/callstalk-deploy.log 2>&1" ) | crontab -
crontab -l | grep autodeploy
cat > /etc/logrotate.d/callstalk-deploy <<'EOF'
/var/log/callstalk-deploy.log {
    monthly
    rotate 6
    compress
    missingok
    notifempty
}
EOF
```

**Turn it off:** `crontab -e` and delete the `autodeploy.sh` line. A deploy that is already running finishes first.

---

## 7. Database

### 7.1 Connect

```bash
sudo -u postgres psql -d callstalk_chat
```

Tables:

| Table | Holds |
|---|---|
| `sessions` | One row per chat: id, short id, visitor name and email, `open`/`ended`, Telegram topic, start time |
| `messages` | Every message: `visitor`, `agent` (team) or other senders, with the team member's name |
| `telegram_links` | Which Telegram message belongs to which chat, so replying to it reaches the right visitor |
| `kv` | Server state: `reply_link_secret` (signs email links), `telegram_offset` (bot polling position) |

The server creates these tables on startup if they are missing.

Useful queries:

```sql
-- Open chats, newest first
SELECT short_id, name, email, created_at FROM sessions WHERE status = 'open' ORDER BY created_at DESC;

-- Chats per day, last 30 days
SELECT date(created_at) AS day, count(*) FROM sessions
WHERE created_at > now() - interval '30 days' GROUP BY 1 ORDER BY 1 DESC;

-- One chat's transcript by its #id
SELECT m.created_at, m.sender, m.sender_name, m.message
FROM messages m JOIN sessions s ON s.id = m.session_id
WHERE s.short_id = 'a1b2c3d4' ORDER BY m.id;

-- Database size
SELECT pg_size_pretty(pg_database_size('callstalk_chat'));
```

### 7.2 Automatic daily backups

One-time setup. Create the backup script:

```bash
cat > /usr/local/bin/callstalk-backup.sh <<'EOF'
#!/bin/sh
# Daily dump of the CallsTalk chat database and server settings; keeps 14 days.
set -e
DIR=/var/backups/callstalk
STAMP=$(date +%F)
mkdir -p "$DIR" && chmod 700 "$DIR"
sudo -u postgres pg_dump -Fc callstalk_chat > "$DIR/callstalk_chat-$STAMP.dump"
cp /var/www/Callstalk/server/.env "$DIR/server-env-$STAMP"
chmod 600 "$DIR"/*
find "$DIR" -type f -mtime +14 -delete
EOF
chmod 700 /usr/local/bin/callstalk-backup.sh
/usr/local/bin/callstalk-backup.sh && ls -lh /var/backups/callstalk
```

Schedule it for 03:15 every day:

```bash
( crontab -l 2>/dev/null; echo "15 3 * * * /usr/local/bin/callstalk-backup.sh >> /var/log/callstalk-backup.log 2>&1" ) | crontab -
crontab -l | grep callstalk
```

Weekly check: the newest file should be from today and more than a few KB.

```bash
ls -lht /var/backups/callstalk | head -5
```

### 7.3 Off-server copies

A backup that only lives on the VPS is lost with the VPS. Copy it to your PC now and then. Run this **on your PC**:

```bash
scp root@168.231.112.65:/var/backups/callstalk/callstalk_chat-$(date +%F).dump .
```

Or use Hostinger's VPS snapshots in hPanel (VPS → Backups), which copy the whole server.

The `server-env-*` files contain every password. Keep copies private.

### 7.4 Test a backup

This restores into a scratch database and never touches the live one:

```bash
sudo -u postgres createdb callstalk_restore_test
sudo -u postgres pg_restore -d callstalk_restore_test --no-owner /var/backups/callstalk/callstalk_chat-YYYY-MM-DD.dump
sudo -u postgres psql -d callstalk_restore_test -c "SELECT count(*) FROM sessions;"
sudo -u postgres dropdb callstalk_restore_test
```

### 7.5 Restore after data loss

This replaces the live data with the backup. Chats since the backup are lost.

```bash
pm2 stop callstalk-chat
sudo -u postgres psql -c "DROP DATABASE callstalk_chat;"
sudo -u postgres psql -c "CREATE DATABASE callstalk_chat OWNER callstalk_chat;"
sudo -u postgres pg_restore -d callstalk_chat --no-owner --role=callstalk_chat /var/backups/callstalk/callstalk_chat-YYYY-MM-DD.dump
pm2 start callstalk-chat
```

The backup includes `reply_link_secret`, so email links sent before the backup keep working.

### 7.6 Delete old chats

Optional. This keeps the database small and removes visitor data you no longer need. It deletes ended chats
older than 180 days; their messages and Telegram links go with them:

```bash
sudo -u postgres psql -d callstalk_chat -c \
  "DELETE FROM sessions WHERE status <> 'open' AND created_at < now() - interval '180 days';"
```

Take a backup first (`/usr/local/bin/callstalk-backup.sh`). Old Telegram messages for those chats remain in the
group, but replying to them does nothing.

### 7.7 Change the database password

```bash
sudo -u postgres psql -c "ALTER ROLE callstalk_chat PASSWORD 'new-strong-password';"
nano /var/www/Callstalk/server/.env          # set DB_PASSWORD to the same value
pm2 restart callstalk-chat
```

### 7.8 PostgreSQL itself (**shared**)

The CRM and other apps use the same PostgreSQL server. Don't restart it casually:
`systemctl restart postgresql` drops every app's connections. CallsTalk reconnects by itself, but chats sent during the restart fail.
Autovacuum is on by default, and the chat tables need no manual vacuuming.

---

## 8. DNS (hPanel → Domains → callstalk.com → DNS / Nameservers)

| Type | Name | Points to | Purpose |
|---|---|---|---|
| A | `@` | `168.231.112.65` | The site |
| CNAME | `www` | `callstalk.com` | www follows the site |
| CNAME | `chat` | `callstalk.com` | Old email links (`chat.callstalk.com/reply/...`) |
| A | `portal` | `168.231.112.65` | Customer portal (logins, billing, admin) |
| MX | `@` | `mx1.hostinger.com` (5), `mx2.hostinger.com` (10) | Incoming mail |
| TXT | `@` | `v=spf1 include:_spf.mail.hostinger.com ~all` | Allows Hostinger to send as callstalk.com |
| CNAME | `hostingermail-a/b/c._domainkey` | `hostingermail-a/b/c.dkim.mail.hostinger.com` | DKIM email signing |
| TXT | `_dmarc` | `v=DMARC1; p=none` | Email policy |
| CNAME | `autodiscover`, `autoconfig` | Hostinger mail hosts | Mail app setup |

Rules:

- Only the `A @` record decides where the site lives. If the VPS IP ever changes, edit that one record.
- Never delete the MX, SPF, DKIM or DMARC records. Doing so stops mail to `support@callstalk.com`, and the
  notification emails start landing in spam.
- Don't turn on a Hostinger website plan or Hostinger CDN for callstalk.com. Either one would point the domain away
  from the VPS again.

Check from the VPS:

```bash
resolvectl flush-caches
getent hosts callstalk.com www.callstalk.com chat.callstalk.com     # all 168.231.112.65
```

---

## 9. HTTPS certificates

Certbot renews automatically through a systemd timer (**shared** with the other sites' certificates).

```bash
certbot certificates                                # names covered, expiry date
systemctl list-timers | grep certbot                # next automatic run
certbot renew --dry-run                             # test renewal without changing anything
```

Add a name to the certificate, for example a new subdomain. Its DNS must point here first:

```bash
certbot --nginx -d callstalk.com -d www.callstalk.com -d chat.callstalk.com -d NEW.callstalk.com --expand --redirect -n
```

Renewal fails if DNS no longer points at the VPS, or if port 80 is blocked. Let's Encrypt allows only 5
failed attempts per hour per name, so fix the cause before retrying.

---

## 10. Updates

### 10.1 The site and server code

See [6. Deploying updates](#6-deploying-updates).

### 10.2 npm packages

Check for known security issues:

```bash
export PATH=/opt/node24/bin:$PATH
cd /var/www/Callstalk/server && npm audit --omit=dev
cd /var/www/Callstalk && npm audit
```

Fix them on your PC, not on the server: update the packages, test locally, commit the new
`package-lock.json`, then deploy as in 6.1. Running `npm audit fix` on the VPS would leave changes there
that the next `git pull` conflicts with.

### 10.3 Node.js 24

Updating to the newest Node 24 release installs it alongside the current one, switches over, and keeps the
old copy for rollback:

```bash
cd /tmp
curl -fsSLO https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt
VER=$(grep -o 'node-v24[^ ]*-linux-x64.tar.xz' SHASUMS256.txt | head -1)
curl -fsSLO https://nodejs.org/dist/latest-v24.x/$VER
grep " $VER\$" SHASUMS256.txt | sha256sum -c -        # must print: OK
mkdir -p /opt/node24-new && tar -xJf $VER -C /opt/node24-new --strip-components=1
/opt/node24-new/bin/node -v
mv /opt/node24 /opt/node24-old && mv /opt/node24-new /opt/node24
pm2 restart callstalk-chat && pm2 logs callstalk-chat --lines 10 --nostream
```

To roll back: `rm -rf /opt/node24 && mv /opt/node24-old /opt/node24 && pm2 restart callstalk-chat`.
When the new version has run fine for a week, delete the old one with `rm -rf /opt/node24-old`.

Don't upgrade the system Node (`apt`/NodeSource). The other PM2 bots depend on it, and CallsTalk doesn't use it.

### 10.4 Ubuntu packages (**shared**)

Updates can restart nginx, PostgreSQL and other services for every app on the VPS. Do them at a quiet time:

```bash
apt update && apt list --upgradable
apt upgrade -y
[ -f /var/run/reboot-required ] && echo "Reboot needed"
```

If a reboot is needed: `pm2 save`, then `reboot`. Afterwards, run the [health check](#2-quick-health-check) and
`pm2 list` to confirm all apps came back.

---

## 11. Changing credentials and settings

All of these are edits to `/var/www/Callstalk/server/.env`, followed by `pm2 restart callstalk-chat`.

| Setting | What it does | Notes |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | The bot that posts chats | See 11.1 |
| `TELEGRAM_CHAT_ID` | The support group | Send `/chatid` in a group to get its id |
| `TELEGRAM_THREAD_ID` | Post into one topic of a forum group | Optional |
| `TELEGRAM_TOPIC_PER_CHAT` | One forum topic per visitor | Needs Topics on and the bot's "Manage topics" right |
| `EMAIL_TO` | Who gets notification emails | Comma-separated; empty turns emails off |
| `EMAIL_FROM`, `SMTP_*` | Mailbox that sends them | See 11.2 |
| `PUBLIC_URL` | Base of the links in emails | Must stay `https://callstalk.com` |
| `REPLY_LINK_DAYS` | How long email reply links work | Default 30 |
| `DB_*` | Database connection | See 7.7 |
| `CORS_ALLOWED_ORIGINS` | Other sites allowed to call the chat API | `https://callstalk.com,https://www.callstalk.com` |
| `CHAT_TIMEOUT_HOURS` | End chats after this many quiet hours | `0` turns it off |
| `SERVE_SITE`, `SITE_DIR` | Serve the website from this server | Must stay `true` and `../dist` |
| `GROQ_API_KEY` | AI assistant | See 11.3 |
| `PORT`, `HOST` | Where Node listens | If you change `PORT`, update `proxy_pass` in the nginx site too |

`VITE_SUPPORT_API_URL` in `/var/www/Callstalk/.env` is different: it is baked into the website at build time.
After changing it, run `npm run build` (with Node 24 on PATH) and restart.

### 11.1 Telegram bot token

1. In @BotFather: `/mybots` → @CTLKMBOT → **API Token** → **Revoke current token**. Copy the new token.
2. Put it in `TELEGRAM_BOT_TOKEN`.
3. If you switched to a **different bot** (not just a new token for the same one), clear the saved polling
   position, then add the new bot to the group as an admin:
   ```bash
   sudo -u postgres psql -d callstalk_chat -c "DELETE FROM kv WHERE key = 'telegram_offset';"
   ```
4. `pm2 restart callstalk-chat`. The log should show `listening for replies as @...`.

Each bot token may only be used by one program. Never reuse a token from the other bots on this VPS.

### 11.2 Mailbox password

1. In hPanel → **Emails** → support@callstalk.com, change the password.
2. Set `SMTP_PASS` to it and restart.
3. The log should show `[email] SMTP ready`. If it shows `cannot log in`, the password or `SMTP_USER` is wrong.

### 11.3 Groq API key

Create a new key at console.groq.com, set `GROQ_API_KEY`, restart, then delete the old key in the Groq console.

### 11.4 Invalidate all email reply links

Do this if a notification email was forwarded outside the team. Anyone with the link can reply as the team.

```bash
sudo -u postgres psql -d callstalk_chat -c "DELETE FROM kv WHERE key = 'reply_link_secret';"
pm2 restart callstalk-chat
```

A new secret is created on startup. Every link in every email sent so far stops working; new emails get
working links.

---

## 12. Disk space

```bash
df -h /                                             # keep at least 15% free
du -sh /root/.pm2/logs /var/backups/callstalk /var/www/Callstalk
sudo -u postgres psql -c "SELECT pg_size_pretty(pg_database_size('callstalk_chat'));"
```

If space is short: flush or rotate logs ([5](#5-logs)), lower the backup retention in the backup script, or delete old
chats ([7.6](#76-delete-old-chats)). The `node_modules` folders can be deleted and reinstalled with `npm ci` at any time.

---

## 13. Security

- `server/.env` holds every secret. Keep it at mode 600 (`chmod 600 /var/www/Callstalk/server/.env`) and never
  commit it; git already ignores it.
- Port 3001 and PostgreSQL listen on `127.0.0.1` only. Don't change `HOST`, and don't open 3001 or 5432 in ufw
  or the hPanel firewall.
- The firewall (**shared**) allows SSH and Nginx Full: `ufw status`.
- The server rate-limits the public endpoints per IP:

  | Endpoint | Limit |
  |---|---|
  | Start a chat (`POST /api/support/chat`) | 5 per 10 minutes |
  | Visitor message | 30 per minute |
  | Chat polling | 120 per minute |
  | End chat | 10 per minute |
  | Reply page view / submit | 60 / 20 per minute |

  The limits are kept in memory, so they reset whenever the process restarts.
- On top of those, every `/api` request is limited (`server/src/index.js`, `server/src/rate-limit.js`):

  | What | Limit | Past it |
  |---|---|---|
  | Requests per address | 300 a minute | 429, with `Retry-After` |
  | Requests in progress per address | 12 | 429 at once (no queueing) |
  | Requests in progress, whole API | 400 | 503 at once |
  | Session renewals per address | 60 per 10 minutes | 429 |
  | Finance reports and Audit Log summaries/downloads | 2 at a time, 10 more wait up to 15 s; 60 a minute and 20 downloads per 10 minutes per login | 503 / 429 |

  Slow clients are cut off (headers within 15 s, a whole request within 60 s), every database query is stopped
  after 15 s, and a request waits at most 5 s for a database connection. Large bodies (report uploads, photos)
  are only read after the login is checked.
- nginx limits before Node (`server/deploy/nginx-portal.conf`, `server/deploy/nginx.conf`): 10 API requests a
  second per address (bursts of 60), 12 sign-in requests a minute, 30 connections, and short timeouts. A flood
  larger than the server's own connection can only be stopped in front of it (a CDN such as Cloudflare, or the
  host's DDoS protection).
- Portal sessions live in **HttpOnly cookies** that no script can read; the browser keeps only the login's email,
  name and role. Changes sent with the cookie must come from the portal itself (its Origin and an `X-CallsTalk`
  header), and the portal page runs only its own scripts (Content-Security-Policy in nginx). Setup links carry their
  token after `#`, so it never reaches a server log.
- **Concurrency:** logins, billing terms and days have a version. A save made from an older version is refused
  (409, "Someone else saved a change here...") and the page reloads the latest, so two admins never silently
  overwrite each other. Changes that could remove the last admin run one at a time.
- Reply links are signed and expire after `REPLY_LINK_DAYS`. Treat notification emails as internal; see 11.4.
- The Telegram group decides who can answer visitors. Remove people from the group when they leave the team.

---

## 14. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Site shows `502 Bad Gateway` | Node process stopped or crashing | `pm2 list`, `pm2 logs callstalk-chat --err --lines 50 --nostream`, then `pm2 restart callstalk-chat` |
| Site shows `{"detail":"Not found."}` | `SERVE_SITE` is not `true`, or `dist/index.html` is missing | Set `SERVE_SITE=true`; rebuild ([6.1](#61-normal-update)); restart |
| Browser: "DNS address could not be found" | Missing DNS record (e.g. `chat`) | Add it ([8](#8-dns-hpanel--domains--callstalkcom--dns--nameservers)) |
| Browser certificate warning | Certificate expired, or a name isn't on it | `certbot certificates`; `certbot renew`, or `--expand` ([9](#9-https-certificates)) |
| Site loads, no "Talk to Our Team" button | Site built without `VITE_SUPPORT_API_URL` | Check `/var/www/Callstalk/.env`, rebuild, restart |
| AI assistant answers fail | `GROQ_API_KEY` missing or revoked, or Groq is down | `pm2 logs ... \| grep api/chat`; replace the key ([11.3](#113-groq-api-key)) |
| Log: `[config] Missing required settings` | A required `.env` value is empty | Fill it in, restart |
| Log: `[db] cannot use PostgreSQL database` | Wrong `DB_PASSWORD`, or PostgreSQL is down | `systemctl status postgresql`; test with `PGPASSWORD=... psql -h 127.0.0.1 -U callstalk_chat -d callstalk_chat -c "select 1"` |
| Log: `[email] cannot log in` | SMTP password changed or wrong | [11.2](#112-mailbox-password) |
| Notification emails go to spam | SPF/DKIM records missing or changed | Restore them ([8](#8-dns-hpanel--domains--callstalkcom--dns--nameservers)) |
| Email "Reply" link says "not valid" | Link cut off, or the secret was reset | Use a newer email; links from before 11.4 never work again |
| Email "Reply" link says "expired" | Older than `REPLY_LINK_DAYS` | Use a newer email, or reply in Telegram |
| Chats don't reach Telegram | Bot removed from the group, not an admin, or wrong `TELEGRAM_CHAT_ID` | Re-add the bot as admin; check the id with `/chatid` |
| Telegram replies don't reach visitors | Bot isn't an admin, so it can't see replies; or a second copy is polling (409 in the log) | Make the bot an admin; stop the duplicate ([4](#4-start-stop-restart)) |
| Log: `409 Conflict` from Telegram | Two programs use the same bot token | Find and stop the other one; never share tokens |
| Visitor's chat ended by itself | No messages for `CHAT_TIMEOUT_HOURS` | Expected; change the hours or set `0` |
| Visitor gets "Too many requests" | Rate limit hit (often testing from one IP) | Wait for the window to pass, or restart the process |
| `restarts` keeps rising, memory near 300 MB | Memory limit restarts | Check the logs for a loop; raise `--max-memory-restart` only if usage is legitimately higher |

---

## 15. Rebuilding the server from scratch

If the VPS is lost, a new Ubuntu 24.04 server can be set up from these files:

1. **DNS:** point `A @` at the new IP ([8](#8-dns-hpanel--domains--callstalkcom--dns--nameservers)).
2. **Software:** install nginx, PostgreSQL 18, PM2 (`npm i -g pm2` with any Node) and Node 24 in
   `/opt/node24` ([10.3](#103-nodejs-24), using `/opt/node24` directly).
3. **Database:** create the role and database, then restore the newest dump ([7.5](#75-restore-after-data-loss)).
4. **Code:** `git clone -b fullstack-v1 https://github.com/009K-AVTX/CallsTalk-Marketing.git /var/www/Callstalk`,
   then copy the saved `server-env-*` backup to `server/.env` and recreate the root `.env`.
5. **Build and run:** as in [6.1](#61-normal-update), then create the PM2 process ([4](#4-start-stop-restart)).
6. **nginx and HTTPS:** recreate `/etc/nginx/sites-available/callstalk.com` (below), enable it, then run certbot ([9](#9-https-certificates)).
7. **Backups:** set up the cron job again ([7.2](#72-automatic-daily-backups)).

The nginx site, as it was before certbot added the HTTPS parts:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name callstalk.com www.callstalk.com chat.callstalk.com;

    client_max_body_size 64k;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## 16. Customer portal (portal.callstalk.com)

Customers log in at **https://portal.callstalk.com** (the website's Log In goes there). Every login has a password
**and** a 6-digit code from an authenticator app. Admins log in at the same address and get the admin pages.

| Item | Value |
|---|---|
| Built portal | `/var/www/Callstalk/portal/dist` (served by nginx) |
| API | The same Node process, `/api/accounts`, `/api/admin`, `/api/billing`, `/api/portal`, `/api/staff` |
| nginx site | `/etc/nginx/sites-available/portal.callstalk.com` (from `server/deploy/nginx-portal.conf`) |
| Data | Tables `portal_*`, `billing_*` and `audit_log` in the `callstalk_chat` database, created on startup |

### 16.1 First-time setup

1. DNS: add the `A portal 168.231.112.65` record from [section 8](#8-dns-hpanel--domains--callstalkcom--dns--nameservers).
2. Deploy the code as in [6.1](#61-normal-update) (it also builds `portal/dist` and installs the new server package).
3. nginx and HTTPS (**shared**: `nginx -t` before reloading):

   ```bash
   cp /var/www/Callstalk/server/deploy/nginx-portal.conf /etc/nginx/sites-available/portal.callstalk.com
   ln -s /etc/nginx/sites-available/portal.callstalk.com /etc/nginx/sites-enabled/
   nginx -t && systemctl reload nginx
   certbot --nginx -d portal.callstalk.com
   ```

4. The first admin (prints a one-use setup link and emails it):

   ```bash
   cd /var/www/Callstalk/server && npm run portal:admin -- you@callstalk.com "Your Name"
   ```

   Open the link, scan the QR code with an authenticator app, choose a password and enter the code. Every
   other login is then made in the portal under **Logins**.

### 16.2 Day to day (in the portal, as an admin)

- **New login:** Logins → New Login. Customers also get their price per call, opening balance and start date.
  The setup link is emailed to them (it works once, for 7 days); the page also shows it to copy.
- **Roles:** **Customer** sees their own billing and reports. **Staff** can only upload and remove customer reports
  (they land on `/upload`; no billing, payments or logins). **Admin** can do everything.
- **Billing:** open a customer → enter each day's **billable calls** and **payments** received. Customers see
  their balance and the last five days; older days go to them as Excel reports (Reports → upload).
- **Lost phone or forgotten password:** open the login → **Reset Login and Send Link**. Their old password and
  code app stop working at once.
- **Someone leaves:** **Turn Login Off** signs them out everywhere and blocks logging in.
- **Finance:** billed, collected and owed across all customers (or one) for any period, with charts and a table per
  customer. **Download** gives a PDF report or CSVs (by customer, per day, payments). The figures follow the same
  rules as each customer's own bill.
- **Audit Log:** every change made in the portal (logins, billing terms, calls, payments, reports, contact details,
  passwords), every sign-in and failed sign-in, deposits credited by the payment check, and every Finance or Audit
  Log download: who, when, from which IP and device, and the values before and after. Open an entry to see it all;
  download the filtered list as PDF or CSV. A login's page shows its own **Recent Activity**. Entries are kept for
  good (table `audit_log`) and cannot be edited or deleted from the portal. A new API route that changes something
  must be added to `ROUTES` in `server/src/audit.js` to be logged.

### 16.3 Customer payments (USDT, TRC-20)

Customers pay in **USDT on the TRON network (TRC-20)** through Well Wallet. The portal never names the provider.

- Pressing **Pay** gives the customer their own TRC-20 address (made once in Well Wallet, then kept). Anything they
  send to it is theirs: it shows as **pending** while in progress and counts towards the balance once **completed**
  (1 USDT = $1).
- The server reads deposits from the Well Wallet API every 2 minutes, and straight away when Well Wallet's webhook
  arrives. The webhook body is never trusted, only used as a cue to check.
- Admins can still record other payments by hand (bank transfer and so on).

Setting it up, once:

1. In the Well Wallet bot: Settings → Settings → API → API Keys Management → create a key, and switch on the
   **Wallets** and **Transactions** APIs for it. Turn on 2FA and the backup email (Settings → Security), as they ask.
2. The VPS IP `168.231.112.65` must be on Well Wallet's allowlist. It already is for the TOPUP bot's account; if
   CallsTalk uses a different Well Wallet account, send the IP to support (https://t.me/WellWallet_Support), which
   takes up to 2 business days. A blocked IP shows in the log as "blocked (HTTP 403) ... allowlist".
3. In `/var/www/Callstalk/server/.env` set `WELLWALLET_API_TOKEN` and a long random `WELLWALLET_WEBHOOK_KEY`
   (`openssl rand -hex 24`), then `pm2 restart callstalk-chat`. The log shows no "[payments] ... is not set" line.
4. Webhook (optional, deposits are also checked every 2 minutes): in the bot, Settings → Settings → API →
   Webhooks Management, or through Well Wallet support, register
   `https://portal.callstalk.com/api/payments/webhook?key=<WELLWALLET_WEBHOOK_KEY>`. If the account is shared with the
   TOPUP bot and allows only one webhook, keep TOPUP's and rely on the 2-minute check.

Wallets are made as `accounting` (exchange) wallets, one per customer, named `CallsTalk <company>`, and are never
deleted. Well Wallet allows 500 per network per account; the TOPUP bot's clean-up only touches its own `tg-...`
wallets, but on a shared account both count towards the 500.

Check: `pm2 logs callstalk-chat --lines 50 --nostream | grep payments` shows each address made and each deposit.
Without the token, Pay tells customers to contact us and admins record payments by hand.

### 16.3.1 Telegram notifications

The same bot (`@CTLKMBOT`) also sends billing notices. Nothing new to install; the tables are created on startup.

**Buyers: "Your report has been updated."**

1. The buyer opens **Settings** in the portal and presses **Connect Telegram**. Telegram opens the bot with a one-use
   link (it works for `TELEGRAM_LINK_MINUTES`, 15 by default); they press **Start** and the portal shows
   **Connected**. Only the buyer can do this: the team cannot connect someone's Telegram for them.
2. When staff or an admin uploads a report, **Send on Telegram** (next to **Email the customer**) sends the buyer
   "Your report has been updated. You can now download it from your portal." with the report's name, period and an
   **Open Report** button. It is greyed out for buyers who have not connected; the customer list marks the ones who
   have with "· Telegram".
3. A buyer stops the messages with **Disconnect** in Settings or `/stop` in the bot. If they block the bot, the next
   message fails and they are disconnected automatically; the upload page says so.

An admin can see whether a buyer is connected on that buyer's page (**Contact Methods** card). Connecting and
disconnecting are in the Audit Log.

**Team: payments and the daily paid/pending summary**

- **Payment Received**: each payment that completes (a USDT deposit, or one an admin records), with the buyer's
  new balance and whether they are now **Paid** (and how many more calls their credit covers at their price) or
  still **Pending** (what they owe and how many calls that is).
- **Email Each Payment to the Team**: the same details emailed to `EMAIL_TO`, with an **Open Customer** button.
  Replying to it writes to the buyer.
- **Confirm Each Payment to the Buyer**: the buyer gets a **Payment Received** email (amount, how it was paid, when,
  and their new balance, with a **View My Billing** button) and the same as a Telegram message if they connected
  Telegram. A payment an admin records shows as "Recorded by our team", never the admin's name. Only buyers with
  an active login are told.
- Every payment notice, the team's and the buyer's, shows a USDT deposit's **From Wallet** (the sender's address)
  and **Transaction Hash**, or the **Reference** an admin entered for a payment they record. In Telegram they are
  monospace, so a tap copies them.
- **Daily Billing Summary**: every buyer, Pending first (largest debt first), then Paid (closest to running out
  first), under the totals owed, held in credit and still confirming. Each group is an aligned monospace table of the
  buyer, their price per call, what they owe (or hold in credit) and the calls that stands for (or still covers).
  Amounts are US dollars. Tables are 36 characters wide so they do not wrap on a phone, and long names are cut with
  "…". Deactivated logins are left out.

  ```
  Pending (2)
  Buyer           Price    Owed  Calls
  Acme Leads       0.45  812.25  1,805
  Blue Harbor I…   0.50  372.50    745
  ```
- **/buyers**: the same summary as of that moment, sent in the support chat or the billing chat. It answers even
  when the daily summary is switched off.

Admins switch each on or off and set the summary's time (EST) under **Settings → Billing Notifications**;
**Post Summary Now** sends one straight away. The first summary goes out the day after this version is deployed.

Keep them out of the website-chat thread: either make a topic for billing in the support group and set
`TELEGRAM_BILLING_THREAD_ID` (send `/chatid` inside that topic to get its id), or put the bot in a separate group
and set `TELEGRAM_BILLING_CHAT_ID`. Then `pm2 restart callstalk-chat`. With neither set, they post in the support
chat itself, and the Settings card says so.

Only the live server posts or emails these by itself. A copy started with `TELEGRAM_POLLING=false` or
`NODE_ENV=development` (a local copy borrowing the live bot) sends nothing on its own, so buyers in a local database
are never emailed, and its **Post Summary Now** is labelled **Local test**.

Check: `pm2 logs callstalk-chat --lines 50 --nostream | grep -E "billing|connected Telegram"`.

| Symptom | Fix |
|---|---|
| Buyer pressed Start but the portal still waits | The link expired or was used twice: press Connect Telegram again. The bot must be running (`listening for replies` in the log). |
| Upload says "they blocked the bot" | The buyer blocked or deleted the chat. They reconnect from Settings. |
| No payment or summary messages | Check the switches in Settings; `[billing] could not post` in the log means the bot is not in the billing chat or topic. |
| A payment email did not arrive | `[billing] could not tell the team by email` or `the buyer by email` in the log, with the SMTP error. One failing never stops the others. |

### 16.4 If an admin is locked out

With no other admin to reset them, run `npm run portal:admin -- their@email.com` in `server/`. It resets that
login and prints a new setup link.

### 16.5 Once, when deploying the cookie sessions and limits

1. Deploy as in [6.1](#61-normal-update). The portal must be built with `VITE_PORTAL_API_URL=/api` (it already
   is): session cookies only go to the portal's own address.
2. Install the new nginx configs (**shared**: always `nginx -t` before reloading):

   ```bash
   cp /var/www/Callstalk/server/deploy/nginx-portal.conf /etc/nginx/sites-available/portal.callstalk.com
   cp /var/www/Callstalk/server/deploy/nginx.conf /etc/nginx/sites-available/callstalk-chat   # if that site is in use
   nginx -t && systemctl reload nginx
   ```

   Certbot added the HTTPS lines to these files when it was first run; run `certbot --nginx -d portal.callstalk.com`
   (and the chat domain) again after copying so they come back.
3. Everyone signs in once more: sessions from before were kept by the browser itself and are dropped.

Check: in the browser's developer tools on the portal, Application → Local Storage shows no tokens, and
`document.cookie` in the console prints an empty string.
