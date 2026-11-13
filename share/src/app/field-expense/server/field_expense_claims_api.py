# Server Script "Field Expense Claims API" -- type API, method field_expense_claims
# (12 Nov 2026). The final check of the planner's monthly field TA/DA claims,
# on the field-expenses dashboard, after the reporting officer approved them.
#
#   GET  action=month    month             verifier: every field claim of the month
#                                          (with the officer / approved / finalised),
#                                          its lines and their adjustments
#   POST action=adjust   claim, lines      verifier: change line amounts on an
#                        (JSON [{row, amount}]), reason (needed for a change)
#   POST action=finalize month             verifier: EVERY approved field claim of
#                                          the month at once -> one Additional Salary
#                                          each ("Field Expenses Reimbursement") with
#                                          the adjusted amounts, claim -> Verified
#   GET  action=mine     month             anyone: their own claim's lines, with who
#                                          adjusted what and why, and its state
#
# Verifiers: sathish.admin@elbrit.org, the CEO (ceo@elbrit.org), System Manager,
# Administrator. Writes go through db.set_value (the claim's own scripts do not
# run): the officer already approved, and payroll is made here, once.
# safe_exec: plain loops only, no defs, no comprehensions over top-level names.

VERIFIER_USERS = ["sathish.admin@elbrit.org", "ceo@elbrit.org", "Administrator"]
VERIFIER_ROLES = ["System Manager"]
COMPONENT = "Field Expenses Reimbursement"
NO_PAYROLL = ["Advance"]
PREFIX = "Field TA/DA · "
LINE_COLS = ["name", "parent", "idx", "expense_date", "expense_type", "description", "amount", "sanctioned_amount",
             "custom_bill", "custom_ai_score", "custom_ai_reason", "custom_adjusted", "custom_adjusted_amount",
             "custom_adjust_reason", "custom_adjusted_by", "custom_adjusted_on",
             "custom_trip", "custom_trip_decision", "custom_trip_note"]
CLAIM_COLS = ["name", "employee", "employee_name", "remark", "workflow_state", "expense_approver", "total_claimed_amount",
              "custom_additional_salary", "custom_finalised_by", "custom_finalised_on", "modified",
              "custom_ai_score", "custom_ai_risk", "custom_ai_summary"]

fd = frappe.form_dict
action = str(fd.get("action") or "month")
me = frappe.session.user
if not me or me == "Guest":
    frappe.throw("Please log in", frappe.PermissionError)
verifier = me in VERIFIER_USERS
if not verifier and frappe.db.exists("Has Role", {"parent": me, "parenttype": "User", "role": ["in", VERIFIER_ROLES]}):
    verifier = True
month = str(fd.get("month") or "")[:7]

if action in ["month", "finalize", "mine"] and (len(month) != 7 or month[4] != "-"):
    frappe.throw("month is required, e.g. 2026-10")

if action == "month" or action == "mine":
    filters = {"remark": PREFIX + month, "docstatus": ["<", 2]}
    if action == "mine":
        emp = frappe.db.get_value("Employee", {"user_id": me, "status": "Active"}, "name")
        filters["employee"] = emp or "-"
    elif not verifier:
        frappe.throw("The final check is for Accounts, the CEO and System Managers.", frappe.PermissionError)
    claims = frappe.get_all("Expense Claim", filters=filters, fields=CLAIM_COLS, order_by="employee_name asc", limit_page_length=0)
    names = []
    for c in claims:
        names.append(c.name)
    lines = []
    if names:
        lines = frappe.get_all("Expense Claim Detail", filters={"parent": ["in", names], "parenttype": "Expense Claim"}, fields=LINE_COLS, order_by="parent asc, idx asc", limit_page_length=0)
    who = {}
    for l in lines:
        if l.custom_adjusted_by and not who.get(l.custom_adjusted_by):
            who[l.custom_adjusted_by] = frappe.db.get_value("User", l.custom_adjusted_by, "full_name") or l.custom_adjusted_by
    for c in claims:
        if c.custom_finalised_by and not who.get(c.custom_finalised_by):
            who[c.custom_finalised_by] = frappe.db.get_value("User", c.custom_finalised_by, "full_name") or c.custom_finalised_by
    # 13 Nov 2026: each payable day's road km (its Field Expense Day legs: a
    # both-ways run twice, a flown leg not at all) for the employees with
    # own-car lines -- the dashboard spreads a trip's fuel over its days by
    # it, exactly as the planner shows the rep
    km = {}
    car_emps = []
    for l in lines:
        if l.expense_type in ["Fuel", "Toll"]:
            for c in claims:
                if c.name == l.parent and c.employee not in car_emps:
                    car_emps.append(c.employee)
    if car_emps:
        first = month + "-01"
        last = str(frappe.utils.get_last_day(first))
        for d in frappe.get_all("Field Expense Day", filters={"employee": ["in", car_emps], "date": ["between", [first, last]]}, fields=["employee", "date", "detail_json"], limit_page_length=0):
            det = {}
            if d.detail_json:
                det = json.loads(d.detail_json) or {}
            if not det.get("payable"):
                continue
            w = 0
            for g in det.get("legs") or []:
                if g.get("flown"):
                    continue
                k = g.get("rounded_km")
                if k is None:
                    k = g.get("km")
                w = w + frappe.utils.flt(k) * (2 if g.get("both_ways") else 1)
            km[d.employee + "|" + str(d.date)[:10]] = w
    frappe.response["message"] = {"month": month, "verifier": verifier, "claims": claims, "lines": lines, "names": who, "km": km}

elif action == "adjust":
    if not verifier:
        frappe.throw("Only Accounts, the CEO and System Managers adjust field claims.", frappe.PermissionError)
    claim = str(fd.get("claim") or "")
    c = frappe.db.get_value("Expense Claim", claim, ["name", "remark", "workflow_state", "docstatus"], as_dict=True) if claim else None
    if not c or not str(c.remark or "").startswith(PREFIX):
        frappe.throw("Not a field TA/DA claim.")
    if c.workflow_state != "Approved" or c.docstatus != 0:
        frappe.throw(claim + " is " + str(c.workflow_state) + " -- only an approved claim, before it is finalised, can be adjusted.")
    reason = " ".join(str(fd.get("reason") or "").split())[:1000]
    wanted = json.loads(fd.get("lines") or "[]")
    rows = {}
    for l in frappe.get_all("Expense Claim Detail", filters={"parent": claim, "parenttype": "Expense Claim"}, fields=LINE_COLS, limit_page_length=0):
        rows[l.name] = l
    changes = []
    for w in wanted:
        r = rows.get(str(w.get("row") or ""))
        if not r:
            frappe.throw("A line of " + claim + " was not found -- refresh and try again.")
        amt = frappe.utils.flt(w.get("amount"))
        if amt < 0:
            frappe.throw("An amount cannot be below 0.")
        was = frappe.utils.flt(r.custom_adjusted_amount) if r.custom_adjusted else frappe.utils.flt(r.amount)
        if abs(amt - was) < 0.5:
            continue
        changes.append({"r": r, "amt": amt, "was": was})
    if changes and not reason:
        frappe.throw("Say why the amount is changed -- the employee sees this.")
    now = frappe.utils.now()
    text = []
    for ch in changes:
        r = ch["r"]
        back = abs(ch["amt"] - frappe.utils.flt(r.amount)) < 0.5
        if back:
            frappe.db.set_value("Expense Claim Detail", r.name, {"custom_adjusted": 0, "custom_adjusted_amount": 0, "custom_adjust_reason": "", "custom_adjusted_by": None, "custom_adjusted_on": None, "sanctioned_amount": r.amount}, update_modified=False)
        else:
            frappe.db.set_value("Expense Claim Detail", r.name, {"custom_adjusted": 1, "custom_adjusted_amount": ch["amt"], "custom_adjust_reason": reason, "custom_adjusted_by": me, "custom_adjusted_on": now, "sanctioned_amount": ch["amt"]}, update_modified=False)
        text.append(str(r.expense_type) + " " + str(r.expense_date) + ": Rs " + str(frappe.utils.flt(ch["was"])) + " -> Rs " + str(ch["amt"]))
    if text:
        frappe.get_doc({"doctype": "Comment", "comment_type": "Comment", "reference_doctype": "Expense Claim", "reference_name": claim,
                        "content": "Adjusted on the final check: " + "; ".join(text) + ". Reason: " + reason}).insert(ignore_permissions=True)
    frappe.response["message"] = {"claim": claim, "changed": len(text)}

elif action == "finalize":
    if not verifier:
        frappe.throw("Only Accounts, the CEO and System Managers finalise field claims.", frappe.PermissionError)
    claims = frappe.get_all("Expense Claim", filters={"remark": PREFIX + month, "docstatus": 0, "workflow_state": "Approved"}, fields=["name", "employee", "employee_name", "company", "custom_additional_salary"], limit_page_length=0)
    done = []
    failed = []
    total = 0
    payroll_date = frappe.utils.get_last_day(frappe.utils.add_months(frappe.utils.today(), 1))
    for c in claims:
        try:
            pay = 0
            for l in frappe.get_all("Expense Claim Detail", filters={"parent": c.name, "parenttype": "Expense Claim"}, fields=["name", "expense_type", "amount", "custom_adjusted", "custom_adjusted_amount"], limit_page_length=0):
                amt = frappe.utils.flt(l.custom_adjusted_amount) if l.custom_adjusted else frappe.utils.flt(l.amount)
                frappe.db.set_value("Expense Claim Detail", l.name, "sanctioned_amount", amt, update_modified=False)
                if l.expense_type not in NO_PAYROLL:
                    pay = pay + amt
            ads_name = c.custom_additional_salary
            if pay > 0 and not ads_name:
                ads = frappe.get_doc({
                    "doctype": "Additional Salary",
                    "employee": c.employee,
                    "company": c.company,
                    "salary_component": COMPONENT,
                    "amount": pay,
                    "payroll_date": payroll_date,
                    "overwrite_salary_structure_amount": 0,
                    "ref_doctype": "Expense Claim",
                    "ref_docname": c.name,
                })
                ads.flags.ignore_permissions = True
                ads.insert()
                ads.submit()
                ads_name = ads.name
            frappe.db.set_value("Expense Claim", c.name, {"workflow_state": "Verified", "custom_additional_salary": ads_name, "custom_finalised_by": me, "custom_finalised_on": frappe.utils.now()})
            frappe.get_doc({"doctype": "Comment", "comment_type": "Comment", "reference_doctype": "Expense Claim", "reference_name": c.name,
                            "content": "Finalised for payroll: Rs " + str(pay) + (" (" + str(ads_name) + ", " + str(payroll_date) + ")" if ads_name else "")}).insert(ignore_permissions=True)
            done.append({"claim": c.name, "employee": c.employee_name or c.employee, "amount": pay, "additional_salary": ads_name})
            total = total + pay
        except Exception:
            frappe.log_error(title="Field claim finalise: " + str(c.name))
            failed.append({"claim": c.name, "employee": c.employee_name or c.employee})
    frappe.response["message"] = {"month": month, "finalised": done, "failed": failed, "total": total, "payroll_date": str(payroll_date)}

else:
    frappe.throw("Unknown action.")
