# Delete the TEST records made on app-uat on the evening of 13 Nov 2026
# (21:07 - 21:24), after the afternoon clean-up:
#
#   Expense Claims   HR-EXP-2026-00026  Janardhanan A (E00004)  -- with the approver
#                    HR-EXP-2026-00025  Ritesh Kumar (E00783)   -- approved
#                    (with their comments, to-dos, approver shares and bill files)
#   Bill Fingerprint BF-00021 .. BF-00024  Janardhanan's trip 1-3 Oct
#                    (and their bill files, if not attached elsewhere)
#   Car Request      CR-00003  Janardhanan A (E00004)  -- approved
#                    CR-00002  Chandrasekar S (E00032) -- pending
#
# Each record is checked against the employee it should belong to (claim
# numbers get reused) -- anything that does not match is left alone and
# named. Nothing else is touched: no older claim, no Additional Salary, no
# flight or Field Expense Day.
#
# Paste into ERP > System Console (Python). DRY = True first: it only lists.
# Then DRY = False, tick Commit, run again. Deleted records cannot be restored.

DRY = True
W = "WOULD DELETE " if DRY else "deleted "

CLAIMS = [["HR-EXP-2026-00026", "E00004"], ["HR-EXP-2026-00025", "E00783"]]
FINGERPRINTS = [["BF-00021", "E00004"], ["BF-00022", "E00004"], ["BF-00023", "E00004"], ["BF-00024", "E00004"]]
CAR_REQUESTS = [["CR-00003", "E00004"], ["CR-00002", "E00032"]]

stop = False
claims = []
for x in CLAIMS:
    c = frappe.db.get_value("Expense Claim", x[0], ["name", "employee", "employee_name", "workflow_state", "docstatus", "total_claimed_amount", "custom_additional_salary", "remark"], as_dict=True)
    if not c:
        print("gone already: Expense Claim " + x[0])
        continue
    if c.employee != x[1]:
        print("SKIP: Expense Claim " + x[0] + " now belongs to " + str(c.employee_name) + " (" + str(c.employee) + "), not " + x[1] + " -- left alone")
        continue
    if int(c.docstatus or 0) == 1:
        print("STOP: " + c.name + " is SUBMITTED -- cancel it in the ERP first; nothing deleted.")
        stop = True
    if c.custom_additional_salary:
        print("STOP: " + c.name + " is finalised (Additional Salary " + c.custom_additional_salary + ") -- nothing deleted.")
        stop = True
    claims.append(c)

if not stop:
    names = []
    for c in claims:
        names.append(c.name)

    # the bill files: attached to these claims, or the fingerprints' own (loose ones only)
    files = []
    seen = []
    if names:
        for f in frappe.get_all("File", filters={"attached_to_doctype": "Expense Claim", "attached_to_name": ["in", names]}, fields=["name", "file_name"], limit_page_length=0):
            seen.append(f.name)
            files.append(f)
    fps = []
    for x in FINGERPRINTS:
        f = frappe.db.get_value("Bill Fingerprint", x[0], ["name", "employee", "kind", "trip", "amount", "status", "file_url"], as_dict=True)
        if not f:
            print("gone already: Bill Fingerprint " + x[0])
            continue
        if f.employee != x[1]:
            print("SKIP: Bill Fingerprint " + x[0] + " is " + str(f.employee) + "'s, not " + x[1] + " -- left alone")
            continue
        fps.append(f)
        if f.file_url:
            owner = frappe.db.get_value("Employee", x[1], "user_id")
            for g in frappe.get_all("File", filters={"file_url": f.file_url, "owner": owner or "-"}, fields=["name", "file_name", "attached_to_doctype", "attached_to_name"], limit_page_length=0):
                if g.name in seen:
                    continue
                if g.attached_to_doctype and not (g.attached_to_doctype == "Expense Claim" and g.attached_to_name in names):
                    continue
                seen.append(g.name)
                files.append(g)

    print("")
    for c in claims:
        nc = frappe.db.count("Comment", {"reference_doctype": "Expense Claim", "reference_name": c.name})
        nt = frappe.db.count("ToDo", {"reference_type": "Expense Claim", "reference_name": c.name})
        ns = frappe.db.count("DocShare", {"share_doctype": "Expense Claim", "share_name": c.name})
        print(W + "Expense Claim " + c.name + " (" + str(c.employee_name) + ", " + str(c.workflow_state) + ", Rs " + str(c.total_claimed_amount) + ") + " + str(nc) + " comment(s), " + str(nt) + " to-do(s), " + str(ns) + " share(s) with the approver")
        if not DRY:
            for x in frappe.get_all("Comment", filters={"reference_doctype": "Expense Claim", "reference_name": c.name}, pluck="name", limit_page_length=0):
                frappe.delete_doc("Comment", x, ignore_permissions=True, force=True)
            for x in frappe.get_all("ToDo", filters={"reference_type": "Expense Claim", "reference_name": c.name}, pluck="name", limit_page_length=0):
                frappe.delete_doc("ToDo", x, ignore_permissions=True, force=True)
            for x in frappe.get_all("DocShare", filters={"share_doctype": "Expense Claim", "share_name": c.name}, pluck="name", limit_page_length=0):
                frappe.delete_doc("DocShare", x, ignore_permissions=True, force=True)
            frappe.delete_doc("Expense Claim", c.name, ignore_permissions=True, force=True)

    print("")
    print(str(len(files)) + " bill file(s):")
    for f in files:
        print("  " + W + "File " + f.name + " " + str(f.file_name))
        if not DRY and frappe.db.exists("File", f.name):
            frappe.delete_doc("File", f.name, ignore_permissions=True, force=True)

    print("")
    print(str(len(fps)) + " Bill Fingerprint(s):")
    for f in fps:
        print("  " + W + f.name + " " + str(f.employee) + " " + str(f.kind) + " " + str(f.trip) + " Rs " + str(f.amount) + " (" + str(f.status) + ")")
        if not DRY:
            frappe.delete_doc("Bill Fingerprint", f.name, ignore_permissions=True, force=True)

    print("")
    for x in CAR_REQUESTS:
        r = frappe.db.get_value("Car Request", x[0], ["name", "employee", "employee_name", "status", "places"], as_dict=True)
        if not r:
            print("gone already: Car Request " + x[0])
            continue
        if r.employee != x[1]:
            print("SKIP: Car Request " + x[0] + " is " + str(r.employee_name) + "'s, not " + x[1] + " -- left alone")
            continue
        print(W + "Car Request " + r.name + " " + str(r.employee_name) + " " + str(r.status) + " -- " + str(r.places))
        if not DRY:
            frappe.delete_doc("Car Request", r.name, ignore_permissions=True, force=True)

    if not DRY:
        frappe.db.commit()
    print("")
    print("DRY RUN: nothing deleted. Check the list, then set DRY = False, tick Commit and run again." if DRY else "done")
