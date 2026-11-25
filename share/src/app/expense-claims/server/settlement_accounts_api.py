# Server Script "Settlement Accounts API" -- type API, method settlement_accounts
# (18 Nov 2026). Accounts pay employees for settlement bills IN ONE PLACE in
# the ERP: the "Settlement Payments" dashboard (Web Page /settlement-payments,
# listed on the Dashboards workspace next to Field Expenses) -- management:
# paying is Accounts' work in the ERP, not in the app, and it must be clear
# and in one place.
#
# What is owed: bills the CEO approved -- each a Settlement Expense booked as
# ONE Journal Entry (23 Nov 2026; was an Expense Claim) whose credit on 2120
# Employee Expense Payable (party = the Employee) is not paid yet -- and
# approved cash requests -- submitted Employee Advances on "Employee Expense
# Advances", Unpaid. Both are booked by the Settlement API. Nothing here reads
# Expense Claim any more (that holds only the field TA/DA).
#
#   GET  action=due                         one row per employee: bills, advances, total, bank details;
#                                           the bank accounts; payments of the last 30 days
#   POST action=pay   employees=a,b, bank_account, date, utr [, utr_<EMPLOYEE>]
#                                           after paying at the bank: per employee ONE Bank Entry
#                                           (Journal Entry) for the bills -- Dr 2120 against each bill's
#                                           Journal Entry, Cr the bank (ERPNext will not take a Payment
#                                           Entry against a Journal Entry owed to an employee; tested on
#                                           UAT 23 Nov 2026) -- and one Payment Entry for the advances;
#                                           the bills / advances turn Paid; the employee is told
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
    "cost_center": "Main - ELPL",
}
# Settlement Settings (23 Nov 2026) override these when filled in
if frappe.db.exists("DocType", "Settlement Settings"):
    st = frappe.get_doc("Settlement Settings")
    for p in [["company", "company"], ["payable", "payable_account"], ["advance", "advance_account"], ["bank", "default_bank_account"],
              ["cost_center", "cost_center"]]:
        if st.get(p[1]):
            PAY[p[0]] = st.get(p[1])


def left_on(je, employee, payable):
    # what of a bill's Journal Entry is still owed to the employee (Payment Ledger)
    r = frappe.db.sql("""select sum(amount_in_account_currency) from `tabPayment Ledger Entry`
        where against_voucher_type = 'Journal Entry' and against_voucher_no = %s and party_type = 'Employee'
          and party = %s and account = %s and delinked = 0""", (je, employee, payable))
    # 2120 is a Payable: above 0 is still owed, below 0 is overpaid (owes nothing;
    # 23 Nov 2026: was abs(), which made an overpaid bill read as owed again)
    s = frappe.utils.flt(r[0][0] if r and r[0] else 0, 2)
    return s if s > 0 else 0


def owed(employee_list, cfg, settled=None):
    # {employee: {employee, employee_name, claims: [...], advances: [...], total}}
    # settled: a list that gets the Verified bills already paid some other way
    # "claims" are the bills (Settlement Expense), each against its Journal Entry
    flt = frappe.utils.flt
    out = {}
    sf = {"status": "Verified", "journal_entry": ["is", "set"], "payable": [">", 0]}
    af = {"docstatus": 1, "advance_account": cfg["advance"], "status": "Unpaid"}
    if employee_list:
        sf["employee"] = ["in", employee_list]
        af["employee"] = ["in", employee_list]
    for c in frappe.get_all("Settlement Expense", filters=sf, fields=["name", "employee", "employee_name", "bill_date", "title", "bill",
                                                                   "expense_account", "journal_entry", "modified"],
                            order_by="bill_date asc", limit_page_length=0):
        je = frappe.db.get_value("Journal Entry", c.journal_entry, ["docstatus", "posting_date"], as_dict=True)
        if not je or je.docstatus != 1:
            continue        # its booking was cancelled: nothing to pay on it
        due = left_on(c.journal_entry, c.employee, cfg["payable"])
        if due <= 0.005:
            # settled some other way (Payment Reconciliation, a hand-made entry):
            # the payment run marks it Paid (a GET here saves nothing)
            if settled is not None:
                settled.append(c.name)
            continue
        e = out.get(c.employee) or {"employee": c.employee, "employee_name": c.employee_name, "claims": [], "advances": [], "total": 0}
        e["claims"].append({"name": c.name, "entry": c.journal_entry, "date": str(je.posting_date),
                            "amount": due, "title": c.title or "Bill", "bill_date": str(c.bill_date or ""), "bill": c.bill or "",
                            "account": c.expense_account or ""})
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


def pay_bills(employee, refs, amount, bank, date, utr, company, payable):
    # one submitted Bank Entry: Dr 2120 against each bill's Journal Entry, Cr the bank
    rows = []
    for r in refs:
        rows.append({"account": payable, "party_type": "Employee", "party": employee, "debit_in_account_currency": r["amount"],
                     "reference_type": "Journal Entry", "reference_name": r["name"], "cost_center": PAY["cost_center"]})
    rows.append({"account": bank, "credit_in_account_currency": amount, "cost_center": PAY["cost_center"]})
    je = frappe.get_doc({"doctype": "Journal Entry", "voucher_type": "Bank Entry", "company": company, "posting_date": date,
                         "cheque_no": utr, "cheque_date": date, "user_remark": "Settlement payment, UTR " + utr, "accounts": rows})
    je.insert()
    je.submit()
    return je.name


def bill_payments(payable, since):
    # the bills' Bank Entries since a date: [{name, posting_date, party, party_name, paid_amount, reference_no, paid_to}]
    out = []
    for j in frappe.db.sql("""select je.name, je.posting_date, jea.party, sum(jea.debit_in_account_currency) as paid_amount, je.cheque_no as reference_no
        from `tabJournal Entry` je join `tabJournal Entry Account` jea on jea.parent = je.name
        where je.docstatus = 1 and je.voucher_type = 'Bank Entry' and jea.account = %s and jea.party_type = 'Employee'
          and jea.debit_in_account_currency > 0 and jea.reference_type = 'Journal Entry' and je.posting_date >= %s
        group by je.name, jea.party order by je.posting_date desc limit 200""", (payable, since), as_dict=True):
        out.append({"name": j.name, "posting_date": j.posting_date, "party": j.party,
                    "party_name": frappe.db.get_value("Employee", j.party, "employee_name") or j.party,
                    "paid_amount": j.paid_amount, "reference_no": j.reference_no or "", "paid_to": payable})
    return out


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
    rows = []
    for e in owe:
        x = owe[e]
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
    # the bills are paid by Bank Entries (23 Nov 2026)
    for j in bill_payments(PAY["payable"], since):
        paid.append(j)
    paid = sorted(paid, key=lambda x: str(x.get("posting_date")), reverse=True)
    month_start = frappe.utils.get_first_day(frappe.utils.today())
    paid_month = 0
    paid_month_count = 0
    for p in frappe.get_all("Payment Entry", filters=[["docstatus", "=", 1], ["party_type", "=", "Employee"], ["paid_to", "in", [PAY["payable"], PAY["advance"]]],
                                                      ["posting_date", ">=", month_start]], fields=["paid_amount"], limit_page_length=0):
        paid_month = paid_month + frappe.utils.flt(p.paid_amount)
        paid_month_count = paid_month_count + 1
    for j in bill_payments(PAY["payable"], month_start):
        paid_month = paid_month + frappe.utils.flt(j["paid_amount"])
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
    ba = frappe.db.get_value("Account", bank, ["account_type", "company", "disabled", "is_group"], as_dict=True)
    if not ba or ba.account_type != "Bank" or ba.company != PAY["company"] or ba.disabled or ba.is_group:
        frappe.throw(bank + " is not a bank account of " + PAY["company"] + " that can be paid from.")
    date = str(fd.get("date") or frappe.utils.today())[:10]
    if not (len(date) == 10 and date[4] == "-" and date[7] == "-"):
        frappe.throw("Give the date the money left the bank.")
    if date > frappe.utils.today():
        frappe.throw("The payment date cannot be in the future.")
    common = " ".join(str(fd.get("utr") or "").split())[:140]
    # one payment run per employee at a time: their rows are locked until this
    # run is saved, so a second tab / user waits and then sees nothing owed
    for e in want:
        frappe.db.get_value("Employee", e, "name", for_update=True)
    settled = []
    owe = owed(want, PAY, settled)
    for n in settled:
        frappe.db.set_value("Settlement Expense", n, "status", "Paid")
    for e in want:
        for c in (owe.get(e) or {}).get("claims") or []:
            if date < c["date"]:
                frappe.throw("The payment date is before " + c["name"] + " was approved (" + c["date"] + ") -- check the date.")
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
            crefs.append({"name": c["entry"], "amount": c["amount"]})
            camt = camt + c["amount"]
        arefs = []
        aamt = 0
        for a in x["advances"]:
            arefs.append({"doctype": "Employee Advance", "name": a["name"], "amount": a["amount"]})
            aamt = aamt + a["amount"]
        made = []
        if crefs:
            made.append(pay_bills(e, crefs, camt, bank, date, utr, PAY["company"], PAY["payable"]))
        if arefs:
            made.append(pay_entry(e, PAY["advance"], arefs, aamt, bank, date, utr, PAY["company"]))
        # the bills paid in full are Paid (the app shows it to the employee)
        for c in x["claims"]:
            if left_on(c["entry"], e, PAY["payable"]) <= 0.005:
                frappe.db.set_value("Settlement Expense", c["name"], "status", "Paid")
        done.append({"employee": e, "employee_name": x["employee_name"], "amount": camt + aamt, "entries": made, "utr": utr})
        u = frappe.db.get_value("Employee", e, "user_id")
        if u:
            notify(u, "Paid to your bank: " + frappe.utils.fmt_money(camt + aamt, currency="INR") + " (ref " + utr + ")",
                   "Journal Entry" if crefs else "Payment Entry", made[0])
    if missing and not done:
        frappe.throw("Give the UTR of the payment for: " + ", ".join(missing))
    frappe.response["message"] = {"paid": done, "missing_utr": missing}

else:
    frappe.throw("Unknown action.")
