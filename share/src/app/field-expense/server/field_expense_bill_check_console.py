# Field TA/DA trip bills (12 Nov 2026): the ERP side of the planner's bill
# checks, in one go. Same as UAT (done there through the connector).
#
#   1. DocType "Bill Fingerprint" (Elbrit Mod) -- one row per bill used on a
#      trip claim, and per refused attempt; System Manager / HR Manager only.
#   2. Server Script "Bill Fingerprint API" (API, method bill_fingerprint) --
#      the duplicate check the app server calls with the rep's own token.
#   3. "Expense Claim Route" -- a "Field TA/DA" claim WITH bills is final on
#      the officer's approval only when every bill row was scored 90+ by the AI
#      checker login (checked when scanned). A possible repeat scores 85 and
#      still goes to Accounts. (field_expense_route_console.py must have run.)
#
# Paste into ERP > System Console (type Python), logged in as a System Manager.
# 1) DRY = True, "Commit" unticked: only prints.  2) DRY = False, tick Commit.
# Safe to re-run: each step skips what is already there.

DRY = True
W = "WOULD " if DRY else ""
CRLF = chr(13) + chr(10)
LF = chr(10)

DOCTYPE = {'doctype': 'DocType', 'name': 'Bill Fingerprint', 'module': 'Elbrit Mod', 'custom': 1, 'autoname': 'BF-.#####', 'naming_rule': 'Expression (old style)', 'track_changes': 0, 'sort_field': 'creation', 'sort_order': 'DESC', 'title_field': 'employee_name', 'description': 'One row per bill used on a planner trip claim (and per refused attempt): three hashes to catch the same bill coming back. Written only by the bill_fingerprint API script.', 'fields': [{'fieldname': 'employee', 'label': 'Employee', 'fieldtype': 'Link', 'options': 'Employee', 'reqd': 1, 'in_list_view': 1, 'in_standard_filter': 1, 'search_index': 1}, {'fieldname': 'employee_name', 'label': 'Employee Name', 'fieldtype': 'Data', 'fetch_from': 'employee.employee_name', 'read_only': 1}, {'fieldname': 'status', 'label': 'Status', 'fieldtype': 'Select', 'options': 'Used\nRefused', 'default': 'Used', 'in_list_view': 1, 'in_standard_filter': 1}, {'fieldname': 'kind', 'label': 'Bill Kind', 'fieldtype': 'Select', 'options': 'Stay\nFood\nFuel\nToll', 'in_list_view': 1, 'in_standard_filter': 1}, {'fieldname': 'bill_date', 'label': 'Bill Date', 'fieldtype': 'Date', 'in_list_view': 1, 'search_index': 1}, {'fieldname': 'amount', 'label': 'Bill Total', 'fieldtype': 'Currency', 'in_list_view': 1}, {'fieldname': 'column_break_1', 'fieldtype': 'Column Break'}, {'fieldname': 'trip', 'label': 'Trip', 'fieldtype': 'Data', 'description': 'Planner trip id (its first day)'}, {'fieldname': 'vendor', 'label': 'Vendor', 'fieldtype': 'Data'}, {'fieldname': 'bill_no', 'label': 'Bill No', 'fieldtype': 'Data'}, {'fieldname': 'file_url', 'label': 'Bill File', 'fieldtype': 'Data'}, {'fieldname': 'hashes_section', 'label': 'Fingerprint', 'fieldtype': 'Section Break'}, {'fieldname': 'file_hash', 'label': 'File Hash', 'fieldtype': 'Data', 'search_index': 1, 'description': 'SHA-256 of the file bytes'}, {'fieldname': 'image_hash', 'label': 'Image Hash', 'fieldtype': 'Data', 'description': '64-bit perceptual hash (hex); near match = 6 or fewer differing bits'}, {'fieldname': 'content_hash', 'label': 'Content Hash', 'fieldtype': 'Data', 'search_index': 1, 'description': 'SHA-256 of GSTIN/vendor | bill no | date | total'}, {'fieldname': 'strong', 'label': 'Has Bill No', 'fieldtype': 'Check', 'description': 'Content hash includes a bill number, so a match blocks; without one it only flags'}, {'fieldname': 'match_section', 'label': 'Match', 'fieldtype': 'Section Break'}, {'fieldname': 'matched', 'label': 'Matched Bill', 'fieldtype': 'Link', 'options': 'Bill Fingerprint'}, {'fieldname': 'note', 'label': 'Note', 'fieldtype': 'Small Text', 'description': 'Why it was refused, or the weak match it was flagged for'}], 'permissions': [{'role': 'System Manager', 'read': 1, 'write': 1, 'create': 1, 'delete': 1, 'report': 1, 'export': 1, 'share': 0, 'print': 0, 'email': 0}, {'role': 'HR Manager', 'read': 1, 'write': 0, 'create': 0, 'delete': 0, 'report': 1, 'export': 1, 'share': 0, 'print': 0, 'email': 0}]}

API_SCRIPT = '# Server Script "Bill Fingerprint API" -- type API, method bill_fingerprint\n# (12 Nov 2026). The planner\'s duplicate-bill check.\n#\n# The app server (/api/claims/read-bill) reads a trip bill, checks its type and\n# date, makes its three hashes and calls this with the REP\'S OWN token:\n#   action=claim    file_hash, image_hash, content_hash, strong, kind, trip,\n#                   bill_date, amount, vendor, bill_no\n#     -> { ok: 1, name, flag }       the bill is now registered to the rep\n#     -> { ok: 0, reason, matched }  refused; the attempt is recorded too\n#   action=release  name             the rep removed the bill from the trip\n#\n# Hashes: file = SHA-256 of the bytes; image = 64-bit perceptual hash (hex,\n# near = 6 or fewer differing bits); content = SHA-256 of GSTIN/vendor | bill\n# no | date | total ("strong" when there is a bill no).\n#   - same file, or same content with a bill no on both  -> refused\n#   - near-identical photo, or same content without a bill no -> allowed, flagged\n# Refused for the rep\'s own other trip AND for any other employee (a shared\n# bill between two people is not decided yet, 12 Nov 2026). Every refusal is a\n# "Refused" row and a comment on the rep\'s month claim, so the reporting\n# officer sees repeat attempts. Rows older than 2 years are not compared.\n#\n# Reps cannot read Bill Fingerprint themselves (System Manager / HR Manager\n# only): this script reads with get_all and writes with ignore_permissions.\n\nfd = frappe.form_dict\naction = str(fd.get("action") or "claim")\nuser = frappe.session.user\nemp = None\nif user and user != "Guest":\n    emp = frappe.db.get_value("Employee", {"user_id": user, "status": "Active"}, "name")\nif not emp:\n    frappe.throw("No active employee is linked to this login.")\n\nif action == "release":\n    name = str(fd.get("name") or "")\n    row = None\n    if name:\n        row = frappe.db.get_value("Bill Fingerprint", name, ["employee", "status"], as_dict=True)\n    if row and row.employee == emp and row.status == "Used":\n        frappe.delete_doc("Bill Fingerprint", name, ignore_permissions=True, force=True)\n        frappe.response["message"] = {"released": name}\n    else:\n        frappe.response["message"] = {"released": None}\n\nelif action == "claim":\n    kind = str(fd.get("kind") or "")\n    if kind not in ["Stay", "Food", "Fuel", "Toll"]:\n        frappe.throw("Unknown bill kind.")\n    trip = str(fd.get("trip") or "")[:40]\n    fh = str(fd.get("file_hash") or "").lower()[:64]\n    ih = str(fd.get("image_hash") or "").lower()[:16]\n    ch = str(fd.get("content_hash") or "").lower()[:64]\n    strong = 1 if str(fd.get("strong") or "") in ["1", "true", "True"] else 0\n    bdate = str(fd.get("bill_date") or "")[:10]\n    if len(bdate) != 10:\n        bdate = None\n    since = frappe.utils.add_days(frappe.utils.today(), -730)\n    cols = ["name", "employee", "trip", "kind", "bill_date", "image_hash", "content_hash", "strong"]\n\n    found = []\n    seen = {}\n    if fh:\n        for r in frappe.get_all("Bill Fingerprint", filters={"file_hash": fh, "status": "Used", "creation": [">=", since]}, fields=cols):\n            if not seen.get(r.name):\n                seen[r.name] = 1\n                found.append({"r": r, "hard": 1, "why": "the same file"})\n    if ch:\n        for r in frappe.get_all("Bill Fingerprint", filters={"content_hash": ch, "status": "Used", "creation": [">=", since]}, fields=cols):\n            if not seen.get(r.name):\n                seen[r.name] = 1\n                if strong and r.strong:\n                    found.append({"r": r, "hard": 1, "why": "the same bill (bill no, date and total)"})\n                else:\n                    found.append({"r": r, "hard": 0, "why": "the same vendor, date and total"})\n    if ih and bdate and len(ih) == 16:\n        for r in frappe.get_all("Bill Fingerprint", filters={"bill_date": bdate, "kind": kind, "status": "Used", "image_hash": ["!=", ""], "creation": [">=", since]}, fields=cols):\n            if seen.get(r.name) or len(r.image_hash or "") != 16:\n                continue\n            x = int(ih, 16) ^ int(r.image_hash, 16)\n            bits = 0\n            while x:\n                x = x & (x - 1)\n                bits = bits + 1\n            if bits <= 6:\n                seen[r.name] = 1\n                found.append({"r": r, "hard": 0, "why": "a near-identical photo"})\n\n    block = None\n    flag = None\n    for m in found:\n        r = m["r"]\n        if r.employee == emp:\n            where = "this trip" if r.trip == trip else ("your trip of " + str(r.trip or "")[:10])\n            text = "Already claimed on " + where + " (" + m["why"] + ")."\n        else:\n            text = "Already claimed by another employee (" + m["why"] + ")."\n        if m["hard"]:\n            if not block:\n                block = {"name": r.name, "text": text}\n        elif not flag:\n            flag = {"name": r.name, "text": "Possible repeat: " + text}\n\n    base = {\n        "doctype": "Bill Fingerprint",\n        "employee": emp,\n        "kind": kind,\n        "trip": trip,\n        "bill_date": bdate,\n        "amount": frappe.utils.flt(fd.get("amount")),\n        "vendor": str(fd.get("vendor") or "")[:140],\n        "bill_no": str(fd.get("bill_no") or "")[:140],\n        "file_url": str(fd.get("file_url") or "")[:400],\n        "file_hash": fh,\n        "image_hash": ih,\n        "content_hash": ch,\n        "strong": strong,\n    }\n\n    if block:\n        base["status"] = "Refused"\n        base["matched"] = block["name"]\n        base["note"] = block["text"]\n        frappe.get_doc(base).insert(ignore_permissions=True)\n        # tell the reporting officer: a comment on the rep\'s claim for the month\n        month = trip[:7]\n        if len(month) == 7:\n            claims = frappe.get_all("Expense Claim", filters={"employee": emp, "remark": ["like", "Field TA/DA % " + month], "docstatus": ["<", 2]}, fields=["name"], limit=1)\n            if claims:\n                frappe.get_doc({\n                    "doctype": "Comment",\n                    "comment_type": "Comment",\n                    "reference_doctype": "Expense Claim",\n                    "reference_name": claims[0].name,\n                    "content": "Bill refused (" + kind + ", " + str(bdate or "no date") + ", Rs " + str(frappe.utils.flt(fd.get("amount"))) + "): " + block["text"] + " See Bill Fingerprint " + block["name"] + ".",\n                }).insert(ignore_permissions=True)\n        frappe.response["message"] = {"ok": 0, "reason": block["text"], "matched": block["name"]}\n    else:\n        base["status"] = "Used"\n        if flag:\n            base["matched"] = flag["name"]\n            base["note"] = flag["text"]\n        doc = frappe.get_doc(base).insert(ignore_permissions=True)\n        frappe.response["message"] = {"ok": 1, "name": doc.name, "flag": flag["text"] if flag else None}\n\nelse:\n    frappe.throw("Unknown action.")\n'

OLD = '        field = str(doc.remark or "").startswith("Field TA/DA \xb7 ")\n        for r in doc.expenses or []:\n            if r.get("custom_bill"):\n                field = False\n'
NEW = '        # Its stay / food / fuel / toll bills are checked when scanned (type,\n        # date, read, not a repeat): a bill row counts only once the AI\n        # checker scored it AUTO_SCORE+ (a possible repeat scores 85 and\n        # still goes to Accounts).\n        field = str(doc.remark or "").startswith("Field TA/DA \xb7 ")\n        for r in doc.expenses or []:\n            if r.get("custom_bill") and (not r.get("custom_ai_reason") or frappe.utils.flt(r.get("custom_ai_score")) < AUTO_SCORE):\n                field = False\n'

# 1. the doctype
if frappe.db.exists("DocType", "Bill Fingerprint"):
    print("ok: DocType Bill Fingerprint exists")
else:
    print(W + "create DocType Bill Fingerprint")
    if not DRY:
        frappe.get_doc(DOCTYPE).insert(ignore_permissions=True)

# 2. the API script
if frappe.db.exists("Server Script", "Bill Fingerprint API"):
    ss = frappe.get_doc("Server Script", "Bill Fingerprint API")
    if (ss.script or "").replace(CRLF, LF) == API_SCRIPT and ss.api_method == "bill_fingerprint" and not ss.disabled:
        print("ok: Server Script Bill Fingerprint API is current")
    else:
        print(W + "update Server Script Bill Fingerprint API")
        if not DRY:
            ss.script_type = "API"
            ss.api_method = "bill_fingerprint"
            ss.allow_guest = 0
            ss.disabled = 0
            ss.script = API_SCRIPT
            ss.save(ignore_permissions=True)
else:
    print(W + "create Server Script Bill Fingerprint API (method bill_fingerprint)")
    if not DRY:
        frappe.get_doc({"doctype": "Server Script", "name": "Bill Fingerprint API", "script_type": "API", "api_method": "bill_fingerprint", "allow_guest": 0, "disabled": 0, "script": API_SCRIPT}).insert(ignore_permissions=True)

# 3. the route
rt = frappe.get_doc("Server Script", "Expense Claim Route")
src = rt.script or ""
old = OLD
new = NEW
if CRLF in src:
    old = old.replace(LF, CRLF)
    new = new.replace(LF, CRLF)
if "a bill row counts only once the AI" in src:
    print("ok: Expense Claim Route already takes checked bills")
elif src.count(old) != 1:
    print("STOP: Expense Claim Route is not as expected (found " + str(src.count(old)) + " times) -- nothing changed in it. Steps 1-2 above are fine.")
else:
    print(W + "patch Expense Claim Route: a field claim with bills is final on the officer's approval when every bill row is AI-checked 90+")
    if not DRY:
        rt.script = src.replace(old, new)
        rt.save(ignore_permissions=True)

print("done" if not DRY else "DRY RUN: nothing changed. Set DRY = False, tick Commit, run again.")
