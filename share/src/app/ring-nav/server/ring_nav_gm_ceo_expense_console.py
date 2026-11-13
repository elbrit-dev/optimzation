# Ring Nav: the Expense approval tile for the GM and the CEO (13 Nov 2026).
#
# Paste into ERP > System Console (Execute). It edits the live Server Script
# "Elbrit Ring Nav" IN PLACE -- three small replacements in its EXPENSE
# section -- so everything else on the live script (the Leave tile, due days)
# stays as it is. Safe to run twice: a script that already has the change is
# left alone.
#
# DRY_RUN = 1 only reports; set DRY_RUN = 0 to save.

DRY_RUN = 1

doc = frappe.get_doc("Server Script", "Elbrit Ring Nav")
src = doc.script.replace("\r\n", "\n")

if "EXPENSE_APPROVER_ROLES" in src:
    print("ok: the GM / CEO expense tile is already there -- nothing to do")
else:
    swaps = [
        [
            'expense_team = me == "Administrator" or bool(frappe.db.get_value(\n'
            '    "Employee", {"user_id": me, "status": "Active", "department": ["in", EXPENSE_DEPARTMENTS]}, "name"))\n',
            'expense_team = me == "Administrator" or bool(frappe.db.get_value(\n'
            '    "Employee", {"user_id": me, "status": "Active", "department": ["in", EXPENSE_DEPARTMENTS]}, "name"))\n'
            '# 13 Nov 2026: the GM and the CEO (by role, as the SERVICE tiles) get the\n'
            '# Expense approval tile too, every day -- not the Verify one.\n'
            'EXPENSE_APPROVER_ROLES = ["GM", "CEO"]\n'
            'expense_head = False\n'
            'for r in EXPENSE_APPROVER_ROLES:\n'
            '    if r in service_roles:\n'
            '        expense_head = True\n',
            "who gets the expense tiles",
        ],
        [
            '    if not (EXPENSE_TILES_FOR_ALL or expense_team):\n        return\n',
            '    if not (EXPENSE_TILES_FOR_ALL or expense_team or expense_head):\n        return\n',
            "expense tiles gate",
        ],
        [
            '    if waiting or manager or expense_team:\n',
            '    if waiting or manager or expense_team or expense_head:\n',
            "Expense approval tile",
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
        if "service_roles = []" not in src or src.index("service_roles = []") > src.index("EXPENSE_APPROVER_ROLES"):
            print("STOP: service_roles is not set before the EXPENSE section; nothing saved")
        elif DRY_RUN:
            print("dry run ok: all 3 changes apply -- set DRY_RUN = 0 and run again to save")
        else:
            doc.script = src
            doc.save()
            frappe.db.commit()
            print("saved: GM and CEO now get the Expense approval tile")
