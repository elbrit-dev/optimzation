# Field TA/DA claim types (12 Nov 2026): one Expense Claim Type per kind of
# line, no sub types (they confused people). The planner's trip claim uses:
#
#   Travel           the pre-priced TA (exists)            5209 TA DA
#   Daily Allowance  the pre-priced DA                     5209 TA DA
#   Food             a food bill (exists)                  5211 Food
#   Stay             a hotel / lodging bill                5229 Accommodation
#   Fuel             own-car fuel bill (GM approved)       5230 Fuel
#   Toll             own-car toll receipt (GM approved)    5228 Travel
#
# Creates the four new types with their account for the company; an existing
# type is left as it is. Same as UAT (made there through the connector).
#
# Paste into ERP > System Console (type Python), logged in as a System Manager.
# 1) DRY = True, "Commit" unticked: only prints.  2) DRY = False, tick Commit.

DRY = True
W = "WOULD " if DRY else ""
COMPANY = "Elbrit Lifesciences Private Limited"
TYPES = [
    ["Daily Allowance", "5209 - Employee Field Expenses TA DA Expenditure - ELPL", "Field DA per day as the Field Expense build priced it (outstation days 50 % without a bill)."],
    ["Stay", "5229 - Accomodation Expenditure - ELPL", "Hotel / lodging bill for an outstation day."],
    ["Fuel", "5230 - Fuel Expenditure - ELPL", "Fuel bill for an own-car trip the GM approved."],
    ["Toll", "5228 - Travel Expenditure - ELPL", "Toll receipt for an own-car trip the GM approved."],
]

for t in TYPES:
    name = t[0]
    account = t[1]
    if frappe.db.exists("Expense Claim Type", name):
        print("ok: " + name + " already exists")
        continue
    if not frappe.db.exists("Account", account):
        print("STOP: account " + account + " not found -- " + name + " not created")
        continue
    print(W + "create Expense Claim Type " + name + " -> " + account)
    if not DRY:
        frappe.get_doc({"doctype": "Expense Claim Type", "expense_type": name, "description": t[2],
                        "custom_sub_types": "", "custom_disabled": 0, "custom_allow_new_sub_types": 0,
                        "accounts": [{"company": COMPANY, "default_account": account}]}).insert(ignore_permissions=True)

print("done" if not DRY else "DRY RUN: nothing changed. Set DRY = False, tick Commit, run again.")
