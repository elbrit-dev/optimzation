# Expense claims: ERP update (22 Oct 2026). Brings the live ERP in step with
# the app:
#   1. "Expense Approver Missing" fixed: the "Expense Claim Approver" script runs
#      BEFORE VALIDATE and fills the reporting officer on every save where
#      expense_approver is empty (HRMS checks the field in validate).
#   2. An advance claim is exactly ONE line (one amount, one purpose).
#   3. Each claim row gets "Bill Details (AI)" (custom_bill_meta, JSON): what
#      the AI read off that row's bill -- vendor, GSTIN, bill no., bill date,
#      what for, payment mode, checks. Only the AI checker may write it
#      ("Expense Claim AI Guard").
# Sources: expense_claim_approver.py, expense_claim_ai_guard.py (this folder).
# Replaces expense_approver_fix_console.py.
#
# After running: Frappe Cloud -> Clear Cache / Restart, so GraphQL sees the
# new field (the app reads it later; the bill check writes it over REST).
#
# Paste into ERP > System Console (type Python), logged in as a System Manager.
# 1) DRY = True, "Commit" unticked: only checks.  2) DRY = False, tick Commit.

DRY = True
W = "WOULD " if DRY else ""

APPROVER_SCRIPT = r'''
FALLBACK = "sathish.admin@elbrit.org"    # Sathishkumar Kumaresan

# Advance rules. An advance claim holds exactly ONE Advance row (one claim =
# one advance, one amount, one purpose -- 22 Oct 2026). Spends are separate claims with custom_advance pointing at the
# employee's own released (Verified) advance; they never ask for an advance.
types = [r.expense_type for r in doc.expenses or []]
if "Advance" in types and len([t for t in types if t != "Advance"]) > 0:
    frappe.throw("An advance claim holds only Advance rows. Add the spends as a separate claim against the advance.")
if "Advance" in types and len(types) > 1:
    frappe.throw("An advance request is one line: one amount for one purpose. Ask for another advance separately.")
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

sending = doc.workflow_state == "Waiting for Approval" and was != "Waiting for Approval"
moved = bool(old) and old.employee != doc.employee and doc.workflow_state in [None, "", "Draft", "Rejected"]
if doc.employee and (sending or moved or not doc.expense_approver):
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
'''

GUARD_SCRIPT = r'''
AI_USERS = ["Administrator"]
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
            if str(r.get(f) or "") != str(o.get(f) or ""):
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
'''

# 1. The field
key = "Expense Claim Detail-custom_bill_meta"
if frappe.db.exists("Custom Field", key):
    print("ok: field " + key)
else:
    print(W + "add field " + key + " (JSON, read only)")
    if not DRY:
        frappe.get_doc({"doctype": "Custom Field", "dt": "Expense Claim Detail", "fieldname": "custom_bill_meta",
            "label": "Bill Details (AI)", "fieldtype": "JSON", "insert_after": "custom_ai_reason",
            "read_only": 1, "no_copy": 1,
            "description": "Everything the AI read off this row's bill: vendor, GSTIN, bill no., bill date, what for, payment mode, checks."}).insert(ignore_permissions=True)

# 2. The scripts
for s in [["Expense Claim Approver", "Before Validate", APPROVER_SCRIPT], ["Expense Claim AI Guard", "Before Save", GUARD_SCRIPT]]:
    cur = frappe.db.get_value("Server Script", s[0], ["doctype_event"], as_dict=True)
    if not cur:
        print("MISSING: Server Script " + s[0] + " -- run expense_claim_workflow_console.py first")
        continue
    print(W + "update " + s[0] + " (" + str(cur.doctype_event) + " -> " + s[1] + ")")
    if not DRY:
        ss = frappe.get_doc("Server Script", s[0])
        ss.doctype_event = s[1]
        ss.script = s[2]
        ss.disabled = 0
        ss.save(ignore_permissions=True)

print("done" if not DRY else "dry run -- nothing changed")
