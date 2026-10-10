# =====================================================================
# SERVER SCRIPT — the source of truth for the ERP's copy. Keep in step.
#
#   Name        : Elbrit SM Review
#   Script Type : API
#   API Method  : elbrit_sm_review
#   Allow Guest : NO
#
#   GET /api/method/elbrit_sm_review                       the caller's seat, this FY to date
#   GET /api/method/elbrit_sm_review?root=RBM1-AURA-TN&fy=2026&upto=2026-09
#       &parts=tree,sales,secondary,doctors,service&drafts=0
#
# THE SM MONTHLY REVIEW'S NUMBERS (docs/sm-review-plan.md), SUMMED HERE: one
# grouped SELECT per block over the whole window, never documents — a
# distributor-month of secondary is ~170 KB as a document, a few rows here.
# READ-ONLY (frappe.db.sql only runs SELECT).
#
# WHOSE NUMBERS: the caller's SEAT (Employee.custom_role_profile, else
# role_id) and every seat under it in the Role Profile tree, any depth —
# read past permissions, as Elbrit Entry Team does, and only for that
# subtree. The IT role profile gets the whole Sales tree. `root` narrows to
# a seat INSIDE that subtree; anything else falls back to the caller's seat.
#
# THE WINDOW: April of `fy` (default: the FY of today) to `upto` (default:
# this month), PLUS the same months a year earlier for growth. Doctor
# support also reads the 3 months before April, the baseline of April's
# increase/decrease buckets.
#
# BLOCKS (`parts`, all by default):
#   tree       (always) seats under root: id, name, employee, tier, reportsTo, vacant,
#              hq, dept. Every other block indexes seats by their position
#              here (`s`).
#   sales      target and primary, which the ERP keys by DEPARTMENT + HQ, not
#              by seat. Each (dept, hq) pair is owned by the BE seat with that
#              department and territory; a pair two or more BE seats share is
#              owned by their nearest common manager (both BEs list it under
#              `seats`). Same rules as customReportV2 SALES:
#                target  = Σ HQ Monthly Distribution.value (Target Invest dept/hq)
#                primary = INC_PRIMARY = Σ taxable_value (not claim) − Σ BREAKAGE,
#                          invoices not sample / internal / whg-ignored /
#                          Draft / Cancelled / Internal Transfer
#              rows: [pair, month, target, primary]
#              unmapped: pairs in the scope's departments that NO seat in the
#              company has — their figures are in no one's total.
#   secondary  stockist secondary per month × seat × distributor, from the
#              item LINES (each carries its seat): rows [month, s, dist,
#              soldValue, closingValue, soldQty, closingQty]. Overstock
#              (closing ≥ 2× sold) is the screen's call, not this script's.
#   doctors    doctor support per month × seat × doctor from Support Items:
#              rows [month, s, doctor, amount, qty]; `info` per doctor (name,
#              code, specialty, category, hq); `assigned` per seat = doctors
#              whose Lead lists the seat.
#   effort     the EFFORT ANALYSIS sheet per person (seat holder) and month:
#              visits, coverage, reporting days, joint days, new doctors,
#              leave; days per HQ; joint-working days per HQ. With it, per
#              doctor, the last visit by BE / ABM / RBM / SM and done
#              (effort=own: only the root seat's own people, for a quick
#              personal month — the Home Overview's review section.)
#              visits per month by level (doctorVisits).
#   products   every product the scope moved this FY: secondary strips/₹
#              per seat and primary strips/₹ per (dept, HQ) pair, by month.
#   service    Doctor Service per month × seat × doctor × service × state:
#              rows [month, s, doctor, service, state, amount, count]. Draft
#              rows ARE kept: on production every FY 26-27 Doctor Service is
#              still Draft (the migrated ones never moved), so dropping them
#              would show no investment at all. Rejected ones are left out.
#
# DRAFTS (secondary, doctors) — only an OPEN month leaves them out: the month
# still being entered (last month until the ENTRY_DUE_DAY, as Ring Nav's
# tiles, then none) and this month. There a line whose custom_status is blank
# or Draft is not yet sent; left out unless drafts=1, and `meta.draftLines`
# counts it per block and month so the screen can say "provisional". A CLOSED
# month counts every line: the migrated history (FY 25-26) sits in Draft —
# leaving it out drops ~₹13 L a month for one SM and inflates growth.
# `meta.open` is the first open month.
#
# Answer: { fy, upto, root, me, months: ["2025-04", …], tree: [...],
#           sales: {...}, secondary: {...}, doctors: {...}, service: {...},
#           meta: { drafts, draftLines, ms, t: { <block>: ms } } }
#
# safe_exec: no import, no .format(), no set literals, no tuple
# unpacking, no underscore-prefixed names.
# =====================================================================

SALES_ROOT = "Sales"
IT_PROFILE = "IT"
CHUNK = 500
BASELINE_MONTHS = 3
ENTRY_DUE_DAY = 13      # as Ring Nav's ENTRY_DUE_DAY
ALL_PARTS = ["tree", "sales", "secondary", "doctors", "service", "effort", "products"]
MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July",
               "August", "September", "October", "November", "December"]


def valid_month(m):
    if not m or len(m) != 7 or m[4] != "-":
        return False
    return m[:4].isdigit() and m[5:].isdigit() and 1 <= int(m[5:]) <= 12


def ym(y, mo):
    return str(y) + "-" + ("0" if mo < 10 else "") + str(mo)


def add_months(m, n):
    k = int(m[:4]) * 12 + int(m[5:]) - 1 + n
    return ym(k // 12, k % 12 + 1)


def month_span(a, b):
    out = []
    cur = a
    while cur <= b and len(out) < 60:
        out.append(cur)
        cur = add_months(cur, 1)
    return out


def chunks(values):
    out = []
    i = 0
    while i < len(values):
        out.append(values[i:i + CHUNK])
        i = i + CHUNK
    return out


def tier_of(seat):
    t = (seat or "").split("-")[0]
    while t and t[-1].isdigit():
        t = t[:-1]
    return t


def is_vacant_name(n):
    return (n or "")[:6].lower() == "vacant"


def num(v):
    return round(float(v or 0), 2)


# A line field's name as THIS ERP has it: Support Items has role_profile /
# status on UAT and custom_role_profile / custom_status on production.
def line_field(child, plain):
    meta = frappe.get_meta(child)
    if not meta.has_field(plain) and meta.has_field("custom_" + plain):
        return "custom_" + plain
    return plain


def state_bucket(ws):
    s = (ws or "").lower()
    if not s or s == "draft":
        return "draft"
    if "rejected" in s or s == "rework" or "cancel" in s:
        return "rejected"
    if "approved" in s or "verified" in s:
        return "approved"
    return "waiting"


started = frappe.utils.now_datetime()
me = frappe.session.user
form = frappe.form_dict

today = frappe.utils.nowdate()
this_month = today[:7]
upto = form.get("upto") or ""
if not valid_month(upto) or upto > this_month:
    upto = this_month
fy = str(form.get("fy") or "")
if not (len(fy) == 4 and fy.isdigit()):
    fy = str(int(upto[:4]) - (1 if int(upto[5:]) < 4 else 0))
fy_start = fy + "-04"
fy_end = add_months(fy_start, 11)
if upto > fy_end:
    upto = fy_end
if upto < fy_start:
    upto = fy_start
ly_start = add_months(fy_start, -12)
months = month_span(ly_start, upto)            # LY April .. upto (growth needs LY)
mi = {}
for i in range(len(months)):
    mi[months[i]] = i
want = (form.get("parts") or "").split(",")
parts = [p for p in ALL_PARTS if p in want] or ALL_PARTS
with_drafts = str(form.get("drafts") or "0") == "1"
open_from = add_months(this_month, -1) if int(today[8:10]) <= ENTRY_DUE_DAY else this_month


def first_day(m):
    return m + "-01"


def last_day(m):
    return str(frappe.utils.get_last_day(m + "-01"))


# ---- WHO: the caller's seat, the subtree they may read, the root asked for
is_it = frappe.db.get_value("User", me, "role_profile_name") == IT_PROFILE
my_seat = None
mine = frappe.get_all("Employee", filters={"user_id": me, "status": "Active"},
                      fields=["custom_role_profile", "role_id"], limit_page_length=1)
if mine:
    my_seat = mine[0].get("custom_role_profile") or mine[0].get("role_id") or None

profiles = {}
kids = {}
for r in frappe.get_all("Role Profile",
                        fields=["name", "parent_role_profile", "custom_department", "custom_territory"],
                        limit_page_length=0):
    profiles[r.get("name")] = r
    p = r.get("parent_role_profile")
    if p:
        if p not in kids:
            kids[p] = []
        kids[p].append(r.get("name"))


def subtree(top):
    out = [top]
    seen = {top: 1}
    frontier = [top]
    hops = 0
    while frontier and hops < 15:
        hops = hops + 1
        below = []
        for p in frontier:
            for k in kids.get(p) or []:
                if not seen.get(k):
                    seen[k] = 1
                    out.append(k)
                    below.append(k)
        frontier = below
    return out


allowed_top = SALES_ROOT if is_it else my_seat
allowed = {}
if allowed_top:
    for s in subtree(allowed_top):
        allowed[s] = 1
root = form.get("root") or ""
if not allowed.get(root):
    root = my_seat if (my_seat and allowed.get(my_seat)) else allowed_top

seats = subtree(root) if root else []
# The "Sales" seat is the GM's (Rajkumar N holds it on production): it heads
# the tree, above every SM, for the GM and for IT alike. Dropped only when no
# real person holds it, so the SMs are the tops then.
sales_held = False
if root == SALES_ROOT:
    for e in frappe.get_all("Employee", filters={"status": "Active", "custom_role_profile": SALES_ROOT},
                            fields=["employee_name"], limit_page_length=0):
        if not is_vacant_name(e.get("employee_name")):
            sales_held = True
    if not sales_held:
        seats = [s for s in seats if s != SALES_ROOT]
si_of = {}
for i in range(len(seats)):
    si_of[seats[i]] = i

answer = {"fy": fy, "upto": upto, "root": root, "me": my_seat, "months": months,
          "meta": {"drafts": 1 if with_drafts else 0, "open": open_from, "draftLines": {}}}

if not seats:
    answer["tree"] = []
    frappe.response["message"] = answer
else:
    # ---- TREE: one member per seat, named by whoever holds it (real people
    # first), vacant when only a "Vacant_" placeholder or no one holds it.
    holders = {}
    for part in chunks(seats):
        for e in frappe.get_all("Employee",
                                filters=[["status", "=", "Active"], ["custom_role_profile", "in", part]],
                                fields=["name", "employee_name", "custom_role_profile", "user_id"],
                                limit_page_length=0):
            s = e.get("custom_role_profile")
            if s not in holders:
                holders[s] = []
            if is_vacant_name(e.get("employee_name")):
                holders[s].append(e)
            else:
                holders[s].insert(0, e)
    parent_of = {}
    for s in seats:
        p = (profiles.get(s) or {}).get("parent_role_profile")
        parent_of[s] = p if (p and si_of.get(p) is not None and s != root) else None

    answer["meta"]["t"] = {}
    lap = [frappe.utils.now_datetime()]

    def mark(block):
        now = frappe.utils.now_datetime()
        answer["meta"]["t"][block] = int((now - lap[0]).total_seconds() * 1000)
        lap[0] = now

    # Always sent: every other block indexes seats by position here.
    tree = []
    for s in seats:
        hs = holders.get(s) or []
        real = [h for h in hs if not is_vacant_name(h.get("employee_name"))]
        h = hs[0] if hs else {}
        prof = profiles.get(s) or {}
        tree.append({
            "id": s,
            "name": " / ".join([x.get("employee_name") for x in real]) if real else (h.get("employee_name") or s),
            "employee": real[0].get("name") if real else h.get("name"),
            "user": real[0].get("user_id") if real else None,
            "tier": "GM" if s == SALES_ROOT else (tier_of(s) or None),
            "reportsTo": parent_of.get(s),
            "vacant": 0 if real else 1,
            "hq": prof.get("custom_territory"),
            "dept": prof.get("custom_department"),
        })
    answer["tree"] = tree

    def draft_count(block, rows):
        dl = {}
        for r in rows:
            m = r.get("m")
            if mi.get(m) is not None:
                dl[m] = dl.get(m, 0) + int(r.get("n") or 0)
        answer["meta"]["draftLines"][block] = dl

    mark("tree")

    # ---- SALES: target + primary by (department, HQ) → owning seat
    if "sales" in parts:
        def chain(s):
            out = []
            cur = s
            hops = 0
            while cur and hops < 15:
                hops = hops + 1
                out.append(cur)
                cur = parent_of.get(cur)
            return out

        def common_manager(group):
            first = chain(group[0])
            for c in first:
                ok = True
                for g in group[1:]:
                    if c not in chain(g):
                        ok = False
                        break
                if ok:
                    return c
            return root

        # BE seats (the leaves the ERP's targets are set for) own the pairs.
        pair_seats = {}
        for s in seats:
            if tier_of(s) != "BE":
                continue
            prof = profiles.get(s) or {}
            d = prof.get("custom_department")
            h = prof.get("custom_territory")
            if d and h:
                k = d + "|" + h
                if k not in pair_seats:
                    pair_seats[k] = []
                pair_seats[k].append(s)
        # Every pair any BE seat in the company has, to tell "outside this
        # scope" from "no one's".
        known = {}
        for n in profiles:
            if tier_of(n) == "BE":
                prof = profiles[n]
                if prof.get("custom_department") and prof.get("custom_territory"):
                    known[prof.get("custom_department") + "|" + prof.get("custom_territory")] = 1

        depts = []
        hqs = []
        for k in pair_seats:
            d = k.split("|")[0]
            h = k[len(d) + 1:]
            if d not in depts:
                depts.append(d)
            if h not in hqs:
                hqs.append(h)

        pairs = []
        pi = {}
        for k in pair_seats:
            group = pair_seats[k]
            d = k.split("|")[0]
            pi[k] = len(pairs)
            pairs.append({"dept": d, "hq": k[len(d) + 1:], "seats": [si_of[g] for g in group],
                          "owner": si_of[group[0] if len(group) == 1 else common_manager(group)]})

        cells = {}      # pairIdx|monthIdx -> [target, primary]
        unmapped = {}   # dept|hq -> [target, primary] summed over the window

        def put(d, h, m, t, p):
            if mi.get(m) is None:
                return
            k = (d or "") + "|" + (h or "")
            if pi.get(k) is not None:
                c = str(pi[k]) + "|" + str(mi[m])
                if c not in cells:
                    cells[c] = [0, 0]
                cells[c][0] = cells[c][0] + t
                cells[c][1] = cells[c][1] + p
            elif not known.get(k) and d in depts:
                if k not in unmapped:
                    unmapped[k] = [0, 0]
                unmapped[k][0] = unmapped[k][0] + t
                unmapped[k][1] = unmapped[k][1] + p

        if depts:
            # The child's fiscal_year is the calendar year of its own month.
            years = []
            for m in months:
                if m[:4] not in years:
                    years.append(m[:4])
            for r in frappe.db.sql("""
                SELECT ti.department AS d, ti.hq AS h, md.month AS mn,
                       LEFT(md.fiscal_year, 4) AS y, SUM(md.value) AS v
                FROM `tabHQ Monthly Distribution` md
                INNER JOIN `tabTarget Invest` ti ON md.parent = ti.name
                WHERE ti.department IN %(depts)s
                  AND LEFT(md.fiscal_year, 4) IN %(years)s
                GROUP BY ti.department, ti.hq, md.month, LEFT(md.fiscal_year, 4)
            """, {"depts": depts, "years": years}, as_dict=True):
                mn = (r.get("mn") or "").strip().capitalize()
                if mn in MONTH_NAMES and (r.get("y") or "").isdigit():
                    put(r.get("d"), r.get("h"), ym(int(r.get("y")), MONTH_NAMES.index(mn) + 1),
                        float(r.get("v") or 0), 0)

            for r in frappe.db.sql("""
                SELECT sii.custom_department AS d, sii.custom_hq AS h,
                       DATE_FORMAT(si.posting_date, '%%Y-%%m') AS m,
                       SUM(CASE WHEN si.custom_is_claim = 0 THEN sii.taxable_value ELSE 0 END)
                     - SUM(CASE WHEN COALESCE(sii.custom_return_type, si.reason_for_issuing_document, '') = 'BREAKAGE'
                                THEN sii.taxable_value ELSE 0 END) AS p
                FROM `tabSales Invoice` si
                INNER JOIN `tabSales Invoice Item` sii ON sii.parent = si.name
                WHERE si.custom_is_sample = 0
                  AND si.is_internal_customer = 0
                  AND (si.whg_ignore_invoice = 0 OR si.whg_ignore_invoice IS NULL)
                  AND si.status NOT IN ('Draft', 'Cancelled', 'Internal Transfer')
                  AND si.posting_date BETWEEN %(a)s AND %(b)s
                  AND sii.custom_department IN %(depts)s
                GROUP BY sii.custom_department, sii.custom_hq, DATE_FORMAT(si.posting_date, '%%Y-%%m')
            """, {"a": first_day(months[0]), "b": last_day(months[-1]), "depts": depts},
                    as_dict=True):
                put(r.get("d"), r.get("h"), r.get("m"), 0, float(r.get("p") or 0))

        rows = []
        for c in cells:
            k = c.split("|")
            rows.append([int(k[0]), int(k[1]), num(cells[c][0]), num(cells[c][1])])
        rows.sort(key=lambda x: x[0] * 1000 + x[1])
        um = []
        for k in unmapped:
            d = k.split("|")[0]
            um.append({"dept": d, "hq": k[len(d) + 1:], "target": num(unmapped[k][0]), "primary": num(unmapped[k][1])})
        answer["sales"] = {"pairs": pairs, "rows": rows, "unmapped": um}

    mark("sales")

    # ---- SECONDARY: month × seat × distributor, from the item lines. ONE
    # pass reads both the sent figures and the draft count: the line's seat
    # (custom_role_profile) has no index, so every pass reads all the window's
    # lines — a second pass for the drafts doubled the time (~14 s on UAT).
    if "secondary" in parts:
        dists = []
        di = {}
        rows = []
        drafts = []
        ok = "1" if with_drafts else "(sde.date < %(open)s OR COALESCE(sdt.custom_status, '') NOT IN ('', 'Draft'))"
        for part in chunks(seats):
            q = {"seats": part, "a": first_day(months[0]), "b": last_day(months[-1]), "open": first_day(open_from)}
            for r in frappe.db.sql("""
                SELECT DATE_FORMAT(sde.date, '%%Y-%%m') AS m, sdt.custom_role_profile AS s,
                       sde.distributor AS c,
                       SUM(CASE WHEN """ + ok + """ THEN sdt.sales_value ELSE 0 END) AS sv,
                       SUM(CASE WHEN """ + ok + """ THEN sdt.closing_balance ELSE 0 END) AS cv,
                       SUM(CASE WHEN """ + ok + """ THEN sdt.sales_qty ELSE 0 END) AS sq,
                       SUM(CASE WHEN """ + ok + """ THEN sdt.closing_qty ELSE 0 END) AS cq,
                       SUM(CASE WHEN """ + ok + """ THEN 1 ELSE 0 END) AS n,
                       SUM(CASE WHEN """ + ok + """ THEN 0 ELSE 1 END) AS dn
                FROM `tabSecondary Data Entry` sde
                STRAIGHT_JOIN `tabSecondary Data Table` sdt ON sdt.parent = sde.name
                WHERE sde.date BETWEEN %(a)s AND %(b)s
                  AND sdt.custom_role_profile IN %(seats)s
                GROUP BY DATE_FORMAT(sde.date, '%%Y-%%m'), sdt.custom_role_profile, sde.distributor
            """, q, as_dict=True):
                if mi.get(r.get("m")) is None:
                    continue
                if int(r.get("dn") or 0):
                    drafts.append({"m": r.get("m"), "n": r.get("dn")})
                if not int(r.get("n") or 0):
                    continue
                c = r.get("c") or ""
                if di.get(c) is None:
                    di[c] = len(dists)
                    dists.append(c)
                rows.append([mi[r.get("m")], si_of[r.get("s")], di[c],
                             num(r.get("sv")), num(r.get("cv")), num(r.get("sq")), num(r.get("cq"))])
        if not with_drafts:
            draft_count("secondary", drafts)
        answer["secondary"] = {"distributors": dists, "rows": rows}

    mark("secondary")

    # ---- DOCTORS: support per month × seat × doctor, from Support Items
    doctor_ids = []
    doc_i = {}

    def doctor_index(d):
        if doc_i.get(d) is None:
            doc_i[d] = len(doctor_ids)
            doctor_ids.append(d)
        return doc_i[d]

    if "doctors" in parts:
        rp = line_field("Support Items", "role_profile")
        st = line_field("Support Items", "status")
        support_from = add_months(fy_start, -BASELINE_MONTHS)
        if support_from < months[0]:
            support_from = months[0]
        ok = "1" if with_drafts else "(ds.date < %(open)s OR COALESCE(it." + st + ", '') NOT IN ('', 'Draft'))"
        rows = []
        drafts = []
        for part in chunks(seats):
            q = {"seats": part, "a": first_day(support_from), "b": last_day(months[-1]), "open": first_day(open_from)}
            for r in frappe.db.sql("""
                SELECT DATE_FORMAT(ds.date, '%%Y-%%m') AS m, it.""" + rp + """ AS s, ds.doctor AS d,
                       SUM(CASE WHEN """ + ok + """ THEN it.amount ELSE 0 END) AS a,
                       SUM(CASE WHEN """ + ok + """ THEN it.qty ELSE 0 END) AS q,
                       SUM(CASE WHEN """ + ok + """ THEN 1 ELSE 0 END) AS n,
                       SUM(CASE WHEN """ + ok + """ THEN 0 ELSE 1 END) AS dn
                FROM `tabSupport Items` it
                INNER JOIN `tabDoctor Support` ds ON ds.name = it.parent
                WHERE it.""" + rp + """ IN %(seats)s
                  AND ds.date BETWEEN %(a)s AND %(b)s
                GROUP BY DATE_FORMAT(ds.date, '%%Y-%%m'), it.""" + rp + """, ds.doctor
            """, q, as_dict=True):
                if mi.get(r.get("m")) is None or not r.get("d"):
                    continue
                if int(r.get("dn") or 0):
                    drafts.append({"m": r.get("m"), "n": r.get("dn")})
                if not int(r.get("n") or 0):
                    continue
                rows.append([mi[r.get("m")], si_of[r.get("s")], doctor_index(r.get("d")),
                             num(r.get("a")), num(r.get("q"))])
        if not with_drafts:
            draft_count("doctors", drafts)

        # Doctors each seat is assigned (the Lead's seat list) — a seat's
        # doctors with no support at all show only here.
        assigned = {}
        for part in chunks(seats):
            for r in frappe.db.sql("""
                SELECT role_profile_list AS s, COUNT(DISTINCT parent) AS n
                FROM `tabRole Profile Multiselect`
                WHERE parenttype = 'Lead' AND parentfield = 'custom_role_profile'
                  AND role_profile_list IN %(seats)s
                GROUP BY role_profile_list
            """, {"seats": part}, as_dict=True):
                assigned[str(si_of[r.get("s")])] = int(r.get("n") or 0)
        answer["doctors"] = {"rows": rows, "assigned": assigned, "from": support_from}

    mark("doctors")

    # ---- SERVICE: Doctor Service (investment) per month × seat × doctor
    if "service" in parts:
        services = []
        sv_i = {}
        rows = []
        for part in chunks(seats):
            for r in frappe.db.sql("""
                SELECT DATE_FORMAT(date, '%%Y-%%m') AS m, role_profile AS s, doctor AS d,
                       service_name AS n, workflow_state AS w,
                       SUM(service_amount) AS a, COUNT(*) AS c
                FROM `tabDoctor Service`
                WHERE role_profile IN %(seats)s
                  AND date BETWEEN %(a)s AND %(b)s
                GROUP BY DATE_FORMAT(date, '%%Y-%%m'), role_profile, doctor, service_name, workflow_state
            """, {"seats": part, "a": first_day(months[0]), "b": last_day(months[-1])}, as_dict=True):
                if mi.get(r.get("m")) is None or not r.get("d"):
                    continue
                b = state_bucket(r.get("w"))
                if b == "rejected":
                    continue
                n = r.get("n") or ""
                if sv_i.get(n) is None:
                    sv_i[n] = len(services)
                    services.append(n)
                rows.append([mi[r.get("m")], si_of[r.get("s")], doctor_index(r.get("d")),
                             sv_i[n], b, num(r.get("a")), int(r.get("c") or 0)])
        answer["service"] = {"services": services, "rows": rows}

    mark("service")

    # ---- people: the Active employees holding the scope's seats (real
    # people, not "Vacant_" placeholders), and every Active employee's tier
    # (for "which level last visited this doctor" — a manager above the
    # scope counts too).
    emp_list = []
    emp_i = {}
    emp_seat = {}
    user_emp = {}
    # effort=own: only the people holding the root seat itself — a person's
    # own month, without counting everyone under them.
    people_seats = [root] if str(form.get("effort") or "") == "own" else seats
    for s in people_seats:
        for h in holders.get(s) or []:
            if is_vacant_name(h.get("employee_name")) or emp_i.get(h.get("name")) is not None:
                continue
            emp_i[h.get("name")] = len(emp_list)
            emp_list.append(h.get("name"))
            emp_seat[h.get("name")] = s
            if h.get("user_id"):
                user_emp[str(h.get("user_id")).lower()] = h.get("name")

    def tier_band(t):
        if t in ["SM", "ZSM", "GM"]:
            return 3
        if t in ["RBM", "SRBM"]:
            return 2
        if t == "ABM":
            return 1
        return 0

    # A visit, as the Visit report counts one (src/app/visit/server/
    # elbrit_visit_summary.py): one PARTICIPANT row of a "Doctor Visit plan"
    # Event — the doctor is the Event's custom_doctor; the person is the
    # participant (an Employee, or a User by login), else the plan owner;
    # done once the row has a visit time; joint when the Event has another
    # participant row.
    VISIT = "e.event_category = 'Doctor Visit plan' AND e.starts_on BETWEEN %(a)s AND %(b)s"
    DONE = "p.custom_visit_time IS NOT NULL"
    PERSON = ("COALESCE(CASE WHEN p.reference_doctype = 'Employee' THEN p.reference_docname END, "
              "u.name, e.custom_employee_id)")
    JOINS = ("FROM `tabEvent` e "
             "INNER JOIN `tabEvent Participants` p ON p.parent = e.name AND p.parenttype = 'Event' "
             "LEFT JOIN `tabEmployee` u ON p.reference_doctype = 'User' AND u.user_id = p.reference_docname ")
    MINE = ("(e.custom_employee_id IN %(emps)s "
            "OR (p.reference_doctype = 'Employee' AND p.reference_docname IN %(emps)s) "
            "OR (p.reference_doctype = 'User' AND p.reference_docname IN %(users)s))")
    JOINT = ("EXISTS (SELECT 1 FROM `tabEvent Participants` o "
             "WHERE o.parent = e.name AND o.parenttype = 'Event' AND o.name != p.name)")
    fy_from = first_day(fy_start) + " 00:00:00"
    to_end = last_day(months[-1]) + " 23:59:59"

    # ---- EFFORT: the EFFORT ANALYSIS sheet per person and month.
    #   rows   [month, emp, planned, visits, coverage (distinct doctors),
    #           reporting days, joint days, new doctors (first visit since
    #           LY April), leave days (approved, Mon-Sat)]
    #   hqDays [month, emp, hq, days]  days with visits, by the Event's HQ
    #   jwDays [month, emp, hq, days]  days of JOINT visits by HQ — the RBM
    #          sheet's "JW DETAILS"
    if "effort" in parts and emp_list:
        eff = {}
        hq_names = []
        hq_i = {}

        def cell(emp, m):
            k = emp + "|" + m
            if k not in eff:
                eff[k] = [0, 0, 0, 0, 0, 0, 0.0]
            return eff[k]

        def hq_index(h):
            h = h or ""
            if hq_i.get(h) is None:
                hq_i[h] = len(hq_names)
                hq_names.append(h)
            return hq_i[h]

        hq_days = []
        jw_days = []
        for part in chunks(emp_list):
            users = [u for u in user_emp if user_emp[u] in part]
            q = {"emps": part, "users": users or ["-"], "a": fy_from, "b": to_end,
                 "ly": first_day(months[0]) + " 00:00:00"}
            for r in frappe.db.sql("""
                SELECT """ + PERSON + """ AS emp, DATE_FORMAT(e.starts_on, '%%Y-%%m') AS m,
                       COUNT(*) AS planned,
                       SUM(CASE WHEN """ + DONE + """ THEN 1 ELSE 0 END) AS visits,
                       COUNT(DISTINCT CASE WHEN """ + DONE + """ THEN e.custom_doctor END) AS coverage,
                       COUNT(DISTINCT CASE WHEN """ + DONE + """ THEN DATE(e.starts_on) END) AS days,
                       COUNT(DISTINCT CASE WHEN """ + DONE + """ AND """ + JOINT + """ THEN DATE(e.starts_on) END) AS jd
                """ + JOINS + """
                WHERE """ + VISIT + """ AND """ + MINE + """
                GROUP BY emp, DATE_FORMAT(e.starts_on, '%%Y-%%m')
            """, q, as_dict=True):
                if emp_i.get(r.get("emp")) is None:
                    continue
                c = cell(r.get("emp"), r.get("m"))
                c[0] = int(r.get("planned") or 0)
                c[1] = int(r.get("visits") or 0)
                c[2] = int(r.get("coverage") or 0)
                c[3] = int(r.get("days") or 0)
                c[4] = int(r.get("jd") or 0)
            for r in frappe.db.sql("""
                SELECT t.emp AS emp, t.m AS m, COUNT(*) AS n FROM (
                    SELECT """ + PERSON + """ AS emp, e.custom_doctor AS doc,
                           MIN(DATE_FORMAT(e.starts_on, '%%Y-%%m')) AS m
                    """ + JOINS + """
                    WHERE e.event_category = 'Doctor Visit plan' AND e.starts_on BETWEEN %(ly)s AND %(b)s
                      AND """ + MINE + """ AND """ + DONE + """ AND e.custom_doctor IS NOT NULL
                    GROUP BY emp, e.custom_doctor
                ) t
                GROUP BY t.emp, t.m
            """, q, as_dict=True):
                if emp_i.get(r.get("emp")) is not None and (r.get("m") or "") >= fy_start:
                    cell(r.get("emp"), r.get("m"))[5] = int(r.get("n") or 0)
            for r in frappe.db.sql("""
                SELECT """ + PERSON + """ AS emp, DATE_FORMAT(e.starts_on, '%%Y-%%m') AS m, e.custom_hq AS h,
                       COUNT(DISTINCT DATE(e.starts_on)) AS d,
                       COUNT(DISTINCT CASE WHEN """ + JOINT + """ THEN DATE(e.starts_on) END) AS jd
                """ + JOINS + """
                WHERE """ + VISIT + """ AND """ + MINE + """ AND """ + DONE + """
                GROUP BY emp, DATE_FORMAT(e.starts_on, '%%Y-%%m'), e.custom_hq
            """, q, as_dict=True):
                if emp_i.get(r.get("emp")) is None or mi.get(r.get("m")) is None:
                    continue
                h = hq_index(r.get("h"))
                hq_days.append([mi[r.get("m")], emp_i[r.get("emp")], h, int(r.get("d") or 0)])
                if int(r.get("jd") or 0):
                    jw_days.append([mi[r.get("m")], emp_i[r.get("emp")], h, int(r.get("jd") or 0)])
            # approved leave, in working days (Mon-Sat) inside the window
            lo = frappe.utils.getdate(first_day(fy_start))
            for r in frappe.db.sql("""
                SELECT employee AS emp, from_date AS f, to_date AS t, half_day AS half
                FROM `tabLeave Application`
                WHERE status = 'Approved' AND docstatus = 1 AND employee IN %(emps)s
                  AND to_date >= %(fa)s AND from_date <= %(tb)s
            """, {"emps": part, "fa": first_day(fy_start), "tb": last_day(months[-1])}, as_dict=True):
                d = frappe.utils.getdate(r.get("f"))
                end = frappe.utils.getdate(r.get("t"))
                one = 0.5 if (r.get("half") and str(r.get("f")) == str(r.get("t"))) else 1
                hops = 0
                while d <= end and hops < 120:
                    hops = hops + 1
                    if d >= lo and d.weekday() != 6:
                        m = str(d)[:7]
                        if mi.get(m) is not None:
                            c = cell(r.get("emp"), m)
                            c[6] = c[6] + one
                    d = frappe.utils.getdate(frappe.utils.add_days(d, 1))
        rows = []
        for k in eff:
            emp = k.split("|")[0]
            m = k[len(emp) + 1:]
            if mi.get(m) is None or emp_i.get(emp) is None:
                continue
            c = eff[k]
            rows.append([mi[m], emp_i[emp], c[0], c[1], c[2], c[3], c[4], c[5], c[6]])
        answer["effort"] = {
            "employees": [[e, si_of[emp_seat[e]]] for e in emp_list],
            "hqs": hq_names,
            "rows": rows,
            "hqDays": hq_days,
            "jwDays": jw_days,
        }

    mark("effort")

    # ---- PRODUCTS: every product the scope moved this FY — secondary (strips
    # and ₹ sold by stockists, from the item lines, per seat) and primary
    # (strips and ₹ invoiced, per department + HQ pair), per month. Items are
    # keyed by item code (the line's `item` link and the invoice's
    # item_code), named and branded from Item.
    #   items     [[code, name, brand]]
    #   rows      [month, s, item, soldQty, soldValue]
    #   primary   [month, pair, item, qty, value]
    if "products" in parts:
        codes = []
        code_i = {}

        def item_index(c):
            if code_i.get(c) is None:
                code_i[c] = len(codes)
                codes.append(c)
            return code_i[c]

        prows = []
        ok = "1" if with_drafts else "(sde.date < %(open)s OR COALESCE(sdt.custom_status, '') NOT IN ('', 'Draft'))"
        for part in chunks(seats):
            for r in frappe.db.sql("""
                SELECT DATE_FORMAT(sde.date, '%%Y-%%m') AS m, sdt.custom_role_profile AS s, sdt.item AS it,
                       SUM(CASE WHEN """ + ok + """ THEN sdt.sales_qty ELSE 0 END) AS q,
                       SUM(CASE WHEN """ + ok + """ THEN sdt.sales_value ELSE 0 END) AS v
                FROM `tabSecondary Data Entry` sde
                STRAIGHT_JOIN `tabSecondary Data Table` sdt ON sdt.parent = sde.name
                WHERE sde.date BETWEEN %(a)s AND %(b)s
                  AND sdt.custom_role_profile IN %(seats)s AND sdt.item IS NOT NULL
                GROUP BY DATE_FORMAT(sde.date, '%%Y-%%m'), sdt.custom_role_profile, sdt.item
                HAVING q != 0 OR v != 0
            """, {"seats": part, "a": first_day(fy_start), "b": last_day(months[-1]),
                  "open": first_day(open_from)}, as_dict=True):
                if mi.get(r.get("m")) is None:
                    continue
                prows.append([mi[r.get("m")], si_of[r.get("s")], item_index(r.get("it")), num(r.get("q")), num(r.get("v"))])
        pprim = []
        if answer.get("sales"):
            pidx = {}
            dps = []
            for i in range(len(answer["sales"]["pairs"])):
                pr = answer["sales"]["pairs"][i]
                pidx[pr["dept"] + "|" + pr["hq"]] = i
                if pr["dept"] not in dps:
                    dps.append(pr["dept"])
            if dps:
                for r in frappe.db.sql("""
                    SELECT sii.custom_department AS d, sii.custom_hq AS h, sii.item_code AS it,
                           DATE_FORMAT(si.posting_date, '%%Y-%%m') AS m,
                           SUM(sii.qty) AS q, SUM(sii.taxable_value) AS v
                    FROM `tabSales Invoice` si
                    INNER JOIN `tabSales Invoice Item` sii ON sii.parent = si.name
                    WHERE si.custom_is_sample = 0 AND si.is_internal_customer = 0
                      AND (si.whg_ignore_invoice = 0 OR si.whg_ignore_invoice IS NULL)
                      AND si.status NOT IN ('Draft', 'Cancelled', 'Internal Transfer')
                      AND si.custom_is_claim = 0
                      AND si.posting_date BETWEEN %(a)s AND %(b)s
                      AND sii.custom_department IN %(depts)s
                    GROUP BY sii.custom_department, sii.custom_hq, sii.item_code, DATE_FORMAT(si.posting_date, '%%Y-%%m')
                    HAVING q != 0 OR v != 0
                """, {"a": first_day(fy_start), "b": last_day(months[-1]), "depts": dps}, as_dict=True):
                    k = (r.get("d") or "") + "|" + (r.get("h") or "")
                    if pidx.get(k) is None or mi.get(r.get("m")) is None or not r.get("it"):
                        continue
                    pprim.append([mi[r.get("m")], pidx[k], item_index(r.get("it")), num(r.get("q")), num(r.get("v"))])
        meta_of = {}
        for part in chunks(codes):
            for r in frappe.db.sql("""
                SELECT name, item_name, brand FROM `tabItem` WHERE name IN %(codes)s
            """, {"codes": part}, as_dict=True):
                meta_of[r.get("name")] = [r.get("item_name") or r.get("name"), r.get("brand")]
        answer["products"] = {
            "items": [[c] + (meta_of.get(c) or [c, None]) for c in codes],
            "rows": prows,
            "primary": pprim,
        }

    mark("products")

    # ---- the doctors both blocks name
    if doctor_ids:
        info = [None] * len(doctor_ids)
        for part in chunks(doctor_ids):
            for r in frappe.db.sql("""
                SELECT name, lead_name, custom_doctor_code, custom_specialty, custom_category, territory
                FROM `tabLead` WHERE name IN %(ids)s
            """, {"ids": part}, as_dict=True):
                info[doc_i[r.get("name")]] = [r.get("lead_name"), r.get("custom_doctor_code"),
                                              (r.get("custom_specialty") or "").upper() or None,
                                              r.get("custom_category"), r.get("territory")]
        answer["doctorIds"] = doctor_ids
        answer["doctorInfo"] = info
        # When each doctor was first supported (OLD / NEW for the FY), and the
        # last done visit per level — [BE, ABM, RBM, SM] — by whoever went
        # (owner or joining colleague), from 3 months before April.
        first = [None] * len(doctor_ids)
        last = [None] * len(doctor_ids)
        visit_n = {}    # doctor|month|level -> done visits
        tier_of_emp = {}
        if "effort" in parts:
            for e in frappe.get_all("Employee", filters={"status": "Active"},
                                    fields=["name", "custom_role_profile"], limit_page_length=0):
                tier_of_emp[e.get("name")] = tier_band(tier_of(e.get("custom_role_profile")))
        vq = {"a": first_day(add_months(fy_start, -BASELINE_MONTHS)) + " 00:00:00", "b": to_end}
        for part in chunks(doctor_ids):
            for r in frappe.db.sql("""
                SELECT doctor AS d, MIN(date) AS f FROM `tabDoctor Support`
                WHERE doctor IN %(ids)s GROUP BY doctor
            """, {"ids": part}, as_dict=True):
                if doc_i.get(r.get("d")) is not None and r.get("f"):
                    first[doc_i[r.get("d")]] = str(r.get("f"))[:7]
            if "effort" not in parts:
                continue
            vq["ids"] = part
            for r in frappe.db.sql("""
                SELECT e.custom_doctor AS doc, """ + PERSON + """ AS who,
                       DATE_FORMAT(e.starts_on, '%%Y-%%m') AS m, COUNT(*) AS n, MAX(DATE(e.starts_on)) AS d
                """ + JOINS + """
                WHERE """ + VISIT + """ AND """ + DONE + """ AND e.custom_doctor IN %(ids)s
                GROUP BY e.custom_doctor, who, DATE_FORMAT(e.starts_on, '%%Y-%%m')
            """, vq, as_dict=True):
                t = tier_of_emp.get(r.get("who"))
                i = doc_i.get(r.get("doc"))
                if t is None or i is None:
                    continue
                if last[i] is None:
                    last[i] = [None, None, None, None]
                d = str(r.get("d"))
                if last[i][t] is None or d > last[i][t]:
                    last[i][t] = d
                if mi.get(r.get("m")) is not None:
                    k = str(i) + "|" + str(mi[r.get("m")]) + "|" + str(t)
                    visit_n[k] = visit_n.get(k, 0) + int(r.get("n") or 0)
        answer["doctorFirst"] = first
        answer["doctorLastVisit"] = last
        # done visits per doctor, month and level: [doctor, month, level, n]
        vrows = []
        for k in visit_n:
            p = k.split("|")
            vrows.append([int(p[0]), int(p[1]), int(p[2]), visit_n[k]])
        answer["doctorVisits"] = vrows if "effort" in parts else None

    mark("doctorInfo")
    answer["meta"]["ms"] = int((frappe.utils.now_datetime() - started).total_seconds() * 1000)
    frappe.response["message"] = answer
