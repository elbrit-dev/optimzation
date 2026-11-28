# SYSTEM CONSOLE -- Settlement: a REJECTED bill's photo can be added again (prod, 28 Nov 2026).
# Found in the 28 Nov live test: after a final reject the rep re-added the same bill and the
# Settlement API refused it ("This bill is already added") -- the same photo is still attached
# to the rejected bill. Now the photo of the rep's OWN Rejected bill is free; any other bill's
# photo (someone else's, or one not rejected) is still refused.
# Patches the Settlement API with 1 exact replacement, only if prod still has the old text
# exactly once (else NOTHING is changed). The script as it was is saved first as a private File.
# Paste into ERP > System Console (type Python), logged in as Administrator, TICK "Commit", Execute.
PAIRS = [
    ["    for o in frappe.get_all(\"File\", filters={\"file_url\": url}, fields=[\"owner\", \"attached_to_doctype\", \"attached_to_name\"], limit_page_length=20):\n        if o.owner != user or o.attached_to_name:\n            if o.attached_to_doctype == \"Settlement Expense\" and frappe.db.get_value(\"Settlement Expense\", o.attached_to_name, \"user\") == user:\n                # the same bill sent twice (a retry after a lost answer)",
     "    for o in frappe.get_all(\"File\", filters={\"file_url\": url}, fields=[\"owner\", \"attached_to_doctype\", \"attached_to_name\"], limit_page_length=20):\n        if o.owner != user or o.attached_to_name:\n            # 28 Nov 2026 (the user): a reject is final, and the rep adds the same\n            # bill again as a NEW one -- the photo of their OWN Rejected bill is free\n            if o.attached_to_doctype == \"Settlement Expense\" and o.attached_to_name:\n                old = frappe.db.get_value(\"Settlement Expense\", o.attached_to_name, [\"user\", \"status\"], as_dict=True)\n                if old and old.status == \"Rejected\" and old.user == user:\n                    continue\n            if o.attached_to_doctype == \"Settlement Expense\" and frappe.db.get_value(\"Settlement Expense\", o.attached_to_name, \"user\") == user:\n                # the same bill sent twice (a retry after a lost answer)"],
]
MARK = "the photo of their OWN Rejected bill is free"
sc = frappe.get_doc("Server Script", "Settlement API")
src = sc.script.replace("\r\n", "\n")
if MARK in src:
    print("Settlement API: already patched -- nothing to do")
else:
    bad = []
    for p in PAIRS:
        if src.count(p[0]) != 1:
            bad.append(p[0][:80])
    if bad:
        print("STOPPED -- prod Settlement API differs from what this patch expects; nothing changed:")
        for b in bad:
            print("  not found once: " + b)
    else:
        frappe.get_doc({"doctype": "File", "file_name": "settlement-api-before-readd-" + str(frappe.utils.now())[:16].replace("-", "").replace(":", "").replace(" ", "-") + ".py",
                        "content": sc.script, "is_private": 1, "attached_to_doctype": "Server Script", "attached_to_name": "Settlement API"}).insert(ignore_permissions=True)
        for p in PAIRS:
            src = src.replace(p[0], p[1])
        sc.script = src
        sc.save(ignore_permissions=True)
        print("done: Settlement API patched (1 change). Saved only if Commit was ticked.")
