# Server Script "Settlement Pay API" -- type API, method settlement_pay
# (17 Nov 2026). Settlement booking, step 3 of 3: PAYING what the CEO approved.
#
# A bill the CEO approved is a submitted Expense Claim on 2120 Employee
# Expense Payable (party = the Employee); a cash request is a submitted
# Employee Advance on "Employee Expense Advances" (Settlement API, step 2).
# Accounts pays them in BATCHES, whenever they choose (the user: no fixed
# day), ONE LINE PER EMPLOYEE; the CEO approves each batch before any money
# goes out (the user); paying makes ONE Payment Entry per employee for their
# bills (and one for their advances), so the claims / advances turn Paid.
#
#   GET  action=me                       { accounts, ceo, it } -- who may do what
#   GET  action=due                      what is owed, by employee (not in an open batch)
#   GET  action=batches                  the open ones and the last 60 days
#   POST action=create   employees=a,b   a batch of those employees -> Waiting (the CEO is told)
#   POST action=decide   name, decision (Approve | Reject), note   the CEO
#   POST action=paid     name, bank_account, date, utr [, utr_<EMPLOYEE>]
#                                        Accounts, after paying at the bank: the
#                                        Payment Entries; per-employee UTR wins
#   POST action=cancel   name            Accounts, while not paid
#
# Accounts = System Manager / Accounts Manager / Accounts User, or a user of
# the "Accounts" project -- as the Expense Running Guard. The IT department
# reads everything. Amounts are always worked out here, never taken from the
# app. safe_exec: no import, no .format(), no tuple unpacking, no
# underscore names, no frappe.parse_json; a def sees only its own arguments.

CEO_USER = "ceo@elbrit.org"
ACCOUNTS_ROLES = ["System Manager", "Accounts Manager", "Accounts User"]
ACCOUNTS_PROJECT = "PROJ-2026-2027-0012"       # "Accounts"
IT_DEPARTMENTS = ["IT - ELPL"]
PAY = {
    "company": "Elbrit Lifesciences Private Limited",
    "payable": "2120 - Employee Expense Payable - ELPL",
    "advance": "Employee Expense Advances - ELPL",
    "bank": "234851000001 - ICICI BANK OD/CC Account - ELPL",     # the default; Accounts may pick another
}


def owed(employee_list, cfg):
    # {employee: {claims: [...], advances: [...], total}} -- what is still to be paid
    flt = frappe.utils.flt
    out = {}
    cf = {"docstatus": 1, "payable_account": cfg["payable"], "status": ["in", ["Unpaid"]]}
    af = {"docstatus": 1, "advance_account": cfg["advance"], "status": "Unpaid"}
    if employee_list:
        cf["employee"] = ["in", employee_list]
        af["employee"] = ["in", employee_list]
    for c in frappe.get_all("Expense Claim", filters=cf, fields=["name", "employee", "employee_name", "posting_date", "grand_total", "total_amount_reimbursed"],
                            order_by="posting_date asc", limit_page_length=5000):
        due = flt(c.grand_total) - flt(c.total_amount_reimbursed)
        if due <= 0.005:
            continue
        e = out.get(c.employee) or {"employee": c.employee, "employee_name": c.employee_name, "claims": [], "advances": [], "total": 0}
        e["claims"].append({"name": c.name, "date": str(c.posting_date), "amount": due})
        e["total"] = e["total"] + due
        out[c.employee] = e
    for a in frappe.get_all("Employee Advance", filters=af, fields=["name", "employee", "employee_name", "posting_date", "purpose", "advance_amount", "paid_amount"],
                            order_by="posting_date asc", limit_page_length=2000):
        due = flt(a.advance_amount) - flt(a.paid_amount)
        if due <= 0.005:
            continue
        e = out.get(a.employee) or {"employee": a.employee, "employee_name": a.employee_name, "claims": [], "advances": [], "total": 0}
        e["advances"].append({"name": a.name, "date": str(a.posting_date), "purpose": a.purpose or "", "amount": due})
        e["total"] = e["total"] + due
        out[a.employee] = e
    return out


def names_in(text):
    out = []
    for x in str(text or "").split(","):
        if x.strip():
            out.append(x.strip())
    return out


def not_held(items, held):
    out = []
    for i in items:
        if not held.get(i["name"]):
            out.append(i)
    return out


def in_open_batches():
    # claim / advance names already in a Waiting or Approved batch
    held = {}
    for b in frappe.get_all("Settlement Payment", filters={"status": ["in", ["Waiting", "Approved"]]}, pluck="name", limit_page_length=500):
        for ln in frappe.get_doc("Settlement Payment", b).lines or []:
            if ln.paid:
                continue
            for x in str(ln.claims or "").split(","):
                if x.strip():
                    held[x.strip()] = b
            for x in str(ln.advances or "").split(","):
                if x.strip():
                    held[x.strip()] = b
    return held


def titles_of(claims):
    # claim -> its bill's title and photo (one bill per claim)
    out = {}
    if claims:
        for r in frappe.get_all("Expense Claim Detail", filters={"parent": ["in", claims], "parenttype": "Expense Claim"},
                                fields=["parent", "description", "expense_date", "custom_bill", "custom_settlement"], limit_page_length=10000):
            out[r.parent] = {"title": r.description or "", "bill_date": str(r.expense_date or ""), "bill": r.custom_bill or "", "request": r.custom_settlement or ""}
    return out


def shape_batch(d):
    lines = []
    for ln in d.lines or []:
        lines.append({"employee": ln.employee, "employee_name": ln.employee_name, "amount": ln.amount,
                      "claims": names_in(ln.claims),
                      "advances": names_in(ln.advances),
                      "bank_ac_no": ln.bank_ac_no or "", "ifsc": ln.ifsc or "", "bank_name": ln.bank_name or "",
                      "utr": ln.utr or "", "paid": ln.paid or 0, "payment_entries": ln.payment_entries or ""})
    return {"name": d.name, "status": d.status, "amount": d.amount, "count": d.count, "created_by": d.created_by,
            "creation": str(d.creation), "note": d.note or "", "decided_by": d.decided_by or "", "decided_on": str(d.decided_on or ""),
            "paid_on": str(d.paid_on or ""), "bank_account": d.bank_account or "", "lines": lines}


def notify(user, subject, name):
    try:
        frappe.get_doc({"doctype": "Notification Log", "for_user": user, "type": "Alert", "subject": subject,
                        "document_type": "Settlement Payment", "document_name": name}).insert(ignore_permissions=True)
    except Exception:
        pass


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
        "remarks": "Settlement payment " + utr,
        "references": [],
    })
    for r in refs:
        pe.append("references", {"reference_doctype": r["doctype"], "reference_name": r["name"], "allocated_amount": r["amount"]})
    pe.flags.ignore_permissions = True
    pe.insert(ignore_permissions=True)
    pe.submit()
    return pe.name


fd = frappe.form_dict
action = str(fd.get("action") or "me")
me = frappe.session.user
if not me or me == "Guest":
    frappe.throw("Please log in", frappe.PermissionError)
accounts = me == "Administrator" or bool(frappe.db.get_value("Has Role", {"parent": me, "parenttype": "User", "role": ["in", ACCOUNTS_ROLES]}, "role"))
if not accounts:
    accounts = bool(frappe.db.exists("Project User", {"parent": ACCOUNTS_PROJECT, "parenttype": "Project", "user": me}))
ceo = me == CEO_USER
it = bool(frappe.db.get_value("Employee", {"user_id": me, "status": "Active", "department": ["in", IT_DEPARTMENTS]}, "name"))
reader = accounts or ceo or it
ready = frappe.db.exists("DocType", "Settlement Payment") and frappe.db.exists("Account", PAY["payable"])

if action == "me":
    frappe.response["message"] = {"accounts": accounts, "ceo": ceo, "it": it, "ready": bool(ready)}

elif not reader:
    frappe.throw("Payments are for Accounts and the CEO.", frappe.PermissionError)

elif not ready:
    frappe.throw("Payments are not set up yet (settlement_pay_console.py).")

elif action == "due":
    held = in_open_batches()
    rows = []
    owe = owed(None, PAY)
    names = []
    for e in owe:
        for c in owe[e]["claims"]:
            names.append(c["name"])
    t = titles_of(names)
    for e in owe:
        x = owe[e]
        x["claims"] = not_held(x["claims"], held)
        x["advances"] = not_held(x["advances"], held)
        if not x["claims"] and not x["advances"]:
            continue
        for c in x["claims"]:
            info = t.get(c["name"]) or {}
            c["title"] = info.get("title", "")
            c["bill_date"] = info.get("bill_date", "")
            c["bill"] = info.get("bill", "")
            c["request"] = info.get("request", "")
        total = 0
        for c in x["claims"]:
            total = total + c["amount"]
        for a in x["advances"]:
            total = total + a["amount"]
        x["total"] = total
        bank = frappe.db.get_value("Employee", e, ["bank_ac_no", "ifsc_code", "bank_name"], as_dict=True) or {}
        x["has_bank"] = bool(bank.get("bank_ac_no") and bank.get("ifsc_code"))
        rows.append(x)
    banks = frappe.get_all("Account", filters={"company": PAY["company"], "account_type": "Bank", "is_group": 0, "disabled": 0}, pluck="name", limit_page_length=50)
    frappe.response["message"] = {"employees": rows, "banks": banks, "default_bank": PAY["bank"]}

elif action == "batches":
    since = frappe.utils.add_days(frappe.utils.today(), -60)
    out = []
    for b in frappe.get_all("Settlement Payment", filters=[["status", "in", ["Waiting", "Approved"]]], pluck="name", order_by="creation desc", limit_page_length=200):
        out.append(shape_batch(frappe.get_doc("Settlement Payment", b)))
    for b in frappe.get_all("Settlement Payment", filters=[["status", "in", ["Paid", "Rejected", "Cancelled"]], ["modified", ">=", since]],
                            pluck="name", order_by="modified desc", limit_page_length=200):
        out.append(shape_batch(frappe.get_doc("Settlement Payment", b)))
    frappe.response["message"] = {"batches": out}

elif action == "create":
    if not accounts:
        frappe.throw("Only Accounts makes a payment batch.", frappe.PermissionError)
    want = []
    for x in str(fd.get("employees") or "").split(","):
        if x.strip() and x.strip() not in want:
            want.append(x.strip())
    if not want:
        frappe.throw("Pick the employees to pay.")
    held = in_open_batches()
    owe = owed(want, PAY)
    lines = []
    total = 0
    for e in want:
        x = owe.get(e)
        if not x:
            continue
        cl = []
        for c in not_held(x["claims"], held):
            cl.append(c["name"])
        ad = []
        for a in not_held(x["advances"], held):
            ad.append(a["name"])
        amt = 0
        for c in x["claims"]:
            if c["name"] in cl:
                amt = amt + c["amount"]
        for a in x["advances"]:
            if a["name"] in ad:
                amt = amt + a["amount"]
        if amt <= 0:
            continue
        bank = frappe.db.get_value("Employee", e, ["bank_ac_no", "ifsc_code", "bank_name"], as_dict=True) or {}
        lines.append({"employee": e, "employee_name": x["employee_name"], "amount": amt, "claims": ",".join(cl), "advances": ",".join(ad),
                      "bank_ac_no": bank.get("bank_ac_no") or "", "ifsc": bank.get("ifsc_code") or "", "bank_name": bank.get("bank_name") or ""})
        total = total + amt
    if not lines:
        frappe.throw("Nothing to pay for them -- already paid, or in another batch.")
    d = frappe.get_doc({"doctype": "Settlement Payment", "status": "Waiting", "amount": total, "count": len(lines),
                        "created_by": me, "lines": lines})
    d.insert(ignore_permissions=True)
    notify(CEO_USER, "Payment batch to approve: " + str(len(lines)) + (" employee" if len(lines) == 1 else " employees") + " · " + frappe.utils.fmt_money(total, currency="INR"), d.name)
    frappe.response["message"] = {"batch": shape_batch(d)}

elif action == "decide":
    if not ceo:
        frappe.throw("Only the CEO approves a payment batch.", frappe.PermissionError)
    d = frappe.get_doc("Settlement Payment", str(fd.get("name") or ""))
    if d.status != "Waiting":
        frappe.throw("This batch is already " + str(d.status).lower() + ".")
    decision = str(fd.get("decision") or "")
    note = " ".join(str(fd.get("note") or "").split())[:1000]
    if decision == "Approve":
        d.status = "Approved"
    elif decision == "Reject":
        if not note:
            frappe.throw("Say why it is sent back -- Accounts sees it.")
        d.status = "Rejected"
    else:
        frappe.throw("Approve or Reject?")
    d.note = note
    d.decided_by = me
    d.decided_on = frappe.utils.now()
    d.save(ignore_permissions=True)
    notify(d.created_by, ("Payment batch approved: pay it now" if d.status == "Approved" else "Payment batch sent back: " + note) + " (" + frappe.utils.fmt_money(d.amount, currency="INR") + ")", d.name)
    frappe.response["message"] = {"batch": shape_batch(d)}

elif action == "paid":
    if not accounts:
        frappe.throw("Only Accounts marks a batch paid.", frappe.PermissionError)
    d = frappe.get_doc("Settlement Payment", str(fd.get("name") or ""))
    if d.status != "Approved":
        frappe.throw("Only a batch the CEO approved can be paid (this one is " + str(d.status).lower() + ").")
    bank = str(fd.get("bank_account") or PAY["bank"])
    if frappe.db.get_value("Account", bank, "account_type") != "Bank":
        frappe.throw(bank + " is not a bank account.")
    date = str(fd.get("date") or frappe.utils.today())[:10]
    common = " ".join(str(fd.get("utr") or "").split())[:140]
    done = 0
    for ln in d.lines or []:
        if ln.paid:
            done = done + 1
            continue
        utr = " ".join(str(fd.get("utr_" + str(ln.employee)) or "").split())[:140] or common
        if not utr:
            continue
        # what is STILL owed on the batch's claims / advances (paid elsewhere meanwhile -> left out)
        owe = owed([ln.employee], PAY).get(ln.employee) or {"claims": [], "advances": []}
        mine_c = names_in(ln.claims)
        mine_a = names_in(ln.advances)
        crefs = []
        camt = 0
        for c in owe["claims"]:
            if c["name"] in mine_c:
                crefs.append({"doctype": "Expense Claim", "name": c["name"], "amount": c["amount"]})
                camt = camt + c["amount"]
        arefs = []
        aamt = 0
        for a in owe["advances"]:
            if a["name"] in mine_a:
                arefs.append({"doctype": "Employee Advance", "name": a["name"], "amount": a["amount"]})
                aamt = aamt + a["amount"]
        made = []
        if crefs:
            made.append(pay_entry(ln.employee, PAY["payable"], crefs, camt, bank, date, utr, PAY["company"]))
        if arefs:
            made.append(pay_entry(ln.employee, PAY["advance"], arefs, aamt, bank, date, utr, PAY["company"]))
        ln.utr = utr
        ln.paid = 1
        ln.payment_entries = ", ".join(made)
        done = done + 1
        u = frappe.db.get_value("Employee", ln.employee, "user_id")
        if u and (camt + aamt) > 0:
            notify(u, "Paid to your bank: " + frappe.utils.fmt_money(camt + aamt, currency="INR") + " (ref " + utr + ")", d.name)
    if not done:
        frappe.throw("Give the bank reference (UTR) of the payment.")
    d.bank_account = bank
    if done == len(d.lines or []):
        d.status = "Paid"
        d.paid_on = date
    d.save(ignore_permissions=True)
    frappe.response["message"] = {"batch": shape_batch(d)}

elif action == "cancel":
    if not accounts:
        frappe.throw("Only Accounts cancels a batch.", frappe.PermissionError)
    d = frappe.get_doc("Settlement Payment", str(fd.get("name") or ""))
    if d.status in ["Paid", "Cancelled"]:
        frappe.throw("This batch is already " + str(d.status).lower() + ".")
    for ln in d.lines or []:
        if ln.paid:
            frappe.throw("Part of it is paid already -- it cannot be cancelled.")
    d.status = "Cancelled"
    d.save(ignore_permissions=True)
    frappe.response["message"] = {"batch": shape_batch(d)}

else:
    frappe.throw("Unknown action.")
