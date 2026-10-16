# Move the Department "Service Budget" section onto the Details tab (after the
# Approvers tables) and show it expanded. It was first placed after the
# form's last field, which is on the "Employee and Customer Mapping" tab.
# Paste into ERP > System Console (Python) as a System Manager, tick Commit, run.

cf = frappe.get_doc("Custom Field", "Department-custom_service_budget_section")
cf.insert_after = "expense_approvers"
cf.collapsible = 0
cf.save(ignore_permissions=True)
frappe.clear_cache(doctype="Department")
print("moved: Service Budget is now after " + cf.insert_after + " on the Details tab, expanded")
