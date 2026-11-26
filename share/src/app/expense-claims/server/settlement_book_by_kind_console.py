# SYSTEM CONSOLE -- doctor bills booked by kind (prod, 26 Nov 2026). ONLY this change.
# Paste into ERP > System Console (type Python), logged in as Administrator.
#   1) DRY = True, "Commit" unticked: only prints what it would do.
#   2) DRY = False, TICK "Commit", Execute.          Safe to re-run.
# Generated from the repo (scratchpad). "Settlement API" book_account():
# every bill -- own or for a doctor -- is booked by its kind (cake -> Food, pen -> Stationery), else
# its words. The Settlement Settings doctor accounts are only a fallback; an empty one no longer
# stops an approval ("No account is set for doctor activity bills").
# The roles change (settlement_roles_console.py) also carries this; run either, or both -- each
# notices what is already in. Patched in place; a backup is kept as a File.

DRY = True
W = "WOULD " if DRY else ""
NAME = "Settlement API"
MARK = "only the fallback for a doctor bill nothing else matches"
PATCHES = [['def book_account(se, cfg):\n    # the account a bill is booked to: by its settlement type (the doctor ones\n    # from the settings), an own bill by its kind\n    t = se.get("settlement_type") or "Own"\n    if t == "Doctor activity" or t == "Doctor service":\n        acct = cfg["activity_account"] if t == "Doctor activity" else cfg["service_account"]\n        if not acct:\n            frappe.throw("No account is set for " + t.lower() + " bills -- Accounts must set it in Settlement Settings first.")\n        return acct\n    k = kind_row(se.get("expense_kind"), cfg)\n    if k and k["account"]:\n        return k["account"]\n    return account_for(se.get("title"), cfg, read_kind(se.get("bill_meta")))\n', 'def book_account(se, cfg):\n    # 26 Nov 2026 (the user): EVERY bill -- own or for a doctor -- is booked by\n    # what the bill is (a cake to Food, a pen to Stationery): its kind, else the\n    # bill\'s words / what the reader saw. A doctor account in the settings is\n    # only the fallback for a doctor bill nothing else matches; never a stop.\n    k = kind_row(se.get("expense_kind"), cfg)\n    if k and k["account"]:\n        return k["account"]\n    acct = account_for(se.get("title"), cfg, read_kind(se.get("bill_meta")))\n    t = se.get("settlement_type") or "Own"\n    if acct == cfg["other"] and (t == "Doctor activity" or t == "Doctor service"):\n        dacct = cfg["activity_account"] if t == "Doctor activity" else cfg["service_account"]\n        if dacct:\n            return dacct\n    return acct\n']]

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
        n = new.count(p[0])
        if n != 1:
            bad.append("a patch spot was found " + str(n) + " times (needs 1): " + p[0].strip().split(chr(10))[0][:90])
        else:
            new = new.replace(p[0], p[1])
    if not bad:
        print(W + "patch Server Script " + NAME + " (" + str(len(cur)) + " -> " + str(len(new)) + " characters)")
        if not DRY:
            frappe.get_doc({"doctype": "File", "file_name": "settlement-api-before-book-by-kind-" + stamp + ".py", "content": cur,
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
