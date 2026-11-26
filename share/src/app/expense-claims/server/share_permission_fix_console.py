# SYSTEM CONSOLE -- "You need to have Share permission" on approvals: shares STAY (prod, 26 Nov 2026).
# Paste into ERP > System Console (type Python), logged in as Administrator.
#   1) DRY = True, "Commit" unticked: only prints what it would do.
#   2) DRY = False, TICK "Commit", Execute.          Safe to re-run.
# Generated from the repo (scratchpad gen_share_fix_console.py).
# Removing a DocShare needs the "Share" right -- approvers and reps have none -- so:
# 1. "Settlement API": unshare() removes nothing. Sending a bill back (approver), sending it again and
#    taking it back (rep) no longer fail; the shares just stay.
# 2. "Expense Claim Approver": when a claim's approver changes, HRMS removed the old approver's share as
#    the user saving (and failed). Now it is told the approver did not change, so the share stays.
# Each script is PATCHED in place (prod may hold edits not in the repo); every patch spot must be found
# exactly once, or that script is left alone and listed under PROBLEMS. A backup is kept as a File.

DRY = True
W = "WOULD " if DRY else ""
JOBS = [['Settlement API', 'shares STAY', [['def unshare(se_name, keep):\n    # the approvers\' read access to a bill (and so to its photos) ends when it\n    # leaves their chain: sent back, taken back, or sent again up another chain\n    for s in frappe.get_all("DocShare", filters={"share_doctype": "Settlement Expense", "share_name": se_name}, fields=["name", "user"], limit_page_length=100):\n        if s.user not in keep:\n            frappe.delete_doc("DocShare", s.name, ignore_permissions=True, force=True)', 'def unshare(se_name, keep):\n    # 26 Nov 2026 (the user): shares STAY -- removing one needs the "Share"\n    # right, which approvers and reps do not have ("You need to have Share\n    # permission" on send back / send again / take back). Nothing removed.\n    return None']]], ['Expense Claim Approver', "previous approver's share STAYS", [['    doc.expense_approver = approver or FALLBACK\n', '    doc.expense_approver = approver or FALLBACK\n    # 26 Nov 2026 (the user): the previous approver\'s share STAYS. HRMS removes\n    # it when the approver changes -- as the user saving, who has no "Share"\n    # right ("You need to have Share permission"). Telling it the approver did\n    # not change skips that removal; nothing else reads it.\n    if old and old.expense_approver and old.expense_approver != doc.expense_approver:\n        old.expense_approver = doc.expense_approver\n']]]]

bad = []
stamp = str(frappe.utils.now())[:16].replace("-", "").replace(":", "").replace(" ", "-")
for job in JOBS:
    name = job[0]
    cur = frappe.db.get_value("Server Script", name, "script")
    if cur is None:
        bad.append("no Server Script " + name)
        continue
    flat = cur.replace(chr(13), "")
    if job[1] in flat:
        print("already in: " + name)
        continue
    new = flat
    ok = True
    for p in job[2]:
        n = new.count(p[0])
        if n != 1:
            ok = False
            bad.append(name + ": a patch spot was found " + str(n) + " times (needs 1) -- NOT changed")
        else:
            new = new.replace(p[0], p[1])
    if not ok:
        continue
    print(W + "patch Server Script " + name + " (" + str(len(cur)) + " -> " + str(len(new)) + " characters)")
    if not DRY:
        frappe.get_doc({"doctype": "File", "file_name": name.lower().replace(" ", "-") + "-before-share-fix-" + stamp + ".py", "content": cur,
                        "is_private": 1, "attached_to_doctype": "Server Script", "attached_to_name": name}).insert(ignore_permissions=True)
        sc = frappe.get_doc("Server Script", name)
        sc.script = new
        sc.disabled = 0
        sc.save(ignore_permissions=True)
print("")
if bad:
    print("PROBLEMS:")
    for x in bad:
        print("   " + x)
print("dry run -- nothing changed." if DRY else "done. (saved only if Commit was ticked)")
