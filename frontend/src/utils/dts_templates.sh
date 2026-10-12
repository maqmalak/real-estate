#!/usr/bin/env bash
#
# dts_templates.sh — templates and print/layout definitions: every DocType
# whose name ends in "Template"/"Templates" (Item Tax Template, Payment Terms
# Template, Sales/Purchase Taxes and Charges Template, Journal Entry Template,
# Address Template, Email Template, Salary/Appraisal/Appointment templates, …)
# plus Terms and Conditions, Print Format, Print Heading, Print Style and
# Letter Head.
#
# Child rows are taken per template (parenttype), so tax rows that belong to
# invoices/orders are NOT pulled in here — dts_accounts/buying/selling own
# those.
#
# Run via:  bash dts_templates.sh [--execute] [--update] [--only "Email Template"]
# Shared flags and environment are documented in dts_setup.sh.

set -euo pipefail
[[ -n "${DTS_LIB_LOADED:-}" ]] || source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/dts_setup.sh"

DTS_TEMPLATE_EXTRAS=("Terms and Conditions" "Print Format" "Print Heading" "Print Style" "Letter Head")

dts_templates_doctypes() {
  local n
  {
    q "SELECT name FROM \`$DST_DB\`.tabDocType WHERE istable=0 AND issingle=0 AND name REGEXP ' Templates?\$' ORDER BY name"
    printf '%s\n' "${DTS_TEMPLATE_EXTRAS[@]}"
  } | awk '!seen[$0]++' | while IFS= read -r n; do
    dts_table_exists "$SRC_DB" "tab$n" && dts_src_has_rows "$n" && echo "$n"
  done
  return 0
}
dts_templates_run() { dts_copy_list < <(dts_templates_doctypes); }

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then dts_main templates "$@"; fi
