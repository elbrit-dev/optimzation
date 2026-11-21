# Server Script "Expense Claim Seat Department" -- DocType Event, Expense Claim,
# Before Validate (12 Nov 2026).
#
# A claim's department is one the claimant's SEAT covers (Role Profile ->
# Departments, custom_departments), not the Employee's own department. SM / ZSM
# sit in the bucket department "Sales - ELPL", which is outside the Department
# User Permissions their seat gives them -- so a claim carrying it was hidden
# from its own owner ("not allowed ... linked to Department 'Sales - ELPL'").
#
# Needs Expense Claim.department "Fetch If Empty" ticked, or the ERP would copy
# the Employee's department over this on every save.
#
# Kept as it is: a department the seat already lists; a seat with no
# Departments list (GM, CEO: no Department limits) -- the Employee's department.

if doc.employee:
    seat = frappe.db.get_value("Employee", doc.employee, "custom_role_profile")
    if seat:
        listed = []
        for d in frappe.get_all("Department Multiselect", filters={"parent": seat, "parenttype": "Role Profile", "parentfield": "custom_departments"}, fields=["department"], order_by="idx asc", limit_page_length=0):
            if d.department:
                listed.append(d.department)
        if listed and doc.department not in listed:
            doc.department = listed[0]
