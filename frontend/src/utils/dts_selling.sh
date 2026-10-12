#!/usr/bin/env bash
#
# dts_selling.sh — the sales side: Sales Orders, product bundles, selling
# masters that aren't customers, the CRM pipeline (Lead, Opportunity, Sales
# Stage, Opportunity Type, Market Segment) and Delivery Notes.
#
# Customers, Customer Groups, Territories, Sales Partners and Industry Types
# are master data (dts_master.sh); Sales Invoices are in dts_accounts.sh
# (Accounts module).
#
# Column mapping: same-name columns. The v14 "source" / "campaign" columns on
# Sales Order and Delivery Note became utm_source / utm_campaign in v16 (and
# now link to UTM records, not Lead Source); those rules are prepared but
# commented out in DTS_COLUMN_MAP in dts_setup.sh — enable them only after the
# UTM Source/Campaign records exist. Until then the report at the end lists
# them as "source columns with data, not in target".
#
# Run via:  bash dts_selling.sh [--execute] [--update] [--only "Sales Order"]
# Shared flags and environment are documented in dts_setup.sh.

set -euo pipefail
[[ -n "${DTS_LIB_LOADED:-}" ]] || source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/dts_setup.sh"

DTS_SELLING_EXTRA=("Delivery Note")

dts_selling_doctypes() {
  DTS_EXCLUDE=("Customer" "Customer Group" "Territory" "Industry Type" "Sales Partner Type" "Sales Partner" "Sales Person")
  { dts_module_doctypes Selling CRM; printf '%s\n' "${DTS_SELLING_EXTRA[@]}"; } | awk '!seen[$0]++'
}
dts_selling_run() { dts_copy_list < <(dts_selling_doctypes); }

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then dts_main selling "$@"; fi
