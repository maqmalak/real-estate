#!/usr/bin/env bash
#
# update.sh — production update/deploy script for this project, meant to be
# re-run any time you ship new code, on the same bare-metal box `install.sh`
# originally provisioned (site "demo", Frappe v16 backend, bench at
# ~/frappe-bench, React frontend at ~/react-frontend served by nginx).
#
# It does these independent, idempotent things, in this order:
#
#   A0. Add new bench apps — fetches + installs any app in EXTRA_APPS that
#      the site doesn't have yet (currently `mm_core` and POS Awesome, `posawesome`), and
#      pulls/rebuilds it when it's already there. Runs with the backend
#      update (skip both with UPDATE_BACKEND=0; skip just this with
#      UPDATE_EXTRA_APPS=0).
#
#   A. Update the custom backend app (`micromax`) — git pull, site backup,
#      `bench migrate`, rebuild, clear cache, restart. This is what applies
#      server-side changes the frontend depends on (Property Setters, custom
#      fields, hooks...) — e.g. micromax.install's CRM Organization address /
#      no-of-employees fixes run on migrate. Runs by default, BEFORE the
#      frontend, so a new frontend never goes live against an old backend.
#      Non-destructive; skip it with UPDATE_BACKEND=0. Needs `micromax`
#      already installed on the site (see C for a box still on `apparel`).
#      New micromax Custom Fields (e.g. CRM Lead second_contact_*, BOM
#      bom_category) need no extra step — micromax's before_migrate hook
#      runs micromax.install.make_custom_fields on every migrate.
#
#   A4. Daily demo data — when the tenant file sets DEMO_DAILY_COMPANY, writes it to the
#      site config so micromax's 23:00 cron (micromax.demo_daily) keeps that company's
#      demo data current. DEMO_DAILY_RUN=1 also generates the missing days right away.
#
#   (B2, after the frontend build: patches the React nginx server block so
#   /app/... and /printview reach Frappe — "Open in desk", Print, POS Awesome.)
#
#   A2. Post-migrate DB tuning + data backfills — idempotent:
#      - GL Entry covering indexes (micromax_gl_analysis/_party) that the
#        React financial reports + accounts dashboard insights rely on
#        (the General Ledger insights went from ~100s to ~14s with them).
#      - BOM.bom_category for BOMs created before that field existed, so the
#        BOM list's Production / Conversion filter doesn't come up empty.
#      - Production Plan raw materials (mr_items) for plans that have none
#        (micromax.production_plan.backfill; only touches empty plans).
#      - HR: Employee Checkin `time` indexes (the Shifts / Attendance pages count a
#        day's check-ins — ~20 s per query on a million rows without them; the
#        migrate hook adds them too, this just confirms), Branch location fields.
#      - HR: a ONE-TIME default grace period on every Shift Type (late check-in +
#        early check-out marking, SHIFT_GRACE_MINUTES, default 30). A marker on the
#        site records that it ran, so later deploys never overwrite grace periods
#        changed afterwards; SHIFT_GRACE_FORCE=1 re-applies, SHIFT_GRACE_MINUTES=0
#        skips it.
#      - Smoke test of the HR insight endpoints (micromax.hr_insights) the new
#        Attendance / Leave / Shifts / Setup pages call.
#      Skip with RUN_BACKFILLS=0.
#
#   B. Redeploy the React frontend  — git pull, npm ci, npm run build.
#      Safe to re-run any time; this is the normal "ship a frontend change"
#      path. Runs by default.
#
#   C. Swap the custom backend app  — uninstall+remove the old `apparel` app
#      and fetch+install `micromax` in its place, then migrate and rebuild.
#      This is a ONE-TIME, DESTRUCTIVE migration (uninstalling `apparel`
#      deletes every doctype/record that app owns) — it only runs when you
#      explicitly opt in with REMOVE_APPAREL=1, and once `apparel` is gone
#      this step becomes a no-op on every later run. When it runs it does
#      its own pull/migrate/restart, so A is skipped.
#
# IMPORTANT — this script deploys what is on GitHub, not what is on your
# laptop: both repos are `git reset --hard origin/<branch>` on the server.
# Commit and push the frontend repo (FRONTEND_REPO) AND the micromax repo
# (MICROMAX_REPO) first, or the server just re-installs the old code.
#
# Run as root (same as install.sh):
#   sudo bash update.sh                        # backend update + frontend
#   sudo UPDATE_BACKEND=0 bash update.sh       # frontend only
#   sudo RUN_BACKFILLS=0 bash update.sh        # skip A2's indexes/backfills
#   sudo DEMO_DAILY_RUN=1 bash update.sh       # also catch up the daily demo data now (A4)
#   sudo SHIFT_GRACE_MINUTES=15 SHIFT_GRACE_FORCE=1 bash update.sh
#                                              # (re)set every shift's grace to 15 min
#   sudo POSAWESOME_REPO=https://github.com/<you>/posawesome.git bash update.sh
#                                              # deploy your own POS Awesome fork
#   sudo REMOVE_APPAREL=1 bash update.sh       # frontend + one-time app swap
#
# Multi-tenant: TENANT picks tenants/<name>.env (site, apps, frontend);
# default micromax. Code is shared by the whole bench, so after pulling new
# shared code (mm_core, frappe apps) migrate every tenant: TENANT=all.
#   sudo TENANT=wise bash update.sh            # the school site only
#   sudo TENANT=muzzamal bash update.sh        # the restaurant POS site only
#   sudo TENANT=all bash update.sh             # every tenants/*.env in turn
#
# Idempotency: safe to re-run — already-applied steps (app already removed,
# already installed, frontend already up to date) are skipped rather than
# failing.

set -euo pipefail

# ============================================================== Configuration
# Same defaults/override style as install.sh — override via env vars, e.g.:
#   SITE_NAME=demo APEX_DOMAIN=micromaxonline.uk bash update.sh
FRAPPE_USER="${FRAPPE_USER:-maqmalak}"
FRAPPE_HOME="/home/${FRAPPE_USER}"
BENCH_DIR="${BENCH_DIR:-${FRAPPE_HOME}/frappe-bench}"

# Tenant: site, apps and frontend come from tenants/<TENANT>.env.
TENANT="${TENANT:-micromax}"
TENANTS_DIR="$(dirname "$(readlink -f "$0")")/tenants"
if [[ "$TENANT" == "all" ]]; then
  for f in "$TENANTS_DIR"/*.env; do
    t="$(basename "$f" .env)"
    echo -e "\n\033[1;35m######## tenant: ${t}\033[0m"
    TENANT="$t" bash "$(readlink -f "$0")" || { echo "ERROR: update failed for tenant '${t}' — later tenants not updated." >&2; exit 1; }
  done
  exit 0
fi
TENANT_FILE="${TENANTS_DIR}/${TENANT}.env"
[[ -f "$TENANT_FILE" ]] || { echo "ERROR: no tenant file ${TENANT_FILE} (TENANT=${TENANT})" >&2; exit 1; }
# shellcheck source=/dev/null
source "$TENANT_FILE"
# shellcheck source=lib/react-nginx.sh
source "${TENANTS_DIR}/../lib/react-nginx.sh"
FORCE_FRONTEND_BUILD="${FORCE_FRONTEND_BUILD:-0}"   # 1 = rebuild even if dist/ matches the checkout

NODE_MAJOR="${NODE_MAJOR:-24}"

FRONTEND_BRANCH="${FRONTEND_BRANCH:-main}"

MICROMAX_REPO="${MICROMAX_REPO:-https://github.com/maqmalak/micromax.git}"
MICROMAX_BRANCH="${MICROMAX_BRANCH:-main}"

# The app being replaced. Override if it's actually named differently on
# your site (`bench --site <site> list-apps` will show the exact name).
MICROMAX_APP="${MICROMAX_APP:-micromax}"

# Section A (see header comment): pull + migrate the already-installed
# micromax app. On by default; UPDATE_BACKEND=0 skips it.
UPDATE_BACKEND="${UPDATE_BACKEND:-1}"
# Section A takes a database backup before migrating (a migrate can't be
# undone otherwise) — set to 1 to skip it.
SKIP_BACKUP="${SKIP_BACKUP:-0}"

# Section A0: bench apps added after install.sh ran. Same repo/branch table
# style as install.sh. Defaults to the maqmalak/posawesome fork (upstream
# defendicon/POS-Awesome-V15 plus the local closing-shift + item-card fixes);
# override POSAWESOME_REPO/POSAWESOME_BRANCH to deploy another source (the server can only pull what's
# on GitHub).
UPDATE_EXTRA_APPS="${UPDATE_EXTRA_APPS:-1}"
POSAWESOME_REPO="${POSAWESOME_REPO:-https://github.com/maqmalak/posawesome.git}"
POSAWESOME_BRANCH="${POSAWESOME_BRANCH:-main}"
# mm_core holds the Custom Fields shared by every site on the bench (micromax requires it), so it is
# fetched + installed here, before section A migrates micromax.
MM_CORE_REPO="${MM_CORE_REPO:-https://github.com/maqmalak/mm_core.git}"
MM_CORE_BRANCH="${MM_CORE_BRANCH:-main}"
declare -A EXTRA_APP_REPO=(
  [mm_core]="$MM_CORE_REPO"
  [posawesome]="$POSAWESOME_REPO"
  # Pinned copy of frappe/education (version-16 as of 22e0910); updated only when we pull upstream on purpose.
  [education]="${EDUCATION_REPO:-https://github.com/maqmalak/education.git}"
  # Junior-School (installs as nl_school): our fork of navariltd/Junior-School with the v16 fixes.
  [nl_school]="${NL_SCHOOL_REPO:-https://github.com/maqmalak/Junior-School.git}"
  # Restaurant POS setup (company, payment modes, counter, menu with photos).
  [restaurant]="${RESTAURANT_REPO:-https://github.com/maqmalak/restaurant.git}"
)
declare -A EXTRA_APP_BRANCH=(
  [mm_core]="$MM_CORE_BRANCH"
  [posawesome]="$POSAWESOME_BRANCH"
  [education]="${EDUCATION_BRANCH:-main}"
  [nl_school]="${NL_SCHOOL_BRANCH:-main}"
  [restaurant]="${RESTAURANT_BRANCH:-main}"
)
# Which of these this tenant pulls + installs (tenant file's EXTRA_APPS_LIST).
read -ra EXTRA_APPS <<<"$EXTRA_APPS_LIST"
# Every app the tenant's site should have (tenant file's SITE_APPS); A0 also installs any of these
# that are already in the bench but not yet on the site (e.g. crm for wise), without pulling them.
read -ra SITE_APP_LIST <<<"$SITE_APPS"

# Section A2 (indexes + data backfills) — on by default, RUN_BACKFILLS=0 skips.
RUN_BACKFILLS="${RUN_BACKFILLS:-1}"
# Section A2, HR: grace period (minutes) for late check-in / early check-out on
# every Shift Type — applied once per site (see header); 0 = don't touch shifts.
SHIFT_GRACE_MINUTES="${SHIFT_GRACE_MINUTES:-30}"
SHIFT_GRACE_FORCE="${SHIFT_GRACE_FORCE:-0}"
[[ "$SHIFT_GRACE_MINUTES" =~ ^[0-9]+$ && "$SHIFT_GRACE_MINUTES" -le 240 ]] || { echo "SHIFT_GRACE_MINUTES must be 0-240 (got '${SHIFT_GRACE_MINUTES}')" >&2; exit 1; }
[[ "$SHIFT_GRACE_FORCE" =~ ^[01]$ ]] || { echo "SHIFT_GRACE_FORCE must be 0 or 1 (got '${SHIFT_GRACE_FORCE}')" >&2; exit 1; }

# Opt-in switch for section C (see header comment) — deliberately off by
# default because uninstall-app is destructive (drops that app's data).
REMOVE_APPAREL="${REMOVE_APPAREL:-0}"
[[ "$REMOVE_APPAREL" != "1" || "$TENANT" == "micromax" ]] || { echo "REMOVE_APPAREL=1 only applies to TENANT=micromax" >&2; exit 1; }
# The old app section C removes. Referenced in A's and C's messages, so it must be
# defined even when C doesn't run (set -u would otherwise abort on it).
APPAREL_APP="${APPAREL_APP:-apparel}"
# uninstall-app takes a full site backup before deleting apparel's data by
# default — set to 1 to skip it (faster, but no rollback if this goes wrong).
SKIP_APPAREL_BACKUP="${SKIP_APPAREL_BACKUP:-0}"

# ==================================================================== Helpers
log()  { echo -e "\n\033[1;36m==>\033[0m $*"; }
warn() { echo -e "\033[1;33mWARN:\033[0m $*" >&2; }
die()  { echo -e "\033[1;31mERROR:\033[0m $*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Run this as root (sudo bash update.sh)."
id "$FRAPPE_USER" &>/dev/null || die "System user '${FRAPPE_USER}' does not exist — is install.sh's setup actually on this box?"
[[ -d "$BENCH_DIR" ]] || die "No bench at ${BENCH_DIR} — run install.sh first."
# SITE_NAME is the Frappe *site* (sites/<name>: the database every migrate/
# install-app/backfill below runs against), not a domain. install.sh creates
# it as "demo"; both erpnext.<apex> (desk, via bench add-domain) and
# demo.<apex> (React, via nginx X-Frappe-Site-Name) serve this one site.
if [[ ! -f "${BENCH_DIR}/sites/${SITE_NAME}/site_config.json" ]]; then
  die "Site '${SITE_NAME}' not found at ${BENCH_DIR}/sites/${SITE_NAME}. Sites on this bench: $(find "${BENCH_DIR}/sites" -mindepth 2 -maxdepth 2 -name site_config.json -printf '%h ' 2>/dev/null | xargs -rn1 basename | tr '\n' ' ') — re-run with SITE_NAME=<one of those>."
fi
log "Target Frappe site: ${SITE_NAME} ($(grep -o '"db_name": *"[^"]*"' "${BENCH_DIR}/sites/${SITE_NAME}/site_config.json" || echo 'db_name unknown'))"

UV_BIN_DIR="${FRAPPE_HOME}/.local/bin"
BENCH_BIN="${UV_BIN_DIR}/bench"

as_frappe() { sudo -iu "$FRAPPE_USER" -- "$@"; }
# Same PATH-forcing trick as install.sh: a non-interactive `sudo -iu` shell
# doesn't source ~/.bashrc, which is where uv's and nvm's installers append
# their PATH lines, so NODE_BIN_DIR has to be resolved once up front (below)
# and threaded through explicitly.
as_frappe_sh() {
  sudo -iu "$FRAPPE_USER" env "PATH=${UV_BIN_DIR}:${NODE_BIN_DIR:-}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" bash -c "$1"
}
# `bench build` / supervisor restarts touch root-owned paths — same reasoning
# as install.sh's as_root_sh.
as_root_sh() {
  env "PATH=${UV_BIN_DIR}:${NODE_BIN_DIR:-}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" bash -c "$1"
}

[[ -x "$BENCH_BIN" ]] || die "bench not found at ${BENCH_BIN} — is install.sh's uv setup actually on this box?"

log "Resolving the frappe user's nvm-installed node ${NODE_MAJOR} (needed to run npm/yarn as ${FRAPPE_USER})"
# Merely sourcing nvm.sh does NOT put any node version on PATH — nvm only
# does that on an explicit `nvm use`. Skipping this step (as an earlier
# version of this script did) silently falls through to whatever `node`
# happens to be first on the login shell's plain PATH (e.g. an apt-installed
# system node), which is exactly how a stray v22 got picked up instead of
# the v24 install.sh set up — the frappe/yarn build then fails engine checks.
# Primary: take the newest installed v${NODE_MAJOR}.x straight from nvm's
# versions dir — no nvm.sh sourcing, so it can't hit the empty-$HOME-under-
# sudo problem install.sh documents (that failure used to fall through to the
# system /usr/bin/node v22, and posawesome's `bench build` then died on
# frappe's "engine node >=24" check).
NODE_BIN_DIR="$(ls -d "${FRAPPE_HOME}/.nvm/versions/node/v${NODE_MAJOR}."*/bin 2>/dev/null | sort -V | tail -1 || true)"
if [[ -z "$NODE_BIN_DIR" || ! -x "${NODE_BIN_DIR}/node" ]]; then
  # Fallback: ask nvm, with the absolute nvm.sh path baked in (same as install.sh).
  NODE_BIN_DIR="$(as_frappe bash -c "NVM_DIR='${FRAPPE_HOME}/.nvm'; . '${FRAPPE_HOME}/.nvm/nvm.sh'; nvm use ${NODE_MAJOR} >/dev/null 2>&1 && dirname \"\$(command -v node)\"" 2>/dev/null || true)"
fi
[[ -n "$NODE_BIN_DIR" && -x "${NODE_BIN_DIR}/node" ]] || die "Node ${NODE_MAJOR} not found under ${FRAPPE_HOME}/.nvm/versions/node — install it as ${FRAPPE_USER}: nvm install ${NODE_MAJOR} && nvm alias default ${NODE_MAJOR}"
RESOLVED_NODE_VERSION="$(as_frappe_sh "node --version")"
log "Using node ${RESOLVED_NODE_VERSION} from ${NODE_BIN_DIR}"
# Hard stop (not a warning): every build below (frappe/posawesome assets via
# yarn, the React frontend via npm) requires node >= ${NODE_MAJOR}.
[[ "$RESOLVED_NODE_VERSION" == v${NODE_MAJOR}.* ]] || die "PATH still resolves node ${RESOLVED_NODE_VERSION} (expected v${NODE_MAJOR}.x from ${NODE_BIN_DIR})."
for tool in yarn npm; do
  as_frappe_sh "command -v ${tool} >/dev/null" || as_frappe_sh "npm install -g ${tool} --silent" || true
done

# ================================= A-pre. Repair duplicate custom fields
# ERPNext v16 ships fields micromax used to add itself (Sales Order.incoterm,
# Item.country_of_origin, ...). A site that got micromax's Custom Field before
# the upgrade keeps BOTH, and Frappe then refuses any later Custom Field save on
# that doctype — e.g. posawesome's install-app fixtures fail with
# "Sales Order: Fieldname incoterm appears multiple times". Removes only the
# stray Custom Field record (NOT the DB column — the native field uses the same
# column, so existing values stay). Idempotent: no duplicates -> no-op.
if [[ "$UPDATE_BACKEND" == "1" ]]; then
  log "A-pre. Removing Custom Fields that duplicate a native field (e.g. Sales Order.incoterm)"
  FIX_PY="$(mktemp "${TMPDIR:-/tmp}/micromax_dupfix.XXXXXX.py")"
  cat > "$FIX_PY" <<'FIXEOF'
import frappe
dups = frappe.db.sql("""
    select cf.name, cf.dt, cf.fieldname from `tabCustom Field` cf
    where exists (select 1 from `tabDocField` df
                  where df.parent = cf.dt and df.fieldname = cf.fieldname and df.parenttype = 'DocType')
""", as_dict=True)
for d in dups:
    # frappe.db.delete, not delete_doc: CustomField.on_trash would drop the shared column.
    frappe.db.delete("Custom Field", {"name": d.name})
    print("removed duplicate Custom Field:", d.name)
frappe.db.commit()
for dt in {d.dt for d in dups}:
    frappe.clear_cache(doctype=dt)
print("duplicate custom fields removed:", len(dups))
FIXEOF
  chmod 644 "$FIX_PY"; chown "${FRAPPE_USER}:${FRAPPE_USER}" "$FIX_PY"
  as_frappe_sh "cd '$BENCH_DIR' && echo \"exec(open('${FIX_PY}').read(), {})\" | '$BENCH_BIN' --site '$SITE_NAME' console" \
    || warn "Duplicate-field repair failed — if install-app/migrate then fails with 'appears multiple times', delete that Custom Field by hand."
  rm -f "$FIX_PY"
fi

# ================================================== A0. New bench apps
EXTRA_APPS_DONE=()
if [[ "$UPDATE_BACKEND" != "1" || "$UPDATE_EXTRA_APPS" != "1" ]]; then
  log "A0. Skipping new-app install (UPDATE_BACKEND=${UPDATE_BACKEND}, UPDATE_EXTRA_APPS=${UPDATE_EXTRA_APPS})"
else
  A0_INSTALLED_APPS="$(as_frappe_sh "cd '$BENCH_DIR' && '$BENCH_BIN' --site '$SITE_NAME' list-apps" 2>/dev/null | awk '{print $1}' || true)"
  for app in "${EXTRA_APPS[@]}"; do
    APP_DIR="${BENCH_DIR}/apps/${app}"
    if [[ -d "$APP_DIR" ]]; then
      log "A0. '${app}' already fetched — pulling latest ${EXTRA_APP_BRANCH[$app]}"
      # Use whichever remote points at the configured repo (bench get-app names
      # it 'upstream'); add 'origin' if none does.
      REMOTE="$(as_frappe git -C "$APP_DIR" remote -v | awk -v u="${EXTRA_APP_REPO[$app]}" '$2==u {print $1; exit}')"
      if [[ -z "$REMOTE" ]]; then
        if as_frappe git -C "$APP_DIR" remote get-url origin >/dev/null 2>&1; then
          as_frappe git -C "$APP_DIR" remote set-url origin "${EXTRA_APP_REPO[$app]}"
        else
          as_frappe git -C "$APP_DIR" remote add origin "${EXTRA_APP_REPO[$app]}"
        fi
        REMOTE=origin
      fi
      # Build output tracked in git (e.g. education's public/frontend/index.html) shows up as "local changes";
      # the forced checkout below resets it, so the app is rebuilt afterwards even if the commit is the same.
      APP_DIRTY=0
      if [[ -n "$(as_frappe git -C "$APP_DIR" status --porcelain)" ]]; then
        APP_DIRTY=1
        warn "'${APP_DIR}' has local changes — the reset below DISCARDS them (the app is rebuilt afterwards)."
      fi
      APP_BEFORE="$(as_frappe git -C "$APP_DIR" rev-parse HEAD)"
      as_frappe git -C "$APP_DIR" fetch "$REMOTE" "${EXTRA_APP_BRANCH[$app]}" \
        || die "Could not fetch ${EXTRA_APP_BRANCH[$app]} of ${EXTRA_APP_REPO[$app]}."
      as_frappe git -C "$APP_DIR" checkout -f -B "${EXTRA_APP_BRANCH[$app]}" "${REMOTE}/${EXTRA_APP_BRANCH[$app]}"
      APP_AFTER="$(as_frappe git -C "$APP_DIR" rev-parse HEAD)"
      if [[ "$APP_BEFORE" != "$APP_AFTER" || "$APP_DIRTY" == "1" ]] || ! grep -qx "$app" <<<"$A0_INSTALLED_APPS"; then
        # Also on a first install: a previous run's get-app may have cloned the
        # app and then died in its asset build (e.g. wrong node), leaving code
        # that is already "latest" but never built / pip-installed.
        log "'${app}' at ${APP_AFTER:0:8} (was ${APP_BEFORE:0:8}), not yet built/installed or changed — installing python deps and building assets"
        grep -qx "$app" "${BENCH_DIR}/sites/apps.txt" || echo "$app" | as_frappe tee -a "${BENCH_DIR}/sites/apps.txt" >/dev/null
        as_frappe_sh "cd '$BENCH_DIR' && '$BENCH_BIN' setup requirements --python '${app}'" || warn "bench setup requirements for '${app}' failed — check its pyproject dependencies."
        as_frappe_sh "cd '$BENCH_DIR' && '$BENCH_BIN' build --app '${app}'"
      else
        log "'${app}' already at latest (${APP_AFTER:0:8})"
      fi
    else
      log "A0. Fetching new app '${app}' (${EXTRA_APP_REPO[$app]} @ ${EXTRA_APP_BRANCH[$app]}) — installs deps and builds its assets, takes a few minutes"
      as_frappe_sh "cd '$BENCH_DIR' && '$BENCH_BIN' get-app --branch '${EXTRA_APP_BRANCH[$app]}' '${EXTRA_APP_REPO[$app]}'"
    fi

    if grep -qx "$app" <<<"$A0_INSTALLED_APPS"; then
      log "'${app}' already installed on site '${SITE_NAME}'"
    else
      if [[ "$SKIP_BACKUP" != "1" ]]; then
        log "Backing up '${SITE_NAME}' before installing '${app}'"
        as_frappe_sh "cd '$BENCH_DIR' && '$BENCH_BIN' --site '$SITE_NAME' backup" \
          || die "Backup failed — not installing '${app}' (re-run with SKIP_BACKUP=1 to accept the risk)."
      fi
      log "Installing '${app}' on site '${SITE_NAME}'"
      as_frappe_sh "cd '$BENCH_DIR' && '$BENCH_BIN' --site '$SITE_NAME' install-app '${app}'"
    fi
    EXTRA_APPS_DONE+=("$app")
  done

  # Bench apps this tenant's site should have but doesn't yet (SITE_APPS) — installed as they are,
  # not pulled (they are shared with the other sites; updating them is a bench-wide decision).
  A0_INSTALLED_APPS="$(as_frappe_sh "cd '$BENCH_DIR' && '$BENCH_BIN' --site '$SITE_NAME' list-apps" 2>/dev/null | awk '{print $1}' || true)"
  A0_BACKED_UP=0
  for app in "${SITE_APP_LIST[@]}"; do
    grep -qx "$app" <<<"$A0_INSTALLED_APPS" && continue
    if [[ ! -d "${BENCH_DIR}/apps/${app}" ]]; then
      warn "A0. '${app}' is in SITE_APPS for '${TENANT}' but not in the bench — fetch it first (install-production.sh TENANT=${TENANT}, or add it to EXTRA_APPS_LIST)."
      continue
    fi
    if [[ "$SKIP_BACKUP" != "1" && "$A0_BACKED_UP" == "0" ]]; then
      log "Backing up '${SITE_NAME}' before installing missing site apps"
      as_frappe_sh "cd '$BENCH_DIR' && '$BENCH_BIN' --site '$SITE_NAME' backup" \
        || die "Backup failed — not installing '${app}' (re-run with SKIP_BACKUP=1 to accept the risk)."
      A0_BACKED_UP=1
    fi
    log "A0. Installing bench app '${app}' on site '${SITE_NAME}'"
    as_frappe_sh "cd '$BENCH_DIR' && '$BENCH_BIN' --site '$SITE_NAME' install-app '${app}'"
    EXTRA_APPS_DONE+=("$app")
  done
fi

# Backup, migrate, clear cache, restart — the tail of section A for every tenant.
migrate_site() {
  if [[ "$SKIP_BACKUP" == "1" ]]; then
    warn "SKIP_BACKUP=1 — migrating without a database backup."
  else
    log "Backing up the '${SITE_NAME}' database before migrating (bench backup; files land in ${BENCH_DIR}/sites/${SITE_NAME}/private/backups)"
    as_frappe_sh "cd '$BENCH_DIR' && '$BENCH_BIN' --site '$SITE_NAME' backup" \
      || die "Pre-migrate backup failed — not migrating. Fix that (or re-run with SKIP_BACKUP=1 if you accept the risk)."
  fi

  # A failed migrate aborts here (set -e), on purpose: the frontend is not
  # deployed on top of a half-migrated backend, and the backup above is the way back.
  log "Running bench migrate for site '${SITE_NAME}'"
  as_frappe_sh "cd '$BENCH_DIR' && '$BENCH_BIN' --site '$SITE_NAME' migrate"

  if [[ "${1:-}" == "--build-micromax" ]]; then
    log "Rebuilding backend app assets (bench build --app ${MICROMAX_APP})"
    as_frappe_sh "cd '$BENCH_DIR' && '$BENCH_BIN' build --app '${MICROMAX_APP}'"
  fi

  log "Clearing cache and restarting bench workers/web processes"
  as_frappe_sh "cd '$BENCH_DIR' && '$BENCH_BIN' --site '$SITE_NAME' clear-cache"
  as_root_sh "supervisorctl restart all" || warn "supervisorctl restart failed — restart the bench's supervisor group manually."
}

# ===================================================== A. Backend app update
if [[ "$REMOVE_APPAREL" == "1" ]]; then
  log "A. Skipping standalone backend update — section C (REMOVE_APPAREL=1) pulls, migrates and restarts it"
elif [[ "$UPDATE_BACKEND" != "1" ]]; then
  log "A. Skipping backend update (UPDATE_BACKEND=0)"
else
  MICROMAX_DIR="${BENCH_DIR}/apps/${MICROMAX_APP}"
  log "A. Updating backend for tenant '${TENANT}' (site ${SITE_NAME})"

  # `|| true`: if list-apps itself fails we just can't confirm the install,
  # which the check below reports — not a reason to abort the whole deploy.
  A_INSTALLED_APPS="$(as_frappe_sh "cd '$BENCH_DIR' && '$BENCH_BIN' --site '$SITE_NAME' list-apps" 2>/dev/null | awk '{print $1}' || true)"

  if [[ " ${SITE_APP_LIST[*]} " != *" ${MICROMAX_APP} "* ]]; then
    log "Tenant '${TENANT}' doesn't use '${MICROMAX_APP}' — migrating site '${SITE_NAME}' for the apps it has"
    migrate_site
  elif [[ ! -d "$MICROMAX_DIR" ]] || ! grep -qx "$MICROMAX_APP" <<<"$A_INSTALLED_APPS"; then
    warn "'${MICROMAX_APP}' isn't installed on site '${SITE_NAME}' — skipping the backend update. The frontend below expects the micromax backend changes; if this box still runs '${APPAREL_APP}', run once with REMOVE_APPAREL=1."
  else
    if ! as_frappe git -C "$MICROMAX_DIR" remote get-url origin >/dev/null 2>&1; then
      # An app installed with `bench get-app <local path>` keeps its source as
      # 'upstream' and has no 'origin', so there is nothing to pull from. Point
      # 'origin' at the configured repo (a plain, local config change).
      warn "'${MICROMAX_DIR}' has no git 'origin' remote (remotes: $(as_frappe git -C "$MICROMAX_DIR" remote | tr '\n' ' ')) — adding origin = ${MICROMAX_REPO}"
      as_frappe git -C "$MICROMAX_DIR" remote add origin "$MICROMAX_REPO" \
        || die "Could not add the 'origin' remote to ${MICROMAX_DIR}."
    fi
    if [[ -n "$(as_frappe git -C "$MICROMAX_DIR" status --porcelain)" ]]; then
      warn "'${MICROMAX_DIR}' has local, uncommitted changes — the reset below DISCARDS them:"
      as_frappe git -C "$MICROMAX_DIR" status --short
    fi
    A_BEFORE_SHA="$(as_frappe git -C "$MICROMAX_DIR" rev-parse HEAD)"
    as_frappe git -C "$MICROMAX_DIR" fetch origin "$MICROMAX_BRANCH" \
      || die "Could not fetch ${MICROMAX_BRANCH} from origin ($(as_frappe git -C "$MICROMAX_DIR" remote get-url origin)). If the repo is private, this box needs credentials for it; also confirm the branch has been pushed."
    as_frappe git -C "$MICROMAX_DIR" checkout "$MICROMAX_BRANCH"
    as_frappe git -C "$MICROMAX_DIR" reset --hard "origin/${MICROMAX_BRANCH}"
    A_AFTER_SHA="$(as_frappe git -C "$MICROMAX_DIR" rev-parse HEAD)"
    if [[ "$A_BEFORE_SHA" == "$A_AFTER_SHA" ]]; then
      log "'${MICROMAX_APP}' already at latest ${MICROMAX_BRANCH} (${A_AFTER_SHA:0:8}) — migrating anyway (safe, and picks up any not-yet-applied changes)"
    else
      log "'${MICROMAX_APP}' updated ${A_BEFORE_SHA:0:8} -> ${A_AFTER_SHA:0:8}"
    fi

    migrate_site --build-micromax
  fi
fi

# ======================================== A2. DB indexes + data backfills
if [[ "$UPDATE_BACKEND" != "1" || "$RUN_BACKFILLS" != "1" ]]; then
  log "A2. Skipping DB indexes / data backfills (UPDATE_BACKEND=${UPDATE_BACKEND}, RUN_BACKFILLS=${RUN_BACKFILLS})"
elif ! grep -qx "$MICROMAX_APP" <<<"$(as_frappe_sh "cd '$BENCH_DIR' && '$BENCH_BIN' --site '$SITE_NAME' list-apps" 2>/dev/null | awk '{print $1}' || true)"; then
  warn "A2. '${MICROMAX_APP}' isn't installed on '${SITE_NAME}' — skipping indexes/backfills."
else
  log "A2. GL Entry report indexes, BOM category / Production Plan backfills, HR indexes + shift grace + smoke test"
  A2_PY="$(mktemp "${TMPDIR:-/tmp}/micromax_update.XXXXXX.py")"
  # Settings for the python below (the heredoc is quoted, so nothing in it expands).
  printf 'SITE_NAME = %s\nSHIFT_GRACE_MINUTES = %d\nSHIFT_GRACE_FORCE = %d\n' "'${SITE_NAME}'" "$SHIFT_GRACE_MINUTES" "$SHIFT_GRACE_FORCE" > "$A2_PY"
  cat >> "$A2_PY" <<'A2EOF'
import frappe

# GL Entry covering indexes for the React financial reports / accounts
# dashboard (micromax.financial_insights, micromax.dashboards). Adding an
# index to a large tabGL Entry takes a while but runs once — skipped if present.
INDEXES = {
    "micromax_gl_analysis": ["company", "posting_date", "is_cancelled", "voucher_type", "account", "debit", "credit"],
    "micromax_gl_party": ["company", "posting_date", "is_cancelled", "voucher_no", "account", "party_type", "party", "debit", "credit"],
}
for name, cols in INDEXES.items():
    if frappe.db.sql("show index from `tabGL Entry` where Key_name=%s", name):
        print("index exists:", name)
        continue
    print("creating index", name, "...")
    frappe.db.sql_ddl("alter table `tabGL Entry` add index `%s` (%s)" % (name, ", ".join("`%s`" % c for c in cols)))
    print("index created:", name)

# BOM.bom_category — set on save by micromax.mfg_logic.bom_before_validate;
# fill it for BOMs saved before the field existed (direct update, so
# submitted BOMs aren't re-validated or re-costed).
from micromax.mfg_logic import bom_category
if frappe.db.has_column("BOM", "bom_category"):
    rows = frappe.db.sql("select name, item from `tabBOM` where ifnull(bom_category, '') = ''", as_dict=True)
    for r in rows:
        frappe.db.set_value("BOM", r.name, "bom_category", bom_category(r.item), update_modified=False)
    frappe.db.commit()
    print("BOM categories filled:", len(rows))

# Production Plan raw materials — only plans with an empty table.
from micromax.production_plan import backfill
print("Production Plan raw materials:", backfill())
frappe.db.commit()

# ---- HR -----------------------------------------------------------------
frappe.set_user("Administrator")
from micromax.install import add_hr_indexes
add_hr_indexes()  # idempotent; migrate's before_migrate hook normally did it already
frappe.db.commit()
print("Employee Checkin time indexes:", sorted({i[2] for i in frappe.db.sql("show index from `tabEmployee Checkin`") if i[2] in ("time_index", "employee_time_index")}))
print("Branch location fields:", [f for f in ("branch_address", "city", "latitude", "longitude") if frappe.get_meta("Branch").has_field(f)])

# One-time grace period for late check-in / early check-out on every shift.
MARKER = "micromax_shift_grace_minutes"
done_before = frappe.db.get_default(MARKER)
if not SHIFT_GRACE_MINUTES:
    print("Shift grace: skipped (SHIFT_GRACE_MINUTES=0)")
elif done_before and not SHIFT_GRACE_FORCE:
    print(f"Shift grace: already applied once ({done_before} min) — leaving shifts as they are (SHIFT_GRACE_FORCE=1 to re-apply)")
else:
    from micromax.hr_insights import set_shift_grace
    r = set_shift_grace(SHIFT_GRACE_MINUTES)
    frappe.db.set_default(MARKER, str(SHIFT_GRACE_MINUTES))
    frappe.db.commit()
    print(f"Shift grace: {SHIFT_GRACE_MINUTES} min late check-in / early check-out set on {len(r['updated'])} shift types")

# Smoke test — the endpoints behind the Attendance / Leave / Shifts / Setup pages.
from frappe.utils import add_days, getdate
from micromax import hr_insights as h
company = frappe.defaults.get_global_default("company")
today = getdate()
start = today.replace(day=1)
for label, fn in (
    ("setup_status", lambda: f"{len(h.setup_status(company)['steps'])} checks"),
    ("shift_overview", lambda: f"{len(h.shift_overview(str(today), company)['shifts'])} shift types"),
    ("attendance_overview", lambda: f"{h.attendance_overview(str(start), str(today), company)['records']} records this month"),
    ("leave_overview", lambda: f"{len(h.leave_overview(str(start), str(add_days(today, 30)), company)['daily'])} days"),
):
    try:
        print(f"HR endpoint {label}: OK ({fn()})")
    except Exception as e:
        print(f"HR endpoint {label}: FAILED — {e!r}")
print("A2 DONE")
A2EOF
  chmod 644 "$A2_PY"; chown "${FRAPPE_USER}:${FRAPPE_USER}" "$A2_PY"
  as_frappe_sh "cd '$BENCH_DIR' && echo \"exec(open('${A2_PY}').read(), {})\" | '$BENCH_BIN' --site '$SITE_NAME' console" \
    || warn "A2 backfill script failed — the app still works (reports are just slower / BOM filter may miss old BOMs). Re-run later."
  rm -f "$A2_PY"
  as_frappe_sh "cd '$BENCH_DIR' && '$BENCH_BIN' --site '$SITE_NAME' clear-cache"
fi

# ======================================== A4. Daily demo data (micromax.demo_daily)
# The tenant file's DEMO_DAILY_COMPANY turns on the 23:00 daily generator for this site (site_config
# demo_daily_company); empty = off (the school tenant). DEMO_DAILY_RUN=1 also generates the missing days now
# (catch-up up to today, incl. a month's payroll that never ran) instead of waiting for tonight.
if [[ "$UPDATE_BACKEND" == "1" && -n "${DEMO_DAILY_COMPANY:-}" ]] && \
   grep -qx "$MICROMAX_APP" <<<"$(as_frappe_sh "cd '$BENCH_DIR' && '$BENCH_BIN' --site '$SITE_NAME' list-apps" 2>/dev/null | awk '{print $1}' || true)"; then
  log "A4. Daily demo data on '${SITE_NAME}' for company '${DEMO_DAILY_COMPANY}' (cron 23:00)"
  as_frappe_sh "cd '$BENCH_DIR' && '$BENCH_BIN' --site '$SITE_NAME' set-config demo_daily_company '${DEMO_DAILY_COMPANY}'"
  if [[ "${DEMO_DAILY_RUN:-0}" == "1" ]]; then
    log "A4. Generating the missing days now (can take a few minutes per day)"
    as_frappe_sh "cd '$BENCH_DIR' && '$BENCH_BIN' --site '$SITE_NAME' execute micromax.demo_daily.run --kwargs \"{'company': '${DEMO_DAILY_COMPANY}'}\"" \
      || warn "A4. Daily demo run failed — see the output above; it retries tonight at 23:00."
  fi
  as_frappe_sh "cd '$BENCH_DIR' && '$BENCH_BIN' --site '$SITE_NAME' execute micromax.demo_daily.status --kwargs \"{'company': '${DEMO_DAILY_COMPANY}'}\"" || true
fi

# ===================================== A3. Desk domain HTTPS kept by bench
# After `certbot --nginx -d <desk domain>`, store the certificate in the site's domain mapping so the
# next `bench setup nginx` keeps HTTPS (lib/react-nginx.sh: map_desk_domain). No-op once done.
if [[ -n "${BACKEND_DOMAIN:-}" ]]; then
  if [[ "$(map_desk_domain "$BACKEND_DOMAIN")" == "changed" ]]; then
    log "A3. ${BACKEND_DOMAIN}: certificate stored in site '${SITE_NAME}' domains — regenerating bench nginx"
    as_root_sh "cd '$BENCH_DIR' && '$BENCH_BIN' setup nginx --yes"
    if nginx -t; then systemctl reload nginx; else warn "nginx -t failed after bench setup nginx — check /etc/nginx/conf.d/frappe-bench.conf"; fi
  else
    log "A3. ${BACKEND_DOMAIN}: desk domain mapping current"
  fi
fi

# ======================================================== B. Frontend deploy
if [[ -z "$FRONTEND_REPO" ]]; then
  log "B/B2. Tenant '${TENANT}' has no React frontend (FRONTEND_REPO empty) — skipping frontend deploy"
else
log "B. Updating React frontend (${FRONTEND_DIR})"
if [[ ! -d "$FRONTEND_DIR" ]]; then
  log "Frontend not cloned yet — cloning ${FRONTEND_REPO}"
  as_frappe git clone --branch "$FRONTEND_BRANCH" "$FRONTEND_REPO" "$FRONTEND_DIR"
else
  BEFORE_SHA="$(as_frappe git -C "$FRONTEND_DIR" rev-parse HEAD)"
  as_frappe git -C "$FRONTEND_DIR" fetch origin "$FRONTEND_BRANCH"
  as_frappe git -C "$FRONTEND_DIR" checkout "$FRONTEND_BRANCH"
  as_frappe git -C "$FRONTEND_DIR" reset --hard "origin/${FRONTEND_BRANCH}"
  AFTER_SHA="$(as_frappe git -C "$FRONTEND_DIR" rev-parse HEAD)"
  if [[ "$BEFORE_SHA" == "$AFTER_SHA" ]]; then
    log "Frontend already at latest ${FRONTEND_BRANCH} (${AFTER_SHA:0:8})"
  else
    log "Frontend updated ${BEFORE_SHA:0:8} -> ${AFTER_SHA:0:8}"
  fi
fi

if [[ ! -f "${FRONTEND_DIR}/.env.production" ]]; then
  log "Writing ${FRONTEND_DIR}/.env.production (same-origin; the build is site-agnostic — nginx picks the site)"
  as_frappe bash -c "printf 'VITE_FRAPPE_URL=\nVITE_ENABLE_SOCKET=true\n' > '${FRONTEND_DIR}/.env.production'"
fi

# Tenants can share one build (FRONTEND_DIR); with TENANT=all the second tenant finds it already built.
FRONTEND_SHA="$(as_frappe git -C "$FRONTEND_DIR" rev-parse HEAD)"
if [[ "$FORCE_FRONTEND_BUILD" != "1" && "$(cat "${FRONTEND_DIR}/dist/.built-sha" 2>/dev/null)" == "$FRONTEND_SHA" ]]; then
  log "dist/ already built from ${FRONTEND_SHA:0:8} — not rebuilding (FORCE_FRONTEND_BUILD=1 to force)"
else
  log "Installing dependencies and building (npm ci && npm run build)"
  as_frappe_sh "cd '${FRONTEND_DIR}' && npm ci --silent && npm run build && echo '${FRONTEND_SHA}' > dist/.built-sha"
fi

log "Re-applying nginx (www-data) read access to the new build output"
chmod -R o+rx "$FRAPPE_HOME"

log "Frontend deployed — nginx serves ${FRONTEND_DIR}/dist directly off disk, no reload needed."

# ================================================ B2. React nginx block
# Each tenant's React domain needs its own server block that pins its site (lib/react-nginx.sh).
# Written when missing (a tenant that just got a React app), and regenerated once from blocks made by
# older installers — those lacked the /app + /desk + /printview desk passthrough (now included), the
# site header on /socket.io (realtime fell back to the bench's default site), and /files served off disk
# with /protected for private files (item photos returned 404 through gunicorn).
REACT_NGINX_CONF="${REACT_NGINX_CONF:-/etc/nginx/conf.d/${SITE_NAME}-react.conf}"
if [[ -f "$REACT_NGINX_CONF" ]] && grep -q "Generated by react-nginx.sh" "$REACT_NGINX_CONF" && grep -q "(app|desk|printview)(/" "$REACT_NGINX_CONF" && grep -q "location /protected/" "$REACT_NGINX_CONF"; then
  log "B2. ${REACT_NGINX_CONF} is current"
else
  [[ -f "$REACT_NGINX_CONF" ]] && log "B2. Regenerating ${REACT_NGINX_CONF} from the shared template" \
    || log "B2. No React nginx block for '${SITE_NAME}' yet — writing ${REACT_NGINX_CONF} (${FRONTEND_DOMAIN})"
  unmap_frontend_domain_from_site
  write_react_nginx_conf >/dev/null
  if nginx -t; then
    systemctl reload nginx
    restore_react_https
  else
    warn "nginx -t failed with the new block — restoring the previous one (if any)."
    LAST_BAK="$(ls -t "${REACT_NGINX_CONF}".bak.* 2>/dev/null | head -1 || true)"
    if [[ -n "$LAST_BAK" ]]; then cp "$LAST_BAK" "$REACT_NGINX_CONF"; else rm -f "$REACT_NGINX_CONF"; fi
    nginx -t && systemctl reload nginx
  fi
  [[ -n "${REACT_HAD_SSL:-}" ]] || warn "B2. ${FRONTEND_DOMAIN} is HTTP only — once DNS resolves: sudo certbot --nginx -d ${FRONTEND_DOMAIN}"
fi
fi

# =============================================== C. apparel -> micromax swap
if [[ "$REMOVE_APPAREL" != "1" ]]; then
  log "C. Skipping apparel -> micromax app swap (set REMOVE_APPAREL=1 to run it)"
else
  log "C. Swapping backend app: removing '${APPAREL_APP}', installing '${MICROMAX_APP}'"

  INSTALLED_APPS="$(as_frappe_sh "cd '$BENCH_DIR' && '$BENCH_BIN' --site '$SITE_NAME' list-apps" 2>/dev/null | awk '{print $1}')"

  if [[ -d "${BENCH_DIR}/apps/${APPAREL_APP}" ]]; then
    warn "About to permanently delete all '${APPAREL_APP}' data on site '${SITE_NAME}'. This cannot be undone (a pre-uninstall site backup is taken automatically, unless SKIP_APPAREL_BACKUP=1)."

    # Step 1 (site-level, does the actual data deletion): `uninstall-app` is
    # the frappe-core command that drops the app's doctypes/tables from the
    # site's database. It's NOT a hard failure when it can't proceed — it
    # prints a yellow warning and exits 0 (no-op) if the app isn't installed,
    # or if some other installed app declares `apparel` in its own
    # `required_apps` hook — so we capture its output and react to that
    # second case explicitly instead of silently trusting a clean exit code.
    log "Uninstalling '${APPAREL_APP}' from site '${SITE_NAME}' (frappe core: bench --site uninstall-app)"
    NO_BACKUP_FLAG=""
    [[ "${SKIP_APPAREL_BACKUP:-0}" == "1" ]] && NO_BACKUP_FLAG="--no-backup"
    UNINSTALL_OUT="$(as_frappe_sh "cd '$BENCH_DIR' && '$BENCH_BIN' --site '$SITE_NAME' uninstall-app '${APPAREL_APP}' --yes ${NO_BACKUP_FLAG}" 2>&1)" \
      || die "'bench --site ${SITE_NAME} uninstall-app ${APPAREL_APP}' failed:\n${UNINSTALL_OUT}"
    echo "$UNINSTALL_OUT"

    if grep -q "is a dependency of" <<<"$UNINSTALL_OUT"; then
      BLOCKER="$(grep -oP "is a dependency of \K[^.]+" <<<"$UNINSTALL_OUT" | head -1)"
      warn "'${APPAREL_APP}' is declared in '${BLOCKER}'s required_apps hook, so bench's normal safety check refused to remove it. Retrying with --force, which only skips that check — the actual data deletion is identical either way. If '${BLOCKER}' genuinely needs apparel at runtime, expect it to break until it's updated/removed too."
      UNINSTALL_OUT="$(as_frappe_sh "cd '$BENCH_DIR' && '$BENCH_BIN' --site '$SITE_NAME' uninstall-app '${APPAREL_APP}' --yes --force ${NO_BACKUP_FLAG}" 2>&1)" \
        || die "Forced uninstall also failed:\n${UNINSTALL_OUT}"
      echo "$UNINSTALL_OUT"
    fi

    # NOTE: we deliberately do NOT re-check `bench --site list-apps` here.
    # That command (and `remove-app`'s own "is it installed anywhere" guard,
    # below) reads the `Installed Applications` doctype's cached child table
    # — a bookkeeping record that `frappe.get_installed_apps()` (the check
    # `uninstall-app` itself just used, above) does not always keep in sync.
    # A "not installed" or "Uninstalled App" message above is the real,
    # authoritative signal that apparel's data is gone; trust that instead.

    # Step 2 (bench-level, deletes the app's code): `remove-app` only takes
    # --no-backup/--force (no --yes). Its own "installed anywhere?" guard
    # uses that same stale cache, so it can refuse even when step 1 already
    # confirmed there's nothing left to uninstall — in that specific case
    # (error text "is installed on site"), retry with --force, which just
    # skips this redundant guard and deletes the already-uninstalled app's
    # source. Default behavior archives it under archived/apps/ rather than
    # hard-deleting, a nice free rollback path.
    log "Removing app '${APPAREL_APP}' from the bench (deletes apps/${APPAREL_APP}, updates apps.txt)"
    if ! REMOVE_OUT="$(as_frappe_sh "cd '$BENCH_DIR' && '$BENCH_BIN' remove-app '${APPAREL_APP}'" 2>&1)"; then
      echo "$REMOVE_OUT"
      if grep -q "is installed on site" <<<"$REMOVE_OUT"; then
        warn "'bench remove-app' is going by the stale Installed Applications cache, not the real check uninstall-app already passed. Retrying with --force."
        as_frappe_sh "cd '$BENCH_DIR' && '$BENCH_BIN' remove-app '${APPAREL_APP}' --force" \
          || die "'bench remove-app ${APPAREL_APP} --force' also failed — resolve manually before re-running with REMOVE_APPAREL=1."
      else
        die "'bench remove-app ${APPAREL_APP}' failed — resolve manually before re-running with REMOVE_APPAREL=1."
      fi
    else
      echo "$REMOVE_OUT"
    fi
  else
    log "'${APPAREL_APP}' not present at apps/${APPAREL_APP} — already removed, skipping"
  fi

  MICROMAX_HAS_ORIGIN=0
  if [[ -d "${BENCH_DIR}/apps/${MICROMAX_APP}" ]] \
    && as_frappe git -C "${BENCH_DIR}/apps/${MICROMAX_APP}" remote get-url origin >/dev/null 2>&1; then
    MICROMAX_HAS_ORIGIN=1
  fi

  if [[ -d "${BENCH_DIR}/apps/${MICROMAX_APP}" && "$MICROMAX_HAS_ORIGIN" == "1" ]]; then
    log "'${MICROMAX_APP}' already fetched — pulling latest instead of re-cloning"
    as_frappe git -C "${BENCH_DIR}/apps/${MICROMAX_APP}" fetch origin "$MICROMAX_BRANCH"
    as_frappe git -C "${BENCH_DIR}/apps/${MICROMAX_APP}" checkout "$MICROMAX_BRANCH"
    as_frappe git -C "${BENCH_DIR}/apps/${MICROMAX_APP}" reset --hard "origin/${MICROMAX_BRANCH}"
  else
    if [[ -d "${BENCH_DIR}/apps/${MICROMAX_APP}" ]]; then
      # A directory exists but isn't a plain clone with 'origin' set — most
      # likely a leftover from a `bench get-app` that cloned the app but then
      # failed later (e.g. the asset-build step). Safe to wipe and re-fetch
      # cleanly, since (checked above/below) it isn't registered on the site
      # yet — there's no site data tied to this on-disk copy.
      if grep -qx "$MICROMAX_APP" <<<"$INSTALLED_APPS"; then
        die "'apps/${MICROMAX_APP}' exists without a git 'origin' remote, but '${MICROMAX_APP}' IS installed on site '${SITE_NAME}' — refusing to delete its code out from under a live install. Investigate manually (cd ${BENCH_DIR}/apps/${MICROMAX_APP} && git remote -v)."
      fi
      warn "'apps/${MICROMAX_APP}' exists but isn't a normal git clone (no 'origin' remote) — likely a partial fetch left over from an earlier failed run. Removing it and re-fetching cleanly."
      rm -rf "${BENCH_DIR}/apps/${MICROMAX_APP}"
    fi
    log "Fetching app '${MICROMAX_APP}' (${MICROMAX_BRANCH})"
    as_frappe_sh "cd '$BENCH_DIR' && '$BENCH_BIN' get-app --branch '${MICROMAX_BRANCH}' '${MICROMAX_REPO}'"
  fi

  if grep -qx "$MICROMAX_APP" <<<"$INSTALLED_APPS"; then
    log "'${MICROMAX_APP}' already installed on site '${SITE_NAME}' — skipping install-app"
  else
    log "Installing '${MICROMAX_APP}' on site '${SITE_NAME}'"
    as_frappe_sh "cd '$BENCH_DIR' && '$BENCH_BIN' --site '$SITE_NAME' install-app '${MICROMAX_APP}'"
  fi

  log "Running bench migrate for site '${SITE_NAME}'"
  as_frappe_sh "cd '$BENCH_DIR' && '$BENCH_BIN' --site '$SITE_NAME' migrate"

  log "Rebuilding backend app assets (bench build --app ${MICROMAX_APP})"
  as_frappe_sh "cd '$BENCH_DIR' && '$BENCH_BIN' build --app '${MICROMAX_APP}'"

  log "Clearing cache and restarting bench workers/web processes"
  as_frappe_sh "cd '$BENCH_DIR' && '$BENCH_BIN' --site '$SITE_NAME' clear-cache"
  as_root_sh "supervisorctl restart all" || warn "supervisorctl restart failed — restart the bench's supervisor group manually."
fi

# ==================================================================== Summary
log "Done."
cat <<EOF

  Backend:   $([[ "$REMOVE_APPAREL" == "1" ]] && echo "handled by the app swap (C)" || { [[ "$UPDATE_BACKEND" == "1" ]] && echo "'${MICROMAX_APP}' updated + migrated (A) — see any WARN above if it was skipped" || echo "not updated this run (UPDATE_BACKEND=0)"; })
  New apps:  ${EXTRA_APPS_DONE[*]:-none this run} (A0 — fetched/updated + installed on the site)
  Demo data: $([[ "$UPDATE_BACKEND" == "1" && -n "${DEMO_DAILY_COMPANY:-}" ]] && echo "daily at 23:00 for '${DEMO_DAILY_COMPANY}' (A4)$([[ "${DEMO_DAILY_RUN:-0}" == "1" ]] && echo ", caught up now")" || echo "off")
  Backfills: $([[ "$UPDATE_BACKEND" == "1" && "$RUN_BACKFILLS" == "1" ]] && echo "GL indexes, BOM categories, Production Plan raw materials (A2)" || echo "skipped")
  HR:        $([[ "$UPDATE_BACKEND" == "1" && "$RUN_BACKFILLS" == "1" ]] && echo "check-in indexes, shift grace ${SHIFT_GRACE_MINUTES} min (once per site unless SHIFT_GRACE_FORCE=1), endpoint smoke test — see A2 output" || echo "skipped")
  Frontend:  $([[ -n "$FRONTEND_REPO" ]] && echo "${FRONTEND_DIR} (rebuilt, served by nginx from dist/)" || echo "none for this tenant")
  Tenant:    ${TENANT} (${TENANT_FILE})
  Site:      ${SITE_NAME}
  Bench:     ${BENCH_DIR}
EOF
if [[ "$REMOVE_APPAREL" == "1" ]]; then
  cat <<EOF
  App swap:  '${APPAREL_APP}' removed, '${MICROMAX_APP}' installed and migrated.
EOF
else
  cat <<EOF
  App swap:  not run this time — re-run with REMOVE_APPAREL=1 when you're
             ready to permanently remove '${APPAREL_APP}' and switch to
             '${MICROMAX_APP}'.
EOF
fi
