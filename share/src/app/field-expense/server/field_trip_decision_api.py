# Server Script "Field Trip Decision API" -- type API, method field_trip_decide (12 Nov 2026).
# The reporting officer approves or rejects ONE TRIP of a rep's monthly field
# TA/DA claim (remark "Field TA/DA · YYYY-MM") while the claim waits with them,
# so trips of the same rep and month are decided separately.
#
# The decision sits on the trip's claim lines (Expense Claim Detail):
#   custom_trip_decision  Approved | Rejected | "" (undecided)
#   custom_trip_note      the officer's reason (always on a rejection)
#   custom_trip_decided_by / custom_trip_decided_on
# The claim itself moves only through its workflow, applied by the app as the
# officer: Approve once every trip is approved, Reject (sent back to the rep)
# when a trip is rejected. "Field Trip Decision Guard" keeps a decision on a
# line the rep did not change when they save again, and clears it on a changed
# or new line -- so after a send-back the officer only decides what changed.
#
#   POST claim     Expense Claim name
#        rows      JSON list of Expense Claim Detail names (the trip's lines)
#        decision  Approved | Rejected | "" (undo)
#        note      required to reject; the rep sees it
#        trip      the trip's label, for the claim's timeline
#   -> {claim, approved, rejected, pending, rows: [{name, decision}]}

PREFIX = "Field TA/DA · "
fd = frappe.form_dict
me = frappe.session.user
if not me or me == "Guest":
    frappe.throw("Please log in", frappe.PermissionError)

name = str(fd.get("claim") or "")
c = frappe.db.get_value("Expense Claim", name, ["remark", "workflow_state", "expense_approver", "docstatus"], as_dict=True) if name else None
if not c or not str(c.remark or "").startswith(PREFIX):
    frappe.throw("Not a planner field claim.")
admin = me == "Administrator" or frappe.db.exists("Has Role", {"parent": me, "parenttype": "User", "role": "System Manager"})
if c.expense_approver != me and not admin:
    frappe.throw("Only " + str(c.expense_approver or "the reporting officer") + " can decide this claim's trips.", frappe.PermissionError)
if int(c.docstatus or 0) != 0 or c.workflow_state != "Waiting for Approval":
    frappe.throw("This claim is " + str(c.workflow_state or "not waiting") + " -- its trips can be decided only while it waits for approval.")

decision = str(fd.get("decision") or "")
if decision not in ["Approved", "Rejected", ""]:
    frappe.throw("Approve or reject?")
note = " ".join(str(fd.get("note") or "").split())[:1000]
if decision == "Rejected" and not note:
    frappe.throw("Say why the trip is rejected -- the rep sees this.")
rows = json.loads(fd.get("rows") or "[]")
if not rows:
    frappe.throw("Which lines of the claim?")
for r in rows:
    if frappe.db.get_value("Expense Claim Detail", str(r), "parent") != name:
        frappe.throw("Line " + str(r) + " is not on " + name + ".")

now = frappe.utils.now()
for r in rows:
    frappe.db.set_value("Expense Claim Detail", str(r), {
        "custom_trip_decision": decision,
        "custom_trip_note": note if decision else "",
        "custom_trip_decided_by": me if decision else None,
        "custom_trip_decided_on": now if decision else None,
    }, update_modified=False)

trip = " ".join(str(fd.get("trip") or "").split())[:200]
what = "Trip approved" if decision == "Approved" else "Trip rejected" if decision == "Rejected" else "Trip decision undone"
frappe.get_doc({
    "doctype": "Comment",
    "comment_type": "Comment",
    "reference_doctype": "Expense Claim",
    "reference_name": name,
    "comment_email": me,
    "content": what + ": " + (trip or (str(len(rows)) + " lines")) + ((" -- " + note) if note else ""),
}).insert(ignore_permissions=True)

out = {"claim": name, "approved": 0, "rejected": 0, "pending": 0, "rows": []}
for l in frappe.get_all("Expense Claim Detail", filters={"parent": name, "parenttype": "Expense Claim"}, fields=["name", "custom_trip_decision"], limit_page_length=1000):
    k = "pending"
    if l.custom_trip_decision == "Approved":
        k = "approved"
    elif l.custom_trip_decision == "Rejected":
        k = "rejected"
    out[k] = out[k] + 1
    out["rows"].append({"name": l.name, "decision": l.custom_trip_decision or ""})
frappe.response["message"] = out
