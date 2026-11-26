# SYSTEM CONSOLE -- settlement by role + doctor bills booked by kind (prod, 26 Nov 2026).
# Paste into ERP > System Console (type Python), logged in as Administrator.
#   1) DRY = True, "Commit" unticked: only prints what it would do.
#   2) DRY = False, TICK "Commit", Execute.          Safe to re-run.
# Generated from the repo (scratchpad gen_roles_console.py).
# "Settlement API":
# 1. Own / For a doctor only for the field roles: BE, ABM, RBM, SRBM, DEPUTY RBM, SM, ZSM, GM.
#    Everyone else (back office, CEO): own bills only, any kind, and may request an advance.
# 2. The TA/DA block (hotel / food / fuel / travel not an own expense) only up to RBM
#    (BE, ABM, RBM, SRBM, DEPUTY RBM). SM, ZSM, GM and off the field: any kind.
# 3. Every bill -- own or for a doctor -- is booked by its kind (cake -> Food, pen -> Stationery),
#    else its words. The Settlement Settings doctor accounts are only a fallback; an empty one
#    no longer stops an approval ("No account is set for doctor activity bills").
# The script is PATCHED in place (prod may hold edits not in the repo); every patch spot must be
# found exactly once, or nothing is changed and the spot is listed under PROBLEMS. A backup is kept as a File.

DRY = True
W = "WOULD " if DRY else ""
NAME = "Settlement API"
MARK = "MY_LEVEL in BOOKING"
PATCHES = [['    "advance_levels": ["RBM", "SRBM", "DEPUTY RBM", "SM", "ZSM", "GM"],\n    # the bill kinds: own = a rep may claim it as their own expense; ta_da =\n', '    "advance_levels": ["RBM", "SRBM", "DEPUTY RBM", "SM", "ZSM", "GM"],\n    # 26 Nov 2026 (the user): the field roles (BE to SM, and GM -- he visits\n    # too) pick Own / For a doctor; everyone else (back office, CEO) just adds\n    # the bill -- any kind, no doctor, and may ask for cash up front. The TA/DA\n    # block (a hotel, food, fuel or travel bill is not an own expense) is only up to RBM.\n    "field_levels": ["BE", "ABM", "RBM", "SRBM", "DEPUTY RBM", "SM", "ZSM", "GM"],\n    "ta_da_levels": ["BE", "ABM", "RBM", "SRBM", "DEPUTY RBM"],\n    # the bill kinds: own = a rep may claim it as their own expense; ta_da =\n'], ['def book_account(se, cfg):\n    # the account a bill is booked to: by its settlement type (the doctor ones\n    # from the settings), an own bill by its kind\n    t = se.get("settlement_type") or "Own"\n    if t == "Doctor activity" or t == "Doctor service":\n        acct = cfg["activity_account"] if t == "Doctor activity" else cfg["service_account"]\n        if not acct:\n            frappe.throw("No account is set for " + t.lower() + " bills -- Accounts must set it in Settlement Settings first.")\n        return acct\n    k = kind_row(se.get("expense_kind"), cfg)\n', 'def book_account(se, cfg):\n    # 26 Nov 2026 (the user): EVERY bill -- own or for a doctor -- is booked by\n    # what the bill is (a cake to Food, a pen to Stationery): its kind, else the\n    # bill\'s words / what the reader saw. A doctor account in the settings is\n    # only the fallback for a doctor bill nothing else matches; never a stop.\n    k = kind_row(se.get("expense_kind"), cfg)\n'], ['        return k["account"]\n    return account_for(se.get("title"), cfg, read_kind(se.get("bill_meta")))\n\n', '        return k["account"]\n    acct = account_for(se.get("title"), cfg, read_kind(se.get("bill_meta")))\n    t = se.get("settlement_type") or "Own"\n    if acct == cfg["other"] and (t == "Doctor activity" or t == "Doctor service"):\n        dacct = cfg["activity_account"] if t == "Doctor activity" else cfg["service_account"]\n        if dacct:\n            return dacct\n    return acct\n\n'], ['    overview = True\n\n', '    overview = True\n# the caller\'s level by their seat (26 Nov 2026, the user): the field roles pick\n# Own / For a doctor; the TA/DA block is only up to RBM; everyone else adds any bill\nMY_LEVEL = ""\nif emp:\n    _sd = frappe.db.get_value("Employee", emp.name, ["custom_role_profile", "designation"], as_dict=True) or {}\n    MY_LEVEL = str(level_of(_sd.get("custom_role_profile"), _sd.get("designation"), me, CEO_USER, CEO_DESIGNATION, LEVELS)).upper()\nFIELD = MY_LEVEL in BOOKING["field_levels"]\nTA_DA_BLOCK = MY_LEVEL in BOOKING["ta_da_levels"]\n\n'], ['    dname = None\n    if doctor:\n', '    dname = None\n    if doctor and not FIELD:\n        frappe.throw("Doctor bills are for the field team.")\n    if doctor:\n'], ['        k = kind_row(kind, BOOKING)\n        if not k or not k["own"]:\n            frappe.throw("Pick what the expense was for." if not k else kind + " is paid in your monthly TA/DA claim -- add it there, or choose \\"Spent on a doctor\\" if it was for a doctor.")\n    files = [[own_file(bill, me), "bill"]]\n', '        k = kind_row(kind, BOOKING)\n        # any kind from SM up and off the field; a TA/DA kind is refused only up to RBM\n        if not k:\n            frappe.throw("Pick what the expense was for.")\n        if TA_DA_BLOCK and not k["own"]:\n            frappe.throw(kind + " is paid in your monthly TA/DA claim -- add it there, or choose \\"Spent on a doctor\\" if it was for a doctor.")\n    files = [[own_file(bill, me), "bill"]]\n'], ['        # a ticket): paid in the monthly TA/DA claim, never here\n        if stype == "Own":\n            td = ta_da_kind(read_kind(r.bill_meta), "", BOOKING)\n', '        # a ticket): paid in the monthly TA/DA claim, never here\n        if stype == "Own" and TA_DA_BLOCK:\n            td = ta_da_kind(read_kind(r.bill_meta), "", BOOKING)\n'], ['                  me, CEO_USER, CEO_DESIGNATION, LEVELS)\n    if str(lv).upper() not in BOOKING["advance_levels"]:\n        frappe.throw("Advances are for " + ", ".join(BOOKING["advance_levels"]) + " -- add your bills and you are paid back.", frappe.PermissionError)\n', '                  me, CEO_USER, CEO_DESIGNATION, LEVELS)\n    # off the field (back office, CEO) advances are open too (26 Nov 2026, the user)\n    if str(lv).upper() not in BOOKING["advance_levels"] and FIELD:\n        frappe.throw("Advances are for " + ", ".join(BOOKING["advance_levels"]) + " -- add your bills and you are paid back.", frappe.PermissionError)\n'], ['    tada = []\n    for k in BOOKING["kinds"]:\n', '    tada = []\n    every = []\n    for k in BOOKING["kinds"]:\n'], ['    for k in BOOKING["kinds"]:\n        if k["own"]:\n', '    for k in BOOKING["kinds"]:\n        every.append(k["kind"])\n        if k["own"]:\n'], ['                                  "service_needs_record": bool(BOOKING["service_needs_record"]), "max_amount": BILL_MAX_AMOUNT,\n                                  "max_age_days": BILL_MAX_AGE_DAYS, "bills_from": BILLS_FROM or None, "bills_to": BILLS_TO or None, "window_text": WINDOW_TEXT or None, "can_request_cash": str(lv).upper() in BOOKING["advance_levels"],\n                                  "level": lv, "doctor_ready": {"activity": bool(BOOKING["activity_account"]), "service": bool(BOOKING["service_account"])}}\n\n', '                                  "service_needs_record": bool(BOOKING["service_needs_record"]), "max_amount": BILL_MAX_AMOUNT,\n                                  "max_age_days": BILL_MAX_AGE_DAYS, "bills_from": BILLS_FROM or None, "bills_to": BILLS_TO or None, "window_text": WINDOW_TEXT or None, "can_request_cash": bool(emp) and (str(lv).upper() in BOOKING["advance_levels"] or not FIELD),\n                                  "level": lv, "field": FIELD, "ta_da_block": TA_DA_BLOCK, "all_kinds": every, "doctor_ready": {"activity": bool(BOOKING["activity_account"]), "service": bool(BOOKING["service_account"])}}\n\n']]

bad = []
stamp = str(frappe.utils.now())[:16].replace("-", "").replace(":", "").replace(" ", "-")
cur = frappe.db.get_value("Server Script", NAME, "script")
if cur is None:
    bad.append("no Server Script " + NAME)
elif MARK in cur:
    print("already in: " + NAME)
else:
    new = cur.replace(chr(13), "")
    for p in PATCHES:
        if new.count(p[0]) == 0 and new.count(p[1]) == 1:
            continue          # this one is in already (e.g. the book-by-kind console ran first)
        n = new.count(p[0])
        if n != 1:
            bad.append("a patch spot was found " + str(n) + " times (needs 1): " + p[0].strip().split(chr(10))[0][:90])
        else:
            new = new.replace(p[0], p[1])
    if not bad:
        print(W + "patch Server Script " + NAME + " (" + str(len(cur)) + " -> " + str(len(new)) + " characters)")
        if not DRY:
            frappe.get_doc({"doctype": "File", "file_name": "settlement-api-before-roles-" + stamp + ".py", "content": cur,
                            "is_private": 1, "attached_to_doctype": "Server Script", "attached_to_name": NAME}).insert(ignore_permissions=True)
            sc = frappe.get_doc("Server Script", NAME)
            sc.script = new
            sc.disabled = 0
            sc.save(ignore_permissions=True)
print("")
if bad:
    print("PROBLEMS -- nothing changed:")
    for x in bad:
        print("   " + x)
print("dry run -- nothing changed." if DRY else "done. (saved only if Commit was ticked)")
