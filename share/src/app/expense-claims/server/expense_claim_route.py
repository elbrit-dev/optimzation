# =====================================================================
# SERVER SCRIPT — the source of truth for the ERP's copy. Keep in step.
#
#   Name           : Expense Claim Route
#   Script Type    : DocType Event
#   Reference Doc  : Expense Claim
#   Event          : After Save
#
# Moves a claim along after each workflow step ("Expense Claim Approval"):
#
#   -> Waiting for Approval   share the claim (read + write) with the
#                             reporting officer that "Expense Claim
#                             Approver" (Before Save) put in expense_approver
#   -> Approved               the reporting officer approved. The AI score
#                             (custom_ai_score, 0-100) decides:
#                               >= AUTO_SCORE  -> Verified + payroll
#                               below / none   -> In Review + a Task in the
#                                 "Expense claim" project for VERIFIER
#   In Review -> Verified     VERIFIER verified it -> payroll, Task closed
#   In Review -> Rejected     Task closed
#
# Payroll = one submitted Additional Salary (COMPONENT) for the claim's
# non-Advance rows (sanctioned amount, else amount), on the last day of next
# month, linked back in custom_additional_salary. If the Additional Salary is
# refused (e.g. no salary structure), the claim goes to In Review with a
# Task saying so -- never lost.
#
# Advances (an office float, e.g. HR gets 10k for office spends; no deadline):
#   - an advance claim (Advance rows only) is released by VERIFIER (always In
#     Review: it has no bills to score) and never goes to payroll; on Verified
#     its custom_advance_balance opens at the full amount
#   - spends are ordinary claims with custom_advance = that advance, a bill
#     on every row, through the same approval + AI score; on Verified the
#     advance's balance covers them first (custom_advance_covered on the
#     spend, custom_advance_spent / _balance on the advance) and only what
#     goes beyond the balance is paid through payroll
#
# The claim itself is never submitted (no ledger entry from the claim):
# payroll books the cost, so booking the claim too would count it twice.
#
# Replaces "Expense Claim Task" (a Task on every new claim). Installed by
# expense_claim_workflow_console.py. Added 21 Oct 2026.
#
# safe_exec: no import, no .format(), no set literals, no tuple
# unpacking, no underscore-prefixed names, no def (DocType Event
# functions cannot see top-level names).
# =====================================================================

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
