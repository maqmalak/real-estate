#!/usr/bin/env bash
#
# crm-transfer-production.sh — move the CRM data from one site to another on the
# same bench (default: demo -> wise), keeping record names, dates, owners and
# every link between them. Uses mm_core.crm_transfer (installed on every site).
#
# What moves: CRM Organizations, Leads, Deals (with products, contacts, status
# history), all CRM Tasks, Notes and Call Logs, linked Contacts/Addresses, every
# email MAILBOX sent or received plus all CRM-linked emails, comments, field-change
# history (Version), assignments (ToDo), calendar events (CRM-linked and standalone
# meetings/reminders), WhatsApp messages, attachments (files copied), and the CRM
# lookup lists (statuses, sources, industries, territories, lost reasons).
#
# The source site is only read — nothing there is changed or deleted.
#
# Order on production — the data moves BEFORE the mailbox leaves demo:
#   1. install-production.sh TENANT=wise                    (site + apps, incl. mm_core)
#   2. crm-setup-production.sh EMAIL_ENABLE_INCOMING=0      (wise: mail account, CRM role, login; demo untouched)
#   3. this script — dry run, then CONFIRM=1:
#        sudo bash crm-transfer-production.sh
#        sudo CONFIRM=1 bash crm-transfer-production.sh
#   4. crm-setup-production.sh REMOVE_MAILBOX_FROM=demo     (demo: mailbox + login disabled; wise: incoming on)
#   5. top-up — anything demo received between 3 and 4:
#        sudo TOP_UP=1 CONFIRM=1 bash crm-transfer-production.sh
#
# Safety: the import stops without writing if any lead/deal/organization/task/
# call-log name already exists on the target, or if CRM records hold values in
# fields the target lacks (install mm_core / bench migrate first; or accept the
# loss with ALLOW_MISSING_FIELDS=1). Users the target doesn't have are mapped to
# FALLBACK_USER (default: the target's mail account user, e.g. corporate@wise.edu.pk).

set -euo pipefail

log()  { echo -e "\n\033[1;36m==>\033[0m $*"; }
die()  { echo -e "\033[1;31mERROR:\033[0m $*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Run this as root (same as install.sh/update.sh): sudo bash $(basename "$0")"

FRAPPE_USER="${FRAPPE_USER:-maqmalak}"
FRAPPE_HOME="/home/${FRAPPE_USER}"
BENCH_DIR="${BENCH_DIR:-${FRAPPE_HOME}/frappe-bench}"
BENCH_BIN="${BENCH_BIN:-${FRAPPE_HOME}/.local/bin/bench}"
UV_BIN_DIR="${FRAPPE_HOME}/.local/bin"

# Target from the tenant file (default wise); source site by name (default demo).
TENANT="${TENANT:-wise}"
TENANT_FILE="$(dirname "$(readlink -f "$0")")/tenants/${TENANT}.env"
[[ -f "$TENANT_FILE" ]] || die "No tenant file ${TENANT_FILE} (TENANT=${TENANT})."
# shellcheck source=/dev/null
source "$TENANT_FILE"
TARGET_SITE="${TARGET_SITE:-$SITE_NAME}"
SOURCE_SITE="${SOURCE_SITE:-demo}"
EXPORT_DIR="${EXPORT_DIR:-${FRAPPE_HOME}/crm-transfer-${SOURCE_SITE}-to-${TARGET_SITE}-$(date +%Y%m%d-%H%M%S)}"
CONFIRM="${CONFIRM:-0}"
FALLBACK_USER="${FALLBACK_USER:-}"
ALLOW_MISSING_FIELDS="${ALLOW_MISSING_FIELDS:-0}"
# Every email this address sent or received on the source site moves too (not only CRM-linked ones).
MAILBOX="${MAILBOX:-corporate@wise.edu.pk}"
# 1 = second run after the first import: adds only records that are new on the source since then.
TOP_UP="${TOP_UP:-0}"
# Doctypes whose same-named records on the target are replaced by the source's, e.g. OVERWRITE="Email Template"
# (ERPNext installs standard templates under the same names). Templates / lookup lists only.
OVERWRITE="${OVERWRITE:-}"

[[ "$SOURCE_SITE" != "$TARGET_SITE" ]] || die "SOURCE_SITE and TARGET_SITE are both '${TARGET_SITE}'."
for s in "$SOURCE_SITE" "$TARGET_SITE"; do
  [[ -d "${BENCH_DIR}/sites/${s}" ]] || die "Site '${s}' not found under ${BENCH_DIR}/sites."
done

as_frappe_sh() {
  sudo -iu "$FRAPPE_USER" env "PATH=${UV_BIN_DIR}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" bash -c "$1"
}
for s in "$SOURCE_SITE" "$TARGET_SITE"; do
  as_frappe_sh "cd '$BENCH_DIR' && '$BENCH_BIN' --site '$s' list-apps" 2>/dev/null | grep -q '^mm_core' \
    || die "mm_core isn't installed on '${s}' — run update.sh / install-production.sh for that tenant first."
done

KW="'path': '${EXPORT_DIR}', 'allow_missing_fields': ${ALLOW_MISSING_FIELDS}, 'top_up': ${TOP_UP}, 'overwrite': '${OVERWRITE}'"
[[ -n "$FALLBACK_USER" ]] && KW="${KW}, 'fallback_user': '${FALLBACK_USER}'"

log "Exporting CRM data from '${SOURCE_SITE}' to ${EXPORT_DIR} (read-only on ${SOURCE_SITE})"
as_frappe_sh "mkdir -p '${EXPORT_DIR}' && cd '$BENCH_DIR' && '$BENCH_BIN' --site '$SOURCE_SITE' execute mm_core.crm_transfer.export_crm --kwargs \"{'path': '${EXPORT_DIR}', 'mailbox': '${MAILBOX}'}\"" \
  | grep -v '^{.*}$' || die "Export failed."

log "Dry run on '${TARGET_SITE}' (nothing written)"
DRY="$(as_frappe_sh "cd '$BENCH_DIR' && '$BENCH_BIN' --site '$TARGET_SITE' execute mm_core.crm_transfer.import_crm --kwargs \"{${KW}, 'dry_run': 1}\"" 2>&1)" \
  || { echo "$DRY"; die "Dry run failed."; }
echo "$DRY" | sed '/^{"/d'
if grep -q "^CONFLICT\|MISSING FIELDS" <<<"$DRY"; then
  die "The import would stop (see above). Nothing was written to '${TARGET_SITE}'."
fi

if [[ "$CONFIRM" != "1" ]]; then
  log "Dry run only. Review the report above, then run again with CONFIRM=1 to import."
  echo "  Export kept at ${EXPORT_DIR}"
  exit 0
fi

log "Backing up '${TARGET_SITE}' before importing"
as_frappe_sh "cd '$BENCH_DIR' && '$BENCH_BIN' --site '$TARGET_SITE' backup --with-files" \
  || die "Backup failed — not importing."

log "Importing into '${TARGET_SITE}'"
as_frappe_sh "cd '$BENCH_DIR' && '$BENCH_BIN' --site '$TARGET_SITE' execute mm_core.crm_transfer.import_crm --kwargs \"{${KW}}\"" \
  | sed '/^{"/d' || die "Import failed — restore '${TARGET_SITE}' from the backup above if needed."

as_frappe_sh "cd '$BENCH_DIR' && '$BENCH_BIN' --site '$TARGET_SITE' clear-cache"

log "Done."
cat <<EOF

  Moved CRM data: ${SOURCE_SITE} -> ${TARGET_SITE} (report above)
  Export kept at: ${EXPORT_DIR}
  Backup of ${TARGET_SITE}: ${BENCH_DIR}/sites/${TARGET_SITE}/private/backups (newest)
  ${SOURCE_SITE} is unchanged — its CRM records are still there as an archive.
EOF
