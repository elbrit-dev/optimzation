# =====================================================================
# SERVER SCRIPT — the source of truth for the ERP's copy. Keep in step.
#
#   Name          : Elbrit Tracker Reroute On Employee
#   Script Type   : DocType Event
#   Reference     : Employee
#   Event         : After Save
#
# When the org changes under a waiting approval, the approval follows: an
# Employee who leaves, becomes a "Vacant_" placeholder, takes a seat, gets a
# user or changes manager re-routes the waiting Secondary Data Entry and
# Doctor Support trackers it touches — those waiting on them, and those of
# their own seat and of the seats reporting to them — by the rule of
# elbrit_tracker_route.py (see there; the helpers are the same copy). Never
# stops the Employee's save: a failure is logged.
#
# safe_exec: no import, no .format(), no set literals, no tuple
# unpacking, no underscore-prefixed names.
# =====================================================================

SETTINGS = ["Secondary Data Entry", "Doctor Support"]
WATCHED = ["status", "employee_name", "reports_to", "custom_role_profile", "user_id"]
OWNERS = {}
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


def rollup(sde):
    # Secondary Data Entry's state from its approval rows — as the record's
    # own Rollup script has it.
    if frappe.get_all("Secondary Data Table", filters={"parent": sde, "custom_status": "Draft"}, limit=1):
        return "Draft"
    states = []
    for s in frappe.get_all("secondary tracker", filters={"parent": sde, "parenttype": "Secondary Data Entry"},
                            pluck="status"):
        states.append((s or "").strip())
    if not states:
        return None
    n = len(states)
    n_verified = 0
    n_await = 0
    rej = []
    for s in states:
        if s.endswith("Rejected"):
            rej.append(s)
        elif s == "Approved and Verified":
            n_verified = n_verified + 1
        elif s.endswith("Approved and Waiting for Verification"):
            n_await = n_await + 1
    uniq = list(set(states))
    if len(rej) == n:
        ru = list(set(rej))
        return ru[0] if len(ru) == 1 else "Approval Rejected"
    if rej:
        return "Partially Rejected"
    if n_verified == n:
        return "Approved and Verified"
    if len(uniq) == 1:
        return "Waiting for Verification" if uniq[0].endswith("Approved and Waiting for Verification") else uniq[0]
    if n_verified + n_await == n:
        return "Partially Verified"
    return "Partially Approved"


try:
    old = doc.get_doc_before_save()
    changed = old is None
    if old:
        for f in WATCHED:
            if (old.get(f) or "") != (doc.get(f) or ""):
                changed = True
    if changed:
        users = []
        seats = []
        for u in [doc.user_id, old.user_id if old else None]:
            if u and u not in users:
                users.append(u)
        for s in [doc.custom_role_profile, old.custom_role_profile if old else None]:
            if s and s not in seats:
                seats.append(s)
        for s in frappe.get_all("Employee", filters={"reports_to": doc.name, "status": "Active"},
                                pluck="custom_role_profile"):
            if s and s not in seats:
                seats.append(s)
        base = [["setting", "in", SETTINGS], ["workflow_state", "like", "% Approval Waiting"]]
        fields = ["name", "setting", "reference", "role_profile", "workflow_state", "next_approver"]
        found = {}
        trackers = []
        if users:
            for t in frappe.get_all("Operational Tracker", filters=base + [["next_approver", "in", users]],
                                    fields=fields, limit_page_length=0):
                found[t.get("name")] = 1
                trackers.append(t)
        if seats:
            for t in frappe.get_all("Operational Tracker", filters=base + [["role_profile", "in", seats]],
                                    fields=fields, limit_page_length=0):
                if not found.get(t.get("name")):
                    found[t.get("name")] = 1
                    trackers.append(t)
        for t in trackers:
            # A raised tracker's approver: its own seat's (the seat submitted
            # it); for a seat no one holds, its owner's.
            seat = t.get("role_profile")
            r = route(seat, t.get("next_approver"))
            if not r["user"]:
                o = owner_seat(seat, OWNERS)
                if o != seat:
                    r = route(o, t.get("next_approver"))
            level = (t.get("workflow_state") or "")[:-len(" Approval Waiting")]
            if not r["user"] or (r["user"] == t.get("next_approver") and r["level"] == level):
                continue
            waiting = r["level"] + " Approval Waiting"
            frappe.db.set_value("Operational Tracker", t.get("name"), {
                "workflow_state": waiting,
                "status": waiting,
                "next_role": r["level"],
                "next_approver": r["user"],
                "custom_fallback_approver": fallback_of(r["user"]),
            }, update_modified=False)
            ref = t.get("reference")
            row = frappe.db.get_value("secondary tracker", {"tracker": t.get("name")}, "name")
            if row:
                frappe.db.set_value("secondary tracker", row, "status", waiting, update_modified=False)
            if ref and t.get("setting") == "Secondary Data Entry":
                st = rollup(ref)
                if st:
                    frappe.db.set_value("Secondary Data Entry", ref, "workflow_state", st, update_modified=False)
            elif ref and t.get("setting") == "Doctor Support":
                frappe.db.set_value("Doctor Support", ref, "workflow_state", waiting, update_modified=False)
            cm = frappe.get_doc({
                "doctype": "Comment",
                "comment_type": "Comment",
                "reference_doctype": "Operational Tracker",
                "reference_name": t.get("name"),
                "content": "Re-routed to " + r["user"] + " at " + waiting + " (org change: " + doc.name + ")",
            })
            cm.flags.ignore_permissions = True
            cm.insert()
except Exception as e:
    frappe.log_error(title="Tracker reroute on Employee failed", message=str(e) + " | " + str(doc.name))