#!/usr/bin/env bash
#
# dts_mfg.sh — Manufacturing: Workstation, BOM, Production Plan, Work Order, Job Card, Downtime Entry,
# with every child table (BOM Item / Explosion / Operation, Production Plan Item + the workstation
# allocation tables, Work Order Item / Operation / Workstations, Job Card Time Log, …).
#
# Same column-mapping engine as the other dts_* scripts (see dts_setup.sh), plus the pieces
# Manufacturing needs:
#
#  1. CUSTOM FIELDS  hik's Custom Fields on these DocTypes (BOM: bom_type, main_operation, target_yield,
#     material_issued, spindle_required …; BOM Item: blend_ratio, item_yield, gross_up_qty; Work Order:
#     28 fields; Workstation, Job Card, Downtime Entry, Production Plan …) are copied first and their
#     columns created, so the rows below carry them across. Anything still without a home is listed.
#
#  2. SCHEMA CHANGES v14 → v16 that a same-name mapping can't do:
#       BOM.scrap_material_cost / base_scrap_material_cost  →  secondary_items_cost / base_secondary_items_cost
#                                                              (equal to the sum of the scrap items in all 992 BOMs)
#       BOM Scrap Item (2,707 rows)                          →  BOM Secondary Item, type "Scrap"
#       Workstation.hour_rate_electricity/_consumable/_rent/_labour
#                                                            →  Workstation Cost rows
#                                                              (Electricity / Consumables / Rent / Wages)
#     Not carried (no data value / no v16 field): BOM.bom_level (6 rows), BOM Item.yield (an orphan
#     column, all zero), BOM Scrap Item.percentage (scrap % has no v16 equivalent; kept only for process loss).
#
#  3. COMPANY  every reference to "HIK" / "HIK Unit02" becomes "MicroMax Erp Pvt Ltd.", and every Account,
#     Cost Center, Warehouse and Department name is translated the same way dts_rebrand.sh did it ("- HIK"
#     → "- MEPL"; HIK Unit02 warehouses that clashed keep their "Unit02" tag). A name with no counterpart on
#     this site is reported, not guessed.
#
#  4. DATES  transaction dates move into fiscal year 2026-2027 with the same rule as dts_rebrand.sh
#     (year := month >= 7 ? 2026 : 2027; month and day kept) so Work Orders line up with the Sales Orders,
#     Stock Entries and everything else already moved. Skip with MFG_KEEP_DATES=1.
#
#  5. LOGIC  the calculations that the old lucrum_textile_changes app ran (blend ratio → item qty, blended
#     yield, gross-up qty, material issued, waste, spindle/frame requirement) live in
#     apps/micromax/micromax/mfg_logic.py, recovered from this very data. After a real run this script
#     calls its verify_against_data() so you can see how closely they reproduce the transferred values.
#
# Run via:  bash dts_mfg.sh [--execute] [--update] [--only "Work Order,Job Card"]
# Shared flags and environment are documented in dts_setup.sh.

set -euo pipefail
[[ -n "${DTS_LIB_LOADED:-}" ]] || source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/dts_setup.sh"

DTS_MFG_MASTERS=("Workstation" "Operation")
DTS_MFG_DOCS=("BOM" "Production Plan" "Work Order" "Job Card" "Downtime Entry")

# v14 → v16 renames (the engine reads DTS_COLUMN_MAP at copy time)
DTS_COLUMN_MAP+=$'\n''BOM :: secondary_items_cost :: s.`scrap_material_cost`'
DTS_COLUMN_MAP+=$'\n''BOM :: base_secondary_items_cost :: s.`base_scrap_material_cost`'

dts_mfg_doctypes() { printf '%s\n' "${DTS_MFG_MASTERS[@]}" "${DTS_MFG_DOCS[@]}"; }

# every DocType this script owns, child tables included, as a quoted SQL list
dts_mfg_all_doctypes_sql() {
  { dts_owned_tables_sql "${DTS_MFG_MASTERS[@]}" "${DTS_MFG_DOCS[@]}"; echo ",'BOM Secondary Item','Workstation Cost'"; } | tr -d '\n' | tr ',' '\n' | awk 'NF && !seen[$0]++' | paste -sd, -
}



# ------------------------------------------------------------------------------ steps
dts_mfg_custom_fields() {
  local in; in="$(dts_mfg_all_doctypes_sql)"
  dts_copy_table "Custom Field" "tabCustom Field" "s.dt IN ($in) AND s.dt IN (SELECT name FROM \`{DST}\`.tabDocType)"
  dts_copy_table "Property Setter" "tabProperty Setter" "s.doc_type IN ($in) AND s.doc_type IN (SELECT name FROM \`{DST}\`.tabDocType)"
  if ((DTS_EXECUTE)); then dts_sync_custom_columns || { warn "column sync failed"; DTS_FAILED+=("custom field columns"); }; fi
}

# Workstation.hour_rate_* (v14) → Workstation Cost rows (v15+). The four components exist here as masters.
dts_mfg_workstation_costs() {
  local sub="" comp col i=0
  for spec in "Electricity:hour_rate_electricity" "Consumables:hour_rate_consumable" "Rent:hour_rate_rent" "Wages:hour_rate_labour"; do
    comp="${spec%%:*}"; col="${spec##*:}"; i=$((i+1))
    [[ -n "$sub" ]] && sub+=" UNION ALL "
    sub+="SELECT name, creation, modified, modified_by, owner, '$comp' comp, \`$col\` cost, $i idx FROM \`$SRC_DB\`.tabWorkstation WHERE \`$col\` > 0"
  done
  local where="EXISTS (SELECT 1 FROM \`$DST_DB\`.tabWorkstation t WHERE t.name=w.name) AND NOT EXISTS (SELECT 1 FROM \`$DST_DB\`.\`tabWorkstation Cost\` c WHERE c.parent=w.name AND c.operating_component=w.comp)"
  local n; n="$(q "SELECT COUNT(*) FROM ($sub) w WHERE $where")"
  if ((DTS_EXECUTE)); then
    q "INSERT IGNORE INTO \`$DST_DB\`.\`tabWorkstation Cost\` (name, creation, modified, modified_by, owner, docstatus, idx, operating_component, operating_cost, parent, parentfield, parenttype)
       SELECT SUBSTRING(MD5(CONCAT(w.name,'|',w.comp)),1,10), w.creation, w.modified, w.modified_by, w.owner, 0, w.idx, w.comp, w.cost, w.name, 'workstation_costs', 'Workstation'
       FROM ($sub) w WHERE $where" || { warn "workstation cost rows FAILED"; DTS_FAILED+=("Workstation Cost"); return 0; }
  fi
  printf '    %-9s %-44s rows=%s\n' "$( ((DTS_EXECUTE)) && echo copied || echo dry-run)" "Workstation Cost (from hour_rate_*)" "$n"
  DTS_TABLES=$((DTS_TABLES+1))
}

# BOM Scrap Item (v14) → BOM Secondary Item, type Scrap (v15+).
dts_mfg_scrap_to_secondary() {
  dts_table_exists "$SRC_DB" "tabBOM Scrap Item" || return 0
  local where="EXISTS (SELECT 1 FROM \`$DST_DB\`.tabBOM b WHERE b.name = s.parent)"
  local n; n="$(q "SELECT COUNT(*) FROM \`$SRC_DB\`.\`tabBOM Scrap Item\` s WHERE $where AND NOT EXISTS (SELECT 1 FROM \`$DST_DB\`.\`tabBOM Secondary Item\` d WHERE d.name = s.name)")"
  if ((DTS_EXECUTE)); then
    q "INSERT IGNORE INTO \`$DST_DB\`.\`tabBOM Secondary Item\`
         (name, creation, modified, modified_by, owner, docstatus, idx, parent, parentfield, parenttype, item_code, item_name,
          secondary_item_type, uom, qty, stock_uom, conversion_factor, stock_qty, valuation_type, cost_allocation_per,
          process_loss_per, cost, base_cost, process_loss_qty)
       SELECT s.name, s.creation, s.modified, s.modified_by, s.owner, s.docstatus, s.idx, s.parent, 'secondary_items', 'BOM',
              s.item_code, s.item_name, 'Scrap', s.stock_uom, s.stock_qty, s.stock_uom, 1, s.stock_qty, 'Manual', 0,
              IF(s.is_process_loss, s.percentage, 0), s.amount, s.base_amount, 0
       FROM \`$SRC_DB\`.\`tabBOM Scrap Item\` s WHERE $where" || { warn "BOM Secondary Item FAILED"; DTS_FAILED+=("BOM Secondary Item"); return 0; }
  fi
  printf '    %-9s %-44s rows=%s\n' "$( ((DTS_EXECUTE)) && echo copied || echo dry-run)" "BOM Secondary Item (from BOM Scrap Item)" "$n"
  DTS_TABLES=$((DTS_TABLES+1))
}

dts_mfg_run() {
  log "1/6 hik's Custom Fields on the manufacturing DocTypes, and their columns"
  dts_mfg_custom_fields

  log "2/6 Masters: Workstation (+ its cost rows), Operation"
  dts_copy_list < <(printf '%s\n' "${DTS_MFG_MASTERS[@]}")
  dts_mfg_workstation_costs

  log "3/6 BOM (blend ratios, yields, operations, exploded items) + scrap → secondary items"
  dts_copy_doctype "BOM"
  dts_mfg_scrap_to_secondary

  log "4/6 Production Plan, Work Order, Job Card, Downtime Entry (with all child tables)"
  local d; for d in "Production Plan" "Work Order" "Job Card" "Downtime Entry"; do dts_copy_doctype "$d"; done

  log "5/6 Company: HIK / HIK Unit02 → ${REBRAND_COMPANY:-MicroMax Erp Pvt Ltd.}, and the '- HIK' / '- HU' names"
  if ((DTS_EXECUTE)); then dts_translate apply "$(dts_mfg_all_doctypes_sql)" || { warn "name/company translation reported problems"; DTS_FAILED+=("company/name translation"); }
  else dts_translate plan "$(dts_mfg_all_doctypes_sql)" || true; note "(a real run rewrites those references in the tables above)"; fi

  log "6/6 Dates → fiscal year ${REBRAND_FY:-2026-2027} (month and day kept)"
  if [[ -n "${MFG_KEEP_DATES:-}" ]]; then note "MFG_KEEP_DATES set — dates left as they were in hik"
  elif ((DTS_EXECUTE)); then
    dts_apply_dates "$(IFS=,; echo "${DTS_MFG_DOCS[*]}")" || { warn "date rewrite reported problems"; DTS_FAILED+=("dates"); }
  else note "(a real run applies the same date rule as dts_rebrand.sh to the copied rows)"; fi

  if ((DTS_EXECUTE)); then
    log "Calculation logic vs the transferred data (micromax/mfg_logic.py)"
    dts_bench execute micromax.mfg_logic.verify_against_data 2>&1 | grep -v "^$" || warn "verify_against_data could not run — run: bench --site ${SITE_NAME} execute micromax.mfg_logic.verify_against_data"
  fi
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then dts_main mfg "$@"; fi
