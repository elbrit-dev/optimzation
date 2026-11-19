# Server Script "Field Non-Reported Day API" -- type API, method field_nonreport_day
# (19 Nov 2026). The planner's "Non-reported days" card: a day the Field
# Expense build marked NON-Reported (no visit, no other work on record) -- the
# rep says what they did that day, and it becomes an ERP Task in the
# "Expense claim" project, assigned and shared like the TA/DA help Tasks
# (field_trip_help_api.py). The team turns each Task into the real calendar
# events (DR visits, Meeting, Other Work) and rebuilds the day.
#
# Called by the app with the REP'S OWN token (reps cannot read or write Task
# themselves -- this script reads with get_all and writes with
# ignore_permissions):
#
#   action=raise   date (yyyy-mm-dd), entries (JSON list, 1..10), each one of
#       { type: "doctor_visit", hq, doctors: [lead name, ...] (1..80), note }
#       { type: "meeting", hq, title, note }
#       { type: "other", other_type: Admin Day | Chemist Day | Conference,
#         hq, title (Conference), note }
#     HQ is required for every entry (19 Nov 2026: no joint working, venue,
#     time or attendees asked -- the meeting is the day, the rep alone).
#     -> { ok: 1, task: { name, status, date, subject, creation, description, replies } }
#        The day must be the rep's own NON-Reported Field Expense Day. At most
#        MAX_OPEN unfinished Tasks per day. The Task's description carries the
#        entries for a person (names, codes, HQ) and, in its last <pre>, the
#        same as JSON event drafts (one per doctor, the meeting, the other
#        work) in the planner's Event fields, ready to be made into events.
#   action=list    from, to (yyyy-mm-dd)
#     -> { tasks: [{ name, status, date, subject, creation, modified,
#                    completed_on, description, replies: [{ by, mine, at, content }] }] }
#        The rep's OWN non-reported-day Tasks in that range, newest first.
#
# safe_exec: no import, no .format(), no set literals, no tuple unpacking,
# and a def sees only its own arguments.

PROJECT = "PROJ-2026-2027-0016"               # "Expense claim"
ASSIGNEE = "sathish.admin@elbrit.org"         # Sathishkumar Kumaresan
SHARE_WITH = ["baranidharan@elbrit.org", "vigneshkumar.s@elbrit.org", "sanjay@elbrit.org",
              "vikram.babu@elbrit.org", "sivaraman.hr@elbrit.org", "vishnuk.mis@elbrit.org"]
PREFIX = "Non-reported day · "
MAX_OPEN = 3
MAX_ENTRIES = 10
MAX_DOCTORS = 80
OTHER_TYPES = ["Admin Day", "Chemist Day", "Conference"]
OPEN = ["Open", "Working", "Pending Review", "Overdue"]
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def esc(s):
    return str(s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def iso(s):
    s = str(s or "")[:10]
    if len(s) == 10 and s[4] == "-" and s[7] == "-" and s[:4].isdigit() and s[5:7].isdigit() and s[8:].isdigit():
        return s
    return None


def clean(s, n):
    return str(s or "").strip()[:n]


def ids(v, n):
    out = []
    for x in (v or []):
        x = str(x or "").strip()[:140]
        if x and x not in out:
            out.append(x)
    return out[:n]


fd = frappe.form_dict
action = str(fd.get("action") or "list")
user = frappe.session.user
emp = None
if user and user != "Guest":
    emp = frappe.db.get_value("Employee", {"user_id": user, "status": "Active"}, ["name", "employee_name"], as_dict=True)
if not emp:
    frappe.throw("No active employee is linked to this login.")

if action == "raise":
    day = iso(fd.get("date"))
    if not day:
        frappe.throw("Which day is this about?")
    fed = frappe.db.get_value("Field Expense Day", {"employee": emp.name, "date": day}, ["name", "day_type"], as_dict=True)
    if not fed or fed.day_type != "NON-Reported":
        frappe.throw("This day is not a non-reported day for you.")
    open_now = frappe.get_all("Task", filters={"owner": user, "project": PROJECT, "exp_start_date": day,
                                                 "subject": ["like", PREFIX + "%"], "status": ["in", OPEN]}, pluck="name")
    if len(open_now) >= MAX_OPEN:
        frappe.throw("You already have " + str(len(open_now)) + " open requests for this day — wait for those to be done.")

    raw = fd.get("entries") or "[]"
    entries = json.loads(raw) if isinstance(raw, str) else raw
    if not isinstance(entries, list) or not entries:
        frappe.throw("Add what you did that day — doctor visits, a meeting or other work.")
    if len(entries) > MAX_ENTRIES:
        frappe.throw("Too many entries for one day (" + str(MAX_ENTRIES) + " at most).")

    lines = []        # for a person, one per entry
    sections = []     # the description's HTML, one per entry
    drafts = []       # the events to make, in the planner's Event fields
    clean_entries = []
    n_doctors = 0
    n_meet = 0
    n_other = 0
    for i in range(len(entries)):
        e = entries[i] or {}
        kind = str(e.get("type") or "")
        hq = clean(e.get("hq"), 140)
        note = clean(e.get("note"), 600)
        if hq and not frappe.db.exists("Territory", hq):
            frappe.throw("Unknown HQ: " + hq)
        if kind == "doctor_visit":
            if not hq:
                frappe.throw("Pick the HQ of the doctor visits.")
            docs = ids(e.get("doctors"), MAX_DOCTORS)
            if not docs:
                frappe.throw("Pick the doctors you visited.")
            rows = frappe.get_all("Lead", filters={"name": ["in", docs]},
                                  fields=["name", "lead_name", "custom_doctor_code", "city"], limit_page_length=0)
            by = {}
            for r in rows:
                by[r.name] = r
            missing = []
            for d in docs:
                if d not in by:
                    missing.append(d)
            if missing:
                frappe.throw("Doctor not found: " + ", ".join(missing[:3]))
            docs_out = []
            lis = ""
            for d in docs:
                r = by[d]
                docs_out.append({"id": d, "name": r.lead_name, "code": r.custom_doctor_code, "city": r.city})
                lis = lis + "<li>" + esc(r.lead_name) + " <small>(" + esc(d) + (" · " + esc(r.custom_doctor_code) if r.custom_doctor_code else "") + (" · " + esc(r.city) if r.city else "") + ")</small></li>"
                drafts.append({"tag": "Doctor Visit plan", "date": day, "hqTerritory": hq, "doctor": d,
                               "employees": [emp.name], "description": note})
            n_doctors = n_doctors + len(docs)
            lines.append("Doctor visits · " + hq + " · " + str(len(docs)) + " doctor" + ("s" if len(docs) > 1 else "") + (" — " + note if note else ""))
            sections.append("<p><b>Doctor visits</b> · " + esc(hq) + " · " + str(len(docs)) + "</p><ol>" + lis + "</ol>"
                            + ("<p>Note: " + esc(note) + "</p>" if note else ""))
            clean_entries.append({"type": kind, "hq": hq, "doctors": docs_out, "note": note})
        elif kind == "meeting":
            title = clean(e.get("title"), 140)
            if len(title) < 3:
                frappe.throw("Give the meeting a title.")
            if not hq:
                frappe.throw("Pick the HQ of the meeting.")
            n_meet = n_meet + 1
            lines.append("Meeting · " + title + " · " + hq + (" — " + note if note else ""))
            sections.append("<p><b>Meeting</b> · " + esc(title) + "<br>HQ " + esc(hq)
                            + ("<br>Note: " + esc(note) if note else "") + "</p>")
            drafts.append({"tag": "Meeting", "title": title, "date": day, "allDay": 1,
                           "hqTerritory": hq, "employees": [emp.name], "description": note})
            clean_entries.append({"type": kind, "hq": hq, "title": title, "note": note})
        elif kind == "other":
            ot = str(e.get("other_type") or "")
            if ot not in OTHER_TYPES:
                frappe.throw("Pick what kind of other work it was.")
            title = clean(e.get("title"), 140)
            if ot == "Conference" and len(title) < 3:
                frappe.throw("Name the conference.")
            if not hq:
                frappe.throw("Pick the HQ of the " + ot.lower() + ".")
            n_other = n_other + 1
            lines.append(ot + (" · " + title if title else "") + " · " + hq + (" — " + note if note else ""))
            sections.append("<p><b>" + esc(ot) + "</b>" + (" · " + esc(title) if title else "") + " · HQ " + esc(hq)
                            + ("<br>Note: " + esc(note) if note else "") + "</p>")
            drafts.append({"tag": "Other", "otherType": ot, "date": day, "hqTerritory": hq, "title": title,
                           "employees": [emp.name], "description": note})
            clean_entries.append({"type": kind, "other_type": ot, "hq": hq, "title": title, "note": note})
        else:
            frappe.throw("Unknown entry type: " + kind)

    label = str(int(day[8:])) + " " + MONTHS[int(day[5:7]) - 1] + " " + day[:4]
    bits = []
    if n_doctors:
        bits.append(str(n_doctors) + " doctor" + ("s" if n_doctors > 1 else ""))
    if n_meet:
        bits.append(str(n_meet) + " meeting" + ("s" if n_meet > 1 else ""))
    if n_other:
        bits.append(str(n_other) + " other work")
    subject = (PREFIX + label + " · " + " + ".join(bits) + " — " + str(emp.employee_name or "") + " (" + emp.name + ")")[:140]
    data = {"employee": emp.name, "employee_name": emp.employee_name, "date": day, "field_expense_day": fed.name,
            "entries": clean_entries, "event_drafts": drafts}
    body = ("<p><b>" + esc(emp.employee_name) + " (" + esc(emp.name) + ") reports for " + label + ":</b></p>"
            + "<p>" + esc(chr(10).join(lines)).replace(chr(10), "<br>") + "</p>"
            + "".join(sections)
            + "<p>Raised from the planner's Non-reported days. Make the events below, rebuild the day, then mark "
            + "this Task Completed. Reply with a comment here: the employee sees it on the day.</p>"
            + "<pre>" + esc(json.dumps(data, indent=1)) + "</pre>")
    t = frappe.get_doc({
        "doctype": "Task",
        "subject": subject,
        "project": PROJECT,
        "status": "Open",
        "priority": "Medium",
        "exp_start_date": day,
        "exp_end_date": day,
        "description": body,
    }).insert(ignore_permissions=True)
    frappe.get_doc({
        "doctype": "ToDo",
        "allocated_to": ASSIGNEE,
        "reference_type": "Task",
        "reference_name": t.name,
        "description": subject,
        "priority": "Medium",
        "date": day,
        "assigned_by": user,
    }).insert(ignore_permissions=True)
    for u in SHARE_WITH:
        if frappe.db.exists("User", {"name": u, "enabled": 1}):
            sh = frappe.get_doc({
                "doctype": "DocShare",
                "share_doctype": "Task",
                "share_name": t.name,
                "user": u,
                "read": 1,
                "write": 1,
                "share": 0,
                "notify_by_email": 1,
            })
            sh.flags.ignore_share_permission = True
            sh.insert(ignore_permissions=True)
    frappe.response["message"] = {"ok": 1, "task": {"name": t.name, "status": t.status, "date": day, "subject": subject,
                                                    "creation": str(t.creation), "modified": str(t.modified),
                                                    "completed_on": None, "description": body, "replies": []}}

elif action == "list":
    d_from = iso(fd.get("from"))
    d_to = iso(fd.get("to")) or d_from
    if not d_from or d_to < d_from:
        frappe.throw("Which month is this about?")
    rows = frappe.get_all("Task", filters={"owner": user, "project": PROJECT, "subject": ["like", PREFIX + "%"],
                                           "exp_start_date": ["between", [d_from, d_to]]},
                          fields=["name", "status", "subject", "exp_start_date", "creation", "modified", "completed_on", "description"],
                          order_by="creation desc", limit_page_length=200)
    names = [r.name for r in rows]
    replies = {}
    if names:
        for c in frappe.get_all("Comment", filters={"reference_doctype": "Task", "reference_name": ["in", names],
                                                    "comment_type": "Comment"},
                                fields=["reference_name", "content", "comment_by", "comment_email", "owner", "creation"],
                                order_by="creation asc", limit_page_length=500):
            replies.setdefault(c.reference_name, []).append({
                "by": c.comment_by or c.comment_email or c.owner,
                "mine": (c.comment_email or c.owner) == user,
                "at": str(c.creation),
                "content": c.content,
            })
    out = []
    for r in rows:
        out.append({"name": r.name, "status": r.status, "date": str(r.exp_start_date), "subject": r.subject,
                    "creation": str(r.creation), "modified": str(r.modified),
                    "completed_on": str(r.completed_on) if r.completed_on else None,
                    "description": r.description, "replies": replies.get(r.name, [])})
    frappe.response["message"] = {"tasks": out}

else:
    frappe.throw("Unknown action.")
