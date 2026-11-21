# Server Script "Settlement Escalation" -- type Scheduler Event, Cron
# "20 * * * *" (17 Nov 2026). Hourly: every waiting settlement request whose
# step cannot wait any longer moves on -- the approver left / disabled / on
# approved leave today (skipped), or 2 working days with no action (moved up
# one level, the approver told; a High-risk bill waits). Stops at SM / ZSM:
# never moved on to a GM or the CEO. The same sweep() as
# the "Settlement API" script -- copy it from there when it changes
# (share/src/app/expense-claims/server/settlement_api.py).


def held_up(d, i, now):
    # why step i of a waiting request should not wait on its approver, else ""
    st = d.steps[i]
    m = frappe.db.get_value("Employee", {"user_id": st.user, "status": "Active"}, "name")
    if not m or not frappe.db.get_value("User", st.user, "enabled"):
        return "No longer active -- skipped"
    day = str(now)[:10]
    if frappe.db.exists("Leave Application", {"employee": m, "status": "Approved", "docstatus": 1,
                                              "from_date": ["<=", day], "to_date": [">=", day]}):
        return "On leave -- skipped"
    for b in d.bills or []:
        if frappe.utils.flt(b.ai_score) < 70:
            return ""        # a High-risk bill never skips a level: it waits
    arrived = frappe.utils.get_datetime(d.creation)
    if i > 0 and d.steps[i - 1].decided_on:
        prev = frappe.utils.get_datetime(d.steps[i - 1].decided_on)
        if prev > arrived:
            arrived = prev
    due = arrived
    n = 0
    while n < 2:
        due = frappe.utils.add_days(due, 1)
        if due.weekday() != 6:
            n = n + 1
    if frappe.utils.get_datetime(now) >= due:
        return "No action in 2 working days -- moved up"
    return ""


def sweep(d, now, tell):
    # moves a waiting request past the steps nobody can act on -> True when it
    # moved (the caller saves). Stops at SM / ZSM: never on to a GM or the CEO.
    moved = False
    guard = 0
    while d.status == "Waiting" and guard < 10:
        guard = guard + 1
        i = frappe.utils.cint(d.step)
        if i >= len(d.steps) - 1:
            break
        if str(d.steps[i].level or "").upper() in ["SM", "ZSM"] or str(d.steps[i + 1].level or "").upper() in ["GM", "CEO"]:
            break
        why = held_up(d, i, now)
        if not why:
            break
        st = d.steps[i]
        st.decision = "Skipped"
        st.decided_on = now
        st.note = why
        d.step = i + 1
        d.next_approver = d.steps[i + 1].user
        d.next_label = d.steps[i + 1].level
        moved = True
        if why[:9] == "No action":
            notify(st.user, "Moved up to " + str(d.steps[i + 1].approver_name or d.next_approver) + " (no action in 2 working days): "
                   + str(d.employee_name) + " · " + frappe.utils.fmt_money(d.amount, currency="INR"), d.name)
    if moved and tell:
        notify(d.next_approver, ("Settlement" if d.kind == "Bills" else "Cash request") + " to approve: " + str(d.employee_name)
               + " · " + frappe.utils.fmt_money(d.amount, currency="INR"), d.name)
    return moved


def last_rejected(row, employee):
    # the latest request this bill row was in, when it was rejected -> {parent, amount, bill}
    hits = frappe.db.sql("select parent, amount, bill from `tabSettlement Bill` where `row` = %s and parenttype = 'Settlement Request' order by creation desc limit 5",
                         (row,), as_dict=True)
    for h in hits or []:
        st = frappe.db.get_value("Settlement Request", h.parent, ["status", "employee"], as_dict=True)
        if not st or st.status == "Withdrawn":
            continue
        if st.status == "Rejected" and st.employee == employee:
            return h
        return None
    return None


def carry(d, old_name):
    # the steps approved on the rejected request stay approved, up to whoever rejected it
    old = frappe.get_doc("Settlement Request", old_name)
    done = {}
    for st in old.steps or []:
        if st.decision == "Approved":
            done[st.user] = st
    i = 0
    while i < len(d.steps) - 1 and done.get(d.steps[i].user):
        o = done.get(d.steps[i].user)
        d.steps[i].decision = "Approved"
        d.steps[i].decided_on = o.decided_on
        d.steps[i].note = "Approved before (" + old_name + ")"
        i = i + 1
    if i:
        d.step = i
        d.next_approver = d.steps[i].user
        d.next_label = d.steps[i].level


def notify(user, subject, name):
    try:
        frappe.get_doc({"doctype": "Notification Log", "for_user": user, "type": "Alert", "subject": subject,
                        "document_type": "Settlement Request", "document_name": name}).insert(ignore_permissions=True)
    except Exception:
        pass


now = frappe.utils.now()
moved = 0
for name in frappe.get_all("Settlement Request", filters={"status": "Waiting"}, pluck="name", limit_page_length=2000):
    d = frappe.get_doc("Settlement Request", name)
    if sweep(d, now, True):
        d.save(ignore_permissions=True)
        moved = moved + 1
