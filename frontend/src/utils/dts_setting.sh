#!/usr/bin/env bash
#
# dts_setting.sh — configuration: every Single DocType (Accounts Settings,
# Selling/Buying/Stock Settings, HR Settings, Payroll Settings, Global
# Defaults, Print Settings, …), the Notification rules and Success Actions,
# and the naming-series counters.
#
# Singles are stored as (doctype, field, value) rows in tabSingles; only fields
# that still exist in the target's DocType (or its Custom Fields) are carried
# over — that is this script's column mapping. System Settings and Installed
# Applications are never copied: they describe the site/bench itself.
#
# Naming-series counters (tabSeries) are merged with GREATEST(), so documents
# created in the target afterwards never collide with the transferred ones.
#
# Not copied: Email Account / Email Domain (their passwords are encrypted with
# the old site's key), Auto Email Report and Email Digest (they would start
# mailing people from the new site). Copy them by hand once you've decided.
#
# Note: Global Defaults carries default_company — after a real run the site
# default company becomes hik's, not "MicroMax Erp Pvt Ltd.".
#
# Run via:  bash dts_setting.sh [--execute] [--only "Selling Settings"]
# Shared flags and environment are documented in dts_setup.sh.

set -euo pipefail
[[ -n "${DTS_LIB_LOADED:-}" ]] || source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/dts_setup.sh"

DTS_SETTING_DOCTYPES=("Notification" "Success Action")
DTS_SETTING_SKIP_SINGLES=("System Settings" "Installed Applications")

dts_setting_doctypes() { printf '%s\n' "${DTS_SETTING_DOCTYPES[@]}"; }   # parents only; singles are enumerated in _run

dts_setting_singles() {
  local n x skip
  while IFS= read -r n; do
    skip=0; for x in "${DTS_SETTING_SKIP_SINGLES[@]}"; do [[ "$x" == "$n" ]] && skip=1; done
    ((skip)) || echo "$n"
  done < <(q "SELECT d.name FROM \`$DST_DB\`.tabDocType d WHERE d.issingle=1 AND EXISTS (SELECT 1 FROM \`$SRC_DB\`.tabSingles s WHERE s.doctype=d.name) ORDER BY d.name")
}

dts_setting_run() {
  log "Single DocTypes (settings)"
  local dt; while IFS= read -r dt; do dts_copy_single "$dt"; done < <(dts_setting_singles)

  log "Notification rules, success actions"
  dts_copy_list < <(dts_setting_doctypes)

  log "Naming-series counters (merged with GREATEST)"
  local n; n="$(q "SELECT COUNT(*) FROM \`$SRC_DB\`.tabSeries")"
  if ((DTS_EXECUTE)); then
    q "INSERT INTO \`$DST_DB\`.tabSeries (name, \`current\`) SELECT s.name, s.\`current\` FROM \`$SRC_DB\`.tabSeries s
       ON DUPLICATE KEY UPDATE \`current\` = GREATEST(\`$DST_DB\`.tabSeries.\`current\`, VALUES(\`current\`))" \
      || { warn "tabSeries merge FAILED"; DTS_FAILED+=("tabSeries"); return 0; }
  fi
  printf '    %-9s %-44s series=%s\n' "$( ((DTS_EXECUTE)) && echo merged || echo dry-run)" "Series counters" "$n"
  DTS_TABLES=$((DTS_TABLES+1))
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then dts_main setting "$@"; fi
