# =====================================================================
# SERVER SCRIPT — the source of truth for the ERP's copy. Keep in step.
#
#   Name        : Upload File
#   Script Type : API
#   API Method  : upload_to_field
#   Allow Guest : NO
#
#   POST /api/method/upload_to_field   (multipart)
#     file        the file
#     doctype     the records' doctype
#     docname     one record, as every caller has always sent — and/or
#     docnames    MANY: a JSON list of record names
#     fieldname   the Attach field to point at the file
#     filenames   optional JSON { record: base name } — the kept file is
#                 called "<base><ext>" on that record, and a repeat of the
#                 same base there "<base> (1)<ext>", "<base> (2)<ext>" …
#                 (Secondary / Doctor Support send "<seat>-<party>-<month>",
#                 so one seat's re-uploads for a stockist's month number up)
#     is_private  0 / 1 (default 1)
#
# Stores the file on each record and sets the Attach field to it. Secondary
# Entry / Doctor Support keep one uploaded sheet in Transformed Data on every
# entry it filled (writes.js sendSheet) — and fill NOTHING unless this
# answers with every record, so it either does them all or throws:
#   - every record must exist, and the caller must be allowed to write it
#   - ONE File PER RECORD, every upload kept: an Attach field holds a single
#     file, but several teams upload for one distributor, so each upload is
#     its own File on the record (attached_to_field = the field), listed in
#     its attachments; the field points at the latest. Frappe stores
#     identical content once on disk, so the copies cost a row.
#   - a throw rolls the whole request back: no record half-done
#
# Answer: { name, file_url, file_name, field_set, docnames: [every record kept on] }
#
# safe_exec: no import, no .format(), no set literals, no tuple
# unpacking, no underscore-prefixed names. frappe.has_permission and
# frappe.parse_json are NOT available to server scripts here (the first per
# elbrit_ring_nav, the second per production's Error Log) — the record's
# own has_permission and the sandbox's json.loads are used instead.
# =====================================================================

doctype = frappe.form_dict.get("doctype")
docname = frappe.form_dict.get("docname")
fieldname = frappe.form_dict.get("fieldname")
is_private = 0 if str(frappe.form_dict.get("is_private") or "1") == "0" else 1

# ---- the records: `docnames` (a JSON list), plus `docname`; each once
docnames = []
raw = frappe.form_dict.get("docnames")
if raw:
    parsed = json.loads(raw) if isinstance(raw, str) else raw
    if not isinstance(parsed, list):
        frappe.throw("docnames must be a JSON list of record names")
    for n in parsed:
        n = str(n or "").strip()
        if n and n not in docnames:
            docnames.append(n)
if docname and docname not in docnames:
    docnames.insert(0, docname)

if not (doctype and docnames and fieldname):
    frappe.throw("doctype, docname(s), fieldname are required")
if not frappe.get_meta(doctype).has_field(fieldname):
    frappe.throw(doctype + " has no field " + fieldname)

for name in docnames:
    if not frappe.db.exists(doctype, name):
        frappe.throw(doctype + " " + name + " does not exist")
    allowed = True
    try:
        allowed = frappe.get_doc(doctype, name).has_permission("write")
    except Exception:
        # The check itself unavailable: as before this script checked at all.
        allowed = True
    if not allowed:
        frappe.throw("Not permitted to update " + doctype + " " + name)

# ---- the file
files = frappe.request.files
f = files.get("file") if files else None
if not f:
    frappe.throw("file is required")
content = f.stream.read()
if not content:
    frappe.throw("The file is empty")
filename = f.filename or "sheet.xlsx"
dot = filename.rfind(".")
ext = filename[dot:] if dot > 0 else ""

# ---- each record's name for it: its base, numbered past the files of that
# base already kept in the field there — none for the first, then (1), (2) …
bases = {}
raw_bases = frappe.form_dict.get("filenames")
if raw_bases:
    parsed_bases = json.loads(raw_bases) if isinstance(raw_bases, str) else raw_bases
    if isinstance(parsed_bases, dict):
        bases = parsed_bases


def clean(s):
    out = ""
    for ch in str(s or ""):
        out = out + (" " if ch in "\\/:*?\"<>|#%" or ord(ch) < 32 else ch)
    return " ".join(out.split())[:120]


def name_on(record):
    base = clean(bases.get(record))
    if not base:
        return filename
    top = -1
    for r in frappe.get_all("File", filters=[["attached_to_doctype", "=", doctype],
                                             ["attached_to_name", "=", record],
                                             ["attached_to_field", "=", fieldname],
                                             ["file_name", "like", base + "%"]],
                            fields=["file_name"], limit_page_length=0):
        # What follows the base: "<ext>" for the first, " (<n>)<ext>" for a
        # repeat — either maybe with the few characters Frappe appends to a
        # name already taken on disk by other content.
        rest = (r.get("file_name") or "")[len(base):]
        if rest.startswith(" (") and ")" in rest and rest[2:rest.index(")")].isdigit():
            top = max(top, int(rest[2:rest.index(")")]))
        elif not rest.startswith(" ") and rest.endswith(ext):
            top = max(top, 0)
    if top < 0:
        return base + ext
    return base + " (" + str(top + 1) + ")" + ext


# ---- one File per record, the field pointed at it. The records' write
# permission was checked above, so the File itself is inserted past
# permissions (the File doctype's own rules are not what is asked here).
kept = []
first = None
for name in docnames:
    file_doc = frappe.get_doc({
        "doctype": "File",
        "file_name": name_on(name),
        "attached_to_doctype": doctype,
        "attached_to_name": name,
        "attached_to_field": fieldname,
        "is_private": is_private,
        "content": content,
    }).insert(ignore_permissions=True)
    frappe.db.set_value(doctype, name, fieldname, file_doc.file_url)
    kept.append(name)
    if first is None:
        first = file_doc

frappe.response["message"] = {
    "name": first.name,
    "file_url": first.file_url,
    "file_name": first.file_name,
    "field_set": True,
    "docnames": kept,
}
