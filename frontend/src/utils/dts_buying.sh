#!/usr/bin/env bash
#
# dts_buying.sh — the purchase side: Purchase Orders, Requests for Quotation,
# Supplier Quotations, supplier scorecards, Subcontracting Orders/Receipts,
# plus the inbound stock documents Purchase Receipt, Landed Cost Voucher and
# Material Request.
#
# Suppliers and Supplier Groups are master data (dts_master.sh); Purchase
# Invoices are in dts_accounts.sh (Accounts module).
#
# Column mapping: same-name columns; hik-only columns such as purchase_location,
# abr, sync_name, inward_gate_pass (custom lucrum_* fields) are copied only if
# the matching Custom Field exists in the target — see the "source columns with
# data" report at the end.
#
# Run via:  bash dts_buying.sh [--execute] [--update] [--only "Purchase Order"]
# Shared flags and environment are documented in dts_setup.sh.

set -euo pipefail
[[ -n "${DTS_LIB_LOADED:-}" ]] || source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/dts_setup.sh"

DTS_BUYING_EXTRA=("Purchase Receipt" "Landed Cost Voucher" "Material Request")

dts_buying_doctypes() {
  DTS_EXCLUDE=("Supplier" "Supplier Group")
  { dts_module_doctypes Buying Subcontracting; printf '%s\n' "${DTS_BUYING_EXTRA[@]}"; } | awk '!seen[$0]++'
}
dts_buying_run() { dts_copy_list < <(dts_buying_doctypes); }

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then dts_main buying "$@"; fi
