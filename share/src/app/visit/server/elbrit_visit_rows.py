# =====================================================================
# SERVER SCRIPT — the source of truth for the ERP's copy. Keep in step.
#
#   Name        : Elbrit Visit Rows
#   Script Type : API
#   API Method  : elbrit_visit_rows
#   Allow Guest : NO
#
#   POST /api/method/elbrit_visit_rows
#     { "from", "to", "sales": [[id, email], ...], "mode": "plan", "member": "E00869" }
#     { "from", "to", "sales", "mode": "visits", "employees": [ids...],
#       "hq": "*" | "HQ-Erode", "hour": 14 | null, "tone": "verified" | "force" | null }
#
# The visits behind ONE list the Visit report opens — fetched only when it
# is opened, so the screen never downloads the month's raw rows to count
# them (elbrit_visit_summary counts). READ-ONLY, AS THE TOKEN'S USER: the
# Events and doctors come from frappe.get_list, so the ERP's permissions
# decide.
#
#   plan    one person's Dr plan: every Event in the window where one of the
#           participant rows is theirs, with ALL of that Event's participant
#           rows (the app's doctorPlan shows who went along)
#   visits  the visits behind a bar or chip of the hourly chart: DONE visits
#           of \`employees\` (the scope), in \`hq\` ("*" = every HQ- territory),
#           at \`hour\` and of \`tone\` when given
#
# Rows come in the shape the app's liveSource builds (one per participant,
# before attribution), so the sheets' own code runs on them unchanged; the
# app attributes them with the same roster as elbrit_visit_summary. The
# attribution here only SELECTS rows, by the same rule.
#
# safe_exec: no import, no .format(), no set literals, no tuple
# unpacking, no underscore-prefixed names.
# =====================================================================

PARTS = "`tabEvent Participants`"
CHUNK = 500


def valid_date(d):
    if not d or len(d) != 10 or d[4] != "-" or d[7] != "-":
        return False
    return d[:4].isdigit() and d[5:7].isdigit() and d[8:].isdigit()


def hour_of(visit_time):
    t = (visit_time or "")[11:13].strip()
    if t == "":
        return 0
    if not t.isdigit():
        return -1
    v = int(t)
    if v < 0 or v > 23:
        return -1
    return v


def as_list(v):
    if isinstance(v, str):
        return json.loads(v)
    return v or []


def chunks(values):
    out = []
    i = 0
    while i < len(values):
        out.append(values[i:i + CHUNK])
        i = i + CHUNK
    return out


body = frappe.form_dict
date_from = body.get("from") or ""
date_to = body.get("to") or ""
if not (valid_date(date_from) and valid_date(date_to)):
    frappe.throw("from and to must be YYYY-MM-DD dates")
mode = body.get("mode") or ""
if mode not in ["plan", "visits"]:
    frappe.throw("mode must be plan or visits")

sales_ids = {}
by_email = {}
for pair in as_list(body.get("sales")):
    if pair and pair[0]:
        sales_ids[pair[0]] = 1
        if len(pair) > 1 and pair[1]:
            by_email[str(pair[1]).lower()] = pair[0]

rows = frappe.get_list(
    "Event",
    filters=[["event_category", "=", "Doctor Visit plan"],
             ["starts_on", "between", [date_from + " 00:00:00", date_to + " 23:59:59"]]],
    fields=["name", "subject", "starts_on", "custom_employee_id", "custom_doctor", "custom_hq",
            "custom_department", "custom_pob_given",
            PARTS + ".reference_doctype as rt", PARTS + ".reference_docname as rd",
            PARTS + ".custom_visit_time as vt", PARTS + ".custom_distance as dist",
            PARTS + ".custom_is_force_visit as fv", PARTS + ".custom_force_visit_reason as why"],
    limit_page_length=0)

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


def attributed(r):
    ref = (r.get("rd") or "").strip()
    rt = r.get("rt") or ""
    participant = None
    if rt == "Employee":
        if sales_ids.get(ref):
            participant = ref
    elif rt == "User":
        participant = by_email.get(ref.lower())
    return participant or (r.get("custom_employee_id") or "")


picked = []
if mode == "plan":
    member = body.get("member") or ""
    events = {}
    for r in rows:
        if attributed(r) == member:
            events[r.get("name")] = 1
    for r in rows:
        if events.get(r.get("name")):
            picked.append(r)
else:
    scope = {}
    for e in as_list(body.get("employees")):
        scope[e] = 1
    hq = body.get("hq") or "*"
    hour = body.get("hour")
    tone = body.get("tone")
    for r in rows:
        if not r.get("vt"):
            continue
        if not scope.get(attributed(r)):
            continue
        h = r.get("custom_hq") or ""
        if hq == "*":
            if not h.startswith("HQ-"):
                continue
        elif h != hq:
            continue
        if hour is not None and hour != "" and hour_of(str(r.get("vt"))) != int(hour):
            continue
        if tone == "force" and not r.get("fv"):
            continue
        if tone == "verified" and r.get("fv"):
            continue
        picked.append(r)

doctor_ids = []
for r in picked:
    d = r.get("custom_doctor")
    if d and d not in doctor_ids:
        doctor_ids.append(d)
doctor = {}
for part in chunks(doctor_ids):
    for d in frappe.get_list("Lead", filters=[["name", "in", part]],
                             fields=["name", "lead_name", "city", "custom_specialty",
                                     "custom_category", "custom_category1",
                                     "custom_category2", "custom_category3"],
                             limit_page_length=0):
        doctor[d.get("name")] = d

out = []
for r in picked:
    ev = r.get("name")
    doc = doctor.get(r.get("custom_doctor")) or {}
    count = len(refs[ev]) + blanks[ev]
    cats = []
    for k in ["custom_category", "custom_category1", "custom_category2", "custom_category3"]:
        if doc.get(k):
            cats.append(doc.get(k))
    vt = r.get("vt")
    out.append({
        "eventId": ev,
        "subject": r.get("subject") or "",
        "plannedDate": str(r.get("starts_on") or "")[:10],
        "planOwnerId": r.get("custom_employee_id") or "",
        "doctorId": r.get("custom_doctor") or "",
        "doctorName": doc.get("lead_name") or r.get("custom_doctor") or "",
        "doctorCity": doc.get("city") or "",
        "doctorSpecialty": doc.get("custom_specialty") or "",
        "doctorCategories": cats,
        "hq": r.get("custom_hq") or "",
        "department": r.get("custom_department") or "",
        "pobGiven": bool(r.get("custom_pob_given")),
        "visitTime": str(vt)[:19] if vt else None,
        "distanceKm": r.get("dist"),
        "forceVisit": bool(r.get("fv")),
        "forceVisitReason": (r.get("why") or "").strip(),
        "participantRef": (r.get("rd") or "").strip(),
        "participantRefType": r.get("rt") or "",
        "participantCount": count if count > 1 else 1,
    })

frappe.response["message"] = {"rows": out}
