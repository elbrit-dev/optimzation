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
# ENTRY_DUE_DAY — for now the END OF THE MONTH: a due day past the month's
# last day is that last day (31 -> 28 Feb, 30 Sep, 31 Oct):
#   - the entry month is LAST month (`month` overrides it);
#   - the Secondary entry tile is on the strip from ENTRY_FROM_DAY to the
#     due day, its caption the due date, "30 Sep", while anything is left —
#     except for users whose Role Profile is "IT", who see it every day;
#   - the approval tile keeps the same window (IT always) and the same due
#     date as its caption while anything waits;
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
# entry tile and an approval tile as described here for Secondary.
#
# SECONDARY ENTRY — every entry the caller may see for the entry month (the
# "Secondary Data Entry Permission Query" decides), each in ONE bucket for
# the caller's seat (their active Employee's role_id). Within an entry only
# the seat's lines count — an entry carries several seats' lines:
#   approved  its approval row says "... Approved and Waiting for
#             Verification" or verified — green at once, MIS verifying is
#             not waited for — whatever its lines say
#   rejected  its approval row says Rejected — back to the BE (likewise)
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
# SECONDARY APPROVAL — ONLY for someone with work waiting on them, in the
# entry window: a Secondary tracker in "... Approval Waiting" whose
# next_approver is the caller (any month — old work is still work). No
# queue, no tile: a BE, or an approver who is clear, gets none.
#   waiting   those trackers
#   approved  the Secondary trackers the caller can see (the "Operational
#             Tracker Restriction" permission query decides) approved, whose
#             ENTRY is of the month by its own `date` field (not the names)
#             — from "Waiting for Verification" on; "... Verification
#             Rejected" is not
# The IT role profile ALWAYS gets it, as an overview: every Secondary
# tracker they can see that waits, and the month's approved.
#
# safe_exec: no import, no .format(), no set literals, no tuple
# unpacking, no underscore-prefixed names.
# =====================================================================

HREFS = {"secondary-entry": "/secondary/entry",
         "secondary-approval": "/secondary/approval",
         "doctor-support-entry": "/doctor-support/entry",
         "doctor-support-approval": "/doctor-support/approval"}
ENTRY_FROM_DAY = 1
ENTRY_DUE_DAY = 31     # past the month's end = its last day: due at month end
ALWAYS_ROLE_PROFILE = "IT"   # users with this Role Profile see the tiles every day
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
          "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def bucket_of(ws):
    s = (ws or "").lower()
    if not s:
        return "waiting"
    if "rejected" in s:
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
# The window both Secondary tiles keep; the IT role profile sees them always.
entry_window = always or (ENTRY_FROM_DAY <= day <= due_day)
due_label = str(due_day) + " " + MONTHS[int(today[5:7]) - 1]
first = month + "-01"
last = str(frappe.utils.get_last_day(first))
in_month = ["date", "between", [first, last]]

emp = frappe.get_list("Employee",
                      filters={"user_id": me, "status": "Active"},
                      fields=["role_id", "custom_role_profile"],
                      limit_page_length=1)
seat = ""
if emp:
    seat = emp[0].get("role_id") or emp[0].get("custom_role_profile") or ""

items = []
# The tasks on the strip, each with an entry tile and an approval tile. The
# same rules for both; only where the records live differs:
#   doctype      the record a seat fills (one per stockist / doctor per date)
#   child        its lines' child doctype; rp / status their seat and status
#   link         the Operational Tracker field naming the record
#   prefix       tracker names: "<prefix><record>-<seat>"
TASKS = [
    {"id": "secondary", "label": "Secondary", "icon": "calendar-clock",
     "doctype": "Secondary Data Entry", "child": "Secondary Data Table",
     "rp": "custom_role_profile", "status": "custom_status",
     "link": "custom_ref_secondary_data_entry", "prefix": "Secondary Data Entry-",
     "hide_empty": False},
    # A seat with no Doctor Support in the month gets no entry tile.
    {"id": "doctor-support", "label": "Support", "icon": "heart",
     "doctype": "Doctor Support", "child": "Support Items",
     "rp": "role_profile", "status": "status",
     "link": "reference", "prefix": "Doctor Support-",
     "hide_empty": True},
]


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
    if not ((seat or overview) and entry_window):
        return
    line = "`tab" + task["child"] + "`"
    # unit -> 1 while any of its lines is Draft (or it has none yet)
    has_draft = {}
    # unit -> the approval's state
    state_of = {}
    if seat:
        # ONE seat: a unit is a record; only the seat's lines count.
        for r in frappe.get_list(task["doctype"], filters=[in_month],
                                 fields=["name"], limit_page_length=0):
            has_draft[r.get("name")] = 1      # no line of the seat's yet
        seen = {}
        for r in frappe.get_list(
                task["doctype"],
                filters=[[task["child"], task["rp"], "=", seat], in_month],
                fields=["name", line + "." + task["status"] + " as st"],
                limit_page_length=0):
            n = r.get("name")
            st = r.get("st") or ""
            draft = 1 if (st == "" or st == "Draft") else 0
            seen[n] = max(seen.get(n, 0), draft)
        for n in seen:
            has_draft[n] = seen[n]
        # The approval's state: the record's own copy of it, then — for the
        # caller's OWN seat — the tracker's, which is what counts (the copy
        # is not always kept up to date). A BE cannot read Operational
        # Tracker, so these are read directly — only their own seat's.
        tracker_of = {}
        for r in frappe.get_list(
                task["doctype"],
                filters=[["secondary tracker", "role_profile", "=", seat], in_month],
                fields=["name", "`tabsecondary tracker`.status as st",
                        "`tabsecondary tracker`.tracker as tr"],
                limit_page_length=0):
            state_of[r.get("name")] = r.get("st") or ""
            if r.get("tr"):
                tracker_of[r.get("tr")] = r.get("name")
        names = list(tracker_of.keys())
        i = 0
        while i < len(names):
            part = names[i:i + 500]
            i = i + 500
            for t in frappe.get_all("Operational Tracker",
                                    filters=[["name", "in", part], ["role_profile", "=", seat]],
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
    if not total and task["hide_empty"]:
        return
    todo = e["draft"] + e["rejected"]

    caption = "Done"
    tone = "success"
    if not total:
        caption = "None"
        tone = "neutral"
    elif todo:
        caption = due_label             # the due date, while any is left
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


def approved_in_month(task):
    # Approved trackers the caller can see whose RECORD is of the month — by
    # the record's own `date` field, not the date in the names (those can be
    # mistyped). A record the caller cannot read is not counted.
    of_month = {}
    for r in frappe.get_list(task["doctype"], filters=[in_month],
                             fields=["name"], limit_page_length=0):
        of_month[r.get("name")] = 1
    n = 0
    for t in frappe.get_list("Operational Tracker", filters=[
            ["reference_doctype", "=", task["doctype"]],
            ["workflow_state", "like", "%Approved%"],
            ["workflow_state", "not like", "%Rejected%"]],
            fields=["name", "role_profile", task["link"]],
            limit_page_length=0):
        if of_month.get(record_of(t, task)):
            n = n + 1
    return n


def approval_tile(task):
    # --------------------------------------------- <task>: approval
    # Only for someone with work WAITING ON THEM: no queue, no tile — a BE,
    # or an approver who is clear, gets none. The IT role profile always gets
    # it, as the overview of every tracker of the task they can see.
    waiting_ot = [["reference_doctype", "=", task["doctype"]],
                  ["workflow_state", "like", "% Approval Waiting"]]
    if always:
        waiting = count("Operational Tracker", waiting_ot)
    elif entry_window:
        waiting = count("Operational Tracker", waiting_ot + [["next_approver", "=", me]])
    else:
        waiting = 0
    if not (always or waiting > 0):
        return
    approved = approved_in_month(task)
    items.append({
        "id": task["id"] + "-approval",
        "label": task["label"],
        "href": HREFS[task["id"] + "-approval"],
        "icon": task["icon"],
        "statusIcon": "check-square",
        "statusTone": "neutral",
        "count": waiting,
        "caption": due_label if waiting else "Clear",   # the due date, while any waits
        "captionTone": "danger" if waiting else "success",
        "segments": [
            {"key": "approved", "value": approved, "tone": "success", "label": "Approved"},
            {"key": "waiting", "value": waiting, "tone": "danger", "label": "Waiting for approval"},
        ],
    })


# Entry tiles first, then approval tiles. A task that cannot be counted
# (its doctype not set up on this ERP yet, say) is left off and logged —
# it never takes the other tasks' tiles down with it.
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
