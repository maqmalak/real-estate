#!/usr/bin/env bash
#
# dts_doctypes.sh — creates the DocTypes that hik has but this site doesn't
# (they belong to the lucrum_* apps: Gate Pass, Lucrum Payroll, Lucrum Textile
# Changes, Lucrum General), then transfers their data.
#
# Why: hik's Custom Fields link to them (Sales Invoice → Outward Gate Pass,
# Employee → Employee Detail, Item → Style No, …). Without the DocType every
# form of the parent fails with "DocType X not found".
#
# What it does, in order:
#   1. Finds the set: every DocType referenced by a hik Custom Field/DocField
#      (Link, Table, Table MultiSelect) that this site lacks, plus everything
#      those reference in turn (currently 59 DocTypes).
#   2. Creates each one from hik's definition (fields, permissions, links,
#      actions, states) as a CUSTOM DocType (custom=1, module "Custom"), so no
#      app or controller code is needed. Same-named columns are kept; columns
#      that don't exist in v16 are dropped.
#   3. Restores the Custom Fields that dts_setup.sh had to degrade (Link → Data,
#      Table → removed) now that their target DocTypes exist, creates their
#      columns, clears the cache.
#   4. Copies the data: the new parent-level DocTypes (with their child tables),
#      and the new child tables that hang off EXISTING DocTypes (Employee Detail
#      under Employee, Shift Type Policy under Shift Type, …) — but only for
#      parents that were themselves transferred. Rows under Work Order /
#      Production Plan / Downtime Entry are skipped: Manufacturing isn't part of
#      the transfer, so those child rows would be orphans.
#
# What is NOT recreated: the apps' Python controllers and client scripts
# (validations, auto-calculations, gate-pass → stock hooks). The DocTypes hold
# the same fields, naming and permissions, but none of that behaviour.
#
# Safe to re-run: existing DocTypes are skipped, data uses INSERT IGNORE.
# Run via:  bash dts_doctypes.sh [--execute] [--yes]
# Shared flags and environment are documented in dts_setup.sh.

set -euo pipefail
[[ -n "${DTS_LIB_LOADED:-}" ]] || source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/dts_setup.sh"

read -r -d '' DTS_DOCTYPES_PY <<'PY' || true
import os, sys
import MySQLdb, MySQLdb.cursors

mode, site = sys.argv[1], sys.argv[2]
SRC, DST = os.environ["SRC_DB"], os.environ["DST_DB"]
kw = dict(user=os.environ["DB_USER"], passwd=os.environ["DB_PASSWORD"], charset="utf8mb4",
          cursorclass=MySQLdb.cursors.DictCursor)
if os.environ.get("DB_HOST"):
    kw.update(host=os.environ["DB_HOST"], port=int(os.environ.get("DB_PORT") or 3306))
conn = MySQLdb.connect(**kw)

def q(sql, args=()):
    c = conn.cursor(); c.execute(sql, args); return c.fetchall()

dst_all = {r["name"] for r in q(f"select name from `{DST}`.tabDocType")}
dst_std = {r["name"] for r in q(f"select name from `{DST}`.tabDocType where custom=0")}   # what the apps ship
src_dt = {r["name"]: r for r in q(f"select * from `{SRC}`.tabDocType")}
LINKS = "fieldtype in ('Link','Table','Table MultiSelect') and options is not null and options<>''"

def refs(dt):
    out = set()
    for tbl, col in (("tabDocField", "parent"), ("tabCustom Field", "dt")):
        for r in q(f"select options from `{SRC}`.`{tbl}` where `{col}`=%s and {LINKS}", (dt,)):
            out.add(r["options"])
    return out

# The set = DocTypes hik's Custom Fields point at that the apps here don't ship, closed under
# "what do those point at". Relative to the *shipped* DocTypes (custom=0), so the set stays the
# same once some of them have been created.
seeds = {r["options"] for r in q(f"select dt, options from `{SRC}`.`tabCustom Field` where {LINKS}")
         if r["dt"] in dst_std and r["options"] not in dst_std and r["options"] in src_dt}
need, todo = set(), sorted(seeds)
while todo:
    x = todo.pop()
    if x in need or x not in src_dt:
        continue
    need.add(x)
    todo += [o for o in refs(x) if o not in dst_std and o in src_dt and o not in need]

if mode == "list":
    print("\n".join(sorted(need)))
    sys.exit(0)

if mode == "plan":
    for n in sorted(need):
        r = src_dt[n]
        rows = "-" if r["issingle"] else q(f"select count(*) c from `{SRC}`.`tab{n}`")[0]["c"]
        print(f"    {'exists ' if n in dst_all else 'create '} {n:44} {r['module']:24} {'child' if r['istable'] else 'doc  '} rows={rows}")
    sys.exit(0)

# ---- mode == "create" -------------------------------------------------------------------------
import frappe
frappe.init(site=site, sites_path=".")
frappe.connect()
frappe.set_user("Administrator")
frappe.flags.in_patch = True        # skips the "Options must be a valid DocType" check for Link fields

CHILD = (("DocField", "fields"), ("DocPerm", "permissions"), ("DocType Link", "links"),
         ("DocType Action", "actions"), ("DocType State", "states"))
DROP = {"name", "creation", "modified", "modified_by", "owner", "docstatus", "parent", "parentfield", "parenttype"}
clean = lambda row, allowed, drop=DROP: {k: v for k, v in row.items() if k in allowed and k not in drop and v is not None}

created, failed = [], []
# child tables first: a Table field's child DocType must already exist when the parent is saved
for name in sorted(need, key=lambda n: (not src_dt[n]["istable"], n)):
    if name in dst_all:
        continue
    doc = clean(src_dt[name], set(frappe.db.get_table_columns("DocType")), DROP | {"idx"})
    doc.update(doctype="DocType", name=name, custom=1, module="Custom")
    for tbl, field in CHILD:
        try:
            rows = q(f"select * from `{SRC}`.`tab{tbl}` where parent=%s order by idx", (name,))
        except Exception:
            rows = []
        allowed = set(frappe.db.get_table_columns(tbl))
        doc[field] = [clean(r, allowed) for r in rows]
    try:
        frappe.get_doc(doc).insert(ignore_permissions=True)
        frappe.db.commit()
        created.append(name)
        print(f"    created   {name}")
    except Exception as e:
        frappe.db.rollback()
        failed.append(name)
        print(f"    FAILED    {name}: {type(e).__name__}: {str(e)[:200]}")

frappe.clear_cache()
print(f"    DocTypes created: {len(created)}, failed: {len(failed)}, already there: {len(need) - len(created) - len(failed)}")
sys.exit(1 if failed else 0)
PY

dts_doctypes_py() {   # mode → runs the embedded program with the bench's python
  [[ "$(dts_site_db)" == "$DST_DB" || "$1" != create ]] || { warn "site '${SITE_NAME}' does not use ${DST_DB} — not creating DocTypes."; return 1; }
  (cd "${BENCH_DIR}/sites" && SRC_DB="$SRC_DB" DST_DB="$DST_DB" DB_USER="$DB_USER" DB_PASSWORD="$DB_PASSWORD" \
     DB_HOST="${DB_HOST:-}" DB_PORT="${DB_PORT:-}" "${BENCH_DIR}/env/bin/python" - "$1" "$SITE_NAME" <<<"$DTS_DOCTYPES_PY")
}

dts_doctypes_doctypes() { dts_doctypes_py list; }

dts_doctypes_run() {
  log "DocTypes hik has and this site lacks (plan)"
  dts_doctypes_py plan
  if ((!DTS_EXECUTE)); then
    note "(a real run creates the DocTypes, restores their Custom Fields, then copies the data — the data plan is shown once they exist)"
    return 0
  fi

  log "Creating the DocTypes (custom, module 'Custom')"
  dts_doctypes_py create || { DTS_FAILED+=("DocType creation"); warn "some DocTypes failed — see above; the rest of this script is skipped."; return 0; }

  log "Restoring the Custom Fields that pointed at them (were downgraded to Data / removed)"
  local names in prev
  names="$(q "SELECT name FROM \`$DST_DB\`.tabDocType WHERE custom=1")"
  in="$(while IFS= read -r n; do [[ -n "$n" ]] && printf "'%s'," "$(sqlq "$n")"; done <<<"$names")"; in="${in%,}"
  prev=$DTS_UPDATE; DTS_UPDATE=1     # overwrite the degraded copies with hik's originals
  dts_copy_table "Custom Field" "tabCustom Field" "(s.options IN ($in) OR s.dt IN ($in))"
  DTS_UPDATE=$prev
  dts_copy_table "Property Setter" "tabProperty Setter" "s.doc_type IN ($in)"
  log "Creating columns for the restored fields, clearing cache"
  dts_sync_custom_columns || { warn "column sync failed"; DTS_FAILED+=("custom field columns"); }
  dts_bench clear-cache >/dev/null 2>&1 || true

  log "Data: new parent-level DocTypes (with their child tables)"
  dts_copy_list <<<"$(q "SELECT name FROM \`$DST_DB\`.tabDocType WHERE custom=1 AND istable=0 AND issingle=0 ORDER BY name")"

  log "Data: new child tables under DocTypes that already exist here (only where the parent was transferred)"
  local child parent single
  while IFS=$'\t' read -r child parent; do
    single="$(q "SELECT issingle FROM \`$DST_DB\`.tabDocType WHERE name='$(sqlq "$parent")'")"
    if [[ "$single" == 1 ]] || [[ -n "$(q "SELECT 1 FROM \`$DST_DB\`.\`tab$(sqlq "$parent")\` LIMIT 1")" ]]; then
      dts_copy_table "$child (under $parent)" "tab$child" "s.parenttype='$(sqlq "$parent")'"
    else
      note "skip  $child under $parent — $parent has no rows here (not transferred)"
      DTS_SKIPPED+=("$child under $parent — parent DocType not transferred")
    fi
  done < <(q "SELECT DISTINCT x.options, x.dt FROM (
                SELECT options, parent AS dt FROM \`$DST_DB\`.tabDocField WHERE fieldtype IN ('Table','Table MultiSelect')
                UNION SELECT options, dt FROM \`$DST_DB\`.\`tabCustom Field\` WHERE fieldtype IN ('Table','Table MultiSelect')) x
              JOIN \`$DST_DB\`.tabDocType c ON c.name=x.options AND c.custom=1 AND c.istable=1
              JOIN \`$DST_DB\`.tabDocType p ON p.name=x.dt AND p.custom=0
              ORDER BY x.dt, x.options")
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then dts_main doctypes "$@"; fi
