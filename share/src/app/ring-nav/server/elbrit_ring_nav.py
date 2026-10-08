# =====================================================================
# SERVER SCRIPT — the source of truth for the ERP's copy. Keep in step.
#
#   Name        : Elbrit Ring Nav
#   Script Type : API
#   API Method  : elbrit_ring_nav
#   Allow Guest : NO
#
#   GET /api/method/elbrit_ring_nav
#   GET /api/method/elbrit_ring_nav?month=2026-09     entries of that month
#   GET /api/method/elbrit_ring_nav?today=2026-10-03  as if it were that day
#
# THE CALENDAR. A month's secondary is keyed in during the next month
# (July's trackers were all raised in August on production), due by
# its task's due day — SECONDARY AND DOCTOR SUPPORT THE 10TH (TASKS
# "due_day"; ENTRY_DUE_DAY otherwise. A due day past a month's last day
# would be that last day, so 31 means "month end"):
#   - the entry month is LAST month (`month` overrides it);
#   - the Secondary entry tile is on the strip from ENTRY_FROM_DAY to the
#     due day, its caption the due date, "10 Oct", while anything is left —
#     except for users whose Role Profile is "IT", who see it every day;
#   - the approval tile keeps the same window — for IT too: past the due
#     day nobody gets it — and the same due date as its caption while
#     anything waits;
#     its "approved" counts that same month.
# `today` stands in for the server's date — to preview the strip on the 3rd.
#
# The Elbrit app's Ring Nav tiles for the CALLER, ready to draw: the app
# renders `items` as they come. READ-ONLY, and AS THE CALLER: every count
# is a frappe.get_list, so the ERP's own permissions decide what is counted
# — the same rows the caller sees on Secondary Entry and Secondary
# Approval. Nothing here decides who approves whom; no raw SQL.
#
# Answer:
#   { "user", "seat", "month", "items": [ <tile>, ... ] }
# A tile is Ring Nav's item: { id, label, href, icon, statusIcon,
#   statusTone, count, caption, captionTone, segments: [{ key, value,
#   tone, label }] }. Entry tiles first, then approval tiles. More tasks
#   (support, service...) are more tiles.
#
# TWO TASKS, the same rules (TASKS below): SECONDARY (Secondary Data Entry,
# per stockist) and DOCTOR SUPPORT (Doctor Support, per doctor). Each gets an
# entry tile and an approval tile as described here for Secondary. A task
# marked "it_only" in TASKS gives its tiles to the IT role profile alone
# (none is, now: Doctor Support is open to everyone).
#
# SECONDARY ENTRY — every entry the caller may see for the entry month (the
# "Secondary Data Entry Permission Query" decides), each in ONE bucket for
# the caller's seat (their active Employee's custom_role_profile). Within an entry only
# the seat's lines count — an entry carries several seats' lines:
#   approved  its approval row says "... Approved and Waiting for
#             Verification" or verified — green at once, MIS verifying is
#             not waited for — whatever its lines say
#   rejected  its approval row says Rejected, or Rework (sent back while
#             waiting) — back to the BE (likewise)
#   draft     otherwise: none of the seat's lines yet, or any still Draft
#   waiting   otherwise: all out of Draft, "... Approval Waiting" (or no
#             row yet)
# A decided approval (approved / rejected) wins over Draft lines: it proves
# the seat submitted.
# The approval's state is read from the entry's status rows: a BE cannot
# read their own trackers.
#
# NO SEAT, IT ROLE PROFILE — an OVERVIEW instead: every stockist x seat
# across the entries they may see, bucketed the same way (a seat's lines on
# an entry are one unit, as one approval; an entry with no lines at all is
# one draft unit). Anyone else without a seat gets no entry tile.
#
# SECONDARY APPROVAL — for someone with work waiting on them, and for every
# MANAGER (anyone with people under them in the reporting chain), in the
# entry window, for the entry month (last month — as the Approval screen
# shows). Waiting on them: a Secondary tracker in "... Approval Waiting"
# whose next_approver is the caller — or, for a manager, any of their
# team's trackers waiting on anyone (read past permissions, their subtree
# only). A BE, with no team and nothing waiting, gets none.
#   waiting   the PEOPLE (sales persons who raised figures) with at least
#             one of those trackers — not stockists: one person raises many
#   approved  the PEOPLE whose every tracker of the month the caller can see
#             (the "Operational Tracker Restriction" decides) is approved —
#             from "Waiting for Verification" on; "... Verification Rejected"
#             is not. A tracker's month is its record's own `date` field.
# The IT role profile ALWAYS gets it, as an overview: the people with anything
# of the entry month waiting, and the people fully approved.
#
# safe_exec: no import, no .format(), no set literals, no tuple
# unpacking, no underscore-prefixed names.
# =====================================================================

HREFS = {"secondary-entry": "/secondary/entry",
         "secondary-approval": "/secondary/approval",
         "doctor-support-entry": "/doctor-support/entry",
         "doctor-support-approval": "/doctor-support/approval"}
ENTRY_FROM_DAY = 1
ENTRY_DUE_DAY = 10     # default due day; a task's "due_day" overrides it (past the month's end would mean its last day)
ALWAYS_ROLE_PROFILE = "IT"   # users with this Role Profile see the tiles every day
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
          "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def bucket_of(ws):
    s = (ws or "").lower()
    if not s:
        return "waiting"
    if "rejected" in s or s == "rework":
        return "rejected"
    if s.endswith("approval waiting"):
        return "waiting"
    if "approved" in s or "verified" in s:
        return "approved"
    return "waiting"


def valid_month(m):
    if not m or len(m) != 7 or m[4] != "-":
        return False
    return m[:4].isdigit() and m[5:].isdigit() and 1 <= int(m[5:]) <= 12


def valid_date(d):
    if not d or len(d) != 10 or d[4] != "-" or d[7] != "-":
        return False
    return (d[:4].isdigit() and d[5:7].isdigit() and d[8:].isdigit()
            and valid_month(d[:7]) and 1 <= int(d[8:]) <= 31)


def month_before(m):
    y = int(m[:4])
    mo = int(m[5:])
    if mo == 1:
        return str(y - 1) + "-12"
    return str(y) + "-" + ("0" if mo - 1 < 10 else "") + str(mo - 1)


def count(doctype, filters):
    rows = frappe.get_list(doctype, filters=filters,
                           fields=["count(name) as n"], limit_page_length=0)
    return int((rows[0].get("n") if rows else 0) or 0)


me = frappe.session.user
today = frappe.form_dict.get("today") or ""
if not valid_date(today):
    today = frappe.utils.nowdate()
day = int(today[8:])
month = frappe.form_dict.get("month") or ""
if not valid_month(month):
    month = month_before(today[:7])
# The user's Role Profile — the one on the User, or any of several where
# the ERP allows more than one (the "User Role Profile" table).
always = frappe.db.get_value("User", me, "role_profile_name") == ALWAYS_ROLE_PROFILE
if not always:
    try:
        always = bool(frappe.db.exists("User Role Profile", {
            "parenttype": "User", "parent": me,
            "role_profile": ALWAYS_ROLE_PROFILE}))
    except Exception:
        always = False
# The due day, capped at this month's last day — so 31 is "the end of the
# month" every month, February included.
last_day = int(str(frappe.utils.get_last_day(today))[8:10])
due_day = ENTRY_DUE_DAY if ENTRY_DUE_DAY < last_day else last_day


def window_of(task):
    # A task's own due day (TASKS "due_day", else ENTRY_DUE_DAY), capped at
    # this month's last day. The window both its tiles keep: ENTRY_FROM_DAY
    # to the due day, the due day's end included. The entry tile shows for
    # the IT role profile on any day; the approval tile never past the due
    # day, IT included.
    d = task.get("due_day") or ENTRY_DUE_DAY
    d = d if d < last_day else last_day
    open_now = ENTRY_FROM_DAY <= day <= d
    return {"open": open_now, "entry": always or open_now,
            "label": str(d) + " " + MONTHS[int(today[5:7]) - 1]}
first = month + "-01"
last = str(frappe.utils.get_last_day(first))
in_month = ["date", "between", [first, last]]

emp = frappe.get_list("Employee",
                      filters={"user_id": me, "status": "Active"},
                      fields=["name", "role_id", "custom_role_profile"],
                      limit_page_length=1)
seat = ""
if emp:
    # custom_role_profile, as the ERP's tracker scripts route on it: role_id
    # is stale for some people (an old seat, e.g. from before a promotion).
    seat = emp[0].get("custom_role_profile") or emp[0].get("role_id") or ""

# ---- THE CALLER'S TEAM: the seats of everyone under them in the reporting
# chain (Employee reports_to, any depth). A manager's approval tile counts
# their whole team, as their Approval screen lists it — read past
# permissions (frappe.get_all), for that subtree only.
team_seats = {}
if emp and emp[0].get("name"):
    frontier = [emp[0].get("name")]
    reached = {frontier[0]: 1}
    hops = 0
    while frontier and hops < 8:
        hops = hops + 1
        below = []
        i = 0
        while i < len(frontier):
            part = frontier[i:i + 500]
            i = i + 500
            for e in frappe.get_all("Employee",
                                    filters=[["reports_to", "in", part], ["status", "=", "Active"]],
                                    fields=["name", "custom_role_profile"], limit_page_length=0):
                if reached.get(e.get("name")):
                    continue
                reached[e.get("name")] = 1
                below.append(e.get("name"))
                if e.get("custom_role_profile"):
                    team_seats[e.get("custom_role_profile")] = 1
        frontier = below
has_team = len(team_seats) > 0


def is_vacant_name(n):
    return (n or "")[:6].lower() == "vacant"


def owner_seat(s):
    # The seat whose approval carries `s`'s lines — as the ERP's tracker
    # scripts (src/app/tracker/server) raise it: `s` itself when someone real
    # holds it; else the nearest seat above with a live holder, up reports_to
    # from its placeholder holder, or up the Role Profile tree when no one
    # holds it.
    holders = frappe.get_all("Employee", filters={"custom_role_profile": s, "status": "Active"},
                             fields=["employee_name", "reports_to"], limit=20)
    climb = None
    for h in holders:
        if not is_vacant_name(h.get("employee_name")):
            return s
        if climb is None:
            climb = h.get("reports_to")
    if holders:
        cur = climb
        hops = 0
        while cur and hops < 15:
            hops = hops + 1
            m = frappe.db.get_value("Employee", cur,
                                    ["employee_name", "status", "reports_to", "custom_role_profile"], as_dict=True)
            if not m:
                break
            if m.get("status") == "Active" and not is_vacant_name(m.get("employee_name")) and m.get("custom_role_profile"):
                return m.get("custom_role_profile")
            cur = m.get("reports_to")
        return s
    cur = frappe.db.get_value("Role Profile", s, "parent_role_profile")
    hops = 0
    while cur and hops < 15:
        hops = hops + 1
        for h in frappe.get_all("Employee", filters={"custom_role_profile": cur, "status": "Active"},
                                fields=["employee_name"], limit=20):
            if not is_vacant_name(h.get("employee_name")):
                return cur
        cur = frappe.db.get_value("Role Profile", cur, "parent_role_profile")
    return s


# ---- THE VACANT SEATS THE CALLER COVERS, as Elbrit Secondary Entry finds
# them: the seats below theirs, at any level, that no Active Employee holds,
# and the seats held only by "Vacant_" placeholders below them in the
# reporting chain (walked through placeholders only). Their records count in
# the caller's own entry tile — the caller enters them.
covered = []
if seat:
    for r in frappe.get_all("Role Profile", filters={"parent_role_profile": seat}, pluck="name"):
        if (r or "").startswith("BE") and not frappe.get_all(
                "Employee", filters={"custom_role_profile": r, "status": "Active"}, limit=1):
            covered.append(r)
if emp and emp[0].get("name"):
    frontier = [emp[0].get("name")]
    reached = {frontier[0]: 1}
    hops = 0
    while frontier and hops < 8:
        hops = hops + 1
        below = []
        for e in frappe.get_all("Employee", filters=[["reports_to", "in", frontier], ["status", "=", "Active"]],
                                fields=["name", "employee_name", "custom_role_profile"], limit_page_length=0):
            if reached.get(e.get("name")) or not is_vacant_name(e.get("employee_name")):
                continue
            reached[e.get("name")] = 1
            below.append(e.get("name"))
            s = e.get("custom_role_profile")
            if not s or s in covered:
                continue
            live = 0
            for h in frappe.get_all("Employee", filters={"custom_role_profile": s, "status": "Active"},
                                    fields=["employee_name"], limit_page_length=20):
                if not is_vacant_name(h.get("employee_name")):
                    live = 1
            if not live:
                covered.append(s)
        frontier = below
# ... and the seats below theirs, at any level, that no Active Employee holds,
# down the Role Profile tree through seats with no live holder.
if seat:
    frontier = [seat]
    reached = {seat: 1}
    hops = 0
    while frontier and hops < 8:
        hops = hops + 1
        kids = []
        for r in frappe.get_all("Role Profile", filters=[["parent_role_profile", "in", frontier]], pluck="name"):
            if not reached.get(r):
                reached[r] = 1
                kids.append(r)
        held = {}
        live = {}
        if kids:
            for e in frappe.get_all("Employee", filters=[["custom_role_profile", "in", kids], ["status", "=", "Active"]],
                                    fields=["custom_role_profile", "employee_name"], limit_page_length=0):
                held[e.get("custom_role_profile")] = 1
                if not is_vacant_name(e.get("employee_name")):
                    live[e.get("custom_role_profile")] = 1
        below = []
        for k in kids:
            if live.get(k):
                continue
            below.append(k)
            if not held.get(k) and k not in covered:
                covered.append(k)
        frontier = below
# ... and, for an EXTRA USER, every seat under theirs: they enter and approve
# for their whole team (the list is copied by hand into Elbrit Secondary
# Entry, Elbrit Doctor Support Entry, Operational Tracker Restriction and the
# "Approval flow" steps: change them all together).
EXTRA_USERS = ["kamesh@elbrit.org", "ramu@elbrit.org"]
if me in EXTRA_USERS and seat:
    frontier = [seat]
    reached = {seat: 1}
    hops = 0
    while frontier and hops < 10:
        hops = hops + 1
        below = []
        for r in frappe.get_all("Role Profile", filters=[["parent_role_profile", "in", frontier]], pluck="name"):
            if not reached.get(r):
                reached[r] = 1
                below.append(r)
                if r not in covered:
                    covered.append(r)
        frontier = below

items = []
# The tasks on the strip, each with an entry tile and an approval tile. The
# same rules for both; only where the records live differs:
#   doctype      the record a seat fills (one per stockist / doctor per date)
#   party        its stockist / doctor field; party_doctype the record that
#                lists which seats it is assigned to (Role Profile table)
#   child        its lines' child doctype; rp / status their seat and status
#   link         the Operational Tracker field naming the record
#   prefix       tracker names: "<prefix><record>-<seat>"
#   enabled      False: the task gets no tiles at all (entry or approval)
#   it_only      True: only users with the IT role profile get its tiles
#   due_day      the day of the month its entry is due (else ENTRY_DUE_DAY):
#                its tiles' window and caption
#   rp / status  the plain names; a child that has only custom_<name> (Doctor
#                Support's Support Items on production) uses that instead
TASKS = [
    {"id": "secondary", "label": "Secondary", "icon": "calendar-clock",
     "doctype": "Secondary Data Entry", "child": "Secondary Data Table",
     "party": "distributor", "party_doctype": "Customer",
     "rp": "custom_role_profile", "status": "custom_status",
     "link": "custom_ref_secondary_data_entry", "prefix": "Secondary Data Entry-",
     "due_day": 10, "hide_empty": False, "enabled": True},
    # A seat with no Doctor Support in the month gets no entry tile.
    {"id": "doctor-support", "label": "Support", "icon": "file-check",
     "doctype": "Doctor Support", "child": "Support Items",
     "party": "doctor", "party_doctype": "Lead",
     "rp": "role_profile", "status": "status",
     "link": "reference", "prefix": "Doctor Support-",
     "due_day": 10, "hide_empty": True, "enabled": True},
]


def line_field(child, plain):
    # A child's field as THIS ERP names it: the plain name unless only
    # custom_<name> exists (Support Items: role_profile on UAT,
    # custom_role_profile on production).
    meta = frappe.get_meta(child)
    if not meta.has_field(plain) and meta.has_field("custom_" + plain):
        return "custom_" + plain
    return plain


for t in TASKS:
    t["rp"] = line_field(t["child"], t["rp"])
    t["status"] = line_field(t["child"], t["status"])


READABLE = {}


def can_read(doctype):
    # Someone the ERP does not let read a doctype at all (a BE, MIS or SCM
    # user and Operational Tracker, say) gets an empty list, not an error:
    # frappe.get_list raises for them, and every such call used to land in
    # the Error Log. frappe.has_permission and frappe.get_roles are not
    # available to server scripts, so both are read from the tables: the
    # user's roles (Has Role, plus the All and Guest every user has), and the
    # doctype's role permissions — its Custom DocPerm rows when it has any
    # (they replace the standard ones), else its DocPerm rows. Readable when
    # any of the user's roles may read it.
    if doctype in READABLE:
        return READABLE[doctype]
    if "roles" not in READABLE:
        mine = ["All", "Guest"]
        for r in frappe.get_all("Has Role", filters={"parenttype": "User", "parent": me},
                                fields=["role"], limit_page_length=0):
            mine.append(r.get("role"))
        READABLE["roles"] = mine
    roles = READABLE["roles"]
    ok = me == "Administrator" or "System Manager" in roles
    if not ok:
        rows = frappe.get_all("Custom DocPerm", filters={"parent": doctype, "permlevel": 0},
                              fields=["role", "read"], limit_page_length=0)
        if not rows:
            rows = frappe.get_all("DocPerm", filters={"parent": doctype, "parenttype": "DocType", "permlevel": 0},
                                  fields=["role", "read"], limit_page_length=0)
        for r in rows:
            if r.get("read") and r.get("role") in roles:
                ok = True
                break
    READABLE[doctype] = ok
    return ok


def record_of(t, task):
    # The record a tracker is for: its link field, else from its name.
    rec = t.get(task["link"])
    if rec:
        return rec
    rec = t.get("name") or ""
    if rec.startswith(task["prefix"]):
        rec = rec[len(task["prefix"]):]
    rp = t.get("role_profile") or ""
    if rp and rec.endswith("-" + rp):
        rec = rec[:-(len(rp) + 1)]
    return rec


def entry_tile(task):
    # ------------------------------------------------ <task>: entry
    # Only while entry is open: ENTRY_FROM_DAY to the due day (IT: always).
    overview = (not seat) and always
    win = window_of(task)
    if not ((seat or overview) and win["entry"]):
        return
    line = "`tab" + task["child"] + "`"
    # unit -> 1 while any of its lines is Draft (or it has none yet)
    has_draft = {}
    # unit -> the approval's state
    state_of = {}
    if seat:
        # The caller's seat, and the vacant seats they cover (their records
        # are the caller's to enter): a unit is a record OF THE SEAT'S — the
        # seat has lines on it (below), as the entry scripts list them — and
        # only the seat's lines count. The ERP lets a BE read far more records
        # than theirs. A covered seat's unit is "<record>|<seat>".
        if not can_read(task["doctype"]):
            return
        for s in [seat] + covered:
            own = s == seat
            # Covered seats are read past permissions, as the Entry screen
            # reads them (the caller covers them).
            lister = frappe.get_list if own else frappe.get_all
            key = "" if own else "|" + s
            # A record is the seat's once the seat has LINES on it — as the
            # entry scripts list them: a stockist / doctor assigned to the seat
            # with none of its lines is offered under "Add", not counted.
            # The IT role profile (`always`: the USER's role profile) is the
            # one exception: every record of the month.
            see_all = always and own
            if see_all:
                for r in lister(task["doctype"], filters=[in_month],
                                fields=["name"], limit_page_length=0):
                    has_draft[r.get("name") + key] = 1      # no line of the seat's yet
            seen = {}
            for r in lister(
                    task["doctype"],
                    filters=[[task["child"], task["rp"], "=", s], in_month],
                    fields=["name", line + "." + task["status"] + " as st"],
                    limit_page_length=0):
                n = r.get("name") + key
                st = r.get("st") or ""
                draft = 1 if (st == "" or st == "Draft") else 0
                seen[n] = max(seen.get(n, 0), draft)
            for n in seen:
                has_draft[n] = seen[n]
            # The approval's state: the record's own copy of it, then the
            # tracker's, which is what counts (the copy is not always kept up
            # to date). A BE cannot read Operational Tracker, so these are
            # read directly — only the seat's own. A vacant seat's lines roll
            # up onto its OWNER's approval (the covering manager's): that one.
            o = owner_seat(s)
            approval_of = {}
            for r in lister(
                    task["doctype"],
                    filters=[["secondary tracker", "role_profile", "in", [s, o]], in_month],
                    fields=["name", "`tabsecondary tracker`.role_profile as rp",
                            "`tabsecondary tracker`.status as st",
                            "`tabsecondary tracker`.tracker as tr"],
                    limit_page_length=0):
                n = r.get("name") + key
                if r.get("rp") == s or not approval_of.get(n):
                    approval_of[n] = r
            tracker_of = {}
            for n in approval_of:
                state_of[n] = approval_of[n].get("st") or ""
                if approval_of[n].get("tr"):
                    tracker_of[approval_of[n].get("tr")] = n
            names = list(tracker_of.keys())
            i = 0
            while i < len(names):
                part = names[i:i + 500]
                i = i + 500
                for t in frappe.get_all("Operational Tracker",
                                        filters=[["name", "in", part], ["role_profile", "in", [s, o]]],
                                        fields=["name", "workflow_state"]):
                    if t.get("workflow_state"):
                        state_of[tracker_of[t.get("name")]] = t.get("workflow_state")
    else:
        # OVERVIEW: a unit is a record x seat, every seat.
        for r in frappe.get_list(
                task["doctype"], filters=[in_month],
                fields=["name", line + "." + task["rp"] + " as rp",
                        line + "." + task["status"] + " as st"],
                limit_page_length=0):
            k = (r.get("name") or "") + "|" + (r.get("rp") or "")
            st = r.get("st") or ""
            draft = 1 if (st == "" or st == "Draft") else 0
            has_draft[k] = max(has_draft.get(k, 0), draft)
        for r in frappe.get_list(
                task["doctype"], filters=[in_month],
                fields=["name",
                        "`tabsecondary tracker`.role_profile as rp",
                        "`tabsecondary tracker`.status as st"],
                limit_page_length=0):
            if r.get("rp"):
                state_of[(r.get("name") or "") + "|" + r.get("rp")] = r.get("st") or ""

    e = {"draft": 0, "waiting": 0, "approved": 0, "rejected": 0}
    for n in has_draft:
        # A DECIDED approval (approved / rejected) wins over Draft lines —
        # it proves the seat submitted. Draft lines only mean draft while
        # the approval waits (sent back, being edited) or there is none.
        st = state_of.get(n)
        decided = bucket_of(st) if st else ""
        if decided == "approved" or decided == "rejected":
            b = decided
        elif has_draft[n]:
            b = "draft"
        else:
            b = bucket_of(st)
        e[b] = e[b] + 1
    total = len(has_draft)
    # A MANAGER (anyone with people under them) has no entry tile unless their
    # own seat has records this month (covering a vacant BE's stockists, say):
    # their tile is the team's approval one. Doctor Support hides an empty
    # tile for everyone.
    if not total and (task["hide_empty"] or (has_team and not always)):
        return
    todo = e["draft"] + e["rejected"]

    caption = "Done"
    tone = "success"
    if not total:
        caption = "None"
        tone = "neutral"
    elif todo:
        caption = win["label"]          # the due date, while any is left
        tone = "danger"
    elif e["waiting"]:
        caption = str(e["waiting"]) + " waiting"
        tone = "warning"

    items.append({
        "id": task["id"] + "-entry",
        "label": task["label"],
        "href": HREFS[task["id"] + "-entry"],
        "icon": task["icon"],
        "statusIcon": "pencil",
        "count": todo,
        "caption": caption,
        "captionTone": tone,
        "segments": [
            {"key": "approved", "value": e["approved"], "tone": "success", "label": "Approved"},
            {"key": "waiting", "value": e["waiting"], "tone": "warning", "label": "Awaiting approval"},
            {"key": "draft", "value": todo, "tone": "danger", "label": "Draft"},
        ],
    })


def month_people(task):
    # The approval tile counts PEOPLE — the sales persons who raised figures
    # (a tracker's `user`) — not stockists: one person raises many. Only the
    # entry month's trackers, by the record's own `date` field (not the date
    # in the names): we operate on last month alone, as the Approval screen
    # does. A record the caller cannot read is not counted.
    #   waiting   people with at least one tracker waiting on the caller —
    #             a MANAGER: waiting on anyone, among their team (everyone
    #             under them); IT: waiting on anyone at all
    #   approved  people whose every tracker of the month is approved
    # A manager's count takes in their team's trackers too, read past
    # permissions — the ERP only lets them read what is routed to them.
    lister = frappe.get_all if has_team else frappe.get_list
    of_month = {}
    if has_team or can_read(task["doctype"]):
        for r in lister(task["doctype"], filters=[in_month], fields=["name"], limit_page_length=0):
            of_month[r.get("name")] = 1
    fields = ["name", "role_profile", "user", "workflow_state", "next_approver", task["link"]]
    base = [["reference_doctype", "=", task["doctype"]]]
    trackers = []
    if can_read("Operational Tracker"):
        trackers = frappe.get_list("Operational Tracker", filters=base, fields=fields, limit_page_length=0)
    if has_team:
        seen = {}
        for t in trackers:
            seen[t.get("name")] = 1
        names = list(team_seats.keys())
        i = 0
        while i < len(names):
            part = names[i:i + 500]
            i = i + 500
            for t in frappe.get_all("Operational Tracker", filters=base + [["role_profile", "in", part]],
                                    fields=fields, limit_page_length=0):
                if not seen.get(t.get("name")):
                    seen[t.get("name")] = 1
                    trackers.append(t)
    waiting = {}
    settled = {}     # person -> 1 while every tracker is approved, 0 otherwise
    for t in trackers:
        if not of_month.get(record_of(t, task)):
            continue
        who = t.get("user") or t.get("role_profile") or t.get("name")
        ws = t.get("workflow_state") or ""
        mine = always or t.get("next_approver") == me or team_seats.get(t.get("role_profile"))
        if ws.endswith(" Approval Waiting") and mine:
            waiting[who] = 1
        ok = 1 if ("Approved" in ws and "Rejected" not in ws) or ws == "Approved and Verified" else 0
        settled[who] = min(settled.get(who, 1), ok)
    approved = 0
    for who in settled:
        if settled[who] and not waiting.get(who):
            approved = approved + 1
    return len(waiting), approved


def approval_tile(task):
    # --------------------------------------------- <task>: approval
    # For someone with work WAITING ON THEM, and for every MANAGER (anyone
    # with people under them): their team's month, whether or not anything
    # waits on them — a BE, with no team and nothing waiting, gets none. The
    # IT role profile gets it, as the overview of every tracker. Only in the
    # window: past the due day nobody does, IT included.
    win = window_of(task)
    if not win["open"]:
        return
    counted = month_people(task)
    waiting = counted[0]
    approved = counted[1]
    if not (always or has_team or waiting > 0):
        return
    items.append({
        "id": task["id"] + "-approval",
        "label": task["label"],
        "href": HREFS[task["id"] + "-approval"],
        "icon": task["icon"],
        "statusIcon": "check-square",
        "statusTone": "neutral",
        "count": waiting,
        "caption": win["label"] if waiting else "Clear",   # the due date, while any waits
        "captionTone": "danger" if waiting else "success",
        "segments": [
            {"key": "approved", "value": approved, "tone": "success", "label": "People approved"},
            {"key": "waiting", "value": waiting, "tone": "danger", "label": "People waiting for approval"},
        ],
    })


# Entry tiles first, then approval tiles. A task that cannot be counted
# (its doctype not set up on this ERP yet, say) is left off and logged —
# it never takes the other tasks' tiles down with it.
TASKS = [t for t in TASKS if t.get("enabled") and (always or not t.get("it_only"))]
for task in TASKS:
    try:
        entry_tile(task)
    except Exception as err:
        frappe.log_error(title="Elbrit Ring Nav: " + task["id"] + " entry tile", message=str(err))
for task in TASKS:
    try:
        approval_tile(task)
    except Exception as err:
        frappe.log_error(title="Elbrit Ring Nav: " + task["id"] + " approval tile", message=str(err))

frappe.response["message"] = {
    "user": me,
    "seat": seat or None,
    "month": month,
    "today": today,
    "due": today[:8] + ("0" if due_day < 10 else "") + str(due_day),
    "items": items,
}
