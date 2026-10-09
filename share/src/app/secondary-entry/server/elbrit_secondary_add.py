# =====================================================================
# SERVER SCRIPT — the source of truth for the ERP's copy. Keep in step.
#
#   Name        : Elbrit Secondary Add
#   Script Type : API
#   API Method  : elbrit_secondary_add
#   Allow Guest : NO
#
#   POST /api/method/elbrit_secondary_add
#        { "stockists": ["Medisure", "Lal Sons"] }
#        { "stockists": [...], "seat": "BE3-..." }   a vacant seat the caller covers
#        (or, for an EXTRA USER, any seat under theirs — see EXTRA_USERS)
#
# The Secondary Entry screen's "Add stockist" — Doctor Support's "Add
# doctor" (doctor-support/server/elbrit_doctor_support_add.py) for
# Secondary: puts the CALLER's seat on a stockist's Secondary Data Entry for
# the month, so the stockist shows on their screen and in their downloaded
# sheet.
#
# THE MONTH is ALWAYS THE PREVIOUS ONE, by today's date (in October:
# September). No other month can be created or joined from here.
#
# PER STOCKIST:
#   - no Secondary Data Entry for the stockist that month: one is CREATED,
#     named and dated as the bulk load makes them ("Medisure-2026-09-01",
#     dated the month's FIRST day, price list "PTS Billing")
#   - one exists (the bulk load's, or another seat's): the caller's lines are
#     ADDED to it; every other seat's lines are left as they are
#   - the caller's seat already has lines on it: nothing is done (skipped)
# Either way the seat gets ONE LINE PER PRODUCT of its own — sales, closing,
# opening and primary all 0, rate the product's PTS, status Draft, the
# seat's HQ / department.
#
# WHOSE STOCKISTS: only the caller's own — an enabled Customer whose Role
# Profile table lists their seat. Anything else in `stockists` is skipped.
# Only a real holder's seat (an Active Employee for the user, not a
# "Vacant_" placeholder).
#
# A COVERED VACANT SEAT (`seat`): a manager adds a vacant seat's stockists
# for it, as elbrit_secondary_entry lets them enter for it (`covering`). The
# seat must roll up to the caller's — owner_seat, the tracker's own routing:
# the nearest live seat above it is the caller's. The lines carry the vacant
# seat (its approval still lands on the caller, via the tracker), with the
# seat's own department and HQ: its holder's (a "Vacant_" placeholder's,
# when it has one), else the stockist's HQ for that seat (its Role Profile
# row), else the Role Profile's. The Seat Guard limits only BEs to their own
# seat, so a manager's save passes it.
#
# WHICH PRODUCTS: as elbrit_secondary_entry sends them to the picker — Items
# in the Products group the caller may read (frappe.get_list: the ERP's
# permission rules), narrowed to their department's on a row valid today.
#
# AS THE CALLER: get_doc().insert() / .save() check the ERP's permissions,
# and the entry's own Before Save scripts (Seat Guard, Totals, "Secondary
# tracker on save") run as on any save; Draft lines raise no tracker.
#
# LIMIT: at most MAX_PARTIES per call — the screen sends no more.
#
# Answer: { month, seat, created: [name], added: [name], skipped: [{ doctor, reason }] }
# (`doctor` names the stockist — the same answer shape as Add doctor, so the
# screen reads both.)
#
# safe_exec: no import, no .format(), no set literals, no tuple
# unpacking, no underscore-prefixed names.
# =====================================================================

DOCTYPE = "Secondary Data Entry"
MAX_PARTIES = 20
PRICE_LIST = "PTS Billing"


def month_before(m):
    y = int(m[:4])
    mo = int(m[5:])
    if mo == 1:
        return str(y - 1) + "-12"
    return str(y) + "-" + ("0" if mo - 1 < 10 else "") + str(mo - 1)


def num(v):
    try:
        return float(v or 0)
    except Exception:
        return 0.0


def is_vacant_name(n):
    return (n or "")[:6].lower() == "vacant"


def owner_seat(s):
    # The seat whose approval carries `s`'s lines — as in
    # elbrit_secondary_entry and the tracker script: `s` itself when someone
    # real holds it; else the nearest seat above with a live holder, up
    # reports_to from its placeholder holder, or up the Role Profile tree
    # when no one holds it.
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


# EXTRA USERS: may add for any seat under their own (the Role Profile tree,
# any depth), as they enter and approve for it — the list in Elbrit
# Secondary Entry / Elbrit Doctor Support Entry; change them all together.
EXTRA_USERS = ["kamesh@elbrit.org", "ramu@elbrit.org", "rahulbhargav@elbrit.org"]


def seat_under(s, top):
    # True when `top` is above `s` in the Role Profile tree.
    cur = frappe.db.get_value("Role Profile", s, "parent_role_profile")
    hops = 0
    while cur and hops < 15:
        if cur == top:
            return True
        hops = hops + 1
        cur = frappe.db.get_value("Role Profile", cur, "parent_role_profile")
    return False


me = frappe.session.user
# ALWAYS THE PREVIOUS MONTH: secondary is entered for the month just gone,
# so a record is only ever created (or joined) for it — today's date
# decides, never the caller.
month = month_before(frappe.utils.nowdate()[:7])
first = month + "-01"
last = str(frappe.utils.get_last_day(first))

asked = frappe.form_dict.get("stockists") or []
if isinstance(asked, str):
    asked = frappe.parse_json(asked) or []
parties = []
for d in asked:
    d = str(d or "").strip()
    if d and d not in parties:
        parties.append(d)
if not parties:
    frappe.throw("Pick at least one stockist to add.")
if len(parties) > MAX_PARTIES:
    frappe.throw("Add at most " + str(MAX_PARTIES) + " stockists at a time.")

# ---- the caller: their Active Employee, a real holder of a seat
emp = frappe.get_all("Employee", filters={"user_id": me, "status": "Active"},
                     fields=["name", "employee_name", "custom_role_profile", "role_id",
                             "department", "custom_territory"],
                     limit_page_length=1)
if not emp:
    frappe.throw("No active Employee for this user, so there is no seat to add stockists to.")
emp = emp[0]
own_seat = emp.get("custom_role_profile") or emp.get("role_id") or ""
if not own_seat:
    frappe.throw("This user's Employee has no seat (role profile).")
if (emp.get("employee_name") or "").strip()[:6].lower() == "vacant":
    frappe.throw("A vacant placeholder cannot add stockists.")
seat = str(frappe.form_dict.get("seat") or "").strip() or own_seat
seat_hq = frappe.db.get_value("Role Profile", seat, "custom_territory")
if seat != own_seat:
    # ---- a vacant seat that rolls up to the caller's, or — for an EXTRA
    # USER — any seat under theirs, held or not
    if not frappe.db.exists("Role Profile", seat):
        frappe.throw("No such seat: " + seat)
    if owner_seat(seat) != own_seat and not (me in EXTRA_USERS and seat_under(seat, own_seat)):
        frappe.throw("You do not cover " + seat + ", so you cannot add its stockists.")
    # Its holder: an Active one first (its live BE for an extra user's team
    # seat, else a "Vacant_" placeholder), else whoever held it last.
    holder = frappe.get_all("Employee", filters={"custom_role_profile": seat},
                            fields=["name", "department", "custom_territory"],
                            order_by="status asc, modified desc", limit_page_length=1)
    holder = holder[0] if holder else {}
    dept = holder.get("department") or frappe.db.get_value("Role Profile", seat, "custom_department")
    hq = holder.get("custom_territory")
else:
    dept = emp.get("department") or frappe.db.get_value("Role Profile", seat, "custom_department")
    hq = emp.get("custom_territory")

# ---- WHOSE STOCKISTS: the seat's (Customer's Role Profile table), enabled
# assigned[stockist] = the HQ on the stockist's row for the seat (or "")
assigned = {}
for r in frappe.get_all("Role Profile Multiselect",
                        filters=[["parenttype", "=", "Customer"], ["role_profile_list", "=", seat],
                                 ["parent", "in", parties]],
                        fields=["parent", "hq"], limit_page_length=0):
    assigned[r.get("parent")] = r.get("hq") or assigned.get(r.get("parent")) or ""
enabled = {}
for r in frappe.get_all("Customer", filters=[["name", "in", parties], ["disabled", "=", 0]],
                        fields=["name"], limit_page_length=0):
    enabled[r.get("name")] = 1

# ---- WHICH PRODUCTS: the department's, valid today, that the caller may read
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
products = []
for it in frappe.get_list(
        "Item",
        filters=[["item_group", "descendants of (inclusive)", "Products"]],
        fields=["name", "custom_last_pts"],
        order_by="item_name asc", limit_page_length=0):
    if sold is not None and not sold.get(it.get("name")):
        continue
    products.append(it)
if not products:
    frappe.throw("No products for your department, so there is nothing to add.")


def seat_lines(target, line_hq):
    # One Draft line per product, for this seat, on `target`.
    for p in products:
        pts = num(p.get("custom_last_pts"))
        target.append("items", {
            "item": p.get("name"), "rate": pts,
            "opening_qty": 0, "primary_sales": 0,
            "sales_qty": 0, "sales_value": 0, "closing_qty": 0, "closing_balance": 0,
            "custom_role_profile": seat, "custom_status": "Draft",
            "custom_hq": line_hq, "custom_department": dept,
        })


def existing_for(d):
    found = frappe.get_all(DOCTYPE, filters=[["distributor", "=", d], ["date", "between", [first, last]]],
                           fields=["name"], order_by="creation asc", limit_page_length=1)
    return found[0].get("name") if found else None


def add_to(name, line_hq):
    # The seat's lines onto an existing record: True when added, False when
    # the seat already has lines there.
    doc = frappe.get_doc(DOCTYPE, name)
    for line in (doc.get("items") or []):
        if line.get("custom_role_profile") == seat:
            return False
    seat_lines(doc, line_hq)
    doc.save()
    return True


created = []
added = []
skipped = []
for d in parties:
    if d not in assigned:  # its HQ is often blank: "" still means assigned
        skipped.append({"doctor": d, "reason": "not your stockist"})
        continue
    if not enabled.get(d):
        skipped.append({"doctor": d, "reason": "disabled"})
        continue
    line_hq = hq or assigned.get(d) or seat_hq
    name = existing_for(d)
    try:
        if name:
            if add_to(name, line_hq):
                added.append(name)
            else:
                skipped.append({"doctor": d, "reason": "already on your list"})
            continue
        doc = frappe.get_doc({"doctype": DOCTYPE, "distributor": d, "date": first,
                              "custom_price_list": PRICE_LIST})
        doc.name = d + "-" + first
        doc.flags.update({"name_set": True})
        seat_lines(doc, line_hq)
        doc.insert()
        created.append(doc.name)
    except Exception as e:
        # Another seat created it a moment ago: add to theirs instead.
        name = existing_for(d)
        if not name:
            skipped.append({"doctor": d, "reason": str(e)[:200]})
            continue
        try:
            if add_to(name, line_hq):
                added.append(name)
            else:
                skipped.append({"doctor": d, "reason": "already on your list"})
        except Exception as e2:
            skipped.append({"doctor": d, "reason": str(e2)[:200]})

frappe.response["message"] = {
    "month": month,
    "seat": seat,
    "created": created,
    "added": added,
    "skipped": skipped,
}
