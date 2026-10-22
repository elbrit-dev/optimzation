# Server Script: Event Backdate Stamp
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
