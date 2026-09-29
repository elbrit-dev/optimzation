# =====================================================================
# SERVER SCRIPT — the source of truth for the ERP's copy. Keep in step.
#
#   Name        : Elbrit Secondary Entry
#   Script Type : API
#   API Method  : elbrit_secondary_entry
#   Allow Guest : NO
#
#   GET /api/method/elbrit_secondary_entry                 last month
#   GET /api/method/elbrit_secondary_entry?month=2026-09
#   GET /api/method/elbrit_secondary_entry?seat=BE4-...    a seat override
#
# The Secondary Entry screen's data for the CALLER, in one call, with NO
# CAP and only what the screen shows. READ-ONLY (saving stays the app's
# REST get -> save of the whole document).
#
# WHICH ENTRIES: the Secondary Data Entries of the month that are the
# SEAT'S — their stockist's Customer lists the seat (its Role Profile
# table), or the seat already has lines on them — among those the caller
# may see (frappe.get_list: the ERP's permission rules).
#
# WHICH LINES: an entry carries several seats' lines; only the caller's
# seat's are sent (their active Employee's custom_role_profile, or `seat`). The other
# seats' products go as names only (`other_items`), so the picker can leave
# them out. This is what made the saved GraphQL query heavy: it sent every
# seat's lines of every entry (July, uncapped: 9 MB).
#
# VALUES as the saved query's transformer priced them: sales_value =
# sales_qty x the item's custom_last_pts, closing_balance = closing_qty x
# the same.
#
# AS THE TOKEN'S USER: every list is frappe.get_list, so the caller's ERP
# permissions decide what comes back — with ONE exception, below.
#
# THE SEAT'S APPROVAL ROW comes with its tracker's state and note, so a
# revisit shows. A BE's permissions do not reach Operational Tracker, so
# those two fields are read directly (frappe.db.get_value) — the one read
# past permissions — and ONLY for the caller's own seat's trackers, never
# for a `seat` override.
#
# Answer: { user, seat, month, entries: [<row>], products: [<item>] }
# A row is shaped as the SecondaryEntry query's node, so the screen reads
# it unchanged.
#
# safe_exec: no import, no .format(), no set literals, no tuple
# unpacking, no underscore-prefixed names.
# =====================================================================

LINE = "`tabSecondary Data Table`"
MIRROR = "`tabsecondary tracker`"
CHUNK = 500


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

# ---- A TEAM SEAT: `seat` held by someone UNDER the caller in the reporting
# chain (any depth), or any seat for the IT role profile. A manager may view
# their people's entries whole — the Entry screen's team tree opens them,
# read-only — though their own Department permission may not reach every
# one, so those reads go past permissions (frappe.get_all). Any other
# `seat` stays within what the caller may read (frappe.get_list).
in_team = False
if seat and seat != own_seat:
    if frappe.db.get_value("User", me, "role_profile_name") == "IT":
        in_team = True
    elif own_employee:
        for h in frappe.get_all("Employee", filters={"custom_role_profile": seat, "status": "Active"},
                                fields=["reports_to"], limit_page_length=5):
            cur = h.get("reports_to")
            hops = 0
            while cur and hops < 10 and not in_team:
                if cur == own_employee:
                    in_team = True
                cur = frappe.db.get_value("Employee", cur, "reports_to")
                hops = hops + 1
            if in_team:
                break
lister = frappe.get_all if in_team else frappe.get_list

entries = []
products = []

if seat:
    # ---- every entry the caller may see this month
    docs = lister("Secondary Data Entry", filters=[in_month],
                           fields=["name", "date", "distributor"],
                           order_by="name asc", limit_page_length=0)
    names = []
    by_name = {}
    for d in docs:
        n = d.get("name")
        names.append(n)
        by_name[n] = {
            "name": n,
            "date": str(d.get("date") or ""),
            "distributor__name": d.get("distributor"),
            "distributor": None,
            "items": [],
            "other_items": [],
            "custom_status_tracker": [],
        }

    # ---- WHICH ARE THE SEAT'S: the stockists whose Customer lists the seat
    # (its Role Profile table) — the ERP lets a BE read far more entries
    # than are theirs. Read past permissions (frappe.get_all): only the
    # names of the stockists assigned to the seat.
    assigned = {}
    for r in frappe.get_all("Role Profile Multiselect",
                            filters={"parenttype": "Customer", "role_profile_list": seat},
                            fields=["parent"], limit_page_length=0):
        assigned[r.get("parent")] = 1

    # ---- the seat's own lines
    item_codes = []
    seen_items = {}
    for r in lister(
            "Secondary Data Entry",
            filters=[["Secondary Data Table", "custom_role_profile", "=", seat], in_month],
            fields=["name",
                    LINE + ".name as line", LINE + ".idx as idx", LINE + ".item as item",
                    LINE + ".sales_qty as sales_qty", LINE + ".closing_qty as closing_qty",
                    LINE + ".custom_status as custom_status", LINE + ".custom_hq as custom_hq"],
            order_by=LINE + ".idx asc", limit_page_length=0):
        row = by_name.get(r.get("name"))
        if not row:
            continue
        code = r.get("item")
        row["items"].append({
            "name": r.get("line"),
            "item__name": code,
            "custom_status": r.get("custom_status"),
            "sales_qty": num(r.get("sales_qty")),
            "closing_qty": num(r.get("closing_qty")),
            "custom_hq__name": r.get("custom_hq"),
            "custom_role_profile__name": seat,
        })
        if code and not seen_items.get(code):
            seen_items[code] = 1
            item_codes.append(code)

    # An entry is the seat's when its stockist is assigned to the seat, or
    # the seat already has lines on it (never hide work already entered).
    # The IT role profile is the one exception — the USER's role profile, as
    # Ring Nav's overview decides it (an IT person's Employee seat may be
    # empty or "Admin"): it sees every record of the month; everyone else
    # only what is assigned to their seat. Not with a `seat` override: that
    # is IT looking at a seat, which then sees what that seat sees.
    see_all = (not frappe.form_dict.get("seat")) and frappe.db.get_value("User", me, "role_profile_name") == "IT"
    mine = []
    for n in names:
        row = by_name[n]
        if see_all or assigned.get(row["distributor__name"]) or row["items"]:
            mine.append(n)
    names = mine

    # ---- other seats' products, as names only
    for r in lister(
            "Secondary Data Entry",
            filters=[["Secondary Data Table", "custom_role_profile", "!=", seat], in_month],
            fields=["name", LINE + ".item as item"],
            limit_page_length=0):
        row = by_name.get(r.get("name"))
        code = r.get("item")
        if row and code and code not in row["other_items"]:
            row["other_items"].append(code)

    # ---- the seat's approval row, and its tracker's state and note
    tracker_rows = []
    for r in lister(
            "Secondary Data Entry",
            filters=[["secondary tracker", "role_profile", "=", seat], in_month],
            fields=["name", MIRROR + ".role_profile as rp", MIRROR + ".status as st",
                    MIRROR + ".tracker as tracker"],
            limit_page_length=0):
        row = by_name.get(r.get("name"))
        if row:
            t = {"role_profile__name": r.get("rp"), "status__name": r.get("st"),
                 "tracker__name": r.get("tracker"), "tracker": None}
            row["custom_status_tracker"].append(t)
            tracker_rows.append(t)
    # A read past permissions: the state and note of the caller's own (or a
    # team seat's) trackers — a BE cannot read Operational Tracker, and without
    # the note a revisit never shows. Never for any other `seat`.
    for t in tracker_rows:
        tn = t.get("tracker__name")
        if tn and (seat == own_seat or in_team) and tn.endswith("-" + seat):
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

    # ---- the stockists' identity (EBS codes, territory)
    dist_codes = []
    for n in names:
        c = by_name[n]["distributor__name"]
        if c and c not in dist_codes:
            dist_codes.append(c)
    dist = {}
    for part in chunks(dist_codes):
        for c in lister("Customer", filters=[["name", "in", part]],
                                 fields=["name", "customer_name", "whg_ebs_code",
                                         "whg_other_ebs_codes", "territory"],
                                 limit_page_length=0):
            dist[c.get("name")] = {
                "name": c.get("name"),
                "customer_name": c.get("customer_name"),
                "whg_ebs_code": c.get("whg_ebs_code"),
                "whg_other_ebs_codes": c.get("whg_other_ebs_codes"),
                "territory__name": c.get("territory"),
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
        for h in frappe.get_all("Employee",
                                filters={"custom_role_profile": seat, "status": "Active"},
                                fields=["department"], limit_page_length=5):
            if h.get("department"):
                dept = h.get("department")
                break
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

    for n in names:
        row = by_name[n]
        row["distributor"] = dist.get(row["distributor__name"])
        for line in row["items"]:
            p = price.get(line["item__name"]) or {}
            pts = num(p.get("custom_last_pts"))
            line["custom_last_pts"] = pts
            line["custom_last_ptr"] = num(p.get("custom_last_ptr"))
            line["custom_last_mrp"] = num(p.get("custom_last_mrp"))
            line["sales_value"] = round(line["sales_qty"] * pts, 2)
            line["closing_balance"] = round(line["closing_qty"] * pts, 2)
        entries.append(row)

frappe.response["message"] = {
    "user": me,
    "seat": seat or None,
    "month": month,
    "entries": entries,
    "products": products,
}
