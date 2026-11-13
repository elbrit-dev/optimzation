# Field Expense access (11 Nov 2026): each person sees only their own days.
#
#   Viewers -- see every employee: Administrator, System Manager, HR Manager
#   (HR runs the /field-expenses page: builds, flights), the IT department
#   (Employee.department "IT - ELPL"), CEO and GM (User role profile, or the
#   Employee seat). Everyone else: only the days of their own ACTIVE Employee
#   record(s) -- never a Left record on a recycled login.
#
#   field_expense_month    everyone: their own days (no employee=); viewers: any
#                          employee= or employee=all; others asking are refused.
#                          For one person's month it also returns `employee`
#                          (code, name, designation, role, seat, HQ) -- what
#                          the planner's Field layer needs (11 Nov 2026).
#   field_expense_dataset  the whole month (every employee): viewers only
#   DocType permissions    the Employee role loses read / write / delete on
#                          Field Expense Day, Settings, Flight, Road Distance
#                          (it could read every day, edit its own DA, change
#                          the build settings and download the month file
#                          attached to Settings); TA DA Rate: read only.
#                          The APIs read with frappe.get_all after their own
#                          check, so reps keep their own days through the API.
#
# Paste into ERP > System Console (type Python), logged in as a System Manager.
# 1) DRY = True, "Commit" unticked: only prints.  2) DRY = False, tick Commit.
# Safe to re-run. After running: Frappe Cloud -> Clear Cache.
#
# safe_exec: no import, no .format(), no set literals, no tuple unpacking, no
# underscore-prefixed names; an API script's comprehensions and defs cannot
# see its top-level names (plain loops only).

DRY = True
W = "WOULD " if DRY else ""

# Who sees every employee. COPIED into both API scripts below -- keep in step.
VIEWERS = r'''
VIEW_ROLES = ["System Manager", "HR Manager"]
VIEW_PROFILES = ["CEO", "GM"]
VIEW_DEPTS = ["IT - ELPL"]
me = frappe.session.user
see_all = me == "Administrator"
if not see_all and frappe.db.exists("Has Role", {"parent": me, "parenttype": "User", "role": ["in", VIEW_ROLES]}):
    see_all = True
if not see_all and (frappe.db.get_value("User", me, "role_profile_name") or "") in VIEW_PROFILES:
    see_all = True
own = []
for e in frappe.get_all("Employee", filters={"user_id": me, "status": "Active"},
                        fields=["name", "department", "custom_role_profile"], limit_page_length=0):
    own.append(e.name)
    if (e.department or "") in VIEW_DEPTS or (e.custom_role_profile or "") in VIEW_PROFILES:
        see_all = True
'''

MONTH_API = r'''# Server Script · API · method field_expense_month
# The month's computed days for the web page and for Elbrit One:
#   GET /api/method/field_expense_month?month=2026-10[&employee=E00004 | all]
# Without employee=: the CALLER's own days (their active Employee record), for
# everyone. employee=<code> / employee=all: the viewers only (System Manager,
# HR Manager, IT department, CEO, GM). Read with frappe.get_all after that check:
# the Employee role has no DocType permission on Field Expense Day.
# Each day carries detail_json: the full day as the server worked it out (legs, visits,
# route, flags), so a client never recomputes anything.
if frappe.session.user == "Guest":
    frappe.throw("Please log in", frappe.PermissionError)
''' + VIEWERS + r'''
month = str(frappe.form_dict.get("month") or "").strip()
if not month:
    frappe.throw("month is required, e.g. 2026-10")
filters = {"month": month}
emp = str(frappe.form_dict.get("employee") or "").strip()
if emp == "all":
    if not see_all:
        frappe.throw("You can see only your own field expense days.", frappe.PermissionError)
elif emp:
    if not see_all and emp not in own:
        frappe.throw("You can see only your own field expense days.", frappe.PermissionError)
    filters["employee"] = emp
else:
    filters["employee"] = ["in", own or ["-"]]
days = frappe.get_all("Field Expense Day", filters=filters,
    fields=["name", "employee", "employee_name", "date", "kind", "day_type", "centre_hq", "route",
            "reach_km", "farthest_place", "visits", "force_visits", "joint", "other_work",
            "road_missing", "ta", "da", "total", "os_da_full", "bill", "flight", "status", "detail_json"],
    order_by="employee asc, date asc", limit_page_length=0)
for d in days:
    d["detail"] = json.loads(d.get("detail_json")) if d.get("detail_json") else None
    d.pop("detail_json", None)
# One person's month (their own, or the employee= asked for): who they are, as
# the build sees them -- role from Field Expense Input "config" designationToRole
# (else the designation's initials, as the build does), HQ from their seat.
head = None
who = emp if emp != "all" else ""
if not emp and len(own) == 1:
    who = own[0]
if who:
    e = frappe.db.get_value("Employee", who, ["name", "employee_name", "designation", "custom_role_profile"], as_dict=True)
    if e:
        d2r = {}
        cfg = frappe.db.get_value("Field Expense Input", "config", "json")
        if cfg:
            d2r = json.loads(cfg).get("designationToRole") or {}
        role = d2r.get(e.designation or "") or ""
        if not role and e.designation:
            for w in str(e.designation).split():
                role = role + w[0].upper()
            role = role[:5]
        hq = frappe.db.get_value("Role Profile", e.custom_role_profile, "custom_territory") if e.custom_role_profile else None
        head = {"code": e.name, "name": e.employee_name, "designation": e.designation, "role": role or None,
                "seat": e.custom_role_profile, "hq": hq}
s = frappe.get_doc("Field Expense Settings")
frappe.response["message"] = {
    "month": month, "days": days, "scope": "all" if see_all else "own", "employee": head,
    "built_on": s.last_built_on, "built_month": s.last_built_month,
    "hq_km": s.hq_km, "eq_km": s.eq_km
}
'''

DATASET_API = r'''# Server Script · API · method field_expense_dataset
# The whole month as the dashboard page reads it -- every amount already worked out by the
# server (Field Expense Build). GET /api/method/field_expense_dataset?month=2026-10
# Without a month: the list of months built so far.
# EVERY employee's days, GPS and pay: the viewers only (System Manager, HR Manager,
# IT department, CEO, GM). Anyone else reads their own days with field_expense_month.
if frappe.session.user == "Guest":
    frappe.throw("Please log in", frappe.PermissionError)
''' + VIEWERS + r'''
if not see_all:
    frappe.throw("The whole month is open to HR, IT, the CEO and the GM only. Your own days: field_expense_month.", frappe.PermissionError)
files = frappe.get_all("File", fields=["name", "file_name", "modified"],
    filters={"attached_to_doctype": "Field Expense Settings", "file_name": ["like", "field-expense-%.json"]},
    order_by="file_name desc", limit_page_length=0)
months = [f.file_name[len("field-expense-"):-len(".json")] for f in files]
month = str(frappe.form_dict.get("month") or "").strip() or (months[0] if months else "")
hit = [f for f in files if f.file_name == "field-expense-" + month + ".json"]
if not hit:
    frappe.response["message"] = {"months": months, "month": month, "dataset": None}
else:
    frappe.response["message"] = {"months": months, "month": month,
                                  "dataset": json.loads(frappe.get_doc("File", hit[0].name).get_content())}
'''

for name, script in [["Field Expense - Month API", MONTH_API], ["Field Expense - Dataset API", DATASET_API]]:
    if not frappe.db.exists("Server Script", name):
        print("MISSING Server Script " + name + " -- nothing done for it")
        continue
    print(W + "update Server Script " + name)
    if not DRY:
        ss = frappe.get_doc("Server Script", name)
        ss.script = script
        ss.save(ignore_permissions=True)

# DocType permissions: drop the Employee role (TA DA Rate: read only).
DROP = ["Field Expense Day", "Field Expense Settings", "Field Expense Flight", "Road Distance"]
READ_ONLY = ["TA DA Rate"]
for dt in DROP + READ_ONLY:
    if not frappe.db.exists("DocType", dt):
        print("skip " + dt + " (no such DocType here)")
        continue
    d = frappe.get_doc("DocType", dt)
    keep = []
    changed = False
    for p in d.permissions:
        if p.role != "Employee":
            keep.append(p)
        elif dt in READ_ONLY:
            if p.write or p.create or p.delete or p.share or p.export or p.report:
                print(W + dt + ": Employee read only")
                p.write = 0
                p.create = 0
                p.delete = 0
                p.share = 0
                p.export = 0
                p.report = 0
                changed = True
            keep.append(p)
        else:
            print(W + dt + ": drop the Employee role permission")
            changed = True
    if not changed:
        print("ok: " + dt)
    elif not DRY:
        d.permissions = keep
        d.save(ignore_permissions=True)
    if frappe.db.exists("Custom DocPerm", {"parent": dt, "role": "Employee"}):
        print("NOTE " + dt + " also has a Custom DocPerm for Employee (Role Permissions Manager) -- check it by hand")

print("done" if not DRY else "DRY RUN: nothing changed. Set DRY = False, tick Commit, run again.")
