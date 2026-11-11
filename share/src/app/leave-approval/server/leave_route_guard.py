# =====================================================================
# SERVER SCRIPT — Leave Application, Before Validate ("Elbrit Leave Route Guard")
# Installed with resolver.py prepended (see install_leave_scripts.py).
#
# On every save and submit of a Leave Application — from the desk, the
# calendar, the app or the workflow:
#   OPEN       leave_approver / custom_escalation_approver are refreshed from
#              the live rule (the first approver and escalation person). They
#              are a convenience for the desk and HRMS (which shares the leave
#              with leave_approver); nothing decides from them.
#   DECIDING   (status becoming Approved / Rejected) the person saving must be
#              someone the live rule names — the approver, the escalation
#              person once allowed, HR Manager (override) or Administrator.
#              Anyone else is refused with who it is for.
# =====================================================================

lr_today = frappe.utils.nowdate()
lr_old = doc.get_doc_before_save()
lr_old_status = lr_old.status if lr_old else None
lr_r = LRE["route"](doc.employee, doc.leave_type)

if doc.docstatus == 0 and doc.status == "Open":
    if lr_r.get("approvers"):
        doc.leave_approver = lr_r.get("approvers")[0]
    doc.custom_escalation_approver = lr_r.get("escalation")[0] if lr_r.get("escalation") else None

if doc.status in ["Approved", "Rejected"] and lr_old_status in [None, "Open"]:
    lr_who = LRE["can"](frappe.session.user, doc.as_dict(), lr_r, lr_today)
    if not lr_who:
        lr_for = LRE["names"](lr_r.get("approvers")) if lr_r.get("approvers") else "HR"
        frappe.throw("You can't decide this leave. It is for " + lr_for + " to decide.", title="Not your leave to decide")
