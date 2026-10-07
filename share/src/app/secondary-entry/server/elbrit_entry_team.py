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
# THE CALLER'S TEAM AND ITS MONTH, for the Entry and Approval screens' team
# tree: the caller's SEAT and every seat under it in the Role Profile tree
# (parent_role_profile, any depth) — one member per seat, named by whoever
# holds it (real people first, else its "Vacant_" placeholder, else the seat
# itself, vacant) — and for each seat its month counted as Ring Nav counts a
# seat's entry tile —
#   approved  its approval row is approved / waiting for verification
#   todo      Draft (no line yet, or any line still Draft), Rejected, Rework
#   waiting   everything submitted, the approval waiting on an approver
#   draft     the Draft part of todo on its own (the Approval screen's team
#             tab shows it beside its tracker counts)
# over the records where the seat has lines — as the entry scripts list
# them (one assigned with none of the seat's lines is offered under "Add").
#
# READ PAST PERMISSIONS (frappe.get_all), and only ever for the caller's own
# subtree: a manager may not be able to read every record their people work
# on (the Department permission), yet the team's progress is theirs to see.
# Counts and names only — no figures. The IT role profile (the USER's, as
# Ring Nav decides it) gets the whole Sales tree.
#
# A member's `id` is its seat and `reportsTo` the seat above it; `employee`
# is the holder's Employee id (None for a seat no one holds).
#
# Answer: { month, task, root: <the caller's seat> | null,
#           members: [{ id, employee, name, seat, tier, reportsTo, vacant,
#                       user, approved, waiting, todo, draft, total }] }
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


# A line field's name as THIS ERP has it: Doctor Support's Support Items has
# role_profile / status on UAT and custom_role_profile / custom_status on
# production — the plain name unless only the custom_ one exists.
def line_field(child, plain):
    meta = frappe.get_meta(child)
    if not meta.has_field(plain) and meta.has_field("custom_" + plain):
        return "custom_" + plain
    return plain


for t in TASKS.values():
    t["rp"] = line_field(t["child"], t["rp"])
    t["status"] = line_field(t["child"], t["status"])
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

FIELDS = ["name", "employee_name", "custom_role_profile", "role_id", "reports_to", "user_id"]
SALES_ROOT = "Sales"

# ---- the team: the caller's SEAT and every seat under it in the Role
# Profile tree (parent_role_profile, any depth), each with whoever holds it
# — real people before "Vacant_" placeholders. A seat no Active Employee
# holds is a member too (vacant, named by its seat): its records are someone's
# to cover. IT: the whole Sales tree.
kids = {}
seat_hq = {}    # seat -> its Role Profile's territory (HQ)
for r in frappe.get_all("Role Profile", fields=["name", "parent_role_profile", "custom_territory"], limit_page_length=0):
    seat_hq[r.get("name")] = r.get("custom_territory")
    p = r.get("parent_role_profile")
    if p:
        if p not in kids:
            kids[p] = []
        kids[p].append(r.get("name"))

holders = {}    # seat -> its Active Employees, real people first
for e in frappe.get_all("Employee", filters={"status": "Active"}, fields=FIELDS, limit_page_length=0):
    s = e.get("custom_role_profile")
    if not s:
        continue
    if s not in holders:
        holders[s] = []
    if is_vacant_name(e.get("employee_name")):
        holders[s].append(e)
    else:
        holders[s].insert(0, e)

root = None
top = None
tree = []       # [seat, parent seat]
if is_it:
    top = SALES_ROOT
else:
    mine = frappe.get_all("Employee", filters={"user_id": me, "status": "Active"}, fields=FIELDS, limit_page_length=1)
    if mine:
        top = mine[0].get("custom_role_profile") or mine[0].get("role_id") or None
        root = top
        if top:
            tree.append([top, None])
if top:
    frontier = [top]
    seen = {top: 1}
    hops = 0
    while frontier and hops < 12:
        hops = hops + 1
        below = []
        for p in frontier:
            for k in kids.get(p) or []:
                if seen.get(k):
                    continue
                seen[k] = 1
                tree.append([k, None if p == SALES_ROOT and is_it else p])
                below.append(k)
        frontier = below

seats = [t[0] for t in tree]

# ---- each seat's month, counted as Ring Nav counts an entry tile
units = {}      # seat -> { record: 1 while any of its lines is Draft (or none yet) }
state_of = {}   # seat|record -> the approval's state
if seats:
    # A record is the seat's once the seat has LINES on it — as the entry
    # scripts list them (a stockist / doctor assigned with none of the
    # seat's lines is offered under "Add", not counted).
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
    # A vacant seat's approval is its OWNER's (its lines roll up onto the
    # covering manager's tracker — see owner_seat): looked up only for seats
    # no one real holds among the people above.
    live = {}
    for s in seats:
        for e in holders.get(s) or []:
            if not is_vacant_name(e.get("employee_name")):
                live[s] = 1
    owner = {}
    tracked = list(seats)
    for s in seats:
        if not live.get(s):
            o = owner_seat(s)
            if o != s:
                owner[s] = o
                if o not in tracked:
                    tracked.append(o)
    tracker_of = {}
    for part in chunks(tracked):
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
for t in tree:
    s = t[0]
    hs = holders.get(s) or []
    real = [h for h in hs if not is_vacant_name(h.get("employee_name"))]
    h = hs[0] if hs else {}
    c = {"approved": 0, "waiting": 0, "draft": 0, "rejected": 0}
    for n in units.get(s, {}):
        st = state_of.get(s + "|" + n)
        if not st and owner.get(s):
            st = state_of.get(owner[s] + "|" + n)
        decided = bucket_of(st) if st else ""
        if decided == "approved" or decided == "rejected":
            b = decided
        elif units[s][n]:
            b = "draft"
        else:
            b = bucket_of(st)
        c[b] = c[b] + 1
    members.append({
        "id": s,
        "employee": h.get("name"),
        "name": " / ".join([x.get("employee_name") for x in real]) if real else (h.get("employee_name") or s),
        "seat": s,
        "hq": seat_hq.get(s),
        "tier": tier_of(s) or None,
        "reportsTo": t[1],
        "vacant": 0 if real else 1,
        "user": h.get("user_id"),
        "approved": c["approved"],
        "waiting": c["waiting"],
        "todo": c["draft"] + c["rejected"],
        "draft": c["draft"],
        "total": c["approved"] + c["waiting"] + c["draft"] + c["rejected"],
    })

frappe.response["message"] = {"month": month, "task": task_id, "root": root, "members": members}
