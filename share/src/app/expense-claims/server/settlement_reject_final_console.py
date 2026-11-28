# SYSTEM CONSOLE -- Settlement: REJECT IS FINAL (prod, 28 Nov 2026).
# The user: no "send back" on settlement approvals -- only Approve or Reject. A reject is
# final: the bill becomes "Rejected" (kept, with the reason) and can never be sent again;
# its place in the duplicate register is freed (Bill Fingerprint rows deleted, Bill Check
# rows Released) so the rep can add the same bill as a NEW one. New action reject_many:
# the approver's ticked bills rejected with one reason. Bills sent back BEFORE today stay
# "Checked" and can still be sent again.
#
# Does: 1) "Rejected" added to Settlement Expense.status; 2) the Settlement API patched with
# 5 exact replacements, only if prod still has every old text exactly once (else
# NOTHING is changed). The script as it was is saved first as a private File on the script.
# Paste into ERP > System Console (type Python), logged in as Administrator, TICK "Commit", Execute.
PAIRS = [
    ["#   A booking that fails stops the approval too (nothing half done): the CEO\n#   sees why. Accounts then pays what is owed (Settlement Accounts API).\n#   A REJECT, at any step, needs a reason: the request goes back to the rep\n#   (bills to \"Checked\" with the reason, the advance draft deleted); they fix\n#   and send again. SENT AGAIN (17 Nov 2026): back to whoever rejected it --\n#   the steps approved before stay approved (\"Approved before (SR-x)\") -- as\n#   long as the bill's photo is the same and its amount is not higher; else",
     "#   A booking that fails stops the approval too (nothing half done): the CEO\n#   sees why. Accounts then pays what is owed (Settlement Accounts API).\n#   A REJECT, at any step, needs a reason, and is FINAL (28 Nov 2026, the\n#   user: no send back): the bill is \"Rejected\" with the reason and is never\n#   sent again; its place in the duplicate register is freed, so the rep can\n#   add the same bill as a NEW one and send that. The advance draft is\n#   deleted. reject_many = the approver's ticked bills, one reason for all.\n#   (Before 28 Nov a reject returned the bills to \"Checked\"; those can still\n#   be sent again, as below.) SENT AGAIN (17 Nov 2026): back to whoever rejected it --\n#   the steps approved before stay approved (\"Approved before (SR-x)\") -- as\n#   long as the bill's photo is the same and its amount is not higher; else"],
    ["#   POST action=decide       name, decision (Approve | Reject), note\n#   POST action=approve_many names=a,b       approve them all; those that reach the CEO go as ONE batch\n#   GET  action=ceo_batches                  the CEO's batches (waiting, and the last 30 days)\n#   POST action=decide_batch name            the CEO approves what is still waiting in a batch",
     "#   POST action=decide       name, decision (Approve | Reject), note\n#   POST action=approve_many names=a,b       approve them all; those that reach the CEO go as ONE batch\n#   POST action=reject_many  names=a,b, note reject them all with one reason (final)\n#   GET  action=ceo_batches                  the CEO's batches (waiting, and the last 30 days)\n#   POST action=decide_batch name            the CEO approves what is still waiting in a batch"],
    ["    d.decided_by = me\n    d.decided_on = frappe.utils.now()\n    for b in d.bills or []:\n        frappe.db.set_value(\"Settlement Expense\", b.row, {\"status\": \"Checked\", \"settlement\": None,\n                                                         \"review_note\": (\"Returned by \" + who + \": \" + note)[:500]})\n        unshare(b.row, [])\n    if d.advance and frappe.db.get_value(\"Employee Advance\", d.advance, \"docstatus\") == 0:\n        frappe.delete_doc(\"Employee Advance\", d.advance, ignore_permissions=True, force=True)\n        d.advance = None\n    notify(d.user, \"Sent back by \" + who + \": \" + note, d.name)\n\n",
     "    d.decided_by = me\n    d.decided_on = frappe.utils.now()\n    # 28 Nov 2026 (the user): FINAL -- the bill is Rejected (kept, with the\n    # reason and its request) and cannot be sent again; its duplicate-register\n    # place is freed so the same bill can be added as a new one\n    for b in d.bills or []:\n        frappe.db.set_value(\"Settlement Expense\", b.row, {\"status\": \"Rejected\",\n                                                         \"review_note\": (\"Rejected by \" + who + \": \" + note)[:500]})\n        free_bill(b.row)\n        unshare(b.row, [])\n    if d.advance and frappe.db.get_value(\"Employee Advance\", d.advance, \"docstatus\") == 0:\n        frappe.delete_doc(\"Employee Advance\", d.advance, ignore_permissions=True, force=True)\n        d.advance = None\n    notify(d.user, \"Rejected by \" + who + \": \" + note, d.name)\n\n\ndef free_bill(name):\n    # a rejected bill no longer counts as claimed: Bill Fingerprint rows go (as\n    # on remove_bill) and the new Bill Check register's rows are Released\n    if frappe.db.exists(\"DocType\", \"Bill Fingerprint\"):\n        for p in frappe.get_all(\"Bill Fingerprint\", filters={\"trip\": name, \"status\": \"Used\"}, pluck=\"name\"):\n            frappe.delete_doc(\"Bill Fingerprint\", p, ignore_permissions=True, force=True)\n    if frappe.db.exists(\"DocType\", \"Bill Check\"):\n        for p in frappe.get_all(\"Bill Check\", filters={\"source\": \"Settlement\", \"ref\": name, \"status\": \"Used\"}, pluck=\"name\"):\n            frappe.db.set_value(\"Bill Check\", p, \"status\", \"Released\")\n\n"],
    ["    frappe.response[\"message\"] = {\"approved\": done, \"batch\": sb, \"to_ceo\": len(to_ceo), \"skipped\": skipped}\n\nelif action == \"ceo_batches\":\n    if me != CEO_USER and not overview:",
     "    frappe.response[\"message\"] = {\"approved\": done, \"batch\": sb, \"to_ceo\": len(to_ceo), \"skipped\": skipped}\n\nelif action == \"reject_many\":\n    # 28 Nov 2026 (the user): the approver's ticked bills rejected in one go,\n    # one reason for all -- final, like a single reject\n    note = \" \".join(str(fd.get(\"note\") or \"\").split())[:1000]\n    if not note:\n        frappe.throw(\"Say why it is rejected -- the requester sees it.\")\n    names = []\n    for x in str(fd.get(\"names\") or \"\").split(\",\"):\n        if x.strip() and x.strip() not in names:\n            names.append(x.strip())\n    who = str((emp and emp.employee_name) or me)\n    done = 0\n    skipped = []\n    batches = []\n    for name in names:\n        d = frappe.get_doc(\"Settlement Request\", name) if frappe.db.exists(\"Settlement Request\", name) else None\n        if not d or d.status != \"Waiting\" or d.next_approver != me or (d.user == me and me != CEO_USER):\n            skipped.append(name)\n            continue\n        if d.get(\"batch\") and d.get(\"batch\") not in batches:\n            batches.append(d.get(\"batch\"))\n        reject_one(d, me, who, note)\n        d.save(ignore_permissions=True)\n        done = done + 1\n    for b in batches:\n        close_batch(b, me)\n    frappe.response[\"message\"] = {\"rejected\": done, \"skipped\": skipped}\n\nelif action == \"ceo_batches\":\n    if me != CEO_USER and not overview:"],
    ["elif action == \"decide_batch\":\n    # the CEO approves what is still waiting on him in the batch (bills he\n    # sent back one by one are already back with the rep): booked, final\n    if me != CEO_USER:\n        frappe.throw(\"Only the CEO approves a batch.\", frappe.PermissionError)",
     "elif action == \"decide_batch\":\n    # the CEO approves what is still waiting on him in the batch (bills he\n    # rejected one by one are already out of it): booked, final\n    if me != CEO_USER:\n        frappe.throw(\"Only the CEO approves a batch.\", frappe.PermissionError)"],
]
MARK = "def free_bill(name):"
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
        frappe.get_doc({"doctype": "File", "file_name": "settlement-api-before-reject-final-" + str(frappe.utils.now())[:16].replace("-", "").replace(":", "").replace(" ", "-") + ".py",
                        "content": sc.script, "is_private": 1, "attached_to_doctype": "Server Script", "attached_to_name": "Settlement API"}).insert(ignore_permissions=True)
        for p in PAIRS:
            src = src.replace(p[0], p[1])
        dt = frappe.get_doc("DocType", "Settlement Expense")
        for f in dt.fields:
            if f.fieldname == "status" and "Rejected" not in str(f.options or "").split("\n"):
                f.options = str(f.options or "").rstrip("\n") + "\nRejected"
        dt.save(ignore_permissions=True)
        sc.script = src
        sc.save(ignore_permissions=True)
        frappe.clear_cache(doctype="Settlement Expense")
        print("done: Settlement Expense status has Rejected; Settlement API patched (" + str(len(PAIRS)) + " changes). Saved only if Commit was ticked.")
