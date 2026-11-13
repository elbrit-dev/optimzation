# Server Script "Field Trip Officer API" -- type API, method field_trip_officer (13 Nov 2026).
# What the reporting officer needs on the approvals page besides the trip
# decision ("Field Trip Decision API"), for a rep's monthly field TA/DA claim
# (remark "Field TA/DA · YYYY-MM"):
#
#   POST action=adjust  claim, lines (JSON [{row, amount}]), reason
#        The officer changes the amount of a TA (Travel) line while the claim
#        waits with them -- with a reason, which the employee sees. Stored the
#        same way as the final check's adjustments (custom_adjusted /
#        _adjusted_amount / _adjust_reason / _adjusted_by / _adjusted_on, and
#        sanctioned_amount): the planner, the dashboard and payroll all read
#        the adjusted amount. The amount set back to the claimed one clears it.
#        "Field Trip Decision Guard" keeps an adjustment on a line the rep did
#        not change when they save again.
#        -> {claim, changed}
#
#   GET  action=visits  claim
#        The visits behind each day of the claim, from the rep's Field Expense
#        Day (the officer has no permission on that DocType): per date, how
#        many and in which towns.
#        -> {claim, days: {date: {visits, places: {town: n}}}}
#
# Who: the claim's own approver (expense_approver) or a System Manager.
# safe_exec: plain loops only, no defs, no comprehensions over top-level names.

PREFIX = "Field TA/DA · "
TA_TYPES = ["Travel"]
fd = frappe.form_dict
action = str(fd.get("action") or "")
me = frappe.session.user
if not me or me == "Guest":
    frappe.throw("Please log in", frappe.PermissionError)

name = str(fd.get("claim") or "")
c = frappe.db.get_value("Expense Claim", name, ["name", "employee", "remark", "workflow_state", "expense_approver", "docstatus"], as_dict=True) if name else None
if not c or not str(c.remark or "").startswith(PREFIX):
    frappe.throw("Not a planner field claim.")
admin = me == "Administrator" or frappe.db.exists("Has Role", {"parent": me, "parenttype": "User", "role": "System Manager"})
if c.expense_approver != me and not admin:
    frappe.throw("Only " + str(c.expense_approver or "the reporting officer") + " can see or change this claim here.", frappe.PermissionError)

if action == "adjust":
    if int(c.docstatus or 0) != 0 or c.workflow_state != "Waiting for Approval":
        frappe.throw("This claim is " + str(c.workflow_state or "not waiting") + " -- its TA can be changed only while it waits for approval.")
    reason = " ".join(str(fd.get("reason") or "").split())[:1000]
    wanted = json.loads(fd.get("lines") or "[]")
    if not wanted:
        frappe.throw("Which line?")
    now = frappe.utils.now()
    text = []
    for w in wanted:
        rn = str(w.get("row") or "")
        r = frappe.db.get_value("Expense Claim Detail", rn, ["name", "parent", "expense_type", "expense_date", "amount", "custom_adjusted", "custom_adjusted_amount"], as_dict=True) if rn else None
        if not r or r.parent != name:
            frappe.throw("A line of " + name + " was not found -- refresh and try again.")
        if r.expense_type not in TA_TYPES:
            frappe.throw("Only a TA (Travel) line can be changed here.")
        amt = frappe.utils.flt(w.get("amount"))
        if amt < 0:
            frappe.throw("An amount cannot be below 0.")
        was = frappe.utils.flt(r.custom_adjusted_amount) if r.custom_adjusted else frappe.utils.flt(r.amount)
        if abs(amt - was) < 0.5:
            continue
        if abs(amt - frappe.utils.flt(r.amount)) < 0.5:
            frappe.db.set_value("Expense Claim Detail", r.name, {"custom_adjusted": 0, "custom_adjusted_amount": 0, "custom_adjust_reason": "", "custom_adjusted_by": None, "custom_adjusted_on": None, "sanctioned_amount": r.amount}, update_modified=False)
        else:
            if len(reason) < 3:
                frappe.throw("Say why the TA is changed -- the employee sees this.")
            frappe.db.set_value("Expense Claim Detail", r.name, {"custom_adjusted": 1, "custom_adjusted_amount": amt, "custom_adjust_reason": reason, "custom_adjusted_by": me, "custom_adjusted_on": now, "sanctioned_amount": amt}, update_modified=False)
        text.append("TA " + str(r.expense_date) + ": Rs " + str(was) + " -> Rs " + str(amt))
    if text:
        frappe.get_doc({
            "doctype": "Comment",
            "comment_type": "Comment",
            "reference_doctype": "Expense Claim",
            "reference_name": name,
            "comment_email": me,
            "content": "TA changed by the reporting officer: " + "; ".join(text) + ((". Reason: " + reason) if reason else ""),
        }).insert(ignore_permissions=True)
    frappe.response["message"] = {"claim": name, "changed": len(text)}

elif action == "visits":
    dates = []
    for l in frappe.get_all("Expense Claim Detail", filters={"parent": name, "parenttype": "Expense Claim"}, fields=["expense_date"], limit_page_length=1000):
        d = str(l.expense_date)[:10]
        if d and d not in dates:
            dates.append(d)
    out = {}
    if dates and c.employee:
        for d in frappe.get_all("Field Expense Day", filters={"employee": c.employee, "date": ["in", dates]}, fields=["date", "visits", "detail_json"], limit_page_length=0):
            places = {}
            det = {}
            if d.detail_json:
                det = json.loads(d.detail_json) or {}
            for v in det.get("visitList") or []:
                p = ""
                if v and len(v) > 2:
                    p = " ".join(str(v[2] or "").split())
                if p:
                    places[p] = places.get(p, 0) + 1
            out[str(d.date)[:10]] = {"visits": d.visits or 0, "places": places}
    frappe.response["message"] = {"claim": name, "days": out}

else:
    frappe.throw("Unknown action.")
