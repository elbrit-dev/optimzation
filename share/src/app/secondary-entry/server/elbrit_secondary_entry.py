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
# WHICH ENTRIES: every Secondary Data Entry the caller may see for the
# month — frappe.get_list, so the "Secondary Data Entry Permission Query"
# decides. Nothing narrows them here.
#
# WHICH LINES: an entry carries several seats' lines; only the caller's
# seat's are sent (their active Employee's role_id, or `seat`). The other
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
emp = frappe.get_list("Employee",
                      filters={"user_id": me, "status": "Active"},
                      fields=["role_id", "custom_role_profile"],
                      limit_page_length=1)
if emp:
    own_seat = emp[0].get("role_id") or emp[0].get("custom_role_profile") or ""
# `seat` picks whose lines to show within entries the caller can already
# see (the whole entry was theirs to read). It never widens the tracker
# read below, which is the caller's OWN seat only.
seat = frappe.form_dict.get("seat") or own_seat

entries = []
products = []

if seat:
    # ---- every entry the caller may see this month
    docs = frappe.get_list("Secondary Data Entry", filters=[in_month],
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

    # ---- the seat's own lines
    item_codes = []
    seen_items = {}
    for r in frappe.get_list(
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

    # ---- other seats' products, as names only
    for r in frappe.get_list(
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
    for r in frappe.get_list(
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
    # The ONE read past permissions: the state and note of the caller's own
    # seat's trackers — a BE cannot read Operational Tracker, and without
    # the note a revisit never shows. Only when `seat` IS the caller's own.
    for t in tracker_rows:
        tn = t.get("tracker__name")
        if tn and seat == own_seat and tn.endswith("-" + own_seat):
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
        for c in frappe.get_list("Customer", filters=[["name", "in", part]],
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

    # ---- the products: the picker's list, and the prices lines are valued at
    price = {}
    for it in frappe.get_list(
            "Item",
            filters=[["item_group", "=", "Products"], ["disabled", "=", 0]],
            fields=["name", "item_name", "brand", "custom_last_mrp",
                    "custom_last_ptr", "custom_last_pts"],
            order_by="item_name asc", limit_page_length=0):
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
        for it in frappe.get_list("Item", filters=[["name", "in", part]],
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
