#!/usr/bin/env bash
#
# dts_issues.sh — Support issues: Issue Type, Issue Priority, Issue.
#
# hik has 16 Issues, 2 Issue Types and 3 Issue Priorities (the priorities already exist here and are kept).
#
# v14 → v16 renames (Issue's SLA fields were prefixed when ERPNext moved to the Service Level Agreement rework):
#       resolution_by    → sla_resolution_by
#       resolution_date  → sla_resolution_date     (10 rows have it)
# Not carried (no v16 field): response_by_variance and resolution_by_variance (2 rows each) — v14 stored how far
# past its SLA target an issue ran; v16 derives that from the SLA dates instead.
#
#  * COMPANY  "HIK" / "HIK Unit02" → "MicroMax Erp Pvt Ltd." (Issue.company) and any "- HIK" / "- HU" names are
#    translated the same way as in dts_rebrand.sh.
#  * DATES  Issue dates follow the rule used for every other transferred document
#    (year := month >= 7 ? 2026 : 2027, month and day kept). Skip with ISSUES_KEEP_DATES=1.
#
# Only ERPNext's Issue is covered. The Helpdesk app installed on this site keeps its own tickets (HD Ticket) and
# hik had none.
#
# Run via:  bash dts_issues.sh [--execute] [--update] [--only "Issue"]
# Shared flags and environment are documented in dts_setup.sh.

set -euo pipefail
[[ -n "${DTS_LIB_LOADED:-}" ]] || source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/dts_setup.sh"

DTS_ISSUES_DOCTYPES=("Issue Type" "Issue Priority" "Issue")

DTS_COLUMN_MAP+=$'\n''Issue :: sla_resolution_by :: s.`resolution_by`'
DTS_COLUMN_MAP+=$'\n''Issue :: sla_resolution_date :: s.`resolution_date`'

dts_issues_doctypes() { printf '%s\n' "${DTS_ISSUES_DOCTYPES[@]}"; }

dts_issues_run() {
  log "1/3 Issue types, priorities, issues"
  dts_copy_list < <(dts_issues_doctypes)

  log "2/3 Company: HIK / HIK Unit02 → ${REBRAND_COMPANY:-MicroMax Erp Pvt Ltd.}, and the '- HIK' / '- HU' names"
  if ((DTS_EXECUTE)); then dts_translate apply "$(dts_owned_tables_sql "${DTS_ISSUES_DOCTYPES[@]}")" || { warn "name/company translation reported problems"; DTS_FAILED+=("company/name translation"); }
  else dts_translate plan "$(dts_owned_tables_sql "${DTS_ISSUES_DOCTYPES[@]}")" || true; note "(a real run rewrites those references in the tables above)"; fi

  log "3/3 Dates → fiscal year ${REBRAND_FY:-2026-2027} (month and day kept)"
  if [[ -n "${ISSUES_KEEP_DATES:-}" ]]; then note "ISSUES_KEEP_DATES set — dates left as they were in hik"
  elif ((DTS_EXECUTE)); then dts_apply_dates "Issue" || { warn "date rewrite reported problems"; DTS_FAILED+=("dates"); }
  else note "(a real run applies the date rule to the copied Issue rows)"; fi
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then dts_main issues "$@"; fi
