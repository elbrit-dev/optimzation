# Server Script "Settlement API" -- type API, method settlement (16 Nov 2026).
# Settlement approval: a request goes up the requester's reporting line --
# BE > ABM > RBM > SM/ZSM > GM -- one approver at a time; the GM's approval
# is final (17 Nov 2026, the user: "the validation ends with the GM"; the CEO
# approves only the PAYMENT, as a batch -- Settlement Pay API). A line with
# no GM above (a GM's own bills, back office under the CEO) ends at the CEO. Every action goes through here (reps and approvers have
# no DocType permission on Settlement Request), with the caller's own token.
#
#   A BILLS request: ONE bill (16 Nov 2026) on the rep's open settlement
#   claim (a running Miscellaneous Expense Claim), scored on save
#   (custom_bill_status "Checked"). "Send" makes one request per unsent bill,
#   each with its own chain, so every claim row has its own status and its
#   own Settlement Request link. The bill keeps its AI score. CEO approval ->
#   the bill is Verified (sanctioned). A CASH request: an Employee Advance (draft) asked
#   for; CEO approval -> the request is Verified.
#
#   BOOKED AT THE CEO'S APPROVAL (17 Nov 2026; replaces Accounts' hand-made
#   JVs on "Advance to <Name>" accounts), when BOOK and the accounts exist:
#     a bill  -> its own submitted Expense Claim: Dr the expense account for
#                its kind (hotel 5229, travel 5228, food 5211, fuel 5230, else
#                5309), Cr 2120 Employee Expense Payable, party = the
#                Employee; the bill photo attached; the employee's open cash
#                advances deducted first. Workflow state "Booked". -> booked
#     cash    -> the Employee Advance submitted on "Employee Expense
#                Advances", unspent amount repaid from salary
#   A booking that fails stops the approval too (nothing half done): the CEO
#   sees why. Accounts then pays the Unpaid claims / advances in batches.
#   A REJECT, at any step, needs a reason: the request goes back to the rep
#   (bills to "Checked" with the reason, the advance draft deleted); they fix
#   and send again. SENT AGAIN (17 Nov 2026): back to whoever rejected it --
#   the steps approved before stay approved ("Approved before (SR-x)") -- as
#   long as the bill's photo is the same and its amount is not higher; else
#   from the first approver. resent_from names the rejected request.
#
#   NOTHING GETS STUCK (17 Nov 2026), sweep(): a step is SKIPPED when its
#   approver is no longer active (left, or login disabled) or on approved
#   leave today, and MOVES UP one level after 2 working days (Sundays not
#   counted) with no action -- the approver is told -- except a bill read as
#   High risk (score under 70), which waits. It STOPS AT SM / ZSM (the user,
#   17 Nov 2026): nothing is ever moved on to a GM or the CEO -- a step whose
#   next approver is GM / CEO waits, and so does the SM / ZSM step itself.
#   Runs when a request is sent, after each approval, and hourly
#   (Server Script "Settlement Escalation", the same sweep()).
#
#   GET  action=mine                         the caller's requests + their chain
#   POST action=send_bills   [rows=a,b]      every checked, unsent bill (or just those), one request each
#   POST action=send_cash    amount, purpose
#   POST action=withdraw     name            own, while nobody has decided yet
#   GET  action=queue                        waiting on me / my team / decided by me
#                                            (overview: IT department, System Manager)
#   POST action=decide       name, decision (Approve | Reject), note
#
# The chain: Employee.reports_to from the requester up, skipping anyone not
# Active, with no enabled login, or a "Vacant" placeholder, up to the first
# GM (the last step). A line that never reaches a GM ends at the CEO, added
# last if the line never reaches him either.
#
# safe_exec: no import, no .format(), no set literals, no tuple unpacking,
# no underscore-prefixed names, no frappe.parse_json -- the chain and the
# bills are child tables (Settlement Step, Settlement Bill), not JSON.

CEO_USER = "ceo@elbrit.org"
CEO_DESIGNATION = "Chief Executive Officer"
OVERVIEW_DEPARTMENTS = ["IT - ELPL"]
OVERVIEW_ROLES = ["System Manager"]
LEVELS = ["BE", "ABM", "RBM", "SRBM", "DEPUTY RBM", "SM", "ZSM", "GM"]
# Booking (17 Nov 2026) -- the user's decisions: cost center Main, one payable
# account with the Employee as party, advances on their own account.
BOOK = True
BOOKING = {
    "company": "Elbrit Lifesciences Private Limited",
    "payable": "2120 - Employee Expense Payable - ELPL",
    "advance": "Employee Expense Advances - ELPL",
    "cost_center": "Main - ELPL",
    "other": "5309 - Other Employee Expenditure - ELPL",
    # first match wins, on the bill's title ("Hotel bill", "Cab fare", ...)
    "kinds": [
        {"account": "5229 - Accomodation Expenditure - ELPL", "words": ["hotel", "lodge", "lodging", "stay", "room", "accommodation", "accomodation", "resort", "guest house", "inn"]},
        {"account": "5230 - Fuel Expenditure - ELPL", "words": ["fuel", "petrol", "diesel", "cng"]},
        {"account": "5211 - Food Expenditure - ELPL", "words": ["food", "meal", "restaurant", "lunch", "dinner", "breakfast", "snack", "tea", "coffee", "sweet"]},
        {"account": "5228 - Travel Expenditure - ELPL", "words": ["cab", "taxi", "uber", "ola", "rapido", "auto", "train", "rail", "irctc", "bus", "flight", "air", "ticket", "travel", "toll", "parking", "metro"]},
    ],
}


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
            if lv == "CEO" or lv == "GM":
                ceo = True          # the last step: the GM (or the CEO, with no GM above)
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
    # the requester's HQ = their seat's territory (17 Nov 2026: the approvers'
    # list goes HQ > employee), "HQ-Trichy" -> "Trichy"
    hq = ""
    seat = frappe.db.get_value("Employee", d.employee, "custom_role_profile", cache=True)
    if seat:
        hq = str(frappe.db.get_value("Role Profile", seat, "custom_territory", cache=True) or "")
    if hq[:3].upper() == "HQ-":
        hq = hq[3:]
    resent = None
    if d.get("resent_from"):
        pv = frappe.db.get_value("Settlement Request", d.resent_from, ["note", "decided_by"], as_dict=True)
        if pv:
            resent = {"from": d.resent_from, "note": pv.note or "",
                      "by": str(frappe.db.get_value("User", pv.decided_by, "full_name") or pv.decided_by or "")}
    booked = None
    if d.get("booked"):
        bk = frappe.db.get_value("Expense Claim", d.booked, ["status", "grand_total", "total_amount_reimbursed"], as_dict=True)
        if bk:
            booked = {"claim": d.booked, "status": bk.status or "", "due": bk.grand_total, "paid": bk.total_amount_reimbursed}
    elif d.kind == "Cash" and d.advance and d.status == "Approved":
        ad = frappe.db.get_value("Employee Advance", d.advance, ["status", "paid_amount", "docstatus"], as_dict=True)
        if ad and ad.docstatus == 1:
            booked = {"advance": d.advance, "status": ad.status or "", "paid": ad.paid_amount}
    return {"name": d.name, "hq": hq, "resent": resent, "booked": booked, "employee": d.employee, "employee_name": d.employee_name, "user": d.user,
            "kind": d.kind, "status": d.status, "amount": d.amount, "claim": d.claim or "", "advance": d.advance or "",
            "purpose": d.purpose or "", "step": d.step, "next_approver": d.next_approver or "", "next_label": d.next_label or "",
            "note": d.note or "", "decided_by": d.decided_by or "", "decided_on": str(d.decided_on or ""),
            "creation": str(d.creation), "modified": str(d.modified), "steps": steps, "bills": bills}


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


def account_for(title, cfg):
    # the expense account for a bill, from its title
    t = " " + str(title or "").lower() + " "
    for k in cfg["kinds"]:
        for w in k["words"]:
            if (" " + w) in t:
                return k["account"]
    return cfg["other"]


def book_bill(d, b, cfg):
    # one CEO-approved bill -> its own submitted Expense Claim -> the claim name
    row = frappe.db.get_value("Expense Claim Detail", b.row, ["expense_date", "description", "amount", "custom_bill"], as_dict=True)
    if not row:
        frappe.throw("Bill row " + str(b.row) + " is gone -- it cannot be booked.")
    amt = frappe.utils.flt(row.amount)
    ec = frappe.get_doc({
        "doctype": "Expense Claim",
        "employee": d.employee,
        "company": cfg["company"],
        "posting_date": frappe.utils.today(),
        "approval_status": "Approved",
        "payable_account": cfg["payable"],
        "cost_center": cfg["cost_center"],
        "remark": "Settlement " + d.name + ": approved up to the CEO in the app.",
        "expenses": [{
            "expense_date": row.expense_date,
            "expense_type": "Miscellaneous",
            "description": row.description or b.title,
            "amount": amt,
            "sanctioned_amount": amt,
            "default_account": account_for(row.description or b.title, cfg),
            "cost_center": cfg["cost_center"],
            "custom_bill": row.custom_bill,
            "custom_settlement": d.name,
        }],
    })
    # the employee's open cash advances (paid, not yet claimed) cover it first
    left = amt
    for a in frappe.get_all("Employee Advance", filters={"employee": d.employee, "docstatus": 1, "advance_account": cfg["advance"], "paid_amount": [">", 0]},
                            fields=["name", "posting_date", "paid_amount", "claimed_amount", "return_amount"], order_by="posting_date asc", limit_page_length=50):
        un = frappe.utils.flt(a.paid_amount) - frappe.utils.flt(a.claimed_amount) - frappe.utils.flt(a.return_amount)
        if un <= 0 or left <= 0:
            continue
        take = un if un < left else left
        ec.append("advances", {"employee_advance": a.name, "posting_date": a.posting_date, "advance_paid": a.paid_amount,
                               "unclaimed_amount": un, "allocated_amount": take, "advance_account": cfg["advance"]})
        left = left - take
    ec.flags.ignore_permissions = True
    ec.insert(ignore_permissions=True)
    ec.submit()
    if row.custom_bill:
        try:
            frappe.get_doc({"doctype": "File", "file_url": row.custom_bill, "attached_to_doctype": "Expense Claim",
                            "attached_to_name": ec.name, "is_private": 1}).insert(ignore_permissions=True)
        except Exception:
            pass        # the bill stays on the settlement claim; the row names it
    return ec.name


def book_cash(d, cfg):
    # a CEO-approved cash request -> its Employee Advance submitted (to be paid)
    ea = frappe.get_doc("Employee Advance", d.advance)
    if ea.docstatus == 1:
        return ea.name
    ea.advance_account = cfg["advance"]
    if frappe.get_meta("Employee Advance").has_field("repay_unclaimed_amount_from_salary"):
        ea.repay_unclaimed_amount_from_salary = 1      # unspent cash comes back from salary (the user)
    ea.flags.ignore_permissions = True
    ea.flags.settlement = True
    ea.submit()
    return ea.name


def finalize(d, by, cfg, book):
    # the LAST step approved (the GM; the CEO where no GM is above): the bill
    # is Verified and booked in the accounts (or the cash advance submitted),
    # to be paid in a payment batch the CEO approves
    d.status = "Approved"
    d.next_approver = None
    d.next_label = None
    d.decided_by = by
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
    if book and booking_ready(cfg):
        try:
            if d.kind == "Bills":
                made = []
                for b in d.bills or []:
                    made.append(book_bill(d, b, cfg))
                if made:
                    d.booked = made[0]
            elif d.advance:
                book_cash(d, cfg)
        except Exception as err:
            frappe.throw("Not approved: it could not be booked in the accounts (" + str(err)[:300] + "). Nothing was changed -- tell IT.")
    notify(d.user, ("Your bill is approved -- it will be paid in the next payment run" if d.kind == "Bills" else "Your cash request is approved -- it will be paid in the next payment run")
           + " (" + frappe.utils.fmt_money(d.amount, currency="INR") + ")", d.name)


def booking_ready(cfg):
    return frappe.db.exists("Account", cfg["payable"]) and frappe.db.exists("Account", cfg["advance"])


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
    # rows=a,b: only those bills (the app sends a bill the moment it is added,
    # 16 Nov 2026 -- so a sent-back bill is not resent before it is fixed)
    only = []
    for x in str(fd.get("rows") or "").split(","):
        if x.strip():
            only.append(x.strip())
    claim = None
    picked = []
    for c in claims:
        if frappe.db.exists("Expense Claim Detail", {"parent": c, "parenttype": "Expense Claim", "expense_type": "Food"}):
            continue
        rflt = [["parent", "=", c], ["parenttype", "=", "Expense Claim"], ["custom_bill_status", "=", "Checked"],
                ["custom_settlement", "is", "not set"]]
        if only:
            rflt.append(["name", "in", only])
        rows = frappe.get_all("Expense Claim Detail",
                              filters=rflt,
                              fields=["name", "expense_date", "description", "amount", "custom_bill", "custom_ai_score", "custom_ai_risk", "custom_ai_reason"],
                              order_by="idx asc", limit_page_length=500)
        if rows:
            claim = c
            picked = rows
            break
    if not picked:
        frappe.throw("No checked bills to send -- add a bill, and wait for its check to finish.")
    chain = chain_of(emp.name, CEO_USER, CEO_DESIGNATION, LEVELS)
    # 16 Nov 2026 (the user): EACH BILL IS ITS OWN REQUEST, with its own
    # chain, so every row of the claim carries its own status (and its own
    # Settlement Request link) and one bill never holds up another.
    total = 0
    made = []
    now = frappe.utils.now()
    for r in picked:
        total = total + frappe.utils.flt(r.amount)
        title = str(r.description or "")[:140]
        bill = {"row": r.name, "bill_date": r.expense_date, "title": title, "amount": r.amount,
                "bill": r.custom_bill, "ai_score": r.custom_ai_score, "ai_risk": r.custom_ai_risk, "ai_reason": r.custom_ai_reason}
        # sent again (17 Nov 2026): back to whoever rejected it, unless the
        # photo changed or the amount went up (looked up BEFORE the new request
        # exists -- it would be the latest one with this bill)
        prev = last_rejected(r.name, emp.name)
        d = new_request(emp, me, "Bills", r.amount, title or "1 bill", claim, None, [bill], chain)
        changed = False
        if prev:
            d.resent_from = prev.parent
            if str(prev.bill or "") == str(r.custom_bill or "") and frappe.utils.flt(r.amount) <= frappe.utils.flt(prev.amount) + 0.5:
                carry(d, prev.parent)
            changed = True
        if sweep(d, now, False) or changed:
            d.save(ignore_permissions=True)
        frappe.db.set_value("Expense Claim Detail", r.name, {"custom_bill_status": "In Approval", "custom_settlement": d.name, "custom_review_note": None})
        made.append(d)
    # the approvers may open the claim and its bill photos (read only)
    for c in chain:
        if c["user"] != me and not frappe.db.exists("DocShare", {"share_doctype": "Expense Claim", "share_name": claim, "user": c["user"]}):
            sh = frappe.get_doc({"doctype": "DocShare", "share_doctype": "Expense Claim", "share_name": claim, "user": c["user"],
                                 "read": 1, "write": 0, "share": 0, "notify_by_email": 0})
            sh.flags.ignore_share_permission = True
            sh.insert(ignore_permissions=True)
    # one alert per approver for the whole send, not one per bill (a bill
    # sent again may wait on someone further up)
    n = len(made)
    tell = {}
    for d in made:
        t = tell.get(d.next_approver) or {"n": 0, "amount": 0, "name": d.name}
        t["n"] = t["n"] + 1
        t["amount"] = t["amount"] + frappe.utils.flt(d.amount)
        tell[d.next_approver] = t
    for u in tell:
        t = tell[u]
        notify(u, str(t["n"]) + (" bill" if t["n"] == 1 else " bills") + " to approve: " + str(emp.employee_name) + " · " + frappe.utils.fmt_money(t["amount"], currency="INR"), t["name"])
    out = []
    for d in made:
        out.append(shape(d))
    frappe.response["message"] = {"requests": out, "count": n, "amount": total}

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
            # the next approver on leave or gone: straight past them (17 Nov 2026)
            if not sweep(d, frappe.utils.now(), True):
                notify(d.next_approver, ("Settlement" if d.kind == "Bills" else "Cash request") + " to approve: " + str(d.employee_name) + " · " + frappe.utils.fmt_money(d.amount, currency="INR"), d.name)
        else:
            # the last step (the GM): approved and booked -- or not at all
            finalize(d, me, BOOKING, BOOK)
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
