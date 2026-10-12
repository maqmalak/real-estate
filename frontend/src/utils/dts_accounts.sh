#!/usr/bin/env bash
#
# dts_accounts.sh — the Accounts module: fiscal years, chart of accounts, cost
# centers, banks, modes of payment, tax categories; Sales/Purchase Invoices,
# Journal Entries, Payment Entries, Period Closing Vouchers, GL Entries and
# Payment Ledger Entries — plus the stock-valuation ledger that feeds the GL
# (Stock Entry, Stock Reconciliation, Stock Ledger Entry, Bin, Repost Item
# Valuation), so Purchase Receipts / Delivery Notes copied by dts_buying /
# dts_selling aren't left without their stock postings.
#
# Non-submittable DocTypes (masters, ledgers) go first, then the submittable
# ones. Templates belong to dts_templates.sh.
#
# Company: hik has companies "HIK" and "HIK Unit02"; they are added next to the
# target's own company by dts_setup.sh, and every account/cost center keeps its
# "- HIK" / "- HU" suffix — nothing is renamed, so all links stay valid.
#
# Known gap: v16 moved item_wise_tax_detail (a JSON column on the tax rows)
# into the separate "Item Wise Tax Detail" table. The column is reported as
# "source column with data, not in target"; splitting the JSON into rows is not
# done here.
#
# Run via:  bash dts_accounts.sh [--execute] [--update] [--only "GL Entry"]
# Shared flags and environment are documented in dts_setup.sh.

set -euo pipefail
[[ -n "${DTS_LIB_LOADED:-}" ]] || source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/dts_setup.sh"

DTS_ACCOUNTS_EXTRA=("Stock Entry" "Stock Reconciliation" "Stock Ledger Entry" "Bin" "Repost Item Valuation")

dts_accounts_doctypes() {
  DTS_EXCLUDE=()
  { dts_module_doctypes Accounts; printf '%s\n' "${DTS_ACCOUNTS_EXTRA[@]}"; } | awk '!seen[$0]++'
}
dts_accounts_run() { dts_copy_list < <(dts_accounts_doctypes); }

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then dts_main accounts "$@"; fi
