# =====================================================================
# SERVER SCRIPT — the source of truth for the ERP's copy. Keep in step.
#
#   Name        : Elbrit Doctor Support Approval
#   Script Type : API
#   API Method  : elbrit_doctor_support_approval
#   Allow Guest : NO
#
#   GET /api/method/elbrit_doctor_support_approval                the month to open
#   GET /api/method/elbrit_doctor_support_approval?month=2026-09  that month
#
# The Doctor Support Approval screen's data for the CALLER — the Secondary
# Approval script (elbrit_secondary_approval) for Doctor Support, answering
# in the SAME shape so the one screen reads both. READ-ONLY (decisions stay
# the app's workflow calls on the Operational Tracker).
# AS THE TOKEN'S USER, then THE TEAM: the trackers the ERP lets the caller
# read (frappe.get_list — the "Operational Tracker Restriction"), and those
# of everyone under them in the reporting chain (read past permissions, that
# subtree only). Everything read after is by those trackers' names.
#
#   months    every month the caller has a Doctor Support tracker in, with
#             how many wait. A tracker's month is its Doctor Support's own
#             `date` field; only a record that cannot be read falls back to
#             the date in the names.
#   month     the month sent: `month`, else the PRIOR month
#   trackers  that month's trackers, each with its Doctor Support carrying
#             ONLY THE TRACKER'S OWN SEAT'S lines — under the key
#             custom_ref_secondary_data_entry, Secondary's name for it, with
#             the doctor as `distributor` (distributor__name = the doctor's
#             name, whg_ebs_code = their id, note = specialty and city) and a
#             line's qty / amount as sales_qty / sales_value.
#
# A tracker names its Doctor Support in `reference` ("DR-4725-2026-11-28").
#
# safe_exec: no import, no .format(), no set literals, no tuple
# unpacking, no underscore-prefixed names.
# =====================================================================

DOCTYPE = "Doctor Support"
PREFIX = "Doctor Support-"
LINE = "`tabSupport Items`"
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


def entry_of(tracker_name, seat):
    # "Doctor Support-<doctor>-<YYYY-MM-DD>-<seat>" -> "<doctor>-<YYYY-MM-DD>"
    n = tracker_name or ""
    if n.startswith(PREFIX):
        n = n[len(PREFIX):]
    if seat and n.endswith("-" + seat):
        n = n[:-(len(seat) + 1)]
    return n


def month_of(entry_name):
    # "<doctor>-<YYYY-MM-DD>" -> "YYYY-MM"
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
base = [["reference_doctype", "=", DOCTYPE]]

# ---- light: every visible tracker, for the months and their counts
LIGHT_FIELDS = ["name", "role_profile", "workflow_state", "reference"]
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
    e = t.get("reference") or entry_of(t.get("name"), t.get("role_profile"))
    t["entry"] = e
    if e and e not in light_entries:
        light_entries.append(e)
entry_date = {}
for part in chunks(light_entries):
    for d in frappe.get_all(DOCTYPE, filters=[["name", "in", part]],
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
                    "data", "reason_for_rejection", "reference"],
            order_by="modified desc", limit_page_length=0)
    rows = sorted(rows, key=lambda t: str(t.get("modified") or ""), reverse=True)

    entry_names = []
    for t in rows:
        e = t.get("reference") or entry_of(t.get("name"), t.get("role_profile"))
        t["entry"] = e
        if e and e not in entry_names:
            entry_names.append(e)

    # the entries' heads, and every line grouped by entry and seat
    head = {}
    lines = {}
    item_codes = []
    for part in chunks(entry_names):
        for d in frappe.get_all(DOCTYPE, filters=[["name", "in", part]],
                                 fields=["name", "date", "doctor"], limit_page_length=0):
            head[d.get("name")] = d
        for r in frappe.get_all(
                DOCTYPE, filters=[["name", "in", part]],
                fields=["name", LINE + ".idx as idx", LINE + ".item as item",
                        LINE + ".qty as sales_qty", LINE + ".amount as sales_value",
                        LINE + ".role_profile as rp"],
                order_by=LINE + ".idx asc", limit_page_length=0):
            if not r.get("item"):
                continue
            k = r.get("name") + "|" + (r.get("rp") or "")
            if k not in lines:
                lines[k] = []
            lines[k].append(r)
            if r.get("item") not in item_codes:
                item_codes.append(r.get("item"))

    brand = {}
    for part in chunks(item_codes):
        for it in frappe.get_all("Item", filters=[["name", "in", part]],
                                  fields=["name", "brand"], limit_page_length=0):
            brand[it.get("name")] = it.get("brand")

    # the doctors (Lead): display name, specialty and city, HQ
    dist_codes = []
    for n in head:
        c = head[n].get("doctor")
        if c and c not in dist_codes:
            dist_codes.append(c)
    dist = {}
    for part in chunks(dist_codes):
        for c in frappe.get_all("Lead", filters=[["name", "in", part]],
                                 fields=["name", "lead_name", "custom_specialty", "city", "territory"],
                                 limit_page_length=0):
            bits = []
            if c.get("custom_specialty"):
                bits.append(c.get("custom_specialty"))
            if c.get("city"):
                bits.append(c.get("city"))
            dist[c.get("name")] = {"lead_name": c.get("lead_name"),
                                   "whg_ebs_code": c.get("name"),
                                   "territory__name": c.get("territory"),
                                   "note": " · ".join(bits) or None}

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
                    "closing_qty": 0,
                    "closing_balance": 0,
                    "custom_role_profile__name": r.get("rp"),
                })
            entry = {
                "name": h.get("name"),
                "date": str(h.get("date") or ""),
                "distributor__name": (dist.get(h.get("doctor")) or {}).get("lead_name") or h.get("doctor"),
                "distributor": dist.get(h.get("doctor")) or {"whg_ebs_code": h.get("doctor")},
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
