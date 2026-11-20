
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
            sh = frappe.get_doc({
                "doctype": "DocShare",
                "share_doctype": "Expense Claim",
                "share_name": doc.name,
                "user": doc.expense_approver,
                "read": 1,
                "write": 1,
                "share": 0,
                "notify_by_email": 0,
            })
            sh.flags.ignore_share_permission = True   # the user acting has no Share right (12 Nov 2026)
            sh.insert(ignore_permissions=True)

    # 2. Reporting officer approved: the AI score routes it.
    route = None
    note = ""
    # A planner field claim (remark "Field TA/DA · ") waits for the final check
    # on the field-expenses dashboard (12 Nov 2026): it stays Approved, and the
    # check there makes the Additional Salary for the whole month at once.
    # A manager's cab bills (remark "Field Cab · ", 20 Nov 2026) are a record
    # only: the officer's approval is final and Accounts pays it outside
    # payroll -- no AI routing, no Verified, no Additional Salary.
    if now == "Approved" and not str(doc.remark or "").startswith("Field TA/DA · ") and not str(doc.remark or "").startswith("Field Cab · "):
        # Checked = the AI wrote its summary (an empty score reads back as 0).
        scored = bool(doc.get("custom_ai_summary"))
        score = frappe.utils.flt(doc.get("custom_ai_score"))
        # The planner's monthly field TA/DA claim with no bill on it (12 Nov
        # 2026): every line was priced by the ERP itself, so the reporting
        # officer's approval is final -- no AI score, no Accounts review.
        # Its stay / food / fuel / toll bills are checked when scanned (type,
        # date, read, not a repeat): a bill row counts only once the AI
        # checker scored it AUTO_SCORE+ (a possible repeat scores 85 and
        # still goes to Accounts).
        field = str(doc.remark or "").startswith("Field TA/DA · ")
        for r in doc.expenses or []:
            if r.get("custom_bill") and (not r.get("custom_ai_reason") or frappe.utils.flt(r.get("custom_ai_score")) < AUTO_SCORE):
                field = False
        if field or (scored and score >= AUTO_SCORE):
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
            sh = frappe.get_doc({
                "doctype": "DocShare",
                "share_doctype": "Expense Claim",
                "share_name": doc.name,
                "user": VERIFIER,
                "read": 1,
                "write": 1,
                "share": 0,
                "notify_by_email": 0,
            })
            sh.flags.ignore_share_permission = True   # the user acting has no Share right (12 Nov 2026)
            sh.insert(ignore_permissions=True)

    # 5. VERIFIER decided: close the claim's Task and its assignment.
    if was == "In Review" and now in ["Verified", "Rejected"]:
        for t in frappe.get_all("Task", filters={"project": PROJECT, "subject": ["like", tag + " %"], "status": ["not in", ["Completed", "Cancelled"]]}, pluck="name"):
            frappe.db.set_value("Task", t, "status", "Completed" if now == "Verified" else "Cancelled")
            for td in frappe.get_all("ToDo", filters={"reference_type": "Task", "reference_name": t, "status": "Open"}, pluck="name"):
                frappe.db.set_value("ToDo", td, "status", "Closed")
