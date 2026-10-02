# =====================================================================
# SERVER SCRIPT — the source of truth for the ERP's copy. Keep in step.
#
#   Name        : Elbrit Secondary Approval
#   Script Type : API
#   API Method  : elbrit_secondary_approval
#   Allow Guest : NO
#
#   GET /api/method/elbrit_secondary_approval                the month to open
#   GET /api/method/elbrit_secondary_approval?month=2026-09  that month
#
# The Secondary Approval screen's data for the CALLER, in one call, NO CAP,
# only what is shown. READ-ONLY (decisions stay the app's workflow calls).
# AS THE TOKEN'S USER, then THE TEAM: the trackers the ERP lets the caller
# read (frappe.get_list — the "Operational Tracker Restriction"), and those
# of everyone under them in the reporting chain (read past permissions, that
# subtree only). Everything read after is by those trackers' names.
#
#   months    every month the caller has a Secondary tracker in, with how
#             many wait — light (names and states only), for the switcher.
#             A tracker's month is its ENTRY'S `date` field (the Secondary
#             Data Entry's own date) — not the date written into the names,
#             which can be mistyped; only an entry that cannot be read
#             falls back to the name's date.
#   month     the month sent: \`month\`, else the PRIOR month — the entry
#             month, as Ring Nav and Secondary Entry use
#   trackers  that month's trackers, each shaped as the SecondaryApproval
#             query's node, its entry carrying ONLY THE TRACKER'S OWN SEAT'S
#             lines. (The saved query sent every seat's lines under every
#             seat's tracker — a stockist shared by four seats, four times.)
#             A vacant seat's lines roll up onto its covering manager's
#             approval, so they come under that tracker too, each marked
#             `covering: { seat, holder }`.
#
# safe_exec: no import, no .format(), no set literals, no tuple
# unpacking, no underscore-prefixed names.
# =====================================================================

PREFIX = "Secondary Data Entry-"
LINE = "`tabSecondary Data Table`"
CHUNK = 500


def valid_month(m):
    if not m or len(m) != 7 or m[4] != "-":
        return False
    return m[:4].isdigit() and m[5:].isdigit() and 1 <= int(m[5:]) <= 12


def chunks(values):
    out = []
    i = 0
    while i < len(values):
        out.append(values[i:i + CHUNK])
        i = i + CHUNK
    return out


def is_vacant_name(n):
    return (n or "")[:6].lower() == "vacant"


def owner_seat(s):
    # The seat whose approval carries `s`'s lines — as the ERP's tracker
    # script (src/app/tracker/server/secondary_tracker_on_save.py) raises it:
    # `s` itself when someone real holds it; else the nearest seat above with
    # a live holder, up reports_to from its placeholder holder, or up the
    # Role Profile tree when no one holds it.
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


def entry_of(tracker_name, seat):
    # "Secondary Data Entry-<stockist>-<YYYY-MM-DD>-<seat>" -> "<stockist>-<YYYY-MM-DD>"
    n = tracker_name or ""
    if n.startswith(PREFIX):
        n = n[len(PREFIX):]
    if seat and n.endswith("-" + seat):
        n = n[:-(len(seat) + 1)]
    return n


def month_of(entry_name):
    # "<stockist>-<YYYY-MM-DD>" -> "YYYY-MM"
    d = (entry_name or "")[-10:]
    if len(d) == 10 and d[4] == "-" and d[7] == "-" and valid_month(d[:7]):
        return d[:7]
    return ""


def month_before(m):
    y = int(m[:4])
    mo = int(m[5:])
    if mo == 1:
        return str(y - 1) + "-12"
    return str(y) + "-" + ("0" if mo - 1 < 10 else "") + str(mo - 1)


def waiting_state(ws):
    return (ws or "").endswith(" Approval Waiting")


me = frappe.session.user
today_month = frappe.utils.nowdate()[:7]
base = [["reference_doctype", "=", "Secondary Data Entry"]]

# ---- light: every visible tracker, for the months and their counts
LIGHT_FIELDS = ["name", "role_profile", "workflow_state", "custom_ref_secondary_data_entry"]
light = frappe.get_list("Operational Tracker", filters=base, fields=LIGHT_FIELDS,
                        limit_page_length=0)

# ---- THE CALLER'S TEAM: the trackers of everyone under them in the
# reporting chain (Employee reports_to, any depth), in EVERY state — a
# manager views their team's approvals whole, not only what waits on them.
# Read past permissions (frappe.get_all), for that subtree only. What they
# may DO on each stays the workflow's: the screen asks it per tracker, so a
# tracker they cannot act on shows read-only.
team_seats = []
own = frappe.get_all("Employee", filters={"user_id": me, "status": "Active"}, fields=["name"], limit_page_length=1)
if own:
    frontier = [own[0].get("name")]
    reached = {frontier[0]: 1}
    hops = 0
    while frontier and hops < 8:
        hops = hops + 1
        below = []
        for part in chunks(frontier):
            for e in frappe.get_all("Employee",
                                    filters=[["reports_to", "in", part], ["status", "=", "Active"]],
                                    fields=["name", "custom_role_profile"], limit_page_length=0):
                if reached.get(e.get("name")):
                    continue
                reached[e.get("name")] = 1
                below.append(e.get("name"))
                s = e.get("custom_role_profile")
                if s and s not in team_seats:
                    team_seats.append(s)
        frontier = below
listed = {}
for t in light:
    listed[t.get("name")] = 1
for part in chunks(team_seats):
    for t in frappe.get_all("Operational Tracker", filters=base + [["role_profile", "in", part]],
                            fields=LIGHT_FIELDS, limit_page_length=0):
        if not listed.get(t.get("name")):
            listed[t.get("name")] = 1
            light.append(t)
# Each tracker's entry, and that entry's own `date` — the month it is for.
light_entries = []
for t in light:
    e = t.get("custom_ref_secondary_data_entry") or entry_of(t.get("name"), t.get("role_profile"))
    t["entry"] = e
    if e and e not in light_entries:
        light_entries.append(e)
entry_date = {}
for part in chunks(light_entries):
    for d in frappe.get_all("Secondary Data Entry", filters=[["name", "in", part]],
                             fields=["name", "date"], limit_page_length=0):
        entry_date[d.get("name")] = str(d.get("date") or "")

per_month = {}
names_in = {}          # month -> tracker names
for t in light:
    d = entry_date.get(t.get("entry")) or ""
    m = d[:7] if valid_month(d[:7]) else month_of(t.get("entry"))
    if not m:
        continue
    if m not in per_month:
        per_month[m] = 0
        names_in[m] = []
    names_in[m].append(t.get("name"))
    if waiting_state(t.get("workflow_state")):
        per_month[m] = per_month[m] + 1

# The month to open: `month`, else the PRIOR month — the entry month, the
# one Ring Nav counts and Secondary Entry opens on. It is listed even when
# the caller can see nothing in it, so the switcher always offers it.
month = frappe.form_dict.get("month") or ""
if not valid_month(month):
    month = month_before(today_month)
if month not in per_month:
    per_month[month] = 0
    names_in[month] = []
shown = sorted(per_month.keys())

months = []
for m in shown:
    months.append({"month": m, "waiting": per_month[m]})

# ---- the month: full trackers, and only their own seat's lines
trackers = []
if month:
    # The month's trackers are the ones bucketed there above — by their
    # entry's date — fetched by name.
    rows = []
    for part in chunks(names_in.get(month, [])):
        rows = rows + frappe.get_all(
            "Operational Tracker",
            filters=base + [["name", "in", part]],
            fields=["name", "role_profile", "workflow_state", "next_role", "next_approver",
                    "custom_fallback_approver", "user", "modified_by", "modified", "hq",
                    "data", "reason_for_rejection", "custom_ref_secondary_data_entry"],
            order_by="modified desc", limit_page_length=0)
    rows = sorted(rows, key=lambda t: str(t.get("modified") or ""), reverse=True)

    entry_names = []
    for t in rows:
        e = t.get("custom_ref_secondary_data_entry") or entry_of(t.get("name"), t.get("role_profile"))
        t["entry"] = e
        if e and e not in entry_names:
            entry_names.append(e)

    # the entries' heads, and every line grouped by entry and seat
    head = {}
    lines = {}
    item_codes = []
    for part in chunks(entry_names):
        for d in frappe.get_all("Secondary Data Entry", filters=[["name", "in", part]],
                                 fields=["name", "date", "distributor"], limit_page_length=0):
            head[d.get("name")] = d
        for r in frappe.get_all(
                "Secondary Data Entry", filters=[["name", "in", part]],
                fields=["name", LINE + ".idx as idx", LINE + ".item as item",
                        LINE + ".sales_qty as sales_qty", LINE + ".sales_value as sales_value",
                        LINE + ".closing_qty as closing_qty",
                        LINE + ".closing_balance as closing_balance",
                        LINE + ".custom_role_profile as rp"],
                order_by=LINE + ".idx asc", limit_page_length=0):
            if not r.get("item"):
                continue
            k = r.get("name") + "|" + (r.get("rp") or "")
            if k not in lines:
                lines[k] = []
            lines[k].append(r)
            if r.get("item") not in item_codes:
                item_codes.append(r.get("item"))

    # A vacant seat's lines ride on its OWNER's approval (the covering
    # manager's seat — see owner_seat): filed under the owner too, after its
    # own, each marked with the seat it covers and that seat's placeholder.
    owner_of = {}
    holder_of = {}
    for k in list(lines.keys()):
        cut = k.rfind("|")
        e = k[:cut]
        rp = k[cut + 1:]
        if not rp:
            continue
        if rp not in owner_of:
            owner_of[rp] = owner_seat(rp)
            holder_of[rp] = frappe.db.get_value("Employee", {"custom_role_profile": rp, "status": "Active"},
                                                "employee_name")
        o = owner_of[rp]
        if o != rp:
            for r in lines[k]:
                r["covering"] = {"seat": rp, "holder": holder_of[rp]}
            if (e + "|" + o) not in lines:
                lines[e + "|" + o] = []
            lines[e + "|" + o] = lines[e + "|" + o] + lines[k]

    brand = {}
    for part in chunks(item_codes):
        for it in frappe.get_all("Item", filters=[["name", "in", part]],
                                  fields=["name", "brand"], limit_page_length=0):
            brand[it.get("name")] = it.get("brand")

    dist_codes = []
    for n in head:
        c = head[n].get("distributor")
        if c and c not in dist_codes:
            dist_codes.append(c)
    dist = {}
    for part in chunks(dist_codes):
        for c in frappe.get_all("Customer", filters=[["name", "in", part]],
                                 fields=["name", "whg_ebs_code", "territory"], limit_page_length=0):
            dist[c.get("name")] = {"whg_ebs_code": c.get("whg_ebs_code"),
                                   "territory__name": c.get("territory")}

    full_name = {}
    for t in rows:
        e = t.get("entry")
        h = head.get(e)
        rp = t.get("role_profile") or ""
        u = t.get("user")
        if u and u not in full_name:
            # The raiser's display name only — the User list itself is not
            # readable to every approver.
            full_name[u] = frappe.db.get_value("User", u, "full_name")
        entry = None
        if h:
            items = []
            for r in lines.get(e + "|" + rp, []):
                items.append({
                    "item__name": r.get("item"),
                    "item": {"brand__name": brand.get(r.get("item"))},
                    "sales_qty": r.get("sales_qty"),
                    "sales_value": r.get("sales_value"),
                    "closing_qty": r.get("closing_qty"),
                    "closing_balance": r.get("closing_balance"),
                    "custom_role_profile__name": r.get("rp"),
                    "covering": r.get("covering"),
                })
            entry = {
                "name": h.get("name"),
                "date": str(h.get("date") or ""),
                "distributor__name": h.get("distributor"),
                "distributor": dist.get(h.get("distributor")),
                "items": items,
            }
        trackers.append({
            "name": t.get("name"),
            "role_profile__name": t.get("role_profile"),
            "workflow_state__name": t.get("workflow_state"),
            "next_role__name": t.get("next_role"),
            "next_approver__name": t.get("next_approver"),
            "custom_fallback_approver__name": t.get("custom_fallback_approver"),
            "user": {"name": u, "full_name": full_name.get(u)} if u else None,
            "modified_by__name": t.get("modified_by"),
            "modified": str(t.get("modified") or ""),
            "hq__name": t.get("hq"),
            "data": t.get("data"),
            "reason_for_rejection": t.get("reason_for_rejection"),
            "custom_ref_secondary_data_entry": entry,
        })

frappe.response["message"] = {
    "user": me,
    "month": month or None,
    "months": months,
    "trackers": trackers,
}
