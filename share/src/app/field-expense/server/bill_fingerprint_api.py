# Server Script "Bill Fingerprint API" -- type API, method bill_fingerprint
# (12 Nov 2026; matching rewritten 16 Nov 2026). The planner's duplicate-bill
# check.
#
# The app server (/api/claims/read-bill) reads a trip bill, checks its type and
# date, makes its hashes and calls this with the REP'S OWN token:
#   action=claim    file_hash, image_hash, content_hash, strong, kind, trip,
#                   bill_date, amount, vendor, bill_no
#     -> { ok: 1, name, flag }       the bill is now registered to the rep
#     -> { ok: 0, reason, matched }  refused; the attempt is recorded too
#   action=release  name             the rep removed the bill from the trip
#
# THE SAME BILL IS REFUSED (16 Nov 2026) -- the read of a bill is not the same
# letter for letter every time ("INV 2610..." vs "2610...", "13OCT" vs
# "130CT", the vendor with or without its address, a GSTIN read once and
# missed once), so bills are compared field by field, not by one exact hash:
#   1. the same file (SHA-256 of the bytes)
#   2. the same BILL NUMBER and the same total (within Rs 1), on the same date
#      -- or on any date when the number is 8+ digits long. Numbers are
#      compared by their digits: the letters in front dropped, O read as 0,
#      I / l as 1, then only the digits (bill_key; at least 4 of them)
#   3. a near-identical photo (6 or fewer of 64 bits differ) with the same
#      date and total
#   4. YOUR OWN bill with the same date, total and vendor, when one of the two
#      has no bill number read
# Each against every bill used in the last 2 years, the rep's own (any trip)
# and every other employee's. FLAGGED only (allowed; the claim goes to
# Accounts): 4 for another employee's bill (two people can eat at one place
# for the same amount), and a near-identical photo with a different total.
# Two bills with DIFFERENT numbers are never the same bill.
# Every refusal is a "Refused" row and a comment on the rep's month claim, so
# the reporting officer sees repeat attempts.
#
# Reps cannot read Bill Fingerprint themselves (System Manager / HR Manager
# only): this script reads with get_all and writes with ignore_permissions.
# safe_exec: no import, no .format(), no set literals, no tuple unpacking,
# and a def sees only its own arguments.


def bill_key(s):
    # "INV 261021IMRTN05360" and "261021IMRTN05360" -> "261021105360";
    # "UBR-8F2K-13OCT" and "UBR-8F2K-130CT" -> "82130". "" when under 4 digits.
    t = ""
    for c in str(s or "").lower():
        if ("a" <= c <= "z") or ("0" <= c <= "9"):
            t = t + c
    i = 0
    while i < len(t) and "a" <= t[i] <= "z":
        i = i + 1
    out = ""
    for c in t[i:]:
        if c == "o":
            out = out + "0"
        elif c == "i" or c == "l":
            out = out + "1"
        elif "0" <= c <= "9":
            out = out + c
    out = out.lstrip("0")
    return out if len(out) >= 4 else ""


def vendor_key(s):
    t = ""
    for c in str(s or "").lower():
        if ("a" <= c <= "z") or ("0" <= c <= "9"):
            t = t + c
    return t


def same_vendor(a, b):
    # "Hotel Saravana Bhavan, T Nagar, Chennai" = "Hotel Saravana Bhavan"
    if len(a) < 5 or len(b) < 5:
        return False
    return a == b or a.startswith(b) or b.startswith(a)


def bits_apart(a, b):
    if len(a or "") != 16 or len(b or "") != 16:
        return 64
    x = int(a, 16) ^ int(b, 16)
    n = 0
    while x:
        x = x & (x - 1)
        n = n + 1
    return n


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
    amount = frappe.utils.flt(fd.get("amount"))
    vendor = str(fd.get("vendor") or "")[:140]
    bill_no = str(fd.get("bill_no") or "")[:140]
    key = bill_key(bill_no)
    vkey = vendor_key(vendor)
    since = frappe.utils.add_days(frappe.utils.today(), -730)
    cols = ["name", "employee", "trip", "kind", "bill_date", "amount", "vendor", "bill_no", "image_hash"]

    found = []
    seen = {}
    if fh:
        for r in frappe.get_all("Bill Fingerprint", filters={"file_hash": fh, "status": "Used", "creation": [">=", since]}, fields=cols, limit_page_length=0):
            if not seen.get(r.name):
                seen[r.name] = 1
                found.append({"r": r, "hard": 1, "why": "the same file"})

    # every used bill with the same total (any kind: one bill is never two kinds)
    if amount > 0:
        for r in frappe.get_all("Bill Fingerprint",
                                filters={"amount": ["between", [amount - 1, amount + 1]], "status": "Used", "creation": [">=", since]},
                                fields=cols, limit_page_length=0):
            if seen.get(r.name):
                continue
            same_date = bool(bdate) and str(r.bill_date or "") == bdate
            rkey = bill_key(r.bill_no)
            m = None
            if key and rkey:
                if key == rkey and (same_date or len(key) >= 8):
                    m = {"r": r, "hard": 1, "why": "the same bill: bill no " + str(r.bill_no or "") + ", total Rs " + str(int(round(frappe.utils.flt(r.amount))))}
                # two different bill numbers: two different bills
            if not m and same_date and ih and bits_apart(ih, r.image_hash) <= 6:
                m = {"r": r, "hard": 1, "why": "the same photo of the bill"}
            if not m and same_date and not (key and rkey) and same_vendor(vkey, vendor_key(r.vendor)):
                if r.employee == emp:
                    m = {"r": r, "hard": 1, "why": "the same vendor, date and total"}
                else:
                    m = {"r": r, "hard": 0, "why": "the same vendor, date and total"}
            if m:
                seen[r.name] = 1
                found.append(m)

    # a near-identical photo with a different total: flagged
    if ih and bdate and len(ih) == 16:
        for r in frappe.get_all("Bill Fingerprint", filters={"bill_date": bdate, "status": "Used", "image_hash": ["!=", ""], "creation": [">=", since]}, fields=cols, limit_page_length=0):
            if not seen.get(r.name) and bits_apart(ih, r.image_hash) <= 6:
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
        "amount": amount,
        "vendor": vendor,
        "bill_no": bill_no,
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
                    "content": "Bill refused (" + kind + ", " + str(bdate or "no date") + ", Rs " + str(amount) + "): " + block["text"] + " See Bill Fingerprint " + block["name"] + ".",
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
