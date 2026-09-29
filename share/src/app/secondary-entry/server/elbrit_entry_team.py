# =====================================================================
# SERVER SCRIPT — the source of truth for the ERP's copy. Keep in step.
#
#   Name        : Elbrit Entry Team
#   Script Type : API
#   API Method  : elbrit_entry_team
#   Allow Guest : NO
#
#   GET /api/method/elbrit_entry_team                          Secondary, last month
#   GET /api/method/elbrit_entry_team?task=doctor-support&month=2026-08
#
# THE CALLER'S TEAM AND ITS MONTH, for the Entry screen's team tree: every
# Employee under the caller in the reporting chain (`reports_to`, any depth,
# vacant seats included), and for each person their seat's month counted as
# Ring Nav counts a seat's entry tile —
#   approved  its approval row is approved / waiting for verification
#   todo      Draft (no line yet, or any line still Draft), Rejected, Rework
#   waiting   everything submitted, the approval waiting on an approver
# over the records assigned to the seat (the stockist's Customer / the
# doctor's Lead lists the seat) or where it has lines.
#
# READ PAST PERMISSIONS (frappe.get_all), and only ever for the caller's own
# subtree: a manager may not be able to read every record their people work
# on (the Department permission), yet the team's progress is theirs to see.
# Counts and names only — no figures. The IT role profile (the USER's, as
# Ring Nav decides it) gets the whole field force.
#
# Answer: { month, task, root: <employee id> | null,
#           members: [{ id, name, seat, tier, reportsTo, vacant, user,
#                       approved, waiting, todo, total }] }
#
# safe_exec: no import, no .format(), no set literals, no tuple
# unpacking, no underscore-prefixed names.
# =====================================================================

TASKS = {
    "secondary": {"doctype": "Secondary Data Entry", "child": "Secondary Data Table",
                  "rp": "custom_role_profile", "status": "custom_status",
                  "party": "distributor", "party_doctype": "Customer"},
    "doctor-support": {"doctype": "Doctor Support", "child": "Support Items",
                       "rp": "role_profile", "status": "status",
                       "party": "doctor", "party_doctype": "Lead"},
}
FIELD_TIERS = ["BE", "ABM", "RBM", "SRBM", "SM", "ZSM", "GM"]
CHUNK = 500


def valid_month(m):
    if not m or len(m) != 7 or m[4] != "-":
        return False
    return m[:4].isdigit() and m[5:].isdigit() and 1 <= int(m[5:]) <= 12


def month_before(m):
    y = int(m[:4])
    mo = int(m[5:])
    if mo == 1:
        return str(y - 1) + "-12"
    return str(y) + "-" + ("0" if mo - 1 < 10 else "") + str(mo - 1)


def chunks(values):
    out = []
    i = 0
    while i < len(values):
        out.append(values[i:i + CHUNK])
        i = i + CHUNK
    return out


def tier_of(seat):
    t = (seat or "").split("-")[0]
    while t and t[-1].isdigit():
        t = t[:-1]
    return t


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


me = frappe.session.user
task_id = frappe.form_dict.get("task") or "secondary"
task = TASKS.get(task_id) or TASKS["secondary"]
month = frappe.form_dict.get("month") or ""
if not valid_month(month):
    month = month_before(frappe.utils.nowdate()[:7])
first = month + "-01"
last = str(frappe.utils.get_last_day(first))
in_month = ["date", "between", [first, last]]
is_it = frappe.db.get_value("User", me, "role_profile_name") == "IT"

FIELDS = ["name", "employee_name", "custom_role_profile", "reports_to", "user_id"]

# ---- the team: the caller and everyone under them (IT: the field force)
people = []
root = None
if is_it:
    for e in frappe.get_all("Employee", filters={"status": "Active"}, fields=FIELDS, limit_page_length=0):
        if tier_of(e.get("custom_role_profile")) in FIELD_TIERS:
            people.append(e)
else:
    mine = frappe.get_all("Employee", filters={"user_id": me, "status": "Active"}, fields=FIELDS, limit_page_length=1)
    if mine:
        root = mine[0].get("name")
        people.append(mine[0])
        frontier = [root]
        seen = {root: 1}
        hops = 0
        while frontier and hops < 8:
            hops = hops + 1
            below = []
            for part in chunks(frontier):
                for e in frappe.get_all("Employee",
                                        filters=[["reports_to", "in", part], ["status", "=", "Active"]],
                                        fields=FIELDS, limit_page_length=0):
                    if seen.get(e.get("name")):
                        continue
                    seen[e.get("name")] = 1
                    people.append(e)
                    below.append(e.get("name"))
            frontier = below

seats = []
for e in people:
    s = e.get("custom_role_profile")
    if s and s not in seats:
        seats.append(s)

# ---- each seat's month, counted as Ring Nav counts an entry tile
units = {}      # seat -> { record: 1 while any of its lines is Draft (or none yet) }
state_of = {}   # seat|record -> the approval's state
if seats:
    assigned = {}   # party -> [seat]
    for part in chunks(seats):
        for r in frappe.get_all("Role Profile Multiselect",
                                filters=[["parenttype", "=", task["party_doctype"]], ["role_profile_list", "in", part]],
                                fields=["parent", "role_profile_list"], limit_page_length=0):
            p = r.get("parent")
            if p not in assigned:
                assigned[p] = []
            assigned[p].append(r.get("role_profile_list"))
    for r in frappe.get_all(task["doctype"], filters=[in_month], fields=["name", task["party"]], limit_page_length=0):
        for s in assigned.get(r.get(task["party"]), []):
            if s not in units:
                units[s] = {}
            units[s][r.get("name")] = 1
    line = "`tab" + task["child"] + "`"
    for part in chunks(seats):
        rows = frappe.get_all(task["doctype"],
                              filters=[[task["child"], task["rp"], "in", part], in_month],
                              fields=["name", line + "." + task["rp"] + " as rp", line + "." + task["status"] + " as st"],
                              limit_page_length=0)
        seen_line = {}
        for r in rows:
            s = r.get("rp")
            n = r.get("name")
            k = s + "|" + n
            draft = 1 if (r.get("st") or "") in ["", "Draft"] else 0
            seen_line[k] = max(seen_line.get(k, 0), draft)
        for k in seen_line:
            s = k.split("|")[0]
            n = k[len(s) + 1:]
            if s not in units:
                units[s] = {}
            units[s][n] = seen_line[k]
    tracker_of = {}
    for part in chunks(seats):
        for r in frappe.get_all(task["doctype"],
                                filters=[["secondary tracker", "role_profile", "in", part], in_month],
                                fields=["name", "`tabsecondary tracker`.role_profile as rp",
                                        "`tabsecondary tracker`.status as st", "`tabsecondary tracker`.tracker as tr"],
                                limit_page_length=0):
            k = (r.get("rp") or "") + "|" + (r.get("name") or "")
            state_of[k] = r.get("st") or ""
            if r.get("tr"):
                tracker_of[r.get("tr")] = k
    names = list(tracker_of.keys())
    for part in chunks(names):
        for t in frappe.get_all("Operational Tracker", filters=[["name", "in", part]], fields=["name", "workflow_state"]):
            if t.get("workflow_state"):
                state_of[tracker_of[t.get("name")]] = t.get("workflow_state")

members = []
for e in people:
    s = e.get("custom_role_profile") or ""
    c = {"approved": 0, "waiting": 0, "draft": 0, "rejected": 0}
    for n in units.get(s, {}):
        st = state_of.get(s + "|" + n)
        decided = bucket_of(st) if st else ""
        if decided == "approved" or decided == "rejected":
            b = decided
        elif units[s][n]:
            b = "draft"
        else:
            b = bucket_of(st)
        c[b] = c[b] + 1
    members.append({
        "id": e.get("name"),
        "name": e.get("employee_name"),
        "seat": s or None,
        "tier": tier_of(s) or None,
        "reportsTo": e.get("reports_to"),
        "vacant": 1 if (e.get("employee_name") or "")[:6].lower() == "vacant" else 0,
        "user": e.get("user_id"),
        "approved": c["approved"],
        "waiting": c["waiting"],
        "todo": c["draft"] + c["rejected"],
        "total": c["approved"] + c["waiting"] + c["draft"] + c["rejected"],
    })

frappe.response["message"] = {"month": month, "task": task_id, "root": root, "members": members}
