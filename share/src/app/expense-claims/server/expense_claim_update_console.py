# Expense claims: ERP update (22 Oct 2026). Brings the live ERP in step with
# the app:
#   1. "Expense Approver Missing" fixed: the "Expense Claim Approver" script runs
#      BEFORE VALIDATE and fills the reporting officer on every save where
#      expense_approver is empty (HRMS checks the field in validate).
#   2. An advance claim is exactly ONE line (one amount, one purpose).
#   3. Each claim row gets "Bill Details (AI)" (custom_bill_meta, JSON): what
#      the AI read off that row's bill -- vendor, GSTIN, bill no., bill date,
#      what for, payment mode, checks. Only the AI checker may write it
#      ("Expense Claim AI Guard").
#   4. Payment is instant once a bill is verified (27 Oct 2026), not through
#      payroll: "Expense Claim Route" stops at Verified (score 90+) or the
#      review Task (below 90) and no longer creates an Additional Salary
#      (PAYROLL = False in it). Advance balances are still kept.
# Sources: expense_claim_approver.py, expense_claim_ai_guard.py,
# expense_claim_route.py (this folder).
# Replaces expense_approver_fix_console.py.
#
# After running: Frappe Cloud -> Clear Cache / Restart, so GraphQL sees the
# new field (the app reads it later; the bill check writes it over REST).
#
# Paste into ERP > System Console (type Python), logged in as a System Manager.
# 1) DRY = True, "Commit" unticked: only checks.  2) DRY = False, tick Commit.

DRY = True
W = "WOULD " if DRY else ""

APPROVER_SCRIPT = r'''
FALLBACK = "sathish.admin@elbrit.org"    # Sathishkumar Kumaresan

# Advance rules. An advance claim holds exactly ONE Advance row (one claim =
# one advance, one amount, one purpose -- 22 Oct 2026). Spends are separate claims with custom_advance pointing at the
# employee's own released (Verified) advance; they never ask for an advance.
types = [r.expense_type for r in doc.expenses or []]
if "Advance" in types and len([t for t in types if t != "Advance"]) > 0:
    frappe.throw("An advance claim holds only Advance rows. Add the spends as a separate claim against the advance.")
if "Advance" in types and len(types) > 1:
    frappe.throw("An advance request is one line: one amount for one purpose. Ask for another advance separately.")
if doc.get("custom_advance"):
    if "Advance" in types:
        frappe.throw("A claim against an advance cannot ask for another advance.")
    adv = frappe.db.get_value("Expense Claim", doc.custom_advance, ["employee", "workflow_state"], as_dict=True)
    if not adv or adv.employee != doc.employee:
        frappe.throw("Advance " + str(doc.custom_advance) + " is not this employee's.")
    if adv.workflow_state != "Verified":
        frappe.throw("Advance " + str(doc.custom_advance) + " has not been released yet.")

# Sub types. Each row's sub type must be one of its type's list (Expense
# Claim Type.custom_sub_types, one per line), matched without case. A type
# with custom_allow_new_sub_types ticked (Advance) learns new ones instead:
# what the user typed is added to the type's list, so everyone gets it.
lists = {}
for r in doc.expenses or []:
    sub = " ".join(str(r.get("custom_sub_type") or "").split())
    if not sub or not r.expense_type:
        r.custom_sub_type = sub or None
        continue
    if r.expense_type not in lists:
        t = frappe.db.get_value("Expense Claim Type", r.expense_type, ["custom_sub_types", "custom_allow_new_sub_types"], as_dict=True) or {}
        lists[r.expense_type] = {"subs": [s.strip() for s in str(t.get("custom_sub_types") or "").split("\n") if s.strip()], "open": t.get("custom_allow_new_sub_types")}
    known = lists[r.expense_type]
    match = None
    for s in known["subs"]:
        if s.lower() == sub.lower():
            match = s
    if match:
        r.custom_sub_type = match
    elif known["open"]:
        known["subs"].append(sub)
        frappe.db.set_value("Expense Claim Type", r.expense_type, "custom_sub_types", "\n".join(known["subs"]))
        r.custom_sub_type = sub
    else:
        frappe.throw("Row " + str(r.idx) + ": " + sub + " is not a " + r.expense_type + " sub type. Pick one from the list.")

old = doc.get_doc_before_save()
was = old.workflow_state if old else None

sending = doc.workflow_state == "Waiting for Approval" and was != "Waiting for Approval"
moved = bool(old) and old.employee != doc.employee and doc.workflow_state in [None, "", "Draft", "Rejected"]
if doc.employee and (sending or moved or not doc.expense_approver):
    me = frappe.db.get_value("Employee", doc.employee, "user_id")
    approver = None
    cur = doc.employee
    n = 0
    while n < 10 and not approver:
        n = n + 1
        up = frappe.db.get_value("Employee", cur, "reports_to")
        if not up or up == cur:
            break
        row = frappe.db.get_value("Employee", up, ["status", "user_id"], as_dict=True)
        cur = up
        if row and row.status == "Active" and row.user_id and row.user_id != me:
            if frappe.db.get_value("User", row.user_id, "enabled"):
                approver = row.user_id
    doc.expense_approver = approver or FALLBACK
'''

GUARD_SCRIPT = r'''
AI_USERS = ["Administrator"]
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
            if str(r.get(f) or "") != str(o.get(f) or ""):
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

ROUTE_SCRIPT = r'''
VERIFIER = "sathish.admin@elbrit.org"     # Sathishkumar Kumaresan
PROJECT = "PROJ-2026-2027-0016"           # "Expense claim"
COMPONENT = "Field Expenses Reimbursement"
NO_PAYROLL = ["Advance"]
PAYROLL = False   # Additional Salary on Verified -- off: payment is instant, built later
AUTO_SCORE = 90

old = doc.get_doc_before_save()
was = old.workflow_state if old else None
now = doc.workflow_state

if now and now != was:
    who = doc.employee_name or doc.employee
    tag = "Expense claim " + doc.name

    # 1. Sent: let the reporting officer open and act on it.
    if now == "Waiting for Approval" and doc.expense_approver:
        if not frappe.db.exists("DocShare", {"share_doctype": "Expense Claim", "share_name": doc.name, "user": doc.expense_approver}):
            frappe.get_doc({
                "doctype": "DocShare",
                "share_doctype": "Expense Claim",
                "share_name": doc.name,
                "user": doc.expense_approver,
                "read": 1,
                "write": 1,
                "share": 0,
                "notify_by_email": 0,
            }).insert(ignore_permissions=True)

    # 2. Reporting officer approved: the AI score routes it.
    route = None
    note = ""
    if now == "Approved":
        # Checked = the AI wrote its summary (an empty score reads back as 0).
        scored = bool(doc.get("custom_ai_summary"))
        score = frappe.utils.flt(doc.get("custom_ai_score"))
        if scored and score >= AUTO_SCORE:
            route = "Verified"
        else:
            route = "In Review"
            if len(doc.expenses or []) and len([r for r in doc.expenses if r.expense_type not in NO_PAYROLL]) == 0:
                note = "Advance request -- release the money, then Verify. It is not paid through payroll."
            elif not scored:
                note = "No AI score yet -- please check the bills."
            else:
                note = "AI score " + str(score) + "% -- " + str(doc.get("custom_ai_risk") or "") + " risk (below " + str(AUTO_SCORE) + "). " + str(doc.get("custom_ai_summary") or "") + " Please check the bills."
        frappe.db.set_value("Expense Claim", doc.name, "workflow_state", route)

    # 3. Verified (automatically or by VERIFIER). Happens once per claim:
    #    no transition leaves Verified.
    if route == "Verified" or now == "Verified":
        pay = 0
        advance_amt = 0
        for r in doc.expenses or []:
            amt = frappe.utils.flt(r.sanctioned_amount) or frappe.utils.flt(r.amount)
            if r.expense_type in NO_PAYROLL:
                advance_amt = advance_amt + amt
            else:
                pay = pay + amt

        # 3a. An advance released: its balance opens at the full amount.
        if advance_amt > 0:
            frappe.db.set_value("Expense Claim", doc.name, {"custom_advance_balance": advance_amt, "custom_advance_spent": 0})

        # 3b. Spends against an advance: the advance's balance covers them
        #     first; only what goes beyond it is paid through payroll.
        if pay > 0 and doc.get("custom_advance") and not frappe.utils.flt(doc.get("custom_advance_covered")):
            adv = frappe.db.get_value("Expense Claim", doc.custom_advance, ["custom_advance_balance", "custom_advance_spent"], as_dict=True)
            if adv:
                bal = frappe.utils.flt(adv.custom_advance_balance)
                covered = min(pay, bal) if bal > 0 else 0
                frappe.db.set_value("Expense Claim", doc.custom_advance, {
                    "custom_advance_balance": bal - covered,
                    "custom_advance_spent": frappe.utils.flt(adv.custom_advance_spent) + covered,
                })
                frappe.db.set_value("Expense Claim", doc.name, "custom_advance_covered", covered)
                pay = pay - covered

        # 3c. Payroll for next month (only while PAYROLL is on).
        if PAYROLL and pay > 0 and not doc.get("custom_additional_salary"):
            try:
                ads = frappe.get_doc({
                    "doctype": "Additional Salary",
                    "employee": doc.employee,
                    "company": doc.company,
                    "salary_component": COMPONENT,
                    "amount": pay,
                    "payroll_date": frappe.utils.get_last_day(frappe.utils.add_months(frappe.utils.today(), 1)),
                    "overwrite_salary_structure_amount": 0,
                    "ref_doctype": "Expense Claim",
                    "ref_docname": doc.name,
                })
                ads.flags.ignore_permissions = True
                ads.insert()
                ads.submit()
                frappe.db.set_value("Expense Claim", doc.name, "custom_additional_salary", ads.name)
            except Exception:
                frappe.log_error(title="Expense Claim payroll: " + str(doc.name))
                route = "In Review"
                note = "Verified, but the payroll entry (Additional Salary) was refused -- see the Error Log for " + doc.name + ", fix it and add it by hand."
                frappe.db.set_value("Expense Claim", doc.name, "workflow_state", route)

    # 4. Needs a person: a Task in the "Expense claim" project for VERIFIER.
    if route == "In Review":
        open_task = frappe.db.exists("Task", {"project": PROJECT, "subject": ["like", tag + " %"], "status": ["not in", ["Completed", "Cancelled"]]})
        if not open_task:
            amount = frappe.utils.fmt_money(frappe.utils.flt(doc.total_claimed_amount), currency="INR")
            link = frappe.utils.get_url() + "/app/expense-claim/" + doc.name
            rows = ""
            for r in doc.expenses or []:
                text = str(r.description or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                kind = str(r.expense_type or "")
                if r.get("custom_sub_type"):
                    kind = kind + " / " + str(r.custom_sub_type)
                rows = rows + "<tr><td>" + str(r.expense_date or "") + "</td><td>" + kind + "</td><td>" + text
                rows = rows + "</td><td style='text-align:right'>" + frappe.utils.fmt_money(frappe.utils.flt(r.amount), currency="INR") + "</td></tr>"
            description = "<p>" + note + "</p><p><b>" + str(who) + "</b> (" + str(doc.employee) + ") claimed <b>" + amount
            description = description + "</b> in <a href='" + link + "'>" + doc.name + "</a>, approved by " + str(doc.expense_approver or "") + ".</p>"
            if rows:
                description = description + "<table border='1' cellpadding='4' style='border-collapse:collapse'>"
                description = description + "<tr><th>Date</th><th>Type</th><th>Note</th><th>Amount</th></tr>" + rows + "</table>"
            task = frappe.get_doc({
                "doctype": "Task",
                "subject": tag + " - " + str(who) + " - " + amount,
                "project": PROJECT,
                "status": "Open",
                "priority": "Medium",
                "exp_start_date": frappe.utils.today(),
                "description": description,
            })
            task.flags.ignore_permissions = True
            task.insert()
            todo = frappe.get_doc({
                "doctype": "ToDo",
                "allocated_to": VERIFIER,
                "description": tag + " from " + str(who) + " (" + amount + "): " + note,
                "reference_type": "Task",
                "reference_name": task.name,
                "priority": "Medium",
                "status": "Open",
                "assigned_by": frappe.session.user,
            })
            todo.flags.ignore_permissions = True
            todo.insert()
        if not frappe.db.exists("DocShare", {"share_doctype": "Expense Claim", "share_name": doc.name, "user": VERIFIER}):
            frappe.get_doc({
                "doctype": "DocShare",
                "share_doctype": "Expense Claim",
                "share_name": doc.name,
                "user": VERIFIER,
                "read": 1,
                "write": 1,
                "share": 0,
                "notify_by_email": 0,
            }).insert(ignore_permissions=True)

    # 5. VERIFIER decided: close the claim's Task and its assignment.
    if was == "In Review" and now in ["Verified", "Rejected"]:
        for t in frappe.get_all("Task", filters={"project": PROJECT, "subject": ["like", tag + " %"], "status": ["not in", ["Completed", "Cancelled"]]}, pluck="name"):
            frappe.db.set_value("Task", t, "status", "Completed" if now == "Verified" else "Cancelled")
            for td in frappe.get_all("ToDo", filters={"reference_type": "Task", "reference_name": t, "status": "Open"}, pluck="name"):
                frappe.db.set_value("ToDo", td, "status", "Closed")
'''

# 1. The field
key = "Expense Claim Detail-custom_bill_meta"
if frappe.db.exists("Custom Field", key):
    print("ok: field " + key)
else:
    print(W + "add field " + key + " (JSON, read only)")
    if not DRY:
        frappe.get_doc({"doctype": "Custom Field", "dt": "Expense Claim Detail", "fieldname": "custom_bill_meta",
            "label": "Bill Details (AI)", "fieldtype": "JSON", "insert_after": "custom_ai_reason",
            "read_only": 1, "no_copy": 1,
            "description": "Everything the AI read off this row's bill: vendor, GSTIN, bill no., bill date, what for, payment mode, checks."}).insert(ignore_permissions=True)

# 2. The scripts
for s in [["Expense Claim Approver", "Before Validate", APPROVER_SCRIPT], ["Expense Claim AI Guard", "Before Save", GUARD_SCRIPT], ["Expense Claim Route", "After Save", ROUTE_SCRIPT]]:
    cur = frappe.db.get_value("Server Script", s[0], ["doctype_event"], as_dict=True)
    if not cur:
        print("MISSING: Server Script " + s[0] + " -- run expense_claim_workflow_console.py first")
        continue
    print(W + "update " + s[0] + " (" + str(cur.doctype_event) + " -> " + s[1] + ")")
    if not DRY:
        ss = frappe.get_doc("Server Script", s[0])
        ss.doctype_event = s[1]
        ss.script = s[2]
        ss.disabled = 0
        ss.save(ignore_permissions=True)

print("done" if not DRY else "dry run -- nothing changed")
