# SYSTEM CONSOLE -- delete the claim made by the 20 Nov 2026 UI re-check (local build of the planner /
# approvals fixes): HR-EXP-2026-00032, Vignesh Somasundaram (E00869), Field TA/DA · 2026-10, sent back
# (Rejected, draft), with its comments, to-dos and shares. Nothing else is touched.
# (00032 is a reused number: the earlier 00032 -- Madhu's booked settlement -- was already deleted.)
# Prod. System Console, Python, Administrator.
#   1) DRY = True, "Commit" unticked.  2) DRY = False, tick "Commit", Execute.

DRY = True
NAME = "HR-EXP-2026-00032"
EMP = "E00869"
REMARK = "Field TA/DA · 2026-10"

W = "WOULD " if DRY else ""
if not frappe.db.exists("Expense Claim", NAME):
    print("(gone) " + NAME)
else:
    c = frappe.db.get_value("Expense Claim", NAME, ["employee", "employee_name", "remark", "docstatus", "workflow_state", "total_claimed_amount"], as_dict=True)
    if c.employee != EMP or c.remark != REMARK or int(c.docstatus or 0) != 0:
        print("STOP -- " + NAME + " is not the UI-check claim (" + str(c.employee) + ", " + str(c.remark) + ", docstatus " + str(c.docstatus) + "); nothing deleted.")
    else:
        nc = frappe.db.count("Comment", {"reference_doctype": "Expense Claim", "reference_name": NAME})
        ns = frappe.db.count("DocShare", {"share_doctype": "Expense Claim", "share_name": NAME})
        nt = frappe.db.count("ToDo", {"reference_type": "Expense Claim", "reference_name": NAME})
        print(W + "delete Expense Claim " + NAME + " (" + str(c.employee_name) + ", " + str(c.workflow_state) + ", Rs " + str(c.total_claimed_amount) +
              ") + " + str(nc) + " comments, " + str(nt) + " to-dos, " + str(ns) + " shares")
        if not DRY:
            for n in frappe.get_all("Comment", filters={"reference_doctype": "Expense Claim", "reference_name": NAME}, pluck="name", limit_page_length=0):
                frappe.delete_doc("Comment", n, ignore_permissions=True, force=True)
            for n in frappe.get_all("ToDo", filters={"reference_type": "Expense Claim", "reference_name": NAME}, pluck="name", limit_page_length=0):
                frappe.delete_doc("ToDo", n, ignore_permissions=True, force=True)
            for n in frappe.get_all("DocShare", filters={"share_doctype": "Expense Claim", "share_name": NAME}, pluck="name", limit_page_length=0):
                frappe.delete_doc("DocShare", n, ignore_permissions=True, force=True)
            frappe.delete_doc("Expense Claim", NAME, ignore_permissions=True, force=True)
            frappe.db.commit()
            print("done.")
if DRY:
    print("dry run -- nothing changed.")
