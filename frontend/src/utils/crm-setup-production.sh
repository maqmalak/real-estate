#!/usr/bin/env bash
#
# crm-setup.sh — post-install CRM setup for this project's production Frappe
# site. Sibling to install.sh (initial provisioning) and update.sh (code
# deploy — frontend rebuild + micromax app pull/migrate/build); this script
# is neither of those — it's CONFIG/DATA, applied directly against the site
# via `bench console`, independent of what code is currently deployed:
#
#   1. Mail  — an Email Account (IMAP + SMTP), with the corporate domain
#              always used as the From/sender address (avoids shared-hosting
#              mail servers rejecting outgoing mail for a From-header domain
#              mismatch — see the "always_use_account_email_id_as_sender"
#              setting below).
#   2. Role  — a "CRM" role with full (read/write/create/delete/print/email/
#              report/export/share/import) access to every CRM-app doctype
#              (Lead, Deal, Task, Note, Call Log, Organization, ...) plus the
#              mail/WhatsApp/notification doctypes the CRM UI depends on
#              (Communication, Email Template, Contact, Address, Event,
#              Notification Settings/Log, WhatsApp Message/Log/Template/...).
#              Email Account / WhatsApp Account / WhatsApp Settings get the
#              same access minus Delete, since those hold the mail/WhatsApp
#              credentials configured in step 1 — the role can use and
#              reconfigure the integration but can't delete the account
#              outright.
#   3. User  — a login with the CRM role assigned, plus "Sales Manager" and
#              "Sales User" (needed for reasons beyond DocPerm — see below),
#              password set directly (no welcome email — this is meant for
#              servers with no outgoing mail configured yet, or an operator
#              setting the password by hand).
#   4. Contract — widens the core Contract doctype's party_type/document_type
#              Select options to accept CRM Lead/Deal/Organization (Property
#              Setter — Frappe validates a Select's value against its
#              declared options server-side, so the React form's dropdown
#              alone isn't enough), and widens CRM Notification's type Select
#              to include "Email" (needed by the mail send/receive
#              notifications — see micromax/crm_mail_notifications.py and
#              crm_reminders.py's _notify_mail_send_status, deployed via
#              update.sh's REMOVE_APPAREL=1 path since that's actual app
#              code, not something this config-only script touches).
#   5. Email Template — adds the `crm_template` Custom Field, which the CRM
#              Email Templates page and the Lead/Deal compose box's template
#              picker both filter/select on. Without it: "Field not
#              permitted in query: crm_template" the instant either loads.
#   6. CRM Task — adds the `task_category` Custom Field (Task/Follow-up), so
#              the Tasks page, the Follow-ups page, and the Lead/Deal detail
#              page's own "Tasks" vs "Follow-ups" cards each show only their
#              own bucket instead of every CRM Task record on both — without
#              it, a task/follow-up created anywhere shows up duplicated on
#              every one of those lists, since they all read the same
#              underlying CRM Task doctype with no way to tell them apart.
#
# Why Sales Manager/Sales User too, not just the custom CRM role: the
# vendored crm app registers its own permission_query_conditions hook for
# CRM Lead/CRM Deal (crm.permissions.org_hierarchy) that restricts visibility
# to records the user owns or is assigned to, UNLESS their roles include
# System Manager, or Sales Manager while not present in the CRM Sales
# Hierarchy doctype. A custom role's Custom DocPerm access — no matter how
# permissive — does not satisfy that check, so a user with only the CRM role
# would see zero Leads/Deals and be unable to tell why. Core Frappe has a
# similar trap for Communication (email): without "Super Email User" or
# System Manager, get_permission_query_conditions_for_communication hides
# EVERY email-type Communication unless the user has a matching "User Email"
# account mapping — symptom: "No emails yet" on a Lead/Deal that has real
# email history. "Super Email User" isn't seeded on this bench by default,
# so this script creates it if missing.
#
# Run as root (same as install.sh and update.sh) — it sudo's to the frappe
# user internally, same PATH-forcing helpers as those two scripts:
#
#   sudo EMAIL_PASSWORD='the-mailbox-password' \
#        CRM_USER_PASSWORD='the-login-password' \
#        bash crm-setup.sh
#
# Multi-tenant: the site comes from tenants/<TENANT>.env (same files as
# install-production.sh / update.sh). Default TENANT=wise (site 'wise'); for
# the MicroMax site instead:
#
#   sudo TENANT=micromax EMAIL_PASSWORD='...' CRM_USER_PASSWORD='...' bash crm-setup-production.sh
#
# One mailbox should be polled by ONE site only: two sites with incoming mail
# on the same address each import every message (duplicate Communications and
# Leads). The script warns if another site on this bench already pulls
# EMAIL_ID; EMAIL_ENABLE_INCOMING=0 sets the account up for sending only.
# Moving the mailbox from another site (e.g. demo -> wise) in the same run:
#
#   sudo REMOVE_MAILBOX_FROM=demo EMAIL_PASSWORD='...' CRM_USER_PASSWORD='...' bash crm-setup-production.sh
#
# Every value below can be overridden the same way (SITE_NAME, APEX_DOMAIN-
# derived defaults, etc.); only EMAIL_PASSWORD and CRM_USER_PASSWORD are
# required (no hardcoded default — pick real passwords per deployment).
# Idempotent — safe to re-run any time (e.g. after rotating the mailbox
# password, or after update.sh deploys a micromax change this script's
# config depends on): every step here updates the existing record instead of
# duplicating it.

set -euo pipefail

log()  { echo -e "\n\033[1;36m==>\033[0m $*"; }
die()  { echo -e "\033[1;31mERROR:\033[0m $*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Run this as root (same as install.sh/update.sh): sudo bash $(basename "$0")"

# ============================================================== Configuration
# Same defaults/override style as install.sh and update.sh.
FRAPPE_USER="${FRAPPE_USER:-maqmalak}"
FRAPPE_HOME="/home/${FRAPPE_USER}"
BENCH_DIR="${BENCH_DIR:-${FRAPPE_HOME}/frappe-bench}"
BENCH_BIN="${BENCH_BIN:-${FRAPPE_HOME}/.local/bin/bench}"
# The CRM (corporate@wise.edu.pk mailbox, fundraising Leads) belongs to the Wise tenant: default site 'wise'.
TENANT="${TENANT:-wise}"
TENANT_FILE="$(dirname "$(readlink -f "$0")")/tenants/${TENANT}.env"
[[ -f "$TENANT_FILE" ]] || die "No tenant file ${TENANT_FILE} (TENANT=${TENANT})."
# shellcheck source=/dev/null
source "$TENANT_FILE"
SITE_NAME="${SITE_NAME:-wise}"

# ---- Mail (Email Account) ----
EMAIL_ENABLE_INCOMING="${EMAIL_ENABLE_INCOMING:-1}"   # 0 = SMTP only (no IMAP polling)
# Sites that should stop using EMAIL_ID (space-separated), e.g. REMOVE_MAILBOX_FROM=demo when the
# mailbox moves to wise. There, the mail setting and the CRM login are switched off — never deleted,
# so no email, email link or assignment is lost; roles are not touched:
#   - Email Account for EMAIL_ID: disabled (no incoming, no outgoing, not default).
#   - User CRM_USER_EMAIL: disabled (can't log in).
REMOVE_MAILBOX_FROM="${REMOVE_MAILBOX_FROM:-}"
EMAIL_ACCOUNT_NAME="${EMAIL_ACCOUNT_NAME:-Corporate (Wise)}"
EMAIL_ID="${EMAIL_ID:-corporate@wise.edu.pk}"
EMAIL_PASSWORD="${EMAIL_PASSWORD:?Set EMAIL_PASSWORD to the mailbox password for ${EMAIL_ID:-the mail account}.}"
# Shared cPanel/Namecheap hosting rejects a From-header domain that doesn't
# match the SMTP-authenticated account's own domain, and its TLS cert is
# usually a wildcard for the *hosting provider's* own domain, not yours — so
# the real server (not "mail.<yourdomain>") has to be resolved once, e.g. via
# `dig +short -x <the mail A/MX record's IP>`, and used for both IMAP/SMTP.
EMAIL_SERVER="${EMAIL_SERVER:-server190-2.web-hosting.com}"
EMAIL_IMAP_PORT="${EMAIL_IMAP_PORT:-993}"
EMAIL_SMTP_SERVER="${EMAIL_SMTP_SERVER:-$EMAIL_SERVER}"
EMAIL_SMTP_PORT="${EMAIL_SMTP_PORT:-465}"

# ---- CRM role + login ----
CRM_ROLE="${CRM_ROLE:-CRM}"
CRM_USER_EMAIL="${CRM_USER_EMAIL:-corporate@wise.edu.pk}"
CRM_USER_PASSWORD="${CRM_USER_PASSWORD:?Set CRM_USER_PASSWORD for the ${CRM_USER_EMAIL:-CRM} login.}"
CRM_USER_FIRST_NAME="${CRM_USER_FIRST_NAME:-Corporate}"
CRM_USER_LAST_NAME="${CRM_USER_LAST_NAME:-Wise}"

id "$FRAPPE_USER" &>/dev/null || die "System user '${FRAPPE_USER}' does not exist — is install.sh's setup actually on this box?"
[[ -x "$BENCH_BIN" ]] || die "bench not found at ${BENCH_BIN} (set BENCH_BIN, or FRAPPE_USER if it's a different login)."
[[ -d "${BENCH_DIR}/sites/${SITE_NAME}" ]] || die "Site '${SITE_NAME}' not found under ${BENCH_DIR}/sites (set SITE_NAME)."

# ==================================================================== Helpers
# Same PATH-forcing trick as install.sh/update.sh: a non-interactive
# `sudo -iu` shell doesn't source ~/.bashrc, which is where uv's installer
# appends its PATH line — bench lives under ~/.local/bin, resolved via
# BENCH_BIN above rather than needing node/nvm here (this script never runs
# npm/yarn, only `bench console`).
UV_BIN_DIR="${FRAPPE_HOME}/.local/bin"
# Forwards the two passwords as real `env` arguments (each its own argv
# token, never re-embedded into a shell string) so a password containing a
# quote/space/$ can't break quoting across the sudo boundary — the Python
# script itself only ever reads them via os.environ, never
# string-interpolation.
as_frappe_sh_with_secrets() {
  sudo -iu "$FRAPPE_USER" env \
    "PATH=${UV_BIN_DIR}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
    "CRM_SETUP_EMAIL_PASSWORD=${EMAIL_PASSWORD}" \
    "CRM_SETUP_USER_PASSWORD=${CRM_USER_PASSWORD}" \
    bash -c "$1"
}

# ================================================================ Build script
# Passwords go through the environment (read via os.environ below) rather
# than being string-interpolated into the generated Python source, so a
# password containing a quote/backslash/$ can't break the script. Everything
# else interpolated directly is low-risk (email addresses, hostnames, role
# name).
PYFILE="$(mktemp "${TMPDIR:-/tmp}/crm_setup.XXXXXX.py")"
trap 'rm -f "$PYFILE"' EXIT

cat > "$PYFILE" <<PYEOF
import os
import frappe
from frappe.permissions import add_permission, update_permission_property

email_password = os.environ["CRM_SETUP_EMAIL_PASSWORD"]
crm_user_password = os.environ["CRM_SETUP_USER_PASSWORD"]

# ---------------------------------------------------------------- 1. Mail
email_id = "${EMAIL_ID}"
existing_name = frappe.db.get_value("Email Account", {"email_id": email_id})
if existing_name:
    account = frappe.get_doc("Email Account", existing_name)
    print("Email Account exists:", account.name, "- updating settings")
else:
    account = frappe.new_doc("Email Account")
    account.email_account_name = "${EMAIL_ACCOUNT_NAME}"
    account.email_id = email_id
    account.append("imap_folder", {"folder_name": "INBOX"})
    print("Creating Email Account:", email_id)

account.password = email_password
account.awaiting_password = 0
account.auth_method = "Basic"
account.enable_incoming = ${EMAIL_ENABLE_INCOMING}
account.use_imap = 1
account.email_server = "${EMAIL_SERVER}"
account.incoming_port = "${EMAIL_IMAP_PORT}"
account.use_ssl = 1
account.enable_outgoing = 1
account.smtp_server = "${EMAIL_SMTP_SERVER}"
account.smtp_port = "${EMAIL_SMTP_PORT}"
account.use_ssl_for_outgoing = 1
account.use_tls = 0
account.default_incoming = ${EMAIL_ENABLE_INCOMING}
account.default_outgoing = 1
# Always send as the account's own address, regardless of which Frappe user
# triggers the send — without this, outgoing mail carries the sending user's
# own profile email (often a placeholder like admin@example.com) as From,
# which shared mail hosts reject as a domain-spoofing attempt.
account.always_use_account_email_id_as_sender = 1
if account.is_new():
    account.insert(ignore_permissions=True)
else:
    account.save(ignore_permissions=True)
frappe.db.commit()
print("Email Account ready:", account.name)

# ---------------------------------------------------------------- 2. CRM role
role_name = "${CRM_ROLE}"
if not frappe.db.exists("Role", role_name):
    role = frappe.new_doc("Role")
    role.role_name = role_name
    role.desk_access = 1
    role.insert(ignore_permissions=True)
    frappe.db.commit()
    print("Role created:", role_name)
else:
    print("Role already exists:", role_name)

# Every non-table doctype owned by the crm app's modules (FCRM, Lead Syncing).
CRM_APP_DOCTYPES = [
    "CRM Call Log", "CRM Communication Status", "CRM Dashboard", "CRM Deal",
    "CRM Deal Status", "CRM Exotel Settings", "CRM Fields Layout", "CRM Form Script",
    "CRM Global Settings", "CRM Holiday List", "CRM Industry", "CRM Invitation",
    "CRM Lead", "CRM Lead Source", "CRM Lead Status", "CRM Lost Reason",
    "CRM Notification", "CRM Organization", "CRM Product", "CRM Sales Hierarchy",
    "CRM Service Level Agreement", "CRM Task", "CRM Telephony Agent", "CRM Territory",
    "CRM Twilio Settings", "CRM View Settings", "ERPNext CRM Settings", "FCRM Note",
    "FCRM Settings", "Facebook Lead Form", "Facebook Page", "Failed Lead Sync Log",
    "Lead Sync Source",
    # Lives in the custom micromax app's own module (not the crm app's FCRM/
    # Lead Syncing modules), so it doesn't show up in a module-based scan of
    # the crm app — the Prospect Scraper page in the React frontend needs it.
    "CRM Prospect Scrape",
]
# Mail / WhatsApp / notification doctypes the CRM UI depends on but that
# don't belong to the crm app itself.
MAIL_WHATSAPP_NOTIFICATION_DOCTYPES = [
    "Communication", "Email Template", "Contact", "Address", "Event",
    # Event Participants is a child table (istable=1) — Frappe's permission
    # model for child tables ignores the child doctype's own DocPerm rows
    # entirely and checks access against the PARENT doctype instead (Event,
    # already granted above). This grant is therefore a harmless no-op, kept
    # only so a future reader isn't left wondering why it's missing; the
    # actual fix for the Lead/Deal detail page's "Scheduled Activities"
    # widget 403'ing (and retrying every 3s via the frontend's SWR config,
    # visible as the page "flickering") was on the frontend side —
    # useLinkedEvents (doc-panels.tsx) wasn't telling Frappe which parent
    # doctype to check against, so has_child_permission() denied
    # unconditionally for every non-Administrator user.
    "Event Participants",
    "Notification Settings", "Notification Log",
    "WhatsApp Message", "WhatsApp Log", "WhatsApp Template",
    "WhatsApp Language", "WhatsApp Profile",
    # "Contract" ships with full Sales Manager access by default, but
    # "Contract Template" ships READ-ONLY for Sales Manager — a CRM user
    # could load a template into a Contract but not create one, hitting
    # "does not have doctype access ... for document Contract Template".
    # Granting both via the CRM role directly makes this independent of
    # Sales Manager's own (possibly-customized) defaults.
    "Contract", "Contract Template",
]
# Credential-bearing integration configs: full access minus Delete, so the
# role can use/reconfigure mail + WhatsApp but can't remove the account
# set up in step 1 (or a WhatsApp Business connection) outright.
CONFIG_DOCTYPES_NO_DELETE = ["Email Account", "WhatsApp Account", "WhatsApp Settings"]
# Read-only: Email Queue holds the raw MIME message + per-recipient send
# status/error for every outgoing email, System Manager only by default.
# Read access lets the CRM UI show real delivery status (Sent/Error, with
# the SMTP rejection reason) on each Lead/Deal instead of a "sent" toast
# that only means "queued", not "delivered". Global Defaults (a Single) is
# read on EVERY authenticated page load (useAuth.tsx fetches default_company
# from it) — missing this means every single page, not just Lead/Deal
# detail, 403s on load and gets retried every 3s by the frontend's SWR
# error-retry config, i.e. the whole app "flickers" for anyone without
# System Manager.
READ_ONLY_DOCTYPES = ["Email Queue", "Global Defaults"]

FULL_ACCESS_PTYPES = ["write", "create", "delete", "print", "email", "report", "export", "share", "import"]
NO_DELETE_PTYPES = [p for p in FULL_ACCESS_PTYPES if p != "delete"]

def grant_full(doctype, ptypes):
    if not frappe.db.exists("DocType", doctype):
        print("SKIP (doctype not installed on this site):", doctype)
        return
    add_permission(doctype, role_name, 0)
    for ptype in ptypes:
        update_permission_property(doctype, role_name, 0, ptype, 1)
    print("Granted full access:", doctype)

def grant_read_only(doctype):
    if not frappe.db.exists("DocType", doctype):
        print("SKIP (doctype not installed on this site):", doctype)
        return
    add_permission(doctype, role_name, 0)  # default ptype "read" only
    print("Granted read-only:", doctype)

for dt in CRM_APP_DOCTYPES:
    grant_full(dt, FULL_ACCESS_PTYPES)
for dt in MAIL_WHATSAPP_NOTIFICATION_DOCTYPES:
    grant_full(dt, FULL_ACCESS_PTYPES)
for dt in CONFIG_DOCTYPES_NO_DELETE:
    grant_full(dt, NO_DELETE_PTYPES)
for dt in READ_ONLY_DOCTYPES:
    grant_read_only(dt)
frappe.db.commit()

# ---------------------------------------------------------------- 3. CRM user
user_email = "${CRM_USER_EMAIL}"
if frappe.db.exists("User", user_email):
    user = frappe.get_doc("User", user_email)
    print("User exists:", user_email, "- ensuring role + password")
else:
    user = frappe.new_doc("User")
    user.email = user_email
    user.first_name = "${CRM_USER_FIRST_NAME}"
    user.last_name = "${CRM_USER_LAST_NAME}"
    user.send_welcome_email = 0
    user.user_type = "System User"
    user.insert(ignore_permissions=True)
    print("User created:", user_email)

# "Super Email User" is a core Frappe role (frappe.core.doctype.communication)
# that this bench doesn't seed by default — without it (or System Manager),
# frappe's own get_permission_query_conditions_for_communication hook hides
# EVERY email-type Communication from the user unless they have a matching
# "User Email" account mapping, regardless of Custom DocPerm on Communication.
# Symptom without this: the compose panel shows "No emails yet" on a Lead/Deal
# that has real email history.
if not frappe.db.exists("Role", "Super Email User"):
    super_email_role = frappe.new_doc("Role")
    super_email_role.role_name = "Super Email User"
    super_email_role.desk_access = 1
    super_email_role.insert(ignore_permissions=True)
    print("Role created: Super Email User")

for extra_role in [role_name, "Sales Manager", "Sales User", "Super Email User"]:
    if not any(r.role == extra_role for r in user.roles):
        user.append("roles", {"role": extra_role})
        print("Role added to user:", extra_role)

# "Sales Manager" matters beyond DocPerm: the crm app's own org-hierarchy
# permission hook (crm.permissions.org_hierarchy) restricts CRM Lead/Deal
# visibility to only records a user owns or is assigned to, UNLESS their
# roles include System Manager, or Sales Manager while not present in the
# CRM Sales Hierarchy doctype — a custom role with full Custom DocPerm access
# does not satisfy that check at all and would otherwise show zero records.
user.save(ignore_permissions=True)

if frappe.db.exists("CRM Sales Hierarchy", {"user": user_email}):
    print("NOTE:", user_email, "is in the CRM Sales Hierarchy tree — visibility will be scoped to their subtree, not global, despite the Sales Manager role.")

user.new_password = crm_user_password
user.save(ignore_permissions=True)
frappe.db.commit()
print("CRM user ready:", user_email)

# ---------------------------------------------------------------- 4. Select widenings
from frappe.custom.doctype.property_setter.property_setter import make_property_setter

def widen_select_options(doctype, fieldname, extra_values, keep_leading_blank=False):
    field = frappe.get_meta(doctype).get_field(fieldname)
    current = field.options or ""
    lines = [l for l in current.split("\n") if l.strip()]
    changed = False
    for v in extra_values:
        if v not in lines:
            lines.append(v)
            changed = True
    if not changed:
        print(f"{doctype}.{fieldname} options already include:", extra_values)
        return
    new_options = ("\n" if keep_leading_blank else "") + "\n".join(lines)
    make_property_setter(doctype, fieldname, "options", new_options, "Text")
    print(f"{doctype}.{fieldname} options widened to:", repr(new_options))

# Contract's party_type/document_type ship covering only Customer/Supplier/
# Employee and Quotation/Project/Sales/Purchase Order/Invoice respectively —
# neither includes any CRM doctype, so the React Contracts page's Dynamic
# Link party_name/document_name fields are useless against a value the
# backend would reject as "not a valid option" on save.
widen_select_options("Contract", "party_type", ["CRM Lead", "CRM Deal", "CRM Organization"])
widen_select_options("Contract", "document_type", ["CRM Lead", "CRM Deal"], keep_leading_blank=True)
frappe.clear_cache(doctype="Contract")

# CRM Notification's type ships as Mention/Task/Assignment/WhatsApp only —
# needed by micromax.crm_mail_notifications / crm_reminders.py's mail
# send/receive notifications (that code itself deploys via update.sh's
# REMOVE_APPAREL=1 path; this just makes the "Email" type value a doc there
# is allowed to use).
widen_select_options("CRM Notification", "type", ["Email"])
frappe.clear_cache(doctype="CRM Notification")

frappe.db.commit()

# ---------------------------------------------------------------- 5. Email Template custom field
# Since mm_core (installed on every site) defines crm_template and task_category and re-applies them
# on every migrate, steps 5 and 6 are normally no-ops; they stay as a fallback for a site that predates it.
# Email Template is a core, desk-wide doctype (HR/Payroll notification
# templates live in the same table) — crm_template tags a row as belonging
# to the CRM's own Email Templates list (src/pages/CRM/EmailTemplatesPage.tsx)
# and the Lead/Deal compose box's template picker (useEmailTemplates.ts),
# both of which filter/select on this field. Without it: "Field not
# permitted in query: crm_template" the moment either page loads.
if not frappe.db.exists("Custom Field", "Email Template-crm_template"):
    cf = frappe.new_doc("Custom Field")
    cf.dt = "Email Template"
    cf.fieldname = "crm_template"
    cf.label = "CRM Template"
    cf.fieldtype = "Check"
    cf.default = "0"
    cf.insert_after = "subject"
    cf.description = "Shown in the CRM's Email Templates list and the Lead/Deal compose box template picker."
    cf.insert(ignore_permissions=True)
    print("Custom Field created: Email Template.crm_template")
else:
    print("Custom Field already exists: Email Template.crm_template")
frappe.clear_cache(doctype="Email Template")
frappe.db.commit()

# ---------------------------------------------------------------- 6. CRM Task category
# CRM Task backs both the generic Tasks page and the Lead/Deal Follow-ups
# mechanism with no field to tell the two apart — every list built on it
# (Tasks page, Follow-ups page, and the Lead detail page's own "Tasks" and
# "Follow-ups" cards) reads the exact same rows, so anything created from
# any one of them shows up duplicated everywhere else. This field lets the
# frontend filter each list to its own bucket (a blank/legacy value from
# before this field existed is treated as belonging to both, so no
# pre-existing record silently disappears from a list it used to be on).
if not frappe.db.exists("Custom Field", "CRM Task-task_category"):
    cf = frappe.new_doc("Custom Field")
    cf.dt = "CRM Task"
    cf.fieldname = "task_category"
    cf.label = "Category"
    cf.fieldtype = "Select"
    cf.options = "\nTask\nFollow-up"
    cf.insert_after = "title"
    cf.description = "Distinguishes the generic Tasks list from the Lead/Deal Follow-ups mechanism (same doctype, different UI lists)."
    cf.insert(ignore_permissions=True)
    print("Custom Field created: CRM Task.task_category")
else:
    print("Custom Field already exists: CRM Task.task_category")
frappe.clear_cache(doctype="CRM Task")
frappe.db.commit()

# ---------------------------------------------------------------- 7. Check shared CRM Lead fields
# Read-only. The CRM Lead fundraising / second-contact fields come from mm_core.custom_fields (install +
# every migrate), not from this script; warn if they're missing (mm_core not installed / not migrated).
if frappe.db.exists("DocType", "CRM Lead"):
    expected = ["priority", "csr_department", "focus_area", "education_focus", "proposed_ask",
                "first_contact_date", "second_contact_name", "second_contact_email"]
    meta = frappe.get_meta("CRM Lead")
    missing = [f for f in expected if not meta.has_field(f)]
    if missing:
        print("WARNING: CRM Lead is missing", missing, "- install mm_core on this site and run bench migrate")
    else:
        print("CRM Lead shared fields present (mm_core)")

print("ALL DONE")
PYEOF
chmod 600 "$PYFILE"
chown "${FRAPPE_USER}:${FRAPPE_USER}" "$PYFILE"

for old_site in $REMOVE_MAILBOX_FROM; do
  [[ "$old_site" == "$SITE_NAME" ]] && die "REMOVE_MAILBOX_FROM includes the target site '${SITE_NAME}' itself."
  [[ -d "${BENCH_DIR}/sites/${old_site}" ]] || die "REMOVE_MAILBOX_FROM: site '${old_site}' not found under ${BENCH_DIR}/sites."
  log "Switching off ${EMAIL_ID} (mail setting + login) on site '${old_site}' — nothing is deleted"
  RM_PY="$(mktemp "${TMPDIR:-/tmp}/crm_rm_mailbox.XXXXXX.py")"
  cat > "$RM_PY" <<RMEOF
import frappe

# Disable, never delete: deleting an Email Account blanks the email_account link on every email it
# received/sent, and deleting a User deletes its ToDos (= every Lead/Deal assignment), private Events,
# shares and user permissions. Disabled, the site stops using the mailbox and the login, and all of
# that history stays exactly as it was.
email_id, user_email = "${EMAIL_ID}", "${CRM_USER_EMAIL}"
names = frappe.get_all("Email Account", filters={"email_id": email_id}, pluck="name")
if not names:
    print(f"No Email Account for {email_id} on this site - nothing to remove")
for name in names:
    before = frappe.db.count("Communication", {"email_account": name})
    acc = frappe.get_doc("Email Account", name)
    acc.enable_incoming = 0
    acc.enable_outgoing = 0
    acc.default_incoming = 0
    acc.default_outgoing = 0
    acc.save(ignore_permissions=True)
    frappe.db.commit()
    after = frappe.db.count("Communication", {"email_account": name})
    print(f"Disabled Email Account '{name}' (no incoming/outgoing) - emails linked: {before} before, {after} after")

if not frappe.db.exists("User", user_email):
    print(f"No User {user_email} on this site - nothing to remove")
else:
    todos = frappe.db.count("ToDo", {"allocated_to": user_email})
    comms = frappe.db.count("Communication", {"sender": ["like", f"%{user_email}%"]})
    frappe.db.set_value("User", user_email, "enabled", 0)
    frappe.db.commit()
    print(f"Disabled User '{user_email}' (cannot log in) - kept {todos} assignments, {comms} emails sent by it")
RMEOF
  chmod 644 "$RM_PY"; chown "${FRAPPE_USER}:${FRAPPE_USER}" "$RM_PY"
  sudo -iu "$FRAPPE_USER" env "PATH=${UV_BIN_DIR}:/usr/local/bin:/usr/bin:/bin" bash -c \
    "cd '${BENCH_DIR}' && echo \"exec(open('${RM_PY}').read(), {})\" | '${BENCH_BIN}' --site '${old_site}' console" \
    | grep -E "Disabled|nothing to remove|Error" || true
  rm -f "$RM_PY"
done

if [[ "$EMAIL_ENABLE_INCOMING" == "1" ]]; then
  for other in $(find "${BENCH_DIR}/sites" -mindepth 2 -maxdepth 2 -name site_config.json -printf '%h\n' | xargs -rn1 basename); do
    [[ "$other" == "$SITE_NAME" ]] && continue
    hit="$(sudo -iu "$FRAPPE_USER" env "PATH=${UV_BIN_DIR}:/usr/local/bin:/usr/bin:/bin" bash -c \
      "cd '${BENCH_DIR}' && '${BENCH_BIN}' --site '${other}' execute frappe.db.get_value --kwargs \"{'doctype': 'Email Account', 'filters': {'email_id': '${EMAIL_ID}', 'enable_incoming': 1}}\"" 2>/dev/null | tail -1 || true)"
    if [[ -n "$hit" && "$hit" != "None" && "$hit" != "null" ]]; then
      echo -e "\033[1;33mWARN:\033[0m site '${other}' already pulls ${EMAIL_ID} (Email Account '${hit}'). Both sites will import every message." >&2
      echo "      Turn incoming off on one of them (Email Account -> Enable Incoming), or re-run with EMAIL_ENABLE_INCOMING=0." >&2
    fi
  done
fi

log "Applying CRM mail/role/user/select-option setup on site '${SITE_NAME}'"
as_frappe_sh_with_secrets "cd '${BENCH_DIR}' && echo \"exec(open('${PYFILE}').read(), {})\" | '${BENCH_BIN}' --site '${SITE_NAME}' console"

log "Done."
cat <<EOF

  Site:          ${SITE_NAME}${TENANT:+ (tenant ${TENANT})}$([[ -n "$REMOVE_MAILBOX_FROM" ]] && echo "
  Mailbox moved: ${EMAIL_ID} mail setting + ${CRM_USER_EMAIL} login disabled on: ${REMOVE_MAILBOX_FROM} (emails, assignments, roles kept)")
  Email Account: ${EMAIL_ID} (${EMAIL_SERVER}, $([[ "$EMAIL_ENABLE_INCOMING" == "1" ]] && echo "IMAP ${EMAIL_IMAP_PORT} + " || echo "incoming off, ")SMTP ${EMAIL_SMTP_PORT})
  Role:          ${CRM_ROLE} (full access to CRM + mail/WhatsApp/notification doctypes)
  CRM login:     ${CRM_USER_EMAIL} (roles: ${CRM_ROLE}, Sales Manager, Sales User, Super Email User)
  Contract:      party_type/document_type widened to accept CRM Lead/Deal/Organization
  Notification:  CRM Notification.type widened to accept "Email"
  Email Template: crm_template custom field ready (Email Templates page + compose-box picker)
  CRM Task:      task_category custom field ready (Tasks vs Follow-ups list filtering)
  CRM Lead:      shared fundraising fields checked (from mm_core — see output above)

  Re-run this script any time (e.g. after rotating the mailbox password) —
  every step above updates the existing record instead of duplicating it.

EOF
if [[ "$TENANT" == "micromax" ]]; then
  cat <<EOF
  If this is the first time deploying the mail send/receive notification
  feature (micromax/crm_mail_notifications.py + crm_reminders.py's
  _notify_mail_send_status), make sure update.sh has been run with
  REMOVE_APPAREL=1 at least once so that code is actually on this site —
  this script only prepares the CRM Notification.type option for it, it
  doesn't deploy the code itself.
EOF
fi
