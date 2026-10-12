#!/usr/bin/env bash
#
# install.local.sh — bare-metal (no Docker) local development installer.
# Sibling to install.sh (bare-metal PRODUCTION provisioning — different
# machine, different user, nginx+supervisor+systemd, a real domain),
# update.sh and crm-setup.sh (both production-only, deploy over an existing
# install) — this one is for standing up a working bench on THIS local
# machine, as your own user account, for day-to-day development.
#
# Unlike install.sh, this does NOT assume MariaDB/Redis/wkhtmltopdf/uv/nvm
# were already set up by hand — it installs everything from scratch, and it
# does NOT configure nginx/supervisor/systemd/certbot/a domain: local dev
# just runs `bench start` directly (developer_mode on, no production
# process manager needed).
#
# Every app is fetched fresh via `bench get-app` from its real GitHub repo
# (same repos/branches as install.sh's production provisioning) rather than
# reusing this repo's docker/prebuilt-apps/* exported trees — those are a
# Docker-specific shortcut (plain copies, no .git history, meant to avoid
# rebuilding inside a container image) and not what a clean bare-metal
# checkout should be built from. micromax is the one exception: installed
# straight from this checkout's own apps/micromax (a local path, not a
# GitHub clone) so it always matches what's actually in this repo,
# uncommitted changes included — `bench get-app` clones a local path just
# like a remote one, so this is still a real git clone, just from a local
# origin.
#
# Usage (run this yourself, in your own terminal — NOT via an automated
# tool — several steps need an interactive sudo password):
#   bash install.local.sh
# Override any value below via environment variable, e.g.:
#   BENCH_DIR=/home/maqmalak/erpnext-react SITE_NAME=micromaxerp bash install.local.sh
#
# Idempotent — safe to re-run: steps that already succeeded (packages
# installed, bench initialized, app fetched, site created) are skipped.

set -euo pipefail

log()  { echo -e "\n\033[1;36m==>\033[0m $*"; }
warn() { echo -e "\033[1;33mWARN:\033[0m $*" >&2; }
die()  { echo -e "\033[1;31mERROR:\033[0m $*" >&2; exit 1; }

[[ $EUID -ne 0 ]] || die "Run this as your normal user, NOT root/sudo — it escalates itself only for the specific commands that need it (apt-get, mariadb/redis service setup)."
command -v apt-get >/dev/null || die "This script targets Debian/Ubuntu (apt-get not found)."

# ============================================================== Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
MICROMAX_SOURCE="${MICROMAX_SOURCE:-${PROJECT_ROOT}/apps/micromax}"

BENCH_DIR="${BENCH_DIR:-/home/maqmalak/erpnext-react}"
SITE_NAME="${SITE_NAME:-micromaxerp}"   # can't be "micromax" — bench refuses a site name matching an installed app's name
FRAPPE_BRANCH="${FRAPPE_BRANCH:-version-16}"
PYTHON_VERSION="${PYTHON_VERSION:-3.14}"
NODE_MAJOR="${NODE_MAJOR:-24}"
BACKEND_PORT="${BACKEND_PORT:-8000}"    # bench's native default — see summary re: frontend/.env

# Persisted across re-runs (in $HOME, not under BENCH_DIR — a failed run can
# `rm -rf` an incomplete BENCH_DIR, which would otherwise take a freshly
# generated password down with it). Without this, a random new
# MARIADB_ROOT_PASSWORD generated on every invocation would stop matching
# whatever got set on MariaDB's actual root user by an earlier, later-failing
# run — exactly the "could not log into MariaDB as root" failure this
# guards against. An explicit env var still wins over the persisted value.
SECRETS_FILE="${HOME}/.$(basename "$BENCH_DIR")-install-secrets"
if [[ -f "$SECRETS_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$SECRETS_FILE"
fi
MARIADB_ROOT_PASSWORD="${MARIADB_ROOT_PASSWORD:-$(openssl rand -base64 18)}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-$(openssl rand -base64 18)}"
cat > "$SECRETS_FILE" <<EOF
MARIADB_ROOT_PASSWORD="\${MARIADB_ROOT_PASSWORD:-${MARIADB_ROOT_PASSWORD}}"
ADMIN_PASSWORD="\${ADMIN_PASSWORD:-${ADMIN_PASSWORD}}"
EOF
chmod 600 "$SECRETS_FILE"

# Apps fetched via `bench get-app`, same repos/branches as install.sh's
# production provisioning — a real git clone for every one of them.
declare -A APP_REPO=(
  [erpnext]="https://github.com/frappe/erpnext.git"
  [payments]="https://github.com/frappe/payments.git"
  [hrms]="https://github.com/frappe/hrms.git"
  [lms]="https://github.com/frappe/lms.git"
  [wiki]="https://github.com/frappe/wiki.git"
  [telephony]="https://github.com/frappe/telephony.git"
  [helpdesk]="https://github.com/frappe/helpdesk.git"
  [insights]="https://github.com/frappe/insights.git"
  [crm]="https://github.com/frappe/crm.git"
  [whatsapp]="https://github.com/frappe/whatsapp.git"
)
declare -A APP_BRANCH=(
  [erpnext]="version-16"
  [payments]="version-16"
  [hrms]="version-16"
  [lms]="main"
  [wiki]="develop"
  [telephony]="develop"   # frappe/telephony has no "main" branch — verified via git ls-remote --heads
  [helpdesk]="main"
  [insights]="main"
  [crm]="main"
  [whatsapp]="main"
)
# Install order: erpnext first (base doctypes), then the rest, micromax
# last (its custom fields target CRM Lead + core ERPNext doctypes).
APP_INSTALL_ORDER=(erpnext payments hrms lms wiki telephony helpdesk insights crm whatsapp micromax)

[[ -d "$MICROMAX_SOURCE" ]] || die "micromax app source not found at ${MICROMAX_SOURCE}."

UV_BIN_DIR="${HOME}/.local/bin"
NVM_SH="${HOME}/.nvm/nvm.sh"

# ============================================================ 1. System deps
log "Installing system packages (sudo)"
sudo apt-get update -y
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
  git curl wget ca-certificates \
  build-essential software-properties-common \
  xvfb libfontconfig libmysqlclient-dev pkg-config \
  redis-server \
  cron \
  mariadb-server mariadb-client

log "Installing wkhtmltopdf (best-effort — only needed for server-side PDF Print Formats, not this app's own contract print/export)"
if ! command -v wkhtmltopdf >/dev/null; then
  WK_ARCH="$(dpkg --print-architecture)"
  WK_DEB="wkhtmltox_0.12.6.1-2.jammy_${WK_ARCH}.deb"
  WK_TMP="$(mktemp -d)"
  if wget -q -O "${WK_TMP}/${WK_DEB}" "https://github.com/wkhtmltopdf/packaging/releases/download/0.12.6.1-2/${WK_DEB}"; then
    sudo dpkg -i "${WK_TMP}/${WK_DEB}" || true
    sudo apt-get -f install -y
    sudo dpkg -i "${WK_TMP}/${WK_DEB}" || warn "wkhtmltopdf install failed — server-side PDF Print Formats won't work, everything else will."
  else
    warn "Could not download wkhtmltopdf — skipping (server-side PDF Print Formats won't work, everything else will)."
  fi
  rm -rf "$WK_TMP"
else
  log "wkhtmltopdf already installed — skipping"
fi

log "Enabling MariaDB and Redis (sudo)"
sudo systemctl enable --now mariadb
sudo systemctl enable --now redis-server

log "Applying Frappe's required MariaDB settings to /etc/mysql/mariadb.conf.d/50-server.cnf"
MARIADB_CNF="/etc/mysql/mariadb.conf.d/50-server.cnf"
if [[ -f "$MARIADB_CNF" ]] && ! grep -q "character-set-server" "$MARIADB_CNF" 2>/dev/null; then
  sudo tee -a "$MARIADB_CNF" >/dev/null <<'EOF'

[mysqld]
character-set-client-handshake = FALSE
character-set-server = utf8mb4
collation-server = utf8mb4_unicode_ci
max_allowed_packet = 256M

[mysql]
default-character-set = utf8mb4
EOF
  sudo systemctl restart mariadb
else
  log "MariaDB config already has the utf8mb4 block (or file not found at the expected path) — skipping"
fi

log "Setting the MariaDB root password (fresh install defaults to no password / unix_socket auth)"
if sudo mysql -e "SELECT 1;" >/dev/null 2>&1; then
  sudo mysql -e "ALTER USER 'root'@'localhost' IDENTIFIED BY '${MARIADB_ROOT_PASSWORD}'; FLUSH PRIVILEGES;"
elif mysql -u root -p"${MARIADB_ROOT_PASSWORD}" -e "SELECT 1;" >/dev/null 2>&1; then
  log "MariaDB root password already set to the value in MARIADB_ROOT_PASSWORD — skipping"
else
  die "Could not log into MariaDB as root via sudo (unix_socket) or with MARIADB_ROOT_PASSWORD. If you've already set a different root password by hand, re-run with MARIADB_ROOT_PASSWORD='that password'."
fi

# Same cleanup `mysql_secure_installation` does. Debian's apt postinst
# normally already removes these on a fresh package install, but a datadir
# bootstrapped by hand with `mariadb-install-db` (e.g. while recovering a
# broken install) leaves anonymous accounts behind — and a leftover
# ''@'localhost' shadows named users connecting from localhost, so
# `bench new-site` fails with "Access denied for user '_xxxx'@'localhost'
# (using password: YES)" the moment it tries to log in as the site's own
# freshly created DB user. Idempotent (DROP ... IF EXISTS).
log "Removing anonymous MariaDB accounts and the test database (mysql_secure_installation equivalent)"
mysql -u root -h 127.0.0.1 -p"${MARIADB_ROOT_PASSWORD}" -e "
DROP USER IF EXISTS ''@'localhost';
DROP USER IF EXISTS ''@'$(hostname)';
DROP DATABASE IF EXISTS test;
FLUSH PRIVILEGES;" \
  || warn "Could not remove anonymous MariaDB accounts — if bench new-site fails with 'Access denied ... (using password: YES)', this is why."

# ==================================================== 2. Python (uv) and Node (nvm)
log "Installing Python ${PYTHON_VERSION} via uv"
if [[ ! -x "${UV_BIN_DIR}/uv" ]]; then
  curl -LsSf https://astral.sh/uv/install.sh | sh
fi
"${UV_BIN_DIR}/uv" python install "$PYTHON_VERSION" --default
PYTHON_BIN="$("${UV_BIN_DIR}/uv" python find "$PYTHON_VERSION")"
[[ -n "$PYTHON_BIN" ]] || die "uv could not resolve a python ${PYTHON_VERSION} interpreter."

log "Ensuring Node ${NODE_MAJOR} is available via nvm"
if [[ ! -s "$NVM_SH" ]]; then
  curl -fsSL -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
  [[ -s "$NVM_SH" ]] || die "nvm installer reported success but ${NVM_SH} still doesn't exist."
fi
NODE_BIN_DIR="$(bash -c "export NVM_DIR='${HOME}/.nvm'; . '${NVM_SH}'; nvm install ${NODE_MAJOR} >/dev/null 2>&1; nvm use ${NODE_MAJOR} >/dev/null 2>&1; dirname \"\$(command -v node)\"")"
[[ -n "$NODE_BIN_DIR" ]] || die "Could not resolve the nvm-installed node ${NODE_MAJOR} bin directory."
log "Node resolved at ${NODE_BIN_DIR}"

export PATH="${UV_BIN_DIR}:${NODE_BIN_DIR}:${PATH}"

log "Installing yarn"
npm install -g yarn --silent

log "Installing frappe-bench CLI via uv"
"${UV_BIN_DIR}/uv" tool install frappe-bench --python "$PYTHON_BIN" --force
BENCH_BIN="${UV_BIN_DIR}/bench"

# ============================================================== 3. bench init
# `bench init` creates BENCH_DIR itself and refuses to run into one that
# already exists — only the PARENT needs to be there up front. Ownership/
# permissions on BENCH_DIR itself are fixed up afterward instead, since it
# doesn't exist yet at this point on a first run.
log "Preparing ${BENCH_DIR}'s parent directory"
BENCH_PARENT="$(dirname "$BENCH_DIR")"
mkdir -p "$BENCH_PARENT"
chown "$(id -un):$(id -gn)" "$BENCH_PARENT" 2>/dev/null || true
chmod 755 "$BENCH_PARENT"

# A bare `-d` check isn't enough: bench init failing partway (a network
# hiccup fetching frappe, say) can still leave the directory behind, and
# `bench init` refuses to run into a directory that already exists — so a
# re-run would silently skip init on an incomplete bench and fail
# confusingly deep in whatever step runs next instead. apps/frappe existing
# is the real marker of a completed init.
if [[ -d "${BENCH_DIR}/apps/frappe" ]]; then
  log "bench already initialized at ${BENCH_DIR} — skipping bench init"
else
  if [[ -d "$BENCH_DIR" ]]; then
    warn "${BENCH_DIR} exists but isn't a complete bench (no apps/frappe) — removing it before re-running bench init"
    rm -rf "$BENCH_DIR"
  fi
  log "Running bench init (frappe ${FRAPPE_BRANCH}, python ${PYTHON_VERSION}) — this fetches + builds frappe, takes a while"
  "$BENCH_BIN" init --frappe-branch "$FRAPPE_BRANCH" --python "$PYTHON_BIN" "$BENCH_DIR"
fi

log "Ensuring ${BENCH_DIR} is owned by $(id -un) with sane permissions"
# Self-heals anything created root-owned by an earlier `sudo`'d step run by
# hand outside this script — matches install.sh's own rationale for doing
# this unconditionally rather than only reacting to a permission error.
chown -R "$(id -un):$(id -gn)" "$BENCH_DIR"
chmod -R u+rwX "$BENCH_DIR"
find "$BENCH_DIR" -maxdepth 1 -type d -exec chmod o+rx {} \;

cd "$BENCH_DIR"

# ==================================================== 4. Fetch apps (git clone)
# Same partial-failure guard as bench init above — a dropped connection
# mid-clone can leave an apps/<app> directory behind without its own
# hooks.py, so check for that rather than just directory existence before
# trusting "already fetched".
for app in "${!APP_REPO[@]}"; do
  if [[ -d "apps/${app}" && ! -f "apps/${app}/${app}/hooks.py" ]]; then
    warn "apps/${app} exists but looks incomplete — removing it before re-fetching"
    rm -rf "apps/${app}"
  fi
  if [[ -d "apps/${app}" ]]; then
    log "app '${app}' already fetched — skipping get-app"
  else
    log "Fetching app '${app}' (${APP_BRANCH[$app]}) — real clone + build"
    "$BENCH_BIN" get-app --branch "${APP_BRANCH[$app]}" "${APP_REPO[$app]}"
  fi
done

if [[ -d "apps/micromax" && ! -f "apps/micromax/micromax/hooks.py" ]]; then
  warn "apps/micromax exists but looks incomplete — removing it before re-fetching"
  rm -rf "apps/micromax"
fi
if [[ -d "apps/micromax" ]]; then
  log "'micromax' already present — skipping"
else
  log "Installing custom app 'micromax' from this checkout (${MICROMAX_SOURCE}) — a local path, not a GitHub clone, so it always matches what's actually in this repo"
  "$BENCH_BIN" get-app "$MICROMAX_SOURCE"
fi

ls -1 apps > sites/apps.txt

# ============================================ 4b. Bench's own Redis instances
# common_site_config.json points redis_cache/redis_socketio at :13000 and
# redis_queue at :11000 — those are NOT the system redis-server on :6379
# enabled above; they're separate instances that normally only exist while
# `bench start` runs them via the Procfile. Nothing is listening there during
# this install, so `bench install-app` fails partway with "Error 111
# connecting to 127.0.0.1:11000. Connection refused" (leaving a half-
# installed app behind). Start them here for the duration of the install and
# shut down only the ones THIS script started on exit (success or failure) —
# leaving them running would make `bench start`'s own redis processes fail to
# bind the same ports, and honcho then kills the whole bench.
STARTED_REDIS_PORTS=()
stop_bench_redis() {
  local port
  for port in ${STARTED_REDIS_PORTS[@]+"${STARTED_REDIS_PORTS[@]}"}; do
    redis-cli -p "$port" shutdown nosave >/dev/null 2>&1 || true
  done
}
trap stop_bench_redis EXIT

log "Starting bench's own Redis instances for the install (cache :13000, queue :11000)"
for redis_conf in redis_cache redis_queue; do
  redis_port="$(awk '$1 == "port" {print $2}' "config/${redis_conf}.conf")"
  if redis-cli -p "$redis_port" ping >/dev/null 2>&1; then
    log "${redis_conf} already running on :${redis_port} (probably a bench start in another terminal) — leaving it alone"
  else
    redis-server "config/${redis_conf}.conf" --daemonize yes >/dev/null
    STARTED_REDIS_PORTS+=("$redis_port")
    for _ in 1 2 3 4 5 6 7 8 9 10; do
      redis-cli -p "$redis_port" ping >/dev/null 2>&1 && break
      sleep 0.5
    done
    redis-cli -p "$redis_port" ping >/dev/null 2>&1 || die "${redis_conf} did not come up on :${redis_port} — check config/${redis_conf}.conf"
  fi
done

# ================================================================ 5. New site
if [[ ! -d "sites/${SITE_NAME}" ]]; then
  log "Creating site '${SITE_NAME}'"
  # --mariadb-root-username passed explicitly: without it, an interactive
  # terminal gets an "Enter mysql super user [root]:" prompt mid-script.
  "$BENCH_BIN" new-site "$SITE_NAME" --mariadb-root-username root --mariadb-root-password "$MARIADB_ROOT_PASSWORD" --admin-password "$ADMIN_PASSWORD" --no-mariadb-socket
else
  log "Site '${SITE_NAME}' already exists — skipping new-site"
fi

"$BENCH_BIN" use "$SITE_NAME"

# ============================================================= 6. Install apps
INSTALLED_APPS="$("$BENCH_BIN" --site "$SITE_NAME" list-apps 2>/dev/null | awk '{print $1}')"
for app in "${APP_INSTALL_ORDER[@]}"; do
  if grep -qx "$app" <<<"$INSTALLED_APPS"; then
    log "'${app}' already installed on site '${SITE_NAME}' — skipping"
  else
    log "Installing '${app}' on site '${SITE_NAME}'"
    "$BENCH_BIN" --site "$SITE_NAME" install-app "$app"
  fi
done

log "Turning developer mode on (local dev — easier debugging, no asset-cache surprises)"
"$BENCH_BIN" --site "$SITE_NAME" set-config developer_mode 1
"$BENCH_BIN" --site "$SITE_NAME" set-config webserver_port "$BACKEND_PORT"
"$BENCH_BIN" --site "$SITE_NAME" scheduler enable
"$BENCH_BIN" --site "$SITE_NAME" scheduler resume
"$BENCH_BIN" --site "$SITE_NAME" clear-cache

# ==================================================================== Summary
log "Done."
cat <<EOF

  Bench directory:     ${BENCH_DIR}
  Site name:           ${SITE_NAME}
  Administrator pass:  ${ADMIN_PASSWORD}
  MariaDB root pass:   ${MARIADB_ROOT_PASSWORD}
  Python (uv):         ${PYTHON_BIN}
  Node (nvm):          ${NODE_BIN_DIR}
  Apps installed:      ${APP_INSTALL_ORDER[*]}

  Start the backend (from ${BENCH_DIR}):
    cd ${BENCH_DIR} && bench start
  This runs the web server (port ${BACKEND_PORT}), socketio, workers and
  scheduler together in the foreground — leave it running in its own
  terminal. Desk UI: http://localhost:${BACKEND_PORT}/app

  React frontend (separate, standalone Vite dev server):
    cd ${PROJECT_ROOT}/frontend && npm install && npm run dev
    then open http://localhost:5173/
EOF
cat <<EOF

  frontend/.env needs two updates to point at this bench instead of the old
  Docker setup (site name "frontend", port 8080):
    VITE_FRAPPE_SITE=${SITE_NAME}
    VITE_PROXY_TARGET=http://localhost:${BACKEND_PORT}
EOF
cat <<EOF

  Next steps (deliberately not automated by this script):

    1. crm-setup.sh assumes a different bench layout (sudo -iu, a dedicated
       FRAPPE_USER, ~/frappe-bench) — re-check its paths against ${BENCH_DIR}
       before running it here, or just run its generated Python block
       directly:
         cd ${BENCH_DIR} && echo "<python>" | bench --site ${SITE_NAME} console

    2. Migrate hik -> micromax once this fresh site is confirmed working.

  These passwords are saved (chmod 600) in ${SECRETS_FILE} and reused on
  every re-run of this script — delete that file only if you also want a new
  MariaDB root password / Administrator password generated next time.
EOF
