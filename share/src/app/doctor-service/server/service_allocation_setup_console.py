# Service Allocation: the GM's monthly service amount per SM / ZSM, and how
# that SM splits it across their departments.
#
# Paste into ERP > System Console (type Python), logged in as a System Manager.
# 1) Run with DRY = True and "Commit" UNticked: it only prints what it would do.
# 2) Set DRY = False, tick "Commit", run again.
# Safe to re-run: anything already in place is skipped.
#
# What it makes (custom doctypes, module Custom):
#   "Service Allocation Split" (child table)
#       department  Link Department   one of the SM's departments
#       amount      Currency          the SM's share for it this month
#   "Service Allocation"  one record per SM / ZSM per month, named
#       SA-<YYYY-MM>-<employee>
#       employee, employee_name, seat     the SM / ZSM (an SM- seat holder)
#       month (first day), month_key ("2026-10")
#       amount            what the GM allocated
#       allocated_by / allocated_at
#       split_total, status (Not split / Partly split / Split)
#       split_by / split_at
#       splits            Table -> Service Allocation Split
#     Track changes is on: every change is kept in the record's version
#     history (who changed the amount or the split, and when).
#   Permissions: System Manager full; GM and CEO read; MIS read. The app
#   writes only through the elbrit_service_allocation_save API script, which
#   checks who is asking.
#
# The split also lands in Department.custom_service_budget (the
# "Department Service Budget" table): the save script sets each department's
# month row to the sum of every SM's split for it.
#
# safe_exec: no import, no .format(), no set literals, no tuple unpacking,
# no underscore-prefixed names.

DRY = True

CHILD = "Service Allocation Split"
PARENT = "Service Allocation"
W = "WOULD " if DRY else ""

if frappe.db.exists("DocType", CHILD):
    print("ok: doctype " + CHILD)
else:
    print(W + "create child doctype " + CHILD)
    if not DRY:
        frappe.get_doc({
            "doctype": "DocType",
            "name": CHILD,
            "module": "Custom",
            "custom": 1,
            "istable": 1,
            "editable_grid": 1,
            "fields": [
                {"fieldname": "department", "label": "Department", "fieldtype": "Link", "options": "Department",
                 "reqd": 1, "in_list_view": 1, "columns": 5},
                {"fieldname": "amount", "label": "Amount", "fieldtype": "Currency", "in_list_view": 1,
                 "columns": 3, "default": "0"},
            ],
        }).insert(ignore_permissions=True)

if frappe.db.exists("DocType", PARENT):
    print("ok: doctype " + PARENT)
else:
    print(W + "create doctype " + PARENT)
    if not DRY:
        perms = [{"role": "System Manager", "read": 1, "write": 1, "create": 1, "delete": 1, "report": 1, "export": 1}]
        for r in ["GM", "CEO", "MIS"]:
            if frappe.db.exists("Role", r):
                perms.append({"role": r, "read": 1, "report": 1})
        frappe.get_doc({
            "doctype": "DocType",
            "name": PARENT,
            "module": "Custom",
            "custom": 1,
            "autoname": "format:SA-{month_key}-{employee}",
            "track_changes": 1,
            "sort_field": "month",
            "sort_order": "DESC",
            "title_field": "employee_name",
            "fields": [
                {"fieldname": "employee", "label": "SM / ZSM", "fieldtype": "Link", "options": "Employee",
                 "reqd": 1, "in_list_view": 1, "in_standard_filter": 1},
                {"fieldname": "employee_name", "label": "Name", "fieldtype": "Data", "read_only": 1,
                 "in_list_view": 1},
                {"fieldname": "seat", "label": "Seat", "fieldtype": "Data", "read_only": 1},
                {"fieldname": "column_break_a", "fieldtype": "Column Break"},
                {"fieldname": "month", "label": "Month", "fieldtype": "Date", "reqd": 1, "in_list_view": 1,
                 "in_standard_filter": 1, "description": "First day of the month"},
                {"fieldname": "month_key", "label": "Month key", "fieldtype": "Data", "read_only": 1,
                 "description": "YYYY-MM"},
                {"fieldname": "section_alloc", "label": "Allocation", "fieldtype": "Section Break"},
                {"fieldname": "amount", "label": "Allocated amount", "fieldtype": "Currency", "in_list_view": 1,
                 "default": "0"},
                {"fieldname": "allocated_by", "label": "Allocated by", "fieldtype": "Link", "options": "User",
                 "read_only": 1},
                {"fieldname": "allocated_at", "label": "Allocated at", "fieldtype": "Datetime", "read_only": 1},
                {"fieldname": "column_break_b", "fieldtype": "Column Break"},
                {"fieldname": "split_total", "label": "Split so far", "fieldtype": "Currency", "read_only": 1,
                 "default": "0"},
                {"fieldname": "status", "label": "Status", "fieldtype": "Select",
                 "options": "Not split\nPartly split\nSplit", "default": "Not split", "read_only": 1,
                 "in_list_view": 1, "in_standard_filter": 1},
                {"fieldname": "split_by", "label": "Split by", "fieldtype": "Link", "options": "User",
                 "read_only": 1},
                {"fieldname": "split_at", "label": "Split at", "fieldtype": "Datetime", "read_only": 1},
                {"fieldname": "section_split", "label": "Split across departments", "fieldtype": "Section Break"},
                {"fieldname": "splits", "label": "Splits", "fieldtype": "Table", "options": CHILD},
            ],
            "permissions": perms,
        }).insert(ignore_permissions=True)

if DRY:
    print("DRY RUN: nothing changed. Set DRY = False, tick Commit, run again.")
