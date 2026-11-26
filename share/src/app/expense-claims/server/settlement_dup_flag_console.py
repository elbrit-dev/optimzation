# SYSTEM CONSOLE -- SETTLEMENT: DUPLICATE BILLS FLAGGED, NOT REFUSED (prod, 26 Nov 2026).
# Paste into ERP > System Console (type Python), logged in as Administrator.
#   1) DRY = True, "Commit" unticked: only prints what it would do.
#   2) DRY = False, TICK "Commit", Execute.          Safe to re-run.
# Generated from the repo (scratchpad gen_dup_flag_console2.py).
# Both scripts are PATCHED IN PLACE -- prod has 25 Nov changes that are not in the old repo copy (kept):
#   Bill Fingerprint API: reworked-trip moves, different bill numbers, card / mine / get
#   Settlement API:       the "Bills from / Bills to" window, remove_bill without the owner check
# 1. "Bill Fingerprint API": a SETTLEMENT bill (kind "Bill") that matches a bill already used is no
#    longer refused -- registered with a "Duplicate: ..." note; the answer carries the earlier bill (who,
#    where, date, total, vendor, why, its photo). Planner trip bills: unchanged (still refused).
# 2. "Settlement API": approvers get each bill's duplicate (bills[].dup) and, when the bill is sent, read
#    access to the earlier bill (DocShare on that Settlement Expense or TA/DA Expense Claim) to open its
#    photo side by side. The rep never sees the earlier photo.
# Every patch spot must be found exactly once in a script, or that script is left unchanged and listed
# under PROBLEMS. A backup of each changed script is kept as a private File on it.

DRY = True
W = "WOULD " if DRY else ""
JOBS = [['Bill Fingerprint API', '"dup": dup}', [['# Reps cannot read Bill Fingerprint themselves', '# SETTLEMENT BILLS ARE NOT REFUSED (26 Nov 2026, the user): a settlement bill\n# (kind "Bill") that matches a used bill is FLAGGED instead -- registered as\n# "Used" with matched = the earlier bill and a "Duplicate: ..." note, and the\n# answer carries dup: who claimed the earlier bill and where, its date,\n# total, vendor, why it matched, and its photo (file_url). The form warns the\n# rep (who may still send it) and the approvers compare the two photos side by\n# side. Planner trip bills are still refused as before.\n#\n# Reps cannot read Bill Fingerprint themselves'], ['cols = ["name", "employee", "trip", "kind", "bill_date", "amount", "vendor", "bill_no", "image_hash", "file_url"]', 'cols = ["name", "employee", "trip", "kind", "bill_date", "amount", "vendor", "bill_no", "image_hash", "file_url", "creation"]'], ['    block = None\n    flag = None\n    for m in found:', '    block = None\n    flag = None\n    dup = None\n    for m in found:'], ['        if m["hard"]:\n            if not block:\n                block = {"name": r.name, "text": text}\n        elif not flag:\n            flag = {"name": r.name, "text": "Possible repeat: " + text}\n', '        # a settlement bill (26 Nov 2026): the earlier bill as the form and the approvers see it\n        if kind == "Bill" and (m["hard"] or not dup) and (not dup or not dup["sure"]):\n            ename = frappe.db.get_value("Employee", r.employee, "employee_name") or r.employee\n            dup = {"name": r.name, "sure": 1 if m["hard"] else 0, "why": m["why"], "mine": 1 if r.employee == emp else 0,\n                   "employee": r.employee, "employee_name": ename, "kind": r.kind,\n                   "where": ("a settlement bill " + str(r.trip or "")) if r.kind == "Bill" else ("a TA/DA trip of " + str(r.trip or "")[:10]),\n                   "doc": str(r.trip or ""), "bill_date": str(r.bill_date or ""), "amount": frappe.utils.flt(r.amount),\n                   "vendor": r.vendor or "", "bill_no": r.bill_no or "", "file_url": r.file_url or "", "claimed_on": str(r.creation or "")[:10]}\n        if m["hard"]:\n            if not block:\n                block = {"name": r.name, "text": text}\n        elif not flag:\n            flag = {"name": r.name, "text": "Possible repeat: " + text}\n    # 26 Nov 2026: a settlement bill is never refused -- the match is a flag\n    if kind == "Bill" and block:\n        flag = {"name": block["name"], "text": "Duplicate: " + block["text"]}\n        block = None\n'], ['            frappe.response["message"] = {"ok": 1, "flag": flag["text"] if flag else None}', '            frappe.response["message"] = {"ok": 1, "flag": flag["text"] if flag else None, "dup": dup}'], ['        frappe.response["message"] = {"ok": 1, "name": doc.name, "flag": flag["text"] if flag else None}', '        frappe.response["message"] = {"ok": 1, "name": doc.name, "flag": flag["text"] if flag else None, "dup": dup}']]], ['Settlement API', 'def dup_of(meta):', [['def shape(d):\n    steps = []\n    for s in d.steps or []:\n        steps.append({"user": s.user, "name": s.approver_name, "level": s.level, "decision": s.decision or "",\n                      "at": str(s.decided_on or ""), "note": s.note or ""})\n    bills = []\n    for b in d.bills or []:\n        bills.append({"row": b.row, "date": str(b.bill_date or ""), "title": b.title, "amount": b.amount,\n                      "bill": b.bill or "", "score": b.ai_score, "risk": b.ai_risk or "", "reason": b.ai_reason or ""})', 'def dup_of(meta):\n    # the earlier bill a settlement bill repeats (26 Nov 2026: flagged, not\n    # refused -- the bill check keeps it in bill_meta.fingerprint.dup), or None\n    try:\n        d = ((json.loads(meta or "{}") or {}).get("fingerprint") or {}).get("dup")\n    except Exception:\n        return None\n    if not d or not d.get("name"):\n        return None\n    return d\n\n\ndef dup_doc(d):\n    # where the earlier bill\'s photo lives -> [doctype, name], or None:\n    # a settlement bill, or the employee\'s TA/DA claim for that trip\'s month\n    if not d:\n        return None\n    if d.get("kind") == "Bill":\n        return ["Settlement Expense", d.get("doc")] if d.get("doc") and frappe.db.exists("Settlement Expense", d.get("doc")) else None\n    month = str(d.get("doc") or "")[:7]\n    if len(month) == 7 and d.get("employee"):\n        c = frappe.db.get_value("Expense Claim", {"employee": d.get("employee"), "remark": ["like", "Field TA/DA % " + month], "docstatus": ["<", 2]}, "name")\n        if c:\n            return ["Expense Claim", c]\n    return None\n\n\ndef shape(d):\n    steps = []\n    for s in d.steps or []:\n        steps.append({"user": s.user, "name": s.approver_name, "level": s.level, "decision": s.decision or "",\n                      "at": str(s.decided_on or ""), "note": s.note or ""})\n    bills = []\n    for b in d.bills or []:\n        # a repeat of an earlier bill (26 Nov 2026): what the approvers compare it with\n        dp = dup_of(frappe.db.get_value("Settlement Expense", b.row, "bill_meta")) if b.row else None\n        dup = None\n        if dp:\n            dup = {"sure": frappe.utils.cint(dp.get("sure")), "why": dp.get("why") or "", "employee_name": dp.get("employee_name") or "",\n                   "same_person": dp.get("employee") == d.employee, "where": dp.get("where") or "", "bill_date": dp.get("bill_date") or "",\n                   "amount": frappe.utils.flt(dp.get("amount")), "vendor": dp.get("vendor") or "", "bill_no": dp.get("bill_no") or "",\n                   "claimed_on": dp.get("claimed_on") or "", "photo": dp.get("file_url") or ""}\n        bills.append({"row": b.row, "date": str(b.bill_date or ""), "title": b.title, "amount": b.amount,\n                      "bill": b.bill or "", "score": b.ai_score, "risk": b.ai_risk or "", "reason": b.ai_reason or "", "dup": dup})'], ['                b["reason"] = ""\n', '                b["reason"] = ""\n                b["dup"] = None\n'], ['                sh.flags.ignore_share_permission = True\n                sh.insert(ignore_permissions=True)\n    # one alert per approver for the whole send, not one per bill (a bill', '                sh.flags.ignore_share_permission = True\n                sh.insert(ignore_permissions=True)\n        # a repeat of an earlier bill (26 Nov 2026): the approvers may open that\n        # bill too (read only), to compare the two photos side by side\n        od = dup_doc(dup_of(r.bill_meta))\n        if od:\n            for c in use:\n                if c["user"] != me and not frappe.db.exists("DocShare", {"share_doctype": od[0], "share_name": od[1], "user": c["user"]}):\n                    sh = frappe.get_doc({"doctype": "DocShare", "share_doctype": od[0], "share_name": od[1], "user": c["user"],\n                                         "read": 1, "write": 0, "share": 0, "notify_by_email": 0})\n                    sh.flags.ignore_share_permission = True\n                    sh.insert(ignore_permissions=True)\n    # one alert per approver for the whole send, not one per bill (a bill']]]]

bad = []
stamp = str(frappe.utils.now())[:16].replace("-", "").replace(":", "").replace(" ", "-")
for job in JOBS:
    name = job[0]
    done_mark = job[1]
    patches = job[2]
    cur = frappe.db.get_value("Server Script", name, "script")
    if cur is None:
        bad.append("no Server Script " + name)
        continue
    flat = cur.replace(chr(13), "")
    if done_mark in flat:
        print("already in: " + name)
        continue
    new = flat
    ok = True
    for p in patches:
        n = new.count(p[0])
        if n != 1:
            ok = False
            bad.append(name + ": a patch spot was found " + str(n) + " times (needs 1) -- NOT changed: " + p[0][:70].replace(chr(10), " / "))
        else:
            new = new.replace(p[0], p[1])
    if not ok:
        continue
    print(W + "patch Server Script " + name + " (" + str(len(cur)) + " -> " + str(len(new)) + " characters)")
    if not DRY:
        frappe.get_doc({"doctype": "File", "file_name": name.lower().replace(" ", "-") + "-before-dup-flag-" + stamp + ".py", "content": cur,
                        "is_private": 1, "attached_to_doctype": "Server Script", "attached_to_name": name}).insert(ignore_permissions=True)
        sc = frappe.get_doc("Server Script", name)
        sc.script = new
        sc.disabled = 0
        sc.save(ignore_permissions=True)
print("")
if bad:
    print("PROBLEMS:")
    for x in bad:
        print("   " + x)
print("dry run -- nothing changed." if DRY else "done. (saved only if Commit was ticked)")
