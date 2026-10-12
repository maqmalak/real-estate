#!/usr/bin/env bash
#
# reset-site.sh — drops every existing site in this bench (test/demo data
# only — confirm there's nothing real on it before running this) and then
# re-runs install.sh to recreate the site and reinstall every app fresh.
#
# This does NOT touch ~/frappe-bench itself: apps/ stays exactly as fetched
# (including micromax's already-cloned source and the node-24 toolchain
# install.sh set up), so this is a much smaller blast radius than wiping the
# whole bench. Only site-level database state is thrown away, which is the
# right scope after a half-migrated apparel/micromax attempt: install.sh's
# own APP_INSTALL_ORDER never included `apparel` in the first place — it
# only fetches/installs `micromax` — so a fresh site sidesteps that whole
# migration instead of needing it.
#
# Run as root, same MariaDB root password install.sh used:
#   sudo MARIADB_ROOT_PASSWORD='<the password>' bash reset-site.sh
#
# It ends by handing off to install.sh (same directory) for the actual
# site-creation + app-install + production-setup + frontend-build work —
# that logic is already correct and already tested this session; this
# script's only job is clearing the way for it to run against a clean site.

set -euo pipefail

FRAPPE_USER="${FRAPPE_USER:-maqmalak}"
FRAPPE_HOME="/home/${FRAPPE_USER}"
BENCH_DIR="${BENCH_DIR:-${FRAPPE_HOME}/frappe-bench}"
MARIADB_ROOT_PASSWORD="${MARIADB_ROOT_PASSWORD:-}"

log()  { echo -e "\n\033[1;36m==>\033[0m $*"; }
warn() { echo -e "\033[1;33mWARN:\033[0m $*" >&2; }
die()  { echo -e "\033[1;31mERROR:\033[0m $*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Run this as root (sudo bash reset-site.sh)."
[[ -d "$BENCH_DIR" ]] || die "No bench at ${BENCH_DIR} — nothing to reset; just run install.sh."
[[ -n "$MARIADB_ROOT_PASSWORD" ]] || die "Set MARIADB_ROOT_PASSWORD to the same password install.sh used, e.g.:
  sudo MARIADB_ROOT_PASSWORD='yourpass' bash reset-site.sh"

UV_BIN_DIR="${FRAPPE_HOME}/.local/bin"
BENCH_BIN="${UV_BIN_DIR}/bench"
[[ -x "$BENCH_BIN" ]] || die "bench not found at ${BENCH_BIN}."

as_frappe_sh() {
  sudo -iu "$FRAPPE_USER" env "PATH=${UV_BIN_DIR}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" bash -c "$1"
}

log "Stopping supervisor before dropping sites (avoids workers touching a half-dropped DB)"
supervisorctl stop all || true

# Every directory under sites/ is a site except bench's own `assets` (the
# built-assets symlink farm) — everything else in there is plain files
# (apps.txt, common_site_config.json, etc.), so filtering to directories
# and excluding `assets` is enough.
mapfile -t SITES < <(find "${BENCH_DIR}/sites" -maxdepth 1 -mindepth 1 -type d -printf '%f\n' 2>/dev/null | grep -vx 'assets' || true)

if [[ ${#SITES[@]} -eq 0 ]]; then
  log "No existing sites found under ${BENCH_DIR}/sites — nothing to drop."
else
  log "Sites to drop: ${SITES[*]}"
  for site in "${SITES[@]}"; do
    log "Dropping site '${site}'"
    as_frappe_sh "cd '$BENCH_DIR' && '$BENCH_BIN' drop-site '${site}' --force --no-backup --mariadb-root-password '${MARIADB_ROOT_PASSWORD}'" \
      || warn "Could not drop '${site}' cleanly via bench — if 'sites/${site}' is still there afterward, remove it by hand (rm -rf) and drop its MariaDB database directly."
  done
fi

log "Restarting supervisor"
supervisorctl start all || true

INSTALL_SH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/install.sh"
[[ -f "$INSTALL_SH" ]] || die "install.sh not found next to this script at ${INSTALL_SH}."

log "Sites cleared — handing off to install.sh to recreate the site and reinstall every app fresh"
exec bash "$INSTALL_SH"
