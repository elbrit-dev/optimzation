# One-off: Doctor Services approved BEFORE the single-ToDo change got one
# "carry out" ToDo per MIS user (13 each). Fold each service's OPEN copies into
# ONE: the first is handed to the head of MIS and shared (read + write) with
# that department's MIS team, the rest are set to Cancelled. A service whose hand-over was already
# Closed by someone is left alone.
#
# Paste into ERP > System Console (Python) as a System Manager.
# 1) DRY = True, Commit unticked: prints what it would do.
# 2) DRY = False, tick Commit, run again.

DRY = True
OWNER = "vishnuk.mis@elbrit.org"
OT = "Operational Tracker"
W = "WOULD " if DRY else ""
# The child table behind Role Profile.custom_departments (the MIS team's departments).
TEAM_FIELD = frappe.get_meta("Role Profile").get_field("custom_departments")
TEAM_DT = TEAM_FIELD.options if TEAM_FIELD else None

# THE MIS SUBTREE ONLY. Sales seats (BE / ABM / RBM profiles) carry a
# custom_departments table too, so "every profile listing the department"
# picked BEs (dry run, 16 Oct 2026). The verifier of the Doctor Service
# Approval Settings is the MIS root; walk its children as the operational
# tracker script does.
MIS_ROOT = frappe.db.get_value("Approval Settings", "Doctor Service", "verifier")
mis_tree = []
if MIS_ROOT:
    mis_tree = [MIS_ROOT]
    frontier = [MIS_ROOT]
    hops = 0
    while frontier and hops < 20:
        hops = hops + 1
        kids = frappe.get_all("Role Profile", filters={"parent_role_profile": ["in", frontier]}, pluck="name")
        frontier = []
        for k in kids:
            if k not in mis_tree:
                mis_tree.append(k)
                frontier.append(k)
print("MIS root: " + str(MIS_ROOT) + " -- " + str(len(mis_tree)) + " MIS profiles")

trackers = frappe.get_all("Doctor Service", filters={"custom_via_app": 1, "custom_tracker": ["is", "set"]},
                          pluck="custom_tracker", limit_page_length=0)
for tr in trackers:
    todos = frappe.get_all("ToDo", filters=[["reference_type", "=", OT], ["reference_name", "=", tr],
                                            ["description", "like", "Approved (%"]],
                           fields=["name", "status", "allocated_to"], order_by="creation asc", limit_page_length=0)
    open_ones = []
    closed = False
    for t in todos:
        if t.status == "Closed":
            closed = True
        elif t.status == "Open":
            open_ones.append(t)
    if closed or len(open_ones) < 2:
        continue
    keep = open_ones[0]
    # Shared with THAT department's MIS team only: users on the team profile(s)
    # (non-group Role Profiles) whose custom_departments list the tracker's
    # department -- the same rule as the operational tracker script. Falls back
    # to the people who held the copies when no team is found.
    dept = frappe.db.get_value(OT, tr, "department")
    others = []
    if dept and TEAM_DT:
        for prof in frappe.get_all(TEAM_DT, filters={"parenttype": "Role Profile", "department": dept},
                                   pluck="parent", limit_page_length=0):
            if prof not in mis_tree:
                continue
            if frappe.db.get_value("Role Profile", prof, "is_group"):
                continue
            for u in frappe.get_all("User", filters={"role_profile_name": prof, "enabled": 1}, pluck="name"):
                if u != OWNER and u not in others:
                    others.append(u)
    if not others:
        for t in open_ones:
            if t.allocated_to and t.allocated_to != OWNER and t.allocated_to not in others:
                others.append(t.allocated_to)
    print(W + "keep 1 ToDo for " + OWNER + ", share with " + str(len(others)) + " (" + ", ".join(others) + "), cancel " +
          str(len(open_ones) - 1) + " -- " + tr)
    if DRY:
        continue
    frappe.db.set_value("ToDo", keep.name, "allocated_to", OWNER)
    for u in others:
        if not frappe.db.exists("DocShare", {"share_doctype": "ToDo", "share_name": keep.name, "user": u}):
            frappe.get_doc({"doctype": "DocShare", "share_doctype": "ToDo", "share_name": keep.name, "user": u,
                            "read": 1, "write": 1, "share": 0, "notify_by_email": 0}).insert(ignore_permissions=True)
    for t in open_ones[1:]:
        frappe.db.set_value("ToDo", t.name, "status", "Cancelled")
    frappe.db.set_value(OT, tr, "todo", keep.name, update_modified=False)

if DRY:
    print("DRY RUN: nothing changed. Set DRY = False, tick Commit, run again.")
