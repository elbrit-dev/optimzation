# SYSTEM CONSOLE -- one hotel bill paid twice: HR-EXP-2026-00070 (Dharmendra Kumar Sharma, E00844), 24 Nov 2026.
# Paste into ERP > System Console (type Python), logged in as Administrator / a System Manager.
#   1) DRY = True, "Commit" unticked: only prints what it would do.
#   2) DRY = False, TICK "Commit", Execute.        Safe to re-run.
#
# The Maa Sharda bill no. 18, Rs 4,400, check-in 5 Oct -> check-out 7 Oct (2 nights = Rs 2,200 a night),
# was uploaded twice: on the 5 Oct card (Rs 2,200, right) and again on the 6 Oct card typed in as
# 6 -> 7 Oct, so the whole Rs 4,400 fell on one night (capped to Rs 3,000). 5 Oct + 6 Oct = Rs 5,200
# on a Rs 4,400 bill.
#
# The fix: the 6 Oct Stay line is ADJUSTED to Rs 2,200 -- stored like the final check's adjustments
# (custom_adjusted / _adjusted_amount / _adjust_reason / _adjusted_by / _adjusted_on + sanctioned_amount),
# so the planner shows "3,000 -> 2,200" with the reason, and the dashboard and payroll pay 2,200.
# The claimed amount and the bill stay as they were (the record of what was asked). A comment on the
# claim says what was done. Bill Fingerprint BF-00175 (the second photo) is noted as the same bill.

DRY = True
W = "WOULD " if DRY else ""

CLAIM = "HR-EXP-2026-00070"
ROW = "sigdl7d6og"            # Stay · Tue 6 Oct · MAA SHARDA PAYING GUEST HOUSE · Rs 3,000
FIRST = "o1vn3cdnm0"          # Stay · Mon 5 Oct · same bill · Rs 2,200
NEW = 2200
REASON = ("Same hotel bill as 5 Oct (Maa Sharda, bill no 18, Rs 4,400 for the nights of 5 and 6 Oct): "
          "Rs 2,200 a night. The second photo was entered as 6-7 Oct, so the whole bill fell on 6 Oct.")
FP_DUP = "BF-00175"
FP_FIRST = "BF-00173"

bad = []
c = frappe.db.get_value("Expense Claim", CLAIM, ["name", "employee", "docstatus", "approval_status", "workflow_state"], as_dict=True)
if not c:
    bad.append("no claim " + CLAIM)
elif c.employee != "E00844":
    bad.append(CLAIM + " is not E00844's")
elif c.docstatus != 0:
    bad.append(CLAIM + " is already submitted (docstatus " + str(c.docstatus) + ") -- tell Accounts instead")

r = frappe.db.get_value("Expense Claim Detail", ROW, ["name", "parent", "expense_type", "expense_date", "amount", "custom_bill_amount",
                                                     "custom_bill_vendor", "custom_adjusted", "custom_adjusted_amount"], as_dict=True)
f = frappe.db.get_value("Expense Claim Detail", FIRST, ["name", "parent", "expense_type", "expense_date", "amount", "custom_bill_amount", "custom_bill_vendor"], as_dict=True)
if not r or r.parent != CLAIM:
    bad.append("line " + ROW + " is not on " + CLAIM)
elif not (r.expense_type == "Stay" and str(r.expense_date) == "2026-10-06" and abs(frappe.utils.flt(r.custom_bill_amount) - 4400) < 1
          and "SHARDA" in str(r.custom_bill_vendor or "").upper()):
    bad.append("line " + ROW + " is not the 6 Oct Maa Sharda stay any more: " + str(r))
if not f or f.parent != CLAIM or abs(frappe.utils.flt(f.amount) - 2200) > 1 or str(f.expense_date) != "2026-10-05":
    bad.append("the 5 Oct line " + FIRST + " is not the Rs 2,200 Maa Sharda stay any more: " + str(f))

if bad:
    print("NOTHING DONE:")
    for x in bad:
        print("   " + x)
elif r.custom_adjusted and abs(frappe.utils.flt(r.custom_adjusted_amount) - NEW) < 0.5:
    print("already adjusted to Rs " + str(NEW) + " -- nothing to do")
else:
    print(CLAIM + " (" + str(c.workflow_state or c.approval_status) + "): 6 Oct Stay claimed Rs " + str(r.amount)
          + (" (adjusted Rs " + str(r.custom_adjusted_amount) + ")" if r.custom_adjusted else "") + " -> " + W + "adjust to Rs " + str(NEW))
    if not DRY:
        now = frappe.utils.now()
        frappe.db.set_value("Expense Claim Detail", ROW, {"custom_adjusted": 1, "custom_adjusted_amount": NEW, "custom_adjust_reason": REASON,
                                                          "custom_adjusted_by": frappe.session.user, "custom_adjusted_on": now,
                                                          "sanctioned_amount": NEW}, update_modified=False)
        frappe.get_doc({"doctype": "Comment", "comment_type": "Comment", "reference_doctype": "Expense Claim", "reference_name": CLAIM,
                        "content": "Stay Tue 6 Oct adjusted Rs " + str(r.amount) + " -> Rs " + str(NEW) + ": " + REASON}).insert(ignore_permissions=True)
    if frappe.db.exists("Bill Fingerprint", FP_DUP):
        print(W + "note " + FP_DUP + " as the same bill as " + FP_FIRST)
        if not DRY:
            frappe.db.set_value("Bill Fingerprint", FP_DUP, {"matched": FP_FIRST, "note": "Same bill as " + FP_FIRST + " (second photo, check-in typed as 6 Oct) -- "
                                                              + "the 6 Oct line on " + CLAIM + " adjusted to Rs 2,200 on 24 Nov 2026."}, update_modified=False)

print("")
print("dry run -- nothing changed." if DRY else "done. (saved only if Commit was ticked)")
