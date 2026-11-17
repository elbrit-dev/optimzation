# Settlement booking, step 1 of 3 (17 Nov 2026): the accounts the standard
# ERPNext flow needs -- a bill the CEO approves is booked as an Expense Claim
# (Dr the expense, Cr ONE payable account with the Employee as party), a cash
# request as an Employee Advance (Dr ONE advance account, party Employee).
# Replaces Accounts' hand-made JVs against ~179 "Advance to <Name>" accounts.
#
#   1. Account "2120 - Employee Expense Payable - ELPL"  (Payable, under
#      2100 Sundry Creditors) -- what the company owes employees for bills
#   2. Account "Employee Expense Advances - ELPL"        (Receivable, under
#      Employee Advances) -- cash given up front for expenses
#   3. Company: Default Expense Claim Payable Account = 1 (it had none; the 6
#      old claims fell back to Creditors for Business). The company's employee
#      advance default ("Salary Advances") is NOT touched -- HR may use it; the
#      settlement script names account 2 itself.
# Nothing else changes: no entries are posted, the old accounts stay as they
# are (moving their balances is a later, separate step with Accounts).
# Cost center: Main (the user, 17 Nov 2026).
#
# Paste into ERP > System Console (type Python), logged in as a System Manager.
# 1) DRY = True, "Commit" unticked: only prints.  2) DRY = False, tick Commit.
# Safe to re-run.

DRY = True
W = "WOULD " if DRY else ""
COMPANY = "Elbrit Lifesciences Private Limited"
ABBR = "ELPL"
ACCOUNTS = [
    {"account_name": "Employee Expense Payable", "account_number": "2120", "parent_account": "2100 - Sundry Creditors - ELPL",
     "account_type": "Payable", "root_type": "Liability"},
    {"account_name": "Employee Expense Advances", "account_number": "", "parent_account": "Employee Advances - ELPL",
     "account_type": "Receivable", "root_type": "Asset"},
]


def full_name(a):
    return ((a["account_number"] + " - ") if a["account_number"] else "") + a["account_name"] + " - " + ABBR


ok = True
for a in ACCOUNTS:
    if not frappe.db.exists("Account", a["parent_account"]):
        print("STOP: parent account " + a["parent_account"] + " not found")
        ok = False
    if a["account_number"]:
        taken = frappe.db.get_value("Account", {"account_number": a["account_number"], "company": COMPANY}, "name")
        if taken and taken != full_name(a):
            print("STOP: account number " + a["account_number"] + " is already " + taken)
            ok = False

if ok:
    for a in ACCOUNTS:
        name = full_name(a)
        have = frappe.db.get_value("Account", name, ["account_type", "parent_account", "is_group", "disabled"], as_dict=True)
        if have:
            if have.account_type != a["account_type"] or have.is_group or have.disabled:
                print("STOP: " + name + " exists but is not a usable " + a["account_type"] + " ledger -- fix it by hand")
            else:
                print("ok: " + name + " already there")
            continue
        print(W + "create account " + name + " (" + a["account_type"] + ", under " + a["parent_account"] + ")")
        if not DRY:
            frappe.get_doc({
                "doctype": "Account",
                "company": COMPANY,
                "account_name": a["account_name"],
                "account_number": a["account_number"] or None,
                "parent_account": a["parent_account"],
                "account_type": a["account_type"],
                "root_type": a["root_type"],
                "account_currency": "INR",
                "is_group": 0,
            }).insert(ignore_permissions=True)

    payable = full_name(ACCOUNTS[0])
    cur = frappe.db.get_value("Company", COMPANY, "default_expense_claim_payable_account")
    if cur == payable:
        print("ok: the company's Expense Claim payable account is already " + payable)
    else:
        print(W + "set the company's Default Expense Claim Payable Account: " + str(cur or "(none)") + " -> " + payable)
        if not DRY:
            frappe.db.set_value("Company", COMPANY, "default_expense_claim_payable_account", payable)

    if not DRY:
        print("done -- step 1 of 3. Nothing is booked yet; the app keeps working as before.")
