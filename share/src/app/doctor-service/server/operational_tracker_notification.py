# =====================================================================
# SERVER SCRIPT — the source of truth for the ERP's copy. Keep in step.
#
#   Name           : Operational Tracker Notification
#   Script Type    : DocType Event
#   Reference Doc  : Operational Tracker
#   Event          : After Save
#
# ERP bell notifications (Notification Log) when a tracker changes state:
#   ... Rejected                    -> the tracker's owner
#   ... Waiting for Verification    -> open ToDo assignees + the owner
#   Approved                        -> the owner
#   ... Approval Waiting            -> the next approver
#   ... Approved and Verified       DOCTOR SERVICE ONLY (added 21 Oct 2026):
#                                   everyone on the MIS "carry out" ToDo --
#                                   its owner (head of MIS) and the MIS users
#                                   it is shared with. The "operational
#                                   tracker" script (Before Save) writes that
#                                   ToDo and its DocShares directly, which
#                                   notifies no one; this tells them. The
#                                   notification opens the Doctor Service.
#
# Was in ERP only until 21 Oct 2026. Its commented-out Novu trigger (with an
# API key) is left out of this copy: Novu is removed from the app.
#
# safe_exec: no import, no .format(), no set literals, no tuple
# unpacking, no underscore-prefixed names.
# =====================================================================

old = doc.get_doc_before_save()
new_state = doc.workflow_state or ""
old_state = (old.workflow_state or "") if old else ""

recipients = []
seen = {}
subj = ""
body = ""
# what the notification opens (the tracker, unless a rule says otherwise)
open_type = "Operational Tracker"
open_name = doc.name

if not old or new_state != old_state:
    if new_state.endswith("Rejected"):
        subj = "Operational Tracker " + doc.name + " Rejected"
        body = "Your request " + doc.name + " was rejected."
        t = doc.owner
        if t and t not in seen:
            seen[t] = 1
            recipients.append({"subscriberId": t.lower(), "email": t.lower()})
    elif new_state.endswith(" Approved and Verified") and doc.reference_doctype == "Doctor Service":
        subj = "Doctor Service approved - carry it out: " + str(doc.reference)
        body = ("Doctor Service " + str(doc.reference) + " is finally approved (" + new_state + ")"
                + (" for " + str(doc.department) if doc.department else "")
                + ". Carry it out and close the ToDo.")
        open_type = "Doctor Service"
        open_name = doc.reference
        for td in frappe.get_all("ToDo",
                filters={"reference_type": "Operational Tracker",
                         "reference_name": doc.name, "status": "Open"},
                fields=["name", "allocated_to"]):
            uid = td.get("allocated_to")
            if uid and uid not in seen:
                seen[uid] = 1
                recipients.append({"subscriberId": uid.lower(), "email": uid.lower()})
            for sh in frappe.get_all("DocShare",
                    filters={"share_doctype": "ToDo", "share_name": td.get("name")},
                    fields=["user"]):
                su = sh.get("user")
                if su and su not in seen:
                    seen[su] = 1
                    recipients.append({"subscriberId": su.lower(), "email": su.lower()})
    elif new_state.endswith("Waiting for Verification"):
        subj = "Operational Tracker " + doc.name + " awaiting Verification"
        body = doc.name + " is fully approved and now awaiting verification."
        for td in frappe.get_all("ToDo",
                filters={"reference_type": "Operational Tracker",
                         "reference_name": doc.name, "status": "Open"},
                fields=["allocated_to"]):
            uid = td.get("allocated_to")
            if uid and uid not in seen:
                seen[uid] = 1
                recipients.append({"subscriberId": uid.lower(), "email": uid.lower()})
        if doc.owner and doc.owner not in seen:
            seen[doc.owner] = 1
            recipients.append({"subscriberId": doc.owner.lower(), "email": doc.owner.lower()})
    elif new_state == "Approved":
        subj = "Operational Tracker " + doc.name + " Approved"
        body = "Your request " + doc.name + " has been fully approved."
        if doc.owner and doc.owner not in seen:
            seen[doc.owner] = 1
            recipients.append({"subscriberId": doc.owner.lower(), "email": doc.owner.lower()})
    elif new_state.endswith("Approval Waiting"):
        subj = "Operational Tracker " + doc.name + " awaiting your approval"
        body = "Request " + doc.name + " is waiting for your approval."
        t = doc.next_approver
        if t and t not in seen:
            seen[t] = 1
            recipients.append({"subscriberId": t.lower(), "email": t.lower()})

# ---- native desk bell ----
for r in recipients:
    nlog = frappe.get_doc({
        "doctype": "Notification Log", "for_user": r["email"],
        "from_user": doc.modified_by, "type": "Alert", "subject": subj,
        "email_content": body, "document_type": open_type,
        "document_name": open_name})
    nlog.insert(ignore_permissions=True)
