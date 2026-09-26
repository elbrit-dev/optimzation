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
# THE CALENDAR. A month's secondary is keyed in during the FIRST FIVE DAYS
# of the next month (July's trackers were all raised in August on
# production), due on the 5th:
#   - the entry month is LAST month (`month` overrides it);
#   - the Secondary entry tile is on the strip only from the 1st to the 5th,
#     its caption the due date, "5 Oct", while anything is left — except
#     for users whose Role Profile is "IT", who see it every day;
#   - the approval tile keeps the same window (1st-5th; IT always) and
#     the same due date as its caption while anything waits;
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
# SECONDARY ENTRY — every entry the caller may see for the entry month (the
# "Secondary Data Entry Permission Query" decides), each in ONE bucket for
# the caller's seat (their active Employee's role_id). Within an entry only
# the seat's lines count — an entry carries several seats' lines:
#   draft     none of the seat's lines yet, or any still Draft
#   rejected  its approval row says Rejected — back to the BE
#   waiting   all out of Draft, "... Approval Waiting" (or no row yet)
#   approved  "... Approved and Waiting for Verification" or verified —
#             green at once, MIS verifying is not waited for
# The approval's state is read from the entry's status rows: a BE cannot
# read their own trackers.
#
# NO SEAT, IT ROLE PROFILE — an OVERVIEW instead: every stockist x seat
# across the entries they may see, bucketed the same way (a seat's lines on
# an entry are one unit, as one approval; an entry with no lines at all is
# one draft unit). Anyone else without a seat gets no entry tile.
#
# SECONDARY APPROVAL — the Secondary trackers the caller can SEE (the
# "Operational Tracker Restriction" permission query decides):
#   waiting   "... Approval Waiting", any month — old work is still work
#   approved  approved, of the entry month (from "Waiting for Verification" on;
#             "... Verification Rejected" is not)
# No tile when they can see none at all — a BE, say — or outside the
# 1st-5th window (IT role profile: always).
#
# safe_exec: no import, no .format(), no set literals, no tuple
# unpacking, no underscore-prefixed names.
# =====================================================================

HREFS = {"secondary-entry": "/secondary-entry",
         "secondary-approval": "/secondary-approval"}
ENTRY_FROM_DAY = 1
ENTRY_DUE_DAY = 5
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
# The 1st-5th window both Secondary tiles keep; the IT role profile sees them always.
entry_window = always or (ENTRY_FROM_DAY <= day <= ENTRY_DUE_DAY)
due_label = str(ENTRY_DUE_DAY) + " " + MONTHS[int(today[5:7]) - 1]
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

# ------------------------------------------------ secondary: entry
# Only while entry is open: the 1st to the 5th (IT: always).
overview = (not seat) and always
if (seat or overview) and entry_window:
    # unit -> 1 while any of its lines is Draft (or it has none yet)
    has_draft = {}
    # unit -> the approval's state, from the entry's status rows
    state_of = {}
    if seat:
        # ONE seat: a unit is an entry; only the seat's lines count.
        for r in frappe.get_list("Secondary Data Entry", filters=[in_month],
                                 fields=["name"], limit_page_length=0):
            has_draft[r.get("name")] = 1      # no line of the seat's yet
        seen = {}
        for r in frappe.get_list(
                "Secondary Data Entry",
                filters=[["Secondary Data Table", "custom_role_profile", "=", seat],
                         in_month],
                fields=["name", "`tabSecondary Data Table`.custom_status as st"],
                limit_page_length=0):
            n = r.get("name")
            st = r.get("st") or ""
            draft = 1 if (st == "" or st == "Draft") else 0
            seen[n] = max(seen.get(n, 0), draft)
        for n in seen:
            has_draft[n] = seen[n]
        for r in frappe.get_list(
                "Secondary Data Entry",
                filters=[["secondary tracker", "role_profile", "=", seat], in_month],
                fields=["name", "`tabsecondary tracker`.status as st"],
                limit_page_length=0):
            state_of[r.get("name")] = r.get("st") or ""
    else:
        # OVERVIEW: a unit is an entry x seat, every seat.
        for r in frappe.get_list(
                "Secondary Data Entry", filters=[in_month],
                fields=["name",
                        "`tabSecondary Data Table`.custom_role_profile as rp",
                        "`tabSecondary Data Table`.custom_status as st"],
                limit_page_length=0):
            k = (r.get("name") or "") + "|" + (r.get("rp") or "")
            st = r.get("st") or ""
            draft = 1 if (st == "" or st == "Draft") else 0
            has_draft[k] = max(has_draft.get(k, 0), draft)
        for r in frappe.get_list(
                "Secondary Data Entry", filters=[in_month],
                fields=["name",
                        "`tabsecondary tracker`.role_profile as rp",
                        "`tabsecondary tracker`.status as st"],
                limit_page_length=0):
            if r.get("rp"):
                state_of[(r.get("name") or "") + "|" + r.get("rp")] = r.get("st") or ""

    e = {"draft": 0, "waiting": 0, "approved": 0, "rejected": 0}
    for n in has_draft:
        b = "draft" if has_draft[n] else bucket_of(state_of.get(n))
        e[b] = e[b] + 1
    total = len(has_draft)
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
        "id": "secondary-entry",
        "label": "Secondary",
        "href": HREFS["secondary-entry"],
        "icon": "calendar-clock",
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

# --------------------------------------------- secondary: approval
secondary_ot = [["reference_doctype", "=", "Secondary Data Entry"]]
if entry_window and count("Operational Tracker", secondary_ot) > 0:
    waiting = count("Operational Tracker", secondary_ot + [
        ["workflow_state", "like", "% Approval Waiting"]])
    # No date column: the entry date is in the name,
    # "Secondary Data Entry-<stockist>-<YYYY-MM-DD>-<seat>".
    approved = count("Operational Tracker", secondary_ot + [
        ["workflow_state", "like", "%Approved%"],
        ["workflow_state", "not like", "%Rejected%"],
        ["name", "like", "%-" + month + "-__-%"]])
    items.append({
        "id": "secondary-approval",
        "label": "Secondary",
        "href": HREFS["secondary-approval"],
        "icon": "calendar-clock",
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

frappe.response["message"] = {
    "user": me,
    "seat": seat or None,
    "month": month,
    "today": today,
    "due": today[:8] + ("0" if ENTRY_DUE_DAY < 10 else "") + str(ENTRY_DUE_DAY),
    "items": items,
}
