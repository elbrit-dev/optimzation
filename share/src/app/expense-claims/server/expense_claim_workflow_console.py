# Expense claims: the approval flow (21 Oct 2026).
#
#   Draft --Send for Approval--> Waiting for Approval      (the employee)
#   Waiting for Approval --Approve--> Approved              (reporting officer)
#   Waiting for Approval --Reject--> Rejected               (reporting officer)
#   Waiting for Approval --Withdraw--> Draft                (the employee)
#   Rejected --Send for Approval--> Waiting for Approval    (the employee, after fixing)
#   Approved -> Verified (AI score >= 90, automatic) or In Review (Task to Sathishkumar)
#   In Review --Verify--> Verified / --Reject--> Rejected   (Sathishkumar)
#   Verified: non-Advance rows go to next month's payroll as an Additional Salary.
#
# Installs:
#   - fields on Expense Claim: AI score / risk / summary, payroll entry
#   - fields on each row: Bill (attachment), amount / date / vendor read off
#     the bill, AI score / risk / reason
#   - workflow states + actions, workflow "Expense Claim Approval"
#   - server scripts "Expense Claim Approver" + "Expense Claim AI Guard"
#     (Before Save) and "Expense Claim Route" (After Save) -- sources in this
#     folder (expense_claim_approver.py, expense_claim_ai_guard.py,
#     expense_claim_route.py); keep in step
#   - disables "Expense Claim Task" if it was installed (Route replaces it)
#   - marks the existing draft claims as Draft in the workflow
#
# Paste into ERP > System Console (type Python), logged in as a System Manager.
# 1) Run with DRY = True and "Commit" UNticked: it only prints what it would do.
# 2) Set DRY = False, tick "Commit", run again.
# Safe to re-run: fields/states/actions are skipped, the workflow and the two
# scripts are rewritten to match this file.

DRY = True

VERIFIER = "sathish.admin@elbrit.org"
WF = "Expense Claim Approval"
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

ROUTE_SCRIPT = r'''
VERIFIER = "sathish.admin@elbrit.org"     # Sathishkumar Kumaresan
PROJECT = "PROJ-2026-2027-0016"           # "Expense claim"
COMPONENT = "Field Expenses Reimbursement"
NO_PAYROLL = ["Advance"]
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

        # 3c. Payroll for next month.
        if pay > 0 and not doc.get("custom_additional_salary"):
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

# 0. Checks
for chk in [["User", VERIFIER], ["Project", "PROJ-2026-2027-0016"], ["Salary Component", "Field Expenses Reimbursement"]]:
    print(("ok: " if frappe.db.exists(chk[0], chk[1]) else "MISSING: ") + chk[0] + " " + chk[1])

# 1. Fields
RISK = "\nLow\nMedium\nHigh"
FIELDS = [
    # the claim
    {"dt": "Expense Claim", "fieldname": "custom_ai_score", "label": "AI Score", "fieldtype": "Percent",
     "insert_after": "approval_status", "read_only": 1, "no_copy": 1,
     "description": "How closely the bills match the claim (0-100), amount first. 90+ is verified without a review."},
    {"dt": "Expense Claim", "fieldname": "custom_ai_risk", "label": "AI Risk", "fieldtype": "Select", "options": RISK,
     "insert_after": "custom_ai_score", "read_only": 1, "no_copy": 1, "in_list_view": 1, "in_standard_filter": 1,
     "description": "From the score: 90+ Low, 70-89 Medium, below 70 High."},
    {"dt": "Expense Claim", "fieldname": "custom_ai_summary", "label": "AI Summary", "fieldtype": "Small Text",
     "insert_after": "custom_ai_risk", "read_only": 1, "no_copy": 1},
    {"dt": "Expense Claim", "fieldname": "custom_additional_salary", "label": "Payroll Entry", "fieldtype": "Link",
     "options": "Additional Salary", "insert_after": "custom_ai_summary", "read_only": 1, "no_copy": 1},
    # advances: a spend claim points at its advance; the advance keeps the tally
    {"dt": "Expense Claim", "fieldname": "custom_advance", "label": "Against Advance", "fieldtype": "Link",
     "options": "Expense Claim", "insert_after": "custom_additional_salary", "no_copy": 1,
     "description": "For spends of an advance: the advance claim they are paid from."},
    {"dt": "Expense Claim", "fieldname": "custom_advance_covered", "label": "Covered by Advance", "fieldtype": "Currency",
     "insert_after": "custom_advance", "read_only": 1, "no_copy": 1},
    {"dt": "Expense Claim", "fieldname": "custom_advance_spent", "label": "Advance Spent", "fieldtype": "Currency",
     "insert_after": "custom_advance_covered", "read_only": 1, "no_copy": 1},
    {"dt": "Expense Claim", "fieldname": "custom_advance_balance", "label": "Advance Balance", "fieldtype": "Currency",
     "insert_after": "custom_advance_spent", "read_only": 1, "no_copy": 1},
    # claim types whose sub type list users may add to (Advance)
    {"dt": "Expense Claim Type", "fieldname": "custom_allow_new_sub_types", "label": "Users can add sub types",
     "fieldtype": "Check", "insert_after": "custom_sub_types", "default": "0",
     "description": "A sub type typed on a claim that is not in the list is added to it."},
    # each row: its bill, what the AI read off it, and the row's score
    {"dt": "Expense Claim Detail", "fieldname": "custom_bill", "label": "Bill", "fieldtype": "Attach",
     "insert_after": "sanctioned_amount", "description": "The proof for this row (photo or PDF)."},
    {"dt": "Expense Claim Detail", "fieldname": "custom_bill_amount", "label": "Amount on Bill", "fieldtype": "Currency",
     "insert_after": "custom_bill", "read_only": 1, "no_copy": 1},
    {"dt": "Expense Claim Detail", "fieldname": "custom_bill_date", "label": "Date on Bill", "fieldtype": "Date",
     "insert_after": "custom_bill_amount", "read_only": 1, "no_copy": 1},
    {"dt": "Expense Claim Detail", "fieldname": "custom_bill_vendor", "label": "Vendor on Bill", "fieldtype": "Data",
     "insert_after": "custom_bill_date", "read_only": 1, "no_copy": 1},
    {"dt": "Expense Claim Detail", "fieldname": "custom_ai_score", "label": "AI Score", "fieldtype": "Percent",
     "insert_after": "custom_bill_vendor", "read_only": 1, "no_copy": 1},
    {"dt": "Expense Claim Detail", "fieldname": "custom_ai_risk", "label": "AI Risk", "fieldtype": "Select", "options": RISK,
     "insert_after": "custom_ai_score", "read_only": 1, "no_copy": 1},
    {"dt": "Expense Claim Detail", "fieldname": "custom_ai_reason", "label": "AI Reason", "fieldtype": "Small Text",
     "insert_after": "custom_ai_risk", "read_only": 1, "no_copy": 1},
    {"dt": "Expense Claim Detail", "fieldname": "custom_bill_meta", "label": "Bill Details (AI)", "fieldtype": "JSON",
     "insert_after": "custom_ai_reason", "read_only": 1, "no_copy": 1,
     "description": "Everything the AI read off this row's bill: vendor, GSTIN, bill no., bill date, what for, payment mode, checks."},
]
for f in FIELDS:
    key = f["dt"] + "-" + f["fieldname"]
    if frappe.db.exists("Custom Field", key):
        print("ok: field " + key)
    else:
        print(W + "add field " + key)
        if not DRY:
            d = {"doctype": "Custom Field"}
            d.update(f)
            frappe.get_doc(d).insert(ignore_permissions=True)

# 1b. Advance: users can add its sub types
OPEN_TYPES = ["Advance"]
for t in OPEN_TYPES:
    if not frappe.db.exists("Expense Claim Type", t):
        print("MISSING: Expense Claim Type " + t)
    elif frappe.db.exists("Custom Field", "Expense Claim Type-custom_allow_new_sub_types") and frappe.db.get_value("Expense Claim Type", t, "custom_allow_new_sub_types"):
        print("ok: users can add sub types to " + t)
    else:
        print(W + "let users add sub types to " + t)
        if not DRY:
            frappe.db.set_value("Expense Claim Type", t, "custom_allow_new_sub_types", 1)

# 2. States and actions
STATES = [["Draft", "Warning"], ["Waiting for Approval", "Primary"], ["Approved", "Success"],
          ["Rejected", "Danger"], ["In Review", "Warning"], ["Verified", "Success"]]
for s in STATES:
    if frappe.db.exists("Workflow State", s[0]):
        print("ok: state " + s[0])
    else:
        print(W + "add state " + s[0])
        if not DRY:
            frappe.get_doc({"doctype": "Workflow State", "workflow_state_name": s[0], "style": s[1]}).insert(ignore_permissions=True)
for a in ["Send for Approval", "Approve", "Reject", "Withdraw", "Verify"]:
    if frappe.db.exists("Workflow Action Master", a):
        print("ok: action " + a)
    else:
        print(W + "add action " + a)
        if not DRY:
            frappe.get_doc({"doctype": "Workflow Action Master", "workflow_action_name": a}).insert(ignore_permissions=True)

# 3. Workflow. Every state is doc_status 0: the claim is never submitted to
#    the ledger -- payroll books the cost.
APPROVER = "doc.expense_approver == frappe.session.user"
OWNER = "doc.owner == frappe.session.user"
VERIFY = "frappe.session.user in ['" + VERIFIER + "', 'Administrator']"
states = [
    {"state": "Draft", "doc_status": "0", "allow_edit": "All", "update_field": "approval_status", "update_value": "Draft"},
    {"state": "Waiting for Approval", "doc_status": "0", "allow_edit": "All", "update_field": "approval_status", "update_value": "Draft"},
    {"state": "Approved", "doc_status": "0", "allow_edit": "All", "update_field": "approval_status", "update_value": "Approved"},
    {"state": "Rejected", "doc_status": "0", "allow_edit": "All", "update_field": "approval_status", "update_value": "Rejected"},
    {"state": "In Review", "doc_status": "0", "allow_edit": "All", "update_field": "approval_status", "update_value": "Approved"},
    {"state": "Verified", "doc_status": "0", "allow_edit": "All", "update_field": "approval_status", "update_value": "Approved"},
]
transitions = [
    {"state": "Draft", "action": "Send for Approval", "next_state": "Waiting for Approval", "allowed": "All", "allow_self_approval": 1},
    {"state": "Rejected", "action": "Send for Approval", "next_state": "Waiting for Approval", "allowed": "All", "allow_self_approval": 1},
    {"state": "Waiting for Approval", "action": "Withdraw", "next_state": "Draft", "allowed": "All", "allow_self_approval": 1, "condition": OWNER},
    {"state": "Waiting for Approval", "action": "Approve", "next_state": "Approved", "allowed": "All", "allow_self_approval": 1, "condition": APPROVER},
    {"state": "Waiting for Approval", "action": "Reject", "next_state": "Rejected", "allowed": "All", "allow_self_approval": 1, "condition": APPROVER},
    {"state": "In Review", "action": "Verify", "next_state": "Verified", "allowed": "All", "allow_self_approval": 1, "condition": VERIFY},
    {"state": "In Review", "action": "Reject", "next_state": "Rejected", "allowed": "All", "allow_self_approval": 1, "condition": VERIFY},
]
if frappe.db.exists("Workflow", WF):
    print(W + "rewrite workflow " + WF)
    if not DRY:
        wf = frappe.get_doc("Workflow", WF)
        wf.set("states", states)
        wf.set("transitions", transitions)
        wf.is_active = 1
        wf.save(ignore_permissions=True)
else:
    print(W + "create workflow " + WF)
    if not DRY:
        frappe.get_doc({"doctype": "Workflow", "workflow_name": WF, "document_type": "Expense Claim",
            "workflow_state_field": "workflow_state", "is_active": 1, "send_email_alert": 0,
            "override_status": 0, "states": states, "transitions": transitions}).insert(ignore_permissions=True)

# 4. Server scripts
for s in [["Expense Claim Approver", "Before Validate", APPROVER_SCRIPT], ["Expense Claim AI Guard", "Before Save", GUARD_SCRIPT], ["Expense Claim Route", "After Save", ROUTE_SCRIPT]]:
    if frappe.db.exists("Server Script", s[0]):
        print(W + "update server script " + s[0])
        if not DRY:
            ss = frappe.get_doc("Server Script", s[0])
            ss.script_type = "DocType Event"
            ss.reference_doctype = "Expense Claim"
            ss.doctype_event = s[1]
            ss.script = s[2]
            ss.disabled = 0
            ss.save(ignore_permissions=True)
    else:
        print(W + "create server script " + s[0] + " (" + s[1] + ")")
        if not DRY:
            frappe.get_doc({"doctype": "Server Script", "name": s[0], "script_type": "DocType Event",
                "reference_doctype": "Expense Claim", "doctype_event": s[1], "script": s[2],
                "disabled": 0}).insert(ignore_permissions=True)

if frappe.db.exists("Server Script", "Expense Claim Task"):
    print(W + "disable old server script Expense Claim Task")
    if not DRY:
        frappe.db.set_value("Server Script", "Expense Claim Task", "disabled", 1)

# 5. Existing draft claims start at Draft in the workflow
drafts = frappe.get_all("Expense Claim", filters={"docstatus": 0}, pluck="name")
print(W + "mark " + str(len(drafts)) + " existing draft claims as Draft (if not already in the workflow)")
if not DRY:
    for c in drafts:
        if not frappe.db.get_value("Expense Claim", c, "workflow_state"):
            frappe.db.set_value("Expense Claim", c, "workflow_state", "Draft", update_modified=False)

print("done" if not DRY else "dry run -- nothing changed")
