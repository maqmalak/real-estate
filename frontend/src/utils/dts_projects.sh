#!/usr/bin/env bash
#
# dts_projects.sh — Projects: Activity Type, Project Type, Project, Task (with their child tables).
#
# hik has very little here (1 Project, 2 Tasks, 5 Activity Types, 3 Project Types), and the v14 → v16 schema
# needs no renames: every column with data maps by name. hik's own custom field on Project and Task
# (github_sync_id) already exists on this site.
#
#  * Task is a tree DocType (parent_task) — its lft/rgt are rebuilt after a real run.
#  * COMPANY  "HIK" / "HIK Unit02" → "MicroMax Erp Pvt Ltd." and the "- HIK" / "- HU" cost-center, department and
#    warehouse names are translated (same rule as dts_rebrand.sh); unmatched names are reported, not guessed.
#  * DATES  Project and Task dates follow the rule used for every other transferred document
#    (year := month >= 7 ? 2026 : 2027, month and day kept). Skip with PROJECTS_KEEP_DATES=1.
#
# Existing Activity Types / Project Types with the same name are kept (INSERT IGNORE); add --update to overwrite.
# Run via:  bash dts_projects.sh [--execute] [--update] [--only "Project,Task"]
# Shared flags and environment are documented in dts_setup.sh.

set -euo pipefail
[[ -n "${DTS_LIB_LOADED:-}" ]] || source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/dts_setup.sh"

DTS_PROJECTS_DOCTYPES=("Activity Type" "Project Type" "Project" "Task")

dts_projects_doctypes() { printf '%s\n' "${DTS_PROJECTS_DOCTYPES[@]}"; }

dts_projects_run() {
  log "1/3 Activity types, project types, projects, tasks"
  dts_copy_list < <(dts_projects_doctypes)

  log "2/3 Company: HIK / HIK Unit02 → ${REBRAND_COMPANY:-MicroMax Erp Pvt Ltd.}, and the '- HIK' / '- HU' names"
  if ((DTS_EXECUTE)); then dts_translate apply "$(dts_owned_tables_sql "${DTS_PROJECTS_DOCTYPES[@]}")" || { warn "name/company translation reported problems"; DTS_FAILED+=("company/name translation"); }
  else dts_translate plan "$(dts_owned_tables_sql "${DTS_PROJECTS_DOCTYPES[@]}")" || true; note "(a real run rewrites those references in the tables above)"; fi

  log "3/3 Dates → fiscal year ${REBRAND_FY:-2026-2027} (month and day kept)"
  if [[ -n "${PROJECTS_KEEP_DATES:-}" ]]; then note "PROJECTS_KEEP_DATES set — dates left as they were in hik"
  elif ((DTS_EXECUTE)); then dts_apply_dates "Project,Task" || { warn "date rewrite reported problems"; DTS_FAILED+=("dates"); }
  else note "(a real run applies the date rule to the copied Project and Task rows)"; fi
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then dts_main projects "$@"; fi
