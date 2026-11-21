# Delete the app's TEST Expense Claims (13 Nov 2026): HR-EXP-2026-00014 to
# HR-EXP-2026-00025 -- the Claims page tests (Baranidharan B, Sanjay S P,
# Vignesh Kumar S) and the October field TA/DA tests (Vinoth Kumar R E00010,
# Madhu B E01152, Sivaramkumar A E00142). Every older claim is left alone.
#
#   1. those Expense Claims (any state), with their files, comments, to-dos
#   2. the Additional Salary each finalised one made (cancelled first if
#      still submitted), and the claim's link to it
#   3. the bill files: attached to those claims, or scanned for an October
#      trip of theirs (Bill Fingerprint file_url) and owned by them
#   4. their Bill Fingerprints for October trips -- the same test bills can
#      then be scanned again
#   5. their October Car Requests -- and Janardhanan A's (E00004) test car
#      requests (CR-00006 / CR-00007), his only test records
#
# Nothing of anyone else's is touched. Paste into ERP > System Console
# (Python). DRY = True first: it only lists. Then DRY = False, tick Commit,
# run again. Deleted records cannot be brought back.

DRY = True
CLAIMS = ["HR-EXP-2026-00014", "HR-EXP-2026-00015", "HR-EXP-2026-00016", "HR-EXP-2026-00017", "HR-EXP-2026-00018", "HR-EXP-2026-00019", "HR-EXP-2026-00020", "HR-EXP-2026-00021", "HR-EXP-2026-00022", "HR-EXP-2026-00023", "HR-EXP-2026-00024", "HR-EXP-2026-00025"]
EMPLOYEES = ["E00010", "E01152", "E00142"]   # their October bill fingerprints / car requests
CAR_ONLY = ["E00004"]   # car requests only (no test claims or bills)
MONTH = "2026-10"
REMARK = "Field TA/DA · " + MONTH
W = "WOULD DELETE " if DRY else "deleted "

users = []
for e in EMPLOYEES:
    u = frappe.db.get_value("Employee", e, "user_id")
    if u:
        users.append(u)
print("employees: " + ", ".join(EMPLOYEES) + " (logins: " + ", ".join(users) + ")")

# ---- 1 / 2: the claims and their Additional Salary
claims = frappe.get_all("Expense Claim", filters={"name": ["in", CLAIMS]},
                        fields=["name", "employee_name", "workflow_state", "docstatus", "total_claimed_amount", "custom_additional_salary"],
                        limit_page_length=0)
names = []
for c in claims:
    names.append(c.name)
print("")
print(str(len(claims)) + " claim(s): " + ", ".join(names))

stop = False
for c in claims:
    if int(c.docstatus or 0) == 1:
        print("STOP: " + c.name + " is SUBMITTED -- cancel it in the ERP first; nothing deleted.")
        stop = True
    ads = c.custom_additional_salary
    if ads and frappe.db.exists("Additional Salary", ads):
        a = frappe.db.get_value("Additional Salary", ads, ["docstatus", "amount", "employee_name"], as_dict=True)
        used = frappe.get_all("Salary Detail", filters={"additional_salary": ads, "parenttype": "Salary Slip"}, fields=["parent"], limit_page_length=5)
        if used:
            print("STOP: " + ads + " is already in salary slip " + used[0].parent + " -- nothing deleted.")
            stop = True

if not stop:
    for c in claims:
        ads = c.custom_additional_salary
        if ads and frappe.db.exists("Additional Salary", ads):
            a = frappe.get_doc("Additional Salary", ads)
            print(W + "Additional Salary " + ads + " (" + str(a.employee_name) + ", Rs " + str(a.amount) + ", " + ("cancelled" if a.docstatus == 2 else "submitted -> cancel first" if a.docstatus == 1 else "draft") + ")")
            if not DRY:
                frappe.db.set_value("Expense Claim", c.name, "custom_additional_salary", None, update_modified=False)
                if a.docstatus == 1:
                    a.flags.ignore_permissions = True
                    a.cancel()
                frappe.delete_doc("Additional Salary", ads, ignore_permissions=True, force=True)

    # ---- 3: bill files (attached to the claims, or scanned for their October trips)
    urls = []
    fps = frappe.get_all("Bill Fingerprint", filters={"employee": ["in", EMPLOYEES], "trip": ["like", MONTH + "-%"]},
                         fields=["name", "employee", "kind", "trip", "amount", "status", "file_url"], limit_page_length=0)
    for f in fps:
        if f.file_url and f.file_url not in urls:
            urls.append(f.file_url)
    files = []
    seen = []
    if names:
        for f in frappe.get_all("File", filters={"attached_to_doctype": "Expense Claim", "attached_to_name": ["in", names]},
                                fields=["name", "file_name", "file_url"], limit_page_length=0):
            if f.name not in seen:
                seen.append(f.name)
                files.append(f)
    if urls and users:
        for f in frappe.get_all("File", filters={"file_url": ["in", urls], "owner": ["in", users]},
                                fields=["name", "file_name", "file_url", "attached_to_doctype", "attached_to_name"], limit_page_length=0):
            # only loose ones, or ones on these claims -- never a file on someone else's record
            if f.name in seen:
                continue
            if f.attached_to_doctype and not (f.attached_to_doctype == "Expense Claim" and f.attached_to_name in names):
                continue
            seen.append(f.name)
            files.append(f)

    # ---- 1: the claims (and their comments / to-dos)
    print("")
    for c in claims:
        nc = frappe.db.count("Comment", {"reference_doctype": "Expense Claim", "reference_name": c.name})
        nt = frappe.db.count("ToDo", {"reference_type": "Expense Claim", "reference_name": c.name})
        print(W + "Expense Claim " + c.name + " (" + str(c.employee_name) + ", " + str(c.workflow_state) + ", Rs " + str(c.total_claimed_amount) + ") + " + str(nc) + " comment(s), " + str(nt) + " to-do(s)")
        if not DRY:
            for x in frappe.get_all("Comment", filters={"reference_doctype": "Expense Claim", "reference_name": c.name}, pluck="name", limit_page_length=0):
                frappe.delete_doc("Comment", x, ignore_permissions=True, force=True)
            for x in frappe.get_all("ToDo", filters={"reference_type": "Expense Claim", "reference_name": c.name}, pluck="name", limit_page_length=0):
                frappe.delete_doc("ToDo", x, ignore_permissions=True, force=True)
            frappe.delete_doc("Expense Claim", c.name, ignore_permissions=True, force=True)

    print("")
    print(str(len(files)) + " bill file(s):")
    for f in files:
        print("  " + W + "File " + f.name + " " + str(f.file_name))
        if not DRY and frappe.db.exists("File", f.name):
            frappe.delete_doc("File", f.name, ignore_permissions=True, force=True)

    # ---- 4: the fingerprints
    print("")
    print(str(len(fps)) + " Bill Fingerprint(s):")
    for f in fps:
        print("  " + W + f.name + " " + str(f.employee) + " " + str(f.kind) + " " + str(f.trip) + " Rs " + str(f.amount) + " (" + str(f.status) + ")")
        if not DRY:
            frappe.delete_doc("Bill Fingerprint", f.name, ignore_permissions=True, force=True)

    # ---- 5: car requests
    crs = frappe.get_all("Car Request", filters={"employee": ["in", EMPLOYEES + CAR_ONLY], "from_date": ["between", [MONTH + "-01", str(frappe.utils.get_last_day(MONTH + "-01"))]]},
                         fields=["name", "employee_name", "status", "places"], limit_page_length=0)
    print("")
    print(str(len(crs)) + " Car Request(s):")
    for r in crs:
        print("  " + W + r.name + " " + str(r.employee_name) + " " + str(r.status) + " -- " + str(r.places))
        if not DRY:
            frappe.delete_doc("Car Request", r.name, ignore_permissions=True, force=True)

    if not DRY:
        frappe.db.commit()
    print("")
    print("DRY RUN: nothing deleted. Check the list, then set DRY = False, tick Commit and run again." if DRY else "done")
