# SYSTEM CONSOLE -- REMOVE THE EARLY SETTLEMENT TEST DATA (prod, 26 Nov 2026).
# Made 16-23 Nov while testing, from real logins, with generated bill pictures:
#   Vignesh K (E01277, vignesh1277.be@) -- the old settlement-on-Expense-Claim test:
#     SR-00001 .. SR-00006   settlement requests (SR-00005 / 00006 still WAITING on rsuresh@)
#     HR-EXP-2026-00025      draft running claim, 4 lines (01-hotel-clean.jpg, 02-cab-clean.jpg, 11-handwritten.jpg x2)
#     HR-EXP-2026-00026      SUBMITTED from SR-00003 (Rs 485, GL: Dr 5228 / Cr 2120 E01277), nothing paid
#     BF-00024               its fingerprint (KUMAR TOURS & TRAVELS 1200, 11-handwritten.jpg)
#   Suresh R (E00006, rsuresh@) -- one generated bus ticket on his real Oct trip of 14 Oct:
#     BF-00196               Demo Travels Rs 340, C1-bus-eq-out-14oct.png (his 11 other bills are real: untouched)
# NOT touched: Vignesh Somasundaram's HR-EXP-2026-00283 (real TA/DA), every real settlement bill (SE-00008 ...),
# Vinoth Kumar R's Rapido bills (real ride numbers).
# Paste into ERP > System Console (type Python), logged in as Administrator.
#   1) DRY = True, "Commit" unticked: only prints what it would do.
#   2) DRY = False, TICK "Commit", Execute.          Safe to re-run.
# Any record that is not the test record any more -> STOP, nothing changed.

DRY = True

SRS = ["SR-00001", "SR-00002", "SR-00003", "SR-00004", "SR-00005", "SR-00006"]
EMP = "E01277"
CLAIM_DRAFT = "HR-EXP-2026-00025"
CLAIM_BOOKED = "HR-EXP-2026-00026"
TEST_FILES = ["01-hotel-clean.jpg", "02-cab-clean.jpg", "11-handwritten.jpg"]
BF_VIGNESH = "BF-00024"
BF_SURESH = "BF-00196"
BUS_FILE = "C1-bus-eq-out-14oct.png"
W = "WOULD " if DRY else ""
ok = True


def is_test_file(url, names):
    u = str(url or "")
    for n in names:
        if u.endswith("/" + n) or u.endswith(n):
            return True
    return False


# ---- the guards: every record must still be the test record ----
for sr in SRS:
    if not frappe.db.exists("Settlement Request", sr):
        continue
    d = frappe.get_doc("Settlement Request", sr)
    if d.employee != EMP:
        ok = False
        print("STOP: " + sr + " is " + str(d.employee) + ", not " + EMP)
    for b in d.bills or []:
        if not is_test_file(b.bill, TEST_FILES):
            ok = False
            print("STOP: " + sr + " holds a bill that is not a test picture: " + str(b.bill))
for cn in [CLAIM_DRAFT, CLAIM_BOOKED]:
    if not frappe.db.exists("Expense Claim", cn):
        continue
    c = frappe.get_doc("Expense Claim", cn)
    if c.employee != EMP:
        ok = False
        print("STOP: " + cn + " is " + str(c.employee) + ", not " + EMP)
    for l in c.expenses or []:
        if not is_test_file(l.get("custom_bill"), TEST_FILES):
            ok = False
            print("STOP: " + cn + " line " + str(l.idx) + " is not a test picture: " + str(l.get("custom_bill")))
if frappe.db.exists("Expense Claim", CLAIM_BOOKED):
    # nothing paid against the booked one
    pe = frappe.db.sql("select count(*) from `tabPayment Entry Reference` where reference_name=%s and docstatus=1", (CLAIM_BOOKED,))[0][0]
    je = frappe.db.sql("select count(*) from `tabJournal Entry Account` where reference_name=%s and docstatus=1", (CLAIM_BOOKED,))[0][0]
    if pe or je:
        ok = False
        print("STOP: " + CLAIM_BOOKED + " has " + str(pe) + " payment(s) / " + str(je) + " journal entr(ies) against it -- cancel those first")
if frappe.db.exists("Bill Fingerprint", BF_VIGNESH):
    r = frappe.db.get_value("Bill Fingerprint", BF_VIGNESH, ["employee", "file_url"], as_dict=True)
    if r.employee != EMP or not is_test_file(r.file_url, TEST_FILES):
        ok = False
        print("STOP: " + BF_VIGNESH + " is not the test fingerprint (" + str(r) + ")")
if frappe.db.exists("Bill Fingerprint", BF_SURESH):
    r = frappe.db.get_value("Bill Fingerprint", BF_SURESH, ["employee", "vendor", "file_url"], as_dict=True)
    if r.employee != "E00006" or "demo travels" not in str(r.vendor or "").lower() or not is_test_file(r.file_url, [BUS_FILE]):
        ok = False
        print("STOP: " + BF_SURESH + " is not the test bus ticket (" + str(r) + ")")
# the test bus ticket must not sit on any claim line (then it needs a person, not this script)
on_lines = frappe.db.sql("select parent, idx, docstatus from `tabExpense Claim Detail` where custom_bill like %s", ("%" + BUS_FILE,), as_dict=True)
for x in on_lines:
    ok = False
    print("STOP: the test bus ticket is on claim " + str(x.parent) + " line " + str(x.idx) + " -- take it off that claim by hand first")

if ok:
    # 1. the settlement requests (they link to the draft claim)
    for sr in SRS:
        if frappe.db.exists("Settlement Request", sr):
            print(W + "delete Settlement Request " + sr + " (" + str(frappe.db.get_value("Settlement Request", sr, "status")) + ")")
            if not DRY:
                frappe.delete_doc("Settlement Request", sr, ignore_permissions=True, force=True)
        else:
            print("already gone: " + sr)
    # 2. the booked claim: cancelled (its GL reversed), then deleted
    if frappe.db.exists("Expense Claim", CLAIM_BOOKED):
        if frappe.db.get_value("Expense Claim", CLAIM_BOOKED, "docstatus") == 1:
            print(W + "cancel Expense Claim " + CLAIM_BOOKED + " (reverses Dr 5228 / Cr 2120 Rs 485)")
            if not DRY:
                c = frappe.get_doc("Expense Claim", CLAIM_BOOKED)
                c.flags.ignore_permissions = True
                c.cancel()
    # 3. the claims' File records, the claims, the notifications and to-dos on them
    for cn in [CLAIM_BOOKED, CLAIM_DRAFT]:
        if not frappe.db.exists("Expense Claim", cn):
            print("already gone: " + cn)
            continue
        for f in frappe.get_all("File", filters={"attached_to_doctype": "Expense Claim", "attached_to_name": cn}, fields=["name", "file_name"], limit_page_length=0):
            print(W + "delete File " + f.name + " " + str(f.file_name) + " (on " + cn + ")")
            if not DRY:
                frappe.delete_doc("File", f.name, ignore_permissions=True, force=True)
        for t in frappe.get_all("ToDo", filters={"reference_type": "Expense Claim", "reference_name": cn}, pluck="name"):
            print(W + "delete ToDo " + t + " (on " + cn + ")")
            if not DRY:
                frappe.delete_doc("ToDo", t, ignore_permissions=True, force=True)
        print(W + "delete Expense Claim " + cn)
        if not DRY:
            frappe.delete_doc("Expense Claim", cn, ignore_permissions=True, force=True)
    for n in frappe.get_all("Notification Log", filters={"document_name": ["in", SRS + [CLAIM_DRAFT, CLAIM_BOOKED]]}, pluck="name"):
        print(W + "delete Notification Log " + n)
        if not DRY:
            frappe.delete_doc("Notification Log", n, ignore_permissions=True, force=True)
    # 4. the two test fingerprints (Suresh's other bills stay)
    for bf in [BF_VIGNESH, BF_SURESH]:
        if frappe.db.exists("Bill Fingerprint", bf):
            print(W + "delete Bill Fingerprint " + bf)
            if not DRY:
                frappe.delete_doc("Bill Fingerprint", bf, ignore_permissions=True, force=True)
        else:
            print("already gone: " + bf)
    # 5. any other copies of the test pictures by these two logins (uploaded, never attached)
    for f in frappe.get_all("File", filters={"owner": ["in", ["vignesh1277.be@elbrit.org", "rsuresh@elbrit.org"]]},
                            fields=["name", "file_name", "file_url", "attached_to_doctype", "attached_to_name"], limit_page_length=0):
        if not is_test_file(f.file_url or f.file_name, TEST_FILES + [BUS_FILE]):
            continue
        if f.attached_to_name and f.attached_to_doctype not in ["Expense Claim", "Settlement Request"]:
            print("left (attached to " + str(f.attached_to_doctype) + " " + str(f.attached_to_name) + "): File " + f.name + " " + str(f.file_name))
            continue
        print(W + "delete File " + f.name + " " + str(f.file_name))
        if not DRY:
            frappe.delete_doc("File", f.name, ignore_permissions=True, force=True)

print("dry run -- nothing changed." if DRY else "done. (only saved if Commit was ticked)")
