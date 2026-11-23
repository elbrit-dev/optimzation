# Server Script "Settlement File Guard" (23 Nov 2026, security review) -- TWO scripts, the same code:
#   "Settlement File Guard - Delete"  type DocType Event, Reference DocType File, event Before Delete
#   "Settlement File Guard - Save"    type DocType Event, Reference DocType File, event Before Save
# A settlement bill's photo stays owned by the rep (that is how they open it in the app), so Frappe
# would let them delete it, or detach it and use it on a second bill. This stops both for anyone but
# Administrator / System Manager:
#   - delete: only while the bill is still unsent (Checking / Checked, no request) -- what the app's
#     "remove bill" does; never once it is sent, approved or paid
#   - save:   a photo attached to a Settlement Expense never moves to another record or is detached
# The Settlement API attaches photos with frappe.db.set_value, which runs no doc events.
# Every other File in the ERP passes straight through (no query).
# DocType Event script: no defs, no imports. The console installs this file twice, with MODE
# set to "delete" for the Before Delete script and "save" for the Before Save one.

MODE = "save"
stop = ""
if MODE == "save":
    before = doc.get_doc_before_save()
    if before and before.attached_to_doctype == "Settlement Expense" and before.attached_to_name:
        if doc.attached_to_doctype != before.attached_to_doctype or doc.attached_to_name != before.attached_to_name or doc.file_url != before.file_url:
            stop = "A settlement bill's photo cannot be moved or detached."
elif doc.attached_to_doctype == "Settlement Expense" and doc.attached_to_name:
    se = frappe.db.get_value("Settlement Expense", doc.attached_to_name, ["status", "settlement"], as_dict=True)
    if se and (se.status not in ["Checking", "Checked"] or se.settlement):
        stop = "A bill sent for approval keeps its photo."
if stop:
    u = frappe.session.user
    if u != "Administrator" and not frappe.db.get_value("Has Role", {"parent": u, "parenttype": "User", "role": "System Manager"}, "role"):
        frappe.throw(stop, frappe.PermissionError)
