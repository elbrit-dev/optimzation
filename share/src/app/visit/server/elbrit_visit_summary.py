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
#       "sales": [["E00869", "vignesh869.be@elbrit.org"], ...],
#       "parts": ["visits", "holidays"] }        (optional, both by default)
#
# The Visit report's visits for a window, COUNTED HERE instead of sent as
# rows: a month is ~55,000 visits on production (~38 MB as rows); as counts
# it is a few thousand lines. READ-ONLY.
#
# WHOSE VISITS: the token user's DOWNLINE (everyone under them by
# reports_to, any status, themselves included) whatever the ERP's
# permissions say, plus whatever else frappe.get_list lets them see. A visit
# Event is private; a manager sees one only once it is SHARED with them, and
# the share is made in the rep's own session, which a rep whose User
# Permission pins Employee to themselves for every doctype cannot make past
# their direct manager — so the RBM above went without that rep's visits
# (E01289 and E01040, 2026-10). The downline is worked out HERE from the
# session user, never taken from the request. The two halves split on the
# plan owner (custom_employee_id in / not in the downline), so no Event
# comes twice and the database reads no more rows than before.
#
# ONE COUNT per (person, planned day, event HQ, status, joint, hour, department):
#   rows: [[e, d, h, s, j, hr, n, dp, ft], ...] indexing employees / days / hqs / depts
#     s   0 pending (no visit time), 1 verified (done, not forced),
#         2 forced (done and forced) — a force flag on a pending visit is
#         ignored, as the app ignores it
#     j   1 when the Event had more than one distinct participant
#     hr  the visit's hour 0-23; -1 for pending, and for a done visit whose
#         time has no readable hour (it still counts as done, but sits in
#         no bar of the hourly chart — as the app's chartHourOf does)
#     n   how many visits the line stands for
#     dp  (8th) the Event's department, indexing `depts` — the home
#         overview groups by it; the Visit report reads only the first seven
#     ft  (9th) the earliest visit time of the line ("" when pending), for
#         the first-call time the home overview shows
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
# HOLIDAYS (2026-10): each Sales roster member's holidays inside the window,
# from their Employee's Holiday List (the Company's default list when the
# Employee names none, as HRMS resolves it). Weekly offs and Sundays are left
# out — the app treats Sunday as a day off on its own. A day on someone's
# list is a day off for THEM: not a silent day, and off their call target.
# Lists are per state ("TamilNadu Holidays 2026"), so the roster shares a
# handful; each is sent once:
#   holidays: { "lists": [[list name, [[date, name], ...]], ...],
#               "of":    { employee id: index into lists } }
# Only lists with a holiday in the window, and only the employees on them.
# `parts: ["holidays"]` skips the visit count (the home overview, which
# reads its visits another way, asks for just this).
#
# safe_exec: no import, no .format(), no set literals, no tuple
# unpacking, no underscore-prefixed names.
# =====================================================================

PARTS = "`tabEvent Participants`"
CHUNK = 500
# Role profiles that see EVERY visit, whatever the ERP's Event sharing says:
# HR (2026-10). A visit Event is private and shared only up the reporting
# chain, so HR, outside it, read none of them. The CEO and the GM are
# management and see every department (2026-10-14): the share chain never
# reaches the CEO at all, and neither should depend on reports_to being
# clean -- a plan owned by a record cut off from the chain is still theirs
# to see. Keep in step with the other Visit script.
ALL_VISITS_PROFILES = ["HR", "HR Manager", "HR & Procurement", "CEO", "GM"]


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


def chunks(values):
    out = []
    i = 0
    while i < len(values):
        out.append(values[i:i + CHUNK])
        i = i + CHUNK
    return out


def downline_of(user):
    # Every Employee under the user's own record(s) by reports_to, those
    # included. All statuses: a rep who has since left still worked the
    # month being looked at.
    roots = frappe.get_all("Employee", filters={"user_id": user}, pluck="name")
    if not roots:
        return []
    children_of = {}
    for e in frappe.get_all("Employee", fields=["name", "reports_to"]):
        mgr = e.get("reports_to")
        if mgr:
            if mgr not in children_of:
                children_of[mgr] = []
            children_of[mgr].append(e.get("name"))
    seen = {}
    for r in roots:
        seen[r] = 1
    frontier = roots
    while frontier:
        nxt = []
        for node in frontier:
            for kid in children_of.get(node) or []:
                if kid not in seen:
                    seen[kid] = 1
                    nxt.append(kid)
        frontier = nxt
    return list(seen.keys())


def visit_events(filters, fields):
    # The downline's Events unrestricted, the rest as the ERP permits.
    if frappe.db.get_value("User", frappe.session.user, "role_profile_name") in ALL_VISITS_PROFILES:
        return frappe.get_all("Event", filters=filters, fields=fields, limit_page_length=0)
    team = downline_of(frappe.session.user)
    out = []
    for part in chunks(team):
        out.extend(frappe.get_all("Event", filters=filters + [["custom_employee_id", "in", part]],
                                  fields=fields, limit_page_length=0))
    others = list(filters)
    if team:
        others.append(["custom_employee_id", "not in", team])
    out.extend(frappe.get_list("Event", filters=others, fields=fields, limit_page_length=0))
    return out


def plain_text(html):
    # A holiday's name as words: the ERP stores it as editor HTML,
    # <div class="ql-editor read-mode"><p>Pooja</p></div>.
    out = []
    inside = False
    for ch in html or "":
        if ch == "<":
            inside = True
        elif ch == ">":
            inside = False
            out.append(" ")
        elif not inside:
            out.append(ch)
    text = "".join(out).replace("&nbsp;", " ").replace("&amp;", "&")
    return " ".join(text.split())


def holidays_of(ids, date_from, date_to):
    list_of = {}
    default_of = {}
    for part in chunks(ids):
        for e in frappe.get_all("Employee", filters=[["name", "in", part]],
                                fields=["name", "holiday_list", "company"], limit_page_length=0):
            name = e.get("holiday_list")
            company = e.get("company")
            if not name and company:
                if company not in default_of:
                    default_of[company] = frappe.db.get_value("Company", company, "default_holiday_list") or ""
                name = default_of[company]
            if name:
                list_of[e.get("name")] = name
    wanted = {}
    for name in list_of.values():
        wanted[name] = 1
    days_of = {}
    if wanted:
        for h in frappe.db.get_all("Holiday",
                                   filters=[["parenttype", "=", "Holiday List"],
                                            ["parent", "in", list(wanted.keys())],
                                            ["weekly_off", "=", 0],
                                            ["holiday_date", "between", [date_from, date_to]]],
                                   fields=["parent", "holiday_date", "description"],
                                   order_by="holiday_date asc", limit_page_length=0):
            day = str(h.get("holiday_date"))[:10]
            # Sunday is a day off already; a list that also names it says nothing new.
            if frappe.utils.getdate(day).weekday() == 6:
                continue
            parent = h.get("parent")
            if parent not in days_of:
                days_of[parent] = []
            days_of[parent].append([day, plain_text(h.get("description")) or "Holiday"])
    lists = []
    index = {}
    for name in days_of:
        index[name] = len(lists)
        lists.append([name, days_of[name]])
    of = {}
    for emp in list_of:
        if list_of[emp] in index:
            of[emp] = index[list_of[emp]]
    return {"lists": lists, "of": of}


body = frappe.form_dict
date_from = body.get("from") or ""
date_to = body.get("to") or ""
if not (valid_date(date_from) and valid_date(date_to)):
    frappe.throw("from and to must be YYYY-MM-DD dates")

parts = body.get("parts") or ["visits", "holidays"]
if isinstance(parts, str):
    parts = json.loads(parts)

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

rows = []
if "visits" in parts:
    rows = visit_events(
        [["event_category", "=", "Doctor Visit plan"],
         ["starts_on", "between", [date_from + " 00:00:00", date_to + " 23:59:59"]]],
        ["name", "starts_on", "custom_employee_id", "custom_hq", "custom_department",
         PARTS + ".reference_doctype as rt", PARTS + ".reference_docname as rd",
         PARTS + ".custom_visit_time as vt", PARTS + ".custom_is_force_visit as fv"])

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
dept_index = {}
depts = []
counts = {}
firsts = {}


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
         index_of(r.get("custom_hq") or "", hq_index, hqs), status, joint, hour,
         index_of(r.get("custom_department") or "", dept_index, depts))
    counts[k] = counts.get(k, 0) + 1
    if vt and (not firsts.get(k) or str(vt) < firsts[k]):
        firsts[k] = str(vt)

out = []
for k in counts:
    out.append([k[0], k[1], k[2], k[3], k[4], k[5], counts[k], k[6], firsts.get(k) or ""])

holidays = {"lists": [], "of": {}}
if "holidays" in parts and sales_ids:
    holidays = holidays_of(list(sales_ids.keys()), date_from, date_to)

frappe.response["message"] = {
    "from": date_from,
    "to": date_to,
    "employees": employees,
    "days": days,
    "hqs": hqs,
    "depts": depts,
    "rows": out,
    "visits": len(rows),
    "holidays": holidays,
}
