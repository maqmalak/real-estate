#!/usr/bin/env bash
#
# templates-setup-production.sh — create the standard templates a site is missing (mm_core.setup_templates):
#   site-wide:   Payment Terms + Payment Terms Templates (Advance, COD, Net 7..90, split advance, LC at sight /
#                90 / 120 days) and Terms and Conditions (sales, purchase, export sales, quotation);
#   per company: Journal Entry Templates on the company's own default accounts ("Bank Charges - MSD", ...)
#                and, when the company has none, a Holiday List for the current fiscal year (Sundays + Pakistan's
#                fixed public holidays) set as its default.
# Existing records with the same names are never changed. Needs mm_core deployed (update.sh) first.
#
#   sudo bash templates-setup-production.sh                           # TENANT=micromax -> site demo, every company
#   sudo COMPANY='MicroMax Spinning Demo' bash templates-setup-production.sh
#   sudo TENANT=wise bash templates-setup-production.sh

set -euo pipefail

log()  { echo -e "\n\033[1;36m==>\033[0m $*"; }
die()  { echo -e "\033[1;31mERROR:\033[0m $*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Run this as root: sudo bash $(basename "$0")"

FRAPPE_USER="${FRAPPE_USER:-maqmalak}"
FRAPPE_HOME="/home/${FRAPPE_USER}"
BENCH_DIR="${BENCH_DIR:-${FRAPPE_HOME}/frappe-bench}"
BENCH_BIN="${BENCH_BIN:-${FRAPPE_HOME}/.local/bin/bench}"
UV_BIN_DIR="${FRAPPE_HOME}/.local/bin"

TENANT="${TENANT:-micromax}"
TENANT_FILE="$(dirname "$(readlink -f "$0")")/tenants/${TENANT}.env"
[[ -f "$TENANT_FILE" ]] || die "No tenant file ${TENANT_FILE} (TENANT=${TENANT})."
# shellcheck source=/dev/null
source "$TENANT_FILE"
COMPANY="${COMPANY:-}"

[[ -d "${BENCH_DIR}/sites/${SITE_NAME}" ]] || die "Site '${SITE_NAME}' not found under ${BENCH_DIR}/sites."

as_frappe_sh() {
  sudo -iu "$FRAPPE_USER" env "PATH=${UV_BIN_DIR}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" bash -c "$1"
}

as_frappe_sh "cd '$BENCH_DIR' && '$BENCH_BIN' --site '$SITE_NAME' list-apps" 2>/dev/null | grep -q '^mm_core' \
  || die "mm_core isn't installed on '${SITE_NAME}'."

KW=""
[[ -n "$COMPANY" ]] && KW="--kwargs \"{'company': '${COMPANY//\'/\\\'}'}\""

log "Backing up '${SITE_NAME}'"
as_frappe_sh "cd '$BENCH_DIR' && '$BENCH_BIN' --site '$SITE_NAME' backup" | tail -1 || die "Backup failed."

log "Creating missing standard templates on '${SITE_NAME}'${COMPANY:+ for ${COMPANY}}"
as_frappe_sh "cd '$BENCH_DIR' && '$BENCH_BIN' --site '$SITE_NAME' execute mm_core.setup_templates.apply ${KW}" \
  | grep -vE '^\{|^\}$|^ *"' || die "Template setup failed."

log "Done. 'created' = new, 'exists' = left as it was, 'skipped' = the company lacks that account (set it on the Company, then re-run)."
