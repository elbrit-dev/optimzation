# SYSTEM CONSOLE -- delete the 20 Nov 2026 CAB BILLS test (Vinoth Kumar R, E00010, October):
#   Expense Claim HR-EXP-2026-00032 (remark "Field Cab · 2026-10", Approved, record only -- no Additional Salary)
#   with its comments / to-dos / shares / attached bill files, and the test bills' fingerprints
#   BF-00035 .. BF-00039 (QA Rides, Sample Taxi Co, Metro Cab Services, City Taxi Point).
# Nothing else is touched. Prod. System Console, Python, Administrator.
#   1) DRY = True, "Commit" unticked.  2) DRY = False, tick "Commit", Execute.

DRY = True
NAME = "HR-EXP-2026-00032"
EMP = "E00010"
REMARK = "Field Cab · 2026-10"
FPS = ["BF-00035", "BF-00036", "BF-00037", "BF-00038", "BF-00039"]
FILE_NAMES = ["cab-a-17oct.png", "cab-b-23oct.png", "cab-d-09oct.png", "cab-e-28oct.png", "cab-c-04nov.png", "lodge-ballari-22-24oct-d.png"]
FILE_OWNERS = ["vinothkumar@elbrit.org"]

W = "WOULD " if DRY else ""
stop = False
if frappe.db.exists("Expense Claim", NAME):
    c = frappe.db.get_value("Expense Claim", NAME, ["employee", "employee_name", "remark", "docstatus", "workflow_state", "total_claimed_amount", "custom_additional_salary"], as_dict=True)
    if c.employee != EMP or c.remark != REMARK or int(c.docstatus or 0) != 0:
        print("STOP -- " + NAME + " is not the cab test claim (" + str(c.employee) + ", " + str(c.remark) + ", docstatus " + str(c.docstatus) + "); nothing deleted.")
        stop = True
    elif c.custom_additional_salary:
        print("STOP -- " + NAME + " has Additional Salary " + str(c.custom_additional_salary) + " (should never happen for a cab claim); nothing deleted.")
        stop = True
    else:
        nc = frappe.db.count("Comment", {"reference_doctype": "Expense Claim", "reference_name": NAME})
        nf = frappe.db.count("File", {"attached_to_doctype": "Expense Claim", "attached_to_name": NAME})
        print(W + "delete Expense Claim " + NAME + " (" + str(c.employee_name) + ", " + str(c.workflow_state) + ", Rs " + str(c.total_claimed_amount) + ") + " + str(nc) + " comments, " + str(nf) + " files")
        if not DRY:
            for n in frappe.get_all("Comment", filters={"reference_doctype": "Expense Claim", "reference_name": NAME}, pluck="name", limit_page_length=0):
                frappe.delete_doc("Comment", n, ignore_permissions=True, force=True)
            for n in frappe.get_all("ToDo", filters={"reference_type": "Expense Claim", "reference_name": NAME}, pluck="name", limit_page_length=0):
                frappe.delete_doc("ToDo", n, ignore_permissions=True, force=True)
            for n in frappe.get_all("DocShare", filters={"share_doctype": "Expense Claim", "share_name": NAME}, pluck="name", limit_page_length=0):
                frappe.delete_doc("DocShare", n, ignore_permissions=True, force=True)
            for n in frappe.get_all("File", filters={"attached_to_doctype": "Expense Claim", "attached_to_name": NAME}, pluck="name", limit_page_length=0):
                frappe.delete_doc("File", n, ignore_permissions=True, force=True)
            frappe.delete_doc("Expense Claim", NAME, ignore_permissions=True, force=True)
else:
    print("(gone) " + NAME)

if not stop:
    for f in frappe.get_all("File", filters={"file_name": ["in", FILE_NAMES], "owner": ["in", FILE_OWNERS]}, fields=["name", "file_name"], limit_page_length=0):
        print(W + "delete File " + f.name + " " + f.file_name)
        if not DRY:
            frappe.delete_doc("File", f.name, ignore_permissions=True, force=True)
    for b in FPS:
        if frappe.db.exists("Bill Fingerprint", b):
            v = frappe.db.get_value("Bill Fingerprint", b, ["employee", "vendor", "amount", "status"], as_dict=True)
            if v.employee != EMP:
                print("skip " + b + " -- not " + EMP + "'s")
                continue
            print(W + "delete Bill Fingerprint " + b + " (" + str(v.vendor) + ", Rs " + str(v.amount) + ", " + str(v.status) + ")")
            if not DRY:
                frappe.delete_doc("Bill Fingerprint", b, ignore_permissions=True, force=True)
    if not DRY:
        frappe.db.commit()
print("dry run -- nothing changed." if DRY else "done.")
