# =====================================================================
# SERVER SCRIPT — the source of truth for the ERP's copy. Keep in step.
#
#   Name        : Elbrit Doctor Service Fix Details
#   Script Type : API
#   API Method  : elbrit_doctor_service_fix_details
#   Allow Guest : NO
#
#   POST /api/method/elbrit_doctor_service_fix_details
#        name=<Doctor Service>  details={"eb_number": ["04-123", "05-777"], ...}
#
# Corrects a service's captured details (EB number, mobile number, loan
# number...) AFTER it is in approval or approved -- the "Correct details"
# button on the desk form (client script "Doctor Service Details View").
# The Before Save guard locks a service's content once it is in approval, so
# this writes the one field directly; nothing else on the service can change
# here (amount, service, doctor... stay locked).
#
# WHO: FIX_ROLES only (System Manager, MIS Admin) -- anyone else is refused.
# RULES: the same as the guard's -- only the keys the service's master asks
# for (Doctor Service Master.custom_capture_fields), values trimmed and
# de-duplicated, one value where the field takes one, a required one must
# be there.
# AUDIT: a comment on the service, "Service details corrected by <user>:
# EB service number 04-123 -> 05-777", which the app's activity shows too.
# The doctor's next service fills in the corrected value.
#
# safe_exec: no import, no .format(), no set literals, no tuple
# unpacking, no underscore-prefixed names.
# =====================================================================

FIX_ROLES = ["System Manager", "MIS Admin"]
DT = "Doctor Service"


def as_list(raw):
    if not raw:
        return []
    if isinstance(raw, list):
        return raw
    try:
        v = json.loads(raw)
    except Exception:
        return []
    return v if isinstance(v, list) else []


user = frappe.session.user
roles = frappe.get_all("Has Role", filters={"parent": user, "parenttype": "User"}, pluck="role")
allowed = user == "Administrator"
for r in FIX_ROLES:
    if r in roles:
        allowed = True
if not allowed:
    frappe.throw("Only " + " / ".join(FIX_ROLES) + " can correct a service's details.")

name = str(frappe.form_dict.get("name") or "").strip()
row = frappe.db.get_value(DT, name, ["name", "service_name", "custom_service_details"], as_dict=True) if name else None
if not row:
    frappe.throw("No such Doctor Service: " + name)

capture = []
if frappe.get_meta("Doctor Service Master").has_field("custom_capture_fields"):
    capture = as_list(frappe.db.get_value("Doctor Service Master", row.get("service_name"), "custom_capture_fields"))
if not capture:
    frappe.throw(str(row.get("service_name")) + " asks for no details.")

raw = frappe.form_dict.get("details") or "{}"
try:
    given = json.loads(raw) if not isinstance(raw, dict) else raw
except Exception:
    given = {}
if not isinstance(given, dict):
    given = {}

kept = []
for f in capture:
    if not isinstance(f, dict) or not str(f.get("key") or "").strip():
        continue
    key = str(f.get("key")).strip()
    label = str(f.get("label") or key).strip()
    vals = []
    got = given.get(key) or []
    if not isinstance(got, list):
        got = str(got).split("\n")
    for v in got:
        v = str(v or "").strip()
        if v and v not in vals:
            vals.append(v)
    if not f.get("multi"):
        vals = vals[:1]
    if not vals and f.get("required") != 0:
        frappe.throw("Add the " + label + ".")
    if vals:
        kept.append({"key": key, "label": label, "values": vals})

# What changed, for the audit comment.
before = {}
for d in as_list(row.get("custom_service_details")):
    if isinstance(d, dict) and d.get("key"):
        before[str(d.get("key"))] = d.get("values") or []
changes = []
for d in kept:
    old = before.get(d["key"]) or []
    if old != d["values"]:
        changes.append(d["label"] + ": " + (", ".join(old) or "none") + " -> " + ", ".join(d["values"]))
for f in capture:
    key = str((f or {}).get("key") or "")
    has_now = False
    for d in kept:
        if d["key"] == key:
            has_now = True
    if key and before.get(key) and not has_now:
        changes.append(str(f.get("label") or key) + ": " + ", ".join(before[key]) + " -> none")

if not changes:
    frappe.response["message"] = {"changed": False, "details": kept}
else:
    frappe.db.set_value(DT, name, "custom_service_details", json.dumps(kept) if kept else None)
    who = frappe.db.get_value("User", user, "full_name") or user
    frappe.get_doc(DT, name).add_comment("Comment", "Service details corrected by " + who + ": " + "; ".join(changes))
    frappe.response["message"] = {"changed": True, "details": kept, "changes": changes}
