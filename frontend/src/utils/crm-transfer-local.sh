#!/usr/bin/env bash
#
# crm-transfer-local.sh — LOCAL sibling of crm-transfer-production.sh: move the
# CRM data from local micromaxerp to local wise on the development bench
# (/home/maqmalak/erpnext-react), as a rehearsal of the production demo -> wise
# move. Same tool (mm_core.crm_transfer), same steps, but runs as your own user
# (no root/sudo — the local bench is yours) and points at the local sites.
#
# What moves: CRM Organizations, Leads, Deals (products, contacts, status history),
# all CRM Tasks, Notes and Call Logs, linked Contacts/Addresses, every email MAILBOX
# sent or received plus all CRM-linked emails, comments, field-change history,
# assignments, calendar events (CRM-linked and standalone meetings/reminders),
# WhatsApp messages, attachments, and the CRM lookup lists (statuses, sources,
# industries, territories, lost reasons). micromaxerp is only read.
#
#   bash crm-transfer-local.sh                 # export + dry run, writes nothing
#   CONFIRM=1 bash crm-transfer-local.sh       # backup wise, export, import
#   TOP_UP=1 CONFIRM=1 bash crm-transfer-local.sh   # later: add only what's new
#
# The import stops without writing if a lead/deal/organization/task/call-log name
# already exists on wise (TOP_UP=1 skips those instead), or if CRM records hold
# values in fields wise lacks (ALLOW_MISSING_FIELDS=1 to accept that loss).

set -euo pipefail

log()  { echo -e "\n\033[1;36m==>\033[0m $*"; }
die()  { echo -e "\033[1;31mERROR:\033[0m $*" >&2; exit 1; }

[[ $EUID -ne 0 ]] || die "Run this as your normal user, not root (the local bench is yours)."

BENCH_DIR="${BENCH_DIR:-/home/maqmalak/erpnext-react}"
BENCH_BIN="${BENCH_BIN:-$(command -v bench || echo "$HOME/.local/bin/bench")}"
SOURCE_SITE="${SOURCE_SITE:-micromaxerp}"
TARGET_SITE="${TARGET_SITE:-wise}"
MAILBOX="${MAILBOX:-corporate@wise.edu.pk}"
EXPORT_DIR="${EXPORT_DIR:-${HOME}/crm-transfer-${SOURCE_SITE}-to-${TARGET_SITE}-$(date +%Y%m%d-%H%M%S)}"
CONFIRM="${CONFIRM:-0}"
TOP_UP="${TOP_UP:-0}"
# Doctypes whose same-named records on the target are replaced by the source's, e.g. OVERWRITE="Email Template"
# (ERPNext installs standard templates under the same names). Templates / lookup lists only.
OVERWRITE="${OVERWRITE:-}"
FALLBACK_USER="${FALLBACK_USER:-}"
ALLOW_MISSING_FIELDS="${ALLOW_MISSING_FIELDS:-0}"

[[ -x "$BENCH_BIN" ]] || die "bench not found (set BENCH_BIN)."
[[ "$SOURCE_SITE" != "$TARGET_SITE" ]] || die "SOURCE_SITE and TARGET_SITE are both '${TARGET_SITE}'."
cd "$BENCH_DIR"
for s in "$SOURCE_SITE" "$TARGET_SITE"; do
  [[ -d "sites/${s}" ]] || die "Site '${s}' not found under ${BENCH_DIR}/sites."
  "$BENCH_BIN" --site "$s" list-apps 2>/dev/null | grep -q '^mm_core' \
    || die "mm_core isn't installed on '${s}' (bench --site ${s} install-app mm_core)."
done

KW="'path': '${EXPORT_DIR}', 'allow_missing_fields': ${ALLOW_MISSING_FIELDS}, 'top_up': ${TOP_UP}, 'overwrite': '${OVERWRITE}'"
[[ -n "$FALLBACK_USER" ]] && KW="${KW}, 'fallback_user': '${FALLBACK_USER}'"

log "Exporting CRM data from '${SOURCE_SITE}' to ${EXPORT_DIR} (read-only on ${SOURCE_SITE})"
mkdir -p "$EXPORT_DIR"
"$BENCH_BIN" --site "$SOURCE_SITE" execute mm_core.crm_transfer.export_crm \
  --kwargs "{'path': '${EXPORT_DIR}', 'mailbox': '${MAILBOX}'}" | grep -v '^{.*}$' || die "Export failed."

log "Dry run on '${TARGET_SITE}' (nothing written)"
DRY="$("$BENCH_BIN" --site "$TARGET_SITE" execute mm_core.crm_transfer.import_crm --kwargs "{${KW}, 'dry_run': 1}" 2>&1)" \
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
"$BENCH_BIN" --site "$TARGET_SITE" backup --with-files | tail -3 || die "Backup failed — not importing."

log "Importing into '${TARGET_SITE}'"
"$BENCH_BIN" --site "$TARGET_SITE" execute mm_core.crm_transfer.import_crm --kwargs "{${KW}}" | sed '/^{"/d' \
  || die "Import failed — restore '${TARGET_SITE}' from the backup above if needed."
"$BENCH_BIN" --site "$TARGET_SITE" clear-cache

log "Done."
cat <<EOF

  Moved CRM data: ${SOURCE_SITE} -> ${TARGET_SITE} (report above)
  Export kept at: ${EXPORT_DIR}
  Backup of ${TARGET_SITE}: ${BENCH_DIR}/sites/${TARGET_SITE}/private/backups (newest)
  ${SOURCE_SITE} is unchanged.
EOF
