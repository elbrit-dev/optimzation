# =====================================================================
# SERVER SCRIPT — the source of truth for the ERP's copy. Keep in step.
#
#   Name        : Elbrit Tracker Route
#   Script Type : API
#   API Method  : elbrit_tracker_route
#   Allow Guest : NO
#
#   GET  /api/method/elbrit_tracker_route                    what would change (dry run)
#   GET  /api/method/elbrit_tracker_route?setting=Doctor%20Support
#   POST /api/method/elbrit_tracker_route  { apply: 1 }      change it (System Manager only)
#   POST /api/method/elbrit_tracker_route  { apply: 1, names: [...] }   only these trackers
#
# RE-ROUTES WAITING APPROVALS (Secondary Data Entry and Doctor Support
# trackers in "<Level> Approval Waiting") to who should have them now, by
# the rule the tracker scripts raise them with (secondary_tracker_on_save.py):
# the first person above the seat, up reports_to, who is Active, not a
# "Vacant_" placeholder, has an enabled user and holds an approval role —
# waiting at THEIR level. A tracker already raised stays its seat's work: a
# BE who leaves after submitting is still approved by their ABM. It moves
# only past people who cannot act (left, disabled, a placeholder, no approval
# role) or onto a manager who now heads the seat.
#
# A change sets the tracker's next_approver, custom_fallback_approver,
# workflow_state / status / next_role (one of the workflow's own states,
# written directly — no transition is applied), its row on the record, and
# the record's rolled-up state, and leaves a comment saying why. A tracker
# with no one to route to is reported and left as it is.
#
# Answer: { apply, checked, changes: [{ name, setting, seat, why,
#           from: { state, approver }, to: { state, approver } }],
#           unroutable: [name], errors: [{ name, error }] }
#
# safe_exec: no import, no .format(), no set literals, no tuple
# unpacking, no underscore-prefixed names.
# =====================================================================

SALES_MAP = {"BE": "ABM", "ABM": "RBM", "RBM": "SM", "SRBM": "SM", "SM": "GM", "GM": "CEO"}
LADDER = ["ABM", "RBM", "SM", "GM", "CEO"]
SETTINGS = ["Secondary Data Entry", "Doctor Support"]
WAITING = " Approval Waiting"
OWNERS = {}


def is_placeholder(name):
    return (name or "")[:6].lower() == "vacant"


def next_level(seat):
    for p in SALES_MAP:
        if (seat or "").startswith(p):
            return SALES_MAP[p]
    return "ABM"


def owner_seat(seat):
    # The seat whose tracker carries `seat`'s lines.
    if seat in OWNERS:
        return OWNERS[seat]
    found = seat
    holders = frappe.get_all("Employee", filters={"custom_role_profile": seat, "status": "Active"},
                             fields=["employee_name", "reports_to"], limit=20)
    live = False
    climb = None
    for h in holders:
        if not is_placeholder(h.employee_name):
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
            if m.status == "Active" and not is_placeholder(m.employee_name) and m.custom_role_profile:
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
                if not is_placeholder(h.employee_name):
                    found = cur
                    break
            cur = frappe.db.get_value("Role Profile", cur, "parent_role_profile")
    OWNERS[seat] = found
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
        if m.status == "Active" and not is_placeholder(m.employee_name) and m.user_id:
            return m.user_id
        rt = m.reports_to
    return None


def route_tracker(seat, prefer):
    # A raised tracker's approver: its own seat's (the seat submitted it);
    # for a seat no one holds, its owner's.
    r = route(seat, prefer)
    if not r["user"]:
        owner = owner_seat(seat)
        if owner != seat:
            r = route(owner, prefer)
    return r


def why_moved(t, r):
    cur = t.get("next_approver")
    if not cur:
        return "no approver"
    e = frappe.db.get_value("Employee", {"user_id": cur}, ["status", "employee_name"], as_dict=True)
    if not e or e.status != "Active":
        return "approver left"
    if is_placeholder(e.employee_name):
        return "approver is a vacant placeholder"
    if not frappe.db.get_value("User", cur, "enabled"):
        return "approver's user is disabled"
    level = (t.get("workflow_state") or "")[:-len(WAITING)]
    if cur == r["user"]:
        return "waiting at " + level + ", approver is " + r["level"]
    if not frappe.get_all("Has Role", filters={"parent": cur, "parenttype": "User", "role": level}, limit=1):
        return "approver cannot act at " + level
    return "seat now reports to " + r["user"]


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


def move(t, r, why):
    waiting = r["level"] + WAITING
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
        "content": "Re-routed to " + r["user"] + " at " + waiting + " (" + why + ") by " + frappe.session.user,
    })
    cm.flags.ignore_permissions = True
    cm.insert()


me = frappe.session.user
apply_it = str(frappe.form_dict.get("apply") or "") in ["1", "true", "True", "yes"]
if apply_it and me != "Administrator" and not frappe.get_all(
        "Has Role", filters={"parent": me, "parenttype": "User", "role": "System Manager"}, limit=1):
    frappe.throw("Only a System Manager can re-route approvals.")

settings = SETTINGS
if frappe.form_dict.get("setting") in SETTINGS:
    settings = [frappe.form_dict.get("setting")]
filters = [["setting", "in", settings], ["workflow_state", "like", "%" + WAITING]]
only = frappe.form_dict.get("names")
if only:
    if isinstance(only, str):
        only = frappe.parse_json(only)
    filters.append(["name", "in", only])

changes = []
unroutable = []
errors = []
trackers = frappe.get_all("Operational Tracker", filters=filters,
                          fields=["name", "setting", "reference", "role_profile", "workflow_state", "next_approver"],
                          limit_page_length=0)
for t in trackers:
    try:
        r = route_tracker(t.get("role_profile"), t.get("next_approver"))
        level = (t.get("workflow_state") or "")[:-len(WAITING)]
        if not r["user"]:
            if not t.get("next_approver"):
                unroutable.append(t.get("name"))
            continue
        if r["user"] == t.get("next_approver") and r["level"] == level:
            continue
        why = why_moved(t, r)
        changes.append({
            "name": t.get("name"),
            "setting": t.get("setting"),
            "seat": t.get("role_profile"),
            "why": why,
            "from": {"state": t.get("workflow_state"), "approver": t.get("next_approver")},
            "to": {"state": r["level"] + WAITING, "approver": r["user"]},
        })
        if apply_it:
            move(t, r, why)
    except Exception as e:
        errors.append({"name": t.get("name"), "error": str(e)})

frappe.response["message"] = {
    "apply": apply_it,
    "checked": len(trackers),
    "changes": changes,
    "unroutable": unroutable,
    "errors": errors,
}
