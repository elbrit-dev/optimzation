# Server Script "Field Trip Help API" -- type API, method field_trip_help
# (16 Nov 2026). The planner's "Something wrong? Help" on a trip or a day:
# replaces the Helpdesk ticket (nobody worked those) with a TASK, the way the
# login-help form files its "Cannot log in" Tasks.
#
# Called by the app with the REP'S OWN token (reps cannot read or write Task
# themselves -- this script reads with get_all and writes with
# ignore_permissions):
#
#   action=raise   trip_id, kind (OS | EQ | HQ), from, to (yyyy-mm-dd),
#                  title (the trip's name), message (the rep's words, 5+
#                  characters), details (the trip / day as the app shows it:
#                  each day's type, route, km, visits, TA, DA, the claim)
#     -> { ok: 1, task: { name, status, ... } }
#        A Task in "Expense claim" (PROJECT) -- subject "TA/DA help · ...",
#        the rep's words and the details in the description, expected dates =
#        the trip's -- ASSIGNED to ASSIGNEE (a ToDo) and SHARED with SHARE_WITH.
#        At most MAX_OPEN unfinished requests per trip.
#        SETTLEMENT BILL HELP (24 Nov 2026, the user: "help like in the
#        planner" on the Add-a-bill form, once the photo is in):
#          source=settlement  from = to = the bill's date, title = what it was
#                             for, details = the form as filled (and as read)
#          file=<file_url>    the bill photo -- the caller's OWN private File,
#                             not attached to anything yet -- attached to the
#                             Task, so the team opens it there
#   action=list    from, to
#     -> { tasks: [{ name, status, subject, creation, modified, completed_on,
#                    description, assigned, replies: [{ by, at, content }] }] }
#        The rep's OWN requests on that trip (owner = the rep), newest first,
#        with the comments on each (what the team wrote back).
#   action=month   from, to (the month's first and last day)   (24 Nov 2026)
#     -> { tasks: [{ name, status, from, to, creation, team_replies, last_reply }] }
#        Every planner request of the rep's on a trip starting in that range,
#        light (no description): the trip cards colour their tickets from it --
#        raised (no reply from the team), in progress (a reply, not done),
#        resolved (Completed / Cancelled).
#   action=reply   name, message                                (24 Nov 2026)
#     -> { ok: 1, reply: { by, mine, at, content } }
#        The rep answers inside their OWN request (a comment on the Task),
#        while it is not done. The team sees it on the Task as usual.
#   action=settle                                               (24 Nov 2026)
#     -> { tasks: [{ name, status, subject, creation, modified, completed_on,
#                    description, replies: [{ by, mine, at, content }] }] }
#        The rep's OWN settlement-bill help requests (the Settlements page
#        card), newest first, any date, with every comment.
#
# safe_exec: no import, no .format(), no set literals, no tuple unpacking,
# and a def sees only its own arguments.

PROJECT = "PROJ-2026-2027-0016"               # "Expense claim"
ASSIGNEE = "sathish.admin@elbrit.org"         # Sathishkumar Kumaresan
# 16 Nov 2026: hr@ replaced by Vikram Babu and Sivaraman R (HR); Vishnu K (MIS) added
SHARE_WITH = ["baranidharan@elbrit.org", "vigneshkumar.s@elbrit.org", "sanjay@elbrit.org",
              "vikram.babu@elbrit.org", "sivaraman.hr@elbrit.org", "vishnuk.mis@elbrit.org"]
MAX_OPEN = 5
OPEN = ["Open", "Working", "Pending Review", "Overdue"]


def esc(s):
    return str(s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def iso(s):
    s = str(s or "")[:10]
    if len(s) == 10 and s[4] == "-" and s[7] == "-" and s[:4].isdigit() and s[5:7].isdigit() and s[8:].isdigit():
        return s
    return None


fd = frappe.form_dict
action = str(fd.get("action") or "list")
user = frappe.session.user
emp = None
if user and user != "Guest":
    emp = frappe.db.get_value("Employee", {"user_id": user, "status": "Active"}, ["name", "employee_name"], as_dict=True)
if not emp:
    frappe.throw("No active employee is linked to this login.")

d_from = iso(fd.get("from"))
d_to = iso(fd.get("to")) or d_from
if action not in ["reply", "settle"] and (not d_from or d_to < d_from):
    frappe.throw("Which trip is this about?")

# the planner's own requests only -- a settlement bill's help (same project,
# from = to = the bill's date) never shows on a trip
mine = {"owner": user, "project": PROJECT, "exp_start_date": d_from, "exp_end_date": d_to, "subject": ["not like", "Settlement help%"]}

if action == "raise":
    message = str(fd.get("message") or "").strip()[:1000]
    if len(message) < 5:
        frappe.throw("Write what is wrong (a few words at least).")
    details = str(fd.get("details") or "").strip()[:8000]
    kind = str(fd.get("kind") or "")[:4]
    title = str(fd.get("title") or "").strip()[:60]
    open_now = frappe.get_all("Task", filters={"owner": user, "project": PROJECT, "exp_start_date": d_from,
                                                 "exp_end_date": d_to, "status": ["in", OPEN]}, pluck="name")
    if len(open_now) >= MAX_OPEN:
        frappe.throw("You already have " + str(len(open_now)) + " open requests on this trip — wait for a reply on those.")
    span = d_from if d_from == d_to else d_from + " to " + d_to
    settle = str(fd.get("source") or "") == "settlement"
    # the bill photo (settlement help): only the caller's own private File, not
    # attached to anything yet -- never someone else's
    photo = None
    furl = str(fd.get("file") or "").strip()[:300]
    if furl:
        hit = frappe.get_all("File", filters={"file_url": furl, "owner": user, "is_private": 1}, fields=["name", "file_url", "attached_to_name"],
                             order_by="creation desc", limit_page_length=1)
        if not hit or hit[0].attached_to_name:
            frappe.throw("That photo is not yours to send -- add the bill photo again.")
        photo = hit[0]
    subject = (("Settlement help · " if settle else "TA/DA help · ") + (kind + " " if kind else "") + (title + " · " if title else "") + span
               + " — " + str(emp.employee_name or "") + " (" + emp.name + ")")[:140]
    body = ("<p><b>" + esc(emp.employee_name) + " (" + esc(emp.name) + ") asks:</b></p>"
            + "<p>" + esc(message).replace(chr(10), "<br>") + "</p>"
            + "<p><b>" + ("The bill as the app shows it (not saved yet):" if settle else "The " + ("day" if d_from == d_to else "trip") + " as the app shows it:") + "</b></p>"
            + "<pre>" + esc(details) + "</pre>"
            + ("<p>Bill photo: <a href=\"" + esc(photo.file_url) + "\">open it</a> (attached to this task)</p>" if photo else "")
            + ("<p>Raised from the Settlements \"Add a bill\" form. Reply with a comment here.</p>" if settle
               else "<p>Trip id: " + esc(str(fd.get("trip_id") or d_from)[:40]) + " · raised from the Field TA/DA planner. "
               + "Reply with a comment here: the employee sees it on the trip.</p>"))
    t = frappe.get_doc({
        "doctype": "Task",
        "subject": subject,
        "project": PROJECT,
        "status": "Open",
        "priority": "Medium",
        "exp_start_date": d_from,
        "exp_end_date": d_to,
        "description": body,
    }).insert(ignore_permissions=True)
    # the photo goes on the Task: whoever may open the Task may open it
    if photo:
        frappe.db.set_value("File", photo.name, {"attached_to_doctype": "Task", "attached_to_name": t.name})
    # assigned: the ToDo puts it in the assignee's list (and on the Task's _assign)
    frappe.get_doc({
        "doctype": "ToDo",
        "allocated_to": ASSIGNEE,
        "reference_type": "Task",
        "reference_name": t.name,
        "description": subject,
        "priority": "Medium",
        "date": d_to,
        "assigned_by": user,
    }).insert(ignore_permissions=True)
    # shared: read and write, with a notification. The rep has no Share right
    # on Task: without ignore_share_permission the ERP refuses it ("You need
    # to have Share permission") and the whole request is undone.
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
    frappe.response["message"] = {"ok": 1, "task": {"name": t.name, "status": t.status, "subject": subject,
                                                    "creation": str(t.creation), "modified": str(t.modified),
                                                    "completed_on": None, "description": body,
                                                    "assigned": [ASSIGNEE], "replies": []}}

elif action == "list":
    rows = frappe.get_all("Task", filters=mine,
                          fields=["name", "status", "subject", "creation", "modified", "completed_on", "description", "_assign"],
                          order_by="creation desc", limit_page_length=20)
    names = [r.name for r in rows]
    replies = {}
    if names:
        for c in frappe.get_all("Comment", filters={"reference_doctype": "Task", "reference_name": ["in", names],
                                                    "comment_type": "Comment"},
                                fields=["reference_name", "content", "comment_by", "comment_email", "owner", "creation"],
                                order_by="creation asc", limit_page_length=200):
            replies.setdefault(c.reference_name, []).append({
                "by": c.comment_by or c.comment_email or c.owner,
                "mine": (c.comment_email or c.owner) == user,
                "at": str(c.creation),
                "content": c.content,
            })
    out = []
    for r in rows:
        # _assign is '["a@elbrit.org", "b@elbrit.org"]' (no frappe.parse_json
        # here; read as a key -- r._assign is refused, names may not start with "_")
        assigned = []
        for a in str(r.get("_assign") or "").strip("[]").split(","):
            a = a.strip().strip('"').strip()
            if a:
                assigned.append(a)
        out.append({"name": r.name, "status": r.status, "subject": r.subject, "creation": str(r.creation),
                    "modified": str(r.modified), "completed_on": str(r.completed_on) if r.completed_on else None,
                    "description": r.description, "assigned": assigned, "replies": replies.get(r.name, [])})
    frappe.response["message"] = {"tasks": out}

elif action == "month":
    rows = frappe.get_all("Task", filters={"owner": user, "project": PROJECT, "subject": ["not like", "Settlement help%"],
                                           "exp_start_date": ["between", [d_from, d_to]]},
                          fields=["name", "status", "exp_start_date", "exp_end_date", "creation"],
                          order_by="creation desc", limit_page_length=200)
    names = [r.name for r in rows]
    team = {}
    last = {}
    if names:
        for c in frappe.get_all("Comment", filters={"reference_doctype": "Task", "reference_name": ["in", names], "comment_type": "Comment"},
                                fields=["reference_name", "comment_email", "owner", "creation"], order_by="creation asc", limit_page_length=1000):
            if (c.comment_email or c.owner) != user:
                team[c.reference_name] = (team.get(c.reference_name) or 0) + 1
                last[c.reference_name] = str(c.creation)
    out = []
    for r in rows:
        out.append({"name": r.name, "status": r.status, "from": str(r.exp_start_date or ""), "to": str(r.exp_end_date or ""),
                    "creation": str(r.creation), "team_replies": team.get(r.name) or 0, "last_reply": last.get(r.name)})
    frappe.response["message"] = {"tasks": out}

elif action == "settle":
    # the Settlements page's help card: the rep's settlement-bill requests
    rows = frappe.get_all("Task", filters={"owner": user, "project": PROJECT, "subject": ["like", "Settlement help%"]},
                          fields=["name", "status", "subject", "creation", "modified", "completed_on", "description"],
                          order_by="creation desc", limit_page_length=30)
    names = []
    for r in rows:
        names.append(r.name)
    replies = {}
    if names:
        for c in frappe.get_all("Comment", filters={"reference_doctype": "Task", "reference_name": ["in", names], "comment_type": "Comment"},
                                fields=["reference_name", "content", "comment_by", "comment_email", "owner", "creation"],
                                order_by="creation asc", limit_page_length=500):
            got = replies.get(c.reference_name) or []
            got.append({"by": c.comment_by or c.comment_email or c.owner, "mine": (c.comment_email or c.owner) == user,
                        "at": str(c.creation), "content": c.content})
            replies[c.reference_name] = got
    out = []
    for r in rows:
        out.append({"name": r.name, "status": r.status, "subject": r.subject, "creation": str(r.creation), "modified": str(r.modified),
                    "completed_on": str(r.completed_on) if r.completed_on else None, "description": r.description,
                    "replies": replies.get(r.name) or []})
    frappe.response["message"] = {"tasks": out}

elif action == "reply":
    name = str(fd.get("name") or "")[:40]
    message = str(fd.get("message") or "").strip()[:1000]
    if len(message) < 2:
        frappe.throw("Write your reply first.")
    t = frappe.db.get_value("Task", name, ["name", "owner", "project", "status"], as_dict=True) if name else None
    if not t or t.owner != user or t.project != PROJECT:
        frappe.throw("That is not your request.", frappe.PermissionError)
    if t.status in ["Completed", "Cancelled"]:
        frappe.throw("This request is closed -- raise a new one if something is still wrong.")
    c = frappe.get_doc({
        "doctype": "Comment",
        "comment_type": "Comment",
        "reference_doctype": "Task",
        "reference_name": t.name,
        "comment_email": user,
        "comment_by": str(emp.employee_name or user),
        "content": esc(message).replace(chr(10), "<br>"),
    }).insert(ignore_permissions=True)
    frappe.response["message"] = {"ok": 1, "reply": {"by": str(emp.employee_name or user), "mine": True, "at": str(c.creation), "content": c.content}}

else:
    frappe.throw("Unknown action.")
