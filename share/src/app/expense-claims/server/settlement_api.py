# Server Script "Settlement API" -- type API, method settlement (16 Nov 2026).
# Settlement approval: a request goes up the requester's reporting line --
# BE > ABM > RBM > SM/ZSM > GM > CEO -- one approver at a time; the CEO's
# approval is final. Every action goes through here (reps and approvers have
# no DocType permission on Settlement Request), with the caller's own token.
#
#   A BILLS request: the rep's bills on their open settlement claim (a
#   running Miscellaneous Expense Claim) that the AI has checked
#   (custom_bill_status "Checked") and that are not in a request yet, sent
#   together. Each bill keeps its AI score. CEO approval -> every bill
#   Verified (sanctioned). A CASH request: an Employee Advance (draft) asked
#   for; CEO approval -> the request is Verified. Nothing more for now (the
#   user, 16 Nov 2026): no Accounts Task, no booking, no payment step.
#   A REJECT, at any step, needs a reason: the request goes back to the rep
#   (bills to "Checked" with the reason, the advance draft deleted); they fix
#   and send again, from the first approver.
#
#   GET  action=mine                         the caller's requests + their chain
#   POST action=send_bills                   every checked, unsent bill
#   POST action=send_cash    amount, purpose
#   POST action=withdraw     name            own, while nobody has decided yet
#   GET  action=queue                        waiting on me / my team / decided by me
#                                            (overview: IT department, System Manager)
#   POST action=decide       name, decision (Approve | Reject), note
#
# The chain: Employee.reports_to from the requester up, skipping anyone not
# Active, with no enabled login, or a "Vacant" placeholder, until the CEO. A
# line that never reaches the CEO gets the CEO added last: the CEO always
# decides last.
#
# safe_exec: no import, no .format(), no set literals, no tuple unpacking,
# no underscore-prefixed names, no frappe.parse_json -- the chain and the
# bills are child tables (Settlement Step, Settlement Bill), not JSON.

CEO_USER = "ceo@elbrit.org"
CEO_DESIGNATION = "Chief Executive Officer"
OVERVIEW_DEPARTMENTS = ["IT - ELPL"]
OVERVIEW_ROLES = ["System Manager"]
LEVELS = ["BE", "ABM", "RBM", "SRBM", "DEPUTY RBM", "SM", "ZSM", "GM"]


def level_of(seat, designation, user, ceo_user, ceo_designation, levels):
    # "ABM2-AURA-CO-SAL" -> ABM; the CEO -> CEO; a back-office seat -> its designation
    if user == ceo_user or designation == ceo_designation:
        return "CEO"
    head = str(seat or "").split("-")[0]
    g = ""
    for ch in head:
        if not ch.isdigit():
            g = g + ch
    g = g.strip().upper()
    if g in levels:
        return g
    return str(designation or g or "Approver")


def chain_of(emp_name, ceo_user, ceo_designation, levels):
    # [{user, name, level}] up the reporting line, ending with the CEO
    out = []
    seen = {}
    cur = frappe.db.get_value("Employee", emp_name, "reports_to")
    hops = 0
    ceo = False
    while cur and hops < 15 and not ceo:
        hops = hops + 1
        if seen.get(cur):
            break
        seen[cur] = 1
        m = frappe.db.get_value("Employee", cur, ["name", "employee_name", "user_id", "status", "custom_role_profile", "designation", "reports_to"], as_dict=True)
        if not m:
            break
        live = m.status == "Active" and m.user_id and str(m.employee_name or "")[:6].lower() != "vacant" and frappe.db.get_value("User", m.user_id, "enabled")
        if live:
            lv = level_of(m.custom_role_profile, m.designation, m.user_id, ceo_user, ceo_designation, levels)
            out.append({"user": m.user_id, "name": m.employee_name, "level": lv})
            if lv == "CEO":
                ceo = True
        cur = m.reports_to
    if not ceo:
        name = frappe.db.get_value("Employee", {"user_id": ceo_user, "status": "Active"}, "employee_name") or "CEO"
        out.append({"user": ceo_user, "name": name, "level": "CEO"})
    return out


def shape(d):
    steps = []
    for s in d.steps or []:
        steps.append({"user": s.user, "name": s.approver_name, "level": s.level, "decision": s.decision or "",
                      "at": str(s.decided_on or ""), "note": s.note or ""})
    bills = []
    for b in d.bills or []:
        bills.append({"row": b.row, "date": str(b.bill_date or ""), "title": b.title, "amount": b.amount,
                      "bill": b.bill or "", "score": b.ai_score, "risk": b.ai_risk or "", "reason": b.ai_reason or ""})
    return {"name": d.name, "employee": d.employee, "employee_name": d.employee_name, "user": d.user,
            "kind": d.kind, "status": d.status, "amount": d.amount, "claim": d.claim or "", "advance": d.advance or "",
            "purpose": d.purpose or "", "step": d.step, "next_approver": d.next_approver or "", "next_label": d.next_label or "",
            "note": d.note or "", "decided_by": d.decided_by or "", "decided_on": str(d.decided_on or ""),
            "creation": str(d.creation), "modified": str(d.modified), "steps": steps, "bills": bills}


def notify(user, subject, name):
    try:
        frappe.get_doc({"doctype": "Notification Log", "for_user": user, "type": "Alert", "subject": subject,
                        "document_type": "Settlement Request", "document_name": name}).insert(ignore_permissions=True)
    except Exception:
        pass


fd = frappe.form_dict
action = str(fd.get("action") or "mine")
me = frappe.session.user
if not me or me == "Guest":
    frappe.throw("Please log in", frappe.PermissionError)
emp = frappe.db.get_value("Employee", {"user_id": me, "status": "Active"}, ["name", "employee_name", "department"], as_dict=True)
overview = me == "Administrator" or bool(emp and emp.department in OVERVIEW_DEPARTMENTS)
if not overview and frappe.db.exists("Has Role", {"parent": me, "parenttype": "User", "role": ["in", OVERVIEW_ROLES]}):
    overview = True


def new_request(emp, me, kind, amount, purpose, claim, advance, bills, chain):
    users = []
    steps = []
    for c in chain:
        users.append(c["user"])
        steps.append({"user": c["user"], "approver_name": c["name"], "level": c["level"]})
    d = frappe.get_doc({
        "doctype": "Settlement Request",
        "employee": emp.name,
        "employee_name": emp.employee_name,
        "user": me,
        "kind": kind,
        "status": "Waiting",
        "amount": amount,
        "purpose": purpose,
        "claim": claim,
        "advance": advance,
        "step": 0,
        "next_approver": chain[0]["user"],
        "next_label": chain[0]["level"],
        "approvers": "|" + "|".join(users) + "|",
        "steps": steps,
        "bills": bills,
    })
    d.insert(ignore_permissions=True)
    return d


if action == "mine":
    rows = []
    preview = []
    if emp:
        for r in frappe.get_all("Settlement Request", filters={"employee": emp.name, "status": ["!=", "Withdrawn"]},
                                pluck="name", order_by="creation desc", limit_page_length=30):
            rows.append(shape(frappe.get_doc("Settlement Request", r)))
        preview = chain_of(emp.name, CEO_USER, CEO_DESIGNATION, LEVELS)
    frappe.response["message"] = {"requests": rows, "chain": preview, "overview": overview}

elif action == "send_bills":
    if not emp:
        frappe.throw("No active employee is linked to this login.")
    claims = frappe.get_all("Expense Claim", filters={"employee": emp.name, "custom_running": 1, "docstatus": 0},
                            pluck="name", order_by="creation desc", limit_page_length=20)
    claim = None
    picked = []
    for c in claims:
        if frappe.db.exists("Expense Claim Detail", {"parent": c, "parenttype": "Expense Claim", "expense_type": "Food"}):
            continue
        rows = frappe.get_all("Expense Claim Detail",
                              filters=[["parent", "=", c], ["parenttype", "=", "Expense Claim"], ["custom_bill_status", "=", "Checked"],
                                       ["custom_settlement", "is", "not set"]],
                              fields=["name", "expense_date", "description", "amount", "custom_bill", "custom_ai_score", "custom_ai_risk", "custom_ai_reason"],
                              order_by="idx asc", limit_page_length=500)
        if rows:
            claim = c
            picked = rows
            break
    if not picked:
        frappe.throw("No checked bills to send -- add a bill, and wait for its check to finish.")
    chain = chain_of(emp.name, CEO_USER, CEO_DESIGNATION, LEVELS)
    total = 0
    bills = []
    for r in picked:
        total = total + frappe.utils.flt(r.amount)
        bills.append({"row": r.name, "bill_date": r.expense_date, "title": str(r.description or "")[:140], "amount": r.amount,
                      "bill": r.custom_bill, "ai_score": r.custom_ai_score, "ai_risk": r.custom_ai_risk, "ai_reason": r.custom_ai_reason})
    d = new_request(emp, me, "Bills", total, str(len(bills)) + (" bill" if len(bills) == 1 else " bills"), claim, None, bills, chain)
    for r in picked:
        frappe.db.set_value("Expense Claim Detail", r.name, {"custom_bill_status": "In Approval", "custom_settlement": d.name, "custom_review_note": None})
    # the approvers may open the claim and its bill photos (read only)
    for c in chain:
        if c["user"] != me and not frappe.db.exists("DocShare", {"share_doctype": "Expense Claim", "share_name": claim, "user": c["user"]}):
            sh = frappe.get_doc({"doctype": "DocShare", "share_doctype": "Expense Claim", "share_name": claim, "user": c["user"],
                                 "read": 1, "write": 0, "share": 0, "notify_by_email": 0})
            sh.flags.ignore_share_permission = True
            sh.insert(ignore_permissions=True)
    notify(chain[0]["user"], "Settlement to approve: " + str(emp.employee_name) + " · " + frappe.utils.fmt_money(total, currency="INR"), d.name)
    frappe.response["message"] = {"request": shape(d)}

elif action == "send_cash":
    if not emp:
        frappe.throw("No active employee is linked to this login.")
    amount = frappe.utils.flt(fd.get("amount"))
    purpose = " ".join(str(fd.get("purpose") or "").split())[:500]
    if amount <= 0:
        frappe.throw("Say how much you need.")
    if not purpose:
        frappe.throw("Say what the cash is for.")
    chain = chain_of(emp.name, CEO_USER, CEO_DESIGNATION, LEVELS)
    ea = frappe.get_doc({"doctype": "Employee Advance", "employee": emp.name, "posting_date": frappe.utils.today(), "purpose": purpose,
                         "advance_amount": amount, "currency": "INR", "exchange_rate": 1})
    ea.flags.settlement = True       # "Employee Advance Task" makes no Accounts Task for it
    ea.insert(ignore_permissions=True)
    d = new_request(emp, me, "Cash", amount, purpose, None, ea.name, [], chain)
    notify(chain[0]["user"], "Cash request to approve: " + str(emp.employee_name) + " · " + frappe.utils.fmt_money(amount, currency="INR"), d.name)
    frappe.response["message"] = {"request": shape(d)}

elif action == "withdraw":
    name = str(fd.get("name") or "")
    d = frappe.get_doc("Settlement Request", name) if name and frappe.db.exists("Settlement Request", name) else None
    if not d or not emp or d.employee != emp.name:
        frappe.throw("That is not your request.", frappe.PermissionError)
    if d.status != "Waiting" or frappe.utils.cint(d.step) > 0:
        frappe.throw("It can only be taken back before anyone has approved it.")
    for b in d.bills or []:
        frappe.db.set_value("Expense Claim Detail", b.row, {"custom_bill_status": "Checked", "custom_settlement": None})
    if d.advance and frappe.db.get_value("Employee Advance", d.advance, "docstatus") == 0:
        frappe.delete_doc("Employee Advance", d.advance, ignore_permissions=True, force=True)
        d.advance = None
    d.status = "Withdrawn"
    d.next_approver = None
    d.next_label = None
    d.save(ignore_permissions=True)
    frappe.response["message"] = {"request": shape(d)}

elif action == "queue":
    waiting = []
    team = []
    decided = []
    since = frappe.utils.add_days(frappe.utils.today(), -60)
    for r in frappe.get_all("Settlement Request", filters={"status": "Waiting", "next_approver": me}, pluck="name", order_by="creation asc", limit_page_length=200):
        waiting.append(shape(frappe.get_doc("Settlement Request", r)))
    flt = {"approvers": ["like", "%|" + me + "|%"], "modified": [">=", since]}
    if overview:
        flt = {"modified": [">=", since]}
    for r in frappe.get_all("Settlement Request", filters=flt, pluck="name", order_by="modified desc", limit_page_length=300):
        d = frappe.get_doc("Settlement Request", r)
        if d.status == "Withdrawn" or (d.status == "Waiting" and d.next_approver == me):
            continue
        mine_done = False
        for s in d.steps or []:
            if s.user == me and s.decision:
                mine_done = True
        if mine_done:
            decided.append(shape(d))
        elif d.status == "Waiting":
            team.append(shape(d))
        elif overview:
            decided.append(shape(d))
    frappe.response["message"] = {"waiting": waiting, "team": team, "decided": decided, "overview": overview, "me": me}

elif action == "decide":
    name = str(fd.get("name") or "")
    decision = str(fd.get("decision") or "")
    note = " ".join(str(fd.get("note") or "").split())[:1000]
    d = frappe.get_doc("Settlement Request", name) if name and frappe.db.exists("Settlement Request", name) else None
    if not d:
        frappe.throw("No such request.")
    if d.status != "Waiting":
        frappe.throw("This request is already " + str(d.status).lower() + ".")
    if d.next_approver != me:
        frappe.throw("This request is waiting on someone else.", frappe.PermissionError)
    i = frappe.utils.cint(d.step)
    step = d.steps[i]
    step.decided_on = frappe.utils.now()
    step.note = note
    who = str((emp and emp.employee_name) or me)
    if decision == "Approve":
        step.decision = "Approved"
        if i + 1 < len(d.steps):
            d.step = i + 1
            d.next_approver = d.steps[i + 1].user
            d.next_label = d.steps[i + 1].level
            notify(d.next_approver, ("Settlement" if d.kind == "Bills" else "Cash request") + " to approve: " + str(d.employee_name) + " · " + frappe.utils.fmt_money(d.amount, currency="INR"), d.name)
        else:
            # the CEO's approval is final
            d.status = "Approved"
            d.next_approver = None
            d.next_label = None
            d.decided_by = me
            d.decided_on = frappe.utils.now()
            if d.kind == "Bills":
                for b in d.bills or []:
                    amt = frappe.db.get_value("Expense Claim Detail", b.row, "amount")
                    frappe.db.set_value("Expense Claim Detail", b.row, {"custom_bill_status": "Verified", "sanctioned_amount": amt})
                if d.claim:
                    tot = 0
                    for r in frappe.get_all("Expense Claim Detail", filters={"parent": d.claim, "parenttype": "Expense Claim"}, fields=["sanctioned_amount"], limit_page_length=1000):
                        tot = tot + frappe.utils.flt(r.sanctioned_amount)
                    frappe.db.set_value("Expense Claim", d.claim, "total_sanctioned_amount", tot)
            # 16 Nov 2026 (the user): nothing more for now -- no Accounts Task,
            # no booking; the CEO's approval makes it Verified, and that is all.
            notify(d.user, ("Your bills are verified" if d.kind == "Bills" else "Your cash request is verified") + " (" + frappe.utils.fmt_money(d.amount, currency="INR") + ")", d.name)
    elif decision == "Reject":
        if not note:
            frappe.throw("Say why it is rejected -- the requester sees it.")
        step.decision = "Rejected"
        d.status = "Rejected"
        d.note = note
        d.next_approver = None
        d.next_label = None
        d.decided_by = me
        d.decided_on = frappe.utils.now()
        for b in d.bills or []:
            frappe.db.set_value("Expense Claim Detail", b.row, {"custom_bill_status": "Checked", "custom_settlement": None,
                                                               "custom_review_note": ("Returned by " + who + ": " + note)[:500]})
        if d.advance and frappe.db.get_value("Employee Advance", d.advance, "docstatus") == 0:
            frappe.delete_doc("Employee Advance", d.advance, ignore_permissions=True, force=True)
            d.advance = None
        notify(d.user, "Sent back by " + who + ": " + note, d.name)
    else:
        frappe.throw("Approve or Reject?")
    d.save(ignore_permissions=True)
    frappe.response["message"] = {"request": shape(d)}

else:
    frappe.throw("Unknown action.")
