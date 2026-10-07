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
# The Secondary Entry screen's data for the CALLER. READ-ONLY (saving stays
# the app's REST get -> save of the whole document).
#
# WHICH ENTRIES: the month's Secondary Data Entries the SEAT has lines on
# (the bulk load's, or its own "Add stockist" — elbrit_secondary_add).
# WHICH LINES: only the seat's; other seats' products as names only.
#
# ADDABLE: the seat's other stockists — enabled Customers whose Role Profile
# table lists the seat, with no lines of the seat this month — for "Add
# stockist". The caller's own seat only, and only when `month` is the
# previous month (the only one "Add stockist" creates for); otherwise null.
#
# VACANT BE SEATS: a BE Role Profile no Active Employee holds is covered by
# the seat directly above it (the ABM). The answer lists them in
# `vacant_seats`; the ABM opens one with ?seat=<vacant seat>, and gets
# `covering: true` — that seat's entries, read past permissions, to fill in
# as the BE would. Only that vacant seat's stockists and lines; never any
# other BE's.
#
# PLACEHOLDER SEATS too: a seat whose every Active holder is a "Vacant_"
# placeholder Employee is vacant as well. It is covered by the nearest LIVE
# manager up the reporting chain (reports_to) — as the ERP's tracker scripts
# route a vacant seat's lines — walked down from the caller through vacant
# placeholders only, so a vacant BE under a vacant ABM is the RBM's.
#
# UNHELD SEATS AT ANY LEVEL: a Role Profile no Active Employee holds — an
# ABM or RBM seat as well as a BE — is covered by the nearest live seat up
# the Role Profile tree, walked down from the caller's seat through seats
# with no live holder (covers_unheld). An unheld BE under an unheld ABM is
# the RBM's.
# `covers` lists every kind, [{ seat, holder }] (holder None for a seat no
# one holds); `covering` is true for either.
#
# IT with no `seat` (`read_only`) gets every entry of the month with every
# seat's lines, each tagged with its own seat, to view read-only.
#
# Answer: { user, seat, covering, covers, vacant_seats, read_only, month, entries, products,
#           addable: [{ name, customer_name, note }] | null }
#
# safe_exec: no import, no .format(), no set literals, no tuple
# unpacking, no underscore-prefixed names.
# =====================================================================

LINE = "`tabSecondary Data Table`"
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
    own_seat = emp[0].get("custom_role_profile") or emp[0].get("role_id") or ""
seat = frappe.form_dict.get("seat") or own_seat
vacant_seats = vacant_under(own_seat) if own_seat else []
covering = bool(seat) and seat in vacant_seats


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
    # script (src/app/tracker/server/secondary_tracker_on_save.py) raises it:
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
# Each covered seat's HQ (its Role Profile's territory), shown beside it.
for c in covers:
    c["hq"] = frappe.db.get_value("Role Profile", c.get("seat"), "custom_territory")
covering = covering or bool(covered.get(seat))

# ---- EXTRA USERS: may see, ENTER and approve for every seat under their
# own (the Role Profile tree, any depth), as the seat's holder would. The
# list is copied by hand into Elbrit Doctor Support Entry, Elbrit Ring Nav, Operational Tracker Restriction and the
# "Approval flow" steps (scripts/erp/approval-flow-extra.mjs): change them all together.
# `enters` lists those seats' live holders (the team tree offers "Enter" on
# them); `entering` is true when `seat` is one, which opens it editable and
# reads it past permissions, as a covered seat is.
EXTRA_USERS = ["kamesh@elbrit.org", "ramu@elbrit.org"]
enters = []
entering = False
if me in EXTRA_USERS and own_seat:
    below = {}
    frontier = [own_seat]
    hops = 0
    while frontier and hops < 10:
        hops = hops + 1
        nxt = []
        for part in chunks(frontier):
            for r in frappe.get_all("Role Profile", filters=[["parent_role_profile", "in", part]],
                                    fields=["name"], limit_page_length=0):
                if not below.get(r.get("name")):
                    below[r.get("name")] = 1
                    nxt.append(r.get("name"))
        frontier = nxt
    below_seats = list(below.keys())
    live_holder = {}
    for part in chunks(below_seats):
        for e in frappe.get_all("Employee",
                                filters=[["custom_role_profile", "in", part], ["status", "=", "Active"]],
                                fields=["custom_role_profile", "employee_name"], limit_page_length=0):
            if not is_vacant_name(e.get("employee_name")):
                live_holder[e.get("custom_role_profile")] = e.get("employee_name")
    for s in below_seats:
        if live_holder.get(s) and not covered.get(s):
            enters.append({"seat": s, "holder": live_holder[s],
                           "hq": frappe.db.get_value("Role Profile", s, "custom_territory")})
    entering = bool(seat) and seat != own_seat and bool(below.get(seat))

# ---- A TEAM SEAT: `seat` held by someone under the caller (any depth), a
# vacant seat under the caller's seat in the Role Profile tree, or any seat
# for the IT role profile. Those reads go past permissions (frappe.get_all).
in_team = covering or entering
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

    assigned = {}
    for r in frappe.get_all("Role Profile Multiselect",
                            filters={"parenttype": "Customer", "role_profile_list": seat},
                            fields=["parent"], limit_page_length=0):
        assigned[r.get("parent")] = 1

    # IT with no `seat` sees every entry of the month with EVERY seat's lines,
    # each tagged with its own seat (the screen shows them read-only).
    see_all = (not frappe.form_dict.get("seat")) and frappe.db.get_value("User", me, "role_profile_name") == "IT"

    item_codes = []
    seen_items = {}
    for r in lister(
            "Secondary Data Entry",
            filters=[in_month] if see_all else [["Secondary Data Table", "custom_role_profile", "=", seat], in_month],
            fields=["name",
                    LINE + ".name as line", LINE + ".idx as idx", LINE + ".item as item",
                    LINE + ".sales_qty as sales_qty", LINE + ".closing_qty as closing_qty",
                    LINE + ".custom_role_profile as line_seat",
                    LINE + ".custom_status as custom_status", LINE + ".custom_hq as custom_hq"],
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
            "closing_qty": num(r.get("closing_qty")),
            "custom_hq__name": r.get("custom_hq"),
            "custom_role_profile__name": r.get("line_seat") if see_all else seat,
        })
        if not seen_items.get(code):
            seen_items[code] = 1
            item_codes.append(code)

    # An entry is the seat's when the seat has lines on it — the bulk load's,
    # or its own "Add stockist" (elbrit_secondary_add). A stockist assigned to
    # the seat with none of its lines is NOT shown: it lists in `addable`
    # instead. IT (see_all) sees every entry of the month.
    mine = []
    has_lines = {}
    for n in names:
        row = by_name[n]
        if row["items"]:
            has_lines[row["distributor__name"]] = 1
        if see_all or row["items"]:
            mine.append(n)
    names = mine

    for r in ([] if see_all else lister(
            "Secondary Data Entry",
            filters=[["Secondary Data Table", "custom_role_profile", "!=", seat], in_month],
            fields=["name", LINE + ".item as item"],
            limit_page_length=0)):
        row = by_name.get(r.get("name"))
        code = r.get("item")
        if row and code and code not in row["other_items"]:
            row["other_items"].append(code)

    # ---- the seat's approval row: its own, or — a vacant seat's lines roll
    # up onto its covering manager's approval — its OWNER's, sent as this
    # seat's (the screen reads one approval per seat).
    tracker_seat = seat if see_all else owner_seat(seat)
    approval_of = {}
    for r in lister(
            "Secondary Data Entry",
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
    for t in tracker_rows:
        tn = t.get("tracker__name")
        rp = t.pop("rp")
        if tn and (seat == own_seat or in_team) and tn.endswith("-" + rp):
            v = frappe.db.get_value("Operational Tracker", tn,
                                    ["workflow_state", "reason_for_rejection"], as_dict=True)
            if v:
                t["tracker"] = {"workflow_state__name": v.get("workflow_state"),
                                "reason_for_rejection": v.get("reason_for_rejection")}

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

    # Department: the seat's Employee's, else the Role Profile's own (a
    # vacant seat has no Employee).
    dept = None
    if not see_all:
        seat_holders = frappe.get_all("Employee",
                                      filters={"custom_role_profile": seat, "status": "Active"},
                                      fields=["department"], limit_page_length=5)
        for h in seat_holders:
            if h.get("department"):
                dept = h.get("department")
                break
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
        for it in frappe.get_all("Item", filters=[["name", "in", part]],
                                 fields=["name", "item_name", "custom_last_mrp",
                                         "custom_last_ptr", "custom_last_pts"],
                                 limit_page_length=0):
            price[it.get("name")] = {
                "custom_last_mrp": num(it.get("custom_last_mrp")),
                "custom_last_ptr": num(it.get("custom_last_ptr")),
                "custom_last_pts": num(it.get("custom_last_pts")),
            }

    # ---- ADDABLE: the seat's own enabled stockists not on its list this
    # month, for "Add stockist" — the caller's own seat, or a vacant seat
    # they cover (its stockists are theirs to add: elbrit_secondary_add takes
    # the `seat`), never a team seat or IT's view; and only for THE PREVIOUS
    # MONTH, the one elbrit_secondary_add creates for — any other month sends
    # `addable: null`, and the screen offers no "Add stockist". Read past
    # permissions: only the names of the stockists assigned to the seat.
    if month != month_before(frappe.utils.nowdate()[:7]):
        addable = None
    elif not see_all and (seat == own_seat or covering):
        codes = [c for c in assigned if not has_lines.get(c)]
        for part in chunks(codes):
            for c in frappe.get_all("Customer", filters=[["name", "in", part], ["disabled", "=", 0]],
                                    fields=["name", "customer_name", "whg_ebs_code", "territory"],
                                    limit_page_length=0):
                bits = []
                if c.get("whg_ebs_code"):
                    bits.append(c.get("whg_ebs_code"))
                if c.get("territory"):
                    bits.append(c.get("territory"))
                addable.append({"name": c.get("name"), "customer_name": c.get("customer_name") or c.get("name"),
                                "note": " · ".join(bits) or None})
        addable.sort(key=lambda a: (a.get("customer_name") or "").lower())

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
    "covering": covering,
    "covers": covers,
    "enters": enters,
    "entering": entering,
    "vacant_seats": vacant_seats,
    "read_only": see_all,
    "month": month,
    "entries": entries,
    "products": products,
    "addable": addable,
}