#!/usr/bin/env bash
#
# install.sh — bare-metal (no Docker) production installer for this project's
# ERPNext/Frappe stack: one site per tenant (default "demo"), Frappe v16 backend, the custom
# `micromax` app, the `micromax-erp-frontend` React app served via nginx, and
# every app this project actually runs (matching apps.txt / apps.json).
#
# This picks up from the server-setup steps already performed manually
# (see conversation): OS user `maqmalak` created, timezone/apt set up,
# Python 3.14 installed via `uv` (`uv python install 3.14 --default`),
# Node 24 installed via `nvm`, Redis/nginx/MariaDB/wkhtmltopdf installed,
# and MariaDB already secured via `mysql_secure_installation`. This script
# does NOT redo those — it detects them and continues from `bench init`
# onward. It's still safe to run on a completely fresh box: every step is
# guarded and will install what's missing (using the same uv/nvm tooling),
# it just won't fight what you already set up by hand.
#
# Run as root:
#   sudo MARIADB_ROOT_PASSWORD='<the password you set in mysql_secure_installation>' bash install.sh
#
# Multi-tenant: one bench, one site per tenant. TENANT picks tenants/<name>.env
# (site name, domains, apps, frontend); the default is micromax. Adding a
# tenant to a box that already runs another skips the system/bench steps that
# are already done and only creates the new site, its apps and its domains:
#   sudo TENANT=wise MARIADB_ROOT_PASSWORD='...' bash install-production.sh
#
# Idempotency: safe to re-run — steps that already succeeded (user exists,
# bench dir exists, app already fetched, site already exists) are skipped
# rather than failing.

set -euo pipefail

# ============================================================== Configuration
# Override any of these via environment variables before running, e.g.:
#   APEX_DOMAIN=micromaxonline.uk SITE_NAME=demo bash install.sh
#
# Two public hostnames are exposed, both pointed at the same site/bench:
#   BACKEND_DOMAIN  — the Frappe/ERPNext desk (admin) UI, full backend access
#   FRONTEND_DOMAIN — the React app, proxying only /api /files /private
#                     /socket.io back to the same backend
# Point an A/AAAA record for both at this server's IP before running.
FRAPPE_USER="${FRAPPE_USER:-maqmalak}"
FRAPPE_HOME="/home/${FRAPPE_USER}"
BENCH_DIR="${BENCH_DIR:-${FRAPPE_HOME}/frappe-bench}"

# Tenant: site name, domains, apps and frontend come from tenants/<TENANT>.env.
TENANT="${TENANT:-micromax}"
TENANT_FILE="$(dirname "$(readlink -f "$0")")/tenants/${TENANT}.env"
[[ -f "$TENANT_FILE" ]] || { echo "ERROR: no tenant file ${TENANT_FILE} (TENANT=${TENANT})" >&2; exit 1; }
# shellcheck source=/dev/null
source "$TENANT_FILE"
# shellcheck source=lib/react-nginx.sh
source "$(dirname "$(readlink -f "$0")")/lib/react-nginx.sh"

FRAPPE_BRANCH="${FRAPPE_BRANCH:-version-16}"
PYTHON_VERSION="${PYTHON_VERSION:-3.14}"
NODE_MAJOR="${NODE_MAJOR:-24}"

MICROMAX_REPO="${MICROMAX_REPO:-https://github.com/maqmalak/micromax.git}"

# MariaDB was already secured by hand via `mysql_secure_installation` before
# this script runs, so — unlike a from-scratch script — we do NOT generate
# or set this ourselves. Pass the password you chose there.
MARIADB_ROOT_PASSWORD="${MARIADB_ROOT_PASSWORD:-}"
# Frappe Administrator password — generated if not supplied, printed at the end.
ADMIN_PASSWORD="${ADMIN_PASSWORD:-$(openssl rand -base64 18)}"

# Apps to install, in an order that respects real dependencies (micromax's
# custom fields target CRM Lead + core ERPNext doctypes, so it must come
# last; hrms needs erpnext+payments already installed). Branches copied
# verbatim from this repo's apps.json — the one exception is erpnext, which
# isn't in that file because the Docker base image already bundles it; here
# it's fetched explicitly on the same version-16 track as frappe/hrms/payments.
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
  # Shared Custom Fields for every site on the bench; micromax requires it.
  [mm_core]="${MM_CORE_REPO:-https://github.com/maqmalak/mm_core.git}"
  # School tenant (wise). The Junior-School repo installs as app `nl_school`.
  # Pinned copy of frappe/education (version-16 as of 22e0910); updated only when we pull upstream on purpose.
  [education]="${EDUCATION_REPO:-https://github.com/maqmalak/education.git}"
  # Our fork of navariltd/Junior-School with the Frappe/Education v16 report + app-home fixes.
  [nl_school]="${NL_SCHOOL_REPO:-https://github.com/maqmalak/Junior-School.git}"
)
declare -A APP_BRANCH=(
  [erpnext]="version-16"
  [payments]="version-16"
  [hrms]="version-16"
  [lms]="main"
  [wiki]="develop"
  [telephony]="main"
  [helpdesk]="main"
  [insights]="main"
  [crm]="main"
  [whatsapp]="main"
  [mm_core]="${MM_CORE_BRANCH:-main}"
  [education]="${EDUCATION_BRANCH:-main}"
  [nl_school]="${NL_SCHOOL_BRANCH:-main}"
)
# Installed in this exact order — the tenant file's SITE_APPS (see comment
# above on why micromax is last). Only these apps are fetched into the bench.
read -ra APP_INSTALL_ORDER <<<"$SITE_APPS"

# Optional extras present in this project's build manifest (apps.json) but
# not installed on the live site this was modeled on — self-hosting a full
# mail server (frappe/mail) or the letters/print_designer apps is a bigger
# commitment than "send email via an Email Account", so these are opt-in.
# Set INSTALL_MAIL_APP=1 to include it.
INSTALL_MAIL_APP="${INSTALL_MAIL_APP:-0}"

# ==================================================================== Helpers
log()  { echo -e "\n\033[1;36m==>\033[0m $*"; }
warn() { echo -e "\033[1;33mWARN:\033[0m $*" >&2; }
die()  { echo -e "\033[1;31mERROR:\033[0m $*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Run this as root (sudo bash install.sh)."
command -v apt-get >/dev/null || die "This script targets Debian/Ubuntu (apt-get not found)."
id "$FRAPPE_USER" &>/dev/null || die "System user '${FRAPPE_USER}' does not exist yet — create it first (adduser ${FRAPPE_USER}; usermod -aG sudo ${FRAPPE_USER})."
[[ -n "$MARIADB_ROOT_PASSWORD" ]] || die "Set MARIADB_ROOT_PASSWORD to the root password you chose in mysql_secure_installation, e.g.:
  sudo MARIADB_ROOT_PASSWORD='yourpass' bash install.sh"

UV_BIN_DIR="${FRAPPE_HOME}/.local/bin"

# Plain command as the frappe user, login shell (sources ~/.profile).
as_frappe() { sudo -iu "$FRAPPE_USER" -- "$@"; }
# Shell snippet as the frappe user with PATH forced to include uv's and
# nvm's install locations — needed because `sudo -iu ... -- cmd` (non
# -interactive) does not source ~/.bashrc, which is where both the uv and
# nvm installers append their PATH lines. Resolved once NODE_BIN_DIR is
# known (see step 2 below).
as_frappe_sh() {
  sudo -iu "$FRAPPE_USER" env "PATH=${UV_BIN_DIR}:${NODE_BIN_DIR:-}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" bash -c "$1"
}
# Some bench subcommands (setup production / add-domain / setup nginx) write
# to root-owned paths (/etc/nginx, /etc/supervisor) and restart system
# services, so — matching the official guide's `sudo env "PATH=$PATH" bench
# setup production ...` — they must run as root, not as the frappe user.
# This script already runs as root; we just need the frappe user's uv/nvm
# PATH entries preserved so the `bench` binary still resolves.
as_root_sh() {
  env "PATH=${UV_BIN_DIR}:${NODE_BIN_DIR:-}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" bash -c "$1"
}

# ============================================================ 1. System deps
# Matches the packages already installed by hand, made idempotent — apt
# skips anything already present.
log "Installing system packages"
apt-get update -y
DEBIAN_FRONTEND=noninteractive apt-get install -y \
  git curl wget ca-certificates \
  build-essential software-properties-common \
  xvfb libfontconfig libmysqlclient-dev pkg-config \
  redis-server \
  nginx \
  supervisor \
  cron \
  mariadb-server mariadb-client

log "Installing wkhtmltopdf (patched Qt build, matching the official Frappe install guide)"
if ! command -v wkhtmltopdf >/dev/null; then
  WK_ARCH="$(dpkg --print-architecture)"   # amd64 or arm64
  WK_DEB="wkhtmltox_0.12.6.1-2.jammy_${WK_ARCH}.deb"
  WK_TMP="$(mktemp -d)"
  wget -q -O "${WK_TMP}/${WK_DEB}" "https://github.com/wkhtmltopdf/packaging/releases/download/0.12.6.1-2/${WK_DEB}"
  dpkg -i "${WK_TMP}/${WK_DEB}" || true   # first pass reports missing deps
  apt-get -f install -y
  dpkg -i "${WK_TMP}/${WK_DEB}"
  rm -rf "$WK_TMP"
else
  log "wkhtmltopdf already installed — skipping"
fi

log "Enabling MariaDB and Redis"
systemctl enable --now mariadb
systemctl enable --now redis-server

log "Applying Frappe's required MariaDB settings to /etc/mysql/my.cnf"
if ! grep -q "character-set-server" /etc/mysql/my.cnf 2>/dev/null; then
  cat >> /etc/mysql/my.cnf <<'EOF'

[mysqld]
character-set-client-handshake = FALSE
character-set-server = utf8mb4
collation-server = utf8mb4_unicode_ci
# Frappe's global-search reindex batches many rows into single INSERTs —
# MariaDB's 16M default is too small once there's real data volume and
# fails with "Got a packet bigger than 'max_allowed_packet' bytes"
# (hit exactly this running `bench rebuild-global-search` against real data).
max_allowed_packet = 256M

[mysql]
default-character-set = utf8mb4
EOF
  systemctl restart mariadb
else
  log "/etc/mysql/my.cnf already has the utf8mb4 block — skipping"
fi

log "Verifying the supplied MariaDB root password"
mysql -u root -p"${MARIADB_ROOT_PASSWORD}" -e "SELECT 1;" >/dev/null 2>&1 \
  || die "Could not log into MariaDB as root with the given MARIADB_ROOT_PASSWORD. Use the exact password you set in mysql_secure_installation."

log "Ensuring ${FRAPPE_USER} owns their entire home directory"
# Self-heals any files/dirs left root-owned by an earlier manual command run
# without the as_frappe/as_frappe_sh wrappers (e.g. a stray `sudo uv ...`) —
# tools like `uv tool install --force` fail with a plain "Permission denied"
# trying to remove such a directory, with no hint that ownership is the
# actual problem, so this runs unconditionally rather than only on error.
chown -R "${FRAPPE_USER}:${FRAPPE_USER}" "$FRAPPE_HOME"

log "Allowing nginx (www-data) to traverse into ${FRAPPE_HOME}"
chmod -R o+rx "$FRAPPE_HOME"

# ==================================================== 2. Python (uv) and Node (nvm)
log "Installing Python ${PYTHON_VERSION} via uv"
if [[ ! -x "${UV_BIN_DIR}/uv" ]]; then
  as_frappe bash -c 'curl -LsSf https://astral.sh/uv/install.sh | sh'
fi
as_frappe "${UV_BIN_DIR}/uv" python install "$PYTHON_VERSION" --default
PYTHON_BIN="$(as_frappe "${UV_BIN_DIR}/uv" python find "$PYTHON_VERSION")"
[[ -n "$PYTHON_BIN" ]] || die "uv could not resolve a python ${PYTHON_VERSION} interpreter."

log "Installing Node ${NODE_MAJOR} via nvm"
if [[ -s "${FRAPPE_HOME}/.nvm/nvm.sh" ]]; then
  log "nvm already installed at ${FRAPPE_HOME}/.nvm — skipping installer"
else
  as_frappe bash -c 'curl -fsSL -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash' \
    || die "nvm installer failed — check this server has outbound internet access to raw.githubusercontent.com/github.com (as ${FRAPPE_USER}: curl -I https://raw.githubusercontent.com)."
  [[ -s "${FRAPPE_HOME}/.nvm/nvm.sh" ]] \
    || die "nvm installer reported success but ${FRAPPE_HOME}/.nvm/nvm.sh still doesn't exist — inspect ${FRAPPE_HOME}/.nvm by hand."
fi
# Bake the already-resolved absolute path in as a literal from install.sh's
# own scope instead of re-deriving "$HOME/.nvm" inside the nested shell —
# on at least one real server, `sudo -iu ... bash -c '... $HOME ...'`
# produced an empty $HOME at the point nvm.sh was sourced (root cause not
# fully pinned down; possibly nvm.sh's own self-location logic stepping on
# it when there's no real backing script file, only a -c string), so this
# sidesteps that class of bug entirely rather than chasing it further.
NVM_SH="${FRAPPE_HOME}/.nvm/nvm.sh"

# If node ${NODE_MAJOR} is already installed under nvm, skip `nvm install`/
# `nvm alias default` entirely — on at least one server those two hit the
# $HOME bug above even though the version was already there, so it's both
# unnecessary and actively risky to always re-run them.
NODE_BIN_DIR="$(as_frappe bash -c "NVM_DIR='${FRAPPE_HOME}/.nvm'; . '${NVM_SH}'; nvm use ${NODE_MAJOR} >/dev/null 2>&1; dirname \"\$(command -v node)\"" 2>/dev/null || true)"

if [[ -n "$NODE_BIN_DIR" && -x "${NODE_BIN_DIR}/node" ]]; then
  log "Node ${NODE_MAJOR} already installed via nvm at ${NODE_BIN_DIR} — skipping nvm install/alias"
else
  as_frappe bash -c "NVM_DIR='${FRAPPE_HOME}/.nvm'; . '${NVM_SH}'; nvm install ${NODE_MAJOR} && nvm alias default ${NODE_MAJOR}" \
    || die "'nvm install ${NODE_MAJOR}' failed — see the nvm output above."
  NODE_BIN_DIR="$(as_frappe bash -c "NVM_DIR='${FRAPPE_HOME}/.nvm'; . '${NVM_SH}'; nvm use ${NODE_MAJOR} >/dev/null 2>&1; dirname \"\$(command -v node)\"")"
fi
[[ -n "$NODE_BIN_DIR" ]] || die "Could not resolve the nvm-installed node ${NODE_MAJOR} bin directory."
log "Node resolved at ${NODE_BIN_DIR}"

log "Installing yarn"
as_frappe_sh "npm install -g yarn --silent"

log "Installing frappe-bench CLI via uv"
as_frappe "${UV_BIN_DIR}/uv" tool install frappe-bench --python "$PYTHON_BIN" --force
BENCH_BIN="${UV_BIN_DIR}/bench"

# ============================================================== 3. bench init
if [[ ! -d "$BENCH_DIR" ]]; then
  log "Running bench init (frappe ${FRAPPE_BRANCH}, python ${PYTHON_VERSION}) — this takes a while"
  as_frappe_sh "'$BENCH_BIN' init --frappe-branch '$FRAPPE_BRANCH' --python '$PYTHON_BIN' '$BENCH_DIR'"
else
  log "bench already initialized at ${BENCH_DIR} — skipping bench init"
fi

cd "$BENCH_DIR"

# ============================================================ 4. Fetch apps
# Only the apps this tenant installs; apps another tenant already fetched are reused.
for app in "${APP_INSTALL_ORDER[@]}"; do
  [[ "$app" == "micromax" ]] && continue   # fetched below from MICROMAX_REPO
  [[ -n "${APP_REPO[$app]:-}" ]] || die "No repo known for app '${app}' (SITE_APPS in ${TENANT_FILE}) — add it to APP_REPO/APP_BRANCH."
  if [[ -d "apps/${app}" ]]; then
    log "app '${app}' already fetched — skipping get-app"
  else
    log "Fetching app '${app}' (${APP_BRANCH[$app]})"
    as_frappe_sh "cd '$BENCH_DIR' && '$BENCH_BIN' get-app --branch '${APP_BRANCH[$app]}' '${APP_REPO[$app]}'"
  fi
done

if [[ " ${APP_INSTALL_ORDER[*]} " != *" micromax "* ]]; then
  log "Tenant '${TENANT}' doesn't use 'micromax' — not fetching it"
elif [[ ! -d "apps/micromax" ]]; then
  log "Fetching custom app 'micromax'"
  as_frappe_sh "cd '$BENCH_DIR' && '$BENCH_BIN' get-app '$MICROMAX_REPO'"
else
  log "'micromax' already fetched — skipping"
fi

if [[ "$INSTALL_MAIL_APP" == "1" && ! -d "apps/mail" ]]; then
  log "Fetching optional app 'mail' (self-hosted mail server — INSTALL_MAIL_APP=1)"
  as_frappe_sh "cd '$BENCH_DIR' && '$BENCH_BIN' get-app --branch develop https://github.com/frappe/mail.git"
fi

# ================================================================ 5. New site
if [[ ! -d "sites/${SITE_NAME}" ]]; then
  log "Creating site '${SITE_NAME}'"
  as_frappe_sh "cd '$BENCH_DIR' && '$BENCH_BIN' new-site '$SITE_NAME' --mariadb-root-password '$MARIADB_ROOT_PASSWORD' --admin-password '$ADMIN_PASSWORD' --no-mariadb-socket"
else
  log "Site '${SITE_NAME}' already exists — skipping new-site"
fi

# The first tenant on the bench becomes its default site; later tenants
# don't take that over (they are reached by their own domains).
if grep -q '"default_site"' "${BENCH_DIR}/sites/common_site_config.json" 2>/dev/null; then
  log "Bench already has a default site — leaving it (this site is served by its domains)"
else
  as_frappe_sh "cd '$BENCH_DIR' && '$BENCH_BIN' use '$SITE_NAME'"
fi

# ============================================================ 6. Install apps
INSTALLED_APPS="$(as_frappe_sh "cd '$BENCH_DIR' && '$BENCH_BIN' --site '$SITE_NAME' list-apps" 2>/dev/null | awk '{print $1}')"
for app in "${APP_INSTALL_ORDER[@]}"; do
  if grep -qx "$app" <<<"$INSTALLED_APPS"; then
    log "'${app}' already installed on site '${SITE_NAME}' — skipping"
  else
    log "Installing '${app}' on site '${SITE_NAME}'"
    as_frappe_sh "cd '$BENCH_DIR' && '$BENCH_BIN' --site '$SITE_NAME' install-app '$app'"
  fi
done
[[ "$INSTALL_MAIL_APP" == "1" ]] && as_frappe_sh "cd '$BENCH_DIR' && '$BENCH_BIN' --site '$SITE_NAME' install-app mail" || true

log "Turning production settings on (developer mode off, scheduler enabled)"
as_frappe_sh "cd '$BENCH_DIR' && '$BENCH_BIN' --site '$SITE_NAME' set-config developer_mode 0"
as_frappe_sh "cd '$BENCH_DIR' && '$BENCH_BIN' --site '$SITE_NAME' scheduler enable"
as_frappe_sh "cd '$BENCH_DIR' && '$BENCH_BIN' --site '$SITE_NAME' scheduler resume"
as_frappe_sh "cd '$BENCH_DIR' && '$BENCH_BIN' --site '$SITE_NAME' set-config maintenance_mode 0"

# ================================================ 7. Roles for day-to-day use
# micromax's own after_install hook already creates its export/import/
# commercial roles, and the CRM Lead/Deal ACL (System Manager/Sales Manager/
# Sales User, set up by the vendored crm app) already exists — this just
# makes sure a non-Administrator login exists for actual day-to-day CRM use,
# since sharing the Administrator account around is bad practice.
if [[ " ${APP_INSTALL_ORDER[*]} " == *" micromax "* ]]; then
  as_frappe_sh "cd '$BENCH_DIR' && '$BENCH_BIN' --site '$SITE_NAME' execute micromax.install.create_roles" || true
fi
CRM_MANAGER_EMAIL="crm.manager.${SITE_NAME}@${APEX_DOMAIN}"
[[ "$TENANT" == "micromax" ]] && CRM_MANAGER_EMAIL="crm.manager@${APEX_DOMAIN}"
if [[ " ${APP_INSTALL_ORDER[*]} " != *" crm "* ]]; then
  CRM_MANAGER_EMAIL=""
else
log "Creating a default Sales Manager login (${CRM_MANAGER_EMAIL})"
as_frappe_sh "cd '$BENCH_DIR' && '$BENCH_BIN' --site '$SITE_NAME' console" <<PYEOF || true
import frappe
email = "${CRM_MANAGER_EMAIL}"
if not frappe.db.exists("User", email):
    user = frappe.get_doc({
        "doctype": "User",
        "email": email,
        "first_name": "CRM",
        "last_name": "Manager",
        "send_welcome_email": 0,
        "roles": [{"role": "Sales Manager"}, {"role": "Sales User"}, {"role": "System Manager"}],
    })
    user.insert(ignore_permissions=True)
    user.new_password = "ChangeMe123!"
    user.save(ignore_permissions=True)
    frappe.db.commit()
    print(f"Created {email} / ChangeMe123! — change this password on first login.")
PYEOF
fi

# ======================================================= 8. Production setup
log "Installing ansible (bench setup production needs it; apt instead of pip"
log "so it works under Ubuntu 24.04's externally-managed-environment restriction)"
if ! command -v ansible-playbook >/dev/null; then
  DEBIAN_FRONTEND=noninteractive apt-get install -y ansible
else
  log "ansible already installed — skipping"
fi

log "Configuring supervisor + nginx for the Frappe backend (bench setup production)"
as_root_sh "cd '$BENCH_DIR' && '$BENCH_BIN' setup production '$FRAPPE_USER' --yes"

log "Restarting supervisor and confirming all programs are running"
supervisorctl restart all || true
supervisorctl status || true

log "Enabling bench's multi-domain nginx routing (bench config dns_multitenant on)"
as_frappe_sh "cd '$BENCH_DIR' && '$BENCH_BIN' config dns_multitenant on"

log "Mapping ${BACKEND_DOMAIN} to site '${SITE_NAME}' (bench setup add-domain) — this is the ERPNext/Frappe desk UI"
map_desk_domain "$BACKEND_DOMAIN" >/dev/null   # with its certificate when one already exists (lib/react-nginx.sh)
if [[ -z "$FRONTEND_REPO" ]]; then
  # No React app for this tenant: its public domain is served by the Frappe site itself.
  log "Tenant '${TENANT}' has no React frontend — mapping ${FRONTEND_DOMAIN} to site '${SITE_NAME}' too"
  map_desk_domain "$FRONTEND_DOMAIN" >/dev/null
fi
as_root_sh "cd '$BENCH_DIR' && '$BENCH_BIN' setup nginx --yes"
nginx -t && systemctl reload nginx

log "Installing certbot (snap) so HTTPS can be added once DNS resolves"
if ! command -v certbot >/dev/null; then
  command -v snap >/dev/null || apt-get install -y snapd
  snap install --classic certbot
  ln -sf /snap/bin/certbot /usr/bin/certbot
else
  log "certbot already installed — skipping"
fi

# ============================================== 9. React frontend build
if [[ -z "$FRONTEND_REPO" ]]; then
  log "9-10. Tenant '${TENANT}' has no React frontend (FRONTEND_REPO empty) — skipping the build and its nginx block"
else
if [[ ! -d "$FRONTEND_DIR" ]]; then
  log "Cloning react_frontend (${FRONTEND_REPO})"
  as_frappe git clone "$FRONTEND_REPO" "$FRONTEND_DIR"
else
  log "react_frontend already cloned — pulling latest"
  as_frappe git -C "$FRONTEND_DIR" pull --ff-only || warn "Could not fast-forward react_frontend — resolve manually if needed."
fi

# The build is site-agnostic (nginx picks the site per domain), so tenants may share FRONTEND_DIR:
# the .env is written once, and an unchanged checkout isn't rebuilt (dist/.built-sha).
if [[ -f "${FRONTEND_DIR}/.env.production" ]]; then
  log "react_frontend .env.production already present — keeping it (shared by every tenant on this build)"
else
  log "Writing react_frontend production .env (same-origin — served from this same domain/nginx)"
  as_frappe bash -c "cat > '${FRONTEND_DIR}/.env.production' <<'EOF'
VITE_FRAPPE_URL=
VITE_ENABLE_SOCKET=true
EOF"
fi

FRONTEND_SHA="$(as_frappe git -C "$FRONTEND_DIR" rev-parse HEAD)"
if [[ "$(cat "${FRONTEND_DIR}/dist/.built-sha" 2>/dev/null)" == "$FRONTEND_SHA" ]]; then
  log "react_frontend dist/ already built from ${FRONTEND_SHA:0:8} — not rebuilding"
else
  log "Building react_frontend (npm ci && npm run build)"
  as_frappe_sh "cd '${FRONTEND_DIR}' && npm ci --silent && npm run build && echo '${FRONTEND_SHA}' > dist/.built-sha"
fi

# ============================================================ 10. nginx entry
# `bench setup add-domain` + `bench setup nginx` (above) already wrote a
# correct, complete server block for ${BACKEND_DOMAIN} — full Frappe/ERPNext
# desk access. The React app at ${FRONTEND_DOMAIN} gets its own block (see
# lib/react-nginx.sh): the build at `/`, the backend surface proxied for this
# tenant's site. Tenants can share one build — the block picks the site.
unmap_frontend_domain_from_site
write_react_nginx_conf >/dev/null   # not in $(...): it sets REACT_HAD_SSL for restore_react_https
log "Wrote nginx config for the React app at ${REACT_NGINX_CONF:-/etc/nginx/conf.d/${SITE_NAME}-react.conf} (${FRONTEND_DOMAIN} -> site ${SITE_NAME})"

nginx -t
systemctl reload nginx
restore_react_https
fi

# ==================================================================== Summary
log "Done."
cat <<EOF

  Tenant:              ${TENANT} (${TENANT_FILE})
  ERPNext/Frappe desk: http://${BACKEND_DOMAIN}/
  $([[ -n "$FRONTEND_REPO" ]] && echo "React app:           http://${FRONTEND_DOMAIN}/" || echo "Public site/portal:  http://${FRONTEND_DOMAIN}/ (Frappe site, no React app)")
  Site name:           ${SITE_NAME}
  Bench directory:     ${BENCH_DIR}
  Python (uv):         ${PYTHON_BIN}
  Node (nvm):          ${NODE_BIN_DIR}
  React frontend:      $([[ -n "$FRONTEND_REPO" ]] && echo "${FRONTEND_DIR} (built to dist/, served by nginx at /)" || echo "none")
  Apps installed:      ${APP_INSTALL_ORDER[*]}
  Administrator pass:  ${ADMIN_PASSWORD}
  Extra login:         $([[ -n "$CRM_MANAGER_EMAIL" ]] && echo "${CRM_MANAGER_EMAIL} / ChangeMe123! (change on first login)" || echo "none (no crm app)")

  Manual steps still needed for full functionality:
    - DNS:       point A/AAAA records for both ${BACKEND_DOMAIN} and
                 ${FRONTEND_DOMAIN} at this server's IP if you haven't yet —
                 both are required for the URLs above to resolve.
    - Mail:      add a real Email Account (Desk -> Settings -> Email Account)
                 with your SMTP credentials, or re-run with INSTALL_MAIL_APP=1
                 for a self-hosted mail server (frappe/mail).
    - WhatsApp:  add a WhatsApp Account + WhatsApp Settings (Desk ->
                 WhatsApp Account / WhatsApp Settings) with your Meta
                 WhatsApp Business Cloud API credentials.
    - HTTPS:     this config is HTTP only — run
                 'certbot --nginx -d ${BACKEND_DOMAIN} -d ${FRONTEND_DOMAIN}'
                 (after DNS resolves) to add TLS to both.

  Save the Administrator password above somewhere safe — it is not stored
  anywhere else. The MariaDB root password is the one you already set
  yourself in mysql_secure_installation.
EOF