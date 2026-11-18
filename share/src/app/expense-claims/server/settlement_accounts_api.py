# Server Script "Settlement Accounts API" -- type API, method settlement_accounts
# (18 Nov 2026). Accounts pay employees for settlement bills IN ONE PLACE in
# the ERP: the "Settlement Payments" dashboard (Web Page /settlement-payments,
# listed on the Dashboards workspace next to Field Expenses) -- management:
# paying is Accounts' work in the ERP, not in the app, and it must be clear
# and in one place.
#
# What is owed: bills the CEO approved -- submitted Expense Claims on 2120
# Employee Expense Payable (party = the Employee), Unpaid -- and approved
# cash requests -- submitted Employee Advances on "Employee Expense
# Advances", Unpaid. Both are booked by the Settlement API.
#
#   GET  action=due                         one row per employee: bills, advances, total, bank details;
#                                           the bank accounts; payments of the last 30 days
#   POST action=pay   employees=a,b, bank_account, date, utr [, utr_<EMPLOYEE>]
#                                           after paying at the bank: per employee ONE Payment Entry
#                                           for the bills (-> 2120) and one for the advances; the
#                                           claims / advances turn Paid; the employee is told
#
# Only Accounts (Accounts User / Accounts Manager / System Manager, or a user
# of the "Accounts" project). Amounts are always worked out here, never taken
# from the screen. safe_exec: no import, no .format(), no tuple unpacking, no
# underscore names; comprehensions and defs never read top-level names.

ACCOUNTS_ROLES = ["System Manager", "Accounts Manager", "Accounts User"]
ACCOUNTS_PROJECT = "PROJ-2026-2027-0012"       # "Accounts"
PAY = {
    "company": "Elbrit Lifesciences Private Limited",
    "payable": "2120 - Employee Expense Payable - ELPL",
    "advance": "Employee Expense Advances - ELPL",
    "bank": "234851000001 - ICICI BANK OD/CC Account - ELPL",     # the default; Accounts may pick another
}


def owed(employee_list, cfg):
    # {employee: {employee, employee_name, claims: [...], advances: [...], total}}
    flt = frappe.utils.flt
    out = {}
    cf = {"docstatus": 1, "payable_account": cfg["payable"], "status": "Unpaid"}
    af = {"docstatus": 1, "advance_account": cfg["advance"], "status": "Unpaid"}
    if employee_list:
        cf["employee"] = ["in", employee_list]
        af["employee"] = ["in", employee_list]
    for c in frappe.get_all("Expense Claim", filters=cf, fields=["name", "employee", "employee_name", "posting_date", "grand_total", "total_amount_reimbursed"],
                            order_by="posting_date asc", limit_page_length=0):
        due = flt(c.grand_total) - flt(c.total_amount_reimbursed)
        if due <= 0.005:
            continue
        e = out.get(c.employee) or {"employee": c.employee, "employee_name": c.employee_name, "claims": [], "advances": [], "total": 0}
        e["claims"].append({"name": c.name, "date": str(c.posting_date), "amount": due})
        e["total"] = e["total"] + due
        out[c.employee] = e
    for a in frappe.get_all("Employee Advance", filters=af, fields=["name", "employee", "employee_name", "posting_date", "purpose", "advance_amount", "paid_amount"],
                            order_by="posting_date asc", limit_page_length=0):
        due = flt(a.advance_amount) - flt(a.paid_amount)
        if due <= 0.005:
            continue
        e = out.get(a.employee) or {"employee": a.employee, "employee_name": a.employee_name, "claims": [], "advances": [], "total": 0}
        e["advances"].append({"name": a.name, "date": str(a.posting_date), "purpose": a.purpose or "", "amount": due})
        e["total"] = e["total"] + due
        out[a.employee] = e
    return out


def pay_entry(employee, to_account, refs, amount, bank, date, utr, company):
    # one submitted Payment Entry: bank -> the employee, against refs [{doctype, name, amount}]
    pe = frappe.get_doc({
        "doctype": "Payment Entry",
        "payment_type": "Pay",
        "company": company,
        "posting_date": date,
        "party_type": "Employee",
        "party": employee,
        "paid_from": bank,
        "paid_to": to_account,
        "paid_amount": amount,
        "received_amount": amount,
        "source_exchange_rate": 1,
        "target_exchange_rate": 1,
        "reference_no": utr,
        "reference_date": date,
        "remarks": "Settlement payment, UTR " + utr,
        "references": [],
    })
    for r in refs:
        pe.append("references", {"reference_doctype": r["doctype"], "reference_name": r["name"], "allocated_amount": r["amount"]})
    pe.insert()
    pe.submit()
    return pe.name


def notify(user, subject, doctype, name):
    try:
        frappe.get_doc({"doctype": "Notification Log", "for_user": user, "type": "Alert", "subject": subject,
                        "document_type": doctype, "document_name": name}).insert(ignore_permissions=True)
    except Exception:
        pass


fd = frappe.form_dict
action = str(fd.get("action") or "due")
me = frappe.session.user
accounts = me == "Administrator" or bool(frappe.db.get_value("Has Role", {"parent": me, "parenttype": "User", "role": ["in", ACCOUNTS_ROLES]}, "role"))
if not accounts:
    accounts = bool(frappe.db.exists("Project User", {"parent": ACCOUNTS_PROJECT, "parenttype": "Project", "user": me}))
if not accounts:
    frappe.throw("Paying employees is for Accounts.", frappe.PermissionError)

if action == "due":
    owe = owed(None, PAY)
    names = []
    for e in owe:
        for c in owe[e]["claims"]:
            names.append(c["name"])
    info = {}
    if names:
        for r in frappe.get_all("Expense Claim Detail", filters={"parent": ["in", names], "parenttype": "Expense Claim"},
                                fields=["parent", "description", "expense_date", "custom_bill", "default_account"], limit_page_length=0):
            info[r.parent] = r
    rows = []
    for e in owe:
        x = owe[e]
        for c in x["claims"]:
            r = info.get(c["name"])
            c["title"] = (r.description if r else "") or "Bill"
            c["bill_date"] = str(r.expense_date) if r else ""
            c["bill"] = (r.custom_bill if r else "") or ""
            c["account"] = (r.default_account if r else "") or ""
        emp = frappe.db.get_value("Employee", e, ["bank_name", "bank_ac_no", "ifsc_code", "custom_role_profile"], as_dict=True) or {}
        x["bank_name"] = emp.get("bank_name") or ""
        x["bank_ac_no"] = emp.get("bank_ac_no") or ""
        x["ifsc"] = emp.get("ifsc_code") or ""
        hq = ""
        if emp.get("custom_role_profile"):
            hq = str(frappe.db.get_value("Role Profile", emp.get("custom_role_profile"), "custom_territory") or "")
        if hq[:3].upper() == "HQ-":
            hq = hq[3:]
        x["hq"] = hq
        rows.append(x)
    banks = frappe.get_all("Account", filters={"company": PAY["company"], "account_type": "Bank", "is_group": 0, "disabled": 0}, pluck="name", limit_page_length=50)
    since = frappe.utils.add_days(frappe.utils.today(), -30)
    paid = frappe.get_all("Payment Entry", filters=[["docstatus", "=", 1], ["party_type", "=", "Employee"], ["paid_to", "in", [PAY["payable"], PAY["advance"]]],
                                                    ["posting_date", ">=", since]],
                          fields=["name", "posting_date", "party", "party_name", "paid_amount", "reference_no", "paid_to"],
                          order_by="posting_date desc, creation desc", limit_page_length=200)
    month_start = frappe.utils.get_first_day(frappe.utils.today())
    paid_month = 0
    paid_month_count = 0
    for p in frappe.get_all("Payment Entry", filters=[["docstatus", "=", 1], ["party_type", "=", "Employee"], ["paid_to", "in", [PAY["payable"], PAY["advance"]]],
                                                      ["posting_date", ">=", month_start]], fields=["paid_amount"], limit_page_length=0):
        paid_month = paid_month + frappe.utils.flt(p.paid_amount)
        paid_month_count = paid_month_count + 1
    frappe.response["message"] = {"employees": rows, "banks": banks, "default_bank": PAY["bank"], "paid": paid,
                                  "paid_month": paid_month, "paid_month_count": paid_month_count, "today": frappe.utils.today(),
                                  "user": frappe.get_fullname(me)}

elif action == "pay":
    want = []
    for x in str(fd.get("employees") or "").split(","):
        if x.strip() and x.strip() not in want:
            want.append(x.strip())
    if not want:
        frappe.throw("Tick the employees you paid.")
    bank = str(fd.get("bank_account") or PAY["bank"])
    if frappe.db.get_value("Account", bank, "account_type") != "Bank":
        frappe.throw(bank + " is not a bank account.")
    date = str(fd.get("date") or frappe.utils.today())[:10]
    common = " ".join(str(fd.get("utr") or "").split())[:140]
    owe = owed(want, PAY)
    done = []
    missing = []
    for e in want:
        x = owe.get(e)
        if not x:
            continue
        utr = " ".join(str(fd.get("utr_" + e) or "").split())[:140] or common
        if not utr:
            missing.append(x["employee_name"])
            continue
        crefs = []
        camt = 0
        for c in x["claims"]:
            crefs.append({"doctype": "Expense Claim", "name": c["name"], "amount": c["amount"]})
            camt = camt + c["amount"]
        arefs = []
        aamt = 0
        for a in x["advances"]:
            arefs.append({"doctype": "Employee Advance", "name": a["name"], "amount": a["amount"]})
            aamt = aamt + a["amount"]
        made = []
        if crefs:
            made.append(pay_entry(e, PAY["payable"], crefs, camt, bank, date, utr, PAY["company"]))
        if arefs:
            made.append(pay_entry(e, PAY["advance"], arefs, aamt, bank, date, utr, PAY["company"]))
        done.append({"employee": e, "employee_name": x["employee_name"], "amount": camt + aamt, "entries": made, "utr": utr})
        u = frappe.db.get_value("Employee", e, "user_id")
        if u:
            notify(u, "Paid to your bank: " + frappe.utils.fmt_money(camt + aamt, currency="INR") + " (ref " + utr + ")", "Payment Entry", made[0])
    if missing and not done:
        frappe.throw("Give the UTR of the payment for: " + ", ".join(missing))
    frappe.response["message"] = {"paid": done, "missing_utr": missing}

else:
    frappe.throw("Unknown action.")
