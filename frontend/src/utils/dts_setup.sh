#!/usr/bin/env bash
#
# dts_setup.sh — shared engine + first step of the hik → site data transfer.
#
# The dts_* family copies data from the old ERPNext database (`hik`, an older
# Frappe/ERPNext/HRMS version with custom lucrum_* apps) into this bench's
# site database (Frappe version-16). The two schemas differ table by table,
# so nothing is copied with SELECT * — every table is copied through a
# COLUMN MAPPING built at run time:
#
#   • each column of the TARGET table is filled from the same-named column of
#     the source table;
#   • columns listed in DTS_COLUMN_MAP below are filled from a renamed column
#     or an SQL expression instead;
#   • target-only columns are left to their defaults, and source-only columns
#     are dropped — but any dropped column that actually holds data is
#     reported, so nothing disappears silently.
#
# Order to run (dts_setup.sh all runs them in this order):
#   dts_doctypes.sh   creates the DocTypes hik has and this site lacks (lucrum_*
#                     apps: gate passes, payroll, textile) + their data
#   dts_setup.sh      custom fields + property setters (then bench migrate),
#                     users/roles/permissions, workflows, Company
#   dts_master.sh     items, warehouses, customers, suppliers, contacts, …
#   dts_templates.sh  tax/payment-terms/journal templates, print formats, …
#   dts_setting.sh    Single doctypes (settings), naming-series counters
#   dts_accounts.sh   chart of accounts, invoices, payments, journals, GL,
#                     stock ledger (stock valuation feeds the GL)
#   dts_buying.sh     purchase orders, RFQs, receipts, subcontracting
#   dts_selling.sh    sales orders, delivery notes, CRM pipeline
#   dts_hrms.sh       employees, attendance, leave, payroll
#   dts_mfg.sh        workstations, BOMs, production plans, work orders, job cards, downtime
#   dts_assets.sh     assets, categories, movements, repairs, depreciation schedules
#   dts_projects.sh   projects and tasks
#   dts_issues.sh     support issues
#
# Usage (run in your own terminal — it prompts for the DB password):
#   bash dts_setup.sh check                 # connectivity + config, no changes
#   bash dts_setup.sh report                # what each script covers / misses
#   bash dts_setup.sh                       # DRY-RUN of this script's group
#   bash dts_setup.sh all                   # DRY-RUN of everything
#   bash dts_setup.sh all --execute         # really write (backs up first)
#
# Flags (any dts_* script):
#   --execute        write to the target. Without it every script is a DRY-RUN
#                    that only reads and prints what it would do.
#   --update         on primary-key conflicts overwrite the target row
#                    (default: keep the target row, INSERT IGNORE).
#   --only "A,B"     only these DocTypes (their child tables come along).
#   --yes            don't ask for confirmation.
#   --skip-backup    don't mysqldump the target before the first write.
#   --no-migrate     (dts_setup.sh) don't run `bench migrate` after copying
#                    Custom Fields.
#   --no-dropped-check   skip the "dropped column holds data" scan (faster).
#   --list           print the DocTypes this script covers and exit.
#
# Environment (all optional):
#   SRC_DB=hik  DST_DB=<db_name from site_config.json>  SITE_NAME=micromaxerp
#   BENCH_DIR=/home/maqmalak/erpnext-react
#   DB_USER=maqmalak  DB_PASSWORD=…  DB_HOST=…  DB_PORT=3306
#   DTS_BACKUP_DIR=~/dts-backups  DTS_LOG_DIR=~/dts-logs
#
# Not copied at all (by design): logs and runtime tables (Version, Comment,
# Error Log, Access Log, Email Queue, …), File records/attachments, Desk
# Workspaces/Dashboards (the v16 shapes differ), Website/Portal, Email
# Account/Domain, Auto Email Report, and everything belonging to apps that
# aren't installed on the target (lucrum_*, gate pass, loan management, …).
# `report` lists what is left over.

set -euo pipefail

if [[ -z "${DTS_LIB_LOADED:-}" ]]; then
DTS_LIB_LOADED=1

log()  { echo -e "\n\033[1;36m==>\033[0m $*"; }
warn() { echo -e "\033[1;33mWARN:\033[0m $*" >&2; }
die()  { echo -e "\033[1;31mERROR:\033[0m $*" >&2; exit 1; }
note() { echo -e "    $*"; }

# ============================================================== Configuration
DTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BENCH_DIR="${BENCH_DIR:-/home/maqmalak/erpnext-react}"
SITE_NAME="${SITE_NAME:-micromaxerp}"
SRC_DB="${SRC_DB:-hik}"
if [[ -z "${DST_DB:-}" ]]; then
  DST_DB="$(grep -o '"db_name": *"[^"]*"' "${BENCH_DIR}/sites/${SITE_NAME}/site_config.json" 2>/dev/null | cut -d'"' -f4 || true)"
  DST_DB="${DST_DB:-_0bc574163734a8d8}"
fi
DB_USER="${DB_USER:-maqmalak}"
DTS_BACKUP_DIR="${DTS_BACKUP_DIR:-${HOME}/dts-backups}"
DTS_LOG_DIR="${DTS_LOG_DIR:-${HOME}/dts-logs}"

DTS_EXECUTE=0; DTS_UPDATE=0; DTS_YES=${DTS_YES:-0}; DTS_SKIP_BACKUP=0
DTS_MIGRATE=1; DTS_CHECK_DROPPED=1; DTS_LIST=0; DTS_ONLY=""

DTS_SKIPPED=(); DTS_FAILED=(); DTS_DROPPED=(); DTS_TREES=()
DTS_TABLES=0; DTS_NEW_ROWS=0

# ------------------------------------------------------------ Column mapping
# One rule per line:   <DocType> :: <target column> :: <SQL expression>
# The expression is evaluated against the source row, aliased `s`; {SRC} is
# replaced by the source database name. Anything not listed here is matched
# by identical column name (see header). Only rules verified against both
# schemas belong in the active section — the rest are candidates to review.
read -r -d '' DTS_COLUMN_MAP <<'EOF' || true
# --- verified renames / derived values -------------------------------------
Salary Slip Loan :: loan_product :: s.`loan_type`
Bin :: company :: (SELECT w.`company` FROM `{SRC}`.`tabWarehouse` w WHERE w.`name` = s.`warehouse` LIMIT 1)

# --- candidates: uncomment after checking the data ---------------------------
# Leave Type :: non_encashable_leaves :: s.`encashment_threshold_days`
# Sales Invoice :: utm_source :: s.`source`          (needs matching UTM Source records)
# Sales Invoice :: utm_campaign :: s.`campaign`      (needs matching UTM Campaign records)
# Sales Order :: utm_source :: s.`source`
# Sales Order :: utm_campaign :: s.`campaign`
# Delivery Note :: utm_source :: s.`source`
# Delivery Note :: utm_campaign :: s.`campaign`
EOF

# ------------------------------------------------------------------ DB access
_mysql_args=(--batch --skip-column-names --default-character-set=utf8mb4 -u "$DB_USER")
[[ -n "${DB_HOST:-}" ]] && _mysql_args+=(-h "$DB_HOST" -P "${DB_PORT:-3306}")

# q "<sql>" — run SQL, print rows. The password travels via MYSQL_PWD, not argv.
q() { MYSQL_PWD="$DB_PASSWORD" mariadb "${_mysql_args[@]}" -e "$1" </dev/null; }
sqlq() { printf '%s' "${1//\'/\'\'}"; }        # escape for a '…' literal

dts_table_exists() {   # db table
  [[ -n "$(q "SELECT 1 FROM information_schema.tables WHERE table_schema='$1' AND table_name='$(sqlq "$2")' LIMIT 1")" ]]
}
dts_cols() { q "SHOW COLUMNS FROM \`$1\`.\`$2\`" | cut -f1; }   # db table
dts_src_has_rows() { [[ -n "$(q "SELECT 1 FROM \`$SRC_DB\`.\`tab$(sqlq "$1")\` LIMIT 1" 2>/dev/null)" ]]; }

# =========================================================== Argument parsing
dts_parse_args() {
  while (($#)); do
    case "$1" in
      --execute)          DTS_EXECUTE=1 ;;
      --update)           DTS_UPDATE=1 ;;
      --yes|-y)           DTS_YES=1 ;;
      --skip-backup)      DTS_SKIP_BACKUP=1 ;;
      --no-migrate)       DTS_MIGRATE=0 ;;
      --no-dropped-check) DTS_CHECK_DROPPED=0 ;;
      --list)             DTS_LIST=1 ;;
      --only)             shift; DTS_ONLY="${1:-}" ;;
      --only=*)           DTS_ONLY="${1#--only=}" ;;
      -h|--help)          sed -n '2,/^set -euo/p' "${DTS_DIR}/dts_setup.sh" | sed '$d;s/^# \{0,1\}//'; exit 0 ;;
      *) die "Unknown option: $1 (see --help)" ;;
    esac
    shift
  done
}

dts_in_only() {   # is $1 selected by --only (or is --only unset)?
  [[ -z "$DTS_ONLY" ]] && return 0
  local IFS=','; local x; for x in $DTS_ONLY; do [[ "${x# }" == "$1" ]] && return 0; done; return 1
}

# ================================================================ Enumeration
# dts_module_doctypes <Module>… — parent DocTypes of those modules that have
# rows in the source and are not templates (dts_templates.sh owns those), minus
# anything in the DTS_EXCLUDE array. Non-submittable first, then submittable.
dts_module_doctypes() {
  local in; in="$(printf "'%s'," "$@")"; in="${in%,}"
  local n x skip
  while IFS= read -r n; do
    [[ "$n" =~ [[:space:]]Templates?$ ]] && continue
    skip=0; for x in "${DTS_EXCLUDE[@]:-}"; do [[ "$x" == "$n" ]] && skip=1; done
    ((skip)) && continue
    dts_table_exists "$SRC_DB" "tab$n" && dts_src_has_rows "$n" && echo "$n"
  done < <(q "SELECT name FROM \`$DST_DB\`.tabDocType WHERE module IN ($in) AND istable=0 AND issingle=0 ORDER BY is_submittable, name")
  return 0
}

dts_child_tables() {   # parent DocType → child DocTypes (target's own field list + Custom Fields)
  local p; p="$(sqlq "$1")"
  q "SELECT options FROM \`$DST_DB\`.tabDocField WHERE parent='$p' AND fieldtype IN ('Table','Table MultiSelect') AND options<>''
     UNION SELECT options FROM \`$DST_DB\`.\`tabCustom Field\` WHERE dt='$p' AND fieldtype IN ('Table','Table MultiSelect') AND options<>''"
}

dts_filter_for() {   # extra row filter for a few tables (alias s; {DST} = target db)
  case "$1" in
    "Custom Field")    echo "s.dt IN (SELECT name FROM \`{DST}\`.tabDocType)" ;;
    "Property Setter") echo "s.doc_type IN (SELECT name FROM \`{DST}\`.tabDocType)" ;;
    "Custom DocPerm")  echo "s.parent IN (SELECT name FROM \`{DST}\`.tabDocType)" ;;
    "User Permission") echo "s.allow IN (SELECT name FROM \`{DST}\`.tabDocType)" ;;
    "Print Format")    echo "(s.doc_type IS NULL OR s.doc_type='' OR s.doc_type IN (SELECT name FROM \`{DST}\`.tabDocType))" ;;
    *)                 echo "1=1" ;;
  esac
}

# ============================================================ The copy engine
# dts_copy_table <label> <table> [where] — one table, through the column map.
dts_copy_table() {
  local label="$1" tbl="$2" where="${3:-1=1}"
  where="${where//\{SRC\}/$SRC_DB}"; where="${where//\{DST\}/$DST_DB}"
  local src="\`$SRC_DB\`.\`$tbl\`" dst="\`$DST_DB\`.\`$tbl\`"

  dts_table_exists "$SRC_DB" "$tbl" || return 0     # nothing to copy — e.g. a v16-only child table
  if ! dts_table_exists "$DST_DB" "$tbl"; then
    DTS_SKIPPED+=("$label — table not in target site (app not installed?)")
    note "skip  $label — table not in target site"; return 0
  fi

  local -a src_cols dst_cols
  mapfile -t src_cols < <(dts_cols "$SRC_DB" "$tbl"); mapfile -t dst_cols < <(dts_cols "$DST_DB" "$tbl")
  local -A src_has=() explicit=() used=()
  local c line t rest d e expr
  for c in "${src_cols[@]}"; do src_has[$c]=1; done
  while IFS= read -r line; do
    [[ -z "$line" || "$line" == \#* ]] && continue
    t="${line%% :: *}"; rest="${line#* :: }"; d="${rest%% :: *}"; e="${rest#* :: }"
    [[ "$t" == "$label" ]] && explicit[$d]="${e//\{SRC\}/$SRC_DB}"
  done <<<"$DTS_COLUMN_MAP"

  local -a ins=() sel=() upd=()
  for c in "${dst_cols[@]}"; do
    if [[ -n "${explicit[$c]+x}" ]]; then expr="${explicit[$c]}"
    elif [[ -n "${src_has[$c]+x}" ]]; then expr="s.\`$c\`"; used[$c]=1
    else continue; fi
    ins+=("\`$c\`"); sel+=("$expr")
    [[ "$c" == name || "$c" == creation || "$c" == owner ]] || upd+=("\`$c\`=VALUES(\`$c\`)")
  done
  ((${#ins[@]})) || { DTS_SKIPPED+=("$label — no common columns"); return 0; }
  for c in "${src_cols[@]}"; do for expr in "${explicit[@]:-}"; do
    [[ -n "$expr" && ( "$expr" == *"s.\`$c\`"* || "$expr" == *"s.$c "* ) ]] && used[$c]=1
  done; done

  local n_src n_before n_new="?"
  n_src="$(q "SELECT COUNT(*) FROM $src s WHERE $where")"
  ((n_src)) || return 0
  n_before="$(q "SELECT COUNT(*) FROM $dst")"
  if [[ -n "${src_has[name]+x}" ]] && printf '%s\n' "${dst_cols[@]}" | grep -qx name; then
    n_new="$(q "SELECT COUNT(*) FROM $src s WHERE $where AND NOT EXISTS (SELECT 1 FROM $dst d WHERE d.\`name\`=s.\`name\`)")"
  fi

  # Source columns that have no home in the target: report the ones holding data.
  local dropped=""
  if ((DTS_CHECK_DROPPED)); then
    local -a dc=() ds=() counts=(); local i
    for c in "${src_cols[@]}"; do
      [[ -n "${used[$c]+x}" || "$c" == parent || "$c" == parentfield || "$c" == parenttype ]] && continue
      dc+=("$c"); ds+=("SUM(s.\`$c\` IS NOT NULL AND CAST(s.\`$c\` AS CHAR) NOT IN ('','0','0.0','0.00','0.000000000'))")
    done
    if ((${#dc[@]})); then
      IFS=$'\t' read -ra counts <<<"$(q "SELECT $(IFS=,; echo "${ds[*]}") FROM $src s WHERE $where")"
      for i in "${!dc[@]}"; do
        [[ "${counts[$i]:-0}" =~ ^[0-9]+$ ]] && ((counts[i] > 0)) && { dropped+=" ${dc[$i]}=${counts[$i]}"; DTS_DROPPED+=("$label.${dc[$i]}=${counts[$i]}"); }
      done
    fi
  fi

  DTS_TABLES=$((DTS_TABLES+1))
  local mode="dry-run"
  if ((DTS_EXECUTE)); then
    mode="copied"
    local verb="INSERT IGNORE" tail=""
    if ((DTS_UPDATE && ${#upd[@]})); then verb="INSERT"; tail=" ON DUPLICATE KEY UPDATE $(IFS=,; echo "${upd[*]}")"; fi
    local res
    if ! res="$(q "SET SESSION foreign_key_checks=0, unique_checks=0, sql_mode='NO_ENGINE_SUBSTITUTION'; $verb INTO $dst ($(IFS=,; echo "${ins[*]}")) SELECT $(IFS=,; echo "${sel[*]}") FROM $src s WHERE $where$tail; SELECT ROW_COUNT(), @@warning_count;" 2>&1)"; then
      warn "$label FAILED: $res"; DTS_FAILED+=("$label"); return 0
    fi
    local aff warns; aff="$(cut -f1 <<<"$res")"; warns="$(cut -f2 <<<"$res")"
    [[ "$aff" =~ ^[0-9]+$ ]] && DTS_NEW_ROWS=$((DTS_NEW_ROWS+aff))
    printf '    %-9s %-44s src=%-8s new=%-8s target %s→%s%s\n' "$mode" "$label" "$n_src" "$n_new" "$n_before" "$(q "SELECT COUNT(*) FROM $dst")" "$([[ "${warns:-0}" != 0 ]] && echo "  (${warns} warnings — duplicate keys skipped / values adjusted)")"
  else
    printf '    %-9s %-44s src=%-8s new=%-8s target now %s\n' "$mode" "$label" "$n_src" "$n_new" "$n_before"
  fi
  [[ -n "$dropped" ]] && note "    ↳ source columns with data, not in target:$dropped"
  return 0
}

# dts_copy_doctype <DocType> — the parent table, then each child table
# restricted to this parent's rows (parenttype), so shared child tables like
# "Sales Taxes and Charges" are split correctly between documents/templates.
dts_copy_doctype() {
  local dt="$1" child
  dts_in_only "$dt" || return 0
  dts_copy_table "$dt" "tab$dt" "$(dts_filter_for "$dt")"
  while IFS= read -r child; do
    [[ -n "$child" ]] && dts_copy_table "$child" "tab$child" "s.parenttype='$(sqlq "$dt")'"
  done < <(dts_child_tables "$dt")
  if [[ "$(q "SELECT is_tree FROM \`$DST_DB\`.tabDocType WHERE name='$(sqlq "$dt")'")" == 1 ]]; then
    DTS_TREES+=("$dt")
  fi
}

dts_copy_list() {   # read DocType names on stdin
  local dt; while IFS= read -r dt; do [[ -n "$dt" ]] && dts_copy_doctype "$dt"; done
}

# dts_copy_single <DocType> — Single doctypes live in tabSingles as
# (doctype, field, value) rows; only fields that still exist in the target's
# DocType (or its Custom Fields) are carried over.
dts_copy_single() {
  local dt="$1" p; p="$(sqlq "$1")"
  dts_in_only "$dt" || return 0
  local meta="'creation','docstatus','idx','modified','modified_by','name','owner','parent','parentfield','parenttype'"
  local valid="s.field IN (SELECT fieldname FROM \`$DST_DB\`.tabDocField WHERE parent='$p' UNION SELECT fieldname FROM \`$DST_DB\`.\`tabCustom Field\` WHERE dt='$p')"
  local n_src n_ok lost
  n_src="$(q "SELECT COUNT(*) FROM \`$SRC_DB\`.tabSingles s WHERE s.doctype='$p' AND s.field NOT IN ($meta)")"
  ((n_src)) || return 0
  n_ok="$(q "SELECT COUNT(*) FROM \`$SRC_DB\`.tabSingles s WHERE s.doctype='$p' AND $valid")"
  # settings that hold a value but have no field in the target (metadata rows don't count)
  lost="$(q "SELECT GROUP_CONCAT(s.field) FROM \`$SRC_DB\`.tabSingles s WHERE s.doctype='$p' AND s.field NOT IN ($meta) AND NOT ($valid) AND s.value IS NOT NULL AND s.value NOT IN ('','0')")"
  DTS_TABLES=$((DTS_TABLES+1))
  if ((DTS_EXECUTE)); then
    if ! q "START TRANSACTION;
            DELETE FROM \`$DST_DB\`.tabSingles WHERE doctype='$p' AND field IN (SELECT s.field FROM \`$SRC_DB\`.tabSingles s WHERE s.doctype='$p' AND $valid);
            INSERT INTO \`$DST_DB\`.tabSingles (doctype, field, value) SELECT s.doctype, s.field, s.value FROM \`$SRC_DB\`.tabSingles s WHERE s.doctype='$p' AND $valid;
            COMMIT;" >/dev/null; then warn "$dt (single) FAILED"; DTS_FAILED+=("$dt (single)"); return 0; fi
  fi
  printf '    %-9s %-44s fields=%s of %s%s\n' "$( ((DTS_EXECUTE)) && echo copied || echo dry-run)" "$dt (single)" "$n_ok" "$n_src" "$([[ -n "$lost" && "$lost" != NULL ]] && echo "   ↳ not in target, had a value: $lost")"
  if [[ -n "$lost" && "$lost" != NULL ]]; then local f; for f in ${lost//,/ }; do DTS_DROPPED+=("$dt (single).$f"); done; fi
  return 0
}

# ======================================================= Preflight and finish
dts_preflight() {
  command -v mariadb >/dev/null || die "mariadb client not found."
  if [[ -z "${DB_PASSWORD:-}" ]]; then
    DB_PASSWORD="${MYSQL_PWD:-}"
    if [[ -z "$DB_PASSWORD" ]]; then
      [[ -t 0 ]] || die "Set DB_PASSWORD (the MariaDB password for '${DB_USER}') — no terminal to prompt on."
      read -rsp "MariaDB password for ${DB_USER}: " DB_PASSWORD; echo
    fi
  fi
  export DB_PASSWORD
  q "SELECT 1" >/dev/null 2>&1 || die "Cannot log into MariaDB as '${DB_USER}' — check DB_USER / DB_PASSWORD / DB_HOST."
  [[ "$SRC_DB" != "$DST_DB" ]] || die "Source and target are the same database (${SRC_DB})."
  local db; for db in "$SRC_DB" "$DST_DB"; do
    [[ -n "$(q "SHOW DATABASES LIKE '$db'")" ]] || die "Database '${db}' does not exist."
  done
  local site_db; site_db="$(grep -o '"db_name": *"[^"]*"' "${BENCH_DIR}/sites/${SITE_NAME}/site_config.json" 2>/dev/null | cut -d'"' -f4 || true)"
  [[ -z "$site_db" || "$site_db" == "$DST_DB" ]] || warn "Target ${DST_DB} is NOT site '${SITE_NAME}' (its database is ${site_db}) — fine for a scratch test, wrong for the real run."
}

dts_confirm_and_backup() {
  ((DTS_EXECUTE)) || return 0
  if [[ "$(dts_site_db)" == "$DST_DB" && -z "${DTS_SKIP_BENCH_CHECK:-}" ]]; then
    # bench connects over TCP (see common_site_config.json); `bench migrate` and the
    # tree rebuild after the copy both need it, and the site can't serve without it.
    local h="${DB_HOST:-127.0.0.1}"
    timeout 3 bash -c "exec 3<>/dev/tcp/${h}/${DB_PORT:-3306}" 2>/dev/null \
      || die "MariaDB is not accepting TCP connections on ${h}:${DB_PORT:-3306}, so bench (and the site) can't reach it. If it is still in the --skip-networking recovery restart, finish that first (unset MYSQLD_OPTS + restart mariadb). Override: DTS_SKIP_BENCH_CHECK=1"
  fi
  [[ -n "${DTS_CONFIRMED:-}" ]] || {
    pgrep -f 'frappe.*(serve|worker|schedule)|gunicorn' >/dev/null 2>&1 && \
      warn "Bench processes look active. Stop them (or enable maintenance mode) so nothing writes to ${DST_DB} during the copy."
    if ((!DTS_YES)); then
      echo "About to WRITE ${SRC_DB} → ${DST_DB} (site ${SITE_NAME}), on-conflict: $( ((DTS_UPDATE)) && echo overwrite || echo keep-existing )."
      read -rp "Type 'yes' to continue: " ans; [[ "$ans" == yes ]] || die "Aborted."
    fi
    export DTS_CONFIRMED=1
  }
  if ((!DTS_SKIP_BACKUP)) && [[ -z "${DTS_BACKED_UP:-}" ]]; then
    mkdir -p "$DTS_BACKUP_DIR"; chmod 700 "$DTS_BACKUP_DIR"
    local f="${DTS_BACKUP_DIR}/${DST_DB}-before-dts-$(date +%Y%m%d-%H%M%S).sql.gz"
    log "Backing up ${DST_DB} → ${f}"
    MYSQL_PWD="$DB_PASSWORD" mariadb-dump -u "$DB_USER" ${DB_HOST:+-h "$DB_HOST" -P "${DB_PORT:-3306}"} \
      --single-transaction --default-character-set=utf8mb4 "$DST_DB" | gzip > "$f" || die "Backup failed — nothing was written."
    echo "    restore with: gunzip -c '$f' | mariadb -u $DB_USER -p $DST_DB"
    export DTS_BACKED_UP=1
  fi
}

dts_site_db() { grep -o '"db_name": *"[^"]*"' "${BENCH_DIR}/sites/${SITE_NAME}/site_config.json" 2>/dev/null | cut -d'"' -f4 || true; }

dts_bench() {   # run a bench command for the site — only if the site IS the target
  if [[ "$(dts_site_db)" != "$DST_DB" ]]; then
    warn "not running 'bench $*': site '${SITE_NAME}' uses database '$(dts_site_db)', but the target is '${DST_DB}'."
    return 1
  fi
  local bench; bench="$(command -v bench || echo "${HOME}/.local/bin/bench")"
  [[ -x "$bench" ]] || { warn "bench not found — run manually: bench --site ${SITE_NAME} $*"; return 1; }
  (cd "$BENCH_DIR" && "$bench" --site "$SITE_NAME" "$@")
}

# Custom Fields copied from hik that point at a DocType this site doesn't have (they belong to the
# lucrum_* apps: Outward Gate Pass, Employee Detail, …) make every form of the parent DocType fail
# with "DocType X not found". Link fields are turned into plain Data fields so the values stay
# visible; Table fields are removed (their child tables aren't transferred either).
dts_fix_dangling_custom_fields() {
  local links tables
  links="$(q "SELECT COUNT(*) FROM \`$DST_DB\`.\`tabCustom Field\` cf WHERE cf.fieldtype='Link' AND cf.options<>'' AND cf.options NOT IN (SELECT name FROM \`$DST_DB\`.tabDocType) AND cf.name IN (SELECT name FROM \`$SRC_DB\`.\`tabCustom Field\`)")"
  tables="$(q "SELECT COUNT(*) FROM \`$DST_DB\`.\`tabCustom Field\` cf WHERE cf.fieldtype IN ('Table','Table MultiSelect') AND cf.options<>'' AND cf.options NOT IN (SELECT name FROM \`$DST_DB\`.tabDocType) AND cf.name IN (SELECT name FROM \`$SRC_DB\`.\`tabCustom Field\`)")"
  if ((DTS_EXECUTE)); then
    q "START TRANSACTION;
       UPDATE \`$DST_DB\`.\`tabCustom Field\` cf SET cf.fieldtype='Data', cf.options='' WHERE cf.fieldtype='Link' AND cf.options<>'' AND cf.options NOT IN (SELECT name FROM \`$DST_DB\`.tabDocType) AND cf.name IN (SELECT name FROM \`$SRC_DB\`.\`tabCustom Field\`);
       DELETE FROM \`$DST_DB\`.\`tabCustom Field\` WHERE fieldtype IN ('Table','Table MultiSelect') AND options<>'' AND options NOT IN (SELECT name FROM \`$DST_DB\`.tabDocType) AND name IN (SELECT name FROM \`$SRC_DB\`.\`tabCustom Field\`);
       COMMIT;" >/dev/null || { warn "dangling Custom Field cleanup FAILED"; DTS_FAILED+=("dangling custom fields"); return 0; }
  fi
  note "$( ((DTS_EXECUTE)) && echo fixed || echo 'would fix') Custom Fields pointing at missing DocTypes: ${links} Link → Data, ${tables} Table removed"
}

dts_sync_custom_columns() {   # create the DB columns for every Custom Field (what migrate does, minus the hooks)
  if [[ "$(dts_site_db)" != "$DST_DB" ]]; then warn "not syncing columns: site '${SITE_NAME}' does not use ${DST_DB}."; return 1; fi
  [[ -x "${BENCH_DIR}/env/bin/python" ]] || { warn "no ${BENCH_DIR}/env/bin/python"; return 1; }
  (cd "${BENCH_DIR}/sites" && "${BENCH_DIR}/env/bin/python" - "$SITE_NAME" <<'PY'
import sys, frappe
frappe.init(site=sys.argv[1], sites_path=".")
frappe.connect()
ok = bad = 0
for dt in frappe.db.sql_list("select distinct dt from `tabCustom Field`"):
    if not frappe.db.exists("DocType", dt):
        continue
    try:
        frappe.clear_cache(doctype=dt)
        frappe.db.updatedb(dt)
        ok += 1
    except Exception as e:
        bad += 1
        print(f"    FAILED {dt}: {e}")
frappe.db.commit()
print(f"    synced columns for {ok} DocTypes, {bad} failed")
sys.exit(1 if bad else 0)
PY
  )
}

dts_finish() {   # rebuild nested-set trees, print the summary
  if ((DTS_EXECUTE)) && ((${#DTS_TREES[@]})); then
    log "Rebuilding tree structure (lft/rgt copied from ${SRC_DB} would clash with the target's own nodes)"
    local dt seen=" "
    for dt in "${DTS_TREES[@]}"; do
      [[ "$seen" == *" $dt "* ]] && continue; seen+="$dt "
      dts_bench execute frappe.utils.nestedset.rebuild_tree --args "[\"$dt\"]" >/dev/null 2>&1 \
        && note "rebuilt $dt" || warn "rebuild failed for '$dt' — run: bench --site ${SITE_NAME} execute frappe.utils.nestedset.rebuild_tree --args '[\"$dt\"]'"
    done
  elif ((${#DTS_TREES[@]})) && ((!DTS_EXECUTE)); then
    note "(tree DocTypes that would be rebuilt after a real run: $(printf '%s\n' "${DTS_TREES[@]}" | sort -u | paste -sd, -))"
  fi
  log "Summary — $( ((DTS_EXECUTE)) && echo EXECUTED || echo 'DRY-RUN (nothing was written)' )"
  echo "    tables processed: ${DTS_TABLES}   rows inserted: ${DTS_NEW_ROWS}"
  local x
  if ((${#DTS_SKIPPED[@]})); then echo "    skipped (${#DTS_SKIPPED[@]}):"; for x in "${DTS_SKIPPED[@]}"; do echo "      - $x"; done; fi
  if ((${#DTS_DROPPED[@]})); then echo "    source columns with data that have no target column (${#DTS_DROPPED[@]}) — review:"; printf '      - %s\n' "${DTS_DROPPED[@]}"; fi
  if ((${#DTS_FAILED[@]})); then echo "    FAILED (${#DTS_FAILED[@]}):"; printf '      - %s\n' "${DTS_FAILED[@]}"; return 1; fi
  return 0
}

# dts_main <name> "$@" — every dts_<name>.sh ends by calling this. It expects
# dts_<name>_doctypes (prints DocType names) and dts_<name>_run to exist.
dts_main() {
  local name="$1"; shift
  dts_parse_args "$@"
  dts_preflight
  if ((DTS_LIST)); then "dts_${name}_doctypes"; return 0; fi
  mkdir -p "$DTS_LOG_DIR"
  local logf="${DTS_LOG_DIR}/dts_${name}-$(date +%Y%m%d-%H%M%S).log"
  exec > >(tee -a "$logf") 2>&1
  log "dts_${name}: ${SRC_DB} → ${DST_DB}   mode: $( ((DTS_EXECUTE)) && echo EXECUTE || echo dry-run )   (log: ${logf})"
  dts_confirm_and_backup
  "dts_${name}_run"
  dts_finish
}


# --------------------------------------------- shared by the module scripts (mfg, assets, projects, issues)
# dts_owned_tables_sql <DocType>… — the DocTypes plus their child tables, as one quoted, de-duplicated SQL list.
dts_owned_tables_sql() {
  local d c out=""
  for d in "$@"; do
    out+="'$(sqlq "$d")',"
    while IFS= read -r c; do [[ -n "$c" ]] && out+="'$(sqlq "$c")',"; done < <(dts_child_tables "$d")
  done
  echo "${out%,}" | tr ',' '\n' | awk '!seen[$0]++' | paste -sd, -
}

# dts_translate <plan|apply> "<quoted DocType list>" — turns "HIK"/"HIK Unit02" into the target company and
# "X - HIK" / "X - HU" into the names dts_rebrand.sh produced, in the Link columns of THOSE DocTypes' tables only.
read -r -d '' DTS_TRANSLATE_PY <<'PY' || true
import os, sys, re, collections
import MySQLdb, MySQLdb.cursors

mode = sys.argv[1]                    # plan | apply
SRC, DST, NEW = os.environ["SRC_DB"], os.environ["DST_DB"], os.environ["REBRAND_COMPANY"]
kw = dict(user=os.environ["DB_USER"], passwd=os.environ["DB_PASSWORD"], charset="utf8mb4", cursorclass=MySQLdb.cursors.DictCursor)
if os.environ.get("DB_HOST"):
    kw.update(host=os.environ["DB_HOST"], port=int(os.environ.get("DB_PORT") or 3306))
conn = MySQLdb.connect(db=DST, **kw); cur = conn.cursor()
def q(sql, a=()):
    cur.execute(sql, a); return list(cur.fetchall())
def x(sql, a=()):
    cur.execute(sql, a); return cur.rowcount
say = lambda *a: print(*a, flush=True)
x("SET SESSION sql_mode='NO_ENGINE_SUBSTITUTION', foreign_key_checks=0, unique_checks=0, innodb_lock_wait_timeout=900")

TABLES = [t.strip("'") for t in os.environ["TRANSLATE_TABLES"].split(",")]        # DocTypes this script owns
tables = {r["t"] for r in q("select table_name t from information_schema.tables where table_schema=%s", (DST,))}
DT = {r["name"]: r for r in q("select name, issingle from tabDocType")}
_c = {}
def cols(t):
    if t not in _c: _c[t] = {r["Field"] for r in q(f"show columns from `{t}`")}
    return _c[t]

# ---- who is who ------------------------------------------------------------
olds = {r["name"]: r["abbr"] for r in q(f"select name, abbr from `{SRC}`.tabCompany")}
new_abbr = q("select abbr from tabCompany where name=%s", (NEW,))[0]["abbr"]
ordered = sorted(olds)                                      # HIK first, then HIK Unit02
common = os.path.commonprefix(ordered)
tag = lambda co: co[len(common):].strip() or co

# ---- name translation: old "X - HIK" / "X - HU" → the name the rebrand produced on this site -------
NAME_DOCTYPES = ["Account", "Cost Center", "Warehouse", "Department"]
maps, unresolved = {}, collections.defaultdict(list)
for D in NAME_DOCTYPES:
    exist = {r["name"] for r in q(f"select name from `tab{D}`")}
    m = {}
    for r in q(f"select name from `{SRC}`.`tab{D}`"):
        for co, ab in olds.items():
            suf = f" - {ab}"
            if r["name"].endswith(suf):
                base = r["name"][:-len(suf)]
                cands = [f"{base} - {new_abbr}"]
                if co != ordered[0]:
                    cands.insert(0, f"{base} {tag(co)} - {new_abbr}")     # a clashing Unit02 name kept its tag
                pick = next((c for c in cands if c in exist), None)
                if pick: m[r["name"]] = pick
                else: unresolved[D].append(r["name"])
    maps[D] = m
    say(f"  {D:12} translated names: {len(m):5}   without a counterpart here: {len(unresolved[D])}")
    for n in unresolved[D][:3]: say(f"      ! {n}")
maps["Company"] = {o: NEW for o in olds}

def link_columns(doctype):
    out = set()
    for r in q("select parent p, fieldname f from tabDocField where fieldtype='Link' and options=%s", (doctype,)): out.add((r["p"], r["f"]))
    for r in q("select dt p, fieldname f from `tabCustom Field` where fieldtype='Link' and options=%s", (doctype,)): out.add((r["p"], r["f"]))
    return [(p, f) for p, f in sorted(out) if p in TABLES and DT.get(p) and not DT[p]["issingle"] and ("tab" + p) in tables and f in cols("tab" + p)]

plan = {D: link_columns(D) for D in maps}
say("  link columns to translate in these tables:", ", ".join(f"{D}={len(v)}" for D, v in plan.items()))
if mode == "plan":
    sys.exit(0)

tmp = {}
for i, (D, m) in enumerate(maps.items()):
    tn = f"dts_mfg_rn_{i}"; tmp[D] = tn
    x(f"drop table if exists `{tn}`")
    x(f"create table `{tn}` (old varchar(255) collate utf8mb4_unicode_ci primary key, new varchar(255) collate utf8mb4_unicode_ci) engine=InnoDB")
    for o, n in m.items(): x(f"insert into `{tn}` values (%s,%s)", (o, n))
    conn.commit()
for D, tn in tmp.items():
    n = 0
    for parent, field in plan[D]:
        n += x(f"update `tab{parent}` t join `{tn}` m on t.`{field}` = m.old set t.`{field}` = m.new")
        conn.commit()
    say(f"    {D:12} {n:>8} values translated")
for tn in tmp.values(): x(f"drop table `{tn}`")
conn.commit()
# verification: nothing in these tables may still point at an old name
left = 0
for D, m in maps.items():
    for parent, field in plan[D]:
        ph = ",".join(["%s"] * len(m)) or "''"
        if m: left += q(f"select count(*) c from `tab{parent}` where `{field}` in ({ph})", list(m))[0]["c"]
say(f"  references still pointing at an old HIK name: {left}")
sys.exit(1 if left else 0)
PY

dts_translate() {
  (cd "${BENCH_DIR}/sites" && SRC_DB="$SRC_DB" DST_DB="$DST_DB" DB_USER="$DB_USER" DB_PASSWORD="$DB_PASSWORD" DB_HOST="${DB_HOST:-}" DB_PORT="${DB_PORT:-}" \
     REBRAND_COMPANY="${REBRAND_COMPANY:-MicroMax Erp Pvt Ltd.}" TRANSLATE_TABLES="$2" \
     "${BENCH_DIR}/env/bin/python" - "$1" <<<"$DTS_TRANSLATE_PY")
}

# dts_apply_dates "<A,B,C>" — the dts_rebrand.sh date rule (year := month >= 7 ? 2026 : 2027) for just those DocTypes
# and their child rows.
dts_apply_dates() {
  REBRAND_PARTS=dates REBRAND_DOCTYPES="$1" DTS_CONFIRMED=1 DTS_BACKED_UP=1 \
    bash "${DTS_DIR}/dts_rebrand.sh" --execute --yes --skip-backup
}

fi   # DTS_LIB_LOADED

# ==================================================================== setup
# Foundation: everything the other scripts' rows point at or depend on.
DTS_EXCLUDE=()
DTS_SETUP_CUSTOMIZATIONS=("Custom Field" "Property Setter")
DTS_SETUP_FOUNDATION=(
  "Country" "Currency"
  "Role" "Role Profile" "User" "User Permission" "Custom Role" "Custom DocPerm"
  "Workflow State" "Workflow Action Master" "Workflow"
  "Company"
)

dts_setup_doctypes() { printf '%s\n' "${DTS_SETUP_CUSTOMIZATIONS[@]}" "${DTS_SETUP_FOUNDATION[@]}"; }

dts_setup_run() {
  # 1. Customizations first: hik carries ~500 Custom Fields (Employee alone has
  #    57) whose columns don't exist in the target. The rows are copied for
  #    DocTypes the target has; `bench migrate` then adds the columns, so the
  #    data scripts that follow can fill them through the column mapping.
  log "Custom Fields / Property Setters (for DocTypes that exist in the target)"
  dts_copy_list < <(printf '%s\n' "${DTS_SETUP_CUSTOMIZATIONS[@]}")
  dts_fix_dangling_custom_fields
  if ((DTS_EXECUTE)); then
    # Must come BEFORE migrate: migrate's own pre-schema hooks insert documents, and any
    # DocType whose Custom Field has no column yet (e.g. Deleted Document) fails that insert.
    log "Creating the DB columns for the copied Custom Fields"
    dts_sync_custom_columns || { warn "column sync failed — see above."; DTS_FAILED+=("custom field columns"); }
  fi
  if ((DTS_EXECUTE)) && ((DTS_MIGRATE)); then
    log "bench migrate — syncs schema and hooks"
    dts_bench migrate || { warn "migrate failed — fix it and re-run before the other dts scripts (their data for custom columns is dropped otherwise)."; DTS_FAILED+=("bench migrate"); }
  elif ((DTS_EXECUTE)); then
    warn "--no-migrate: run 'bench --site ${SITE_NAME} migrate' yourself BEFORE the other dts scripts."
  else
    note "(a real run then executes: bench --site ${SITE_NAME} migrate)"
  fi

  # 2. Users, roles, permissions, workflows, Company.
  log "Users, roles, permissions, workflows, Company"
  dts_copy_list < <(printf '%s\n' "${DTS_SETUP_FOUNDATION[@]}")

  # 3. Login passwords for the users that were just added. Only 'password'
  #    hashes travel: every other __Auth value is encrypted with the site's own
  #    encryption_key, which differs, so it would be unreadable there.
  log "Password hashes for newly copied users (existing users' passwords are untouched)"
  dts_copy_table "User password hashes" "__Auth" "s.doctype='User' AND s.fieldname='password' AND s.encrypted=0"
}

# ============================================================ report / all / cli
DTS_SCRIPTS=(doctypes setup master templates setting accounts buying selling hrms mfg assets projects issues)

dts_report() {
  local n; declare -A owner=()
  for n in "${DTS_SCRIPTS[@]}"; do
    [[ "$n" == setup ]] || source "${DTS_DIR}/dts_${n}.sh"
  done
  local dt
  for n in "${DTS_SCRIPTS[@]}"; do
    while IFS= read -r dt; do owner["$dt"]+="$n "; done < <("dts_${n}_doctypes")
  done
  echo; echo "Coverage of ${SRC_DB} (parent DocTypes with data that exist in the target):"
  local -a rows=()
  while IFS=$'\t' read -r dt r; do
    [[ -n "${owner[$dt]:-}" ]] || rows+=("$r"$'\t'"$dt")
  done < <(q "SELECT d.name, t.table_rows FROM \`$DST_DB\`.tabDocType d JOIN information_schema.tables t ON t.table_schema='$SRC_DB' AND t.table_name=CONCAT('tab', d.name) WHERE d.istable=0 AND d.issingle=0 AND t.table_rows>0")
  echo "  covered by a script: $(printf '%s\n' "${!owner[@]}" | wc -l) DocTypes"
  echo "  duplicates (claimed by 2+ scripts, harmless but check): $(for dt in "${!owner[@]}"; do [[ "${owner[$dt]}" == *" "*" "* ]] && echo -n "$dt[${owner[$dt]% }] "; done)"
  echo "  NOT covered, by row count (estimates):"
  printf '%s\n' "${rows[@]}" | sort -rn | awk -F'\t' '{printf "      %10s  %s\n", $1, $2}' | head -60
  echo; echo "Tables with data in ${SRC_DB} that the target site does not have at all (custom apps):"
  q "SELECT t.table_name, t.table_rows FROM information_schema.tables t WHERE t.table_schema='$SRC_DB' AND t.table_rows>0 AND t.table_name LIKE 'tab%' AND NOT EXISTS (SELECT 1 FROM information_schema.tables x WHERE x.table_schema='$DST_DB' AND x.table_name=t.table_name) ORDER BY t.table_rows DESC" \
    | awk -F'\t' '{printf "      %10s  %s\n", $2, $1}' | head -40
}

dts_setup_cli() {
  local cmd="run"
  case "${1:-}" in check|report|all|run) cmd="$1"; shift ;; esac
  case "$cmd" in
    check)  dts_parse_args "$@"; dts_preflight
            log "OK — ${DB_USER} can log in; source=${SRC_DB} target=${DST_DB} site=${SITE_NAME} bench=${BENCH_DIR}"
            note "source tables: $(q "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$SRC_DB'")   target tables: $(q "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$DST_DB'")" ;;
    report) dts_parse_args "$@"; dts_preflight; dts_report ;;
    all)    dts_parse_args "$@"; dts_preflight; dts_confirm_and_backup
            local n rc=0
            for n in "${DTS_SCRIPTS[@]}"; do
              log "════════ dts_${n}.sh ════════"
              if ! DTS_CONFIRMED=1 DTS_BACKED_UP=1 bash "${DTS_DIR}/dts_${n}.sh" "$@"; then
                rc=1
                [[ "$n" == doctypes || "$n" == setup ]] && die "dts_${n}.sh failed — stopping: the later scripts depend on its DocTypes/Custom Fields/columns. Fix it and re-run."
                warn "dts_${n}.sh reported problems — continuing (see its summary above)"
              fi
            done
            exit "$rc" ;;
    run)    dts_main setup "$@" ;;
  esac
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then dts_setup_cli "$@"; fi
