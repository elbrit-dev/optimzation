# Server Script — Script Type: API — API Method: calendar_events
# (Allow Guest: off). Source of truth for the ERP Server Script of the same name.
#
# The calendar's events for a date range, in the GraphQL `Events` node shape the app
# already maps (see shared/calendar/.../event/graphql/events.query.js). Replaces the
# GraphQL list for the calendar because that list reads EVERY event in the range and
# runs Event's permission check (owner / public / participant subquery) on each row,
# plus a COUNT(*) over the same rows: at ~50k events a month that is ~12k rows per
# request for every user. Here the candidates come from indexed lookups of what the
# user can see at all (own, participant, public, shared with them); Frappe's normal
# get_list then applies the full permission rules (incl. user permissions) to just
# those names. Same events, a fraction of the database work.
#
# Needs these indexes (SQL Playground):
#   tabEvent (starts_on), (owner, starts_on), (event_type, starts_on)
#   tabEvent Participants (email, parent)
#
# Request: filters = JSON list of {fieldname, operator, value} on starts_on / ends_on
#          (operators GTE, GT, LTE, LT, EQ; ISO date-times), first = window size.
# Response: {"events": [node, ...], "has_more": bool}

OPERATORS = {"GTE": ">=", "GT": ">", "LTE": "<=", "LT": "<", "EQ": "="}
DATE_FIELDS = ("starts_on", "ends_on")


def enum(value):
    # A Select value as the GraphQL enum: frappe.scrub(value).upper()
    return value.replace(" ", "_").replace("-", "_").upper() if value else None


user = frappe.session.user
first = min(frappe.utils.cint(frappe.form_dict.get("first") or 2000), 20000)
raw_filters = frappe.form_dict.get("filters") or []
if isinstance(raw_filters, str):
    raw_filters = json.loads(raw_filters or "[]")

# Same as the GraphQL filter: the wall-clock value as sent, no time-zone conversion
filters = []
starts_from = "1900-01-01 00:00:00"
starts_to = "2999-12-31 23:59:59"
for f in raw_filters:
    fieldname = f.get("fieldname")
    op = OPERATORS.get(str(f.get("operator") or "").upper())
    if fieldname not in DATE_FIELDS or not op:
        frappe.throw("Unsupported filter: " + str(f))
    value = str(f.get("value") or "")[:19].replace("T", " ")
    filters.append([fieldname, op, value])
    if fieldname == "starts_on" and op in (">=", ">", "="):
        starts_from = max(starts_from, value)
    if fieldname == "starts_on" and op in ("<=", "<", "="):
        starts_to = min(starts_to, value)

# The candidate shortcut is only valid under Frappe's standard Event rule (public /
# owner / participant). Ask Frappe which conditions it applies for this user (run=0
# builds the SQL without running it): users it does not restrict (e.g. System
# Managers on some versions) or any other rule get the plain range list, exactly as
# the GraphQL list does.
rule_sql = frappe.get_list("Event", filters=[["name", "=", "-"]], fields=["name"], run=0)
standard_rule = "`tabEvent Participants` ep" in rule_sql

names = None
if user != "Administrator" and standard_rule:
    # Everything this user could see in the range: own, participant, public, shared
    names = [row[0] for row in frappe.db.sql(
        """
        select name from `tabEvent`
        where owner = %(user)s and starts_on between %(f)s and %(t)s
        union
        select p.parent from `tabEvent Participants` p
        join `tabEvent` e on e.name = p.parent
        where p.email = %(user)s and p.parenttype = 'Event'
          and e.starts_on between %(f)s and %(t)s
        union
        select name from `tabEvent`
        where event_type = 'Public' and starts_on between %(f)s and %(t)s
        union
        select s.share_name from `tabDocShare` s
        join `tabEvent` e on e.name = s.share_name
        where s.share_doctype = 'Event' and s.`read` = 1
          and (s.user = %(user)s or s.everyone = 1)
          and e.starts_on between %(f)s and %(t)s
        """,
        {"user": user, "f": starts_from, "t": starts_to},
    )]

events = []
has_more = False
if names is None or names:
    if names is not None:
        filters.append(["name", "in", names])

    fields = [
        "name", "subject", "description", "starts_on", "ends_on", "color", "all_day",
        "status", "event_type", "event_category", "custom_pob_given", "custom_role_profile",
        "custom_doctor", "custom_latitude", "custom_longitude", "custom_employee_id",
        "reference_doctype", "reference_docname", "google_meet_link",
        "custom_meeting_location", "custom_hq",
    ]
    has_other_type = frappe.get_meta("Event").has_field("custom_other_type")
    if has_other_type:
        fields.append("custom_other_type")

    # get_list applies Event's permission rules and user permissions, as the list does
    rows = frappe.get_list(
        "Event", filters=filters, fields=fields, order_by="modified desc", limit_page_length=first + 1
    )
    has_more = len(rows) > first
    rows = rows[:first]

    event_names = [r.name for r in rows]
    participants = {}
    if event_names:
        for p in frappe.get_all(
            "Event Participants",
            filters={"parent": ["in", event_names], "parenttype": "Event"},
            fields=[
                "name", "parent", "reference_doctype", "reference_docname", "custom_latitude",
                "custom_longitude", "custom_distance", "custom_visit_time", "custom_is_force_visit",
                "custom_force_visit_reason", "attending", "email", "custom_role_profile",
            ],
            order_by="idx asc",
        ):
            participants.setdefault(p.parent, []).append(
                {
                    "name": p.name,
                    "reference_doctype__name": p.reference_doctype,
                    "custom_latitude": p.custom_latitude,
                    "custom_longitude": p.custom_longitude,
                    "custom_distance": p.custom_distance,
                    "custom_visit_time": str(p.custom_visit_time)[:19] if p.custom_visit_time else None,
                    "custom_is_force_visit": p.custom_is_force_visit,
                    "custom_force_visit_reason": p.custom_force_visit_reason,
                    "reference_docname__name": p.reference_docname,
                    "attending": enum(p.attending),
                    "email": p.email,
                    "role_profile": {"name": p.custom_role_profile} if p.custom_role_profile else None,
                }
            )

    employee_ids = list(set([r.custom_employee_id for r in rows if r.custom_employee_id]))
    employees = {}
    if employee_ids:
        for emp in frappe.get_list(
            "Employee",
            filters={"name": ["in", employee_ids]},
            fields=["name", "company_email", "user_id", "first_name", "middle_name", "last_name"],
        ):
            employees[emp.name] = emp

    for r in rows:
        node = {
            "name": r.name,
            "subject": r.subject,
            "description": r.description,
            "starts_on": str(r.starts_on)[:19] if r.starts_on else None,
            "ends_on": str(r.ends_on)[:19] if r.ends_on else None,
            "color": r.color,
            "all_day": r.all_day,
            "status": enum(r.status),
            "event_type": enum(r.event_type),
            "event_category": enum(r.event_category),
            "pob_given": r.custom_pob_given,
            "role_profile": r.custom_role_profile,
            "custom_doctor__name": r.custom_doctor,
            "doctor_latitude": r.custom_latitude,
            "doctor_longitude": r.custom_longitude,
            "custom_employee_id": employees.get(r.custom_employee_id),
            "reference_doctype__name": r.reference_doctype,
            "reference_docname__name": r.reference_docname,
            "google_meet_link": r.google_meet_link,
            "custom_meeting_location": r.custom_meeting_location,
            "custom_hq__name": r.custom_hq,
            "event_participants": participants.get(r.name, []),
        }
        if has_other_type:
            node["custom_other_type"] = r.custom_other_type
        events.append(node)

frappe.response["message"] = {"events": events, "has_more": has_more}
