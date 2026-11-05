# "Reason for the increase" on Doctor Service (5 Nov 2026): a new service
# more than 10,000 above the doctor's previous given service must say why.
# The app's form asks for it only then, and the "Doctor Service Guard"
# requires it on save (and clears it when the amount is within 10,000).
#
# Paste into ERP > System Console (type Python), logged in as a System Manager.
# 1) Run with DRY = True and "Commit" UNticked: it only prints what it would do.
# 2) Set DRY = False, tick "Commit", run again.
# Safe to re-run: skipped when the field is already there.
#
# Adds Custom Field Doctor Service.custom_increase_reason (Small Text,
# "Reason for the increase", after Remarks).
#
# safe_exec: no import, no .format(), no set literals, no tuple unpacking,
# no underscore-prefixed names.

DRY = True

DT = "Doctor Service"
FIELD = "custom_increase_reason"

if frappe.db.exists("Custom Field", {"dt": DT, "fieldname": FIELD}):
    print("ok: " + DT + "." + FIELD + " already exists")
else:
    after = "remarks" if frappe.get_meta(DT).has_field("remarks") else None
    print(("WOULD " if DRY else "") + "add " + DT + "." + FIELD + (" after " + after if after else ""))
    if not DRY:
        frappe.get_doc({
            "doctype": "Custom Field",
            "dt": DT,
            "fieldname": FIELD,
            "label": "Reason for the increase",
            "fieldtype": "Small Text",
            "insert_after": after,
            "description": "Required when the amount is more than 10,000 above the doctor's previous service.",
        }).insert(ignore_permissions=True)
        # No cache clear needed (frappe.clear_cache is not allowed here):
        # saving a Custom Field clears its doctype's cache itself.

if DRY:
    print("DRY RUN: nothing changed. Set DRY = False, tick Commit, run again.")
