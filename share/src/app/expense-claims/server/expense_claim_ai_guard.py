# =====================================================================
# SERVER SCRIPT — the source of truth for the ERP's copy. Keep in step.
#
#   Name           : Expense Claim AI Guard
#   Script Type    : DocType Event
#   Reference Doc  : Expense Claim
#   Event          : Before Save
#
# The AI check writes what it read off each bill and a score:
#   row    custom_bill_amount / custom_bill_date / custom_bill_vendor
#          custom_ai_score (0-100) / custom_ai_reason
#          custom_bill_meta: everything read off the bill, as JSON (vendor,
#          GSTIN, bill no., bill date, what for, payment mode...)
#   claim  custom_ai_score (0-100) / custom_ai_summary
# and this script sets custom_ai_risk (row and claim) from the score:
#   90+ Low, 70-89 Medium, below 70 High.
# A score of 90+ is paid without a person looking (Expense Claim Route), so
# only the checker may write these. Anyone else saving the claim gets the
# previous values put back -- an employee cannot score their own claim.
#
# And a score only stands for what was checked: change a row's amount, date,
# type or bill and that row's check is wiped, along with the claim's score,
# so it has to be checked again.
#
# AI_USERS: the logins the AI check saves with -- it@elbrit.org is the app's
# ERP_AI_CHECKER_TOKEN (28 Oct 2026); keep it in step with the consoles.
#
# Installed by expense_claim_workflow_console.py. Added 21 Oct 2026.
#
# safe_exec: no import, no .format(), no set literals, no tuple
# unpacking, no underscore-prefixed names, no def (DocType Event
# functions cannot see top-level names).
# =====================================================================

AI_USERS = ["Administrator", "it@elbrit.org"]
ROW_AI = ["custom_bill_amount", "custom_bill_date", "custom_bill_vendor", "custom_ai_score", "custom_ai_reason", "custom_bill_meta"]
ROW_INPUT = ["amount", "expense_date", "expense_type", "custom_sub_type", "custom_bill"]

old = doc.get_doc_before_save()
prev = {}
if old:
    for o in old.expenses or []:
        prev[o.name] = o

checker = frappe.session.user in AI_USERS
stale = False

for r in doc.expenses or []:
    o = prev.get(r.name)
    if not checker:
        for f in ROW_AI:
            r.set(f, o.get(f) if o else None)
    changed = o is None
    if o:
        for f in ROW_INPUT:
            if f == "amount":
                if frappe.utils.flt(r.get(f)) != frappe.utils.flt(o.get(f)):   # 85 vs 85.0
                    changed = True
            elif str(r.get(f) or "") != str(o.get(f) or ""):
                changed = True
    if changed and not (checker and r.get("custom_ai_reason")):
        for f in ROW_AI:
            r.set(f, None)
        stale = True

if old and len(old.expenses or []) != len(doc.expenses or []):
    stale = True

# Money bookkeeping is written only by "Expense Claim Route" (db.set_value,
# which skips this script) -- a save from anyone else keeps what was there.
for f in ["custom_additional_salary", "custom_advance_balance", "custom_advance_spent", "custom_advance_covered"]:
    doc.set(f, old.get(f) if old else None)

if not checker:
    doc.custom_ai_score = old.get("custom_ai_score") if old else None
    doc.custom_ai_summary = old.get("custom_ai_summary") if old else None
if stale and not (checker and doc.get("custom_ai_summary")):
    doc.custom_ai_score = None
    doc.custom_ai_summary = None

# Risk always follows the score, never typed: 90+ Low, 70-89 Medium, else High.
# An empty Percent reads back as 0, so "checked" means the AI wrote its
# reason (row) / summary (claim) -- it always does. Unchecked = no risk.
for r in doc.expenses or []:
    s = frappe.utils.flt(r.get("custom_ai_score"))
    r.custom_ai_risk = None if not r.get("custom_ai_reason") else ("Low" if s >= 90 else ("Medium" if s >= 70 else "High"))
s = frappe.utils.flt(doc.get("custom_ai_score"))
doc.custom_ai_risk = None if not doc.get("custom_ai_summary") else ("Low" if s >= 90 else ("Medium" if s >= 70 else "High"))
