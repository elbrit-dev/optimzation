# =====================================================================
# SERVER SCRIPT — the source of truth for the ERP's copy. Keep in step.
#
#   Name          : Support tracker on save
#   Script Type   : DocType Event
#   Reference     : Doctor Support
#   Event         : Before Save
#
# Doctor Support's copy of "Secondary tracker on save" (see
# secondary_tracker_on_save.py for the rule): each seat's approval raised
# once every line of the seat is Submitted, on its OWNER's tracker, routed
# to the first live approver above at that approver's level — and the same
# on resubmit after Rework. The workflow and its states are untouched.
#
# Doctor Support differs only in its fields: the lines are item_table
# (Support Items, valued by `amount`), the approval rows custom_approver_table,
# and the line fields are role_profile / status on UAT, custom_role_profile /
# custom_status on production — whichever this ERP has is used.
#
# safe_exec: no import, no .format(), no set literals, no tuple
# unpacking, no underscore-prefixed names.
# =====================================================================

CUTOFF = "2026-08-01"
OWNERS = {}
SUPPORT_META = frappe.get_meta("Support Items")
F_SEAT = "role_profile"
if not SUPPORT_META.has_field("role_profile") and SUPPORT_META.has_field("custom_role_profile"):
    F_SEAT = "custom_role_profile"
F_STATUS = "status"
if not SUPPORT_META.has_field("status") and SUPPORT_META.has_field("custom_status"):
    F_STATUS = "custom_status"


# A DocType Event script runs with its own locals: a function here sees
# frappe, but NOT this script's other names (constants, other functions).
# So each helper below is self-contained, and takes what it needs as
# arguments.


def owner_seat(seat, cache):
    # The seat whose tracker carries `seat`'s lines (cache: seat -> owner).
    if seat in cache:
        return cache[seat]
    found = seat
    holders = frappe.get_all("Employee", filters={"custom_role_profile": seat, "status": "Active"},
                             fields=["employee_name", "reports_to"], limit=20)
    live = False
    climb = None
    for h in holders:
        if (h.employee_name or "")[:6].lower() != "vacant":
            live = True
            break
        if climb is None:
            climb = h.reports_to
    if not live and holders:
        cur = climb
        hops = 0
        while cur and hops < 15:
            hops = hops + 1
            m = frappe.db.get_value("Employee", cur,
                                    ["employee_name", "status", "reports_to", "custom_role_profile"], as_dict=True)
            if not m:
                break
            if m.status == "Active" and (m.employee_name or "")[:6].lower() != "vacant" and m.custom_role_profile:
                found = m.custom_role_profile
                break
            cur = m.reports_to
    elif not live:
        cur = frappe.db.get_value("Role Profile", seat, "parent_role_profile")
        hops = 0
        while cur and hops < 15 and found == seat:
            hops = hops + 1
            for h in frappe.get_all("Employee", filters={"custom_role_profile": cur, "status": "Active"},
                                    fields=["employee_name"], limit=20):
                if (h.employee_name or "")[:6].lower() != "vacant":
                    found = cur
                    break
            cur = frappe.db.get_value("Role Profile", cur, "parent_role_profile")
    cache[seat] = found
    return found


def route(owner, prefer):
    # { user, level } — who approves the owner seat's tracker, and at which
    # level it waits for them. A seat may have more than one live holder, so
    # every live holder's chain is walked (up reports_to, past anyone who
    # cannot act) to its first approver; of those, the one at or above the
    # seat's normal next level wins — the lowest such — and `prefer` (the
    # tracker's current approver) whenever it is one of them, so a valid
    # approver is never moved. With only placeholder holders, the chain from
    # the first of them; with no one above, nobody, at the normal level.
    sales_map = {"BE": "ABM", "ABM": "RBM", "RBM": "SM", "SRBM": "SM", "SM": "GM", "GM": "CEO"}
    ladder = ["ABM", "RBM", "SM", "GM", "CEO"]
    base = "ABM"
    for p in sales_map:
        if (owner or "").startswith(p):
            base = sales_map[p]
            break
    holders = frappe.get_all("Employee", filters={"custom_role_profile": owner, "status": "Active"},
                             fields=["employee_name", "reports_to"], limit=20)
    starts = []
    for h in holders:
        if (h.employee_name or "")[:6].lower() != "vacant" and h.reports_to and h.reports_to not in starts:
            starts.append(h.reports_to)
    if not starts:
        for h in holders:
            if h.reports_to:
                starts.append(h.reports_to)
                break
    cands = []
    for rt in starts:
        hops = 0
        while rt and hops < 15:
            hops = hops + 1
            m = frappe.db.get_value("Employee", rt, ["employee_name", "status", "user_id", "reports_to"], as_dict=True)
            if not m:
                break
            if m.status == "Active" and (m.employee_name or "")[:6].lower() != "vacant" and m.user_id \
                    and frappe.db.get_value("User", m.user_id, "enabled"):
                held = frappe.get_all("Has Role", filters={"parent": m.user_id, "parenttype": "User",
                                                           "role": ["in", ladder]}, pluck="role")
                if held:
                    level = None
                    for r in ladder:
                        if r in held and ladder.index(r) >= ladder.index(base):
                            level = r
                            break
                    rank = ladder.index(level) if level else 0
                    if not level:
                        for r in ladder:
                            if r in held:
                                level = r
                        rank = 100 - ladder.index(level)
                    cands.append({"user": m.user_id, "level": level, "rank": rank})
                    break
            rt = m.reports_to
    if not cands:
        return {"user": None, "level": base}
    for c in cands:
        if prefer and c["user"] == prefer:
            return {"user": c["user"], "level": c["level"]}
    best = cands[0]
    for c in cands:
        if c["rank"] < best["rank"] or (c["rank"] == best["rank"] and c["user"] < best["user"]):
            best = c
    return {"user": best["user"], "level": best["level"]}


def fallback_of(user):
    # The approver's own live manager — who the Restriction also lets see it.
    if not user:
        return None
    rt = frappe.db.get_value("Employee", {"user_id": user, "status": "Active"}, "reports_to")
    hops = 0
    while rt and hops < 15:
        hops = hops + 1
        m = frappe.db.get_value("Employee", rt, ["employee_name", "status", "user_id", "reports_to"], as_dict=True)
        if not m:
            break
        if m.status == "Active" and (m.employee_name or "")[:6].lower() != "vacant" and m.user_id:
            return m.user_id
        rt = m.reports_to
    return None


if doc.date and frappe.utils.getdate(doc.date) >= frappe.utils.getdate(CUTOFF):
    # ---- 1. per seat: total and whether every line is Submitted
    totals = {}
    ready = {}
    for item in (doc.item_table or []):
        rp = item.get(F_SEAT)
        if not rp:
            continue
        totals[rp] = totals.get(rp, 0) + (item.amount or 0)
        if rp not in ready:
            ready[rp] = True
        if item.get(F_STATUS) != "Submitted":
            ready[rp] = False

    # ---- 2. each seat's lines onto its owner's tracker
    resolved = {}
    resolved_ready = {}
    for orp in totals:
        rrp = owner_seat(orp, OWNERS)
        resolved[rrp] = resolved.get(rrp, 0) + totals[orp]
        resolved_ready[rrp] = resolved_ready.get(rrp, True) and ready[orp]

    # Doctor Support names its trackers from the record's name (doctor and
    # period), as before, so existing tracker names keep matching.
    reference = doc.name

    rows_by_rp = {}
    for row in (doc.custom_approver_table or []):
        if row.role_profile:
            rows_by_rp[row.role_profile] = row

    created_count = 0
    for rp in resolved:
        total_value = resolved[rp]
        row = rows_by_rp.get(rp)

        # ---- 3. the owner already has a tracker
        if row and row.tracker:
            cur = frappe.db.get_value("Operational Tracker", row.tracker, "workflow_state") or ""
            if cur == "Rework" and resolved_ready[rp]:
                r = route(rp, frappe.db.get_value("Operational Tracker", row.tracker, "next_approver"))
                waiting = r["level"] + " Approval Waiting"
                frappe.db.set_value("Operational Tracker", row.tracker, {
                    "workflow_state": waiting,
                    "status": waiting,
                    "next_role": r["level"],
                    "next_approver": r["user"],
                    "custom_fallback_approver": fallback_of(r["user"]),
                    "data": total_value,
                })
                row.status = waiting
                row.total = f"{total_value:.2f}"
                try:
                    cm = frappe.get_doc({
                        "doctype": "Comment",
                        "comment_type": "Comment",
                        "reference_doctype": "Operational Tracker",
                        "reference_name": row.tracker,
                        "content": "Resubmitted after rework by " + frappe.session.user,
                    })
                    cm.flags.ignore_permissions = True
                    cm.insert()
                except Exception:
                    pass
            elif cur == "Rework" or cur.endswith(" Approval Waiting") \
                    or cur.endswith("Approved and Waiting for Verification"):
                frappe.db.set_value("Operational Tracker", row.tracker, "data", total_value,
                                    update_modified=False)
                row.total = f"{total_value:.2f}"
            continue

        # ---- 4. no tracker yet: raise one once every line is Submitted
        if not resolved_ready[rp]:
            continue
        r = route(rp, None)
        waiting = r["level"] + " Approval Waiting"
        dep = None
        hq = None
        user_id = None
        demps = frappe.get_all("Employee",
            filters={"custom_role_profile": rp, "status": "Active"},
            fields=["employee_name", "user_id", "department", "custom_territory"], limit=20)
        for de in demps:
            if (de.employee_name or "")[:6].lower() != "vacant":
                dep = de.department
                hq = de.custom_territory
                if de.user_id and frappe.db.exists("User", {"name": de.user_id, "enabled": 1}):
                    user_id = de.user_id
                break
        tracker_name = "Doctor Support-" + reference + "-" + rp
        try:
            if not frappe.db.exists("Operational Tracker", tracker_name):
                sot = frappe.get_doc({
                    "doctype": "Operational Tracker",
                    "name": tracker_name,
                    "reference_doctype": "Doctor Support",
                    "reference": reference,
                    "role_profile": rp,
                    "setting": "Doctor Support",
                    "data": total_value,
                    "department": dep,
                    "hq": hq,
                    "user": user_id,
                    "next_approver": r["user"],
                })
                sot.flags.update({
                    "ignore_permissions": True,
                    "ignore_mandatory": True,
                    "ignore_links": True,
                    "name_set": True,
                })
                sot.insert()
            # The tracker's own Before Save runs on insert and may resolve an
            # approver of its own; ours is the one routed above.
            frappe.db.set_value("Operational Tracker", tracker_name, {
                "workflow_state": waiting,
                "status": waiting,
                "next_role": r["level"],
                "next_approver": r["user"],
                "custom_fallback_approver": fallback_of(r["user"]),
            }, update_modified=False)
        except Exception as e:
            frappe.log_error(title="Doctor Support OT create failed", message=str(e) + " | rp=" + rp)
            continue
        doc.append("custom_approver_table", {
            "role_profile": rp,
            "tracker": tracker_name,
            "status": waiting,
            "total": f"{total_value:.2f}",
        })
        rows_by_rp[rp] = doc.custom_approver_table[-1]
        created_count = created_count + 1

    if created_count:
        frappe.msgprint("Created " + str(created_count) + " trackers", alert=True, indicator="blue")
