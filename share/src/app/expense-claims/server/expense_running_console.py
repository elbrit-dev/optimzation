# Miscellaneous running claim (27 Oct 2026): advances + one open Expense Claim.
#
#   Cash      every payment to an employee is an Employee Advance, paid with a
#             Payment Entry (Accounts). Unused advance (Paid - Claimed -
#             Returned) is the employee's cash in hand.
#   Bills     one OPEN Expense Claim per employee (custom_running = 1), one
#             row per bill: type Miscellaneous, the description is the title
#             ("Fuel - Salem trip"), custom_bill the photo. Row status
#             (custom_bill_status):
#               Checking  -> Verified   AI score 90+ (written by the checker)
#                         -> In Review  below 90 -> a Task in Accounts
#               In Review -> Verified / Rejected (Accounts, Rejected needs a
#                            Review note; never on their own claim)
#             sanctioned_amount = amount when Verified, else 0. No reporting
#             officer step.
#   Cycle     from one payment to the next. When a Payment Entry for an
#             Employee Advance is submitted, the employee's open claim closes:
#               - bills still Checking / In Review move to a new open claim
#               - Verified bills are covered by the employee's advances,
#                 OLDEST first (the claim's Advances table)
#               - the claim is submitted (approval_status Approved); whatever
#                 the advances could not cover is payable to the employee
#                 (Accounts Payable) + a "Pay" Task
#             A claim with no Verified bill yet stays open.
#   Settle    an employee with no advance asks for their money with an
#             ordinary advance request for what they are owed; paying it
#             closes the claim like any other payment.
#   Tasks     Accounts project (PROJ-2026-2027-0012), no one assigned -- the
#             Accounts team assigns them: "Advance" (on request, closed when
#             paid), "Bill check" (In Review, closed when decided), "Pay"
#             (closed when a Payment Entry pays the claim in full).
#   Access    Employee Advance: "All" read / write / create (the sales roles
#             have no Employee role), Accounts submit; lists scoped to the
#             person's own advances ("Employee Advance Scope").
#
# Needs: Company.default_expense_claim_payable_account (a Payable account for
# what is owed to employees) and default_employee_advance_account (a leaf
# Receivable account).
#
# Paste into ERP > System Console (type Python), logged in as a System Manager.
# 1) DRY = True, "Commit" unticked: only prints.  2) DRY = False, tick Commit.
# Safe to re-run: fields already there are skipped, scripts are updated.
# After running: Frappe Cloud -> Clear Cache.
#
# safe_exec: no import, no .format(), no set literals, no tuple unpacking,
# no underscore-prefixed names, no def (DocType Event functions cannot see
# top-level names).

DRY = True
W = "WOULD " if DRY else ""

FIELDS = [
    {"dt": "Expense Claim", "fieldname": "custom_running", "label": "Running claim (Miscellaneous)", "fieldtype": "Check",
     "insert_after": "approval_status", "read_only": 1, "no_copy": 1, "in_standard_filter": 1,
     "description": "The employee's open Miscellaneous claim: bills are added until the next advance payment closes it."},
    {"dt": "Expense Claim Detail", "fieldname": "custom_bill_status", "label": "Bill status", "fieldtype": "Select",
     "options": "Checking\nVerified\nIn Review\nRejected", "default": "Checking", "insert_after": "custom_ai_reason",
     "in_list_view": 1, "columns": 1, "no_copy": 1},
    {"dt": "Expense Claim Detail", "fieldname": "custom_review_note", "label": "Review note", "fieldtype": "Small Text",
     "insert_after": "custom_bill_status", "no_copy": 1,
     "description": "Accounts: why the bill is rejected (required), or what was checked by hand"},
    {"dt": "Expense Claim Detail", "fieldname": "custom_task", "label": "Accounts Task", "fieldtype": "Link", "options": "Task",
     "insert_after": "custom_review_note", "read_only": 1, "no_copy": 1},
    {"dt": "Employee Advance", "fieldname": "custom_task", "label": "Accounts Task", "fieldtype": "Link", "options": "Task",
     "insert_after": "purpose", "read_only": 1, "no_copy": 1},
]

GUARD = r'''
AI_USERS = ["Administrator"]                 # the AI bill checker
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

ADVANCE_TASK = r'''
PROJECT = "PROJ-2026-2027-0012"              # "Accounts"

who = str(doc.employee_name or doc.employee)
amount = frappe.utils.fmt_money(doc.advance_amount, currency="INR")
link = frappe.utils.get_url() + "/app/employee-advance/" + doc.name
purpose = str(doc.purpose or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
held = 0
for a in frappe.get_all("Employee Advance", filters={"employee": doc.employee, "docstatus": 1}, fields=["paid_amount", "claimed_amount", "return_amount"]):
    held = held + frappe.utils.flt(a.paid_amount) - frappe.utils.flt(a.claimed_amount) - frappe.utils.flt(a.return_amount)
verified = 0
running = frappe.db.get_value("Expense Claim", {"employee": doc.employee, "custom_running": 1, "docstatus": 0}, "name")
if running:
    verified = frappe.utils.flt(frappe.db.get_value("Expense Claim", running, "total_sanctioned_amount"))
now = held - verified
state = ("holds " + frappe.utils.fmt_money(now, currency="INR")) if now >= 0 else ("is owed " + frappe.utils.fmt_money(-now, currency="INR"))
body = "<p><b>" + who + "</b> (" + str(doc.employee) + ") asks for <b>" + amount + "</b> in <a href='" + link + "'>" + doc.name + "</a>: " + purpose + "</p>"
body = body + "<p>Right now " + who + " " + state + " (unused advances less verified bills"
if running:
    body = body + " on " + running
body = body + ").</p><p>Approve: submit the advance, then pay it with a Payment Entry -- that closes the open claim. Reject: cancel this Task and the advance.</p>"
t = frappe.get_doc({"doctype": "Task", "subject": "Advance - " + who + " - " + amount + " (" + doc.name + ")",
    "project": PROJECT, "status": "Open", "priority": "High", "exp_start_date": frappe.utils.today(), "description": body})
t.flags.ignore_permissions = True
t.insert()
frappe.db.set_value("Employee Advance", doc.name, "custom_task", t.name)
'''

CLOSE = r'''
PROJECT = "PROJ-2026-2027-0012"              # "Accounts"
OPEN = ["Open", "Working", "Pending Review", "Overdue"]
ROW = ["expense_date", "expense_type", "description", "amount", "default_account", "cost_center", "custom_bill",
       "custom_bill_amount", "custom_bill_date", "custom_bill_vendor", "custom_ai_score", "custom_ai_risk", "custom_ai_reason",
       "custom_bill_meta", "custom_bill_status", "custom_review_note", "custom_task"]

advs = []
if doc.party_type == "Employee" and doc.payment_type == "Pay":
    for ref in doc.references or []:
        if ref.reference_doctype == "Employee Advance" and ref.reference_name not in advs:
            advs.append(ref.reference_name)
for a in advs:
    t = frappe.db.get_value("Employee Advance", a, "custom_task")
    if t and frappe.db.get_value("Task", t, "status") in OPEN:
        frappe.db.set_value("Task", t, "status", "Completed")
# What was owed on a closed claim is paid in full: its "Pay" Task is done
if doc.party_type == "Employee" and doc.payment_type == "Pay":
    for ref in doc.references or []:
        if ref.reference_doctype == "Expense Claim" and frappe.utils.flt(ref.allocated_amount) >= frappe.utils.flt(ref.outstanding_amount):
            for t in frappe.get_all("Task", filters={"project": PROJECT, "subject": ["like", "Pay - % (" + ref.reference_name + ")"], "status": ["in", OPEN]}, pluck="name"):
                frappe.db.set_value("Task", t, "status", "Completed")

name = None
if advs:
    name = frappe.db.get_value("Expense Claim", {"employee": doc.party, "custom_running": 1, "docstatus": 0}, "name")
if name:
    c = frappe.get_doc("Expense Claim", name)
    done = [r for r in c.expenses or [] if r.get("custom_bill_status") in ["Verified", "Rejected"]]
    if len([r for r in done if r.get("custom_bill_status") == "Verified"]) > 0:
        moved = []
        for r in c.expenses or []:
            if r.get("custom_bill_status") not in ["Verified", "Rejected"]:
                row = {}
                for f in ROW:
                    row[f] = r.get(f)
                moved.append(row)
        c.expenses = done
        n = 0
        need = 0
        for r in c.expenses:
            n = n + 1
            r.idx = n
            need = need + frappe.utils.flt(r.sanctioned_amount)
        # Oldest advance money first
        c.advances = []
        for a in frappe.get_all("Employee Advance", filters={"employee": c.employee, "company": c.company, "docstatus": 1},
                fields=["name", "posting_date", "paid_amount", "claimed_amount", "return_amount", "advance_account"],
                order_by="posting_date asc, creation asc"):
            left = frappe.utils.flt(a.paid_amount) - frappe.utils.flt(a.claimed_amount) - frappe.utils.flt(a.return_amount)
            take = left if left < need else need
            if take <= 0:
                continue
            c.append("advances", {"employee_advance": a.name, "posting_date": a.posting_date, "advance_paid": a.paid_amount,
                "unclaimed_amount": left, "allocated_amount": take, "advance_account": a.advance_account})
            need = need - take
        c.approval_status = "Approved"
        if not c.payable_account:
            c.payable_account = frappe.get_cached_value("Company", c.company, "default_expense_claim_payable_account")
        c.flags.carry = True
        c.flags.ignore_permissions = True
        c.submit()

        if moved:
            nc = frappe.get_doc({"doctype": "Expense Claim", "employee": c.employee, "company": c.company, "custom_running": 1,
                "posting_date": frappe.utils.today(), "expense_approver": c.expense_approver, "approval_status": "Draft",
                "payable_account": c.payable_account, "expenses": moved})
            nc.flags.carry = True
            nc.flags.ignore_permissions = True
            nc.insert()
            for r in moved:
                if r.get("custom_task"):
                    d = frappe.db.get_value("Task", r["custom_task"], "description") or ""
                    frappe.db.set_value("Task", r["custom_task"], "description", d + "<p>Moved to " + nc.name + " when " + c.name + " closed.</p>")

        owed = frappe.utils.flt(frappe.db.get_value("Expense Claim", c.name, "grand_total"))
        if owed > 0:
            who = str(c.employee_name or c.employee)
            amount = frappe.utils.fmt_money(owed, currency="INR")
            link = frappe.utils.get_url() + "/app/expense-claim/" + c.name
            body = "<p><b>" + who + "</b> (" + str(c.employee) + ") spent more than the advances cover. <a href='" + link + "'>" + c.name
            body = body + "</a> closed on " + frappe.utils.today() + " with <b>" + amount + "</b> owed (Accounts Payable).</p>"
            body = body + "<p>Pay it with a Payment Entry against this claim (Party Type Employee, reference " + c.name + ").</p>"
            t = frappe.get_doc({"doctype": "Task", "subject": "Pay - " + who + " - " + amount + " (" + c.name + ")",
                "project": PROJECT, "status": "Open", "priority": "High", "exp_start_date": frappe.utils.today(), "description": body})
            t.flags.ignore_permissions = True
            t.insert()
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

SCOPE = r'''
# Permission Query sandbox: no frappe.db.escape, and comprehensions cannot
# see this script's own names (separate locals) -- plain loops only.
SEE_ALL = ["System Manager", "Accounts Manager", "Accounts User", "HR Manager", "HR User"]
PROJECT = "PROJ-2026-2027-0012"              # "Accounts"
u = frappe.session.user
see_all = u == "Administrator"
for r in frappe.db.sql("SELECT role FROM `tabHas Role` WHERE parenttype = 'User' AND parent = %s", [u]):
    if r[0] in SEE_ALL:
        see_all = True
if not see_all and frappe.db.sql("SELECT name FROM `tabProject User` WHERE parenttype = 'Project' AND parent = %s AND user = %s", [PROJECT, u]):
    see_all = True
if see_all:
    conditions = ""
else:
    mine = []
    for r in frappe.db.sql("SELECT name FROM `tabEmployee` WHERE user_id = %s", [u]):
        mine.append("'" + str(r[0]).replace("'", "") + "'")
    conditions = "`tabEmployee Advance`.`employee` in (" + (", ".join(mine) or "''") + ")"
'''

# Employee Advance permissions. Its Custom DocPerm rows (Employee, Employee
# Self Service, Expense Approver) replace the standard ones, so the sales
# roles (no Employee role) cannot ask for cash and Accounts cannot submit.
# Like Expense Claim: "All" may read / write / create; Accounts submit.
# "Employee Advance Scope" keeps lists to the person's own advances.
PERMS = [
    {"role": "All", "read": 1, "write": 1, "create": 1},
    {"role": "Accounts User", "read": 1, "write": 1, "create": 1, "submit": 1, "cancel": 1, "report": 1, "export": 1, "print": 1},
    {"role": "Accounts Manager", "read": 1, "write": 1, "create": 1, "submit": 1, "cancel": 1, "delete": 1, "report": 1, "export": 1, "print": 1},
]
for p in PERMS:
    if frappe.db.exists("Custom DocPerm", {"parent": "Employee Advance", "role": p["role"], "permlevel": 0}):
        print("ok: Employee Advance permission for " + p["role"])
    else:
        print(W + "add Employee Advance permission for " + p["role"])
        if not DRY:
            d = {"doctype": "Custom DocPerm", "parent": "Employee Advance", "parenttype": "DocType", "parentfield": "permissions", "permlevel": 0}
            for k in p:
                d[k] = p[k]
            frappe.get_doc(d).insert(ignore_permissions=True)
# (frappe.clear_cache is not in the console sandbox: Frappe Cloud -> Clear Cache after running.)

SCRIPTS = [
    {"name": "Employee Advance Scope", "script_type": "Permission Query", "reference_doctype": "Employee Advance", "script": SCOPE},
    {"name": "Expense Running Guard", "script_type": "DocType Event", "reference_doctype": "Expense Claim", "doctype_event": "Before Validate", "script": GUARD},
    {"name": "Expense Running Route", "script_type": "DocType Event", "reference_doctype": "Expense Claim", "doctype_event": "After Save", "script": ROUTE},
    {"name": "Employee Advance Task", "script_type": "DocType Event", "reference_doctype": "Employee Advance", "doctype_event": "After Insert", "script": ADVANCE_TASK},
    {"name": "Expense Cycle Close", "script_type": "DocType Event", "reference_doctype": "Payment Entry", "doctype_event": "After Submit", "script": CLOSE},
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

print("done" if not DRY else "DRY RUN: nothing changed. Set DRY = False, tick Commit, run again.")
