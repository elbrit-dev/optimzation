# =====================================================================
# SERVER SCRIPT — the source of truth for the ERP's copy. Keep in step.
#
#   Name        : Elbrit Doctor Support Entry
#   Script Type : API
#   API Method  : elbrit_doctor_support_entry
#   Allow Guest : NO
#
#   GET /api/method/elbrit_doctor_support_entry                 last month
#   GET /api/method/elbrit_doctor_support_entry?month=2026-09
#   GET /api/method/elbrit_doctor_support_entry?seat=BE4-...    a seat override
#
# The Doctor Support Entry screen's data for the CALLER — the Secondary
# Entry script (elbrit_secondary_entry) for Doctor Support, answering in the
# SAME shape so the one screen reads both (see secondary-entry/data/task.js).
# READ-ONLY (saving stays the app's REST get -> save of the whole document).
#
# WHICH RECORDS: the Doctor Supports of the month the SEAT has lines on (the
# bulk load's, or its own "Add doctor" — elbrit_doctor_support_add), among
# those the caller may see (frappe.get_list: the ERP's permission rules).
# One Doctor Support is one DOCTOR (a Lead) for one date.
#
# ADDABLE: the seat's other doctors — Active Leads whose Role Profile table
# lists the seat, with no lines of the seat this month — for "Add doctor".
# The caller's own seat only, and only when `month` is the previous month
# (the only one "Add doctor" creates for); otherwise null.
#
# WHICH LINES: a Doctor Support carries several seats' Support Items; only
# the caller's seat's are sent (their active Employee's custom_role_profile, or `seat`).
# Other seats' products go as names only (`other_items`). IT with no `seat`
# (`read_only`) gets every line, each with its own seat, to view read-only.
#
# SHAPE, mapped to Secondary's names: a Support Item's qty is sent as
# sales_qty (valued at the item's custom_last_pts into sales_value — the
# screen writes it back as qty and amount), its status as custom_status;
# closing is 0 (Doctor Support keys none). The doctor goes as the
# `distributor` object: customer_name = the Lead's name, whg_ebs_code = the
# doctor's id, territory, and `note` = specialty and city. The approval rows
# (custom_approver_table) go as custom_status_tracker.
#
# THE SEAT'S APPROVAL ROW comes with its tracker's state and note — read
# directly (frappe.db.get_value), the one read past permissions, and ONLY for
# the caller's own seat's trackers. The document's own copy of the state
# (custom_approver_table.status) is not kept up to date, so the tracker's is
# what counts.
#
# VACANT SEATS, as Elbrit Secondary Entry: a BE seat no Active Employee
# holds is covered by the seat directly above it in the Role Profile tree
# (`vacant_seats`); any other seat no one holds, at any level, by the nearest
# live seat up the Role Profile tree; a seat held only by "Vacant_"
# placeholder Employees by the nearest live manager up the reporting chain.
# `covers` lists them all,
# [{ seat, holder }]; `covering` is true when `seat` is one — that seat's
# doctors, read past permissions, to fill in as its BE would.
#
# Answer: { user, seat, covering, covers, vacant_seats, read_only, month, entries: [<row>], products: [<item>],
#           addable: [{ name, customer_name, note }] | null }
#
# safe_exec: no import, no .format(), no set literals, no tuple
# unpacking, no underscore-prefixed names.
# =====================================================================

DOCTYPE = "Doctor Support"
LINE = "`tabSupport Items`"

# THE LINE FIELDS' NAMES differ between ERPs: UAT's Support Items has
# role_profile / status / hq / department, production's custom_role_profile /
# custom_status / custom_hq / custom_department. Whichever this ERP has is
# used — the plain name unless only the custom_ one exists.
SUPPORT_META = frappe.get_meta("Support Items")


def line_field(plain):
    if not SUPPORT_META.has_field(plain) and SUPPORT_META.has_field("custom_" + plain):
        return "custom_" + plain
    return plain


F_SEAT = line_field("role_profile")
F_STATUS = line_field("status")
F_HQ = line_field("hq")
MIRROR = "`tabsecondary tracker`"
CHUNK = 500
VACANT_PREFIX = "BE"


def valid_month(m):
    if not m or len(m) != 7 or m[4] != "-":
        return False
    return m[:4].isdigit() and m[5:].isdigit() and 1 <= int(m[5:]) <= 12


def month_before(m):
    y = int(m[:4])
    mo = int(m[5:])
    if mo == 1:
        return str(y - 1) + "-12"
    return str(y) + "-" + ("0" if mo - 1 < 10 else "") + str(mo - 1)


def chunks(values):
    out = []
    i = 0
    while i < len(values):
        out.append(values[i:i + CHUNK])
        i = i + CHUNK
    return out


def num(v):
    try:
        return float(v or 0)
    except Exception:
        return 0.0


def vacant_under(parent):
    # BE Role Profiles directly under `parent` that no Active Employee holds
    names = []
    for r in frappe.get_all("Role Profile", filters={"parent_role_profile": parent},
                            fields=["name"], limit_page_length=0):
        if (r.get("name") or "").startswith(VACANT_PREFIX):
            names.append(r.get("name"))
    held = {}
    for part in chunks(names):
        for e in frappe.get_all("Employee",
                                filters=[["custom_role_profile", "in", part], ["status", "=", "Active"]],
                                fields=["custom_role_profile"], limit_page_length=0):
            held[e.get("custom_role_profile")] = 1
    return [n for n in names if not held.get(n)]


def is_vacant_name(n):
    return (n or "")[:6].lower() == "vacant"


def covers_unheld(top, covered, covers):
    # Role Profiles below `top`, at any level, that no Active Employee holds —
    # walked down the Role Profile tree through seats with no live holder
    # (unheld, or "Vacant_" placeholders only), as owner_seat climbs it from
    # an unheld seat to the first live one. So an unheld BE under an unheld
    # ABM is the RBM's. Placeholder seats are not added here: the
    # reporting-chain walk finds them.
    if not top:
        return
    frontier = [top]
    reached = {top: 1}
    hops = 0
    while frontier and hops < 8:
        hops = hops + 1
        kids = []
        for part in chunks(frontier):
            for r in frappe.get_all("Role Profile", filters=[["parent_role_profile", "in", part]],
                                    fields=["name"], limit_page_length=0):
                if not reached.get(r.get("name")):
                    reached[r.get("name")] = 1
                    kids.append(r.get("name"))
        held = {}
        live = {}
        for part in chunks(kids):
            for e in frappe.get_all("Employee",
                                    filters=[["custom_role_profile", "in", part], ["status", "=", "Active"]],
                                    fields=["custom_role_profile", "employee_name"], limit_page_length=0):
                held[e.get("custom_role_profile")] = 1
                if not is_vacant_name(e.get("employee_name")):
                    live[e.get("custom_role_profile")] = 1
        below = []
        for k in kids:
            if live.get(k):
                continue
            below.append(k)
            if not held.get(k) and not covered.get(k):
                covered[k] = 1
                covers.append({"seat": k, "holder": None})
        frontier = below


def owner_seat(s):
    # The seat whose approval carries `s`'s lines — as the ERP's tracker
    # script (src/app/tracker/server/support_tracker_on_save.py) raises it:
    # `s` itself when someone real holds it; else the nearest seat above with
    # a live holder, up reports_to from its placeholder holder, or up the
    # Role Profile tree when no one holds it.
    holders = frappe.get_all("Employee", filters={"custom_role_profile": s, "status": "Active"},
                             fields=["employee_name", "reports_to"], limit=20)
    climb = None
    for h in holders:
        if not is_vacant_name(h.get("employee_name")):
            return s
        if climb is None:
            climb = h.get("reports_to")
    if holders:
        cur = climb
        hops = 0
        while cur and hops < 15:
            hops = hops + 1
            m = frappe.db.get_value("Employee", cur,
                                    ["employee_name", "status", "reports_to", "custom_role_profile"], as_dict=True)
            if not m:
                break
            if m.get("status") == "Active" and not is_vacant_name(m.get("employee_name")) and m.get("custom_role_profile"):
                return m.get("custom_role_profile")
            cur = m.get("reports_to")
        return s
    cur = frappe.db.get_value("Role Profile", s, "parent_role_profile")
    hops = 0
    while cur and hops < 15:
        hops = hops + 1
        for h in frappe.get_all("Employee", filters={"custom_role_profile": cur, "status": "Active"},
                                fields=["employee_name"], limit=20):
            if not is_vacant_name(h.get("employee_name")):
                return cur
        cur = frappe.db.get_value("Role Profile", cur, "parent_role_profile")
    return s


me = frappe.session.user
month = frappe.form_dict.get("month") or ""
if not valid_month(month):
    month = month_before(frappe.utils.nowdate()[:7])
first = month + "-01"
last = str(frappe.utils.get_last_day(first))
in_month = ["date", "between", [first, last]]

own_seat = ""
own_employee = ""
emp = frappe.get_list("Employee",
                      filters={"user_id": me, "status": "Active"},
                      fields=["name", "role_id", "custom_role_profile"],
                      limit_page_length=1)
if emp:
    own_employee = emp[0].get("name") or ""
    # custom_role_profile, as the ERP's tracker scripts route on it: role_id
    # is stale for some people (an old seat, e.g. from before a promotion).
    own_seat = emp[0].get("custom_role_profile") or emp[0].get("role_id") or ""
# `seat` picks whose lines to show within entries the caller can already
# see (the whole entry was theirs to read). It never widens the tracker
# read below, which is the caller's OWN seat only.
seat = frappe.form_dict.get("seat") or own_seat
vacant_seats = vacant_under(own_seat) if own_seat else []

# ---- every vacant seat the caller covers: the unheld BE seats right under
# their seat (vacant_seats), and the seats held only by "Vacant_"
# placeholders below them in the reporting chain.
covers = []
covered = {}
for s in vacant_seats:
    covered[s] = 1
    covers.append({"seat": s, "holder": None})
if own_employee:
    frontier = [own_employee]
    reached = {own_employee: 1}
    hops = 0
    while frontier and hops < 8:
        hops = hops + 1
        below = []
        for part in chunks(frontier):
            for e in frappe.get_all("Employee",
                                    filters=[["reports_to", "in", part], ["status", "=", "Active"]],
                                    fields=["name", "employee_name", "custom_role_profile"],
                                    limit_page_length=0):
                if reached.get(e.get("name")) or not is_vacant_name(e.get("employee_name")):
                    continue
                reached[e.get("name")] = 1
                below.append(e.get("name"))
                s = e.get("custom_role_profile")
                if not s or covered.get(s):
                    continue
                live = 0
                for h in frappe.get_all("Employee", filters={"custom_role_profile": s, "status": "Active"},
                                        fields=["employee_name"], limit_page_length=20):
                    if not is_vacant_name(h.get("employee_name")):
                        live = 1
                if not live:
                    covered[s] = 1
                    covers.append({"seat": s, "holder": e.get("employee_name")})
        frontier = below
covers_unheld(own_seat, covered, covers)
covering = bool(covered.get(seat))

# ---- A TEAM SEAT: `seat` held by someone UNDER the caller in the reporting
# chain (any depth), or any seat for the IT role profile. A manager may view
# their people's entries whole — the Entry screen's team tree opens them,
# read-only — though their own Department permission may not reach every
# one, so those reads go past permissions (frappe.get_all). Any other
# `seat` stays within what the caller may read (frappe.get_list).
in_team = covering
if seat and seat != own_seat and not in_team:
    if frappe.db.get_value("User", me, "role_profile_name") == "IT":
        in_team = True
    elif own_employee:
        holders = frappe.get_all("Employee", filters={"custom_role_profile": seat, "status": "Active"},
                                 fields=["reports_to"], limit_page_length=5)
        for h in holders:
            cur = h.get("reports_to")
            hops = 0
            while cur and hops < 10 and not in_team:
                if cur == own_employee:
                    in_team = True
                cur = frappe.db.get_value("Employee", cur, "reports_to")
                hops = hops + 1
            if in_team:
                break
        if not holders and own_seat:
            cur = frappe.db.get_value("Role Profile", seat, "parent_role_profile")
            hops = 0
            while cur and hops < 10 and not in_team:
                if cur == own_seat:
                    in_team = True
                cur = frappe.db.get_value("Role Profile", cur, "parent_role_profile")
                hops = hops + 1
lister = frappe.get_all if in_team else frappe.get_list

entries = []
products = []
addable = []
see_all = False

if seat:
    # ---- every entry the caller may see this month
    docs = lister(DOCTYPE, filters=[in_month],
                           fields=["name", "date", "doctor"],
                           order_by="name asc", limit_page_length=0)
    names = []
    by_name = {}
    for d in docs:
        n = d.get("name")
        names.append(n)
        by_name[n] = {
            "name": n,
            "date": str(d.get("date") or ""),
            "distributor__name": d.get("doctor"),
            "distributor": None,
            "items": [],
            "other_items": [],
            "custom_status_tracker": [],
        }

    # ---- THE SEAT'S DOCTORS: those whose Lead lists the seat (its Role
    # Profile table), for ADDABLE below. Read past permissions
    # (frappe.get_all): only the names of the doctors assigned to the seat.
    assigned = {}
    for r in frappe.get_all("Role Profile Multiselect",
                            filters={"parenttype": "Lead", "role_profile_list": seat},
                            fields=["parent"], limit_page_length=0):
        assigned[r.get("parent")] = 1

    # The IT role profile is the one exception — the USER's role profile, as
    # Ring Nav's overview decides it (an IT person's Employee seat may be
    # empty or "Admin"): it sees every record of the month, with EVERY seat's
    # lines (each tagged with its own seat; the screen shows them read-only),
    # where everyone else gets only what is assigned to their seat, and only
    # that seat's lines. Not with a `seat` override: that is IT looking at a
    # seat, which then sees what that seat sees.
    see_all = (not frappe.form_dict.get("seat")) and frappe.db.get_value("User", me, "role_profile_name") == "IT"

    # ---- the seat's own lines (IT: every line)
    item_codes = []
    seen_items = {}
    for r in lister(
            DOCTYPE,
            filters=[in_month] if see_all else [["Support Items", F_SEAT, "=", seat], in_month],
            fields=["name",
                    LINE + ".name as line", LINE + ".idx as idx", LINE + ".item as item",
                    LINE + ".qty as sales_qty", LINE + "." + F_SEAT + " as line_seat",
                    LINE + "." + F_STATUS + " as custom_status", LINE + "." + F_HQ + " as custom_hq"],
            order_by=LINE + ".idx asc", limit_page_length=0):
        row = by_name.get(r.get("name"))
        code = r.get("item")
        if not row or not code:
            continue
        row["items"].append({
            "name": r.get("line"),
            "item__name": code,
            "custom_status": r.get("custom_status"),
            "sales_qty": num(r.get("sales_qty")),
            "closing_qty": 0,
            "custom_hq__name": r.get("custom_hq"),
            "custom_role_profile__name": r.get("line_seat") if see_all else seat,
        })
        if code and not seen_items.get(code):
            seen_items[code] = 1
            item_codes.append(code)

    # An entry is the seat's when the seat has lines on it — the bulk load's,
    # or its own "Add doctor" (elbrit_doctor_support_add). A record another
    # seat created for a doctor this seat also has is NOT shown until this
    # seat adds the doctor: it lists in `addable` instead. IT (see_all,
    # above) sees every record of the month.
    mine = []
    has_lines = {}
    for n in names:
        row = by_name[n]
        if row["items"]:
            has_lines[row["distributor__name"]] = 1
        if see_all or row["items"]:
            mine.append(n)
    names = mine

    # ---- other seats' products, as names only (IT has every line already)
    for r in ([] if see_all else lister(
            DOCTYPE,
            filters=[["Support Items", F_SEAT, "!=", seat], in_month],
            fields=["name", LINE + ".item as item"],
            limit_page_length=0)):
        row = by_name.get(r.get("name"))
        code = r.get("item")
        if row and code and code not in row["other_items"]:
            row["other_items"].append(code)

    # ---- the seat's approval row, and its tracker's state and note: its own,
    # or — a vacant seat's lines roll up onto its covering manager's approval
    # — its OWNER's, sent as this seat's (the screen reads one per seat).
    tracker_seat = seat if see_all else owner_seat(seat)
    approval_of = {}
    for r in lister(
            DOCTYPE,
            filters=[["secondary tracker", "role_profile", "in", [seat, tracker_seat]], in_month],
            fields=["name", MIRROR + ".role_profile as rp", MIRROR + ".status as st",
                    MIRROR + ".tracker as tracker"],
            limit_page_length=0):
        n = r.get("name")
        if by_name.get(n) and (r.get("rp") == seat or not approval_of.get(n)):
            approval_of[n] = r
    tracker_rows = []
    for n in approval_of:
        r = approval_of[n]
        t = {"role_profile__name": seat, "status__name": r.get("st"),
             "tracker__name": r.get("tracker"), "tracker": None, "rp": r.get("rp")}
        by_name[n]["custom_status_tracker"].append(t)
        tracker_rows.append(t)
    # A read past permissions: the state and note of the caller's own (or a
    # team seat's) trackers — a BE cannot read Operational Tracker, and without
    # the note a revisit never shows. Never for any other `seat`.
    for t in tracker_rows:
        tn = t.get("tracker__name")
        rp = t.pop("rp")
        if tn and (seat == own_seat or in_team) and tn.endswith("-" + rp):
            v = frappe.db.get_value("Operational Tracker", tn,
                                    ["workflow_state", "reason_for_rejection"], as_dict=True)
            if v:
                t["tracker"] = {"workflow_state__name": v.get("workflow_state"),
                                "reason_for_rejection": v.get("reason_for_rejection")}

    # ---- TRACKER WINS once the approval has DECIDED. An approved (or
    # rejected) approval row proves the seat submitted, so its lines are
    # reported as "Submitted" even where the document still says "Draft"
    # (entries created with trackers but never submitted through the app).
    # The screen treats a Draft line as not submitted; this keeps that rule
    # for what it is for — a stockist sent back and being edited again (its
    # approval WAITING) — and stops it overriding a decision. Reporting only:
    # nothing is written, and a save reads the document fresh.
    for n in names:
        row = by_name[n]
        decided = False
        for t in row["custom_status_tracker"]:
            st = ((t.get("tracker") or {}).get("workflow_state__name")
                  or t.get("status__name") or "").lower()
            if "rejected" in st:
                decided = True
            elif ("approved" in st or "verified" in st) and not st.endswith("approval waiting"):
                decided = True
        if decided:
            for line in row["items"]:
                if (line.get("custom_status") or "").lower() == "draft":
                    line["custom_status"] = "Submitted"

    # ---- the doctors' identity (the Lead: name, code, specialty, city, HQ)
    dist_codes = []
    for n in names:
        c = by_name[n]["distributor__name"]
        if c and c not in dist_codes:
            dist_codes.append(c)
    dist = {}
    for part in chunks(dist_codes):
        for c in lister("Lead", filters=[["name", "in", part]],
                                 fields=["name", "lead_name", "custom_specialty",
                                         "city", "territory"],
                                 limit_page_length=0):
            bits = []
            if c.get("custom_specialty"):
                bits.append(c.get("custom_specialty"))
            if c.get("city"):
                bits.append(c.get("city"))
            dist[c.get("name")] = {
                "name": c.get("name"),
                "customer_name": c.get("lead_name") or c.get("name"),
                "whg_ebs_code": c.get("name"),
                "whg_other_ebs_codes": None,
                "territory__name": c.get("territory"),
                "note": " · ".join(bits) or None,
            }

    # ---- WHICH PRODUCTS: the seat's department's, as getUniqueItemsByDep
    # decides them — Items in the Products group (descendants inclusive)
    # whose Department Details table lists the department, on a row valid
    # today (valid_from <= today <= valid_to, either end open). The
    # department is the seat's Employee's (read past permissions: that one
    # field). IT (see_all) and a seat with no department are offered every
    # product of the group.
    dept = None
    if not see_all:
        seat_holders = frappe.get_all("Employee",
                                      filters={"custom_role_profile": seat, "status": "Active"},
                                      fields=["department"], limit_page_length=5)
        for h in seat_holders:
            if h.get("department"):
                dept = h.get("department")
                break
        # a seat no one holds: its Role Profile's own department
        if not seat_holders:
            dept = frappe.db.get_value("Role Profile", seat, "custom_department")
    sold = None
    if dept:
        sold = {}
        today = frappe.utils.nowdate()
        for r in frappe.get_all(
                "Item",
                filters=[["Elbrit Department Table", "elbrit_department", "in", [dept]],
                         ["Item", "item_group", "descendants of (inclusive)", "Products"]],
                fields=["name",
                        "`tabElbrit Department Table`.`valid_from` as valid_from",
                        "`tabElbrit Department Table`.`valid_to` as valid_to"],
                group_by="`tabElbrit Department Table`.name",
                limit_page_length=0):
            vf = str(r.get("valid_from") or "")
            vt = str(r.get("valid_to") or "")
            if (not vf or vf <= today) and (not vt or vt >= today):
                sold[r.get("name")] = 1

    # ---- the products: the picker's list, and the prices lines are valued
    # at (a line's product outside the list is still priced, below)
    price = {}
    for it in frappe.get_list(
            "Item",
            filters=[["item_group", "descendants of (inclusive)", "Products"]],
            fields=["name", "item_name", "brand", "custom_last_mrp",
                    "custom_last_ptr", "custom_last_pts"],
            order_by="item_name asc", limit_page_length=0):
        if sold is not None and not sold.get(it.get("name")):
            continue
        products.append({
            "name": it.get("name"),
            "item_name": it.get("item_name"),
            "brand__name": it.get("brand"),
            "custom_last_mrp": num(it.get("custom_last_mrp")),
            "custom_last_ptr": num(it.get("custom_last_ptr")),
            "custom_last_pts": num(it.get("custom_last_pts")),
        })
        price[it.get("name")] = products[-1]
    missing = []
    for code in item_codes:
        if not price.get(code):
            missing.append(code)
    for part in chunks(missing):
        # Past permissions: only the price, for a line's product the caller
        # may not read (it is on their line all the same).
        for it in frappe.get_all("Item", filters=[["name", "in", part]],
                                  fields=["name", "item_name", "custom_last_mrp",
                                          "custom_last_ptr", "custom_last_pts"],
                                  limit_page_length=0):
            price[it.get("name")] = {
                "custom_last_mrp": num(it.get("custom_last_mrp")),
                "custom_last_ptr": num(it.get("custom_last_ptr")),
                "custom_last_pts": num(it.get("custom_last_pts")),
            }

    # ---- ADDABLE: the seat's own Active doctors not on its list this month,
    # for "Add doctor" — the caller's own seat only (not a team seat, a
    # covered vacant seat or IT's view), and only for THE PREVIOUS MONTH, the
    # one elbrit_doctor_support_add creates for — any other month sends
    # `addable: null`, and the screen offers no "Add doctor". Read past
    # permissions: only the names of the doctors assigned to the seat.
    if month != month_before(frappe.utils.nowdate()[:7]):
        addable = None
    elif seat == own_seat and not see_all and not covering:
        codes = [c for c in assigned if not has_lines.get(c)]
        for part in chunks(codes):
            for c in frappe.get_all("Lead", filters=[["name", "in", part], ["status", "=", "Active"]],
                                    fields=["name", "lead_name", "custom_specialty", "city"],
                                    limit_page_length=0):
                bits = []
                if c.get("custom_specialty"):
                    bits.append(c.get("custom_specialty"))
                if c.get("city"):
                    bits.append(c.get("city"))
                addable.append({"name": c.get("name"), "customer_name": c.get("lead_name") or c.get("name"),
                                "note": " · ".join(bits) or None})
        addable.sort(key=lambda a: (a.get("customer_name") or "").lower())

    for n in names:
        row = by_name[n]
        row["distributor"] = dist.get(row["distributor__name"]) or {
            "name": row["distributor__name"], "customer_name": row["distributor__name"],
            "whg_ebs_code": row["distributor__name"], "whg_other_ebs_codes": None,
            "territory__name": None, "note": None}
        for line in row["items"]:
            p = price.get(line["item__name"]) or {}
            pts = num(p.get("custom_last_pts"))
            line["custom_last_pts"] = pts
            line["custom_last_ptr"] = num(p.get("custom_last_ptr"))
            line["custom_last_mrp"] = num(p.get("custom_last_mrp"))
            line["sales_value"] = round(line["sales_qty"] * pts, 2)
            line["closing_balance"] = 0
        entries.append(row)


frappe.response["message"] = {
    "user": me,
    "seat": seat or None,
    "covering": covering,
    "covers": covers,
    "vacant_seats": vacant_seats,
    "read_only": see_all,
    "month": month,
    "entries": entries,
    "products": products,
    "addable": addable,
}
