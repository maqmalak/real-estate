#!/usr/bin/env bash
#
# dts_assets.sh — Assets: Location, Asset Category (+ its accounts), Asset (+ finance books), Asset Movement,
# Asset Repair, and the DEPRECIATION SCHEDULES.
#
# Same column-mapping engine as the other dts_* scripts (see dts_setup.sh). What Assets needs on top:
#
#  1. ASSET FIELDS that changed between v14 (hik) and v16:
#       gross_purchase_amount            → net_purchase_amount, purchase_amount, total_asset_cost
#                                          (additional_asset_cost = 0, so total == gross)
#       is_existing_asset = 1            → asset_type = "Existing Asset"
#       number_of_depreciations_booked   → opening_number_of_booked_depreciations
#     Not carried (no v16 field): allow_monthly_depreciation (79 rows), purchase_receipt_amount (21 rows —
#     equal to gross_purchase_amount for every one of them, so nothing is lost).
#
#  2. DEPRECIATION SCHEDULES. In v14 the schedule was a child table of the Asset (13,322 rows, 88 assets).
#     In v16 it is a separate submittable document, "Asset Depreciation Schedule" — one per asset and finance
#     book — with the rows under it. This script creates one per (asset, finance book) from the asset's finance
#     book row and moves the rows across, keeping their journal-entry links (4,521 booked rows). Names follow the
#     v16 series (ACC-ADS-2026-#####) and the series counter is advanced so new schedules don't collide.
#
#  3. COMPANY  every reference to "HIK" / "HIK Unit02" becomes "MicroMax Erp Pvt Ltd." and every "- HIK" /
#     "- HU" account / cost-center / warehouse name is translated (same rule as dts_rebrand.sh). Unmatched
#     names are reported, not guessed.
#
#  4. DATES  Asset, Asset Movement and Asset Repair dates follow the same rule as the rest of the transferred
#     transactions (year := month >= 7 ? 2026 : 2027). A depreciation schedule is a FORECAST that runs for
#     years (hik's reach 2142), so it is NOT collapsed: each asset's schedule is shifted by the same whole
#     number of years as that asset's own available-for-use date, which keeps its monthly cadence and order
#     and starts it on the asset's new date. (Booked schedule rows keep pointing at their journal entries,
#     whose posting dates were collapsed earlier, so a booked row and its entry can differ by a year or more.)
#     Skip all date changes with ASSETS_KEEP_DATES=1.
#
# Run via:  bash dts_assets.sh [--execute] [--update] [--only "Asset,Asset Movement"]
# Shared flags and environment are documented in dts_setup.sh.

set -euo pipefail
[[ -n "${DTS_LIB_LOADED:-}" ]] || source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/dts_setup.sh"

DTS_ASSETS_DOCTYPES=("Location" "Asset Category" "Asset" "Asset Movement" "Asset Repair")

DTS_COLUMN_MAP+=$'\n''Asset :: net_purchase_amount :: s.`gross_purchase_amount`'
DTS_COLUMN_MAP+=$'\n''Asset :: purchase_amount :: s.`gross_purchase_amount`'
DTS_COLUMN_MAP+=$'\n''Asset :: total_asset_cost :: s.`gross_purchase_amount`'
DTS_COLUMN_MAP+=$'\n''Asset :: additional_asset_cost :: 0'
DTS_COLUMN_MAP+=$'\n''Asset :: asset_type :: IF(s.`is_existing_asset` = 1, '"'Existing Asset'"', '"''"')'
DTS_COLUMN_MAP+=$'\n''Asset :: opening_number_of_booked_depreciations :: s.`number_of_depreciations_booked`'

dts_assets_doctypes() { printf '%s\n' "${DTS_ASSETS_DOCTYPES[@]}"; }

dts_assets_tables_sql() {
  { dts_owned_tables_sql "${DTS_ASSETS_DOCTYPES[@]}"; echo ",'Asset Depreciation Schedule','Depreciation Schedule'"; } \
    | tr -d '\n' | tr ',' '\n' | awk 'NF && !seen[$0]++' | paste -sd, -
}

# v14 schedule child rows → v16 Asset Depreciation Schedule documents (+ their rows).
dts_assets_depreciation() {
  dts_table_exists "$SRC_DB" "tabDepreciation Schedule" || return 0
  local fy="${REBRAND_FY:-2026-2027}" ya fm k
  read -r ya fm < <(q "SELECT YEAR(year_start_date), MONTH(year_start_date) FROM \`$DST_DB\`.\`tabFiscal Year\` WHERE name='$fy'" | tr '\t' ' ')
  [[ -n "${ya:-}" ]] || die "Fiscal Year ${fy} not found on the target."
  # whole years to move this asset's schedule = how far the date rule moves the asset's own anchor date
  if [[ -n "${ASSETS_KEEP_DATES:-}" ]]; then k="0"
  else k="IF(MONTH(COALESCE(a.available_for_use_date, a.purchase_date, DATE(a.creation))) >= $fm, $ya, $((ya+1))) - YEAR(COALESCE(a.available_for_use_date, a.purchase_date, DATE(a.creation)))"; fi

  # in a dry-run the assets aren't in the target yet, so count against hik's own assets instead
  local in_target="EXISTS (SELECT 1 FROM \`$DST_DB\`.tabAsset t WHERE t.name=ds.parent)"
  ((DTS_EXECUTE)) || in_target="EXISTS (SELECT 1 FROM \`$SRC_DB\`.tabAsset t WHERE t.name=ds.parent)"
  local groups="SELECT ds.parent AS asset, IFNULL(NULLIF(ds.finance_book_id,''),'1') AS fbid, NULLIF(ds.finance_book,'') AS fb, MIN(ds.creation) AS creation
                FROM \`$SRC_DB\`.\`tabDepreciation Schedule\` ds
                WHERE ds.parenttype='Asset' AND $in_target
                  AND NOT EXISTS (SELECT 1 FROM \`$DST_DB\`.\`tabAsset Depreciation Schedule\` x
                                  WHERE x.asset=ds.parent AND x.finance_book_id = CAST(IFNULL(NULLIF(ds.finance_book_id,''),'1') AS UNSIGNED))
                GROUP BY ds.parent, 2, 3"
  local n_groups n_rows
  n_groups="$(q "SELECT COUNT(*) FROM ($groups) g")"
  n_rows="$(q "SELECT COUNT(*) FROM \`$SRC_DB\`.\`tabDepreciation Schedule\` ds WHERE ds.parenttype='Asset' AND $in_target
               AND NOT EXISTS (SELECT 1 FROM \`$DST_DB\`.\`tabAsset Depreciation Schedule\` x WHERE x.asset=ds.parent AND x.finance_book_id = CAST(IFNULL(NULLIF(ds.finance_book_id,''),'1') AS UNSIGNED))")"
  if ((DTS_EXECUTE)); then
    local map="\`$DST_DB\`.dts_ads_map" ADS="\`$DST_DB\`.\`tabAsset Depreciation Schedule\`" CH="\`$DST_DB\`.\`tabDepreciation Schedule\`"
    if ! q "SET SESSION sql_mode='NO_ENGINE_SUBSTITUTION';
      SET @base := (SELECT IFNULL(MAX(\`current\`),0) FROM \`$DST_DB\`.tabSeries WHERE name='ACC-ADS-2026-');
      DROP TABLE IF EXISTS $map;
      CREATE TABLE $map AS
        SELECT g.asset, g.fbid, g.fb, g.creation,
               CONCAT('ACC-ADS-2026-', LPAD(@base + ROW_NUMBER() OVER (ORDER BY g.asset, g.fbid), 5, '0')) AS ads_name,
               ($k) AS k
        FROM ($groups) g JOIN \`$SRC_DB\`.tabAsset a ON a.name = g.asset;
      INSERT IGNORE INTO $ADS
        (name, creation, modified, modified_by, owner, docstatus, idx, naming_series, asset, company, net_purchase_amount,
         opening_accumulated_depreciation, opening_number_of_booked_depreciations, finance_book, finance_book_id, depreciation_method,
         total_number_of_depreciations, rate_of_depreciation, daily_prorata_based, shift_based, frequency_of_depreciation,
         expected_value_after_useful_life, value_after_depreciation, status)
      SELECT m.ads_name, a.creation, a.modified, a.modified_by, a.owner, a.docstatus, 0, 'ACC-ADS-.YYYY.-', a.name, a.company,
             a.gross_purchase_amount, a.opening_accumulated_depreciation, a.number_of_depreciations_booked, m.fb, CAST(m.fbid AS UNSIGNED),
             IFNULL(f.depreciation_method,''), IFNULL(f.total_number_of_depreciations,0), IFNULL(f.rate_of_depreciation,0), 0, 0,
             IFNULL(f.frequency_of_depreciation,0), IFNULL(f.expected_value_after_useful_life,0),
             IFNULL(f.value_after_depreciation, a.value_after_depreciation), IF(a.docstatus=0,'Draft',IF(a.docstatus=2,'Cancelled','Active'))
      FROM $map m JOIN \`$SRC_DB\`.tabAsset a ON a.name = m.asset
      LEFT JOIN \`$SRC_DB\`.\`tabAsset Finance Book\` f ON f.parent = m.asset AND f.idx = CAST(m.fbid AS UNSIGNED);
      INSERT IGNORE INTO $CH
        (name, creation, modified, modified_by, owner, docstatus, idx, parent, parentfield, parenttype, schedule_date,
         depreciation_amount, accumulated_depreciation_amount, journal_entry)
      SELECT ds.name, ds.creation, ds.modified, ds.modified_by, ds.owner, ds.docstatus, ds.idx, m.ads_name, 'depreciation_schedule',
             'Asset Depreciation Schedule', DATE_ADD(ds.schedule_date, INTERVAL m.k YEAR), ds.depreciation_amount,
             ds.accumulated_depreciation_amount, NULLIF(ds.journal_entry,'')
      FROM \`$SRC_DB\`.\`tabDepreciation Schedule\` ds
      JOIN $map m ON m.asset = ds.parent AND m.fbid = IFNULL(NULLIF(ds.finance_book_id,''),'1') AND m.fb <=> NULLIF(ds.finance_book,'')
      WHERE ds.parenttype = 'Asset';
      INSERT INTO \`$DST_DB\`.tabSeries (name, \`current\`) SELECT 'ACC-ADS-2026-', @base + COUNT(*) FROM $map HAVING COUNT(*) > 0
        ON DUPLICATE KEY UPDATE \`current\` = GREATEST(\`current\`, VALUES(\`current\`));
      DROP TABLE $map;" >/dev/null; then
      warn "Asset Depreciation Schedule FAILED"; DTS_FAILED+=("Asset Depreciation Schedule"); q "DROP TABLE IF EXISTS \`$DST_DB\`.dts_ads_map" >/dev/null 2>&1 || true; return 0
    fi
  fi
  printf '    %-9s %-44s schedules=%s  rows=%s\n' "$( ((DTS_EXECUTE)) && echo copied || echo dry-run)" "Asset Depreciation Schedule (+ rows)" "$n_groups" "$n_rows"
  DTS_TABLES=$((DTS_TABLES+1))
}

dts_assets_run() {
  log "1/4 Locations, asset categories, assets (+ finance books), movements, repairs"
  dts_copy_list < <(dts_assets_doctypes)

  log "2/4 Depreciation schedules: v14 child rows → v16 Asset Depreciation Schedule documents"
  dts_assets_depreciation

  log "3/4 Company: HIK / HIK Unit02 → ${REBRAND_COMPANY:-MicroMax Erp Pvt Ltd.}, and the '- HIK' / '- HU' names"
  if ((DTS_EXECUTE)); then dts_translate apply "$(dts_assets_tables_sql)" || { warn "name/company translation reported problems"; DTS_FAILED+=("company/name translation"); }
  else dts_translate plan "$(dts_assets_tables_sql)" || true; note "(a real run rewrites those references in the tables above)"; fi

  log "4/4 Dates (Asset, Asset Movement, Asset Repair → FY ${REBRAND_FY:-2026-2027}; schedules shifted with their asset)"
  if [[ -n "${ASSETS_KEEP_DATES:-}" ]]; then note "ASSETS_KEEP_DATES set — dates left as they were in hik"
  elif ((DTS_EXECUTE)); then dts_apply_dates "Asset,Asset Movement,Asset Repair" || { warn "date rewrite reported problems"; DTS_FAILED+=("dates"); }
  else note "(a real run applies the date rule to the copied rows; schedules were already shifted when they were created)"; fi
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then dts_main assets "$@"; fi
