#!/usr/bin/env bash
#
# dts_rebrand.sh — optional, standalone step AFTER the dts_* transfer:
#   1. merges the hik companies ("HIK", "HIK Unit02") into "MicroMax Erp Pvt Ltd."
#   2. moves every transaction date into fiscal year 2026-2027 (month and day kept)
#
# It rewrites data in place and cannot be undone except by restoring the backup
# it takes first (~/dts-backups). Dry-run by default: `bash dts_rebrand.sh` only
# reads and prints the plan; add --execute to apply.
#
# ---------------------------------------------------------------- 1. Company
# Every Link column that points at Company, Account, Cost Center, Warehouse or
# Department is found from the DocType/Custom Field metadata (about 700 columns)
# and re-pointed; Singles (tabSingles), tabDefaultValue and User Permissions are
# updated too. Then:
#   * Account, Cost Center, Department: names ending " - HIK" / " - HU" become
#     " - MEPL" (the target's abbreviation). Records that end up with the same
#     name are MERGED (the existing MicroMax record survives if there is one) —
#     ledger totals are unchanged because GL rows are only re-pointed. A merge
#     of groups with different root type / group-ness is refused.
#   * Warehouse and the "… Template" DocTypes are NOT merged: Bin and Stock
#     Ledger Entry keep a running balance per item+warehouse, so merging two
#     mills' warehouses would corrupt stock valuation. HIK's keep the plain name;
#     a clashing HIK Unit02 record gets the unit as a tag ("Stores Unit02 - MEPL").
#     A HIK warehouse that clashes with an EMPTY MicroMax default is merged into it.
#   * the two old Company records are deleted; nested-set trees are rebuilt.
#
# ------------------------------------------------------------------- 2. Dates
# Transaction tables = every submittable DocType, plus GL Entry, Stock Ledger
# Entry, Payment Ledger Entry, Employee Checkin, Inward/Outward Gate Pass,
# Work Order Downtime, Opportunity and Lead, and the child rows of those.
# Every DATE/DATETIME column in them except creation/modified is rewritten as
#     year := (month >= 7 ? 2026 : 2027)     — month, day and time kept,
# so a date from any year lands inside FY 2026-2027; Feb 29 becomes Feb 28.
# `fiscal_year` links become 2026-2027. The rule depends only on the value, so
# running it twice changes nothing. Ranges that straddle Jun 30 / Jul 1 would
# invert (from > to); those are repaired by pushing the end a year forward.
# Master data (Employee date of birth / joining, Fiscal Year, Holiday List, …)
# and free-text fields are not touched, nor are document NAMES: a Sales Invoice
# called ACC-SINV-2021-00001 keeps its name whatever its new date.
#
# CONSEQUENCE of collapsing several years into one: the same employee can have
# several attendance rows on one date, several salary slips in one month, and
# Stock Ledger Entry running balances no longer follow chronological order
# (Bin totals are unaffected). That is inherent to the request.
#
# Environment: REBRAND_COMPANY="MicroMax Erp Pvt Ltd."  REBRAND_FY=2026-2027
#              REBRAND_PARTS=company,dates   (either one, or both)
# Shared flags and other environment are documented in dts_setup.sh.

set -euo pipefail
[[ -n "${DTS_LIB_LOADED:-}" ]] || source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/dts_setup.sh"

read -r -d '' DTS_REBRAND_PY <<'PY' || true
import os, re, sys, collections
import MySQLdb, MySQLdb.cursors

mode, parts = sys.argv[1], set(sys.argv[2].split(","))
APPLY = mode == "apply"
DST, NEW, FY = os.environ["DST_DB"], os.environ["REBRAND_COMPANY"], os.environ["REBRAND_FY"]
kw = dict(user=os.environ["DB_USER"], passwd=os.environ["DB_PASSWORD"], db=DST, charset="utf8mb4",
          cursorclass=MySQLdb.cursors.DictCursor)
if os.environ.get("DB_HOST"):
    kw.update(host=os.environ["DB_HOST"], port=int(os.environ.get("DB_PORT") or 3306))
conn = MySQLdb.connect(**kw)
cur = conn.cursor()

def q(sql, a=()):
    cur.execute(sql, a); return list(cur.fetchall())
def x(sql, a=()):
    cur.execute(sql, a); return cur.rowcount
def say(*a):
    print(*a, flush=True)
def die(msg):
    say("ERROR:", msg); sys.exit(1)

x("SET SESSION sql_mode='NO_ENGINE_SUBSTITUTION', foreign_key_checks=0, unique_checks=0, innodb_lock_wait_timeout=900")

DT = {r["name"]: r for r in q("select name, issingle, istable, is_submittable, is_tree from tabDocType")}
TROWS = {r["t"]: (r["n"] or 0) for r in q("select table_name as t, table_rows as n from information_schema.tables where table_schema=%s", (DST,))}
_cols = {}
def cols(t):
    if t not in _cols:
        _cols[t] = {r["Field"]: r["Type"] for r in q(f"show columns from `{t}`")}
    return _cols[t]
def has_table(t):
    return t in TROWS

def link_columns(doctype):
    """(parent doctype, fieldname) for every Link field pointing at `doctype`, standard or custom."""
    out = set()
    for r in q("select parent p, fieldname f from tabDocField where fieldtype='Link' and options=%s", (doctype,)):
        out.add((r["p"], r["f"]))
    for r in q("select dt p, fieldname f from `tabCustom Field` where fieldtype='Link' and options=%s", (doctype,)):
        out.add((r["p"], r["f"]))
    res = []
    for p, f in sorted(out):
        d = DT.get(p)
        if not d:
            continue
        if d["issingle"]:
            res.append((p, f, "single"))
        elif has_table("tab" + p) and f in cols("tab" + p):
            res.append((p, f, "table"))
    return res

# ---------------------------------------------------------------------------- snapshot
SNAP_TABLES = ["GL Entry", "Sales Invoice", "Purchase Invoice", "Journal Entry", "Payment Entry", "Stock Ledger Entry",
               "Salary Slip", "Attendance", "Employee", "Purchase Order", "Sales Order", "Delivery Note",
               "Purchase Receipt", "Stock Entry", "Employee Checkin", "Leave Application", "Bin"]
def snapshot():
    s = {}
    for t in SNAP_TABLES:
        if has_table("tab" + t):
            s["rows " + t] = q(f"select count(*) c from `tab{t}`")[0]["c"]
    if has_table("tabGL Entry"):
        g = q("select round(sum(debit),2) d, round(sum(credit),2) c from `tabGL Entry`")[0]
        s["GL debit"], s["GL credit"] = g["d"], g["c"]
        s["GL vouchers not balanced"] = q("select count(*) c from (select voucher_type, voucher_no from `tabGL Entry` group by 1,2 "
                                          "having abs(sum(debit)-sum(credit))>0.5) x")[0]["c"]
    return s
def show_snapshot(title, s):
    say(f"  {title}:")
    for k, v in s.items():
        say(f"    {k:28} {v}")

# ---------------------------------------------------------------------------- company
MERGE = {"Account", "Cost Center", "Department"}
BASE_FIELD = {"Account": "account_name", "Cost Center": "cost_center_name", "Department": "department_name",
              "Warehouse": "warehouse_name", "Item Tax Template": "title",
              "Sales Taxes and Charges Template": "title", "Purchase Taxes and Charges Template": "title"}

def plan_company():
    comp = {r["name"]: r["abbr"] for r in q("select name, abbr from tabCompany")}
    if NEW not in comp:
        die(f"Company '{NEW}' does not exist on this site.")
    new_abbr = comp[NEW]
    olds = {n: a for n, a in comp.items() if n != NEW}
    if not olds:
        say("  no other companies — nothing to merge"); return None
    common = os.path.commonprefix(sorted(olds))
    say(f"  merging {sorted(olds)} (abbr {sorted(set(olds.values()))}) into '{NEW}' (abbr {new_abbr})")
    plans = {}
    for D, r in DT.items():
        t = "tab" + D
        if r["issingle"] or r["istable"] or not has_table(t) or TROWS[t] > 200000:
            continue
        cf = "company" in cols(t)
        pats = [f"% - {a}" for a in set(olds.values())]
        rows = q(f"select name{', company' if cf else ''} from `{t}` where " + " or ".join(["name like %s"] * len(pats)), pats)
        rows = [dict(name=w["name"], company=w.get("company")) for w in rows]
        if not rows:
            continue
        ab2co = {}
        for o, a in olds.items():
            ab2co.setdefault(a, o)
        for w in rows:
            ab = next(a for a in olds.values() if w["name"].endswith(f" - {a}"))
            w["abbr"] = ab
            if w["company"] not in olds:
                w["company"] = ab2co[ab]
        names_all = {w["name"] for w in q(f"select name from `{t}`")}
        groups = collections.OrderedDict()
        for w in sorted(rows, key=lambda w: (w["company"], w["name"])):
            groups.setdefault(w["name"][:-len(f" - {w['abbr']}")], []).append(w)
        p = dict(map={}, delete=[], rename={}, basefix={}, merged=0, tagged=0, plain=0, conflicts=[], group_fix=[])
        used = set(names_all)
        bf = BASE_FIELD.get(D)
        for base, group in groups.items():
            new = f"{base} - {new_abbr}"
            exists = new in names_all and new not in {w["name"] for w in group}
            if D in MERGE:
                surv = new if exists else group[0]["name"]
                for w in group:
                    p["map"][w["name"]] = new
                    if w["name"] != surv:
                        p["delete"].append(w["name"]); p["merged"] += 1
                if not exists:
                    p["rename"][group[0]["name"]] = new; p["plain"] += 1
                members = [w["name"] for w in group] + ([new] if exists else [])
                attrs = ["is_group"] + (["root_type"] if D == "Account" else [])
                for a in attrs:
                    vals = {m: q(f"select `{a}` v from `{t}` where name=%s", (m,))[0]["v"] for m in members}
                    if len(set(vals.values())) > 1:
                        if D == "Department" and a == "is_group":
                            p["group_fix"].append(new)      # the merged sub-departments now sit under it
                        else:
                            p["conflicts"].append((new, a, vals))
            else:
                merge_first = (D == "Warehouse" and exists and
                               not q("select 1 x from tabBin where warehouse=%s limit 1", (new,)) and
                               not q("select 1 x from `tabStock Ledger Entry` where warehouse=%s limit 1", (new,)))
                for i, w in enumerate(group):
                    if i == 0 and (not exists or merge_first):
                        tgt = new
                        if merge_first:
                            p["delete"].append(w["name"]); p["merged"] += 1
                        else:
                            p["plain"] += 1
                    else:
                        tag = w["company"][len(common):].strip() or w["company"]
                        tgt = f"{base} {tag} - {new_abbr}"; k = 1
                        while tgt in used:
                            k += 1; tgt = f"{base} {tag} {k} - {new_abbr}"
                        p["tagged"] += 1
                    used.add(tgt); p["map"][w["name"]] = tgt
                    if w["name"] not in p["delete"]:
                        p["rename"][w["name"]] = tgt
            for w in group:
                if bf and w["name"] in p["rename"]:
                    p["basefix"][w["name"]] = (bf, p["rename"][w["name"]][:-len(f" - {new_abbr}")])
        plans[D] = p
    return dict(olds=olds, new_abbr=new_abbr, plans=plans)

def print_company_plan(pl):
    if not pl:
        return
    say(f"  {'DocType':38} {'renamed':>8} {'merged':>7} {'tagged':>7}  conflicts")
    for D, p in pl["plans"].items():
        say(f"  {D:38} {len(p['rename']):8} {p['merged']:7} {p['tagged']:7}  {len(p['conflicts'])}" + (f"   ({len(p['group_fix'])} become groups)" if p["group_fix"] else ""))
        for new, a, vals in p["conflicts"][:5]:
            say(f"      CONFLICT {new}: {a} differs {vals}")
    ncols = {}
    for D in ["Company"] + list(pl["plans"]):
        ncols[D] = len(link_columns(D))
    say("  link columns that will be re-pointed:", ", ".join(f"{k}={v}" for k, v in ncols.items()))

def apply_company(pl):
    olds, plans = pl["olds"], pl["plans"]
    if any(p["conflicts"] for p in plans.values()):
        die("refusing to merge: conflicting attributes (see plan). Fix them or exclude the record first.")
    # 1. mapping tables
    maps = {"Company": {o: NEW for o in olds}}
    for D, p in plans.items():
        m = {o: n for o, n in p["map"].items() if o != n}
        if m:
            maps[D] = m
    tmpn = {}
    for i, (D, m) in enumerate(maps.items()):
        tn = f"dts_rn_{i}"; tmpn[D] = tn
        x(f"drop table if exists `{tn}`")
        x(f"create table `{tn}` (old varchar(255) collate utf8mb4_unicode_ci primary key, new varchar(255) collate utf8mb4_unicode_ci) engine=InnoDB")
        for o, n in m.items():
            x(f"insert into `{tn}` values (%s, %s)", (o, n))
        conn.commit()
    # 2. re-point every Link column
    say("  re-pointing links ...")
    total = collections.Counter(); tabs = collections.Counter()
    for D, tn in tmpn.items():
        for parent, field, kind in link_columns(D):
            if kind == "single":
                n = x(f"update tabSingles s join `{tn}` m on s.value = m.old set s.value = m.new where s.doctype=%s and s.field=%s", (parent, field))
            else:
                t = "tab" + parent
                n = x(f"update `{t}` t join `{tn}` m on t.`{field}` = m.old set t.`{field}` = m.new")
            conn.commit()
            if n:
                total[D] += n; tabs[D] += 1
    for D in tmpn:
        say(f"    {D:34} {total[D]:>9} values updated in {tabs[D]} columns")
    # other places that hold a name without being a Link column
    for D, tn in tmpn.items():
        n1 = x(f"update tabDefaultValue d join `{tn}` m on d.defvalue = m.old set d.defvalue = m.new")
        n2 = x(f"update `tabUser Permission` u join `{tn}` m on u.for_value = m.old set u.for_value = m.new where u.allow=%s", (D,))
        conn.commit()
        if n1 or n2:
            say(f"    {D:34} DefaultValue {n1}, User Permission {n2}")
    # 3. merge / rename the suffixed records themselves
    for D, p in plans.items():
        t = "tab" + D
        for i in range(0, len(p["delete"]), 500):
            chunk = p["delete"][i:i + 500]
            x(f"delete from `{t}` where name in ({','.join(['%s'] * len(chunk))})", chunk)
        for old, new in p["rename"].items():
            sets, args = ["name=%s"], [new]
            if old in p["basefix"]:
                f, v = p["basefix"][old]; sets.append(f"`{f}`=%s"); args.append(v)
            x(f"update `{t}` set {', '.join(sets)} where name=%s", args + [old])
        for name in p["group_fix"]:
            x(f"update `{t}` set is_group=1 where name=%s", (name,))
        conn.commit()
        say(f"    {D:34} renamed {len(p['rename'])}, merged/deleted {len(p['delete'])}" + (f", made group {len(p['group_fix'])}" if p["group_fix"] else ""))
    # 4. remove the old companies (and their child rows), de-duplicate what the merge doubled up
    for r in q("select options o from tabDocField where parent='Company' and fieldtype in ('Table','Table MultiSelect')"):
        if has_table("tab" + r["o"]):
            x(f"delete from `tab{r['o']}` where parenttype='Company' and parent in ({','.join(['%s'] * len(olds))})", list(olds))
    x(f"delete from tabCompany where name in ({','.join(['%s'] * len(olds))})", list(olds))
    if has_table("tabFiscal Year Company"):
        n = x("delete a from `tabFiscal Year Company` a join `tabFiscal Year Company` b on a.parent=b.parent and a.company=b.company and a.name>b.name")
        say(f"    Fiscal Year Company duplicates removed: {n}")
    n = x("delete a from `tabUser Permission` a join `tabUser Permission` b on a.user=b.user and a.allow=b.allow and a.for_value=b.for_value "
          "and IFNULL(a.applicable_for,'')=IFNULL(b.applicable_for,'') and a.apply_to_all_doctypes=b.apply_to_all_doctypes and a.name>b.name")
    say(f"    User Permission duplicates removed: {n}")
    for tn in tmpn.values():
        x(f"drop table `{tn}`")
    conn.commit()
    # tree DocTypes touched
    trees = [D for D in plans if DT[D]["is_tree"]]
    say("TREES:" + ",".join(trees))

# ---------------------------------------------------------------------------- dates
TX_EXTRA = ["GL Entry", "Stock Ledger Entry", "Payment Ledger Entry", "Employee Checkin", "Inward Gate Pass",
            "Outward Gate Pass", "Work Order Downtime", "Opportunity", "Lead"]
SKIP_COLS = {"creation", "modified"}
def date_cols(t):
    return [c for c, ty in cols(t).items() if re.match(r"(date|datetime|timestamp)", ty) and c not in SKIP_COLS]

fy_row = q("select year_start_date s from `tabFiscal Year` where name=%s", (FY,))
if not fy_row:
    die(f"Fiscal Year {FY} does not exist.")
FM, YA = fy_row[0]["s"].month, fy_row[0]["s"].year
YB = YA + 1
def new_year(c):
    return f"IF(MONTH(`{c}`) >= {FM}, {YA}, {YB})"
def wrong(c):      # true when the value's year is not the one the rule assigns
    return f"(`{c}` IS NOT NULL AND `{c}` >= '1000-01-01' AND YEAR(`{c}`) <> {new_year(c)})"
def shifted(c):
    return f"IF(`{c}` IS NULL OR `{c}` < '1000-01-01', `{c}`, DATE_ADD(`{c}`, INTERVAL ({new_year(c)} - YEAR(`{c}`)) YEAR))"

ONLY_DOCTYPES = [d.strip() for d in os.environ.get("REBRAND_DOCTYPES", "").split(",") if d.strip()]
def date_targets():
    # REBRAND_DOCTYPES restricts the rule to those DocTypes (and their child rows) whether or not they are
    # submittable — used by dts_mfg.sh so it only touches what it has just transferred.
    parents = [D for D, r in DT.items()
               if not r["issingle"] and not r["istable"] and has_table("tab" + D)
               and ((D in ONLY_DOCTYPES) if ONLY_DOCTYPES else (r["is_submittable"] or D in TX_EXTRA))]
    targets = collections.OrderedDict()      # table -> (parenttypes or None)
    for D in parents:
        targets.setdefault("tab" + D, None)
    child_parents = collections.defaultdict(set)
    for D in parents:
        for r in q("select options o from tabDocField where parent=%s and fieldtype in ('Table','Table MultiSelect') "
                   "union select options from `tabCustom Field` where dt=%s and fieldtype in ('Table','Table MultiSelect')", (D, D)):
            if r["o"] and has_table("tab" + r["o"]) and "parenttype" in cols("tab" + r["o"]):
                child_parents["tab" + r["o"]].add(D)
    for t, ps in child_parents.items():
        targets[t] = sorted(ps)
    return parents, targets

PAIRS = [("from_date", "to_date"), ("start_date", "end_date")]
def where_for(t, pts):
    return f"parenttype in ({','.join(repr(p) for p in pts)})" if pts else "1=1"

def plan_dates():
    parents, targets = date_targets()
    say(f"  transaction DocTypes: {len(parents)}; tables to rewrite: {len(targets)} (incl. child tables)")
    tot_rows = tot_cols = 0
    rows_out = []
    for t, pts in targets.items():
        dc = date_cols(t)
        fyc = "fiscal_year" in cols(t)
        if not dc and not fyc:
            continue
        conds = [wrong(c) for c in dc] + ([f"(fiscal_year IS NOT NULL AND fiscal_year <> '{FY}')"] if fyc else [])
        n = q(f"select count(*) c from `{t}` where ({' or '.join(conds)}) and {where_for(t, pts)}")[0]["c"]
        if n:
            rows_out.append((n, t, len(dc), fyc)); tot_rows += n; tot_cols += len(dc)
    rows_out.sort(reverse=True)
    say(f"  rows whose date/fiscal_year will change: {tot_rows:,} across {len(rows_out)} tables")
    say(f"  {'table':40} {'rows':>10}  date cols  fiscal_year")
    for n, t, dcn, fyc in rows_out[:25]:
        say(f"  {t:40} {n:10,}  {dcn:9}  {'yes' if fyc else ''}")
    if len(rows_out) > 25:
        say(f"  ... and {len(rows_out) - 25} smaller tables")

def apply_dates():
    parents, targets = date_targets()
    total = 0
    for t, pts in targets.items():
        dc = date_cols(t)
        fyc = "fiscal_year" in cols(t)
        if not dc and not fyc:
            continue
        sets = [f"`{c}` = {shifted(c)}" for c in dc] + ([f"fiscal_year = '{FY}'"] if fyc else [])
        conds = [wrong(c) for c in dc] + ([f"(fiscal_year IS NOT NULL AND fiscal_year <> '{FY}')"] if fyc else [])
        n = x(f"update `{t}` set {', '.join(sets)} where ({' or '.join(conds)}) and {where_for(t, pts)}")
        conn.commit()
        if n:
            total += n
            say(f"    {t:40} {n:>10,} rows")
    say(f"  date rows rewritten: {total:,}")
    fixed = 0
    for t, pts in targets.items():
        for a, b in PAIRS:
            if a in cols(t) and b in cols(t) and re.match(r"date", cols(t)[a]) and re.match(r"date", cols(t)[b]):
                n = x(f"update `{t}` set `{b}` = DATE_ADD(`{b}`, INTERVAL 1 YEAR) where `{a}` IS NOT NULL and `{b}` IS NOT NULL and `{b}` < `{a}` and {where_for(t, pts)}")
                conn.commit()
                if n:
                    fixed += n; say(f"    range repair {t}.{a}/{b}: {n}")
    say(f"  ranges that straddled the fiscal-year boundary and were repaired: {fixed}")

# ---------------------------------------------------------------------------- verification
def verify(pl_olds=None, plans=None):
    bad = 0
    def check(label, n):
        nonlocal bad
        say(f"    {'OK  ' if n == 0 else 'FAIL'} {label}: {n}")
        bad += 1 if n else 0
    if "company" in parts and pl_olds:
        olds = list(pl_olds)
        ph = ",".join(["%s"] * len(olds))
        check("old company records left", q(f"select count(*) c from tabCompany where name in ({ph})", olds)[0]["c"])
        left = 0
        for parent, field, kind in link_columns("Company"):
            if kind == "table":
                left += q(f"select count(*) c from `tab{parent}` where `{field}` in ({ph})", olds)[0]["c"]
        check("rows still pointing at an old company", left)
        for D in plans or {}:
            ab = [a for a in set(pl_olds.values())]
            n = q(f"select count(*) c from `tab{D}` where " + " or ".join(["name like %s"] * len(ab)), [f"% - {a}" for a in ab])[0]["c"]
            check(f"{D} names still ending in an old abbreviation", n)
        for label, sql in [
            ("GL Entry rows with a missing Account", "select count(*) c from `tabGL Entry` g left join tabAccount a on a.name=g.account where a.name is null"),
            ("GL Entry rows with a missing Cost Center", "select count(*) c from `tabGL Entry` g left join `tabCost Center` a on a.name=g.cost_center where g.cost_center is not null and g.cost_center<>'' and a.name is null"),
            ("Stock Ledger Entry rows with a missing Warehouse", "select count(*) c from `tabStock Ledger Entry` g left join tabWarehouse a on a.name=g.warehouse where a.name is null"),
            ("Bin rows with a missing Warehouse", "select count(*) c from tabBin g left join tabWarehouse a on a.name=g.warehouse where a.name is null"),
            ("Employees with a missing Department", "select count(*) c from tabEmployee g left join tabDepartment a on a.name=g.department where g.department is not null and g.department<>'' and a.name is null"),
            ("Accounts whose parent is missing", "select count(*) c from tabAccount g left join tabAccount a on a.name=g.parent_account where g.parent_account is not null and g.parent_account<>'' and a.name is null"),
            ("Warehouses whose parent is missing", "select count(*) c from tabWarehouse g left join tabWarehouse a on a.name=g.parent_warehouse where g.parent_warehouse is not null and g.parent_warehouse<>'' and a.name is null"),
        ]:
            check(label, q(sql)[0]["c"])
    if "dates" in parts:
        parents, targets = date_targets()
        out = 0
        for t, pts in targets.items():
            for c in date_cols(t):
                out += q(f"select count(*) c from `{t}` where `{c}` >= '1000-01-01' and (`{c}` < (select year_start_date from `tabFiscal Year` where name='{FY}') or `{c}` > (select year_end_date from `tabFiscal Year` where name='{FY}') + interval 1 day) and {where_for(t, pts)}")[0]["c"]
        say(f"    date values outside {FY} (range repairs may leave a few): {out}")
    return bad

# ---------------------------------------------------------------------------- main
say(f"target database: {DST}   mode: {mode}   parts: {sorted(parts)}   fiscal year: {FY} (starts month {FM}: Jul-Dec->{YA}, Jan-Jun->{YB})")
before = snapshot(); show_snapshot("BEFORE", before)
pl = None
if "company" in parts:
    say("\n== company =="); pl = plan_company(); print_company_plan(pl)
if "dates" in parts:
    say("\n== dates =="); plan_dates()
if not APPLY:
    say("\n(dry-run: nothing was changed)")
    sys.exit(0)
if pl:
    say("\n== applying company merge =="); apply_company(pl)
if "dates" in parts:
    say("\n== applying dates =="); apply_dates()
say("\n== verification ==")
after = snapshot(); show_snapshot("AFTER", after)
bad = verify(pl["olds"] if pl else None, pl["plans"] if pl else None)
diff = [k for k in before if before[k] != after[k]]
for k in diff:
    say(f"    CHANGED {k}: {before[k]} -> {after[k]}")
say(f"\nresult: {'OK' if not bad and not diff else 'CHECK THE LINES ABOVE'}")
sys.exit(1 if bad or diff else 0)
PY

dts_rebrand_doctypes() { :; }   # this script transforms data in place; it owns no DocTypes

dts_rebrand_run() {
  local parts="${REBRAND_PARTS:-company,dates}" out rc=0
  export REBRAND_COMPANY="${REBRAND_COMPANY:-MicroMax Erp Pvt Ltd.}" REBRAND_FY="${REBRAND_FY:-2026-2027}"
  local mode=plan; ((DTS_EXECUTE)) && mode=apply
  if ((DTS_EXECUTE)) && [[ "$(dts_site_db)" == "$DST_DB" ]]; then
    warn "Put the site in maintenance mode first:  bench --site ${SITE_NAME} set-maintenance-mode on"
  fi
  out="$(mktemp)"
  (cd "${BENCH_DIR}/sites" && DST_DB="$DST_DB" DB_USER="$DB_USER" DB_PASSWORD="$DB_PASSWORD" DB_HOST="${DB_HOST:-}" DB_PORT="${DB_PORT:-}" \
     REBRAND_COMPANY="$REBRAND_COMPANY" REBRAND_FY="$REBRAND_FY" "${BENCH_DIR}/env/bin/python" - "$mode" "$parts" <<<"$DTS_REBRAND_PY") | tee "$out" || rc=$?
  local trees; trees="$(grep '^TREES:' "$out" | head -1 | cut -d: -f2 | tr ',' '\n' || true)"
  local t; while IFS= read -r t; do [[ -n "$t" ]] && DTS_TREES+=("$t"); done <<<"$trees"
  rm -f "$out"
  if ((DTS_EXECUTE)) && ((rc == 0)); then dts_bench clear-cache >/dev/null 2>&1 || true; fi
  ((rc == 0)) || DTS_FAILED+=("rebrand (exit $rc)")
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then dts_main rebrand "$@"; fi
