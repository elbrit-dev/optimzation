# Service Allocation REQUESTS: an SM / ZSM asks the GM for more than they were
# allocated; the GM (or CEO / IT) approves the amount asked, or a revised one,
# or rejects. An approved amount is added to the SM's allocation.
#
# Run AFTER service_allocation_setup_console.py (the Service Allocation doctype
# must exist).
#
# Paste into ERP > System Console (type Python), logged in as a System Manager.
# 1) Run with DRY = True and "Commit" UNticked: it only prints what it would do.
# 2) Set DRY = False, tick "Commit", run again.
# Safe to re-run: anything already in place is skipped.
#
# What it makes:
#   "Service Allocation Request" (child table, module Custom)
#       amount_requested  Currency   what the SM asked for
#       reason            Small Text why
#       status            Select     Pending / Approved / Rejected
#       requested_by / requested_at
#       amount_approved   Currency   what the GM granted (may differ)
#       decided_by / decided_at
#       decision_note     Small Text the GM's note
#   On "Service Allocation":
#       requests  Table -> Service Allocation Request
#       reopened  Check   an approval after the 20th lets the SM split the
#                         extra; cleared once the allocation is fully split
#
# safe_exec: no import, no .format(), no set literals, no tuple unpacking,
# no underscore-prefixed names.

DRY = True

REQ = "Service Allocation Request"
PARENT = "Service Allocation"
W = "WOULD " if DRY else ""

if not frappe.db.exists("DocType", PARENT):
    frappe.throw(PARENT + " does not exist yet: run service_allocation_setup_console.py first.")

if frappe.db.exists("DocType", REQ):
    print("ok: doctype " + REQ)
else:
    print(W + "create child doctype " + REQ)
    if not DRY:
        frappe.get_doc({
            "doctype": "DocType",
            "name": REQ,
            "module": "Custom",
            "custom": 1,
            "istable": 1,
            "fields": [
                {"fieldname": "amount_requested", "label": "Amount requested", "fieldtype": "Currency",
                 "in_list_view": 1, "columns": 2, "default": "0"},
                {"fieldname": "reason", "label": "Reason", "fieldtype": "Small Text", "in_list_view": 1,
                 "columns": 3},
                {"fieldname": "status", "label": "Status", "fieldtype": "Select",
                 "options": "Pending\nApproved\nRejected", "default": "Pending", "in_list_view": 1, "columns": 1},
                {"fieldname": "requested_by", "label": "Requested by", "fieldtype": "Link", "options": "User"},
                {"fieldname": "requested_at", "label": "Requested at", "fieldtype": "Datetime"},
                {"fieldname": "column_break_r", "fieldtype": "Column Break"},
                {"fieldname": "amount_approved", "label": "Amount approved", "fieldtype": "Currency",
                 "in_list_view": 1, "columns": 2, "default": "0"},
                {"fieldname": "decided_by", "label": "Decided by", "fieldtype": "Link", "options": "User"},
                {"fieldname": "decided_at", "label": "Decided at", "fieldtype": "Datetime"},
                {"fieldname": "decision_note", "label": "Decision note", "fieldtype": "Small Text"},
            ],
        }).insert(ignore_permissions=True)

dt = frappe.get_doc("DocType", PARENT)
have = []
for f in dt.fields:
    have.append(f.fieldname)
add = []
if "reopened" not in have:
    add.append({"fieldname": "reopened", "label": "Reopened for split", "fieldtype": "Check", "read_only": 1,
                "default": "0",
                "description": "An extra amount was approved after the 20th; the SM may split it. "
                               "Cleared once the allocation is fully split."})
if "requests" not in have:
    add.append({"fieldname": "section_requests", "label": "Requests for more", "fieldtype": "Section Break"})
    add.append({"fieldname": "requests", "label": "Requests", "fieldtype": "Table", "options": REQ})
if not add:
    print("ok: " + PARENT + " has requests and reopened")
else:
    for f in add:
        print(W + "add field " + PARENT + "." + f.get("fieldname"))
    if not DRY:
        for f in add:
            dt.append("fields", f)
        dt.save(ignore_permissions=True)

if DRY:
    print("DRY RUN: nothing changed. Set DRY = False, tick Commit, run again.")
