# Expense claims: new claim types with sub types (21 Oct 2026).
#   Food
#   Travel         -> Fuel, Toll, Ticket, Cab
#   Miscellaneous  -> Rent, Activity, Meeting
#   Advance
# Calls, Medical and Others go: deleted if no claim uses them, otherwise
# marked Disabled (kept for old claims, never offered again).
#
# Sub types are data, not code: each Expense Claim Type gets a "Sub types"
# box (one per line) and the app reads it, so a new type or sub type is added
# in the ERP and appears in the form. Each claim row stores the chosen one in
# Expense Claim Detail.custom_sub_type. Sub types book to their main type's
# account.
#
# Advance is an expense claim type like the rest, just named Advance. It
# books to ADVANCE_ACCOUNT ("Employee Advances - ELPL" is a group of
# per-person accounts, so it cannot be a default) -- change it before
# running if accounts want another ledger.
#
# Paste into ERP > System Console (type Python), logged in as a System Manager.
# 1) Run with DRY = True and "Commit" UNticked: it only prints what it would do.
# 2) Set DRY = False, tick "Commit", run again.
# Safe to re-run: anything already in place is skipped.

DRY = True

COMPANY = "Elbrit Lifesciences Private Limited"
TYPES = [
    ["Food", ""],
    ["Travel", "Fuel\nToll\nTicket\nCab"],
    ["Miscellaneous", "Rent\nActivity\nMeeting"],
    ["Advance", ""],
]
ADVANCE_ACCOUNT = "5309 - Other Employee Expenditure - ELPL"
NEW_ACCOUNT_FROM = {"Miscellaneous": "Others"}   # copy the account of an old type
NEW_ACCOUNT = {"Advance": ADVANCE_ACCOUNT}       # or give one directly
RETIRE = ["Calls", "Medical", "Others"]

W = "WOULD " if DRY else ""

# 1. Custom fields
FIELDS = [
    {"dt": "Expense Claim Type", "fieldname": "custom_sub_types", "label": "Sub types",
     "fieldtype": "Small Text", "insert_after": "description",
     "description": "One per line. The app offers these under this type; they book to this type's account."},
    {"dt": "Expense Claim Type", "fieldname": "custom_disabled", "label": "Disabled",
     "fieldtype": "Check", "insert_after": "custom_sub_types", "default": "0",
     "description": "Kept for old claims; not offered for new ones."},
    {"dt": "Expense Claim Detail", "fieldname": "custom_sub_type", "label": "Sub type",
     "fieldtype": "Data", "insert_after": "expense_type", "in_list_view": 1, "columns": 1},
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

# 2. Types (create or set sub types)
for t in TYPES:
    name = t[0]
    subs = t[1]
    if frappe.db.exists("Expense Claim Type", name):
        print(W + "set sub types on " + name + ": " + (subs.replace("\n", ", ") or "(none)"))
        if not DRY:
            frappe.db.set_value("Expense Claim Type", name, {"custom_sub_types": subs, "custom_disabled": 0})
    else:
        src = NEW_ACCOUNT_FROM.get(name)
        acct = None
        if src:
            acct = frappe.db.get_value("Expense Claim Account",
                {"parent": src, "parenttype": "Expense Claim Type", "company": COMPANY}, "default_account")
        if not acct and NEW_ACCOUNT.get(name) and frappe.db.exists("Account", NEW_ACCOUNT.get(name)):
            acct = NEW_ACCOUNT.get(name)
        if not acct:
            print("STOP: no account to give " + name + " -- set NEW_ACCOUNT_FROM or add it by hand")
            continue
        print(W + "create type " + name + " (account " + acct + "), sub types: " + subs.replace("\n", ", "))
        if not DRY:
            frappe.get_doc({
                "doctype": "Expense Claim Type",
                "expense_type": name,
                "description": name,
                "custom_sub_types": subs,
                "accounts": [{"company": COMPANY, "default_account": acct}],
            }).insert(ignore_permissions=True)

# 3. Retire old types (after Miscellaneous has copied Others' account)
for name in RETIRE:
    if not frappe.db.exists("Expense Claim Type", name):
        print("ok: " + name + " already gone")
        continue
    used = frappe.db.count("Expense Claim Detail", {"expense_type": name})
    if used:
        print(W + "disable " + name + " (" + str(used) + " claim rows use it)")
        if not DRY:
            frappe.db.set_value("Expense Claim Type", name, "custom_disabled", 1)
    else:
        print(W + "delete " + name + " (unused)")
        if not DRY:
            frappe.delete_doc("Expense Claim Type", name, ignore_permissions=True)

print("done" if not DRY else "dry run -- nothing changed")
