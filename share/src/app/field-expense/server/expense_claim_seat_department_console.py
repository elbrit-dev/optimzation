# Expense Claim department = the claimant's SEAT department (12 Nov 2026).
# Same as UAT (done there through the connector).
#
# An Expense Claim copied `department` from the Employee. SM / ZSM sit in the
# bucket department "Sales - ELPL", outside the Department User Permissions
# their seat gives them, so their own claim was hidden from them ("not allowed
# ... linked to Department 'Sales - ELPL'"). Now the claim carries a department
# the claimant's seat lists (Role Profile -> Departments). No permission is
# added to anyone.
#
#   1. Expense Claim.department: "Fetch If Empty" (Property Setter) -- the
#      Employee's department is copied only when the claim has none.
#   2. Server Script "Expense Claim Seat Department" (Before Validate) -- a
#      department the seat does not list becomes the seat's first one; a seat
#      with no Departments list (GM, CEO) keeps the Employee's.
#   3. Claims still open (Draft / Waiting for Approval / Rejected) carrying a
#      department their seat does not list are corrected now.
#
# Paste into ERP > System Console (type Python), logged in as a System Manager.
# 1) DRY = True, "Commit" unticked: only prints.  2) DRY = False, tick Commit,
# then Frappe Cloud -> Clear Cache. Safe to re-run.

DRY = True
W = "WOULD " if DRY else ""
CRLF = chr(13) + chr(10)
LF = chr(10)

SCRIPT = '# Server Script "Expense Claim Seat Department" -- DocType Event, Expense Claim,\n# Before Validate (12 Nov 2026).\n#\n# A claim\'s department is one the claimant\'s SEAT covers (Role Profile ->\n# Departments, custom_departments), not the Employee\'s own department. SM / ZSM\n# sit in the bucket department "Sales - ELPL", which is outside the Department\n# User Permissions their seat gives them -- so a claim carrying it was hidden\n# from its own owner ("not allowed ... linked to Department \'Sales - ELPL\'").\n#\n# Needs Expense Claim.department "Fetch If Empty" ticked, or the ERP would copy\n# the Employee\'s department over this on every save.\n#\n# Kept as it is: a department the seat already lists; a seat with no\n# Departments list (GM, CEO: no Department limits) -- the Employee\'s department.\n\nif doc.employee:\n    seat = frappe.db.get_value("Employee", doc.employee, "custom_role_profile")\n    if seat:\n        listed = []\n        for d in frappe.get_all("Department Multiselect", filters={"parent": seat, "parenttype": "Role Profile", "parentfield": "custom_departments"}, fields=["department"], order_by="idx asc", limit_page_length=0):\n            if d.department:\n                listed.append(d.department)\n        if listed and doc.department not in listed:\n            doc.department = listed[0]\n'

# 1. fetch the Employee's department only when the claim has none
ps = frappe.db.get_value("Property Setter", {"doc_type": "Expense Claim", "field_name": "department", "property": "fetch_if_empty"}, ["name", "value"], as_dict=True)
if ps and str(ps.value) == "1":
    print("ok: Expense Claim.department is Fetch If Empty")
else:
    print(W + "set Expense Claim.department Fetch If Empty")
    if not DRY:
        if ps:
            frappe.db.set_value("Property Setter", ps.name, "value", "1")
        else:
            frappe.get_doc({"doctype": "Property Setter", "doctype_or_field": "DocField", "doc_type": "Expense Claim", "field_name": "department", "property": "fetch_if_empty", "property_type": "Check", "value": "1"}).insert(ignore_permissions=True)

# 2. the script
if frappe.db.exists("Server Script", "Expense Claim Seat Department"):
    ss = frappe.get_doc("Server Script", "Expense Claim Seat Department")
    if (ss.script or "").replace(CRLF, LF) == SCRIPT and not ss.disabled:
        print("ok: Server Script Expense Claim Seat Department is current")
    else:
        print(W + "update Server Script Expense Claim Seat Department")
        if not DRY:
            ss.script = SCRIPT
            ss.disabled = 0
            ss.save(ignore_permissions=True)
else:
    print(W + "create Server Script Expense Claim Seat Department (Before Validate)")
    if not DRY:
        frappe.get_doc({"doctype": "Server Script", "name": "Expense Claim Seat Department", "script_type": "DocType Event", "reference_doctype": "Expense Claim", "doctype_event": "Before Validate", "disabled": 0, "script": SCRIPT}).insert(ignore_permissions=True)

# 3. open claims carrying a department their seat does not list
fixed = 0
for c in frappe.get_all("Expense Claim", filters={"docstatus": 0, "workflow_state": ["in", ["Draft", "Waiting for Approval", "Rejected"]]}, fields=["name", "employee", "employee_name", "department"], limit_page_length=0):
    seat = frappe.db.get_value("Employee", c.employee, "custom_role_profile") if c.employee else None
    if not seat:
        continue
    listed = []
    for d in frappe.get_all("Department Multiselect", filters={"parent": seat, "parenttype": "Role Profile", "parentfield": "custom_departments"}, fields=["department"], order_by="idx asc", limit_page_length=0):
        if d.department:
            listed.append(d.department)
    if listed and c.department not in listed:
        print(W + "set " + c.name + " (" + str(c.employee_name) + "): " + str(c.department) + " -> " + listed[0])
        fixed = fixed + 1
        if not DRY:
            frappe.db.set_value("Expense Claim", c.name, "department", listed[0], update_modified=False)
print(str(fixed) + " open claim(s) " + ("would be " if DRY else "") + "corrected")

print("done -- now Frappe Cloud -> Clear Cache" if not DRY else "DRY RUN: nothing changed. Set DRY = False, tick Commit, run again.")
