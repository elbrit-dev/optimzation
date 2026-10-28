# Miscellaneous bills on PROD -- up to verification only (28 Oct 2026).
# Generated from expense_running_console.py / expense_claim_ai_guard.py /
# expense_claim_workflow_console.py: the code UAT runs. Do not edit by hand.
#
#   Bills     the employee's one open Miscellaneous claim (custom_running),
#             one row per bill (photo in custom_bill). Bill status:
#               Checking  -> Verified   AI score 90+ (written by it@elbrit.org)
#                         -> In Review  below 90 -> a "Bill check" Task in
#                                       Accounts (PROJ-2026-2027-0012), no one
#                                       assigned
#               In Review -> Verified / Rejected (Accounts; Rejected needs a
#                            Review note; never on their own claim)
#   Not here  settlement: no advances, no booking, no Accounts Payable, no
#             Pay Task. The claim stays Draft; Verified is the final step.
#   Workflow  "Expense Claim Approval": no approval action on a running claim
#             (Withdraw only); Administrator may approve / reject / withdraw any.
#
# Installs / updates:
#   fields   Expense Claim.custom_running, Expense Claim Detail.custom_bill_status
#            / custom_review_note / custom_task / custom_bill_meta
#   scripts  Expense Running Guard (Before Validate), Expense Running Route
#            (After Save), Expense Claim AI Guard (Before Save)
#   workflow transition conditions
#
# Paste into ERP > System Console (type Python), logged in as Administrator.
# 1) DRY = True, "Commit" unticked: only prints.  2) DRY = False, tick Commit.
# Safe to re-run. After running: Frappe Cloud -> Clear Cache, and restart the
# site so GraphQL sees the new fields.

DRY = True
W = "WOULD " if DRY else ""

FIELDS = [
 {
  "dt": "Expense Claim",
  "fieldname": "custom_running",
  "label": "Running claim (Miscellaneous)",
  "fieldtype": "Check",
  "insert_after": "approval_status",
  "read_only": 1,
  "no_copy": 1,
  "in_standard_filter": 1,
  "description": "The employee's open Miscellaneous claim: one row per bill, each verified by the AI check or by Accounts."
 },
 {
  "dt": "Expense Claim Detail",
  "fieldname": "custom_bill_status",
  "label": "Bill status",
  "fieldtype": "Select",
  "options": "Checking\nVerified\nIn Review\nRejected",
  "default": "Checking",
  "insert_after": "custom_ai_reason",
  "in_list_view": 1,
  "columns": 1,
  "no_copy": 1
 },
 {
  "dt": "Expense Claim Detail",
  "fieldname": "custom_review_note",
  "label": "Review note",
  "fieldtype": "Small Text",
  "insert_after": "custom_bill_status",
  "no_copy": 1,
  "description": "Accounts: why the bill is rejected (required), or what was checked by hand"
 },
 {
  "dt": "Expense Claim Detail",
  "fieldname": "custom_task",
  "label": "Accounts Task",
  "fieldtype": "Link",
  "options": "Task",
  "insert_after": "custom_review_note",
  "read_only": 1,
  "no_copy": 1
 },
 {
  "dt": "Expense Claim Detail",
  "fieldname": "custom_bill_meta",
  "label": "Bill Details (AI)",
  "fieldtype": "JSON",
  "insert_after": "custom_ai_reason",
  "read_only": 1,
  "no_copy": 1,
  "description": "Everything the AI read off this row's bill: vendor, GSTIN, bill no., bill date, what for, payment mode, checks."
 }
]

GUARD = r'''
AI_USERS = ["Administrator", "it@elbrit.org"]                 # the AI bill checker
PROJECT = "PROJ-2026-2027-0012"              # "Accounts"
SEE_ALL = ["System Manager", "Accounts Manager", "Accounts User"]
AUTO_SCORE = 90
ROW_INPUT = ["amount", "expense_date", "expense_type", "description", "custom_bill"]

old = doc.get_doc_before_save()
if old and old.get("custom_running"):
    doc.custom_running = 1
if doc.get("custom_running"):
    me = frappe.session.user
    carry = bool(doc.flags.get("carry"))     # set by "Expense Cycle Close"
    checker = me in AI_USERS or carry
    # (no frappe.get_roles in this sandbox, and comprehensions cannot see SEE_ALL)
    accounts = checker or bool(frappe.db.get_value("Has Role", {"parent": me, "parenttype": "User", "role": ["in", SEE_ALL]}, "role"))
    if not accounts:
        accounts = bool(frappe.db.exists("Project User", {"parent": PROJECT, "parenttype": "Project", "user": me}))

    emp = frappe.db.get_value("Employee", doc.employee, ["user_id"], as_dict=True) or {}
    own = emp.get("user_id") == me
    if not accounts and not own:
        frappe.throw("You can only add bills to your own claim.")
    # Who may decide a bill In Review: Accounts, never on their own claim.
    decider = checker or (accounts and not own)
    if doc.docstatus == 0:
        other = frappe.db.get_value("Expense Claim", {"employee": doc.employee, "custom_running": 1, "docstatus": 0, "name": ["!=", doc.name]}, "name")
        if other:
            frappe.throw(str(doc.employee_name or doc.employee) + " already has an open claim, " + other + ". Add the bill there.")

    if not doc.cost_center:
        doc.cost_center = frappe.get_cached_value("Company", doc.company, "cost_center")
    prev = {}
    if old:
        for o in old.expenses or []:
            prev[o.name] = o
    seen = []
    for r in doc.expenses or []:
        o = prev.get(r.name)
        seen.append(r.name)
        if not r.cost_center:
            r.cost_center = doc.cost_center      # the claim cannot be booked without it
        if r.expense_type != "Miscellaneous":
            frappe.throw("Bill " + str(r.idx) + ": only Miscellaneous bills go on this claim.")
        r.description = " ".join(str(r.description or "").split())
        if not r.description:
            frappe.throw("Bill " + str(r.idx) + ": say what it was for.")
        was = (o.get("custom_bill_status") or "Checking") if o else None
        st = r.get("custom_bill_status") or was or "Checking"   # not sent = unchanged
        edited = False
        if o:
            for f in ROW_INPUT:
                if f == "amount":
                    if frappe.utils.flt(r.get(f)) != frappe.utils.flt(o.get(f)):   # 85 vs 85.0
                        edited = True
                elif str(r.get(f) or "") != str(o.get(f) or ""):
                    edited = True
        if edited and was != "Checking" and not checker:
            frappe.throw("Bill " + str(r.idx) + " is already " + was + " and can no longer change.")
        if not o:
            if not checker:
                st = "Checking"
        elif edited and not checker:
            st = "Checking"
        elif st != was:
            if own and not checker and was == "In Review" and st in ["Verified", "Rejected"]:
                frappe.throw("Bill " + str(r.idx) + ": a bill on your own claim is decided by someone else in Accounts.")
            if not decider:
                st = was
            elif was == "In Review" and st in ["Verified", "Rejected"]:
                if st == "Rejected" and not str(r.get("custom_review_note") or "").strip():
                    frappe.throw("Bill " + str(r.idx) + ": say why it is rejected (Review note).")
            elif not checker:
                frappe.throw("Bill " + str(r.idx) + " is " + was + ": only a bill In Review can be decided.")
        # The AI checker's result decides a bill still being checked
        if st == "Checking" and me in AI_USERS and r.get("custom_ai_reason"):
            st = "Verified" if frappe.utils.flt(r.get("custom_ai_score")) >= AUTO_SCORE else "In Review"
        r.custom_bill_status = st
        # Accounts' note is written only while the bill is In Review (when they decide);
        # any other save keeps it -- a save that leaves the field out must not wipe it.
        if not (decider and was == "In Review") and not carry:
            r.custom_review_note = o.get("custom_review_note") if o else None
        if not carry:
            r.custom_task = o.get("custom_task") if o else None    # set only by the Route / Close scripts
        r.sanctioned_amount = r.amount if st == "Verified" else 0
    for name in prev:
        if name not in seen and (prev[name].get("custom_bill_status") or "Checking") != "Checking" and not checker:
            frappe.throw("Bill " + str(prev[name].idx) + " is " + str(prev[name].custom_bill_status) + " and cannot be removed.")
'''

ROUTE = r'''
PROJECT = "PROJ-2026-2027-0012"              # "Accounts"
OPEN = ["Open", "Working", "Pending Review", "Overdue"]

if doc.get("custom_running"):
    who = str(doc.employee_name or doc.employee)
    link = frappe.utils.get_url() + "/app/expense-claim/" + doc.name
    for r in doc.expenses or []:
        st = r.get("custom_bill_status")
        if st == "In Review" and not r.get("custom_task"):
            amount = frappe.utils.fmt_money(r.amount, currency="INR")
            title = str(r.description or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            why = str(r.get("custom_ai_reason") or "No AI reason recorded.").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            body = "<p><b>" + who + "</b> (" + str(doc.employee) + "), claim <a href='" + link + "'>" + doc.name + "</a>, bill " + str(r.idx) + ": <b>"
            body = body + title + "</b>, " + amount + " on " + str(r.expense_date) + ".</p><p>AI score " + str(frappe.utils.cint(r.get("custom_ai_score")))
            body = body + " (" + str(r.get("custom_ai_risk") or "") + "): " + why + "</p>"
            if r.get("custom_bill"):
                body = body + "<p><a href='" + frappe.utils.get_url() + str(r.custom_bill) + "'>Open the bill</a></p>"
            body = body + "<p>Open the claim, set the bill's <b>Bill status</b> to Verified, or to Rejected with a Review note, and save.</p>"
            t = frappe.get_doc({"doctype": "Task", "subject": "Bill check - " + who + " - " + str(r.description) + " - " + amount + " (" + doc.name + ")",
                "project": PROJECT, "status": "Open", "priority": "Medium", "exp_start_date": frappe.utils.today(), "description": body})
            t.flags.ignore_permissions = True
            t.insert()
            frappe.db.set_value("Expense Claim Detail", r.name, "custom_task", t.name)
        elif st in ["Verified", "Rejected"] and r.get("custom_task"):
            if frappe.db.get_value("Task", r.custom_task, "status") in OPEN:
                frappe.db.set_value("Task", r.custom_task, "status", "Completed" if st == "Verified" else "Cancelled")
'''

AI_GUARD = r'''
AI_USERS = ["Administrator", "it@elbrit.org"]
ROW_AI = ["custom_bill_amount", "custom_bill_date", "custom_bill_vendor", "custom_ai_score", "custom_ai_reason", "custom_bill_meta"]
ROW_INPUT = ["amount", "expense_date", "expense_type", "custom_sub_type", "custom_bill"]

old = doc.get_doc_before_save()
prev = {}
if old:
    for o in old.expenses or []:
        prev[o.name] = o

checker = frappe.session.user in AI_USERS
stale = False

for r in doc.expenses or []:
    o = prev.get(r.name)
    if not checker:
        for f in ROW_AI:
            r.set(f, o.get(f) if o else None)
    changed = o is None
    if o:
        for f in ROW_INPUT:
            if f == "amount":
                if frappe.utils.flt(r.get(f)) != frappe.utils.flt(o.get(f)):   # 85 vs 85.0
                    changed = True
            elif str(r.get(f) or "") != str(o.get(f) or ""):
                changed = True
    if changed and not (checker and r.get("custom_ai_reason")):
        for f in ROW_AI:
            r.set(f, None)
        stale = True

if old and len(old.expenses or []) != len(doc.expenses or []):
    stale = True

# Money bookkeeping is written only by "Expense Claim Route" (db.set_value,
# which skips this script) -- a save from anyone else keeps what was there.
for f in ["custom_additional_salary", "custom_advance_balance", "custom_advance_spent", "custom_advance_covered"]:
    doc.set(f, old.get(f) if old else None)

if not checker:
    doc.custom_ai_score = old.get("custom_ai_score") if old else None
    doc.custom_ai_summary = old.get("custom_ai_summary") if old else None
if stale and not (checker and doc.get("custom_ai_summary")):
    doc.custom_ai_score = None
    doc.custom_ai_summary = None

# Risk always follows the score, never typed: 90+ Low, 70-89 Medium, else High.
# An empty Percent reads back as 0, so "checked" means the AI wrote its
# reason (row) / summary (claim) -- it always does. Unchecked = no risk.
for r in doc.expenses or []:
    s = frappe.utils.flt(r.get("custom_ai_score"))
    r.custom_ai_risk = None if not r.get("custom_ai_reason") else ("Low" if s >= 90 else ("Medium" if s >= 70 else "High"))
s = frappe.utils.flt(doc.get("custom_ai_score"))
doc.custom_ai_risk = None if not doc.get("custom_ai_summary") else ("Low" if s >= 90 else ("Medium" if s >= 70 else "High"))
'''

for f in FIELDS:
    key = f["dt"] + "-" + f["fieldname"]
    if frappe.db.exists("Custom Field", key):
        print("ok: field " + key)
    else:
        print(W + "add field " + key)
        if not DRY:
            d = {"doctype": "Custom Field"}
            for k in f:
                d[k] = f[k]
            frappe.get_doc(d).insert(ignore_permissions=True)

SCRIPTS = [
    {"name": "Expense Running Guard", "script_type": "DocType Event", "reference_doctype": "Expense Claim", "doctype_event": "Before Validate", "script": GUARD},
    {"name": "Expense Running Route", "script_type": "DocType Event", "reference_doctype": "Expense Claim", "doctype_event": "After Save", "script": ROUTE},
    {"name": "Expense Claim AI Guard", "script_type": "DocType Event", "reference_doctype": "Expense Claim", "doctype_event": "Before Save", "script": AI_GUARD},
]
for s in SCRIPTS:
    if frappe.db.exists("Server Script", s["name"]):
        print(W + "update Server Script " + s["name"])
        if not DRY:
            ss = frappe.get_doc("Server Script", s["name"])
            for k in s:
                if k != "name":
                    ss.set(k, s[k])
            ss.disabled = 0
            ss.save(ignore_permissions=True)
    else:
        print(W + "create Server Script " + s["name"])
        if not DRY:
            d = {"doctype": "Server Script", "disabled": 0}
            for k in s:
                d[k] = s[k]
            frappe.get_doc(d).insert(ignore_permissions=True)

# Workflow: the same conditions as expense_claim_workflow_console.py.
VERIFIER = "sathish.admin@elbrit.org"
NOT_RUNNING = "not doc.get(\"custom_running\")"
ADMIN = "frappe.session.user == \"Administrator\""
APPROVER = "(doc.expense_approver == frappe.session.user or " + ADMIN + ") and " + NOT_RUNNING
OWNER = "doc.owner == frappe.session.user or " + ADMIN + " or doc.get(\"custom_running\")"
VERIFY = "frappe.session.user in ['" + VERIFIER + "', 'Administrator'] and " + NOT_RUNNING
WANT = {
    "Draft|Send for Approval": NOT_RUNNING,
    "Rejected|Send for Approval": NOT_RUNNING,
    "Waiting for Approval|Withdraw": OWNER,
    "Waiting for Approval|Approve": APPROVER,
    "Waiting for Approval|Reject": APPROVER,
    "In Review|Verify": VERIFY,
    "In Review|Reject": VERIFY,
}
WF = "Expense Claim Approval"
if not frappe.db.exists("Workflow", WF):
    print("MISSING workflow " + WF + " -- run expense_claim_workflow_console.py first")
else:
    wf = frappe.get_doc("Workflow", WF)
    n = 0
    for t in wf.transitions:
        k = str(t.state) + "|" + str(t.action)
        if k in WANT and (t.condition or "") != WANT[k]:
            print(W + "set condition " + k + ": " + WANT[k])
            t.condition = WANT[k]
            n = n + 1
    if n == 0:
        print("ok: workflow conditions")
    elif not DRY:
        wf.save(ignore_permissions=True)

print("done" if not DRY else "DRY RUN: nothing changed. Set DRY = False, tick Commit, run again.")
