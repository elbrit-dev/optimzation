# SYSTEM CONSOLE — installs backdated DR visits on this ERP site.
# Desk > System Console: paste all of this, tick "Commit", click Execute.
# WITHOUT "Commit" it still prints "Created ..." but only the field is kept
# (adding a column saves itself); the two scripts are rolled back. Check
# Server Script list afterwards.
# Safe to run again: it updates what already exists. It only CREATES the
# field / scripts or replaces their code; it never touches any Event.
#
# DEFAULTS: "Elbrit Backdate Windows" is created DISABLED (no past entry for
# anyone); "Event Backdate Stamp" is created ENABLED and should stay so.
# Re-running keeps each script's current enabled/disabled state.
#
# NOTE: re-running OVERWRITES the "Elbrit Backdate Windows" code, so any
# windows already added to its WINDOWS_JSON go back to the empty list below.
#
# Generated from erp/server-scripts/backdate_windows.py and
# event_backdate_stamp.py — regenerate rather than hand-edit the code here.

API_SCRIPT = r'''# Server Script: Elbrit Backdate Windows
#   Script Type: API    API Method: elbrit_backdate_windows    Allow Guest: off
#
# KEEP THIS SCRIPT DISABLED unless past entry is needed. Disabled = no past
# day opens for anyone. To give access: add a window below, then enable it.
# When done, disable it again (an ended "until" also closes a window).
#
# WHAT IT DOES
#   Lets chosen users enter DR visits for chosen PAST days. The app asks this
#   script which past days the logged-in user may use; those days open up in
#   the DR date picker. A visit entered on such a day is a normal visit (no
#   500 m force-visit check) and the "Event Backdate Stamp" script saves the
#   reason below on it. Users never see the reason.
#
# HOW TO OPEN ACCESS — edit only the list in WINDOWS_JSON:
#   from, to     the past days to open (yyyy-mm-dd, both included)
#   until        last day the access stays open (required; closes by itself)
#   departments  Role Profile department names; [] = every department
#   employees    Employee ids, e.g. "E00869";   [] = every employee
#   reason       saved on the visit, never shown to the user
#
#   Example:
#   [
#     {"from": "2026-10-01", "to": "2026-10-10", "until": "2026-10-22",
#      "departments": ["Aura & Proxima Chennai - ELPL"], "employees": [],
#      "reason": "Backdated due to pending entries"}
#   ]
#
#   Keep the WINDOWS_JSON line as it is: "Event Backdate Stamp" reads the
#   list straight out of this script. Empty list or disabled script = closed.
#   The windows only work while this script is ENABLED.
#
# REPLY: {"windows": [{"from": "...", "to": "..."}], "today": "yyyy-mm-dd"}
#   Only this user's open windows, cut off at yesterday. No reasons.

WINDOWS_JSON = """
[
]
"""

today = frappe.utils.nowdate()
yesterday = str(frappe.utils.add_days(today, -1))

# Who is asking: their active Employee and that seat's department
emp = frappe.db.get_value("Employee", {"user_id": frappe.session.user, "status": "Active"},
                          ["name", "custom_role_profile"], as_dict=True) or {}
emp_id = emp.get("name") or ""
dept = ""
if emp.get("custom_role_profile"):
    dept = frappe.db.get_value("Role Profile", emp.get("custom_role_profile"), "custom_department") or ""

open_windows = []
for w in json.loads(WINDOWS_JSON) or []:
    if not (w.get("from") and w.get("to") and w.get("until")):
        continue                                   # incomplete entry
    if today > w.get("until"):
        continue                                   # access has ended
    if w.get("departments") and dept not in w.get("departments"):
        continue                                   # not their department
    if w.get("employees") and emp_id not in w.get("employees"):
        continue                                   # not them
    last_day = min(w.get("to"), yesterday)         # never today or later
    if w.get("from") <= last_day:
        open_windows.append({"from": w.get("from"), "to": last_day})

frappe.response["message"] = {"windows": open_windows, "today": today}
'''

STAMP_SCRIPT = r'''# Server Script: Event Backdate Stamp
#   Script Type: DocType Event    Reference DocType: Event    Event: Before Save
#
# WHAT IT DOES
#   When a DR visit is marked AFTER its planned day, inside an open window of
#   "Elbrit Backdate Windows", it saves the visit as a NORMAL visit:
#     - force visit tick off, force visit reason empty
#     - the window's reason in custom_backdate_reason (hidden from users)
#     - visit time and the event's end moved onto the planned day (same clock
#       time), so the visit doesn't stretch from that day to today
#   Visits marked on their own day are never touched, so real force visits
#   keep their tick and their visible reason.
#
#   It also keeps an existing backdate reason when the app re-saves the event
#   (POB, join), because the app's rows don't send that field.
#
#   It never blocks a save.
#
# KEEP THIS SCRIPT ENABLED. With "Elbrit Backdate Windows" disabled it does
# nothing (no windows, no database reads), but switching it off would let
# later app saves blank the reasons already saved on backdated visits.
# Open/close past entry with the "Elbrit Backdate Windows" script only.
#
# NOTE: in a DocType Event script, functions can't see top-level variables,
# so the one function below uses only its own values.


def load_windows():
    # The window list lives in the "Elbrit Backdate Windows" script.
    src = frappe.db.get_value("Server Script", "Elbrit Backdate Windows",
                              ["script", "disabled"], as_dict=True)
    if not src or src.get("disabled"):
        return []
    text = src.get("script") or ""
    marker = '\nWINDOWS_JSON = """'
    start = text.find(marker)
    if start < 0:
        return []
    start = start + len(marker)
    end = text.find('"""', start)
    try:
        return json.loads(text[start:end]) or []
    except Exception:
        return []


if doc.event_category == "Doctor Visit plan":
    rows = [p for p in (doc.get("event_participants") or []) if p.reference_doctype == "Employee"]

    # 1. Keep reasons already saved (the app re-sends rows without them).
    old = doc.get_doc_before_save()
    if old:
        saved = {}
        for p in old.get("event_participants") or []:
            if p.get("custom_backdate_reason"):
                saved[p.reference_docname] = p.get("custom_backdate_reason")
        for p in rows:
            if not p.get("custom_backdate_reason") and saved.get(p.reference_docname):
                p.custom_backdate_reason = saved.get(p.reference_docname)

    # 2. Stamp rows marked visited on a later day than the plan.
    day = str(doc.starts_on or "")[:10]
    today = frappe.utils.nowdate()
    to_stamp = []
    if day and day < today:
        for p in rows:
            visit_time = str(p.get("custom_visit_time") or "")
            if (str(p.get("attending") or "").lower() == "yes"
                    and not p.get("custom_backdate_reason")
                    and visit_time[:10] > day):
                to_stamp.append(p)

    windows = load_windows() if to_stamp else []
    latest = ""
    for p in to_stamp:
        seat = p.get("custom_role_profile") or frappe.db.get_value(
            "Employee", p.reference_docname, "custom_role_profile")
        dept = frappe.db.get_value("Role Profile", seat, "custom_department") if seat else ""

        match = None
        for w in windows:
            if not (w.get("from") and w.get("to") and w.get("until")):
                continue
            if today > w.get("until") or not (w.get("from") <= day <= w.get("to")):
                continue
            if w.get("departments") and dept not in w.get("departments"):
                continue
            if w.get("employees") and p.reference_docname not in w.get("employees"):
                continue
            match = w
            break
        if not match:
            continue

        p.custom_is_force_visit = 0
        p.custom_force_visit_reason = ""
        p.custom_backdate_reason = match.get("reason") or "Backdated entry"
        p.custom_visit_time = day + str(p.custom_visit_time)[10:]
        latest = max(latest, p.custom_visit_time)

    # Event ends on the planned day too, never before it starts.
    if latest and str(doc.ends_on or "")[:10] > day:
        doc.ends_on = max(latest, str(doc.starts_on))
'''

# 1. Hidden reason field on the visit row (the app never reads it)
if frappe.db.exists("Custom Field", "Event Participants-custom_backdate_reason"):
    print("Custom Field already there: Event Participants-custom_backdate_reason")
else:
    frappe.get_doc({
        "doctype": "Custom Field",
        "dt": "Event Participants",
        "fieldname": "custom_backdate_reason",
        "label": "Backdate Reason",
        "fieldtype": "Small Text",
        "insert_after": "custom_force_visit_reason",
        "read_only": 1,
        "description": "Set by the Event Backdate Stamp server script for a DR visit entered inside a backdate window. Not shown in the app.",
    }).insert()
    print("Created Custom Field: Event Participants-custom_backdate_reason")

# 2 + 3. The two server scripts (created, or their code replaced)
scripts = [
    # past entry closed until someone enables this script
    {"name": "Elbrit Backdate Windows", "script_type": "API",
     "api_method": "elbrit_backdate_windows", "allow_guest": 0,
     "script": API_SCRIPT, "new_disabled": 1},
    # always on: does nothing while the windows script is disabled
    {"name": "Event Backdate Stamp", "script_type": "DocType Event",
     "reference_doctype": "Event", "doctype_event": "Before Save",
     "script": STAMP_SCRIPT, "new_disabled": 0},
]
for s in scripts:
    new_disabled = s.pop("new_disabled")
    if frappe.db.exists("Server Script", s["name"]):
        # code replaced; enabled/disabled left as it is
        d = frappe.get_doc("Server Script", s["name"])
        d.update(s)
        d.save()
        print("Updated Server Script: " + s["name"] + (" (disabled)" if d.disabled else " (enabled)"))
    else:
        s["doctype"] = "Server Script"
        s["disabled"] = new_disabled
        frappe.get_doc(s).insert()
        print("Created Server Script: " + s["name"] + (" (disabled)" if new_disabled else " (enabled)"))

print("Done. To open past entry: add a window to WINDOWS_JSON in 'Elbrit Backdate Windows' and enable it.")
