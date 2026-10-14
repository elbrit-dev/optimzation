# Doctor Service: SERVICE DETAILS on production, as built and tested on UAT (2026-10-14).
# Paste into ERP > System Console (type Python), logged in as a System Manager.
# 1) Run with DRY = True and "Commit" UNticked: it only prints what it would do.
# 2) Set DRY = False, tick "Commit", run again.
# Safe to re-run: anything already in place is skipped (or brought up to date).
#
# Makes:
#   - Doctor Service: custom_service_details_html (HTML "Service details") and
#     custom_service_details (JSON, hidden, read-only)
#   - Doctor Service Master: custom_capture_fields (JSON "Details to capture")
#   - the details each service asks for (EB Bill, Recharge -- new master --, EMI
#     TAKEOVER, CAR, RD 2/3/4, Jewel Chit)
#   - Client Script "Doctor Service Details View" (shows the details; "Correct
#     details" button for System Manager / MIS Admin)
#   - Server Script "Elbrit Doctor Service Fix Details" (API behind that button)
# NOT here -- paste these files by hand into their existing Server Scripts:
#   Doctor Service Guard, Elbrit Doctor Service Options, Elbrit Doctor Service List.
# Generated from the repo (share/src/app/doctor-service/server/) -- do not edit here.

DRY = True
W = "WOULD " if DRY else ""

CLIENT_JS = r'''// =====================================================================
// CLIENT SCRIPT — the source of truth for the ERP's copy. Keep in step.
//
//   Name     : Doctor Service Details View
//   DocType  : Doctor Service
//   Apply To : Form
//
// 1. Shows what the service type captured (EB number, mobile number, loan
//    number...) from custom_service_details, a JSON list of
//    [{key, label, values}], in the "Service details" HTML field
//    (custom_service_details_html). Which details a service asks for is set
//    on its Doctor Service Master (custom_capture_fields); the app writes them.
// 2. "Correct details" button (FIX_ROLES only): edits just those details,
//    even after the service is in approval or approved, through the
//    elbrit_doctor_service_fix_details API script (which re-checks the role
//    and the rules, and leaves an audit comment). Nothing else on the
//    service changes.
// =====================================================================
var FIX_ROLES = ['System Manager', 'MIS Admin'];

frappe.ui.form.on('Doctor Service', {
  refresh(frm) {
    render_service_details(frm);
    add_fix_button(frm);
  },
  custom_service_details(frm) { render_service_details(frm); },
});

function service_details(frm) {
  try {
    const raw = frm.doc.custom_service_details;
    const rows = typeof raw === 'string' ? JSON.parse(raw || '[]') : (raw || []);
    return Array.isArray(rows) ? rows : [];
  } catch (e) { return []; }
}

function render_service_details(frm) {
  const field = frm.get_field('custom_service_details_html');
  if (!field) return;
  const rows = service_details(frm).filter((r) => r && (r.values || []).some((v) => String(v || '').trim()));
  if (!rows.length) { field.$wrapper.html(''); return; }
  const esc = frappe.utils.escape_html;
  const body = rows.map((r) => {
    const vals = (r.values || []).map((v) => String(v || '').trim()).filter(Boolean)
      .map((v) => `<span style="display:inline-block;padding:2px 10px;margin:2px 6px 2px 0;border-radius:12px;background:var(--bg-blue,#EAF1FF);color:var(--text-color);font-family:var(--font-stack-monospace,monospace);font-size:12px">${esc(v)}</span>`).join('');
    return `<tr><td style="padding:6px 12px 6px 0;color:var(--text-muted);white-space:nowrap;vertical-align:top">${esc(r.label || r.key || '')}</td><td style="padding:4px 0">${vals}</td></tr>`;
  }).join('');
  field.$wrapper.html(`<div style="margin:4px 0 12px"><div style="font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:4px">${esc(__('Service details'))}</div><table style="border-collapse:collapse">${body}</table></div>`);
}

async function add_fix_button(frm) {
  if (frm.is_new() || !frm.doc.service_name) return;
  if (!FIX_ROLES.some((r) => frappe.user.has_role(r))) return;
  let capture = [];
  try {
    const r = await frappe.db.get_value('Doctor Service Master', frm.doc.service_name, 'custom_capture_fields');
    const raw = r && r.message && r.message.custom_capture_fields;
    capture = typeof raw === 'string' ? JSON.parse(raw || '[]') : (raw || []);
  } catch (e) { capture = []; }
  capture = (Array.isArray(capture) ? capture : []).filter((c) => c && c.key);
  if (!capture.length) return;

  frm.add_custom_button(__('Correct details'), () => {
    const now = {};
    service_details(frm).forEach((d) => { if (d && d.key) now[d.key] = d.values || []; });
    const d = new frappe.ui.Dialog({
      title: __('Correct service details'),
      fields: [
        { fieldtype: 'HTML', options: `<p class="text-muted small">${__('Only these details change. The amount, service, doctor and the approval stay as they are. The change is recorded on the service.')}</p>` },
        ...capture.map((c) => ({
          fieldname: c.key,
          label: c.label || c.key,
          fieldtype: c.multi ? 'Small Text' : 'Data',
          reqd: c.required === 0 ? 0 : 1,
          description: c.multi ? __('One per line') : '',
          default: (now[c.key] || []).join('\n'),
        })),
      ],
      primary_action_label: __('Save details'),
      primary_action(values) {
        const details = {};
        capture.forEach((c) => {
          details[c.key] = String(values[c.key] || '').split('\n').map((s) => s.trim()).filter(Boolean);
        });
        frappe.call({
          method: 'elbrit_doctor_service_fix_details',
          args: { name: frm.doc.name, details: JSON.stringify(details) },
          freeze: true,
          callback(r) {
            d.hide();
            const m = r.message || {};
            frappe.show_alert({ message: m.changed ? __('Service details corrected') : __('No change'), indicator: m.changed ? 'green' : 'blue' });
            frm.reload_doc();
          },
        });
      },
    });
    d.show();
  });
}
'''

FIX_PY = r'''# =====================================================================
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
'''

# 1. Custom fields
FIELDS = [
    {"dt": "Doctor Service", "fieldname": "custom_service_details_html", "label": "Service details",
     "fieldtype": "HTML", "insert_after": "remarks",
     "description": "Rendered from custom_service_details by the 'Doctor Service Details View' client script."},
    {"dt": "Doctor Service", "fieldname": "custom_service_details", "label": "Service details (data)",
     "fieldtype": "JSON", "insert_after": "custom_service_details_html", "hidden": 1, "read_only": 1,
     "description": "What the service type asks for (EB number, mobile number, loan number...), as [{key, label, values}]. Written by the app; shown above."},
    {"dt": "Doctor Service Master", "fieldname": "custom_capture_fields", "label": "Details to capture",
     "fieldtype": "JSON", "insert_after": "service_name",
     "description": "The details the app asks for on this service, as [{\"key\": \"eb_number\", \"label\": \"EB service number\", \"multi\": 1}]. multi = more than one value allowed. Leave empty to ask for nothing."},
]
for f in FIELDS:
    if frappe.db.exists("Custom Field", f["dt"] + "-" + f["fieldname"]):
        print("ok: field " + f["dt"] + "." + f["fieldname"])
    else:
        print(W + "add field " + f["dt"] + "." + f["fieldname"] + " (" + f["fieldtype"] + ")")
        if not DRY:
            d = {"doctype": "Custom Field"}
            d.update(f)
            frappe.get_doc(d).insert(ignore_permissions=True)

# 2. What each service asks for
CAPTURE = {
    "EB Bill": [{"key": "eb_number", "label": "EB service number", "multi": 1, "required": 1}],
    "Recharge": [{"key": "mobile", "label": "Mobile number", "multi": 1, "required": 1}],
    "EMI TAKEOVER": [{"key": "loan_number", "label": "Loan / EMI account number", "multi": 1, "required": 1},
                     {"key": "lender", "label": "Bank / lender", "multi": 0, "required": 0}],
    "CAR": [{"key": "loan_number", "label": "Car loan account number", "multi": 0, "required": 1},
            {"key": "lender", "label": "Bank / lender", "multi": 0, "required": 0}],
    "RD 2": [{"key": "rd_number", "label": "RD account number", "multi": 0, "required": 1}],
    "RD 3": [{"key": "rd_number", "label": "RD account number", "multi": 0, "required": 1}],
    "RD 4": [{"key": "rd_number", "label": "RD account number", "multi": 0, "required": 1}],
    "Jewel Chit": [{"key": "chit_number", "label": "Chit number", "multi": 0, "required": 1}],
}
field_ready = frappe.db.exists("Custom Field", "Doctor Service Master-custom_capture_fields")
for svc in CAPTURE:
    want = json.dumps(CAPTURE[svc])
    if not frappe.db.exists("Doctor Service Master", svc):
        print(W + "create Doctor Service Master " + svc + " with its details")
        if not DRY:
            frappe.get_doc({"doctype": "Doctor Service Master", "service_name": svc, "name": svc,
                            "custom_capture_fields": want}).insert(ignore_permissions=True)
        continue
    have = frappe.db.get_value("Doctor Service Master", svc, "custom_capture_fields") if field_ready else None
    if have and json.dumps(json.loads(have)) == want:
        print("ok: " + svc + " details")
    else:
        print(W + "set " + svc + " details: " + ", ".join([c["label"] for c in CAPTURE[svc]]))
        if not DRY:
            frappe.db.set_value("Doctor Service Master", svc, "custom_capture_fields", want)

# 3. Client Script
CS = "Doctor Service Details View"
if frappe.db.exists("Client Script", CS):
    cs = frappe.get_doc("Client Script", CS)
    if (cs.script or "").strip() == CLIENT_JS.strip() and cs.enabled:
        print("ok: client script " + CS)
    else:
        print(W + "update client script " + CS)
        if not DRY:
            cs.script = CLIENT_JS
            cs.enabled = 1
            cs.save(ignore_permissions=True)
else:
    print(W + "create client script " + CS)
    if not DRY:
        frappe.get_doc({"doctype": "Client Script", "name": CS, "dt": "Doctor Service", "view": "Form",
                        "enabled": 1, "script": CLIENT_JS}).insert(ignore_permissions=True)

# 4. Server Script behind "Correct details"
SS = "Elbrit Doctor Service Fix Details"
if frappe.db.exists("Server Script", SS):
    ss = frappe.get_doc("Server Script", SS)
    if (ss.script or "").strip() == FIX_PY.strip() and not ss.disabled:
        print("ok: server script " + SS)
    else:
        print(W + "update server script " + SS)
        if not DRY:
            ss.script = FIX_PY
            ss.disabled = 0
            ss.save(ignore_permissions=True)
else:
    print(W + "create server script " + SS + " (API elbrit_doctor_service_fix_details)")
    if not DRY:
        frappe.get_doc({"doctype": "Server Script", "name": SS, "script_type": "API",
                        "api_method": "elbrit_doctor_service_fix_details", "allow_guest": 0, "disabled": 0,
                        "script": FIX_PY}).insert(ignore_permissions=True)

print("DRY RUN done: nothing changed. Set DRY = False, tick Commit, run again." if DRY
      else "Done. Now paste Doctor Service Guard / Options / List from the repo, then reload the desk.")
