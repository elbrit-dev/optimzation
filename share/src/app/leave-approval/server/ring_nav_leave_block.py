# ---------------------------------------------------------------- LEAVE
# Leave approvals (/leave/approval): the Open Leave Applications waiting on
# the caller -- as their approver (leave_approver), or as the next level
# (custom_escalation_approver) once a leave has waited LEAVE_ESCALATE_AFTER
# days or has already started. The same rule as the app's Leave Approval
# screen (leave-approval/data/shape.js) -- change both.
#   badge     how many wait on the caller
#   caption   "Today" when one has started, else the soonest first day
#   ring      started (red) / in the next LEAVE_SOON_DAYS days (amber) / later
# For now ONLY the IT department gets it (LEAVE_DEPARTMENTS); set
# LEAVE_TILE_FOR_ALL = True to give it to every approver with work waiting.
HREFS["leave-approval"] = "/leave/approval"
LEAVE_TILE_FOR_ALL = False
LEAVE_DEPARTMENTS = ["IT - ELPL"]
LEAVE_ESCALATE_AFTER = 2
LEAVE_SOON_DAYS = 3


def leave_tile():
    leave_team = bool(frappe.db.get_value(
        "Employee", {"user_id": me, "status": "Active", "department": ["in", LEAVE_DEPARTMENTS]}, "name"))
    if not (LEAVE_TILE_FOR_ALL or leave_team):
        return
    fields = ["name", "from_date", "posting_date", "leave_approver"]
    rows = frappe.get_all("Leave Application", filters=[["status", "=", "Open"], ["docstatus", "=", 0],
                                                        ["leave_approver", "=", me]],
                          fields=fields, limit_page_length=0)
    for r in frappe.get_all("Leave Application", filters=[["status", "=", "Open"], ["docstatus", "=", 0],
                                                          ["custom_escalation_approver", "=", me],
                                                          ["leave_approver", "!=", me]],
                            fields=fields, limit_page_length=0):
        waited = frappe.utils.date_diff(today, r.get("posting_date")) if r.get("posting_date") else 0
        if waited >= LEAVE_ESCALATE_AFTER or str(r.get("from_date")) <= today:
            rows.append(r)
    started = 0
    soon = 0
    later = 0
    first = ""
    for r in rows:
        f = str(r.get("from_date") or "")
        if not f:
            continue
        if not first or f < first:
            first = f
        ahead = frappe.utils.date_diff(f, today)
        if ahead <= 0:
            started = started + 1
        elif ahead <= LEAVE_SOON_DAYS:
            soon = soon + 1
        else:
            later = later + 1
    waiting = started + soon + later
    if not waiting and not leave_team:
        return
    caption = "Clear"
    tone = "success"
    if started:
        caption = "Today"
        tone = "danger"
    elif waiting:
        caption = str(int(first[8:10])) + " " + MONTHS[int(first[5:7]) - 1]
        tone = "warning"
    segments = []
    if started:
        segments.append({"key": "started", "value": started, "tone": "danger", "label": "Starts today or already started"})
    if soon:
        segments.append({"key": "soon", "value": soon, "tone": "warning", "label": "In the next " + str(LEAVE_SOON_DAYS) + " days"})
    if later:
        segments.append({"key": "later", "value": later, "tone": "neutral", "label": "Later"})
    if not segments:
        segments = [{"key": "clear", "value": 1, "tone": "success", "label": "Nothing pending"}]
    items.append({
        "id": "leave-approval",
        "label": "Leave",
        "href": HREFS["leave-approval"],
        "icon": "calendar-minus",
        "statusIcon": "check-square",
        "statusTone": "neutral",
        "count": waiting,
        "caption": caption,
        "captionTone": tone,
        "segments": segments,
    })


try:
    leave_tile()
except Exception as err:
    frappe.log_error(title="Elbrit Ring Nav: leave tile", message=str(err))

