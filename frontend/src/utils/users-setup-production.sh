#!/usr/bin/env bash
#
# users-setup-production.sh — create (or update) management logins on a tenant's site with full access:
# every desk role on that site (System Manager, Accounts / Stock / Manufacturing / HR / Sales / CRM ...,
# plus each installed app's own roles) and no blocked modules. Portal-only roles (Customer, Supplier,
# Student, ...) are left out: they are for website users and make a staff login behave like a portal one.
#
# Idempotent: an existing user keeps its record and gets the roles added and the password reset.
# The password is set directly, so the site's password-strength policy does not reject it.
#
# Run as root, like the other production scripts:
#   sudo USER_PASSWORD='...' bash users-setup-production.sh                    # TENANT=micromax -> site demo
#   sudo TENANT=wise USER_PASSWORD='...' USERS="a@x.com b@x.com" bash users-setup-production.sh

set -euo pipefail

log()  { echo -e "\n\033[1;36m==>\033[0m $*"; }
die()  { echo -e "\033[1;31mERROR:\033[0m $*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Run this as root: sudo bash $(basename "$0")"

FRAPPE_USER="${FRAPPE_USER:-maqmalak}"
FRAPPE_HOME="/home/${FRAPPE_USER}"
BENCH_DIR="${BENCH_DIR:-${FRAPPE_HOME}/frappe-bench}"
BENCH_BIN="${BENCH_BIN:-${FRAPPE_HOME}/.local/bin/bench}"
UV_BIN_DIR="${FRAPPE_HOME}/.local/bin"

TENANT="${TENANT:-micromax}"
TENANT_FILE="$(dirname "$(readlink -f "$0")")/tenants/${TENANT}.env"
[[ -f "$TENANT_FILE" ]] || die "No tenant file ${TENANT_FILE} (TENANT=${TENANT})."
# shellcheck source=/dev/null
source "$TENANT_FILE"

USERS="${USERS:-vision@micromaxonline.uk spinning@micromaxonline.uk director@micromaxonline.uk ceo@micromaxonline.uk demo@micromaxonline.uk sales@micromaxonline.uk purchase@micromaxonline.uk hr@micromaxonline.uk payroll@micromaxonline.uk}"
USER_PASSWORD="${USER_PASSWORD:?Set USER_PASSWORD to the password for these logins.}"

[[ -d "${BENCH_DIR}/sites/${SITE_NAME}" ]] || die "Site '${SITE_NAME}' not found under ${BENCH_DIR}/sites."

PYFILE="$(mktemp "${TMPDIR:-/tmp}/users_setup.XXXXXX.py")"
trap 'rm -f "$PYFILE"' EXIT
cat > "$PYFILE" <<'PYEOF'
import os
import frappe
from frappe.utils.password import update_password

emails = os.environ["USERS_SETUP_EMAILS"].split()
password = os.environ["USERS_SETUP_PASSWORD"]

# Every desk role on this site, except the automatic ones Frappe assigns itself.
AUTOMATIC = {"Administrator", "Guest", "All", "Desk User"}
roles = [r for r in frappe.get_all("Role", filters={"disabled": 0, "desk_access": 1}, pluck="name") if r not in AUTOMATIC]
print(f"{len(roles)} desk roles on {frappe.local.site}")

for email in emails:
    email = email.strip().lower()
    if frappe.db.exists("User", email):
        user = frappe.get_doc("User", email)
        state = "updated"
    else:
        local = email.split("@")[0]
        user = frappe.new_doc("User")
        user.email = email
        user.first_name = local.replace(".", " ").replace("_", " ").title()
        user.send_welcome_email = 0
        state = "created"
    user.user_type = "System User"
    user.enabled = 1
    have = {r.role for r in user.roles}
    for role in roles:
        if role not in have:
            user.append("roles", {"role": role})
    user.set("block_modules", [])  # every module visible
    user.flags.ignore_password_policy = True
    user.save(ignore_permissions=True)
    update_password(email, password)  # direct: not subject to the password-strength policy
    frappe.db.commit()
    print(f"{state}: {email} - {len(user.roles)} roles, all modules")

print("ALL DONE")
PYEOF
chmod 644 "$PYFILE"
chown "${FRAPPE_USER}:${FRAPPE_USER}" "$PYFILE"

log "Creating / updating full-access users on site '${SITE_NAME}'"
sudo -iu "$FRAPPE_USER" env \
  "PATH=${UV_BIN_DIR}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
  "USERS_SETUP_EMAILS=${USERS}" "USERS_SETUP_PASSWORD=${USER_PASSWORD}" \
  bash -c "cd '${BENCH_DIR}' && echo \"exec(open('${PYFILE}').read(), {})\" | '${BENCH_BIN}' --site '${SITE_NAME}' console" \
  | grep -E "desk roles|created:|updated:|ALL DONE|Error|Traceback" || die "User setup failed."

log "Done."
cat <<EOF

  Site:     ${SITE_NAME} (tenant ${TENANT})
  Users:    ${USERS}
  Access:   every desk role on the site, all modules
  Password: the USER_PASSWORD you passed (users can change it in My Settings)
EOF
