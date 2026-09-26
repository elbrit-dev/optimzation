# =====================================================================
# SERVER SCRIPT — the source of truth for the ERP's copy. Keep in step.
#
#   Name        : Elbrit Visit Summary
#   Script Type : API
#   API Method  : elbrit_visit_summary
#   Allow Guest : NO
#
#   POST /api/method/elbrit_visit_summary
#     { "from": "2026-08-01", "to": "2026-08-31",
#       "sales": [["E00869", "vignesh869.be@elbrit.org"], ...] }
#
# The Visit report's visits for a window, COUNTED HERE instead of sent as
# rows: a month is ~55,000 visits on production (~38 MB as rows); as counts
# it is a few thousand lines. READ-ONLY, AS THE TOKEN'S USER — the Events
# come from frappe.get_list, so the ERP's own permissions decide which.
#
# ONE COUNT per (person, planned day, event HQ, status, joint, hour):
#   rows: [[e, d, h, s, j, hr, n], ...] indexing employees / days / hqs
#     s   0 pending (no visit time), 1 verified (done, not forced),
#         2 forced (done and forced) — a force flag on a pending visit is
#         ignored, as the app ignores it
#     j   1 when the Event had more than one distinct participant
#     hr  the visit's hour 0-23; -1 for pending, and for a done visit whose
#         time has no readable hour (it still counts as done, but sits in
#         no bar of the hourly chart — as the app's chartHourOf does)
#     n   how many visits the line stands for
#
# THE SAME RULES AS THE APP (src/app/visit/data/liveSource.js), so the
# counts equal what it computed from the rows:
#   - one visit per PARTICIPANT row; an Event with none is one visit
#   - Doctor Visit plan events, starts_on within the window (inclusive)
#   - participantCount = distinct non-blank references + each blank one,
#     at least 1, off the whole Event
#   - attributed to the participant when they are in the Sales roster
#     (\`sales\`, the ids and login emails the app already worked out — sent
#     so the rule "who is Sales" lives in one place), by Employee id or by
#     User login email; else to the plan owner (Event.custom_employee_id)
#   - planned day = the first 10 characters of starts_on, the hour = the
#     characters 11-12 of the visit time, both as the ERP stores them
#
# safe_exec: no import, no .format(), no set literals, no tuple
# unpacking, no underscore-prefixed names.
# =====================================================================

PARTS = "`tabEvent Participants`"


def valid_date(d):
    if not d or len(d) != 10 or d[4] != "-" or d[7] != "-":
        return False
    return d[:4].isdigit() and d[5:7].isdigit() and d[8:].isdigit()


def hour_of(visit_time):
    # As the app reads it: Number(visitTime.slice(11, 13)), kept only when a
    # whole hour 0-23. JS reads an empty slice as 0.
    t = (visit_time or "")[11:13].strip()
    if t == "":
        return 0
    if not t.isdigit():
        return -1
    v = int(t)
    if v < 0 or v > 23:
        return -1
    return v


body = frappe.form_dict
date_from = body.get("from") or ""
date_to = body.get("to") or ""
if not (valid_date(date_from) and valid_date(date_to)):
    frappe.throw("from and to must be YYYY-MM-DD dates")

sales = body.get("sales") or []
if isinstance(sales, str):
    sales = json.loads(sales)
sales_ids = {}
by_email = {}
for pair in sales:
    if pair and pair[0]:
        sales_ids[pair[0]] = 1
        if len(pair) > 1 and pair[1]:
            by_email[str(pair[1]).lower()] = pair[0]

rows = frappe.get_list(
    "Event",
    filters=[["event_category", "=", "Doctor Visit plan"],
             ["starts_on", "between", [date_from + " 00:00:00", date_to + " 23:59:59"]]],
    fields=["name", "starts_on", "custom_employee_id", "custom_hq",
            PARTS + ".reference_doctype as rt", PARTS + ".reference_docname as rd",
            PARTS + ".custom_visit_time as vt", PARTS + ".custom_is_force_visit as fv"],
    limit_page_length=0)

# participantCount per Event: distinct non-blank references + blanks, min 1
refs = {}
blanks = {}
for r in rows:
    ev = r.get("name")
    if ev not in refs:
        refs[ev] = {}
        blanks[ev] = 0
    ref = (r.get("rd") or "").strip()
    if ref:
        refs[ev][ref] = 1
    else:
        blanks[ev] = blanks[ev] + 1


def participant_count(ev):
    n = len(refs[ev]) + blanks[ev]
    return n if n > 1 else 1


emp_index = {}
employees = []
day_index = {}
days = []
hq_index = {}
hqs = []
counts = {}


def index_of(value, table, values):
    if value not in table:
        table[value] = len(values)
        values.append(value)
    return table[value]


for r in rows:
    ev = r.get("name")
    ref = (r.get("rd") or "").strip()
    rt = r.get("rt") or ""
    participant = None
    if rt == "Employee":
        if sales_ids.get(ref):
            participant = ref
    elif rt == "User":
        participant = by_email.get(ref.lower())
    employee = participant or (r.get("custom_employee_id") or "")

    starts = str(r.get("starts_on") or "")
    day = starts[:10]
    vt = r.get("vt")
    status = 0
    hour = -1
    if vt:
        status = 2 if r.get("fv") else 1
        hour = hour_of(str(vt))
    joint = 1 if participant_count(ev) > 1 else 0

    k = (index_of(employee, emp_index, employees), index_of(day, day_index, days),
         index_of(r.get("custom_hq") or "", hq_index, hqs), status, joint, hour)
    counts[k] = counts.get(k, 0) + 1

out = []
for k in counts:
    out.append([k[0], k[1], k[2], k[3], k[4], k[5], counts[k]])

frappe.response["message"] = {
    "from": date_from,
    "to": date_to,
    "employees": employees,
    "days": days,
    "hqs": hqs,
    "rows": out,
    "visits": len(rows),
}
