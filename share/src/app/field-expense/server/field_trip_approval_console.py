# Trip-by-trip approval of the planner's field TA/DA claims (12 Nov 2026).
# The reporting officer approves or rejects each TRIP of a rep's month claim
# separately, on the app's approvals page.
#
#   1. 5 custom fields on Expense Claim Detail: custom_trip (the planner's
#      trip tag) and the officer's decision -- custom_trip_decision / _note /
#      _decided_by / _decided_on.
#   2. Server Script "Field Trip Decision API" (API, method field_trip_decide):
#      the claim's own approver (or a System Manager) sets a trip's decision
#      while the claim waits for approval.
#   3. Server Script "Field Trip Decision Guard" (Expense Claim, Before Save):
#      decisions are never taken from a save -- an unchanged line keeps its
#      decision, a changed or new line starts undecided.
#   4. Then press Clear Cache yourself (System Console can't) so GraphQL /
#      forms see the new fields.
#
# Paste into ERP > System Console (type Python), logged in as a System Manager.
# 1) DRY = True, "Commit" unticked: only prints.  2) DRY = False, tick Commit.
# Safe to re-run: each step skips what is already there.

DRY = True
W = "WOULD " if DRY else ""
CRLF = chr(13) + chr(10)
LF = chr(10)

FIELDS = [{'dt': 'Expense Claim Detail', 'fieldname': 'custom_trip', 'label': 'Trip', 'fieldtype': 'Data', 'insert_after': 'description', 'description': 'Planner trip: first day..last day · name'}, {'dt': 'Expense Claim Detail', 'fieldname': 'custom_trip_decision', 'label': "Officer's Decision", 'fieldtype': 'Select', 'options': '\nApproved\nRejected', 'insert_after': 'custom_trip', 'read_only': 1}, {'dt': 'Expense Claim Detail', 'fieldname': 'custom_trip_note', 'label': "Officer's Note", 'fieldtype': 'Small Text', 'insert_after': 'custom_trip_decision', 'read_only': 1}, {'dt': 'Expense Claim Detail', 'fieldname': 'custom_trip_decided_by', 'label': 'Decided By', 'fieldtype': 'Link', 'options': 'User', 'insert_after': 'custom_trip_note', 'read_only': 1}, {'dt': 'Expense Claim Detail', 'fieldname': 'custom_trip_decided_on', 'label': 'Decided On', 'fieldtype': 'Datetime', 'insert_after': 'custom_trip_decided_by', 'read_only': 1}]

API_SCRIPT = '# Server Script "Field Trip Decision API" -- type API, method field_trip_decide (12 Nov 2026).\n# The reporting officer approves or rejects ONE TRIP of a rep\'s monthly field\n# TA/DA claim (remark "Field TA/DA · YYYY-MM") while the claim waits with them,\n# so trips of the same rep and month are decided separately.\n#\n# The decision sits on the trip\'s claim lines (Expense Claim Detail):\n#   custom_trip_decision  Approved | Rejected | "" (undecided)\n#   custom_trip_note      the officer\'s reason (always on a rejection)\n#   custom_trip_decided_by / custom_trip_decided_on\n# The claim itself moves only through its workflow, applied by the app as the\n# officer: Approve once every trip is approved, Reject (sent back to the rep)\n# when a trip is rejected. "Field Trip Decision Guard" keeps a decision on a\n# line the rep did not change when they save again, and clears it on a changed\n# or new line -- so after a send-back the officer only decides what changed.\n#\n#   POST claim     Expense Claim name\n#        rows      JSON list of Expense Claim Detail names (the trip\'s lines)\n#        decision  Approved | Rejected | "" (undo)\n#        note      required to reject; the rep sees it\n#        trip      the trip\'s label, for the claim\'s timeline\n#   -> {claim, approved, rejected, pending, rows: [{name, decision}]}\n\nPREFIX = "Field TA/DA · "\nfd = frappe.form_dict\nme = frappe.session.user\nif not me or me == "Guest":\n    frappe.throw("Please log in", frappe.PermissionError)\n\nname = str(fd.get("claim") or "")\nc = frappe.db.get_value("Expense Claim", name, ["remark", "workflow_state", "expense_approver", "docstatus"], as_dict=True) if name else None\nif not c or not str(c.remark or "").startswith(PREFIX):\n    frappe.throw("Not a planner field claim.")\nadmin = me == "Administrator" or frappe.db.exists("Has Role", {"parent": me, "parenttype": "User", "role": "System Manager"})\nif c.expense_approver != me and not admin:\n    frappe.throw("Only " + str(c.expense_approver or "the reporting officer") + " can decide this claim\'s trips.", frappe.PermissionError)\nif int(c.docstatus or 0) != 0 or c.workflow_state != "Waiting for Approval":\n    frappe.throw("This claim is " + str(c.workflow_state or "not waiting") + " -- its trips can be decided only while it waits for approval.")\n\ndecision = str(fd.get("decision") or "")\nif decision not in ["Approved", "Rejected", ""]:\n    frappe.throw("Approve or reject?")\nnote = " ".join(str(fd.get("note") or "").split())[:1000]\nif decision == "Rejected" and not note:\n    frappe.throw("Say why the trip is rejected -- the rep sees this.")\nrows = json.loads(fd.get("rows") or "[]")\nif not rows:\n    frappe.throw("Which lines of the claim?")\nfor r in rows:\n    if frappe.db.get_value("Expense Claim Detail", str(r), "parent") != name:\n        frappe.throw("Line " + str(r) + " is not on " + name + ".")\n\nnow = frappe.utils.now()\nfor r in rows:\n    frappe.db.set_value("Expense Claim Detail", str(r), {\n        "custom_trip_decision": decision,\n        "custom_trip_note": note if decision else "",\n        "custom_trip_decided_by": me if decision else None,\n        "custom_trip_decided_on": now if decision else None,\n    }, update_modified=False)\n\ntrip = " ".join(str(fd.get("trip") or "").split())[:200]\nwhat = "Trip approved" if decision == "Approved" else "Trip rejected" if decision == "Rejected" else "Trip decision undone"\nfrappe.get_doc({\n    "doctype": "Comment",\n    "comment_type": "Comment",\n    "reference_doctype": "Expense Claim",\n    "reference_name": name,\n    "comment_email": me,\n    "content": what + ": " + (trip or (str(len(rows)) + " lines")) + ((" -- " + note) if note else ""),\n}).insert(ignore_permissions=True)\n\nout = {"claim": name, "approved": 0, "rejected": 0, "pending": 0, "rows": []}\nfor l in frappe.get_all("Expense Claim Detail", filters={"parent": name, "parenttype": "Expense Claim"}, fields=["name", "custom_trip_decision"], limit_page_length=1000):\n    k = "pending"\n    if l.custom_trip_decision == "Approved":\n        k = "approved"\n    elif l.custom_trip_decision == "Rejected":\n        k = "rejected"\n    out[k] = out[k] + 1\n    out["rows"].append({"name": l.name, "decision": l.custom_trip_decision or ""})\nfrappe.response["message"] = out\n'

GUARD_SCRIPT = '# Server Script "Field Trip Decision Guard" -- DocType Event, Expense Claim,\n# Before Save (12 Nov 2026).\n#\n# The officer\'s per-trip decision (custom_trip_decision / _note / _decided_by /\n# _decided_on on each line) is written only by the "Field Trip Decision API".\n# Any save of a planner field claim -- the rep adding a trip, the workflow\n# moving -- takes those fields from the database, never from what was sent:\n#   a line that is unchanged (same date, type, amount and bill) keeps its\n#   decision; a changed or new line starts undecided.\n# So after a send-back the trips already approved stay approved, and the one\n# the rep fixed comes back to the officer. The line\'s trip tag (custom_trip)\n# is kept the same way when a save leaves it out.\n\nPREFIX = "Field TA/DA · "\nKEEP = ["custom_trip_decision", "custom_trip_note", "custom_trip_decided_by", "custom_trip_decided_on"]\n\nif str(doc.remark or "").startswith(PREFIX):\n    old = {}\n    if not doc.is_new():\n        for r in frappe.get_all(\n            "Expense Claim Detail",\n            filters={"parent": doc.name, "parenttype": "Expense Claim"},\n            fields=["name", "expense_date", "expense_type", "amount", "custom_bill", "custom_trip", "custom_trip_decision", "custom_trip_note", "custom_trip_decided_by", "custom_trip_decided_on"],\n            limit_page_length=1000,\n        ):\n            old[r.name] = r\n    for row in doc.expenses:\n        o = old.get(row.name) if row.name else None\n        same = False\n        if o:\n            same = (\n                str(o.expense_date)[:10] == str(row.expense_date or "")[:10]\n                and (o.expense_type or "") == (row.expense_type or "")\n                and abs(frappe.utils.flt(o.amount) - frappe.utils.flt(row.amount)) < 0.01\n                and (o.custom_bill or "") == (row.custom_bill or "")\n            )\n        for k in KEEP:\n            row.set(k, o.get(k) if same else None)\n        if o and not row.get("custom_trip") and o.get("custom_trip"):\n            row.set("custom_trip", o.get("custom_trip"))\n'

# 1. custom fields
for f in FIELDS:
    if frappe.db.exists("Custom Field", {"dt": f["dt"], "fieldname": f["fieldname"]}):
        print("ok: field " + f["dt"] + "." + f["fieldname"])
        continue
    print(W + "add field " + f["dt"] + "." + f["fieldname"])
    if not DRY:
        d = {"doctype": "Custom Field"}
        d.update(f)
        frappe.get_doc(d).insert(ignore_permissions=True)


# 2. + 3. the scripts
SCRIPTS = [
    ["Field Trip Decision API", {"script_type": "API", "api_method": "field_trip_decide", "allow_guest": 0}, API_SCRIPT],
    ["Field Trip Decision Guard", {"script_type": "DocType Event", "reference_doctype": "Expense Claim", "doctype_event": "Before Save"}, GUARD_SCRIPT],
]
for s in SCRIPTS:
    name = s[0]
    values = s[1]
    script = s[2]
    if frappe.db.exists("Server Script", name):
        ss = frappe.get_doc("Server Script", name)
        same = (ss.script or "").replace(CRLF, LF) == script and not ss.disabled
        for k in values:
            if str(ss.get(k) or "") != str(values[k] or ""):
                same = False
        if same:
            print("ok: Server Script " + name + " is current")
            continue
        print(W + "update Server Script " + name)
        if not DRY:
            for k in values:
                ss.set(k, values[k])
            ss.disabled = 0
            ss.script = script
            ss.save(ignore_permissions=True)
        continue
    print(W + "create Server Script " + name)
    if not DRY:
        d = {"doctype": "Server Script", "name": name, "disabled": 0, "script": script}
        d.update(values)
        frappe.get_doc(d).insert(ignore_permissions=True)

# what is waiting now
waiting = frappe.get_all("Expense Claim", filters={"remark": ["like", "Field TA/DA%"], "workflow_state": "Waiting for Approval", "docstatus": 0}, fields=["name", "employee_name", "expense_approver", "total_claimed_amount"])
print(str(len(waiting)) + " planner claim(s) waiting for approval: " + ", ".join([w.name + " " + str(w.employee_name) + " -> " + str(w.expense_approver) for w in waiting]))

print("done -- now Clear Cache (user menu > Reload / Clear Cache) so GraphQL and forms see the new fields" if not DRY else "DRY RUN: nothing changed. Set DRY = False, tick Commit, run again.")
