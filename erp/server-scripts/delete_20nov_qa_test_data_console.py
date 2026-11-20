# SYSTEM CONSOLE -- delete the 20 Nov 2026 QA test data (expense claims end-to-end test on app-uat,
# which writes to this live ERP). Every record is named below; nothing else is touched.
# Report + screenshots + videos: C:\Users\bbhar\Documents\elbrit-qa\2026-11-20-expense-claims\
#
#   Additional Salary  HR-ADS-26-11-00095 (Vignesh S, 2,681)  HR-ADS-26-11-00096 (Madhu B, 5,999) -- cancelled, then deleted
#   Expense Claim      HR-EXP-2026-00032 (Madhu B, settlement BOOKED: submitted, GL 5228 Dr / 2120 Cr 452) -- cancelled, then deleted
#                      HR-EXP-2026-00028 (Vignesh S, Verified)  00029 (Varun R, Waiting)  00030 (Madhu B, Verified)
#                      00031 (Madhu B, settlement bill)  -- with their comments, to-dos, shares and attached files
#   Settlement         SR-00007 (Madhu B cab bill)  SB-00001 (its CEO batch)
#   Car Request        CR-00003  CR-00004  CR-00005 (Madhu B)
#   Bill Fingerprint   BF-00028 .. BF-00035 (the QA bills: HOTEL SAMPLE RESIDENCY, Demo Comforts Lodge, QA Petro Point, QA Cabs)
#   Bill image files   hotel-ballari-22-24oct*.png  lodge-ballari-22-24oct-d.png  fuel-devanahalli-16oct.png  cab-18nov.png (owner madhub@)
#   Task               TASK-2026-00620 (Vignesh S non-reported day 8 Oct, QA meeting) -- with its to-dos / shares
#
# NOT test data, left alone: HR-EXP-2026-00025/00026 (Vignesh K), every claim before 00028, Field Expense Day rows.
# Note: the HR-EXP numbers were reused during the day (Frappe hands the last number back when the newest is deleted).
#
# Prod. Desk > System Console, Python, as Administrator.
#   1) DRY = True, "Commit" unticked: lists everything and checks nothing is in a salary slip.
#   2) DRY = False, tick "Commit", Execute.   Deleted records cannot be brought back.

DRY = True
ADS = ["HR-ADS-26-11-00095", "HR-ADS-26-11-00096"]
BOOKED = ["HR-EXP-2026-00032"]
CLAIMS = ["HR-EXP-2026-00028", "HR-EXP-2026-00029", "HR-EXP-2026-00030", "HR-EXP-2026-00031", "HR-EXP-2026-00032"]
SETTLE_REQ = ["SR-00007"]
SETTLE_BATCH = ["SB-00001"]
CARS = ["CR-00003", "CR-00004", "CR-00005"]
FPS = ["BF-00028", "BF-00029", "BF-00030", "BF-00031", "BF-00032", "BF-00033", "BF-00034", "BF-00035"]
FILE_NAMES = ["hotel-ballari-22-24oct.png", "hotel-ballari-22-24oct-b.png", "hotel-ballari-22-24oct-c.png",
              "lodge-ballari-22-24oct-d.png", "fuel-devanahalli-16oct.png", "cab-18nov.png"]
FILE_OWNERS = ["madhub@elbrit.org"]
TASKS = ["TASK-2026-00620"]
# what each claim must still be, so a reused number is never deleted by mistake
CLAIM_EMP = {"HR-EXP-2026-00028": "E00869", "HR-EXP-2026-00029": "E00514", "HR-EXP-2026-00030": "E01152",
             "HR-EXP-2026-00031": "E01152", "HR-EXP-2026-00032": "E01152"}

W = "WOULD " if DRY else ""
stop = []

# ---- checks
for c in CLAIMS:
    if frappe.db.exists("Expense Claim", c):
        emp = frappe.db.get_value("Expense Claim", c, "employee")
        if emp != CLAIM_EMP[c]:
            stop.append(c + " now belongs to " + str(emp) + ", not " + CLAIM_EMP[c] + " -- the number was reused; not deleting")
for a in ADS:
    if frappe.db.exists("Additional Salary", a):
        used = frappe.get_all("Salary Detail", filters={"additional_salary": a, "parenttype": "Salary Slip"}, fields=["parent"], limit_page_length=3)
        if used:
            stop.append(a + " is already in salary slip " + used[0].parent)
for t in TASKS:
    if frappe.db.exists("Task", t) and "Vignesh Somasundaram (E00869)" not in (frappe.db.get_value("Task", t, "subject") or ""):
        stop.append(t + " is not the QA non-reported-day task")

if stop:
    print("STOP -- nothing deleted:")
    for s in stop:
        print("   " + s)
else:
    # ---- 1. Additional Salary: cancel + delete, unlink from the claim
    for a in ADS:
        if not frappe.db.exists("Additional Salary", a):
            print("   (gone) " + a)
            continue
        d = frappe.get_doc("Additional Salary", a)
        print(W + "cancel + delete Additional Salary " + a + " (" + str(d.employee_name) + ", Rs " + str(d.amount) + ", payroll " + str(d.payroll_date) + ")")
        if not DRY:
            if d.ref_docname and frappe.db.exists("Expense Claim", d.ref_docname):
                frappe.db.set_value("Expense Claim", d.ref_docname, "custom_additional_salary", None, update_modified=False)
            if d.docstatus == 1:
                d.flags.ignore_permissions = True
                d.cancel()
            frappe.delete_doc("Additional Salary", a, ignore_permissions=True, force=True)

    # ---- 2. the booked (submitted) settlement claim: cancel reverses its GL / payment ledger
    for c in BOOKED:
        if frappe.db.exists("Expense Claim", c) and frappe.db.get_value("Expense Claim", c, "docstatus") == 1:
            gl = frappe.db.count("GL Entry", {"voucher_no": c, "is_cancelled": 0})
            print(W + "cancel Expense Claim " + c + " (submitted; " + str(gl) + " live GL entries reversed)")
            if not DRY:
                d = frappe.get_doc("Expense Claim", c)
                d.flags.ignore_permissions = True
                d.flags.ignore_links = True
                d.cancel()

    # ---- 3. settlement request + batch (children go with them)
    for s in SETTLE_REQ:
        if frappe.db.exists("Settlement Request", s):
            print(W + "delete Settlement Request " + s)
            if not DRY:
                frappe.delete_doc("Settlement Request", s, ignore_permissions=True, force=True)
    for s in SETTLE_BATCH:
        if frappe.db.exists("Settlement Batch", s):
            print(W + "delete Settlement Batch " + s)
            if not DRY:
                frappe.delete_doc("Settlement Batch", s, ignore_permissions=True, force=True)

    # ---- 4. the claims, with comments / to-dos / shares / attached files
    for c in CLAIMS:
        if not frappe.db.exists("Expense Claim", c):
            print("   (gone) " + c)
            continue
        x = frappe.db.get_value("Expense Claim", c, ["employee_name", "workflow_state", "docstatus", "total_claimed_amount"], as_dict=True)
        nc = frappe.db.count("Comment", {"reference_doctype": "Expense Claim", "reference_name": c})
        nt = frappe.db.count("ToDo", {"reference_type": "Expense Claim", "reference_name": c})
        ns = frappe.db.count("DocShare", {"share_doctype": "Expense Claim", "share_name": c})
        nf = frappe.db.count("File", {"attached_to_doctype": "Expense Claim", "attached_to_name": c})
        print(W + "delete Expense Claim " + c + " (" + str(x.employee_name) + ", " + str(x.workflow_state) + ", Rs " + str(x.total_claimed_amount) +
              ") + " + str(nc) + " comments, " + str(nt) + " to-dos, " + str(ns) + " shares, " + str(nf) + " files")
        if not DRY:
            for n in frappe.get_all("Comment", filters={"reference_doctype": "Expense Claim", "reference_name": c}, pluck="name", limit_page_length=0):
                frappe.delete_doc("Comment", n, ignore_permissions=True, force=True)
            for n in frappe.get_all("ToDo", filters={"reference_type": "Expense Claim", "reference_name": c}, pluck="name", limit_page_length=0):
                frappe.delete_doc("ToDo", n, ignore_permissions=True, force=True)
            for n in frappe.get_all("DocShare", filters={"share_doctype": "Expense Claim", "share_name": c}, pluck="name", limit_page_length=0):
                frappe.delete_doc("DocShare", n, ignore_permissions=True, force=True)
            for n in frappe.get_all("File", filters={"attached_to_doctype": "Expense Claim", "attached_to_name": c}, pluck="name", limit_page_length=0):
                frappe.delete_doc("File", n, ignore_permissions=True, force=True)
            frappe.delete_doc("Expense Claim", c, ignore_permissions=True, force=True)

    # ---- 5. loose QA bill image files
    for f in frappe.get_all("File", filters={"file_name": ["in", FILE_NAMES], "owner": ["in", FILE_OWNERS]},
                            fields=["name", "file_name", "attached_to_doctype", "attached_to_name"], limit_page_length=0):
        print(W + "delete File " + f.name + " " + f.file_name + (" (on " + str(f.attached_to_doctype) + " " + str(f.attached_to_name) + ")" if f.attached_to_doctype else ""))
        if not DRY:
            frappe.delete_doc("File", f.name, ignore_permissions=True, force=True)

    # ---- 6. bill fingerprints (the same QA bills can be scanned again)
    for b in FPS:
        if frappe.db.exists("Bill Fingerprint", b):
            v = frappe.db.get_value("Bill Fingerprint", b, ["vendor", "amount", "status"], as_dict=True)
            print(W + "delete Bill Fingerprint " + b + " (" + str(v.vendor) + ", Rs " + str(v.amount) + ", " + str(v.status) + ")")
            if not DRY:
                frappe.delete_doc("Bill Fingerprint", b, ignore_permissions=True, force=True)

    # ---- 7. car requests
    for r in CARS:
        if frappe.db.exists("Car Request", r):
            v = frappe.db.get_value("Car Request", r, ["employee_name", "status", "from_date"], as_dict=True)
            print(W + "delete Car Request " + r + " (" + str(v.employee_name) + ", " + str(v.status) + ", " + str(v.from_date) + ")")
            if not DRY:
                for n in frappe.get_all("Comment", filters={"reference_doctype": "Car Request", "reference_name": r}, pluck="name", limit_page_length=0):
                    frappe.delete_doc("Comment", n, ignore_permissions=True, force=True)
                frappe.delete_doc("Car Request", r, ignore_permissions=True, force=True)

    # ---- 8. the non-reported-day task
    for t in TASKS:
        if frappe.db.exists("Task", t):
            print(W + "delete Task " + t + " + its to-dos / shares / comments")
            if not DRY:
                for n in frappe.get_all("ToDo", filters={"reference_type": "Task", "reference_name": t}, pluck="name", limit_page_length=0):
                    frappe.delete_doc("ToDo", n, ignore_permissions=True, force=True)
                for n in frappe.get_all("DocShare", filters={"share_doctype": "Task", "share_name": t}, pluck="name", limit_page_length=0):
                    frappe.delete_doc("DocShare", n, ignore_permissions=True, force=True)
                for n in frappe.get_all("Comment", filters={"reference_doctype": "Task", "reference_name": t}, pluck="name", limit_page_length=0):
                    frappe.delete_doc("Comment", n, ignore_permissions=True, force=True)
                frappe.delete_doc("Task", t, ignore_permissions=True, force=True)

    if not DRY:
        frappe.db.commit()
    print("")
    print("dry run -- nothing changed." if DRY else "done -- 20 Nov QA test data removed.")
