# =====================================================================
# SERVER SCRIPT — API "Elbrit Leave Decide", method elbrit_leave_decide
# Installed with resolver.py prepended (see install_leave_scripts.py).
#
#   POST /api/method/elbrit_leave_decide  {name, action: approve|reject, reason}
#
# Decides one Open leave AS THE CALLER, if the live rule lets them (the Leave
# Route Guard checks again on submit). The caller needs no share and no
# "Leave Approver" role: the rule is the authority. A reject reason is kept
# as a comment on the leave.
# =====================================================================

lr_name = frappe.form_dict.get("name")
lr_action = (frappe.form_dict.get("action") or "").lower()
lr_reason = (frappe.form_dict.get("reason") or "").strip()
if lr_action not in ["approve", "reject"]:
    frappe.throw("action must be approve or reject")
if lr_action == "reject" and not lr_reason:
    frappe.throw("A reason is needed to reject")

lr_doc = frappe.get_doc("Leave Application", lr_name)
if lr_doc.docstatus != 0 or lr_doc.status != "Open":
    frappe.throw("This leave is already " + (lr_doc.status or "decided"))
lr_today = frappe.utils.nowdate()
lr_r = LRE["route"](lr_doc.employee, lr_doc.leave_type)
lr_who = LRE["can"](frappe.session.user, lr_doc.as_dict(), lr_r, lr_today)
if not lr_who:
    frappe.throw("You can't decide this leave. It is for " + (LRE["names"](lr_r.get("approvers")) if lr_r.get("approvers") else "HR") + " to decide.")

if lr_reason:
    frappe.get_doc({"doctype": "Comment", "comment_type": "Comment", "reference_doctype": "Leave Application",
                    "reference_name": lr_name,
                    "content": ("Rejected: " if lr_action == "reject" else "Approved: ") + lr_reason}).insert(ignore_permissions=True)

lr_target = "Approved" if lr_action == "approve" else "Rejected"
lr_doc.status = lr_target
lr_doc.workflow_state = lr_target
lr_doc.flags.ignore_permissions = True
lr_doc.submit()
frappe.response["message"] = {"name": lr_name, "status": lr_doc.status, "as": lr_who}
