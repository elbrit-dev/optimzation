# =====================================================================
# SERVER SCRIPT — the source of truth for the ERP's copy. Keep in step.
#
#   Name          : Elbrit Rework Clears Verification
#   Script Type   : DocType Event
#   Reference     : Operational Tracker
#   Event         : After Save
#
# A tracker sent back to Rework AFTER it was approved ("<X> Approved and
# Waiting for Verification" -> "Rework": an RBM's rework after approval,
# Elbrit Rework Approved) still has the MIS verification task the approval
# opened. The ERP's "operational tracker" script never closes it, and opens
# a new one when the entry is approved again, so MIS would keep a stale
# task and then two. Every open task on the tracker is cancelled here: the
# entry is back with the BE, nothing on it is MIS's to verify until it is
# approved again.
#
# safe_exec: no import, no .format(), no set literals, no tuple
# unpacking, no underscore-prefixed names.
# =====================================================================

old = doc.get_doc_before_save()
was = (old.workflow_state or "") if old else ""

if was.endswith(" Approved and Waiting for Verification") and (doc.workflow_state or "") == "Rework":
    for name in frappe.get_all("ToDo",
                               filters={"reference_type": "Operational Tracker",
                                        "reference_name": doc.name, "status": "Open"},
                               pluck="name"):
        # Saved as a document, not set in place, so the tracker's assignment
        # list (_assign) drops the MIS user too.
        todo = frappe.get_doc("ToDo", name)
        todo.status = "Cancelled"
        todo.flags.ignore_permissions = True
        todo.save()
