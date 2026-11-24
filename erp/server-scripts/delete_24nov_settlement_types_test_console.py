# SYSTEM CONSOLE -- REMOVE THE 24 NOV 2026 SETTLEMENT TYPES TEST (prod).
# The test (app-uat, QA bills marked "QA TEST BILL 24-11-2026", invented vendors):
#   SE-00004  Madhu B (E01152)       Own, Courier & postage, Rs 480  -> SR-00010 -> SM, GM -> batch SB-00001
#             -> CEO approved -> booked ACC-JV-2026-22309 (Dr 5221 Postage & Courier, Cr 2120 / E01152). NOT paid.
#   SE-00005  Nandhakumar V (E00102) Doctor activity, DR-104, Rs 1,650 -> SR-00011 (waiting on Chandrasekar)
#   SE-00006  Nandhakumar V (E00102) Doctor service, DR-104 + its Nov service, Rs 3,500 -> SR-00012 (waiting)
# NOT touched: SE-00001..00003 / SR-00007..00009 -- real bills of Vignesh Somasundaram and Baranidharan B.
# Paste into ERP > System Console (type Python), logged in as Administrator.
#   1) DRY = True, "Commit" unticked: only prints what it would do.
#   2) DRY = False, TICK "Commit", Execute.          Safe to re-run.
# The journal entry is CANCELLED (kept, as cancelled, for the audit trail), not deleted; the rest is deleted.

DRY = True

JE = "ACC-JV-2026-22309"
TEST = {"SE-00004": ["E01152", 480.0], "SE-00005": ["E00102", 1650.0], "SE-00006": ["E00102", 3500.0]}
SRS = ["SR-00010", "SR-00011", "SR-00012"]
SB = "SB-00001"
QA_FILES = ["a-courier-480", "b-lodge-1450", "c-books-1650", "d-bp-monitor-3500", "e-oct-gift-2800"]
QA_USERS = ["madhub@elbrit.org", "nandhakumar.abm@elbrit.org"]
W = "WOULD " if DRY else ""

# guard: only touch these while they are still the test records
ok = True
for se in TEST:
    if frappe.db.exists("Settlement Expense", se):
        r = frappe.db.get_value("Settlement Expense", se, ["employee", "amount", "bill"], as_dict=True)
        qa = False
        for q in QA_FILES:
            if q in str(r.bill):
                qa = True
        if r.employee != TEST[se][0] or float(r.amount) != TEST[se][1] or not qa:
            ok = False
            print("STOP: " + se + " is not the test bill (" + str(r) + ")")
for sr in SRS:
    if frappe.db.exists("Settlement Request", sr):
        rows = frappe.get_all("Settlement Bill", filters={"parent": sr, "parenttype": "Settlement Request"}, pluck="row")
        if not rows or rows[0] not in TEST:
            ok = False
            print("STOP: " + sr + " is not a test request (bills " + str(rows) + ")")
if frappe.db.exists("Settlement Batch", SB):
    for ln in frappe.get_doc("Settlement Batch", SB).lines or []:
        x = ln.request
        if x not in SRS:
            ok = False
            print("STOP: " + SB + " holds " + x + ", not only test requests")
if frappe.db.exists("Journal Entry", JE):
    rem = frappe.db.get_value("Journal Entry", JE, "user_remark") or ""
    if "SE-00004" not in rem:
        ok = False
        print("STOP: " + JE + " is not the test booking (remark: " + rem + ")")

if ok:
    # 1. the booking: cancel (nothing was paid against it)
    if frappe.db.exists("Journal Entry", JE):
        if frappe.db.get_value("Journal Entry", JE, "docstatus") == 1:
            paid = frappe.db.sql("select count(*) from `tabJournal Entry Account` where reference_type='Journal Entry' and reference_name=%s and docstatus=1", JE)[0][0]
            if paid:
                print("STOP: " + JE + " has a payment against it -- cancel that first")
            else:
                print(W + "cancel " + JE)
                if not DRY:
                    frappe.get_doc("Journal Entry", JE).cancel()
        else:
            print("already cancelled: " + JE)

    # 2. the QA photos' File records: on the bills, on the journal entry, and the uploads never
    #    attached (the lodge bill refused as own, the October month test, a retried upload)
    for f in frappe.get_all("File", filters={"owner": ["in", QA_USERS], "creation": [">=", "2026-11-24"]},
                            fields=["name", "file_name", "file_url", "attached_to_doctype", "attached_to_name"], limit_page_length=0):
        qa = False
        for q in QA_FILES:
            if q in str(f.file_name or f.file_url):
                qa = True
        if not qa:
            continue
        print(W + "delete File " + f.name + " " + str(f.file_name) + " (" + str(f.attached_to_doctype) + " " + str(f.attached_to_name) + ")")
        if not DRY:
            frappe.delete_doc("File", f.name, ignore_permissions=True, force=True)
    for f in frappe.get_all("File", filters={"attached_to_doctype": "Journal Entry", "attached_to_name": JE}, pluck="name"):
        print(W + "delete File " + f + " (on " + JE + ")")
        if not DRY:
            frappe.delete_doc("File", f, ignore_permissions=True, force=True)

    # 3. shares, notifications, fingerprints
    names = list(TEST.keys())
    for s in frappe.get_all("DocShare", filters={"share_doctype": "Settlement Expense", "share_name": ["in", names]}, pluck="name"):
        print(W + "delete DocShare " + s)
        if not DRY:
            frappe.delete_doc("DocShare", s, ignore_permissions=True, force=True)
    for n in frappe.get_all("Notification Log", filters={"document_name": ["in", SRS + names + [SB]]}, pluck="name"):
        print(W + "delete Notification Log " + n)
        if not DRY:
            frappe.delete_doc("Notification Log", n, ignore_permissions=True, force=True)
    for b in frappe.get_all("Bill Fingerprint", filters={"trip": ["in", names]}, pluck="name"):
        print(W + "delete Bill Fingerprint " + b)
        if not DRY:
            frappe.delete_doc("Bill Fingerprint", b, ignore_permissions=True, force=True)

    # 4. the batch, the requests, the bills
    todo = [["Settlement Batch", SB]]
    for x in SRS:
        todo.append(["Settlement Request", x])
    for x in names:
        todo.append(["Settlement Expense", x])
    for dt, nm in todo:
        if frappe.db.exists(dt, nm):
            print(W + "delete " + dt + " " + nm)
            if not DRY:
                frappe.delete_doc(dt, nm, ignore_permissions=True, force=True)
        else:
            print("already gone: " + dt + " " + nm)

print("dry run -- nothing changed." if DRY else "done. (only saved if Commit was ticked)")
