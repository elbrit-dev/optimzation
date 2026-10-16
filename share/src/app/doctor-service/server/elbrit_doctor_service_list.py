# =====================================================================
# SERVER SCRIPT — the source of truth for the ERP's copy. Keep in step.
#
#   Name        : Elbrit Doctor Service List
#   Script Type : API
#   API Method  : elbrit_doctor_service_list
#   Allow Guest : NO
#
#   GET /api/method/elbrit_doctor_service_list
#
# Everything the Services page (MIS) and the Service approval page (GM, CEO)
# list: every Doctor Service raised from the app (custom_via_app = 1) —
# never the ~26.7k imported rows. READ-ONLY. Decisions are the app's
# apply_workflow calls on each service's Operational Tracker, as the
# signed-in user; the tracker is where the state lives.
#
# WHO: the viewing roles only (VIEW_ROLES: IT, MIS team, GM, CEO) — they
# see every app row, so the rows are read past permissions; anyone else is
# refused.
#
# Answer:
#   viewer   as elbrit_doctor_service_options answers it (+ verifier: the
#            MIS role, which verifies after the final approval)
#   setup    { missing: [field, ...] } — Doctor Service fields the app needs
#            that this ERP does not have yet (rows is empty until
#            custom_via_app exists)
#   rows     newest first, MAX_ROWS at most, each the record's own fields
#            plus:
#              by_name, entered_by_name   employee names
#              category                   the service's master category
#              dept_key                   the service's department as it is
#                                         judged: its seat's (Role Profile.
#                                         custom_department), else its own
#              doctor_avg                 the doctor's average monthly
#                                         support over the last 12 months IN
#                                         dept_key (Support Items lines, each
#                                         by its seat's department), so an
#                                         Elbrit service is sized on Elbrit's
#                                         support
#              doctor_avg_all             the same, every department
#              state                      the tracker's workflow_state, or
#                                         "Not submitted" (no tracker yet)
#              reason                     the tracker's reason_for_rejection
#                                         (send-back / rejection note)
#              waiting_on                 the tracker's next approver's name
#              history                    Workflow and Comment entries of the
#                                         tracker and the service, oldest
#                                         first: { type, content, by, at }
#              execution                  after the final GM / CEO approval the
#                                         tracker hands the service to MIS as a
#                                         ToDo ("Approved (...) - carry out");
#                                         this is that ToDo's outcome, or null
#                                         when there is none yet:
#                                         { state: "Done" | "Pending" |
#                                           "Cancelled", by, at, with: [names] }
#                                         Done = a ToDo on the tracker is
#                                         Closed (by = who closed it, at = when);
#                                         Pending = still Open (with = its
#                                         assignees); Cancelled = every one was
#              budget                     the service's department + month
#                                         budget: { department, month,
#                                         allocated, used } -- allocated = the
#                                         Department Service Budget row (the
#                                         SM's split of the GM's allocation),
#                                         used = every service GIVEN in that
#                                         department that month (imported
#                                         rows, and app rows finally approved;
#                                         this one too once approved), each by
#                                         its seat's department. null when the
#                                         budget table is not set up
#
# safe_exec: no import, no .format(), no set literals, no tuple
# unpacking, no underscore-prefixed names.
# =====================================================================

DOCTYPE = "Doctor Service"
MAX_ROWS = 2000
CHUNK = 500
ENTRY_ROLES = ["MIS", "User MIS", "MIS Admin", "Manager MIS", "CRM Manager", "IT"]
VIEW_ROLES = ["IT", "MIS", "User MIS", "MIS Admin", "Manager MIS", "CRM Manager", "GM", "CEO"]
OT = "Operational Tracker"
WANTED = ["custom_via_app", "custom_entered_by", "custom_tracker"]


def viewer_of(user):
    # COPIED from elbrit_doctor_service_options — change all three together.
    roles = frappe.get_all("Has Role", filters={"parent": user, "parenttype": "User"}, pluck="role")
    admin = user == "Administrator" or "System Manager" in roles
    profile = frappe.db.get_value("User", user, "role_profile_name") or ""
    can_enter = admin
    for r in ENTRY_ROLES:
        if r in roles:
            can_enter = True
    can_view = admin or can_enter or profile[:2].upper() == "IT"
    for r in VIEW_ROLES:
        if r in roles:
            can_view = True
    # Verify is the workflow's MIS step: the MIS role itself, not System Manager.
    verifier = user == "Administrator" or "MIS" in roles
    approvers = []
    for r in ["GM", "CEO"]:
        if r in roles:
            approvers.append(r)
    approver = approvers[-1] if approvers else None
    me = frappe.get_all("Employee", filters={"user_id": user, "status": "Active"},
                        fields=["name", "employee_name"], limit=1)
    me = me[0] if me else {}
    return {"user": user, "employee": me.get("name"),
            "employee_name": me.get("employee_name") or frappe.db.get_value("User", user, "full_name") or user,
            "can_enter": can_enter, "can_view": can_view, "approver": approver, "approvers": approvers,
            "verifier": verifier}


def chunks(values):
    out = []
    i = 0
    while i < len(values):
        out.append(values[i:i + CHUNK])
        i = i + CHUNK
    return out


def month_back(d, n):
    y = int(d[:4])
    m = int(d[5:7]) - n
    while m < 1:
        m = m + 12
        y = y - 1
    return str(y) + "-" + ("0" if m < 10 else "") + str(m) + "-01"


viewer = viewer_of(frappe.session.user)
if not viewer["can_view"]:
    frappe.throw("Doctor services are open to IT, the MIS team, GM and CEO only.")

meta = frappe.get_meta(DOCTYPE)
missing = []
for f in WANTED:
    if not meta.has_field(f):
        missing.append(f)

rows = []
if meta.has_field("custom_via_app"):
    fields = ["name", "doctor", "doctor_name", "service_name", "service_amount", "service_date", "date",
              "by", "department", "hq", "role_profile", "remarks", "workflow_state",
              "service_attachement", "owner", "creation", "modified"]
    for f in WANTED:
        if meta.has_field(f):
            fields.append(f)
    # What the service type captured (EB number, mobile...), when ERP has it.
    if meta.has_field("custom_service_details"):
        fields.append("custom_service_details")
    keep = []
    for f in fields:
        if f in ["name", "owner", "creation", "modified"] or meta.has_field(f):
            keep.append(f)
    rows = frappe.get_all(DOCTYPE, filters={"custom_via_app": 1}, fields=keep,
                          order_by="modified desc", limit_page_length=MAX_ROWS)

names = []
trackers = []
doctors = []
employees = []
users = []
services = []
for r in rows:
    names.append(r.get("name"))
    if r.get("custom_tracker"):
        trackers.append(r.get("custom_tracker"))
    if r.get("doctor") and r.get("doctor") not in doctors:
        doctors.append(r.get("doctor"))
    for f in ["by", "custom_entered_by"]:
        if r.get(f) and r.get(f) not in employees:
            employees.append(r.get(f))
    if r.get("owner") and r.get("owner") not in users:
        users.append(r.get("owner"))
    if r.get("service_name") and r.get("service_name") not in services:
        services.append(r.get("service_name"))

# ---- the trackers: where the state lives
track = {}
for part in chunks(trackers):
    for t in frappe.get_all(OT, filters=[["name", "in", part]],
                            fields=["name", "workflow_state", "next_approver", "custom_fallback_approver",
                                    "reason_for_rejection", "modified"],
                            limit_page_length=0):
        track[t.get("name")] = t
        if t.get("next_approver") and t.get("next_approver") not in users:
            users.append(t.get("next_approver"))
service_of = {}
for r in rows:
    if r.get("custom_tracker"):
        service_of[r.get("custom_tracker")] = r.get("name")

# ---- execution: the hand-over ToDo(s) the final approval makes on the tracker
todos_of = {}
for part in chunks(trackers):
    for t in frappe.get_all("ToDo", filters=[["reference_type", "=", OT], ["reference_name", "in", part]],
                            fields=["name", "reference_name", "status", "allocated_to", "modified", "modified_by"],
                            order_by="creation asc", limit_page_length=0):
        k = t.get("reference_name")
        if k not in todos_of:
            todos_of[k] = []
        todos_of[k].append(t)
        for u in [t.get("allocated_to"), t.get("modified_by")]:
            if u and u not in users:
                users.append(u)


def execution_of(tracker):
    todos = todos_of.get(tracker) or []
    if not todos:
        return None
    closed = None
    open_to = []
    for t in todos:
        st = t.get("status") or ""
        if st == "Closed" and (closed is None or str(t.get("modified")) > str(closed.get("modified"))):
            closed = t
        elif st == "Open" and t.get("allocated_to"):
            open_to.append(t.get("allocated_to"))
    if closed:
        return {"state": "Done", "by": closed.get("modified_by"), "at": str(closed.get("modified")), "with": []}
    if open_to:
        return {"state": "Pending", "by": None, "at": None, "with": open_to}
    return {"state": "Cancelled", "by": None, "at": None, "with": []}

# ---- history: the tracker's workflow steps, and notes on either record
history = {}


def keep_comment(service, c):
    if c.get("owner") and c.get("owner") not in users:
        users.append(c.get("owner"))
    if service not in history:
        history[service] = []
    history[service].append({"type": c.get("comment_type"),
                             "content": frappe.utils.strip_html(c.get("content") or ""),
                             "user": c.get("owner"), "at": str(c.get("creation"))})


for part in chunks(names):
    for c in frappe.get_all("Comment",
                            filters=[["reference_doctype", "=", DOCTYPE], ["reference_name", "in", part],
                                     ["comment_type", "=", "Comment"]],
                            fields=["reference_name", "comment_type", "content", "owner", "creation"],
                            order_by="creation asc", limit_page_length=0):
        keep_comment(c.get("reference_name"), c)
for part in chunks(trackers):
    for c in frappe.get_all("Comment",
                            filters=[["reference_doctype", "=", OT], ["reference_name", "in", part],
                                     ["comment_type", "in", ["Workflow", "Comment"]]],
                            fields=["reference_name", "comment_type", "content", "owner", "creation"],
                            order_by="creation asc", limit_page_length=0):
        keep_comment(service_of.get(c.get("reference_name")), c)
# (The workflow steps come in order from their own query; the app sorts the
# activity list as a whole.)

# ---- names: employees by id, and users -> their employee's name
emp_name = {}
for part in chunks(employees):
    for e in frappe.get_all("Employee", filters=[["name", "in", part]], fields=["name", "employee_name"],
                            limit_page_length=0):
        emp_name[e.get("name")] = e.get("employee_name")
user_name = {}
for part in chunks(users):
    for e in frappe.get_all("Employee", filters=[["user_id", "in", part]], fields=["user_id", "employee_name"],
                            limit_page_length=0):
        user_name[e.get("user_id")] = e.get("employee_name")
    for u in frappe.get_all("User", filters=[["name", "in", part]], fields=["name", "full_name"],
                            limit_page_length=0):
        if u.get("name") not in user_name:
            user_name[u.get("name")] = u.get("full_name") or u.get("name")

# ---- categories
category = {}
if frappe.get_meta("Doctor Service Master").has_field("custom_category"):
    for part in chunks(services):
        for s in frappe.get_all("Doctor Service Master", filters=[["name", "in", part]],
                                fields=["name", "custom_category"], limit_page_length=0):
            category[s.get("name")] = s.get("custom_category") or ""

# ---- each doctor's average monthly support, last 12 months: the whole
# doctor's, and per department from the Support Items lines
since = month_back(frappe.utils.nowdate(), 12)
# A department is the SEAT's: Role Profile.custom_department (the rows' own
# department fields are wrong in places -- Elbrit seats filed as CND, the
# Karnataka seats as "Elbrit Karnataka"); a seat with none (SM) keeps the
# row's own.
RP_DEPT = {}


def load_seat_depts(ids):
    todo = []
    for s in ids:
        if s and s not in RP_DEPT and s not in todo:
            todo.append(s)
    for part in chunks(todo):
        for p in frappe.get_all("Role Profile", filters=[["name", "in", part]], fields=["name", "custom_department"],
                                limit_page_length=0):
            RP_DEPT[p.get("name")] = p.get("custom_department") or ""
    for s in todo:
        if s not in RP_DEPT:
            RP_DEPT[s] = ""


avg = {}
header = {}
months_of = {}
doctor_of = {}
for part in chunks(doctors):
    for s in frappe.get_all("Doctor Support",
                            filters=[["doctor", "in", part], ["date", ">=", since]],
                            fields=["name", "doctor", "custom_total_amount"], limit_page_length=0):
        d = s.get("doctor")
        doctor_of[s.get("name")] = d
        months_of[d] = (months_of.get(d) or 0) + 1
        header[s.get("name")] = float(s.get("custom_total_amount") or 0)
si_meta = frappe.get_meta("Support Items")
si_dept = "custom_department" if si_meta.has_field("custom_department") else ("department" if si_meta.has_field("department") else "")
si_seat = "custom_role_profile" if si_meta.has_field("custom_role_profile") else ("role_profile" if si_meta.has_field("role_profile") else "")
avg_dept = {}
has_lines = {}
lines = []
if doctor_of:
    lf = ["parent", "amount"]
    if si_dept:
        lf.append(si_dept + " as dept")
    if si_seat:
        lf.append(si_seat + " as seat")
    for part in chunks(list(doctor_of.keys())):
        for it in frappe.get_all("Support Items", filters=[["parenttype", "=", "Doctor Support"], ["parent", "in", part]],
                                 fields=lf, limit_page_length=0):
            lines.append(it)
    seat_ids = []
    for it in lines:
        seat_ids.append(it.get("seat"))
    load_seat_depts(seat_ids)
    # A month's support is its lines (some records awaiting verification carry
    # 0 as their own total); the record's total only when it has no lines.
    for it in lines:
        d = doctor_of.get(it.get("parent"))
        if not d:
            continue
        has_lines[it.get("parent")] = 1
        amt = float(it.get("amount") or 0)
        avg[d] = (avg.get(d) or 0) + amt
        dept = RP_DEPT.get(it.get("seat")) or it.get("dept") or ""
        if dept:
            k = d + "|" + dept
            avg_dept[k] = (avg_dept.get(k) or 0) + amt
for name in header:
    if not has_lines.get(name):
        d = doctor_of.get(name)
        avg[d] = (avg.get(d) or 0) + header[name]
for d in avg:
    avg[d] = round(avg[d] / months_of[d], 2) if months_of.get(d) else 0
for k in avg_dept:
    n = months_of.get(k.split("|")[0]) or 0
    avg_dept[k] = round(avg_dept[k] / n, 2) if n else 0
row_seats = []
for r in rows:
    row_seats.append(r.get("role_profile"))
load_seat_depts(row_seats)

# ---- department budgets: allocated (Department Service Budget) and used
BUDGET_DT = "Department Service Budget"
has_budget = frappe.db.exists("DocType", BUDGET_DT)
budget_of = {}
if has_budget:
    months_needed = []
    for r in rows:
        d = str(r.get("service_date") or r.get("date") or "")[:7]
        if d and d not in months_needed:
            months_needed.append(d)
    for mk in months_needed:
        first = mk + "-01"
        last = str(frappe.utils.get_last_day(first))
        alloc = {}
        for b in frappe.get_all(BUDGET_DT, filters={"parenttype": "Department", "month": first},
                                fields=["parent", "amount"], limit_page_length=0):
            alloc[b.get("parent")] = float(b.get("amount") or 0)
        given = frappe.get_all(DOCTYPE, filters=[["service_date", "between", [first, last]]],
                               fields=["name", "service_amount", "role_profile", "department", "custom_via_app",
                                       "custom_tracker"], limit_page_length=0)
        gseats = []
        gtrackers = []
        for g in given:
            gseats.append(g.get("role_profile"))
            if g.get("custom_via_app") and g.get("custom_tracker") and g.get("custom_tracker") not in track:
                gtrackers.append(g.get("custom_tracker"))
        load_seat_depts(gseats)
        gstate = {}
        for part in chunks(gtrackers):
            for t in frappe.get_all(OT, filters=[["name", "in", part]], fields=["name", "workflow_state"],
                                    limit_page_length=0):
                gstate[t.get("name")] = t.get("workflow_state")
        used = {}
        for g in given:
            if g.get("custom_via_app"):
                st = str((track.get(g.get("custom_tracker")) or {}).get("workflow_state") or
                         gstate.get(g.get("custom_tracker")) or "")
                if not (st.endswith(" Approved and Verified") or st.endswith(" Approved and Waiting for Verification")):
                    continue
            dk = RP_DEPT.get(g.get("role_profile")) or g.get("department") or ""
            if dk:
                used[dk] = (used.get(dk) or 0) + float(g.get("service_amount") or 0)
        budget_of[mk] = {"alloc": alloc, "used": used}

out = []
for r in rows:
    r["by_name"] = emp_name.get(r.get("by")) or r.get("by")
    r["entered_by_name"] = emp_name.get(r.get("custom_entered_by")) or user_name.get(r.get("owner")) or r.get("owner")
    t = track.get(r.get("custom_tracker")) or {}
    r["state"] = t.get("workflow_state") or "Not submitted"
    r["reason"] = t.get("reason_for_rejection") or ""
    r["waiting_on"] = user_name.get(t.get("next_approver")) or t.get("next_approver") or ""
    if t.get("modified") and str(t.get("modified")) > str(r.get("modified")):
        r["modified"] = t.get("modified")
    r["category"] = category.get(r.get("service_name")) or ""
    r["doctor_avg_all"] = avg.get(r.get("doctor")) or 0
    # The service's department, as its support is counted: its seat's.
    r["dept_key"] = RP_DEPT.get(r.get("role_profile")) or r.get("department") or ""
    if si_dept or si_seat:
        r["doctor_avg"] = avg_dept.get(str(r.get("doctor")) + "|" + r["dept_key"]) or 0
    else:
        r["doctor_avg"] = r["doctor_avg_all"]
    ex = execution_of(r.get("custom_tracker")) if r.get("custom_tracker") else None
    if ex:
        names_with = []
        for u in ex["with"]:
            names_with.append(user_name.get(u) or u)
        ex = {"state": ex["state"], "by": (user_name.get(ex["by"]) or ex["by"]) if ex["by"] else None,
              "at": ex["at"], "with": names_with}
    r["execution"] = ex
    mk = str(r.get("service_date") or r.get("date") or "")[:7]
    bm = budget_of.get(mk)
    r["budget"] = {"department": r["dept_key"], "month": mk,
                   "allocated": (bm["alloc"].get(r["dept_key"]) or 0),
                   "used": (bm["used"].get(r["dept_key"]) or 0)} if bm and r["dept_key"] else None
    h = history.get(r.get("name")) or []
    for e in h:
        e["by"] = user_name.get(e.get("user")) or e.get("user")
    r["history"] = h
    out.append(r)

frappe.response["message"] = {"viewer": viewer, "setup": {"missing": missing}, "rows": out}
