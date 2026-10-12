#!/usr/bin/env bash
#
# dts_master.sh — master data: UOMs, item groups, warehouses, price lists,
# items + prices, territories, customer/supplier groups, customers, suppliers,
# contacts and addresses.
#
# Child tables (Item Default, Item Barcode, UOM Conversion Detail, Dynamic
# Link, …) come along with their parent. Tree DocTypes (Item Group, Warehouse,
# Customer Group, Territory, Supplier Group, Sales Person) get their lft/rgt
# rebuilt after a real run.
#
# Existing target rows (e.g. "All Item Groups", standard UOMs) are kept.
# Run via:  bash dts_master.sh [--execute] [--update] [--only "Item,Customer"]
# Shared flags and environment are documented in dts_setup.sh.

set -euo pipefail
[[ -n "${DTS_LIB_LOADED:-}" ]] || source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/dts_setup.sh"

DTS_MASTER_DOCTYPES=(
  "Brand" "UOM Category" "UOM" "UOM Conversion Factor"
  "Item Group" "Warehouse Type" "Price List" "Item Attribute"
  "Warehouse" "Item" "Item Price" "Item Alternative" "Stock Entry Type"
  "Customer Group" "Territory" "Sales Person" "Sales Partner Type" "Sales Partner"
  "Industry Type" "Customer"
  "Supplier Group" "Supplier"
  "Gender" "Salutation" "Party Type" "Incoterm"
  "Contact" "Address"
)

dts_master_doctypes() { printf '%s\n' "${DTS_MASTER_DOCTYPES[@]}"; }
dts_master_run()      { dts_copy_list < <(dts_master_doctypes); }

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then dts_main master "$@"; fi
