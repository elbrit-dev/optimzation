# Department Service Budget: a month-wise "allocated amount" for Doctor
# Service, on every Department.
#
# Paste into ERP > System Console (type Python), logged in as a System Manager.
# 1) Run with DRY = True and "Commit" UNticked: it only prints what it would do.
# 2) Set DRY = False, tick "Commit", run again.
# Safe to re-run: anything already in place is skipped (a month a department
# already has is never overwritten, so amounts typed in are kept).
#
# What it makes:
#   DocType "Department Service Budget" (child table, custom)
#     month        Date      first day of the month (2026-04-01) — the key
#     month_label  Data      "Apr 2026", for reading the table
#     amount       Currency  the allocated service amount for that month
#   Department.custom_service_budget  Table -> Department Service Budget,
#     under a "Service Budget" section at the end of the Department form
#   Rows: every SALES department -- one a sales seat sits in (Role Profile.
#     custom_department), 26 on production -- gets the 12 months of the
#     CURRENT financial year (April to March) at 0. SALES_ONLY = False gives
#     every department the rows.
#
# safe_exec: no import, no .format(), no set literals, no tuple unpacking,
# no underscore-prefixed names.

DRY = True

CHILD = "Department Service Budget"
FIELD = "custom_service_budget"
SECTION = "custom_service_budget_section"
ROOT = "All Departments"
MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

W = "WOULD " if DRY else ""

# ---- the current financial year: April to March
today = frappe.utils.nowdate()
y = int(today[:4])
m = int(today[5:7])
fy_start = y if m >= 4 else y - 1
months = []
i = 0
while i < 12:
    mm = 4 + i
    yy = fy_start
    if mm > 12:
        mm = mm - 12
        yy = yy + 1
    months.append({"month": str(yy) + "-" + ("0" if mm < 10 else "") + str(mm) + "-01",
                   "month_label": MON[mm - 1] + " " + str(yy)})
    i = i + 1
print("financial year: " + months[0]["month_label"] + " - " + months[-1]["month_label"])

# ---- 1. the child table doctype
if frappe.db.exists("DocType", CHILD):
    print("ok: doctype " + CHILD)
else:
    print(W + "create child doctype " + CHILD)
    if not DRY:
        frappe.get_doc({
            "doctype": "DocType",
            "name": CHILD,
            "module": "Custom",
            "custom": 1,
            "istable": 1,
            "editable_grid": 1,
            "fields": [
                {"fieldname": "month", "label": "Month", "fieldtype": "Date", "reqd": 1, "in_list_view": 1,
                 "columns": 2, "description": "First day of the month"},
                {"fieldname": "month_label", "label": "Month label", "fieldtype": "Data", "in_list_view": 1,
                 "columns": 2, "read_only": 1},
                {"fieldname": "amount", "label": "Allocated amount", "fieldtype": "Currency", "in_list_view": 1,
                 "columns": 3, "default": "0"},
            ],
        }).insert(ignore_permissions=True)

# ---- 2. the table on Department
for f in [
    # On the Details tab, after the Approvers tables -- NOT after the form's
    # last field, which sits on the "Employee and Customer Mapping" tab and
    # put the section out of sight there (16 Oct 2026).
    {"fieldname": SECTION, "label": "Service Budget", "fieldtype": "Section Break", "collapsible": 0,
     "insert_after": "expense_approvers"},
    {"fieldname": FIELD, "label": "Service budget (month-wise)", "fieldtype": "Table", "options": CHILD,
     "insert_after": SECTION},
]:
    if frappe.db.exists("Custom Field", "Department-" + f["fieldname"]):
        print("ok: field Department." + f["fieldname"])
    else:
        print(W + "add field Department." + f["fieldname"])
        if not DRY:
            d = {"doctype": "Custom Field", "dt": "Department"}
            d.update(f)
            frappe.get_doc(d).insert(ignore_permissions=True)

# ---- 3. the 12 months at 0 for every SALES department
# Sales departments only: the ones a sales seat sits in (Role Profile.
# custom_department) -- the department a doctor service is judged on. HR,
# Accounts, Legal, the SW company's departments etc. never carry a service.
# Set SALES_ONLY = False to give every department the table rows.
SALES_ONLY = True
if SALES_ONLY:
    depts = []
    for d in frappe.get_all("Role Profile", filters=[["custom_department", "is", "set"]],
                            pluck="custom_department", limit_page_length=0):
        if d and d != ROOT and d not in depts:
            depts.append(d)
    depts.sort()
else:
    depts = frappe.get_all("Department", filters=[["name", "!=", ROOT]], pluck="name", order_by="name asc")
print(str(len(depts)) + (" sales" if SALES_ONLY else "") + " departments")
added = 0
for dept in depts:
    have = {}
    if frappe.db.exists("DocType", CHILD):
        for r in frappe.get_all(CHILD, filters={"parent": dept, "parenttype": "Department", "parentfield": FIELD},
                                fields=["month", "idx"]):
            have[str(r.get("month"))[:10]] = 1
    idx = len(have)
    todo = []
    for mo in months:
        if not have.get(mo["month"]):
            todo.append(mo)
    if not todo:
        continue
    print(W + "add " + str(len(todo)) + " month(s) to " + dept)
    added = added + len(todo)
    if not DRY:
        for mo in todo:
            idx = idx + 1
            frappe.get_doc({
                "doctype": CHILD,
                "parent": dept,
                "parenttype": "Department",
                "parentfield": FIELD,
                "idx": idx,
                "month": mo["month"],
                "month_label": mo["month_label"],
                "amount": 0,
            }).insert(ignore_permissions=True)

print(("would add" if DRY else "added") + " rows: " + str(added))
if DRY:
    print("DRY RUN: nothing changed. Set DRY = False, tick Commit, run again.")
