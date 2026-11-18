# Report "Settlement To Pay" -- Script Report (not standard), ref Expense Claim
# (18 Nov 2026). For Accounts, in the ERP (management: paying is Accounts'
# work in the ERP, not in the app): ONE ROW PER EMPLOYEE with what the CEO
# approved and is not paid yet --
#   bills   submitted Expense Claims on 2120 Employee Expense Payable, Unpaid
#           (booked by the Settlement API at the CEO's approval)
#   cash    submitted Employee Advances on "Employee Expense Advances", Unpaid
# -- with the employee's bank details for the bank upload (Export -> Excel).
#
# Paying one employee: Payment Entry -> Pay -> Party Type Employee -> the
# employee -> Paid To 2120 -> Get Outstanding Documents -> Reference No = the
# UTR -> Submit (the bills turn Paid). A cash advance: open it -> Payment.
#
# Report script (safe_exec, locals apart): no comprehensions over local
# names, no defs; the answer is `data = [columns, rows]`.

PAYABLE = "2120 - Employee Expense Payable - ELPL"
ADVANCE = "Employee Expense Advances - ELPL"
columns = [
    {"fieldname": "employee", "label": "Employee", "fieldtype": "Link", "options": "Employee", "width": 110},
    {"fieldname": "employee_name", "label": "Name", "fieldtype": "Data", "width": 190},
    {"fieldname": "hq", "label": "HQ", "fieldtype": "Data", "width": 110},
    {"fieldname": "bills", "label": "Bills", "fieldtype": "Int", "width": 70},
    {"fieldname": "bills_amount", "label": "Bills (Rs)", "fieldtype": "Currency", "width": 120},
    {"fieldname": "advances", "label": "Cash Advances", "fieldtype": "Int", "width": 110},
    {"fieldname": "advance_amount", "label": "Advances (Rs)", "fieldtype": "Currency", "width": 120},
    {"fieldname": "total", "label": "To Pay (Rs)", "fieldtype": "Currency", "width": 130},
    {"fieldname": "oldest", "label": "Waiting Since", "fieldtype": "Date", "width": 115},
    {"fieldname": "bank_name", "label": "Bank", "fieldtype": "Data", "width": 160},
    {"fieldname": "bank_ac_no", "label": "Account No", "fieldtype": "Data", "width": 150},
    {"fieldname": "ifsc", "label": "IFSC", "fieldtype": "Data", "width": 115},
    {"fieldname": "bank_ok", "label": "Bank Details", "fieldtype": "Data", "width": 110},
]
by = {}
for c in frappe.get_all("Expense Claim", filters={"docstatus": 1, "status": "Unpaid", "payable_account": PAYABLE},
                        fields=["employee", "employee_name", "posting_date", "grand_total", "total_amount_reimbursed"], limit_page_length=0):
    due = frappe.utils.flt(c.grand_total) - frappe.utils.flt(c.total_amount_reimbursed)
    if due <= 0.005:
        continue
    r = by.get(c.employee) or {"employee": c.employee, "employee_name": c.employee_name, "bills": 0, "bills_amount": 0,
                               "advances": 0, "advance_amount": 0, "total": 0, "oldest": None}
    r["bills"] = r["bills"] + 1
    r["bills_amount"] = r["bills_amount"] + due
    r["total"] = r["total"] + due
    if not r["oldest"] or str(c.posting_date) < str(r["oldest"]):
        r["oldest"] = c.posting_date
    by[c.employee] = r
for a in frappe.get_all("Employee Advance", filters={"docstatus": 1, "status": "Unpaid", "advance_account": ADVANCE},
                        fields=["employee", "employee_name", "posting_date", "advance_amount", "paid_amount"], limit_page_length=0):
    due = frappe.utils.flt(a.advance_amount) - frappe.utils.flt(a.paid_amount)
    if due <= 0.005:
        continue
    r = by.get(a.employee) or {"employee": a.employee, "employee_name": a.employee_name, "bills": 0, "bills_amount": 0,
                               "advances": 0, "advance_amount": 0, "total": 0, "oldest": None}
    r["advances"] = r["advances"] + 1
    r["advance_amount"] = r["advance_amount"] + due
    r["total"] = r["total"] + due
    if not r["oldest"] or str(a.posting_date) < str(r["oldest"]):
        r["oldest"] = a.posting_date
    by[a.employee] = r
rows = []
for e in by:
    r = by[e]
    emp = frappe.db.get_value("Employee", e, ["bank_name", "bank_ac_no", "ifsc_code", "custom_role_profile"], as_dict=True) or {}
    r["bank_name"] = emp.get("bank_name") or ""
    r["bank_ac_no"] = emp.get("bank_ac_no") or ""
    r["ifsc"] = emp.get("ifsc_code") or ""
    r["bank_ok"] = "OK" if (r["bank_ac_no"] and r["ifsc"]) else "MISSING"
    hq = ""
    if emp.get("custom_role_profile"):
        hq = str(frappe.db.get_value("Role Profile", emp.get("custom_role_profile"), "custom_territory") or "")
    if hq[:3].upper() == "HQ-":
        hq = hq[3:]
    r["hq"] = hq
    rows.append(r)
# the biggest amounts first
ordered = []
while rows:
    k = 0
    i = 1
    while i < len(rows):
        if rows[i]["total"] > rows[k]["total"]:
            k = i
        i = i + 1
    ordered.append(rows.pop(k))
data = [columns, ordered]
