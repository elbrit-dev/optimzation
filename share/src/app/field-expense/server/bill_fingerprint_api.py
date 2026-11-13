# Server Script "Bill Fingerprint API" -- type API, method bill_fingerprint
# (12 Nov 2026). The planner's duplicate-bill check.
#
# The app server (/api/claims/read-bill) reads a trip bill, checks its type and
# date, makes its three hashes and calls this with the REP'S OWN token:
#   action=claim    file_hash, image_hash, content_hash, strong, kind, trip,
#                   bill_date, amount, vendor, bill_no
#     -> { ok: 1, name, flag }       the bill is now registered to the rep
#     -> { ok: 0, reason, matched }  refused; the attempt is recorded too
#   action=release  name             the rep removed the bill from the trip
#
# Hashes: file = SHA-256 of the bytes; image = 64-bit perceptual hash (hex,
# near = 6 or fewer differing bits); content = SHA-256 of GSTIN/vendor | bill
# no | date | total ("strong" when there is a bill no).
#   - same file, or same content with a bill no on both  -> refused
#   - near-identical photo, or same content without a bill no -> allowed, flagged
# Refused for the rep's own other trip AND for any other employee (a shared
# bill between two people is not decided yet, 12 Nov 2026). Every refusal is a
# "Refused" row and a comment on the rep's month claim, so the reporting
# officer sees repeat attempts. Rows older than 2 years are not compared.
#
# Reps cannot read Bill Fingerprint themselves (System Manager / HR Manager
# only): this script reads with get_all and writes with ignore_permissions.

fd = frappe.form_dict
action = str(fd.get("action") or "claim")
user = frappe.session.user
emp = None
if user and user != "Guest":
    emp = frappe.db.get_value("Employee", {"user_id": user, "status": "Active"}, "name")
if not emp:
    frappe.throw("No active employee is linked to this login.")

if action == "release":
    name = str(fd.get("name") or "")
    row = None
    if name:
        row = frappe.db.get_value("Bill Fingerprint", name, ["employee", "status"], as_dict=True)
    if row and row.employee == emp and row.status == "Used":
        frappe.delete_doc("Bill Fingerprint", name, ignore_permissions=True, force=True)
        frappe.response["message"] = {"released": name}
    else:
        frappe.response["message"] = {"released": None}

elif action == "claim":
    kind = str(fd.get("kind") or "")
    if kind not in ["Stay", "Food", "Fuel", "Toll"]:
        frappe.throw("Unknown bill kind.")
    trip = str(fd.get("trip") or "")[:40]
    fh = str(fd.get("file_hash") or "").lower()[:64]
    ih = str(fd.get("image_hash") or "").lower()[:16]
    ch = str(fd.get("content_hash") or "").lower()[:64]
    strong = 1 if str(fd.get("strong") or "") in ["1", "true", "True"] else 0
    bdate = str(fd.get("bill_date") or "")[:10]
    if len(bdate) != 10:
        bdate = None
    since = frappe.utils.add_days(frappe.utils.today(), -730)
    cols = ["name", "employee", "trip", "kind", "bill_date", "image_hash", "content_hash", "strong"]

    found = []
    seen = {}
    if fh:
        for r in frappe.get_all("Bill Fingerprint", filters={"file_hash": fh, "status": "Used", "creation": [">=", since]}, fields=cols):
            if not seen.get(r.name):
                seen[r.name] = 1
                found.append({"r": r, "hard": 1, "why": "the same file"})
    if ch:
        for r in frappe.get_all("Bill Fingerprint", filters={"content_hash": ch, "status": "Used", "creation": [">=", since]}, fields=cols):
            if not seen.get(r.name):
                seen[r.name] = 1
                if strong and r.strong:
                    found.append({"r": r, "hard": 1, "why": "the same bill (bill no, date and total)"})
                else:
                    found.append({"r": r, "hard": 0, "why": "the same vendor, date and total"})
    if ih and bdate and len(ih) == 16:
        for r in frappe.get_all("Bill Fingerprint", filters={"bill_date": bdate, "kind": kind, "status": "Used", "image_hash": ["!=", ""], "creation": [">=", since]}, fields=cols):
            if seen.get(r.name) or len(r.image_hash or "") != 16:
                continue
            x = int(ih, 16) ^ int(r.image_hash, 16)
            bits = 0
            while x:
                x = x & (x - 1)
                bits = bits + 1
            if bits <= 6:
                seen[r.name] = 1
                found.append({"r": r, "hard": 0, "why": "a near-identical photo"})

    block = None
    flag = None
    for m in found:
        r = m["r"]
        if r.employee == emp:
            where = "this trip" if r.trip == trip else ("your trip of " + str(r.trip or "")[:10])
            text = "Already claimed on " + where + " (" + m["why"] + ")."
        else:
            text = "Already claimed by another employee (" + m["why"] + ")."
        if m["hard"]:
            if not block:
                block = {"name": r.name, "text": text}
        elif not flag:
            flag = {"name": r.name, "text": "Possible repeat: " + text}

    base = {
        "doctype": "Bill Fingerprint",
        "employee": emp,
        "kind": kind,
        "trip": trip,
        "bill_date": bdate,
        "amount": frappe.utils.flt(fd.get("amount")),
        "vendor": str(fd.get("vendor") or "")[:140],
        "bill_no": str(fd.get("bill_no") or "")[:140],
        "file_url": str(fd.get("file_url") or "")[:400],
        "file_hash": fh,
        "image_hash": ih,
        "content_hash": ch,
        "strong": strong,
    }

    if block:
        base["status"] = "Refused"
        base["matched"] = block["name"]
        base["note"] = block["text"]
        frappe.get_doc(base).insert(ignore_permissions=True)
        # tell the reporting officer: a comment on the rep's claim for the month
        month = trip[:7]
        if len(month) == 7:
            claims = frappe.get_all("Expense Claim", filters={"employee": emp, "remark": ["like", "Field TA/DA % " + month], "docstatus": ["<", 2]}, fields=["name"], limit=1)
            if claims:
                frappe.get_doc({
                    "doctype": "Comment",
                    "comment_type": "Comment",
                    "reference_doctype": "Expense Claim",
                    "reference_name": claims[0].name,
                    "content": "Bill refused (" + kind + ", " + str(bdate or "no date") + ", Rs " + str(frappe.utils.flt(fd.get("amount"))) + "): " + block["text"] + " See Bill Fingerprint " + block["name"] + ".",
                }).insert(ignore_permissions=True)
        frappe.response["message"] = {"ok": 0, "reason": block["text"], "matched": block["name"]}
    else:
        base["status"] = "Used"
        if flag:
            base["matched"] = flag["name"]
            base["note"] = flag["text"]
        doc = frappe.get_doc(base).insert(ignore_permissions=True)
        frappe.response["message"] = {"ok": 1, "name": doc.name, "flag": flag["text"] if flag else None}

else:
    frappe.throw("Unknown action.")
