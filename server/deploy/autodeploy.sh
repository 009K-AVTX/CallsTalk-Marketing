#!/usr/bin/env bash
# Deploys new commits on fullstack-v1 to the VPS. Cron runs it every minute; when the branch has not moved it
# does nothing and prints nothing. The steps are the manual ones in docs/maintenance.md (6.1), limited to what
# the new commits touch:
#
#   site or portal files     npm ci (only if package-lock.json changed), build the site and the portal
#   server/package*.json     npm ci --omit=dev in server/
#   anything but docs/       pm2 restart, then wait for /api/health
#
# If a step fails or the server does not come back healthy, the previous commit is put back, rebuilt and
# restarted, and the failed commit is not tried again until a newer one is pushed.
# A manual rollback (git checkout <commit>, which leaves the branch) pauses it until the branch is checked out.
#
#   * * * * * /bin/bash /var/www/Callstalk/server/deploy/autodeploy.sh >> /var/log/callstalk-deploy.log 2>&1

set -euo pipefail

REPO=${CALLSTALK_REPO:-/var/www/Callstalk}
BRANCH=fullstack-v1
APP=callstalk-chat
# Node 24 for the builds (the system Node belongs to the other bots); cron's own PATH is only /usr/bin:/bin.
export PATH="/opt/node24/bin:$PATH:/usr/local/sbin:/usr/local/bin:/usr/sbin:/sbin"
export HOME=${HOME:-/root}
export GIT_TERMINAL_PROMPT=0 # fail instead of waiting for a password nobody will type

FAILED=$REPO/.git/autodeploy-failed # the commit that last failed to deploy
NOTE=$REPO/.git/autodeploy-note     # the last problem logged, so a repeating one is logged once

log() { echo "$(date '+%F %T') $*"; }
note() { [ "$(cat "$NOTE" 2>/dev/null)" = "$*" ] || { log "$*"; echo "$*" > "$NOTE"; }; }
short() { git rev-parse --short "$1"; }

healthy() {
  local port
  port=$(sed -n 's/^PORT=//p' "$REPO/server/.env" 2>/dev/null | tr -d "\"' \r")
  for _ in $(seq 30); do
    sleep 2
    curl -fsS -m 5 "http://127.0.0.1:${port:-3001}/api/health" > /dev/null 2>&1 && return 0
  done
  return 1
}

# Runs the steps the changed files need ("all" runs every step). Each step stops it on failure by hand:
# set -e does not apply inside a function called from an if.
build() {
  local changed=$1
  touches() { [ "$changed" = all ] || grep -qE "$1" <<< "$changed"; }
  touches_other_than() { [ "$changed" = all ] || grep -qvE "$1" <<< "$changed"; }

  if touches_other_than '^(server|docs)/'; then
    if touches '^package(-lock)?\.json$' || [ ! -d "$REPO/node_modules" ]; then
      log "installing site packages"
      (cd "$REPO" && npm ci --no-audit --no-fund) || return 1
    fi
    log "building the site"
    (cd "$REPO" && npm run build) || return 1
    log "building the portal"
    (cd "$REPO" && VITE_PORTAL_API_URL=/api VITE_SITE_URL=https://callstalk.com npm run portal:build) || return 1
  fi
  if touches '^server/package(-lock)?\.json$' || [ ! -d "$REPO/server/node_modules" ]; then
    log "installing server packages"
    (cd "$REPO/server" && npm ci --omit=dev --no-audit --no-fund) || return 1
  fi
  if touches_other_than '^docs/'; then
    log "restarting $APP"
    pm2 restart "$APP" > /dev/null || return 1
    healthy || { log "$APP did not answer /api/health within a minute"; return 1; }
  fi
}

main() {
  cd "$REPO"
  exec 9> "$REPO/.git/autodeploy.lock"
  flock -n 9 || exit 0 # the previous run is still deploying

  [ "$(git symbolic-ref -q --short HEAD)" = "$BRANCH" ] || exit 0 # rolled back by hand: paused
  local out
  out=$(git fetch -q origin "$BRANCH" 2>&1) || { note "cannot fetch $BRANCH: $out"; exit 1; }

  local old new
  old=$(git rev-parse HEAD)
  new=$(git rev-parse FETCH_HEAD)
  [ "$old" != "$new" ] || exit 0
  [ "$(cat "$FAILED" 2>/dev/null)" != "$new" ] || exit 0
  if ! git merge-base --is-ancestor "$old" "$new"; then
    note "not deploying $(short "$new"): $BRANCH was rewritten (force push), so it does not follow $(short "$old"). Deploy it by hand."
    exit 1
  fi
  if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
    note "not deploying $(short "$new"): files were changed on the server (git status). See docs/maintenance.md 6.3."
    exit 1
  fi

  local changed
  changed=$(git diff --name-only "$old" "$new")
  log "deploying $(short "$new") over $(short "$old"): $(git log -1 --format=%s "$new")"
  if git merge -q --ff-only "$new" && { [ -z "$changed" ] || build "$changed"; }; then
    rm -f "$FAILED" "$NOTE"
    log "deployed $(short "$new")"
    exit 0
  fi

  log "FAILED to deploy $(short "$new"); putting $(short "$old") back"
  echo "$new" > "$FAILED"
  git reset -q --hard "$old"
  if build all; then
    log "back on $(short "$old"); $(short "$new") is skipped until a newer commit is pushed"
  else
    log "$(short "$old") did not come back either: the site needs a hand (docs/maintenance.md 6.2)"
  fi
  exit 1
}

# Read in full before it runs, so a deploy that changes this file does not change it under the running copy.
main "$@"
exit
