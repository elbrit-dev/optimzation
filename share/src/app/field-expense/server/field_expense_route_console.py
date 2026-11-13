# Field TA/DA: the reporting officer's approval is final (12 Nov 2026).
#
# The planner sends ONE Expense Claim per rep per month (remark
# "Field TA/DA · 2026-10"), every line priced by the ERP's own Field Expense
# build: Travel, Daily Allowance, own-car Fuel / Toll. "Expense Claim Route"
# sends every approved claim without an AI score to In Review (a Task for
# Accounts) -- for these claims there is nothing for the AI to check, so the
# officer's approval is the decision: Approved -> Verified, and the route's own
# step 3 then makes the Additional Salary ("Field Expenses Reimbursement",
# payroll on the last day of next month) as it does for every Verified claim.
#
# A field claim with a bill attached on any line (stay / food, once the AI
# check is built) is NOT covered: it keeps today's AI-score routing.
#
# Patches "Expense Claim Route" in place: one condition, nothing else.
# Paste into ERP > System Console (type Python), logged in as a System Manager.
# 1) DRY = True, "Commit" unticked: only prints.  2) DRY = False, tick Commit.
# Safe to re-run: an already patched script is left as it is.

DRY = True
W = "WOULD " if DRY else ""
NAME = "Expense Claim Route"

OLD = '''        if scored and score >= AUTO_SCORE:
            route = "Verified"
'''
NEW = '''        # The planner's monthly field TA/DA claim with no bill on it (12 Nov
        # 2026): every line was priced by the ERP itself, so the reporting
        # officer's approval is final -- no AI score, no Accounts review.
        field = str(doc.remark or "").startswith("Field TA/DA · ")
        for r in doc.expenses or []:
            if r.get("custom_bill"):
                field = False
        if field or (scored and score >= AUTO_SCORE):
            route = "Verified"
'''

ss = frappe.get_doc("Server Script", NAME)
src = ss.script or ""
if "\r\n" in src:
    OLD = OLD.replace("\n", "\r\n")
    NEW = NEW.replace("\n", "\r\n")
if "The planner's monthly field TA/DA claim" in src:
    print("ok: " + NAME + " is already patched")
elif src.count(OLD) != 1:
    print("STOP: the approval step in " + NAME + " is not as expected (found " + str(src.count(OLD)) + " times) -- nothing changed")
else:
    print(W + "patch " + NAME + ": a field TA/DA claim with no bill is Verified on the officer's approval (then Additional Salary)")
    if not DRY:
        ss.script = src.replace(OLD, NEW)
        ss.save(ignore_permissions=True)

print("done" if not DRY else "DRY RUN: nothing changed. Set DRY = False, tick Commit, run again.")
