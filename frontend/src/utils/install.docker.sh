#!/usr/bin/env bash
#
# install.local.sh — local development installer for this project's ERPNext/
# Frappe stack, via Docker Compose (Docker Desktop). Sibling to install.sh
# (bare-metal production provisioning), update.sh (production code deploy),
# and crm-setup.sh (production config/data) — none of those apply here:
# local dev runs the "stable Hub image + prebuilt custom apps" stack
# (docker-compose.yml + docker-compose.apps.yml), not a bare-metal bench.
#
# What this does, in order:
#   1. Confirms Docker is actually reachable (Docker Desktop can take a
#      minute to come up, or can be down entirely — fail fast with a clear
#      message rather than a confusing timeout deep in `docker compose up`).
#   2. Creates the external bridge network the compose files expect
#      (`docker compose up` cannot create it itself — see the comment on
#      the `networks:` block in docker-compose.yml).
#   3. Ensures .env exists (copied from .env.example on first run only —
#      never overwrites an existing .env, since that holds the real
#      DB_PASSWORD/ADMIN_PASSWORD for this checkout).
#   4. Builds the custom image (Dockerfile.stable: the stock frappe/erpnext
#      Hub image + this repo's own docker/prebuilt-apps/* trees + apps/
#      micromax baked in via COPY, so no GitHub fetch is needed for any of
#      that — it's all already checked into this repo).
#   5. Brings the stack up and waits for the one-shot `create-site` service
#      to actually finish (site creation + hrms/crm/lms/wiki/helpdesk/
#      insights/payments/telephony/micromax/whatsapp install, per
#      docker-compose.apps.yml's create-site command) instead of racing it.
#   6. Smoke-checks the site actually answers over HTTP.
#
# What this does NOT do (deliberately out of scope, same separation-of-
# concerns as the production scripts):
#   - crm-setup.sh's CRM role/user/mail-account/custom-field config. That
#     script targets a bare-metal bench (sudo -iu, ~/frappe-bench paths) and
#     will NOT run as-is against this Docker stack — see the summary at the
#     end of this script for the docker-exec equivalent.
#   - The hik -> micromax data migration. Run that separately once this
#     script has a fresh site up.
#
# Usage (from anywhere — paths are resolved relative to this script, not
# your shell's cwd):
#   bash install.local.sh
# Every value below can be overridden via environment variable, e.g.:
#   SITE_NAME=frontend HTTP_PUBLISH_PORT=8080 bash install.local.sh
#
# Idempotent — safe to re-run. Docker's own layer cache makes a repeat
# `docker build` fast when nothing under docker/prebuilt-apps or apps/
# micromax changed; `create-site`'s own command already no-ops site
# creation (but still re-runs install-app for every app, harmless — bench
# treats an already-installed app as a no-op) when the site already exists.

set -euo pipefail

log()  { echo -e "\n\033[1;36m==>\033[0m $*"; }
warn() { echo -e "\033[1;33mWARN:\033[0m $*" >&2; }
die()  { echo -e "\033[1;31mERROR:\033[0m $*" >&2; exit 1; }

# ============================================================== Configuration
# Resolved relative to this script's own location (frontend/src/utils/),
# not the caller's cwd, so `bash install.local.sh` works from anywhere.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

COMPOSE_FILES=(-f "${PROJECT_ROOT}/docker-compose.yml" -f "${PROJECT_ROOT}/docker-compose.apps.yml")
ENV_FILE="${PROJECT_ROOT}/.env"
ENV_EXAMPLE="${PROJECT_ROOT}/.env.example"
DOCKERFILE="${PROJECT_ROOT}/Dockerfile.stable"
NETWORK_NAME="${NETWORK_NAME:-erpnext_frappe_network}"

# Overridable, but the real values that matter (DB_PASSWORD, ADMIN_PASSWORD,
# SITE_NAME, CUSTOM_IMAGE/TAG) live in .env once step 3 below has run —
# these are only fallbacks for reading .env's own values back out in the
# summary at the end, matching .env.example's own defaults.
SITE_NAME="${SITE_NAME:-frontend}"
CUSTOM_IMAGE="${CUSTOM_IMAGE:-erpnext-apps}"
CUSTOM_TAG="${CUSTOM_TAG:-16}"
HTTP_PUBLISH_PORT="${HTTP_PUBLISH_PORT:-8080}"
CREATE_SITE_TIMEOUT="${CREATE_SITE_TIMEOUT:-600}"

command -v docker >/dev/null || die "docker CLI not found — install Docker Desktop first."
[[ -f "$DOCKERFILE" ]] || die "Dockerfile.stable not found at ${DOCKERFILE} — is this script still under frontend/src/utils/ in the repo?"

# =========================================================== 1. Docker reachable
log "Checking Docker is reachable"
if ! timeout 15 docker info >/dev/null 2>&1; then
  die "Docker daemon not reachable (timed out after 15s). Is Docker Desktop running? Start it and re-run this script — it can take a minute to finish starting up."
fi

# ==================================================== 2. External bridge network
# `docker compose up` cannot create this itself when the network is marked
# external (see docker-compose.yml's networks: block) — Docker Desktop's
# bridge plugin fails to create a network with driver + custom-name through
# compose directly, so it must be created once, up front, by hand.
log "Ensuring external network '${NETWORK_NAME}' exists"
if docker network inspect "$NETWORK_NAME" >/dev/null 2>&1; then
  log "Network '${NETWORK_NAME}' already exists — skipping"
else
  docker network create "$NETWORK_NAME" --driver bridge
fi

# ==================================================================== 3. .env
if [[ -f "$ENV_FILE" ]]; then
  log ".env already exists at ${ENV_FILE} — leaving it untouched (it holds this checkout's real DB_PASSWORD/ADMIN_PASSWORD)"
else
  [[ -f "$ENV_EXAMPLE" ]] || die ".env is missing and .env.example not found at ${ENV_EXAMPLE} to copy from."
  log "No .env found — creating one from .env.example with a freshly generated DB_PASSWORD"
  GENERATED_DB_PASSWORD="$(openssl rand -base64 24 | tr -d '=+/')"
  sed "s/^DB_PASSWORD=.*/DB_PASSWORD=${GENERATED_DB_PASSWORD}/" "$ENV_EXAMPLE" > "$ENV_FILE"
  warn "Generated a new DB_PASSWORD and wrote ${ENV_FILE} — review it (especially ADMIN_PASSWORD) before relying on this for anything beyond local dev."
fi

# Read back the values that actually matter for this run, now that .env is
# guaranteed to exist — .env wins over any environment-variable default set
# above, matching how docker compose itself resolves ${VAR:-default}.
# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a
SITE_NAME="${SITE_NAME:-frontend}"
CUSTOM_IMAGE="${CUSTOM_IMAGE:-erpnext-apps}"
CUSTOM_TAG="${CUSTOM_TAG:-16}"
HTTP_PUBLISH_PORT="${HTTP_PUBLISH_PORT:-8080}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin}"

# ============================================================ 4. Build image
# Stock frappe/erpnext Hub image + this repo's own docker/prebuilt-apps/*
# trees + apps/micromax, all COPY'd in — no GitHub fetch needed for any of
# the custom apps, they're already checked into this repo. Docker's layer
# cache keeps a repeat run fast when nothing under those paths changed.
log "Building custom image ${CUSTOM_IMAGE}:${CUSTOM_TAG} (Dockerfile.stable)"
docker build -f "$DOCKERFILE" -t "${CUSTOM_IMAGE}:${CUSTOM_TAG}" "$PROJECT_ROOT"

# ============================================================ 5. Bring stack up
log "Starting the stack (docker compose up -d)"
docker compose --env-file "$ENV_FILE" "${COMPOSE_FILES[@]}" up -d

log "Waiting for 'create-site' to finish (site creation + app installs — can take several minutes on first run)"
START_TS="$(date +%s)"
while true; do
  STATE="$(docker compose --env-file "$ENV_FILE" "${COMPOSE_FILES[@]}" ps --format json create-site 2>/dev/null | tail -1)"
  STATUS="$(echo "$STATE" | grep -o '"State":"[^"]*"' | cut -d'"' -f4 || true)"
  EXIT_CODE="$(echo "$STATE" | grep -o '"ExitCode":[0-9]*' | cut -d':' -f2 || true)"

  if [[ "$STATUS" == "exited" ]]; then
    [[ "$EXIT_CODE" == "0" ]] || die "create-site exited with code ${EXIT_CODE} — check the logs: docker compose ${COMPOSE_FILES[*]} logs create-site"
    log "create-site finished successfully"
    break
  fi

  if (( $(date +%s) - START_TS > CREATE_SITE_TIMEOUT )); then
    die "create-site did not finish within ${CREATE_SITE_TIMEOUT}s — check the logs: docker compose ${COMPOSE_FILES[*]} logs create-site"
  fi
  sleep 5
done

# ================================================================ 6. Smoke test
log "Checking the site answers over HTTP (http://localhost:${HTTP_PUBLISH_PORT}/)"
if curl -fsS -o /dev/null --max-time 20 "http://localhost:${HTTP_PUBLISH_PORT}/api/method/ping"; then
  log "Site is responding"
else
  warn "Site did not respond at http://localhost:${HTTP_PUBLISH_PORT}/api/method/ping yet — it may still be warming up. Check: docker compose ${COMPOSE_FILES[*]} logs -f backend"
fi

# ==================================================================== Summary
log "Done."
BACKEND_CONTAINER="$(docker compose --env-file "$ENV_FILE" "${COMPOSE_FILES[@]}" ps -q backend)"
cat <<EOF

  ERPNext/Frappe desk: http://localhost:${HTTP_PUBLISH_PORT}/
  Site name:           ${SITE_NAME}
  Administrator pass:  ${ADMIN_PASSWORD} (from ${ENV_FILE} — change it if this .env was just generated)
  Custom image:        ${CUSTOM_IMAGE}:${CUSTOM_TAG}
  Backend container:   ${BACKEND_CONTAINER:-erpnext-backend-1}

  React frontend (NOT part of this stack — a standalone Vite dev server):
    cd ${PROJECT_ROOT}/frontend && npm install && npm run dev
    then open http://localhost:5173/

  Next steps (deliberately not automated by this script):

    1. crm-setup.sh targets a bare-metal bench and will NOT run as-is here.
       Recreate the CRM role/user/mail-account/custom-field config the same
       way it was done all session — a one-off bench console script piped
       into the backend container, e.g.:
         docker exec ${BACKEND_CONTAINER:-erpnext-backend-1} bash -c \\
           "cd /home/frappe/frappe-bench && echo \"<python>\" | bench --site ${SITE_NAME} console"
       (or adapt crm-setup.sh's generated Python block the same way).

    2. Migrate hik -> micromax once this fresh site is confirmed working —
       that migration is a separate, module-by-module process, not part of
       this script.

  Re-run this script any time — steps that already succeeded (network
  exists, .env exists, site already created) are skipped or no-op rather
  than failing.
EOF
