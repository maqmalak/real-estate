#!/usr/bin/env bash
#
# crm-setup-local.sh — post-install CRM setup for the LOCAL development bench
# (bare-metal, standing at /home/maqmalak/erpnext-react, site "micromaxerp" —
# see install.local.sh). Local sibling of crm-setup-production.sh: same
# role/user/custom-field/select-option setup, but adapted to the local box —
# runs as your own user (NO root/sudo — the bench is owned by you), points at
# the local bench/site by default, and treats the mail account and the login
# password as optional (see below) instead of required. Like the production
# script it is CONFIG/DATA applied directly against the site via
# `bench console`, independent of what code is currently deployed:
#
#   1. Mail  — OPTIONAL locally: only runs when EMAIL_PASSWORD is set. An
#              Email Account (IMAP + SMTP), with the corporate domain always
#              used as the From/sender address (avoids shared-hosting mail
#              servers rejecting outgoing mail for a From-header domain
#              mismatch — see the "always_use_account_email_id_as_sender"
#              setting below). Skipped by default on purpose: a local dev
#              site polling the real corporate mailbox would ingest (and
#              create Leads from) real production mail.
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
#              password set directly (no welcome email — local dev has no
#              outgoing mail). CRM_USER_PASSWORD is optional: if unset, a new
#              user gets a random password (printed once at the end) and an
#              existing user's password is left untouched.
#   4. Contract — widens the core Contract doctype's party_type/document_type
#              Select options to accept CRM Lead/Deal/Organization (Property
#              Setter — Frappe validates a Select's value against its
#              declared options server-side, so the React form's dropdown
#              alone isn't enough), and widens CRM Notification's type Select
#              to include "Email" (needed by the mail send/receive
#              notifications — see micromax/crm_mail_notifications.py and
#              crm_reminders.py's _notify_mail_send_status, deployed via
#              apps/micromax's own install/migrate path since that's actual
#              app code, not something this config-only script touches —
#              locally that already runs on `bench migrate`, so this step is
#              usually a no-op here).
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
#   7. Check — read-only sanity check that the CRM Lead fundraising custom
#              fields (priority, csr_department, address, focus_area, ...)
#              exist. Those are owned by apps/micromax (micromax.install.
#              make_custom_fields, applied on install/migrate), not created
#              here — this only warns if `bench migrate` hasn't run yet.
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
# Run as your normal user, NOT root/sudo (same as install.local.sh) — the
# local bench is owned by you, so no sudo/user-switching is needed:
#
#   bash crm-setup-local.sh
#
# or, to also configure the mailbox and pick the login password yourself:
#
#   EMAIL_PASSWORD='the-mailbox-password' \
#   CRM_USER_PASSWORD='the-login-password' \
#   bash crm-setup-local.sh
#
# Every value below can be overridden the same way (BENCH_DIR, SITE_NAME,
# CRM_USER_EMAIL, etc.). Idempotent — safe to re-run any time (e.g. after a
# `bench migrate` that changes something this script's config depends on):
# every step here updates the existing record instead of duplicating it.

set -euo pipefail

log()  { echo -e "\n\033[1;36m==>\033[0m $*"; }
warn() { echo -e "\033[1;33mWARN:\033[0m $*" >&2; }
die()  { echo -e "\033[1;31mERROR:\033[0m $*" >&2; exit 1; }

[[ $EUID -ne 0 ]] || die "Run this as your normal user, NOT root/sudo — the local bench is owned by you (same as install.local.sh)."

# ============================================================== Configuration
# Same defaults as install.local.sh.
BENCH_DIR="${BENCH_DIR:-/home/maqmalak/erpnext-react}"
SITE_NAME="${SITE_NAME:-micromaxerp}"
BENCH_BIN="${BENCH_BIN:-$(command -v bench || echo "${HOME}/.local/bin/bench")}"

# ---- Mail (Email Account) — skipped unless EMAIL_PASSWORD is set ----
EMAIL_ACCOUNT_NAME="${EMAIL_ACCOUNT_NAME:-Corporate (Wise)}"
EMAIL_ID="${EMAIL_ID:-corporate@wise.edu.pk}"
EMAIL_PASSWORD="${EMAIL_PASSWORD:-}"
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
# Optional — see step 3 above for what happens when unset.
CRM_USER_PASSWORD="${CRM_USER_PASSWORD:-}"
CRM_USER_FIRST_NAME="${CRM_USER_FIRST_NAME:-Corporate}"
CRM_USER_LAST_NAME="${CRM_USER_LAST_NAME:-Wise}"

[[ -x "$BENCH_BIN" ]] || die "bench not found (tried '${BENCH_BIN}') — set BENCH_BIN, or run install.local.sh first."
[[ -d "${BENCH_DIR}/sites/${SITE_NAME}" ]] || die "Site '${SITE_NAME}' not found under ${BENCH_DIR}/sites (set BENCH_DIR / SITE_NAME)."

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

email_password = os.environ.get("CRM_SETUP_EMAIL_PASSWORD", "")
crm_user_password = os.environ.get("CRM_SETUP_USER_PASSWORD", "")

# ---------------------------------------------------------------- 1. Mail
# Optional on a local dev site: without EMAIL_PASSWORD there's nothing to
# authenticate with, and configuring a real mailbox here would make the local
# scheduler poll (and create Leads from) real corporate mail.
email_id = "${EMAIL_ID}"
if not email_password:
    print("SKIP Mail: EMAIL_PASSWORD not set (optional on a local site)")
else:
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
    account.enable_incoming = 1
    account.use_imap = 1
    account.email_server = "${EMAIL_SERVER}"
    account.incoming_port = "${EMAIL_IMAP_PORT}"
    account.use_ssl = 1
    account.enable_outgoing = 1
    account.smtp_server = "${EMAIL_SMTP_SERVER}"
    account.smtp_port = "${EMAIL_SMTP_PORT}"
    account.use_ssl_for_outgoing = 1
    account.use_tls = 0
    account.default_incoming = 1
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
user_is_new = not frappe.db.exists("User", user_email)
generated_password = None
if user_is_new and not crm_user_password:
    # No CRM_USER_PASSWORD given for a brand-new login: generate one (printed
    # at the very end) rather than leaving the user with no way to log in.
    generated_password = frappe.generate_hash(length=14)
    crm_user_password = generated_password
if not user_is_new:
    user = frappe.get_doc("User", user_email)
    print("User exists:", user_email, "- ensuring roles" + (" + password" if crm_user_password else " (password left untouched)"))
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

if crm_user_password:
    user.new_password = crm_user_password
    user.save(ignore_permissions=True)
frappe.db.commit()
print("CRM user ready:", user_email)
if generated_password:
    print("GENERATED LOGIN PASSWORD for", user_email + ":", generated_password)

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
# send/receive notifications (that code itself lives in apps/micromax; this
# just makes the "Email" type value a doc there is allowed to use).
widen_select_options("CRM Notification", "type", ["Email"])
frappe.clear_cache(doctype="CRM Notification")

frappe.db.commit()

# ---------------------------------------------------------------- 5. Email Template custom field
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

# ---------------------------------------------------------------- 7. Fundraising fields check
# CRM Lead's fundraising tracker fields (LeadFormPage / Prospect Scraper) are
# created by apps/micromax's micromax.install.make_custom_fields on install/
# migrate, NOT by this script — just verify they made it onto this site.
FUNDRAISING_FIELDS = [
    "fundraising_section", "priority", "csr_department", "address",
    "fundraising_column_break", "focus_area", "education_focus",
    "proposed_ask", "first_contact_date", "remarks",
]
missing = [f for f in FUNDRAISING_FIELDS if not frappe.db.exists("Custom Field", "CRM Lead-" + f)]
if missing:
    print("WARN: CRM Lead custom fields missing (run 'bench --site ${SITE_NAME} migrate' so apps/micromax creates them):", missing)
else:
    print("CRM Lead fundraising custom fields present:", len(FUNDRAISING_FIELDS))

print("ALL DONE")
PYEOF
chmod 600 "$PYFILE"

log "Applying CRM mail/role/user/select-option setup on site '${SITE_NAME}'"
# Secrets go in as real environment variables of the bench process (each its
# own env entry, never re-embedded into a shell string), so a password with a
# quote/space/$ can't break quoting.
( cd "$BENCH_DIR" && \
  CRM_SETUP_EMAIL_PASSWORD="$EMAIL_PASSWORD" \
  CRM_SETUP_USER_PASSWORD="$CRM_USER_PASSWORD" \
  "$BENCH_BIN" --site "$SITE_NAME" console <<< "exec(open('${PYFILE}').read(), {})" )

log "Done."
cat <<EOF

  Site:          ${SITE_NAME} (${BENCH_DIR})
  Email Account: $([[ -n "$EMAIL_PASSWORD" ]] && echo "${EMAIL_ID} (${EMAIL_SERVER}, IMAP ${EMAIL_IMAP_PORT} / SMTP ${EMAIL_SMTP_PORT})" || echo "skipped (set EMAIL_PASSWORD to configure)")
  Role:          ${CRM_ROLE} (full access to CRM + mail/WhatsApp/notification doctypes)
  CRM login:     ${CRM_USER_EMAIL} (roles: ${CRM_ROLE}, Sales Manager, Sales User, Super Email User)
                 (a generated password, if any, is printed above as "GENERATED LOGIN PASSWORD")
  Contract:      party_type/document_type widened to accept CRM Lead/Deal/Organization
  Notification:  CRM Notification.type widened to accept "Email"
  Email Template: crm_template custom field ready (Email Templates page + compose-box picker)
  CRM Task:      task_category custom field ready (Tasks vs Follow-ups list filtering)
  CRM Lead:      fundraising custom fields checked (owned by apps/micromax, created on migrate)

  Re-run this script any time — every step above updates the existing
  record instead of duplicating it. The mail send/receive notification code
  (micromax/crm_mail_notifications.py + crm_reminders.py) lives in
  apps/micromax and is already live on this bench; this script only prepares
  the CRM Notification.type option it needs.
EOF
