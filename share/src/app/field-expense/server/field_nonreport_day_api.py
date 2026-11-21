# Server Script "Field Non-Reported Day API" -- type API, method field_nonreport_day
# (19 Nov 2026; manager approval 21 Nov 2026).
#
# The planner's "Non-reported days" card: a working day the Field Expense build
# found nothing paid on -- NON-Reported (no visit, no other work), or only work
# with no HQ (a meeting nobody gave an HQ, 21 Nov 2026) -- the rep says what they
# did, and it goes to their MANAGER to approve (was: a Task for the admin team to
# key in by hand).
#
#   Who approves   the rep's direct parent seat (Role Profile.parent_role_profile);
#                  a seat with no real holder (none, "Vacant...", Left, a disabled
#                  login) passes it up to the next seat that has one. No seat ->
#                  the first real person up Employee.reports_to. Worked out LIVE on
#                  every call, nothing stored, so a seat changing hands is seen at once.
#   Escalation     the next real person above the approver, once the request has
#                  waited ESCALATE_AFTER_DAYS days. A System Manager may decide any (IT unblocking).
#   On Approve     the events are made in the rep's name (owner = the rep, shared up
#                  his line like the planner's own): one Doctor Visit per doctor,
#                  the Meeting / Other Work; an HQ-less meeting of his gets the HQ
#                  written on it. The Task is Completed, and the engine service
#                  (API Settings fx_engine_url) re-runs the month and saves the days
#                  that changed. On Reject (a note needed) the Task is Cancelled.
#
# Called with the caller's OWN token (reps and managers have no Task rights --
# this script reads with get_all and writes with ignore_permissions):
#
#   action=raise    date, entries (JSON, 1..10), each one of
#       { type: "doctor_visit", hq, doctors: [lead, ...] (1..80), note }
#       { type: "meeting", hq, title, note }
#       { type: "other", other_type: Admin Day | Chemist Day | Conference, hq, title, note }
#       { type: "meeting_hq", event, hq }      an HQ-less meeting of his: the HQ to give it
#     -> { ok, task }
#   action=list     from, to                    the caller's own requests
#     -> { tasks: [task] }
#   action=hqless   date                        the caller's HQ-less meetings that day
#     -> { events: [{ name, type, subject }] }
#   action=route    [employee: System Manager only]   who approves -> { approver_names, approver_seat, escalation_names, escalation_seat }
#   action=queue                                 requests the caller may decide + the last 30 days decided
#     -> { pending: [task], recent: [task], approver: bool }
#   action=decide   name, decision (Approve | Reject), note
#     -> { ok, task, events: [names], recalc }
#
#   task = { name, status, date, subject, creation, modified, completed_on, employee,
#            employee_name, entries, approver_names, escalation_names, can, decided_by,
#            decided_by_name, decision, note, events, description, replies }
#
# safe_exec: no import, no .format(), no set literals, no tuple unpacking. Names made at the
# script's top level are not seen inside a def, so the whole script is one function, main().

def main():
    PROJECT = "PROJ-2026-2027-0016"               # "Expense claim"
    PREFIX = "Non-reported day · "
    MAX_OPEN = 3
    MAX_ENTRIES = 10
    MAX_DOCTORS = 80
    OTHER_TYPES = ["Admin Day", "Chemist Day", "Conference"]
    OPEN = ["Open", "Working", "Pending Review", "Overdue"]
    MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    ESCALATE_AFTER_DAYS = 2
    VISIT_TIME = "10:00:00"
    SM_CODES = ["SM", "ZSM"]                      # the planner shares events up to the SM


    def nr_engine():
        S = {"parent": None, "holders": None, "emp": None, "enabled": None}

        def load():
            if S["parent"] is not None:
                return
            par = {}
            for r in frappe.get_all("Role Profile", fields=["name", "parent_role_profile"], limit_page_length=0):
                par[r.get("name")] = r.get("parent_role_profile")
            S["parent"] = par
            en = {}
            for u in frappe.get_all("User", filters={"enabled": 1}, fields=["name"], limit_page_length=0):
                en[u.get("name")] = 1
            S["enabled"] = en
            emp = {}
            hold = {}
            for e in frappe.get_all("Employee", filters={"status": "Active"},
                                    fields=["name", "employee_name", "user_id", "custom_role_profile", "reports_to", "department"],
                                    limit_page_length=0):
                emp[e.get("name")] = e
                if real(e) and e.get("custom_role_profile"):
                    hold.setdefault(e.get("custom_role_profile"), []).append(e.get("user_id"))
            S["emp"] = emp
            S["holders"] = hold

        def real(e):
            if not e:
                return False
            if (e.get("employee_name") or "")[:6].lower() == "vacant":
                return False
            return bool(e.get("user_id")) and bool(S["enabled"].get(e.get("user_id")))

        def up_held(seat):
            n = 0
            while seat and n < 25:
                if S["holders"].get(seat):
                    return seat
                seat = S["parent"].get(seat)
                n = n + 1
            return None

        def via_reports(emp_id):
            e = S["emp"].get(emp_id) or frappe.db.get_value("Employee", emp_id, ["name", "reports_to"], as_dict=True)
            cur = e.get("reports_to") if e else None
            n = 0
            while cur and n < 20:
                m = S["emp"].get(cur) or frappe.db.get_value("Employee", cur, ["name", "employee_name", "user_id", "reports_to"], as_dict=True)
                if m and real(m):
                    return m
                cur = m.get("reports_to") if m else None
                n = n + 1
            return None

        def route(employee):
            # -> {"approvers": [users], "escalation": [users], "seat", "esc_seat"}
            load()
            e = S["emp"].get(employee) or frappe.db.get_value("Employee", employee, ["name", "custom_role_profile", "reports_to", "user_id"], as_dict=True) or {}
            me_user = e.get("user_id")
            seat = e.get("custom_role_profile")
            if seat and S["parent"].get(seat):
                a = up_held(S["parent"].get(seat))
                if a:
                    appr = []
                    for u in S["holders"].get(a) or []:
                        if u != me_user:
                            appr.append(u)
                    esc = up_held(S["parent"].get(a))
                    return {"approvers": appr, "escalation": (S["holders"].get(esc) or []) if esc else [], "seat": a, "esc_seat": esc}
            m = via_reports(employee)
            if not m:
                return {"approvers": [], "escalation": [], "seat": None, "esc_seat": None}
            m2 = via_reports(m.get("name"))
            return {"approvers": [m.get("user_id")], "escalation": [m2.get("user_id")] if m2 else [], "seat": None, "esc_seat": None}

        def can(user, applicant_user, rt, raised_on, today):
            if user == "Administrator":
                return "override"
            if not user or user == applicant_user:
                return None
            if user in rt.get("approvers"):
                return "approver"
            if user in rt.get("escalation"):
                if frappe.utils.date_diff(today, str(raised_on)[:10]) >= ESCALATE_AFTER_DAYS:
                    return "escalation"
            # IT can unblock a stuck request (a System Manager), never their own
            if frappe.db.exists("Has Role", {"parent": user, "parenttype": "User", "role": "System Manager"}):
                return "override"
            return None

        def names(users):
            load()
            out = []
            for x in S["emp"].values():
                if x.get("user_id") in users and x.get("employee_name") not in out:
                    out.append(x.get("employee_name"))
            return ", ".join(out) if out else ", ".join(users)

        def upline(employee):
            # the users above the rep up to and including the SM seat (as "Elbrit Event Upline Share")
            load()
            e = S["emp"].get(employee) or {}
            seat = S["parent"].get(e.get("custom_role_profile") or "")
            out = []
            n = 0
            while seat and n < 25:
                for u in S["holders"].get(seat) or []:
                    if u not in out:
                        out.append(u)
                head = (seat or "").split("-")[0]
                code = ""
                for ch in head:
                    if not ch.isdigit():
                        code = code + ch
                if code.strip().upper() in SM_CODES:
                    break
                seat = S["parent"].get(seat)
                n = n + 1
            return out

        return {"route": route, "can": can, "names": names, "upline": upline, "emp": lambda x: (load() or S["emp"].get(x))}


    NR = nr_engine()


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


    def task_data(desc):
        # the JSON in the description's last <pre>
        s = str(desc or "")
        i = s.rfind("<pre>")
        j = s.rfind("</pre>")
        if i < 0 or j < i:
            return {}
        raw = s[i + 5:j].replace("&quot;", '"').replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&")
        try:
            return json.loads(raw)
        except Exception:
            return {}


    fd = frappe.form_dict
    action = str(fd.get("action") or "list")
    user = frappe.session.user
    if not user or user == "Guest":
        frappe.throw("Please log in", frappe.PermissionError)
    today = frappe.utils.today()
    emp = frappe.db.get_value("Employee", {"user_id": user, "status": "Active"}, ["name", "employee_name", "custom_role_profile", "reports_to", "department"], as_dict=True)

    TASK_FIELDS = ["name", "status", "subject", "exp_start_date", "creation", "modified", "completed_on", "completed_by", "description", "owner"]


    def shape(r, replies, me):
        d = task_data(r.description)
        rt = NR["route"](d.get("employee"))
        applicant = (NR["emp"](d.get("employee")) or {}).get("user_id") or r.owner
        who = NR["can"](me, applicant, rt, r.creation, today) if r.status in OPEN else None
        dec = d.get("decision") or {}
        return {"name": r.name, "status": r.status, "date": str(r.exp_start_date), "subject": r.subject,
                "creation": str(r.creation), "modified": str(r.modified),
                "completed_on": str(r.completed_on) if r.completed_on else None,
                "employee": d.get("employee"), "employee_name": d.get("employee_name"),
                "entries": d.get("entries") or [],
                "approver_names": NR["names"](rt.get("approvers")), "escalation_names": NR["names"](rt.get("escalation")) if rt.get("escalation") else "",
                "can": who, "decision": dec.get("decision"), "decided_by": dec.get("by"), "decided_by_name": dec.get("by_name"),
                "note": dec.get("note"), "events": dec.get("events") or [],
                "description": r.description, "replies": replies.get(r.name, [])}


    def replies_of(names):
        out = {}
        if not names:
            return out
        for c in frappe.get_all("Comment", filters={"reference_doctype": "Task", "reference_name": ["in", names], "comment_type": "Comment"},
                                fields=["reference_name", "content", "comment_by", "comment_email", "owner", "creation"],
                                order_by="creation asc", limit_page_length=1000):
            out.setdefault(c.reference_name, []).append({"by": c.comment_by or c.comment_email or c.owner,
                                                         "mine": (c.comment_email or c.owner) == user,
                                                         "at": str(c.creation), "content": c.content})
        return out


    def hqless_events(emp_id, day):
        return frappe.get_all("Event", filters={"event_category": "Other", "custom_employee_id": emp_id,
                                                "starts_on": ["between", [day + " 00:00:00", day + " 23:59:59"]],
                                                "custom_hq_territory": ["in", ["", None]], "status": ["!=", "Cancelled"]},
                              fields=["name", "custom_other_type", "subject"], limit_page_length=20)


    if action == "raise":
        if not emp:
            frappe.throw("No active employee is linked to this login.")
        day = iso(fd.get("date"))
        if not day:
            frappe.throw("Which day is this about?")
        fed = frappe.db.get_value("Field Expense Day", {"employee": emp.name, "date": day}, ["name", "day_type", "kind", "other_work", "detail_json"], as_dict=True)
        paid = False
        if fed and fed.detail_json:
            try:
                paid = bool(json.loads(fed.detail_json).get("payable"))
            except Exception:
                paid = False
        # NON-Reported, or a working day with work logged but nothing paid (a meeting with no HQ)
        if not fed or not (fed.day_type == "NON-Reported" or (fed.kind == "working" and not paid and fed.other_work)):
            frappe.throw("This day is not a non-reported day for you.")
        rt = NR["route"](emp.name)
        if not rt.get("approvers"):
            frappe.throw("No manager found above your seat to approve this. Ask HR to check your reporting.")
        open_now = frappe.get_all("Task", filters={"project": PROJECT, "exp_start_date": day, "subject": ["like", PREFIX + "%"],
                                                   "status": ["in", OPEN], "description": ["like", "%" + emp.name + "%"]}, pluck="name")
        if len(open_now) >= MAX_OPEN:
            frappe.throw("You already have " + str(len(open_now)) + " requests waiting for this day.")

        raw = fd.get("entries") or "[]"
        entries = json.loads(raw) if isinstance(raw, str) else raw
        if not isinstance(entries, list) or not entries:
            frappe.throw("Add what you did that day — doctor visits, a meeting or other work.")
        if len(entries) > MAX_ENTRIES:
            frappe.throw("Too many entries for one day (" + str(MAX_ENTRIES) + " at most).")

        mine_hqless = {}
        for x in hqless_events(emp.name, day):
            mine_hqless[x.name] = x
        lines = []
        sections = []
        clean_entries = []
        n_doctors = 0
        n_meet = 0
        n_other = 0
        for i in range(len(entries)):
            e = entries[i] or {}
            kind = str(e.get("type") or "")
            hq = clean(e.get("hq"), 140)
            note = clean(e.get("note"), 600)
            if not hq:
                frappe.throw("Pick the HQ for every entry.")
            if not frappe.db.exists("Territory", hq):
                frappe.throw("Unknown HQ: " + hq)
            if kind == "doctor_visit":
                docs = ids(e.get("doctors"), MAX_DOCTORS)
                if not docs:
                    frappe.throw("Pick the doctors you visited.")
                rows = frappe.get_all("Lead", filters={"name": ["in", docs]}, fields=["name", "lead_name", "custom_doctor_code", "city"], limit_page_length=0)
                by = {}
                for r in rows:
                    by[r.name] = r
                for d in docs:
                    if d not in by:
                        frappe.throw("Doctor not found: " + d)
                docs_out = []
                lis = ""
                for d in docs:
                    r = by[d]
                    docs_out.append({"id": d, "name": r.lead_name, "code": r.custom_doctor_code, "city": r.city})
                    lis = lis + "<li>" + esc(r.lead_name) + " <small>(" + esc(d) + (" · " + esc(r.city) if r.city else "") + ")</small></li>"
                n_doctors = n_doctors + len(docs)
                lines.append("Doctor visits · " + hq + " · " + str(len(docs)) + (" — " + note if note else ""))
                sections.append("<p><b>Doctor visits</b> · " + esc(hq) + " · " + str(len(docs)) + "</p><ol>" + lis + "</ol>" + ("<p>Note: " + esc(note) + "</p>" if note else ""))
                clean_entries.append({"type": kind, "hq": hq, "doctors": docs_out, "note": note})
            elif kind == "meeting":
                title = clean(e.get("title"), 140)
                if len(title) < 3:
                    frappe.throw("Give the meeting a title.")
                n_meet = n_meet + 1
                lines.append("Meeting · " + title + " · " + hq + (" — " + note if note else ""))
                sections.append("<p><b>Meeting</b> · " + esc(title) + " · HQ " + esc(hq) + ("<br>Note: " + esc(note) if note else "") + "</p>")
                clean_entries.append({"type": kind, "hq": hq, "title": title, "note": note})
            elif kind == "other":
                ot = str(e.get("other_type") or "")
                if ot not in OTHER_TYPES:
                    frappe.throw("Pick what kind of other work it was.")
                title = clean(e.get("title"), 140)
                if ot == "Conference" and len(title) < 3:
                    frappe.throw("Name the conference.")
                n_other = n_other + 1
                lines.append(ot + (" · " + title if title else "") + " · " + hq + (" — " + note if note else ""))
                sections.append("<p><b>" + esc(ot) + "</b>" + (" · " + esc(title) if title else "") + " · HQ " + esc(hq) + ("<br>Note: " + esc(note) if note else "") + "</p>")
                clean_entries.append({"type": kind, "other_type": ot, "hq": hq, "title": title, "note": note})
            elif kind == "meeting_hq":
                ev = str(e.get("event") or "")
                if ev not in mine_hqless:
                    frappe.throw("That meeting is not one of yours with no HQ on this day.")
                x = mine_hqless[ev]
                n_meet = n_meet + 1
                lines.append("HQ for " + str(x.custom_other_type or "meeting") + " · " + str(x.subject or ev) + " · " + hq)
                sections.append("<p><b>HQ for " + esc(x.custom_other_type or "meeting") + "</b> · " + esc(x.subject or ev) + " → " + esc(hq) + "</p>")
                clean_entries.append({"type": kind, "event": ev, "hq": hq, "title": str(x.subject or ""), "other_type": str(x.custom_other_type or "")})
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
        data = {"employee": emp.name, "employee_name": emp.employee_name, "date": day, "field_expense_day": fed.name, "entries": clean_entries}
        body = ("<p><b>" + esc(emp.employee_name) + " (" + esc(emp.name) + ") reports for " + label + ":</b></p>"
                + "<p>" + esc(chr(10).join(lines)).replace(chr(10), "<br>") + "</p>" + "".join(sections)
                + "<p>Waiting for " + esc(NR["names"](rt.get("approvers"))) + " to approve in the app (Claims → Non-reported days). "
                + "On approval the events are made and the day is recalculated.</p>"
                + "<pre>" + esc(json.dumps(data, indent=1)) + "</pre>")
        t = frappe.get_doc({"doctype": "Task", "subject": subject, "project": PROJECT, "status": "Open", "priority": "Medium",
                            "exp_start_date": day, "exp_end_date": day, "description": body}).insert(ignore_permissions=True)
        for u in rt.get("approvers") + rt.get("escalation"):
            if u in rt.get("approvers"):
                frappe.get_doc({"doctype": "ToDo", "allocated_to": u, "reference_type": "Task", "reference_name": t.name,
                                "description": subject, "priority": "Medium", "date": day, "assigned_by": user}).insert(ignore_permissions=True)
            sh = frappe.get_doc({"doctype": "DocShare", "share_doctype": "Task", "share_name": t.name, "user": u,
                                 "read": 1, "write": 0, "share": 0, "notify_by_email": 0})
            sh.flags.ignore_share_permission = True
            sh.insert(ignore_permissions=True)
        r = frappe.db.get_value("Task", t.name, TASK_FIELDS, as_dict=True)
        frappe.response["message"] = {"ok": 1, "task": shape(r, {}, user)}

    elif action == "list":
        if not emp:
            frappe.throw("No active employee is linked to this login.")
        d_from = iso(fd.get("from"))
        d_to = iso(fd.get("to")) or d_from
        if not d_from or d_to < d_from:
            frappe.throw("Which month is this about?")
        rows = frappe.get_all("Task", filters={"project": PROJECT, "subject": ["like", PREFIX + "%"], "exp_start_date": ["between", [d_from, d_to]],
                                               "description": ["like", "%&quot;employee&quot;: &quot;" + emp.name + "&quot;%"]},
                              fields=TASK_FIELDS, order_by="creation desc", limit_page_length=200)
        rep = replies_of([r.name for r in rows])
        frappe.response["message"] = {"tasks": [shape(r, rep, user) for r in rows]}

    elif action == "route":
        # who would approve: the caller's own, or anyone's for a System Manager
        target = emp.name if emp else None
        if fd.get("employee") and frappe.db.exists("Has Role", {"parent": user, "parenttype": "User", "role": "System Manager"}):
            target = str(fd.get("employee"))
        if not target:
            frappe.throw("No active employee is linked to this login.")
        rt = NR["route"](target)
        frappe.response["message"] = {"employee": target, "approver_seat": rt.get("seat"), "approver_names": NR["names"](rt.get("approvers")),
                                      "escalation_seat": rt.get("esc_seat"), "escalation_names": NR["names"](rt.get("escalation")) if rt.get("escalation") else ""}

    elif action == "hqless":
        if not emp:
            frappe.throw("No active employee is linked to this login.")
        day = iso(fd.get("date"))
        if not day:
            frappe.throw("Which day?")
        frappe.response["message"] = {"events": [{"name": x.name, "type": x.custom_other_type or "Other", "subject": x.subject or ""} for x in hqless_events(emp.name, day)]}

    elif action == "queue":
        rows = frappe.get_all("Task", filters={"project": PROJECT, "subject": ["like", PREFIX + "%"], "status": ["in", OPEN]},
                              fields=TASK_FIELDS, order_by="exp_start_date asc", limit_page_length=500)
        pending = []
        for r in rows:
            x = shape(r, {}, user)
            if x["can"]:
                pending.append(x)
        since = frappe.utils.add_days(today, -30)
        done = frappe.get_all("Task", filters={"project": PROJECT, "subject": ["like", PREFIX + "%"], "status": ["in", ["Completed", "Cancelled"]],
                                               "modified": [">=", since], "completed_by": user},
                              fields=TASK_FIELDS, order_by="modified desc", limit_page_length=60)
        rep = replies_of([r.name for r in pending] + [r.name for r in done])
        for x in pending:
            x["replies"] = rep.get(x["name"], [])
        frappe.response["message"] = {"pending": pending, "recent": [shape(r, rep, user) for r in done],
                                      "approver": bool(pending) or bool(done) or bool(frappe.get_all("Employee", filters={"reports_to": (emp.name if emp else "-"), "status": "Active"}, limit_page_length=1))}

    elif action == "decide":
        name = str(fd.get("name") or "")
        decision = str(fd.get("decision") or "")
        note = " ".join(str(fd.get("note") or "").split())[:1000]
        if decision not in ["Approve", "Reject"]:
            frappe.throw("Approve or Reject?")
        r = frappe.db.get_value("Task", name, TASK_FIELDS, as_dict=True) if name else None
        if not r or not str(r.subject or "").startswith(PREFIX):
            frappe.throw("Not a non-reported day request.")
        if r.status not in OPEN:
            frappe.throw("Already " + ("approved" if r.status == "Completed" else "decided") + ".")
        d = task_data(r.description)
        e_id = d.get("employee")
        day = iso(d.get("date"))
        rep = frappe.db.get_value("Employee", e_id, ["name", "employee_name", "user_id", "custom_role_profile", "reports_to", "department"], as_dict=True)
        if not rep or not day:
            frappe.throw("This request has no employee or day.")
        rt = NR["route"](e_id)
        who = NR["can"](user, rep.user_id, rt, r.creation, today)
        if not who:
            frappe.throw("Only " + NR["names"](rt.get("approvers")) + " can decide this.", frappe.PermissionError)
        if decision == "Reject" and len(note) < 3:
            frappe.throw("Say why it is rejected — the employee sees it.")
        me_name = (NR["emp"](emp.name) or {}).get("employee_name") if emp else user
        made = []
        if decision == "Approve":
            seat = rep.custom_role_profile or ""
            parent_seat = frappe.db.get_value("Role Profile", seat, "parent_role_profile") if seat else None
            base = {"custom_employee_id": rep.name, "custom_role_profile": seat, "custom_reporting_to": parent_seat or "",
                    "custom_department": rep.department or "", "custom_reporting_emp": rep.reports_to or "",
                    "status": "Completed", "all_day": 1}
            reason = "Non-reported day, approved by " + str(me_name or user) + " (" + r.name + ")"
            ups = NR["upline"](rep.name)
            for en in d.get("entries") or []:
                kind = en.get("type")
                if kind == "doctor_visit":
                    for doc_ in en.get("doctors") or []:
                        ev = frappe.get_doc(dict(base, **{"doctype": "Event", "subject": str(doc_.get("name") or doc_.get("id")) + "-Visit-Reported",
                                                          "event_category": "Doctor Visit plan", "event_type": "Private", "color": "#16A34A",
                                                          "starts_on": day + " 00:00:00", "ends_on": day + " " + VISIT_TIME,
                                                          "custom_doctor": doc_.get("id"), "custom_hq": en.get("hq"), "description": en.get("note") or "",
                                                          "event_participants": [{"reference_doctype": "Employee", "reference_docname": rep.name,
                                                                                  "custom_visit_time": day + " " + VISIT_TIME, "custom_is_force_visit": 1,
                                                                                  "custom_force_visit_reason": reason}]}))
                        ev.insert(ignore_permissions=True)
                        made.append(ev.name)
                elif kind == "meeting" or kind == "other":
                    ot = "Meeting" if kind == "meeting" else en.get("other_type")
                    ev = frappe.get_doc(dict(base, **{"doctype": "Event", "subject": en.get("title") or ot, "event_category": "Other",
                                                      "custom_other_type": ot, "event_type": "Public", "color": "#2563EB",
                                                      "starts_on": day + " " + VISIT_TIME, "custom_hq_territory": en.get("hq"),
                                                      "description": ((en.get("note") or "") + " — " + reason).strip(" —")}))
                    ev.insert(ignore_permissions=True)
                    made.append(ev.name)
                elif kind == "meeting_hq":
                    evn = en.get("event")
                    if evn and frappe.db.exists("Event", evn) and not frappe.db.get_value("Event", evn, "custom_hq_territory"):
                        frappe.db.set_value("Event", evn, "custom_hq_territory", en.get("hq"))
                        frappe.get_doc({"doctype": "Comment", "comment_type": "Comment", "reference_doctype": "Event", "reference_name": evn,
                                        "content": "HQ " + str(en.get("hq")) + " set — " + reason}).insert(ignore_permissions=True)
                        made.append(evn)
            # the events are the rep's: his name as owner, shared up his line as the planner does
            for evn in made:
                if frappe.db.get_value("Event", evn, "owner") != rep.user_id and rep.user_id:
                    frappe.db.set_value("Event", evn, "owner", rep.user_id, update_modified=False)
                for u in ups:
                    if u and u != rep.user_id and not frappe.db.exists("DocShare", {"share_doctype": "Event", "share_name": evn, "user": u}):
                        sh = frappe.get_doc({"doctype": "DocShare", "share_doctype": "Event", "share_name": evn, "user": u,
                                             "read": 1, "write": 1, "share": 0, "notify_by_email": 0})
                        sh.flags.ignore_share_permission = True
                        sh.insert(ignore_permissions=True)
        d["decision"] = {"decision": decision, "by": user, "by_name": me_name, "as": who, "on": frappe.utils.now(), "note": note, "events": made}
        desc = str(r.description or "")
        k = desc.rfind("<pre>")
        desc = (desc[:k] if k >= 0 else desc) + ("<p><b>" + ("Approved" if decision == "Approve" else "Rejected") + "</b> by " + esc(me_name or user)
                                                 + (" — " + esc(note) if note else "") + (" · events " + esc(", ".join(made)) if made else "") + "</p>"
                                                 + "<pre>" + esc(json.dumps(d, indent=1)) + "</pre>")
        frappe.db.set_value("Task", r.name, {"status": "Completed" if decision == "Approve" else "Cancelled", "completed_by": user,
                                             "completed_on": today, "description": desc})
        for td in frappe.get_all("ToDo", filters={"reference_type": "Task", "reference_name": r.name, "status": "Open"}, pluck="name"):
            frappe.db.set_value("ToDo", td, "status", "Closed")
        if note:
            frappe.get_doc({"doctype": "Comment", "comment_type": "Comment", "reference_doctype": "Task", "reference_name": r.name,
                            "content": ("Approved: " if decision == "Approve" else "Rejected: ") + esc(note)}).insert(ignore_permissions=True)
        # re-run the month on the engine service: only days whose figures changed are saved
        recalc = None
        if decision == "Approve":
            try:
                st = frappe.get_doc("API Settings")
                url = st.get("fx_engine_url")
                key = st.get_password("fx_engine_key", raise_exception=False)
                if url and key:
                    recalc = frappe.make_post_request(url.rstrip("/") + "/recalc", headers={"x-fx-key": key, "Content-Type": "application/json"},
                                                      data=json.dumps({"month": day[:7], "reason": "non-reported day " + r.name + " approved"}))
            except Exception as ex:
                frappe.log_error("Field Non-Reported Day: engine call failed for " + r.name + ": " + str(ex)[:300], "Field Non-Reported Day API")
                recalc = {"error": "engine not reached — the nightly run will pick it up"}
        r2 = frappe.db.get_value("Task", r.name, TASK_FIELDS, as_dict=True)
        frappe.response["message"] = {"ok": 1, "task": shape(r2, replies_of([r.name]), user), "events": made, "recalc": recalc}

    else:
        frappe.throw("Unknown action.")


main()
