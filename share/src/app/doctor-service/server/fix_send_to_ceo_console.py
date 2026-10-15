# Doctor Service: "Send to CEO" must reach the CEO even for a user holding BOTH
# GM and CEO roles (the CEO's profile, IT testers).
# Paste into ERP > System Console (type Python), logged in as a System Manager.
# 1) DRY = True, "Commit" UNticked: prints what it would change.
# 2) DRY = False, tick "Commit", run again.
#
# Why: at "GM Approval Waiting" the "Approval flow" workflow has two "Approve"
# rows -- GM -> "CEO Approval Waiting", and an older CEO one -> "GM Approved and
# Waiting for Verification". Frappe takes the LAST row matching the action
# among the user's roles, so a GM+CEO user's "Send to CEO" ended the service.
# The CEO row is limited to every setting EXCEPT Doctor Service (Secondary /
# Doctor Support keep it exactly as before). For Doctor Service the CEO's own
# approval at the GM step is "Final Approve".

DRY = True
LIMIT = 'doc.setting != "Doctor Service"'

wf = frappe.get_doc("Workflow", "Approval flow")
changed = False
for t in wf.transitions:
    if (t.state == "GM Approval Waiting" and t.action == "Approve" and t.allowed == "CEO"
            and t.next_state == "GM Approved and Waiting for Verification"):
        cond = (t.condition or "").strip()
        if "Doctor Service" in cond:
            print("ok: already limited -> " + cond)
            continue
        new = LIMIT if not cond else "(" + cond + ") and " + LIMIT
        print(("WOULD " if DRY else "") + "set condition on GM Approval Waiting -Approve-> GM Approved and Waiting for Verification [CEO]: '" + cond + "' -> '" + new + "'")
        t.condition = new
        changed = True
if changed and not DRY:
    wf.save(ignore_permissions=True)
    print("saved workflow Approval flow")
print("DRY RUN done: nothing changed." if DRY else "Done.")
