#!/usr/bin/env bash
#
# dts_hrms.sh — HR and Payroll: Employee, Department, Designation, Branch,
# Holiday List, then everything in the HR and Payroll modules (shifts,
# attendance, employee check-ins, leave, expense claims, salary components,
# salary structures/assignments, salary slips, payroll entries, tax slabs, …).
#
# This is the big one (Attendance ≈ 1.0M rows, Employee Checkin ≈ 0.9M,
# Salary Detail ≈ 111K) — expect it to take a while on a real run.
#
# Column mapping: same-name columns. hik's Employee has ~30 custom columns
# (cnic, father_name, eobi, …): they only carry over if dts_setup.sh copied the
# matching Custom Field rows AND `bench migrate` created the columns. Anything
# still without a home is listed under "source columns with data, not in
# target" at the end — that list is your to-do for extra Custom Fields.
# Rows for the lucrum_payroll / lucrum_textile apps have no tables in the
# target and are skipped (and listed).
#
# Run via:  bash dts_hrms.sh [--execute] [--update] [--only "Employee,Salary Slip"]
# Shared flags and environment are documented in dts_setup.sh.

set -euo pipefail
[[ -n "${DTS_LIB_LOADED:-}" ]] || source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/dts_setup.sh"

DTS_HRMS_FIRST=("Holiday List" "Branch" "Department" "Designation" "Employee")

dts_hrms_doctypes() {
  DTS_EXCLUDE=()
  { printf '%s\n' "${DTS_HRMS_FIRST[@]}"; dts_module_doctypes HR Payroll; } | awk '!seen[$0]++'
}
dts_hrms_run() {
  dts_copy_list < <(dts_hrms_doctypes)
  # hik's Shift Types carry enable_auto_attendance=1. Left on, this site's scheduler would start generating
  # an "Absent" Attendance for every employee/day that has no check-in (14K rows on the first run), so the
  # transferred shifts are switched off. Turn it back on per shift once check-ins are flowing.
  if ((DTS_EXECUTE)); then
    q "UPDATE \`tabShift Type\` SET enable_auto_attendance = 0 WHERE enable_auto_attendance = 1" \
      && note "auto-attendance switched off on transferred Shift Types" || warn "could not disable auto-attendance on Shift Types"
  else
    note "would switch off auto-attendance on transferred Shift Types"
  fi
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then dts_main hrms "$@"; fi
