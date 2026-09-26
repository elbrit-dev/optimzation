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
# AS THE TOKEN'S USER: every list is frappe.get_list, so the ERP's own
# permissions decide — the "Operational Tracker Restriction" which
# trackers, the entry permission which lines can be read.
#
#   months    every month the caller has a Secondary tracker in, with how
#             many wait — light (names and states only), for the switcher
#   month     the month sent: \`month\`, else the latest month with work
#             waiting (never a future one on its own), else the latest shown
#   trackers  that month's trackers, each shaped as the SecondaryApproval
#             query's node, its entry carrying ONLY THE TRACKER'S OWN SEAT'S
#             lines. (The saved query sent every seat's lines under every
#             seat's tracker — a stockist shared by four seats, four times.)
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


def waiting_state(ws):
    return (ws or "").endswith(" Approval Waiting")


me = frappe.session.user
today_month = frappe.utils.nowdate()[:7]
base = [["reference_doctype", "=", "Secondary Data Entry"]]

# ---- light: every visible tracker, for the months and their counts
light = frappe.get_list("Operational Tracker", filters=base,
                        fields=["name", "role_profile", "workflow_state",
                                "custom_ref_secondary_data_entry"],
                        limit_page_length=0)
per_month = {}
for t in light:
    e = t.get("custom_ref_secondary_data_entry") or entry_of(t.get("name"), t.get("role_profile"))
    m = month_of(e)
    if not m:
        continue
    if m not in per_month:
        per_month[m] = 0
    if waiting_state(t.get("workflow_state")):
        per_month[m] = per_month[m] + 1

shown = sorted(per_month.keys())
with_work = []
for m in shown:
    if per_month[m] > 0:
        with_work.append(m)

month = frappe.form_dict.get("month") or ""
if not (valid_month(month) and month in per_month):
    month = ""
    for m in with_work:
        if m <= today_month:
            month = m
    if not month:
        for m in shown:
            if m <= today_month:
                month = m
    if not month and with_work:
        month = with_work[-1]
    if not month and shown:
        month = shown[-1]

months = []
for m in shown:
    months.append({"month": m, "waiting": per_month[m]})

# ---- the month: full trackers, and only their own seat's lines
trackers = []
if month:
    rows = frappe.get_list(
        "Operational Tracker",
        filters=base + [["name", "like", "%-" + month + "-__-%"]],
        fields=["name", "role_profile", "workflow_state", "next_role", "next_approver",
                "custom_fallback_approver", "user", "modified_by", "modified", "hq",
                "data", "reason_for_rejection", "custom_ref_secondary_data_entry"],
        order_by="modified desc", limit_page_length=0)

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
        for d in frappe.get_list("Secondary Data Entry", filters=[["name", "in", part]],
                                 fields=["name", "date", "distributor"], limit_page_length=0):
            head[d.get("name")] = d
        for r in frappe.get_list(
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

    brand = {}
    for part in chunks(item_codes):
        for it in frappe.get_list("Item", filters=[["name", "in", part]],
                                  fields=["name", "brand"], limit_page_length=0):
            brand[it.get("name")] = it.get("brand")

    dist_codes = []
    for n in head:
        c = head[n].get("distributor")
        if c and c not in dist_codes:
            dist_codes.append(c)
    dist = {}
    for part in chunks(dist_codes):
        for c in frappe.get_list("Customer", filters=[["name", "in", part]],
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
