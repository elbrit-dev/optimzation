# =====================================================================
# SERVER SCRIPT — the source of truth for the ERP's copy. Keep in step.
#
#   Name           : Expense Claim Approver
#   Script Type    : DocType Event
#   Reference Doc  : Expense Claim
#   Event          : Before Save
#
# When a claim is sent for approval (workflow "Expense Claim Approval" ->
# "Waiting for Approval"), sets expense_approver to the employee's reporting
# officer: Employee.reports_to's login. BE -> ABM, ABM -> RBM, and so on, for
# every employee. A vacant or Left seat, or one with no enabled login, is
# skipped and the next one up answers. Nobody above (CEO, broken chain) ->
# FALLBACK. Recomputed on every send, so a resend after a rejection picks up
# a changed reporting line.
#
# Also enforces the advance rules and the sub type lists (Advance learns
# new sub types from users) -- see below the constants.
#
# The workflow's Approve / Reject only answer to expense_approver; the
# "Expense Claim Route" script (After Save) shares the claim with them.
#
# Installed by expense_claim_workflow_console.py. Added 21 Oct 2026.
#
# safe_exec: no import, no .format(), no set literals, no tuple
# unpacking, no underscore-prefixed names, no def (DocType Event
# functions cannot see top-level names).
# =====================================================================

FALLBACK = "sathish.admin@elbrit.org"    # Sathishkumar Kumaresan

# Advance rules. An advance claim holds only Advance rows (one claim = one
# advance). Spends are separate claims with custom_advance pointing at the
# employee's own released (Verified) advance; they never ask for an advance.
types = [r.expense_type for r in doc.expenses or []]
if "Advance" in types and len([t for t in types if t != "Advance"]) > 0:
    frappe.throw("An advance claim holds only Advance rows. Add the spends as a separate claim against the advance.")
if doc.get("custom_advance"):
    if "Advance" in types:
        frappe.throw("A claim against an advance cannot ask for another advance.")
    adv = frappe.db.get_value("Expense Claim", doc.custom_advance, ["employee", "workflow_state"], as_dict=True)
    if not adv or adv.employee != doc.employee:
        frappe.throw("Advance " + str(doc.custom_advance) + " is not this employee's.")
    if adv.workflow_state != "Verified":
        frappe.throw("Advance " + str(doc.custom_advance) + " has not been released yet.")

# Sub types. Each row's sub type must be one of its type's list (Expense
# Claim Type.custom_sub_types, one per line), matched without case. A type
# with custom_allow_new_sub_types ticked (Advance) learns new ones instead:
# what the user typed is added to the type's list, so everyone gets it.
lists = {}
for r in doc.expenses or []:
    sub = " ".join(str(r.get("custom_sub_type") or "").split())
    if not sub or not r.expense_type:
        r.custom_sub_type = sub or None
        continue
    if r.expense_type not in lists:
        t = frappe.db.get_value("Expense Claim Type", r.expense_type, ["custom_sub_types", "custom_allow_new_sub_types"], as_dict=True) or {}
        lists[r.expense_type] = {"subs": [s.strip() for s in str(t.get("custom_sub_types") or "").split("\n") if s.strip()], "open": t.get("custom_allow_new_sub_types")}
    known = lists[r.expense_type]
    match = None
    for s in known["subs"]:
        if s.lower() == sub.lower():
            match = s
    if match:
        r.custom_sub_type = match
    elif known["open"]:
        known["subs"].append(sub)
        frappe.db.set_value("Expense Claim Type", r.expense_type, "custom_sub_types", "\n".join(known["subs"]))
        r.custom_sub_type = sub
    else:
        frappe.throw("Row " + str(r.idx) + ": " + sub + " is not a " + r.expense_type + " sub type. Pick one from the list.")

old = doc.get_doc_before_save()
was = old.workflow_state if old else None

if doc.workflow_state == "Waiting for Approval" and was != "Waiting for Approval":
    me = frappe.db.get_value("Employee", doc.employee, "user_id")
    approver = None
    cur = doc.employee
    n = 0
    while n < 10 and not approver:
        n = n + 1
        up = frappe.db.get_value("Employee", cur, "reports_to")
        if not up or up == cur:
            break
        row = frappe.db.get_value("Employee", up, ["status", "user_id"], as_dict=True)
        cur = up
        if row and row.status == "Active" and row.user_id and row.user_id != me:
            if frappe.db.get_value("User", row.user_id, "enabled"):
                approver = row.user_id
    doc.expense_approver = approver or FALLBACK
