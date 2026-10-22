# Server Script: Elbrit Backdate Windows
#   Script Type: API    API Method: elbrit_backdate_windows    Allow Guest: off
#
# KEEP THIS SCRIPT DISABLED unless past entry is needed. Disabled = no past
# day opens for anyone. To give access: add a window below, then enable it.
# When done, disable it again (an ended "until" also closes a window).
#
# WHAT IT DOES
#   Lets chosen users enter DR visits, Leave and/or Other Work for chosen
#   PAST days. The app asks this script which past days the logged-in user may
#   use, and for which types; those days open up in that form's date picker.
#   A DR visit entered on such a day is a normal visit (no 500 m force-visit
#   check) and the "Event Backdate Stamp" script saves the reason below on it.
#   Users never see the reason. Leave still goes through its normal approval;
#   Other Work on a past day is saved Completed.
#
# HOW TO OPEN ACCESS — edit only the list in WINDOWS_JSON:
#   from, to     the past days to open (yyyy-mm-dd, both included)
#   types        what may be entered on those days, any of
#                "DR Visit", "Leave", "Other Work"; left out = "DR Visit" only
#   until        last day the access stays open (required; closes by itself)
#   departments  Role Profile department names; [] = every department
#   employees    Employee ids, e.g. "E00869";   [] = every employee
#   reason       saved on the visit, never shown to the user
#
#   Example:
#   [
#     {"from": "2026-10-01", "to": "2026-10-10", "until": "2026-10-22",
#      "types": ["DR Visit", "Leave", "Other Work"],
#      "departments": ["Aura & Proxima Chennai - ELPL"], "employees": [],
#      "reason": "Backdated due to pending entries"}
#   ]
#
#   Keep the WINDOWS_JSON line as it is: "Event Backdate Stamp" reads the
#   list straight out of this script. Empty list or disabled script = closed.
#   The windows only work while this script is ENABLED.
#
# REPLY: {"windows": [{"from": "...", "to": "...", "types": [...]}], "today": "yyyy-mm-dd"}
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
        open_windows.append({"from": w.get("from"), "to": last_day,
                             "types": w.get("types") or ["DR Visit"]})

frappe.response["message"] = {"windows": open_windows, "today": today}
