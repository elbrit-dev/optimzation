# =====================================================================
# SERVER SCRIPT — the source of truth for the ERP's copy. Keep in step.
#
#   Name        : Elbrit Leave Approvals
#   Script Type : API
#   API Method  : elbrit_leave_approvals
#   Allow Guest : NO
#
#   GET /api/method/elbrit_leave_approvals
#   GET /api/method/elbrit_leave_approvals?today=2026-11-11
#
# The Leave Approval screen's rows (src/app/leave-approval): every leave the
# CALLER may see, decided here rather than by the Leave Application read
# permissions (every sales role may read the doctype; per-user Employee
# permissions then cut it unevenly):
#   ALL       the HR and IT departments (SEE_ALL_DEPARTMENTS), the CEO role,
#             System Manager / Administrator, and the IT role profile —
#             every leave
#   TEAM      everyone else — the leaves of everyone in the seats under
#             theirs in the Role Profile tree (ROLE PROFILE ALONE, not reports_to): an ABM their
#             BEs, an RBM their ABMs and BEs, an SM their whole region — and
#             any leave they are the approver or escalation approver of
# Never the caller's own leaves.
# Which leaves: every Open one, and every one ending within the last
# RECENT_DAYS (the Decided tab, and who is off this week).
#
# Rows come in the GraphQL shape the screen reads (links as `x__name`); an Open
# row also carries `decide`: who decides it under the live rule (resolver.py)
# and whether the caller can ("approver" / "escalation" / "override" / null).
# READ-ONLY. Deciding stays with the "Leave Approval" workflow, as the
# caller (the screen's data/erp.js).
#
# safe_exec: no import, no .format(), no set literals, no tuple
# unpacking, no underscore-prefixed names.
# =====================================================================

SEE_ALL_DEPARTMENTS = ["HR - ELPL", "IT - ELPL"]
SEE_ALL_ROLES = ["CEO", "System Manager"]
SEE_ALL_ROLE_PROFILE = "IT"
RECENT_DAYS = 30

me = frappe.session.user
# Testing aid: a System Manager may look AS another user (?as=user@...), read-only.
if frappe.form_dict.get("as") and frappe.db.exists("Has Role", {"parent": me, "parenttype": "User", "role": "System Manager"}):
    me = frappe.form_dict.get("as")
today = frappe.form_dict.get("today") or ""
if len(today) != 10:
    today = frappe.utils.nowdate()
since = str(frappe.utils.add_days(today, -RECENT_DAYS))

emp = frappe.get_all("Employee", filters={"user_id": me, "status": "Active"},
                     fields=["name", "department"], limit_page_length=1)
my_emp = emp[0].get("name") if emp else None

roles = []
for r in frappe.get_all("Has Role", filters={"parenttype": "User", "parent": me},
                        fields=["role"], limit_page_length=0):
    roles.append(r.get("role"))
see_all = me == "Administrator"
if emp and emp[0].get("department") in SEE_ALL_DEPARTMENTS:
    see_all = True
for r in SEE_ALL_ROLES:
    if r in roles:
        see_all = True
if frappe.db.get_value("User", me, "role_profile_name") == SEE_ALL_ROLE_PROFILE:
    see_all = True

# The caller's team, by ROLE PROFILE alone: every seat under theirs in the
# Role Profile tree (parent_role_profile, any depth), and the employees who
# hold those seats (Employee.custom_role_profile, any status — a leave of
# someone who left is still history).
team = []
seat = None
if not see_all and my_emp:
    seat = frappe.db.get_value("Employee", my_emp, "custom_role_profile")
if seat:
    seats = []
    reached = {seat: 1}
    frontier = [seat]
    hops = 0
    while frontier and hops < 12:
        hops = hops + 1
        below = []
        for r in frappe.get_all("Role Profile", filters=[["parent_role_profile", "in", frontier]],
                                pluck="name", limit_page_length=0):
            if not reached.get(r):
                reached[r] = 1
                below.append(r)
                seats.append(r)
        frontier = below
    i = 0
    while i < len(seats):
        for e in frappe.get_all("Employee", filters=[["custom_role_profile", "in", seats[i:i + 500]]],
                                pluck="name", limit_page_length=0):
            team.append(e)
        i = i + 500

FIELDS = ["name", "employee", "employee_name", "department", "leave_type", "from_date", "to_date",
          "half_day", "half_day_date", "total_leave_days", "description", "posting_date", "status", "docstatus",
          "custom_attachement", "leave_approver", "leave_approver_name", "custom_escalation_approver",
          "modified", "modified_by"]
WINDOWS = [[["status", "=", "Open"]], [["to_date", ">=", since]]]

found = {}


def take(filters):
    for w in WINDOWS:
        for r in frappe.get_all("Leave Application", filters=filters + w, fields=FIELDS,
                                limit_page_length=0):
            found[r.get("name")] = r


if see_all:
    take([])
else:
    i = 0
    while i < len(team):
        take([["employee", "in", team[i:i + 500]]])
        i = i + 500
    # ...and every Open leave the live rule routes to the caller, wherever it is.
    for r in frappe.get_all("Leave Application", filters=[["status", "=", "Open"], ["docstatus", "=", 0]],
                            fields=FIELDS, limit_page_length=0):
        rr = LRE["route"](r.get("employee"), r.get("leave_type"))
        if me in rr.get("approvers") or me in rr.get("escalation"):
            found[r.get("name")] = r

LINKS = ["employee", "department", "leave_type", "leave_approver", "custom_escalation_approver", "modified_by"]
rows = []
for n in found:
    r = found[n]
    if my_emp and r.get("employee") == my_emp:
        continue
    out = {}
    for f in FIELDS:
        v = r.get(f)
        if v is not None and f in ["from_date", "to_date", "half_day_date", "posting_date", "modified"]:
            v = str(v)
        out[(f + "__name") if f in LINKS else f] = v
    # Who decides it, live (resolver.py), and may the caller?
    if r.get("status") == "Open" and r.get("docstatus") in [0, None]:
        rr = LRE["route"](r.get("employee"), r.get("leave_type"))
        out["decide"] = {"can": LRE["can"](me, r, rr, today), "kind": rr.get("kind"),
                         "approvers": rr.get("approvers"), "approver_names": LRE["names"](rr.get("approvers")) if rr.get("approvers") else "HR",
                         "escalation": rr.get("escalation"), "escalation_names": LRE["names"](rr.get("escalation")) if rr.get("escalation") else None}
    rows.append(out)

frappe.response["message"] = {
    "user": me,
    "scope": "all" if see_all else "team",
    "today": today,
    "rows": rows,
}
