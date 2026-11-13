# Ring Nav: the Expense approval tile for EVERY reporting officer -- on
# app-uat only (13 Nov 2026).
#
# app-uat asks this script with expense_all=1 (NEXT_PUBLIC_EXPENSE_APPROVALS_
# FOR_ALL=1 in apphosting.yaml); live never does (apphosting.prod.yaml sets it
# to 0). Asked that way, anyone with claims waiting on them, or anyone with a
# team under them, gets the Expense approval tile. The Verify tile stays with
# the IT department. Live keeps IT / GM / CEO only.
#
# Paste into ERP > System Console (Execute). It edits the live Server Script
# "Elbrit Ring Nav" IN PLACE -- two small changes in its EXPENSE section -- so
# everything else on it (the due-day extension, the Leave tile) stays as it is.
# Safe to run twice. DRY_RUN = 1 only reports; set DRY_RUN = 0 to save.

DRY_RUN = 1

doc = frappe.get_doc("Server Script", "Elbrit Ring Nav")
src = doc.script.replace("\r\n", "\n")

if "expense_all" in src:
    print("ok: the app-uat expense tile switch is already there -- nothing to do")
else:
    swaps = [
        [
            'expense_head = False\n'
            'for r in EXPENSE_APPROVER_ROLES:\n'
            '    if r in service_roles:\n'
            '        expense_head = True\n',
            'expense_head = False\n'
            'for r in EXPENSE_APPROVER_ROLES:\n'
            '    if r in service_roles:\n'
            '        expense_head = True\n'
            '# app-uat (13 Nov 2026): the app asks with expense_all=1 -- every reporting\n'
            '# officer gets the Expense approval tile there. Live never sends it.\n'
            'expense_all = str(frappe.form_dict.get("expense_all") or "") == "1"\n',
            "the app-uat switch",
        ],
        [
            '    if not (EXPENSE_TILES_FOR_ALL or expense_team or expense_head):\n        return\n',
            '    if not (EXPENSE_TILES_FOR_ALL or expense_team or expense_head or expense_all):\n        return\n',
            "expense tiles gate",
        ],
    ]
    bad = 0
    for sw in swaps:
        n = src.count(sw[0])
        if n != 1:
            bad = 1
            print("STOP: " + sw[2] + " -- found " + str(n) + " times (expected 1); nothing saved")
    if not bad:
        for sw in swaps:
            src = src.replace(sw[0], sw[1])
        if DRY_RUN:
            print("dry run ok: both changes apply -- set DRY_RUN = 0 and run again to save")
        else:
            doc.script = src
            doc.save()
            frappe.db.commit()
            print("saved: on app-uat every reporting officer now gets the Expense approval tile")
