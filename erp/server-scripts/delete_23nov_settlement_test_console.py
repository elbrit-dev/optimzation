# SYSTEM CONSOLE -- REMOVE THE 23 NOV 2026 SETTLEMENT TEST (prod, after the settlement split went live).
# The test: Madhu B (E01152) added a QA hotel bill of Rs 2,000 (marked "QA TEST BILL"), Vinoth (SM)
# and Rajkumar (GM) approved, the CEO approved the batch, which booked ACC-JV-2026-22257
# (Dr 5229 Accommodation, Cr 2120 Employee Expense Payable / E01152). It was NOT paid.
# Paste into ERP > System Console (type Python), logged in as Administrator.
#   1) DRY = True, "Commit" unticked: only prints what it would do.
#   2) DRY = False, TICK "Commit", Execute.          Safe to re-run.
# The journal entry is CANCELLED (kept, as cancelled, for the audit trail), not deleted; the
# rest is deleted.

DRY = True

JE = "ACC-JV-2026-22257"
SE = "SE-00001"
SR = "SR-00007"
SB = "SB-00001"
BF = "BF-00182"
PHOTO = "/private/files/hotel-hosapete-18nov-se.png"
W = "WOULD " if DRY else ""

# guard: only touch these if they are still the test records
ok = True
if frappe.db.exists("Settlement Expense", SE):
    se = frappe.db.get_value("Settlement Expense", SE, ["employee", "amount", "bill", "journal_entry"], as_dict=True)
    if se.employee != "E01152" or float(se.amount) != 2000.0 or se.bill != PHOTO:
        ok = False
        print("STOP: " + SE + " is not the test bill (" + str(se) + ")")
if frappe.db.exists("Journal Entry", JE):
    rem = frappe.db.get_value("Journal Entry", JE, "user_remark") or ""
    if SE not in rem:
        ok = False
        print("STOP: " + JE + " is not the test booking (remark: " + rem + ")")

if ok:
    # 1. the booking: cancel (nothing was paid against it)
    if frappe.db.exists("Journal Entry", JE):
        st = frappe.db.get_value("Journal Entry", JE, "docstatus")
        if st == 1:
            paid = frappe.db.sql("select count(*) from `tabJournal Entry Account` where reference_type='Journal Entry' and reference_name=%s and docstatus=1", JE)[0][0]
            if paid:
                print("STOP: " + JE + " has a payment against it -- cancel that first")
            else:
                print(W + "cancel " + JE)
                if not DRY:
                    frappe.get_doc("Journal Entry", JE).cancel()
        else:
            print("already cancelled: " + JE)

    # 2. the photo's File records (on the bill and on the journal entry)
    for f in frappe.get_all("File", filters={"file_url": PHOTO}, fields=["name", "attached_to_doctype", "attached_to_name"]):
        print(W + "delete File " + f.name + " (" + str(f.attached_to_doctype) + " " + str(f.attached_to_name) + ")")
        if not DRY:
            frappe.delete_doc("File", f.name, ignore_permissions=True, force=True)

    # 3. shares, notifications, the fingerprint
    for s in frappe.get_all("DocShare", filters={"share_doctype": "Settlement Expense", "share_name": SE}, pluck="name"):
        print(W + "delete DocShare " + s)
        if not DRY:
            frappe.delete_doc("DocShare", s, ignore_permissions=True, force=True)
    for n in frappe.get_all("Notification Log", filters={"document_name": ["in", [SR, SE, SB]]}, pluck="name"):
        print(W + "delete Notification Log " + n)
        if not DRY:
            frappe.delete_doc("Notification Log", n, ignore_permissions=True, force=True)
    if frappe.db.exists("Bill Fingerprint", BF) and frappe.db.get_value("Bill Fingerprint", BF, "trip") == SE:
        print(W + "delete Bill Fingerprint " + BF)
        if not DRY:
            frappe.delete_doc("Bill Fingerprint", BF, ignore_permissions=True, force=True)

    # 4. the batch, the request, the bill
    for dt, nm in [["Settlement Batch", SB], ["Settlement Request", SR], ["Settlement Expense", SE]]:
        if frappe.db.exists(dt, nm):
            print(W + "delete " + dt + " " + nm)
            if not DRY:
                frappe.delete_doc(dt, nm, ignore_permissions=True, force=True)
        else:
            print("already gone: " + dt + " " + nm)

print("dry run -- nothing changed." if DRY else "done. (only saved if Commit was ticked)")
