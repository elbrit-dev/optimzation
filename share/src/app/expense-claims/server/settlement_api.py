# Server Script "Settlement API" -- type API, method settlement (16 Nov 2026).
# Settlement approval: a request goes up the requester's reporting line --
# BE > ABM > RBM > SM/ZSM > GM > CEO -- one approver at a time.
#
# THE CEO GETS BATCHES (18 Nov 2026, management): the approver right before
# the CEO (the GM; the SM where no GM is above) sends the bills they approve
# to the CEO as ONE BATCH per send (Settlement Batch, SB-#####). The CEO
# approves the batch -- or sends single bills back with a reason, the rest
# approved. The CEO's approval is final: the bills are booked in the ledger
# at once, and Accounts pays them with no further approval (Settlement Pay
# API). A request that reaches the CEO any other way (a GM's own bill, one
# sent again to a CEO who rejected it) gets a batch of its own. Every action goes through here (reps and approvers have
# no DocType permission on Settlement Request), with the caller's own token.
#
#   SETTLEMENT HAS ITS OWN DOCTYPE (23 Nov 2026, the user: "there will be a
#   confusion and issue if we use the same for both") -- nothing here touches
#   Expense Claim any more; Expense Claim holds only the field TA/DA. Each bill
#   is a Settlement Expense (SE-#####), written only through this script
#   (reps have no DocType permission on it):
#     Checking -> Checked (scored by the bill check) -> In Approval (sent) ->
#     Verified (the CEO approved; booked) -> Paid (Accounts paid it)
#   A sent-back bill is Checked again with the reason (review_note).
#
#   A BILLS request: ONE bill (16 Nov 2026). "Send" makes one request per
#   unsent bill, each with its own chain, so every bill has its own status and
#   its own Settlement Request link. The bill keeps its AI score. A CASH
#   request: an Employee Advance (draft) asked for; CEO approval -> the request
#   is Verified.
#
#   BOOKED AT THE CEO'S APPROVAL, when BOOK and the accounts exist:
#     a bill  -> ONE submitted Journal Entry (23 Nov 2026; was an Expense
#                Claim): Dr the expense account for its kind (hotel 5229,
#                travel 5228, food 5211, fuel 5230, else 5309); Cr the
#                employee's unspent cash advances first ("Employee Expense
#                Advances", party = the Employee, against the advance -- the
#                advance shows that part under "Returned"), the rest Cr 2120
#                Employee Expense Payable, party = the Employee. -> the bill's
#                journal_entry, from_advance, payable
#     cash    -> the Employee Advance submitted on "Employee Expense
#                Advances"; unspent cash is paid back by the employee to the
#                bank (no salary recovery)
#   A booking that fails stops the approval too (nothing half done): the CEO
#   sees why. Accounts then pays what is owed (Settlement Accounts API).
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
#   SETTLEMENT TYPES (23 Nov 2026, the user), every rule in the single
#   DocType "Settlement Settings":
#     Own             the employee's own expense, of a kind marked "own" there;
#                     never a TA/DA kind (Stay / Food / Fuel / Travel -- paid in
#                     the monthly TA/DA claim); the whole chain up to the CEO
#     Doctor activity spent on a doctor, up to the limit (Rs 2,000): ONE
#                     approval, the direct manager; booked to its own account
#     Doctor service  spent on a doctor, above the limit: tagged to a Doctor
#                     Service already asked for that doctor in the bill's month
#                     (approved or in approval), up to what is left of it; ONE approval, which
#                     can be given only once the service is approved
#                     SWITCH (24 Nov 2026, the user): Settlement Settings "Over the
#                     limit: tag to a Doctor Service" OFF -> no service is asked:
#                     the rep gives the day the service was done (service_date)
#                     and the bill goes like a doctor activity (ONE approval, no
#                     waiting on a service), still "Doctor service" and booked
#                     to the service account. ON (default) = as above. A bill
#                     tagged to a service always waits for that service.
#   Cash up front only for the seat levels in the settings (RBM and above).
#
#   GET  action=settings                     what the app's forms need from Settlement Settings
#   GET  action=doctors      q               the caller's doctors matching q (Lead permissions apply)
#   GET  action=services     doctor, [date]  that doctor's open Doctor Services of the bill's month, with what is left
#   GET  action=mine                         the caller's requests + their chain
#   GET  action=bills        [names=a,b]     the caller's own bills (Settlement Expense), newest first
#   POST action=add_bill     bill_date, title, amount, bill (file_url), [proof, hand_note],
#                            kind (own) | doctor [, doctor_service (over the limit) | service_date (switch off)]
#                                            a new bill; the photos are the caller's own
#                                            unattached private Files, attached here
#   POST action=remove_bill  name            own, not sent (Checking / Checked)
#   POST action=score        name, score, reason, amount, bill, [read_amount, read_date,
#                            read_vendor, meta]   the bill check only (SCORERS): -> Checked
#   POST action=send_bills   [rows=a,b]      every checked, unsent bill (or just those), one request each
#   POST action=send_cash    amount, purpose
#   POST action=withdraw     name            own, while nobody has decided yet
#   GET  action=queue                        waiting on me / my team / decided by me
#                                            (overview: IT department, System Manager)
#   POST action=decide       name, decision (Approve | Reject), note
#   POST action=approve_many names=a,b       approve them all; those that reach the CEO go as ONE batch
#   GET  action=ceo_batches                  the CEO's batches (waiting, and the last 30 days)
#   POST action=decide_batch name            the CEO approves what is still waiting in a batch
#
# The chain: Employee.reports_to from the requester up, skipping anyone not
# Active, with no enabled login, or a "Vacant" placeholder, until the CEO. A
# line that never reaches the CEO gets the CEO added last: the CEO always
# decides last, on a batch.
#
# safe_exec: no import, no .format(), no set literals, no tuple unpacking,
# no underscore-prefixed names, no frappe.parse_json -- the chain and the
# bills are child tables (Settlement Step, Settlement Bill), not JSON.

CEO_DESIGNATION = "Chief Executive Officer"
OVERVIEW_DEPARTMENTS = ["IT - ELPL"]
OVERVIEW_ROLES = ["System Manager"]
LEVELS = ["BE", "ABM", "RBM", "SRBM", "DEPUTY RBM", "SM", "ZSM", "GM"]
BOOK = True

# SETTLEMENT SETTINGS (23 Nov 2026, the user: "the settlement settings page has
# all the things needed for the settlement") -- the single DocType "Settlement
# Settings" holds every rule below; these are only the fallbacks for a field
# left empty (or before the page exists).
DEFAULTS = {
    "company": "Elbrit Lifesciences Private Limited",
    "payable": "2120 - Employee Expense Payable - ELPL",
    "advance": "Employee Expense Advances - ELPL",
    "cost_center": "Main - ELPL",
    "other": "5309 - Other Employee Expenditure - ELPL",
    "ceo_user": "ceo@elbrit.org",
    # the logins the app's bill check scores with (ERP_AI_CHECKER_TOKEN)
    "scorers": ["Administrator", "it@elbrit.org"],
    # sanity limits (security review): older / bigger is not a field expense
    "max_age": 365,
    "max_amount": 200000,
    # spent on a doctor: up to this is a "Doctor activity" (one approval);
    # above it must be tagged to a Doctor Service already asked for
    "activity_limit": 2000,
    # above the limit: tagged to a Doctor Service (1, the switch on) -- or 0:
    # just the day the service was done, approved like a doctor activity
    "service_needs_record": 1,
    "activity_account": "",
    "service_account": "",
    # who may ask for cash up front (seat levels)
    "advance_levels": ["RBM", "SRBM", "DEPUTY RBM", "SM", "ZSM", "GM"],
    # the bill kinds: own = a rep may claim it as their own expense; ta_da =
    # paid in the monthly TA/DA claim, so never as an own settlement (only
    # when spent on a doctor). First word match wins (whole words).
    "kinds": [
        {"kind": "Stay", "account": "5229 - Accomodation Expenditure - ELPL", "own": 0, "ta_da": 1,
         "words": ["hotel", "lodge", "lodging", "stay", "room", "accommodation", "accomodation", "resort", "guest house", "inn"]},
        {"kind": "Fuel", "account": "5230 - Fuel Expenditure - ELPL", "own": 0, "ta_da": 1, "words": ["fuel", "petrol", "diesel", "cng"]},
        {"kind": "Food", "account": "5211 - Food Expenditure - ELPL", "own": 0, "ta_da": 1,
         "words": ["food", "meal", "restaurant", "lunch", "dinner", "breakfast", "snack", "tea", "coffee", "sweet", "tiffin"]},
        {"kind": "Travel", "account": "5228 - Travel Expenditure - ELPL", "own": 0, "ta_da": 1,
         "words": ["cab", "taxi", "uber", "ola", "rapido", "auto", "train", "rail", "irctc", "bus", "flight", "air", "ticket", "travel", "toll", "parking", "metro"]},
        {"kind": "Courier & postage", "account": "5221 - Postage & Courier Expenditure - ELPL", "own": 1, "ta_da": 0, "words": ["courier", "postage", "post", "parcel"]},
        {"kind": "Printing & stationery", "account": "5220 - Printing & Stationery Expenditure - ELPL", "own": 1, "ta_da": 0,
         "words": ["printing", "print", "xerox", "photocopy", "stationery"]},
        {"kind": "Phone & internet", "account": "5406 - Telephone & Broadband Expenditure - ELPL", "own": 1, "ta_da": 0,
         "words": ["phone", "mobile", "recharge", "internet", "broadband", "sim"]},
        {"kind": "Meeting", "account": "5216 - Meeting Expenditure - ELPL", "own": 1, "ta_da": 0, "words": ["meeting", "hall", "venue", "conference"]},
        {"kind": "Other", "account": "5309 - Other Employee Expenditure - ELPL", "own": 1, "ta_da": 0, "words": []},
    ],
}


def load_settings(dflt):
    # Settlement Settings -> the rules, each empty field falling back to dflt
    out = {}
    for k in dflt:
        out[k] = dflt[k]
    if not frappe.db.exists("DocType", "Settlement Settings"):
        return out
    s = frappe.get_doc("Settlement Settings")
    pick = [["company", "company"], ["payable", "payable_account"], ["advance", "advance_account"], ["cost_center", "cost_center"],
            ["other", "other_account"], ["ceo_user", "ceo_user"], ["activity_account", "doctor_activity_account"],
            ["service_account", "doctor_service_account"]]
    for p in pick:
        if s.get(p[1]):
            out[p[0]] = s.get(p[1])
    if frappe.utils.flt(s.get("doctor_activity_limit")) > 0:
        out["activity_limit"] = frappe.utils.flt(s.get("doctor_activity_limit"), 2)
    # the switch: only a value SAVED on the page counts -- a Check never saved
    # reads as 0 on the doc, which must not mean "off" -> the default (on)
    sw = frappe.db.sql("select value from `tabSingles` where doctype = 'Settlement Settings' and field = 'doctor_service_needs_record'")
    if sw and str(sw[0][0] if sw[0][0] is not None else "").strip() != "":
        out["service_needs_record"] = frappe.utils.cint(sw[0][0])
    if frappe.utils.flt(s.get("bill_max_amount")) > 0:
        out["max_amount"] = frappe.utils.flt(s.get("bill_max_amount"), 2)
    if frappe.utils.cint(s.get("bill_max_age_days")) > 0:
        out["max_age"] = frappe.utils.cint(s.get("bill_max_age_days"))
    lv = []
    for x in str(s.get("advance_levels") or "").replace(",", "\n").split("\n"):
        if x.strip():
            lv.append(x.strip().upper())
    if lv:
        out["advance_levels"] = lv
    sc = []
    for x in str(s.get("bill_checker_users") or "").replace(",", "\n").split("\n"):
        if x.strip():
            sc.append(x.strip())
    if sc:
        out["scorers"] = sc
    kinds = []
    for r in s.get("kinds") or []:
        if not r.kind:
            continue
        ws = []
        for w in str(r.words or "").replace("\n", ",").split(","):
            if w.strip():
                ws.append(w.strip().lower())
        kinds.append({"kind": r.kind, "account": r.account or out["other"], "own": frappe.utils.cint(r.own), "ta_da": frappe.utils.cint(r.ta_da), "words": ws})
    if kinds:
        out["kinds"] = kinds
    return out


BOOKING = load_settings(DEFAULTS)
CEO_USER = BOOKING["ceo_user"]
SCORERS = BOOKING["scorers"]
BILL_MAX_AGE_DAYS = BOOKING["max_age"]
BILL_MAX_AMOUNT = BOOKING["max_amount"]


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
    # the requester is never their own approver (a reports_to loop, or a
    # record that reports to itself)
    seen = {emp_name: 1}
    own = frappe.db.get_value("Employee", emp_name, "user_id")
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
        live = m.status == "Active" and m.user_id and m.user_id != own and str(m.employee_name or "")[:6].lower() != "vacant" and frappe.db.get_value("User", m.user_id, "enabled")
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
    # the requester's HQ = their seat's territory (17 Nov 2026: the approvers'
    # list goes HQ > employee), "HQ-Trichy" -> "Trichy"
    # and the TEAM = the seat's department (18 Nov 2026: SM, GM and the CEO
    # see Team > employee): Role Profile.custom_department; an SM-type seat
    # lists several (custom_departments) -> the first; none -> the
    # Employee's own. "Elbrit Trichy - ELPL" -> "Elbrit Trichy"
    hq = ""
    team = ""
    seat = frappe.db.get_value("Employee", d.employee, "custom_role_profile", cache=True)
    if seat:
        rp = frappe.db.get_value("Role Profile", seat, ["custom_territory", "custom_department"], as_dict=True) or {}
        hq = str(rp.get("custom_territory") or "")
        team = str(rp.get("custom_department") or "")
        if not team:
            team = str(frappe.db.get_value("Department Multiselect", {"parent": seat, "parenttype": "Role Profile", "parentfield": "custom_departments"},
                                           "department", order_by="idx asc") or "")
    if not team:
        team = str(frappe.db.get_value("Employee", d.employee, "department", cache=True) or "")
    if hq[:3].upper() == "HQ-":
        hq = hq[3:]
    if team[-7:] == " - ELPL":
        team = team[:-7]
    resent = None
    if d.get("resent_from"):
        pv = frappe.db.get_value("Settlement Request", d.resent_from, ["note", "decided_by"], as_dict=True)
        if pv:
            resent = {"from": d.resent_from, "note": pv.note or "",
                      "by": str(frappe.db.get_value("User", pv.decided_by, "full_name") or pv.decided_by or "")}
    booked = None
    if d.kind == "Bills" and d.status == "Approved":
        # the bill's Journal Entry: what of it was owed to the employee, and
        # what of that is still unpaid
        for b in d.bills or []:
            se = frappe.db.get_value("Settlement Expense", b.row, ["journal_entry", "payable", "from_advance", "status"], as_dict=True)
            if se and se.journal_entry and not live_je(se.journal_entry):
                # Accounts cancelled the booking: nothing is booked, nothing paid
                booked = {"entry": "", "status": "Not booked", "due": 0, "advance": 0, "paid": 0}
            elif se and se.journal_entry:
                left = outstanding(se.journal_entry, d.employee)
                booked = {"entry": se.journal_entry, "status": "Paid" if left < 0.5 else "Unpaid", "due": se.payable,
                          "advance": se.from_advance, "paid": frappe.utils.flt(frappe.utils.flt(se.payable) - left, 2)}
    elif d.kind == "Cash" and d.advance and d.status == "Approved":
        ad = frappe.db.get_value("Employee Advance", d.advance, ["status", "paid_amount", "docstatus"], as_dict=True)
        if ad and ad.docstatus == 1:
            booked = {"advance": d.advance, "status": ad.status or "", "paid": ad.paid_amount}
    return {"name": d.name, "hq": hq, "team": team, "resent": resent, "booked": booked, "batch": d.get("batch") or "", "employee": d.employee, "employee_name": d.employee_name, "user": d.user,
            "kind": d.kind, "status": d.status, "amount": d.amount, "claim": d.claim or "", "advance": d.advance or "",
            "purpose": d.purpose or "", "step": d.step, "next_approver": d.next_approver or "", "next_label": d.next_label or "",
            "note": d.note or "", "decided_by": d.decided_by or "", "decided_on": str(d.decided_on or ""),
            "creation": str(d.creation), "modified": str(d.modified), "steps": steps, "bills": bills,
            "type": d.get("settlement_type") or ("Cash" if d.kind == "Cash" else "Own"), "expense_kind": d.get("expense_kind") or "",
            "doctor": d.get("doctor") or "", "doctor_name": d.get("doctor_name") or "",
            "service": service_state(d.get("doctor_service")) if d.get("doctor_service") else None,
            "service_date": str(d.get("service_date") or "")}


def held_up(d, i, now):
    # why step i of a waiting request should not wait on its approver, else ""
    st = d.steps[i]
    m = frappe.db.get_value("Employee", {"user_id": st.user, "status": "Active"}, "name")
    if not m or not frappe.db.get_value("User", st.user, "enabled"):
        return "No longer active -- skipped"
    # a High-risk bill never skips a level -- not for leave, not for time: it
    # waits (23 Nov 2026: was checked after leave, so it skipped an ABM on leave)
    for b in d.bills or []:
        if frappe.utils.flt(b.ai_score) < 70:
            return ""
    day = str(now)[:10]
    if frappe.db.exists("Leave Application", {"employee": m, "status": "Approved", "docstatus": 1,
                                              "from_date": ["<=", day], "to_date": [">=", day]}):
        return "On leave -- skipped"
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
        notify(d.next_approver, ("Settlement" if d.kind == "Bills" else "Advance request") + " to approve: " + str(d.employee_name)
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


def words_of(text):
    # " hotel bill " -- lower case, every non-letter/digit a space, so a word
    # matches only as a whole word ("inn" is not "Innova", "air" not "Airtel")
    out = ""
    for c in str(text or "").lower():
        out = out + (c if c.isalnum() else " ")
    return " " + " ".join(out.split()) + " "


def account_for(title, cfg, kind=None):
    # the expense account for a bill: a whole word of its title (a plural
    # "s" allowed), else the kind the bill reader saw on the photo, else Other
    t = words_of(title)
    for k in cfg["kinds"]:
        for w in k["words"]:
            if (" " + w + " ") in t or (" " + w + "s ") in t:
                return k["account"]
    kk = words_of(kind).strip()
    if kk:
        for k in cfg["kinds"]:
            if kk in k["words"]:
                return k["account"]
    return cfg["other"]


def kind_row(name, cfg):
    # a bill kind of the settings by its name, or None
    for k in cfg["kinds"]:
        if k["kind"] == name:
            return k
    return None


def ta_da_kind(reader_kind, title, cfg):
    # the TA/DA kind (Stay / Food / Fuel / Travel) a bill really is -- by the
    # kind the bill reader saw on the photo, else by its title -- or None
    for t in [words_of(reader_kind), words_of(title)]:
        for k in cfg["kinds"]:
            if not k["ta_da"]:
                continue
            for w in k["words"]:
                if (" " + w + " ") in t or (" " + w + "s ") in t:
                    return k
    return None


def book_account(se, cfg):
    # the account a bill is booked to: by its settlement type (the doctor ones
    # from the settings), an own bill by its kind
    t = se.get("settlement_type") or "Own"
    if t == "Doctor activity" or t == "Doctor service":
        acct = cfg["activity_account"] if t == "Doctor activity" else cfg["service_account"]
        if not acct:
            frappe.throw("No account is set for " + t.lower() + " bills -- Accounts must set it in Settlement Settings first.")
        return acct
    k = kind_row(se.get("expense_kind"), cfg)
    if k and k["account"]:
        return k["account"]
    return account_for(se.get("title"), cfg, read_kind(se.get("bill_meta")))


def service_state(ds, but=None):
    # a Doctor Service a doctor bill is tagged to -> {name, doctor, state,
    # approved, refused, amount, billed, left}; billed = every live bill tagged
    # to it (not counting `but`)
    s = frappe.db.get_value("Doctor Service", ds, ["name", "doctor", "doctor_name", "service_name", "service_amount", "workflow_state", "date"], as_dict=True) if ds else None
    if not s:
        return None
    st = str(s.workflow_state or "")
    billed = 0
    for b in frappe.get_all("Settlement Expense", filters={"doctor_service": ds, "status": ["in", ["Checking", "Checked", "In Approval", "Verified", "Paid"]]},
                            fields=["name", "amount"], limit_page_length=200):
        if b.name != but:
            billed = billed + frappe.utils.flt(b.amount)
    amt = frappe.utils.flt(s.service_amount, 2)
    return {"name": s.name, "doctor": s.doctor, "doctor_name": s.doctor_name or "", "service": s.service_name or "", "date": str(s.date or ""),
            "state": st, "approved": "Approved" in st, "refused": ("Reject" in st) or not st,
            "amount": amt, "billed": frappe.utils.flt(billed, 2), "left": frappe.utils.flt(amt - billed, 2)}


def read_kind(meta):
    # the bill reader's kind ("hotel", "cab", ...) out of bill_meta, or None
    try:
        m = json.loads(meta or "{}")
        md = ((m.get("bill") or {}).get("markdown")) or ""
        return (json.loads(md) or {}).get("kind") if md else None
    except Exception:
        return None


def outstanding(je, employee):
    # what of a bill's Journal Entry is still owed to the employee on 2120
    # (Payment Ledger: the entry's own credit, less the payments against it)
    r = frappe.db.sql("""select sum(amount_in_account_currency) from `tabPayment Ledger Entry`
        where against_voucher_type = 'Journal Entry' and against_voucher_no = %s and party_type = 'Employee'
          and party = %s and account = %s and delinked = 0""", (je, employee, BOOKING["payable"]))
    # 2120 is a Payable: credit minus debit, so above 0 is still owed; below 0
    # is OVERPAID -- nothing is owed then (23 Nov 2026: was abs(), so an
    # overpaid bill read as owed again)
    s = frappe.utils.flt(r[0][0] if r and r[0] else 0, 2)
    return s if s > 0 else 0


def live_je(je):
    # the bill's booking still stands (a cancelled Journal Entry books nothing:
    # its ledger rows are delinked, which must not read as "paid")
    return bool(je) and frappe.db.get_value("Journal Entry", je, "docstatus") == 1


def settlement_advances(employee):
    # the cash advances the app gave this employee (its Cash requests) -- only
    # these are used up by bills, never an advance HR or Accounts gave otherwise
    out = []
    for a in frappe.get_all("Settlement Request", filters={"employee": employee, "kind": "Cash", "advance": ["is", "set"]}, pluck="advance", limit_page_length=500):
        if a and a not in out:
            out.append(a)
    return out


def book_bill(d, b, cfg):
    # one CEO-approved bill -> ONE submitted Journal Entry -> its name
    se = frappe.db.get_value("Settlement Expense", b.row, ["name", "bill_date", "title", "amount", "bill", "bill_meta", "journal_entry",
                                                           "settlement_type", "expense_kind", "doctor", "doctor_name", "doctor_service", "service_date"], as_dict=True)
    if not se:
        frappe.throw("Bill " + str(b.row) + " is gone -- it cannot be booked.")
    # booked already (a second approval of the same batch): never twice
    if live_je(se.journal_entry):
        return se.journal_entry
    flt = frappe.utils.flt
    # booked exactly as the approvers saw it: the amount and photo on the request
    if abs(flt(se.amount) - flt(b.amount)) > 0.005 or str(se.bill or "") != str(b.bill or ""):
        frappe.throw("Bill " + se.name + " changed after it was sent for approval -- it cannot be booked. Send it back.")
    amt = flt(se.amount, 2)
    if amt <= 0:
        frappe.throw("Bill " + se.name + " has no amount -- it cannot be booked.")
    acct = book_account(se, cfg)
    # tagged to a service: only once it is approved (no service -- the switch
    # was off -- nothing to wait for)
    if se.settlement_type == "Doctor service" and se.doctor_service:
        sv = service_state(se.doctor_service, se.name)
        if not sv or not sv["approved"]:
            frappe.throw("Bill " + se.name + ": its doctor service " + str(se.doctor_service) + " is not approved yet -- it can be approved once the service is.")
    who = ""
    if se.doctor:
        who = " for " + str(se.doctor_name or se.doctor) + " (" + str(se.doctor) + ")" + (", service " + str(se.doctor_service) if se.doctor_service else "") \
            + (", service done " + str(se.service_date) if se.service_date else "")
    remark = ("Settlement " + d.name + " · " + se.name + " · " + str(se.settlement_type or "Own") + who + ": " + str(se.title or "")
              + " (bill of " + str(se.bill_date) + "), approved in the app.")
    rows = [{"account": acct, "debit_in_account_currency": amt, "cost_center": cfg["cost_center"], "user_remark": str(se.title or "")[:140]}]
    # the employee's unspent cash advances from the app (paid, not yet used)
    # cover it first -- rounded to the paisa, so the rows always balance
    left = amt
    used = 0
    mine = settlement_advances(d.employee)
    if mine:
        for a in frappe.get_all("Employee Advance", filters={"name": ["in", mine], "employee": d.employee, "docstatus": 1, "advance_account": cfg["advance"], "paid_amount": [">", 0]},
                                fields=["name", "paid_amount", "claimed_amount", "return_amount"], order_by="posting_date asc", limit_page_length=50):
            un = flt(flt(a.paid_amount) - flt(a.claimed_amount) - flt(a.return_amount), 2)
            if un < 0.01 or left < 0.01:
                continue
            take = un if un < left else left
            rows.append({"account": cfg["advance"], "party_type": "Employee", "party": d.employee, "credit_in_account_currency": take,
                         "reference_type": "Employee Advance", "reference_name": a.name, "cost_center": cfg["cost_center"]})
            left = flt(left - take, 2)
            used = flt(used + take, 2)
    if left >= 0.01:
        rows.append({"account": cfg["payable"], "party_type": "Employee", "party": d.employee, "credit_in_account_currency": left,
                     "cost_center": cfg["cost_center"]})
    else:
        left = 0
    je = frappe.get_doc({"doctype": "Journal Entry", "voucher_type": "Journal Entry", "company": cfg["company"],
                         "posting_date": frappe.utils.today(), "user_remark": remark, "accounts": rows})
    je.flags.ignore_permissions = True
    try:
        je.insert(ignore_permissions=True)
        je.submit()
    except Exception as err:
        frappe.throw("Bill " + se.name + " (" + str(d.employee_name or d.employee) + ", " + frappe.utils.fmt_money(amt, currency="INR") + "): " + str(err)[:300])
    # the bill photo on the entry too, for Accounts
    if se.bill:
        try:
            frappe.get_doc({"doctype": "File", "file_url": se.bill, "attached_to_doctype": "Journal Entry",
                            "attached_to_name": je.name, "is_private": 1}).insert(ignore_permissions=True)
        except Exception:
            pass        # the bill stays on the Settlement Expense
    # all of it out of the cash already given: nothing left to pay -> Paid
    vals = {"journal_entry": je.name, "expense_account": acct, "from_advance": used, "payable": left}
    if left <= 0:
        vals["status"] = "Paid"
    frappe.db.set_value("Settlement Expense", se.name, vals)
    return je.name


def book_cash(d, cfg):
    # a CEO-approved cash request -> its Employee Advance submitted (to be paid)
    ea = frappe.get_doc("Employee Advance", d.advance)
    if ea.docstatus == 1:
        return ea.name
    ea.advance_account = cfg["advance"]
    # dated the day the CEO approved it (Accounts' ageing counts from approval,
    # not from the day the rep asked)
    ea.posting_date = frappe.utils.today()
    if frappe.get_meta("Employee Advance").has_field("repay_unclaimed_amount_from_salary"):
        ea.repay_unclaimed_amount_from_salary = 0      # NOT from salary (user 2026-11-18): the employee pays unspent cash back to the bank; Accounts record it with the advance's Return
    ea.flags.ignore_permissions = True
    ea.flags.settlement = True
    ea.submit()
    return ea.name


def finalize(d, by, cfg, book):
    # the LAST step approved (the CEO, on a batch): the bill
    # is Verified and booked in the accounts (or the cash advance submitted),
    # to be paid in a payment batch the CEO approves
    d.status = "Approved"
    d.next_approver = None
    d.next_label = None
    d.decided_by = by
    d.decided_on = frappe.utils.now()
    if d.kind == "Bills":
        for b in d.bills or []:
            frappe.db.set_value("Settlement Expense", b.row, "status", "Verified")
    if book and not booking_ready(cfg):
        # never Verified without a booking: Accounts would never see it
        frappe.throw("Not approved: the accounts " + cfg["payable"] + " / " + cfg["advance"] + " are missing in the ERP -- tell IT.")
    if book:
        try:
            if d.kind == "Bills":
                for b in d.bills or []:
                    book_bill(d, b, cfg)
            elif d.advance:
                book_cash(d, cfg)
        except Exception as err:
            frappe.throw("Not approved: it could not be booked in the accounts (" + str(err)[:300] + "). Nothing was changed -- tell IT.")
    notify(d.user, ("Your bill is approved -- it will be paid in the next payment run" if d.kind == "Bills" else "Your advance is approved -- it will be paid in the next payment run")
           + " (" + frappe.utils.fmt_money(d.amount, currency="INR") + ")", d.name)


def make_batch(reqs, by, ceo_user):
    # the requests that just reached the CEO -> ONE Settlement Batch for him
    if not reqs:
        return None
    who = frappe.db.get_value("Employee", {"user_id": by, "status": "Active"}, "employee_name") or by
    items = []
    total = 0
    for d in reqs:
        items.append({"request": d.name, "employee": d.employee, "employee_name": d.employee_name,
                      "amount": d.amount, "title": str(d.purpose or "")[:140]})
        total = total + frappe.utils.flt(d.amount)
    sb = frappe.get_doc({"doctype": "Settlement Batch", "status": "Waiting", "made_by": by, "made_by_name": who,
                         "amount": total, "count": len(items), "lines": items})
    sb.insert(ignore_permissions=True)
    for d in reqs:
        d.batch = sb.name
    notify(ceo_user, "Batch to approve from " + str(who) + ": " + str(len(items)) + (" bill" if len(items) == 1 else " bills")
           + " · " + frappe.utils.fmt_money(total, currency="INR"), sb.name)
    return sb.name


def close_batch(name, by):
    # a batch with nothing left waiting is Done
    if not name:
        return
    left = frappe.get_all("Settlement Request", filters={"batch": name, "status": "Waiting"}, pluck="name", limit_page_length=1)
    if not left and frappe.db.get_value("Settlement Batch", name, "status") == "Waiting":
        frappe.db.set_value("Settlement Batch", name, {"status": "Done", "decided_by": by, "decided_on": frappe.utils.now()})


def approve_one(d, me, cfg, book):
    # the caller's step approved -> "ceo" when the request now waits on the CEO
    # (it needs a batch), "done" when it was the last step, else ""
    i = frappe.utils.cint(d.step)
    step = d.steps[i]
    step.decided_on = frappe.utils.now()
    step.decision = "Approved"
    if i + 1 < len(d.steps):
        d.step = i + 1
        d.next_approver = d.steps[i + 1].user
        d.next_label = d.steps[i + 1].level
        # the next approver on leave or gone: straight past them (17 Nov 2026)
        sweep(d, frappe.utils.now(), False)
        if d.next_label == "CEO":
            return "ceo"
        notify(d.next_approver, ("Settlement" if d.kind == "Bills" else "Advance request") + " to approve: " + str(d.employee_name)
               + " · " + frappe.utils.fmt_money(d.amount, currency="INR"), d.name)
        return ""
    finalize(d, me, cfg, book)
    return "done"


def reject_one(d, me, who, note):
    i = frappe.utils.cint(d.step)
    step = d.steps[i]
    step.decided_on = frappe.utils.now()
    step.note = note
    step.decision = "Rejected"
    d.status = "Rejected"
    d.note = note
    d.next_approver = None
    d.next_label = None
    d.decided_by = me
    d.decided_on = frappe.utils.now()
    for b in d.bills or []:
        frappe.db.set_value("Settlement Expense", b.row, {"status": "Checked", "settlement": None,
                                                         "review_note": ("Returned by " + who + ": " + note)[:500]})
        unshare(b.row, [])
    if d.advance and frappe.db.get_value("Employee Advance", d.advance, "docstatus") == 0:
        frappe.delete_doc("Employee Advance", d.advance, ignore_permissions=True, force=True)
        d.advance = None
    notify(d.user, "Sent back by " + who + ": " + note, d.name)


def unshare(se_name, keep):
    # the approvers' read access to a bill (and so to its photos) ends when it
    # leaves their chain: sent back, taken back, or sent again up another chain
    for s in frappe.get_all("DocShare", filters={"share_doctype": "Settlement Expense", "share_name": se_name}, fields=["name", "user"], limit_page_length=100):
        if s.user not in keep:
            frappe.delete_doc("DocShare", s.name, ignore_permissions=True, force=True)


def booking_ready(cfg):
    return frappe.db.exists("Account", cfg["payable"]) and frappe.db.exists("Account", cfg["advance"])


def notify(user, subject, name):
    try:
        frappe.get_doc({"doctype": "Notification Log", "for_user": user, "type": "Alert", "subject": subject,
                        "document_type": "Settlement Request", "document_name": name}).insert(ignore_permissions=True)
    except Exception:
        pass


BILL_FIELDS = ["name", "employee", "bill_date", "title", "amount", "bill", "proof", "hand_note", "status", "settlement", "review_note",
               "journal_entry", "from_advance", "payable", "creation", "modified",
               "settlement_type", "expense_kind", "doctor", "doctor_name", "doctor_service", "service_date"]


def bill_out(b):
    # a Settlement Expense as the app reads it (the rep never sees the score)
    paid = 0
    entry = ""
    status = b.status or "Checking"
    if b.journal_entry and live_je(b.journal_entry):
        entry = b.journal_entry
        paid = frappe.utils.flt(frappe.utils.flt(b.payable) - outstanding(b.journal_entry, b.employee), 2)
        # paid in full some other way than the payment page: Paid for the rep too
        if status == "Verified" and frappe.utils.flt(b.payable) > 0 and paid >= frappe.utils.flt(b.payable) - 0.005:
            status = "Paid"
    elif b.journal_entry and status in ["Verified", "Paid"]:
        # its booking was cancelled by Accounts: approved, but not booked any more
        status = "Verified"
    return {"name": b.name, "date": str(b.bill_date or ""), "title": b.title or "", "amount": frappe.utils.flt(b.amount),
            "bill": b.bill or "", "proof": b.proof or "", "hand_note": b.hand_note or "", "status": status,
            "settlement": b.settlement or "", "review": b.review_note or "", "entry": entry,
            "from_advance": frappe.utils.flt(b.from_advance), "payable": frappe.utils.flt(b.payable), "paid": paid,
            "type": b.get("settlement_type") or "Own", "kind": b.get("expense_kind") or "", "doctor": b.get("doctor") or "",
            "doctor_name": b.get("doctor_name") or "", "doctor_service": b.get("doctor_service") or "",
            "service_date": str(b.get("service_date") or ""),
            "creation": str(b.creation), "modified": str(b.modified)}


def own_file(url, user):
    # a private File the caller uploaded, not yet attached to anything -> its name
    if not url:
        return None
    # the same photo uploaded twice shares its file_url: take the copy attached to nothing
    f = frappe.db.get_value("File", {"file_url": url, "owner": user, "attached_to_name": ["is", "not set"]}, "name", order_by="creation desc")
    if not f:
        if frappe.db.exists("File", {"file_url": url, "owner": user}):
            frappe.throw("That photo is already on another bill -- add it again.")
        frappe.throw("That photo was not uploaded by you -- add it again.")
    # the same file anywhere else -- on a bill, or uploaded by someone else
    # (a private URL an approver once saw): never a second bill from it
    for o in frappe.get_all("File", filters={"file_url": url}, fields=["owner", "attached_to_doctype", "attached_to_name"], limit_page_length=20):
        if o.owner != user or o.attached_to_name:
            if o.attached_to_doctype == "Settlement Expense" and frappe.db.get_value("Settlement Expense", o.attached_to_name, "user") == user:
                # the same bill sent twice (a retry after a lost answer)
                frappe.throw("This bill is already added -- it is on your Settlements page.")
            frappe.throw("That photo is already on a bill -- take a new photo of the bill.")
    return f


fd = frappe.form_dict
action = str(fd.get("action") or "mine")
me = frappe.session.user
if not me or me == "Guest":
    frappe.throw("Please log in", frappe.PermissionError)
emp = frappe.db.get_value("Employee", {"user_id": me, "status": "Active"}, ["name", "employee_name", "department"], as_dict=True)
overview = me == "Administrator" or bool(emp and emp.department in OVERVIEW_DEPARTMENTS)
if not overview and frappe.db.exists("Has Role", {"parent": me, "parenttype": "User", "role": ["in", OVERVIEW_ROLES]}):
    overview = True


def new_request(emp, me, kind, amount, purpose, claim, advance, bills, chain, extra=None):
    users = []
    steps = []
    for c in chain:
        users.append(c["user"])
        steps.append({"user": c["user"], "approver_name": c["name"], "level": c["level"]})
    doc = {
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
    }
    # the bill's settlement type, doctor and doctor service, for the approvers
    for k in extra or {}:
        doc[k] = extra[k]
    d = frappe.get_doc(doc)
    d.insert(ignore_permissions=True)
    return d


if action == "mine":
    rows = []
    preview = []
    if emp:
        for r in frappe.get_all("Settlement Request", filters={"employee": emp.name, "status": ["!=", "Withdrawn"]},
                                pluck="name", order_by="creation desc", limit_page_length=30):
            x = shape(frappe.get_doc("Settlement Request", r))
            # the bill check's score is for the approvers only, never the rep
            # (its reasons would show how to tune a bill to pass)
            for b in x["bills"]:
                b["score"] = None
                b["risk"] = ""
                b["reason"] = ""
            rows.append(x)
        preview = chain_of(emp.name, CEO_USER, CEO_DESIGNATION, LEVELS)
    frappe.response["message"] = {"requests": rows, "chain": preview, "overview": overview}

elif action == "bills":
    out = []
    if emp:
        flt = {"employee": emp.name}
        names = []
        for x in str(fd.get("names") or "").split(","):
            if x.strip():
                names.append(x.strip())
        if names:
            flt["name"] = ["in", names]
        for b in frappe.get_all("Settlement Expense", filters=flt, fields=BILL_FIELDS, order_by="bill_date desc, creation desc", limit_page_length=500):
            out.append(bill_out(b))
    frappe.response["message"] = {"bills": out, "employee": emp.name if emp else None}

elif action == "add_bill":
    if not emp:
        frappe.throw("No active employee is linked to this login.")
    day = str(fd.get("bill_date") or "")[:10]
    title = " ".join(str(fd.get("title") or "").split())[:140]
    amount = frappe.utils.flt(fd.get("amount"), 2)
    bill = str(fd.get("bill") or "").strip()
    proof = str(fd.get("proof") or "").strip()
    if not (len(day) == 10 and day[4] == "-" and day[7] == "-" and day[:4].isdigit() and day[5:7].isdigit() and day[8:].isdigit()):
        frappe.throw("Which date is the bill of?")
    if day > frappe.utils.today():
        frappe.throw("The bill's date cannot be in the future.")
    if day < frappe.utils.add_days(frappe.utils.today(), -BILL_MAX_AGE_DAYS):
        frappe.throw("This bill is more than " + str(BILL_MAX_AGE_DAYS) + " days old -- it cannot be claimed.")
    if not title:
        frappe.throw("Say what the bill was for.")
    # flt("nan") is NaN, which no comparison passes: "not (amount > 0)" catches it
    if not (amount > 0) or amount > BILL_MAX_AMOUNT:
        frappe.throw("Enter the bill amount." if not (amount > 0) else "A bill over " + frappe.utils.fmt_money(BILL_MAX_AMOUNT, currency="INR") + " cannot be added here -- talk to Accounts.")
    if not bill:
        frappe.throw("Add a photo of the bill.")
    # WHO IT WAS FOR (23 Nov 2026, the user): the rep's own expense, or money
    # spent on a doctor. The type follows from the amount here, never the app:
    #   own              a kind the settings allow as own (never a TA/DA kind --
    #                    those are paid in the monthly TA/DA claim)
    #   doctor, <= limit "Doctor activity": one approval, the direct manager
    #   doctor, >  limit "Doctor service": tagged to a Doctor Service already
    #                    asked for that doctor (approved or in approval), up to
    #                    what is left of it; one approval, paid once it is approved
    doctor = str(fd.get("doctor") or "").strip()
    kind = " ".join(str(fd.get("kind") or "").split())[:140]
    ds = str(fd.get("doctor_service") or "").strip()
    sday = str(fd.get("service_date") or "")[:10]
    stype = "Own"
    dname = None
    if doctor:
        # a doctor this login may see (the Lead permission rules apply)
        seen = frappe.get_list("Lead", filters={"name": doctor}, fields=["name", "lead_name"], limit_page_length=1)
        if not seen:
            frappe.throw("That doctor is not one of yours.")
        dname = seen[0].lead_name or doctor
        if amount <= BOOKING["activity_limit"]:
            stype = "Doctor activity"
            ds = ""
            sday = ""
        elif not BOOKING["service_needs_record"] and not ds:
            # the switch is off (24 Nov 2026): no Doctor Service -- the day the
            # service was done; approved like a doctor activity
            stype = "Doctor service"
            if not (len(sday) == 10 and sday[4] == "-" and sday[7] == "-" and sday[:4].isdigit() and sday[5:7].isdigit() and sday[8:].isdigit()):
                frappe.throw("Which day was the service done?")
            if sday > frappe.utils.today():
                frappe.throw("The service day cannot be in the future.")
            if sday < frappe.utils.add_days(frappe.utils.today(), -BILL_MAX_AGE_DAYS):
                frappe.throw("The service day is more than " + str(BILL_MAX_AGE_DAYS) + " days ago.")
        else:
            stype = "Doctor service"
            sday = ""
            sv = service_state(ds)
            if not sv or sv["doctor"] != doctor:
                frappe.throw("Over " + frappe.utils.fmt_money(BOOKING["activity_limit"], currency="INR") + " on a doctor: pick the doctor service it was for.")
            if sv["refused"]:
                frappe.throw("That doctor service was not approved -- it cannot take a bill.")
            if str(sv["date"])[:7] != day[:7]:
                frappe.throw("That doctor service is for " + str(sv["date"])[:7] + " -- pick a service of the bill's month (" + day[:7] + ").")
            if amount > sv["left"] + 0.5:
                frappe.throw("Only " + frappe.utils.fmt_money(sv["left"], currency="INR") + " is left on that doctor service (of " + frappe.utils.fmt_money(sv["amount"], currency="INR") + ").")
    else:
        ds = ""
        sday = ""
        k = kind_row(kind, BOOKING)
        if not k or not k["own"]:
            frappe.throw("Pick what the expense was for." if not k else kind + " is paid in your monthly TA/DA claim -- add it there, or choose \"Spent on a doctor\" if it was for a doctor.")
    files = [[own_file(bill, me), "bill"]]
    if proof:
        files.append([own_file(proof, me), "proof"])
    se = frappe.get_doc({"doctype": "Settlement Expense", "employee": emp.name, "employee_name": emp.employee_name, "user": me,
                         "status": "Checking", "bill_date": day, "title": title, "amount": amount, "bill": bill, "proof": proof or None,
                         "hand_note": " ".join(str(fd.get("hand_note") or "").split())[:500] or None,
                         "settlement_type": stype, "expense_kind": kind if stype == "Own" else (kind or None),
                         "doctor": doctor or None, "doctor_name": dname, "doctor_service": ds or None, "service_date": sday or None})
    se.insert(ignore_permissions=True)
    for f in files:
        # the rep stays its owner (that is how they open their own photo); the
        # "Settlement File Guard" script stops them deleting or detaching it
        frappe.db.set_value("File", f[0], {"attached_to_doctype": "Settlement Expense", "attached_to_name": se.name, "attached_to_field": f[1]})
    b = frappe.db.get_value("Settlement Expense", se.name, BILL_FIELDS, as_dict=True)
    frappe.response["message"] = {"bill": bill_out(b)}

elif action == "remove_bill":
    name = str(fd.get("name") or "")
    b = frappe.db.get_value("Settlement Expense", name, ["name", "employee", "status", "settlement"], as_dict=True) if name else None
    if not b or not emp or b.employee != emp.name:
        frappe.throw("That is not your bill.", frappe.PermissionError)
    if b.status not in ["Checking", "Checked"] or b.settlement:
        frappe.throw("A bill sent for approval can only be taken back from the approval itself.")
    for f in frappe.get_all("File", filters={"attached_to_doctype": "Settlement Expense", "attached_to_name": name}, pluck="name"):
        frappe.delete_doc("File", f, ignore_permissions=True, force=True)
    # its place in the duplicate register is freed, so the same bill can be added again
    if frappe.db.exists("DocType", "Bill Fingerprint"):
        for p in frappe.get_all("Bill Fingerprint", filters={"trip": name, "status": "Used"}, pluck="name"):
            frappe.delete_doc("Bill Fingerprint", p, ignore_permissions=True, force=True)
    frappe.delete_doc("Settlement Expense", name, ignore_permissions=True, force=True)
    frappe.response["message"] = {"removed": name}

elif action == "score":
    # the app's bill check (its checker login) writes what it read and the score
    if me not in SCORERS:
        frappe.throw("Only the bill check scores bills.", frappe.PermissionError)
    name = str(fd.get("name") or "")
    b = frappe.db.get_value("Settlement Expense", name, ["name", "status", "amount", "bill"], as_dict=True) if name else None
    if not b:
        frappe.throw("No such bill: " + name)
    # changed or decided while the check ran: leave it
    if b.status != "Checking" or abs(frappe.utils.flt(b.amount) - frappe.utils.flt(fd.get("amount"))) > 0.5 or str(b.bill or "") != str(fd.get("bill") or ""):
        frappe.response["message"] = {"skipped": 1, "status": b.status}
    else:
        sc = frappe.utils.flt(fd.get("score"))
        risk = "Low" if sc >= 90 else ("Medium" if sc >= 70 else "High")
        vals = {"ai_score": sc, "ai_risk": risk, "ai_reason": str(fd.get("reason") or "")[:500], "status": "Checked",
                "read_vendor": str(fd.get("read_vendor") or "")[:140] or None, "bill_meta": str(fd.get("meta") or "")[:20000] or None}
        if fd.get("read_amount"):
            vals["read_amount"] = frappe.utils.flt(fd.get("read_amount"))
        rd = str(fd.get("read_date") or "")[:10]
        if len(rd) == 10 and rd[4] == "-":
            vals["read_date"] = rd
        frappe.db.set_value("Settlement Expense", name, vals)
        frappe.response["message"] = {"name": name, "score": sc, "risk": risk, "status": "Checked"}

elif action == "send_bills":
    if not emp:
        frappe.throw("No active employee is linked to this login.")
    # rows=a,b: only those bills (the app sends a bill the moment it is added,
    # 16 Nov 2026 -- so a sent-back bill is not resent before it is fixed)
    only = []
    for x in str(fd.get("rows") or "").split(","):
        if x.strip():
            only.append(x.strip())
    rflt = [["employee", "=", emp.name], ["status", "=", "Checked"], ["settlement", "is", "not set"]]
    if only:
        rflt.append(["name", "in", only])
    picked = frappe.get_all("Settlement Expense", filters=rflt,
                            fields=["name", "bill_date", "title", "amount", "bill", "ai_score", "ai_risk", "ai_reason",
                                    "settlement_type", "expense_kind", "doctor", "doctor_name", "doctor_service", "service_date", "bill_meta"],
                            order_by="bill_date asc, creation asc", limit_page_length=500)
    claim = None
    if not picked:
        frappe.throw("No checked bills to send -- add a bill, and wait for its check to finish.")
    chain = chain_of(emp.name, CEO_USER, CEO_DESIGNATION, LEVELS)
    refused = []
    # 16 Nov 2026 (the user): EACH BILL IS ITS OWN REQUEST, with its own
    # chain, so every row of the claim carries its own status (and its own
    # Settlement Request link) and one bill never holds up another.
    total = 0
    made = []
    now = frappe.utils.now()
    for r in picked:
        # locked, then read again: two sends at once (the sheet's own send and
        # a tap on Send) make ONE request -- the second sees it already sent
        cur = frappe.db.get_value("Settlement Expense", r.name, ["status", "settlement"], as_dict=True, for_update=True)
        if not cur or cur.status != "Checked" or cur.settlement:
            continue
        stype = r.settlement_type or "Own"
        # an own bill the photo shows is a TA/DA cost (a hotel, a meal, fuel,
        # a ticket): paid in the monthly TA/DA claim, never here
        if stype == "Own":
            td = ta_da_kind(read_kind(r.bill_meta), "", BOOKING)
            if td:
                refused.append(str(r.title or r.name) + ": this is a " + td["kind"].lower() + " bill -- it is paid in your monthly TA/DA claim. Remove it, or add it again as spent on a doctor if it was for one.")
                continue
        # a doctor-service bill tagged to a service: it must still have room for it
        if stype == "Doctor service" and r.doctor_service:
            sv = service_state(r.doctor_service, r.name)
            if not sv or sv["refused"] or frappe.utils.flt(r.amount) > sv["left"] + 0.5:
                refused.append(str(r.title or r.name) + ": its doctor service " + str(r.doctor_service) + (" was not approved." if sv and sv["refused"] else " has no room left for it."))
                continue
        total = total + frappe.utils.flt(r.amount)
        title = str(r.title or "")[:140]
        bill = {"row": r.name, "bill_date": r.bill_date, "title": title, "amount": r.amount,
                "bill": r.bill, "ai_score": r.ai_score, "ai_risk": r.ai_risk, "ai_reason": r.ai_reason}
        # a doctor bill has ONE approval -- the direct manager (23 Nov 2026,
        # the user); an own bill goes up the whole chain to the CEO
        use = chain if stype == "Own" else [chain[0]]
        extra = {"settlement_type": stype, "expense_kind": r.expense_kind, "doctor": r.doctor, "doctor_name": r.doctor_name,
                 "doctor_service": r.doctor_service, "service_date": r.service_date}
        # sent again (17 Nov 2026): back to whoever rejected it, unless the
        # photo changed or the amount went up (looked up BEFORE the new request
        # exists -- it would be the latest one with this bill)
        prev = last_rejected(r.name, emp.name)
        d = new_request(emp, me, "Bills", r.amount, title or "1 bill", claim, None, [bill], use, extra)
        changed = False
        if prev:
            d.resent_from = prev.parent
            if str(prev.bill or "") == str(r.bill or "") and frappe.utils.flt(r.amount) <= frappe.utils.flt(prev.amount) + 0.5:
                carry(d, prev.parent)
            changed = True
        moved = sweep(d, now, False)
        # straight to the CEO (a GM's own bill; sent again to the CEO who
        # rejected it): a batch of its own
        if d.next_label == "CEO" and not d.get("batch"):
            make_batch([d], me, CEO_USER)
            moved = True
        if moved or changed:
            d.save(ignore_permissions=True)
        frappe.db.set_value("Settlement Expense", r.name, {"status": "In Approval", "settlement": d.name, "review_note": None})
        made.append(d)
        # the approvers may open the bill and its photos (read only) -- only
        # this chain's (a bill sent again may go up a changed chain)
        keep = []
        for c in use:
            keep.append(c["user"])
        unshare(r.name, keep)
        for c in use:
            if c["user"] != me and not frappe.db.exists("DocShare", {"share_doctype": "Settlement Expense", "share_name": r.name, "user": c["user"]}):
                sh = frappe.get_doc({"doctype": "DocShare", "share_doctype": "Settlement Expense", "share_name": r.name, "user": c["user"],
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
    if refused and not made:
        frappe.throw(" ".join(refused))
    out = []
    for d in made:
        out.append(shape(d))
    frappe.response["message"] = {"requests": out, "count": n, "amount": total, "refused": refused}

elif action == "send_cash":
    if not emp:
        frappe.throw("No active employee is linked to this login.")
    # cash up front only for the levels in Settlement Settings (23 Nov 2026,
    # the user: RBM and above -- RBM, SM / ZSM, GM)
    lv = level_of(frappe.db.get_value("Employee", emp.name, "custom_role_profile"), frappe.db.get_value("Employee", emp.name, "designation"),
                  me, CEO_USER, CEO_DESIGNATION, LEVELS)
    if str(lv).upper() not in BOOKING["advance_levels"]:
        frappe.throw("Advances are for " + ", ".join(BOOKING["advance_levels"]) + " -- add your bills and you are paid back.", frappe.PermissionError)
    amount = frappe.utils.flt(fd.get("amount"), 2)
    purpose = " ".join(str(fd.get("purpose") or "").split())[:500]
    if not (amount > 0):
        frappe.throw("Say how much you need.")
    if amount > BILL_MAX_AMOUNT:
        frappe.throw("An advance over " + frappe.utils.fmt_money(BILL_MAX_AMOUNT, currency="INR") + " cannot be asked for here -- talk to Accounts.")
    if not purpose:
        frappe.throw("Say what the advance is for.")
    chain = chain_of(emp.name, CEO_USER, CEO_DESIGNATION, LEVELS)
    ea = frappe.get_doc({"doctype": "Employee Advance", "employee": emp.name, "posting_date": frappe.utils.today(), "purpose": purpose,
                         "advance_amount": amount, "currency": "INR", "exchange_rate": 1})
    ea.flags.settlement = True       # "Employee Advance Task" makes no Accounts Task for it
    ea.insert(ignore_permissions=True)
    d = new_request(emp, me, "Cash", amount, purpose, None, ea.name, [], chain)
    if d.next_label == "CEO":
        make_batch([d], me, CEO_USER)
        d.save(ignore_permissions=True)
    notify(chain[0]["user"], "Advance request to approve: " + str(emp.employee_name) + " · " + frappe.utils.fmt_money(amount, currency="INR"), d.name)
    frappe.response["message"] = {"request": shape(d)}

elif action == "withdraw":
    name = str(fd.get("name") or "")
    d = frappe.get_doc("Settlement Request", name) if name and frappe.db.exists("Settlement Request", name) else None
    if not d or not emp or d.employee != emp.name:
        frappe.throw("That is not your request.", frappe.PermissionError)
    if d.status != "Waiting" or frappe.utils.cint(d.step) > 0:
        frappe.throw("It can only be taken back before anyone has approved it.")
    for b in d.bills or []:
        frappe.db.set_value("Settlement Expense", b.row, {"status": "Checked", "settlement": None})
        unshare(b.row, [])
    if d.advance and frappe.db.get_value("Employee Advance", d.advance, "docstatus") == 0:
        frappe.delete_doc("Employee Advance", d.advance, ignore_permissions=True, force=True)
        d.advance = None
    d.status = "Withdrawn"
    d.next_approver = None
    d.next_label = None
    d.save(ignore_permissions=True)
    # taken back from a CEO batch (a GM's own bill): the batch must not stay Waiting
    close_batch(d.get("batch"), me)
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
    if d.user == me and me != CEO_USER:
        frappe.throw("You cannot decide your own request.", frappe.PermissionError)
    who = str((emp and emp.employee_name) or me)
    batch = d.get("batch")
    if decision == "Approve":
        if d.get("settlement_type") == "Doctor service" and d.get("doctor_service"):
            sv = service_state(d.get("doctor_service"), d.bills[0].row if d.bills else None)
            if not sv or not sv["approved"]:
                frappe.throw("The doctor service " + str(d.get("doctor_service")) + " is " + (sv["state"].lower() if sv and sv["state"] else "not approved")
                             + " -- approve this bill once the service is approved.")
        d.steps[frappe.utils.cint(d.step)].note = note
        if approve_one(d, me, BOOKING, BOOK) == "ceo":
            make_batch([d], me, CEO_USER)          # one bill sent on its own: a batch of one
    elif decision == "Reject":
        if not note:
            frappe.throw("Say why it is rejected -- the requester sees it.")
        reject_one(d, me, who, note)
    else:
        frappe.throw("Approve or Reject?")
    d.save(ignore_permissions=True)
    close_batch(batch, me)
    frappe.response["message"] = {"request": shape(d)}

elif action == "approve_many":
    # 18 Nov 2026: the approver's selection in one go -- what reaches the CEO
    # goes to him as ONE batch
    names = []
    for x in str(fd.get("names") or "").split(","):
        if x.strip() and x.strip() not in names:
            names.append(x.strip())
    to_ceo = []
    done = 0
    skipped = []
    batches = []
    for name in names:
        d = frappe.get_doc("Settlement Request", name) if frappe.db.exists("Settlement Request", name) else None
        if not d or d.status != "Waiting" or d.next_approver != me or (d.user == me and me != CEO_USER):
            skipped.append(name)
            continue
        if d.get("settlement_type") == "Doctor service" and d.get("doctor_service"):
            sv = service_state(d.get("doctor_service"), d.bills[0].row if d.bills else None)
            if not sv or not sv["approved"]:
                skipped.append(name)          # waits for its doctor service
                continue
        if d.get("batch") and d.get("batch") not in batches:
            batches.append(d.get("batch"))
        r = approve_one(d, me, BOOKING, BOOK)
        if r == "ceo":
            to_ceo.append(d)
        else:
            d.save(ignore_permissions=True)
        done = done + 1
    sb = make_batch(to_ceo, me, CEO_USER)
    for d in to_ceo:
        d.save(ignore_permissions=True)
    for b in batches:
        close_batch(b, me)
    frappe.response["message"] = {"approved": done, "batch": sb, "to_ceo": len(to_ceo), "skipped": skipped}

elif action == "ceo_batches":
    if me != CEO_USER and not overview:
        frappe.throw("Batches are for the CEO.", frappe.PermissionError)
    since = frappe.utils.add_days(frappe.utils.today(), -30)
    out = []
    names = frappe.get_all("Settlement Batch", filters={"status": "Waiting"}, pluck="name", order_by="creation asc", limit_page_length=200)
    for x in frappe.get_all("Settlement Batch", filters={"status": "Done", "modified": [">=", since]}, pluck="name", order_by="modified desc", limit_page_length=100):
        names.append(x)
    for n in names:
        sb = frappe.get_doc("Settlement Batch", n)
        reqs = []
        for it in sb.lines or []:
            if frappe.db.exists("Settlement Request", it.request):
                reqs.append(shape(frappe.get_doc("Settlement Request", it.request)))
        out.append({"name": sb.name, "status": sb.status, "made_by": sb.made_by, "made_by_name": sb.made_by_name, "amount": sb.amount,
                    "count": sb.count, "creation": str(sb.creation), "decided_on": str(sb.decided_on or ""), "requests": reqs})
    frappe.response["message"] = {"batches": out, "ceo": me == CEO_USER}

elif action == "decide_batch":
    # the CEO approves what is still waiting on him in the batch (bills he
    # sent back one by one are already back with the rep): booked, final
    if me != CEO_USER:
        frappe.throw("Only the CEO approves a batch.", frappe.PermissionError)
    name = str(fd.get("name") or "")
    if not frappe.db.exists("Settlement Batch", name):
        frappe.throw("No such batch.")
    # locked until this approval is saved: a second tap / tab waits, then sees Done
    if frappe.db.get_value("Settlement Batch", name, "status", for_update=True) != "Waiting":
        frappe.throw("This batch is already decided.")
    n = 0
    total = 0
    # oldest first, so the cash advance covers the earliest bills (23 Nov 2026)
    for r in frappe.get_all("Settlement Request", filters={"batch": name, "status": "Waiting", "next_approver": me}, pluck="name", order_by="creation asc", limit_page_length=500):
        d = frappe.get_doc("Settlement Request", r)
        if d.get("settlement_type") == "Doctor service" and d.get("doctor_service"):
            sv = service_state(d.get("doctor_service"), d.bills[0].row if d.bills else None)
            if not sv or not sv["approved"]:
                continue          # waits in the batch for its doctor service
        approve_one(d, me, BOOKING, BOOK)
        d.save(ignore_permissions=True)
        n = n + 1
        total = total + frappe.utils.flt(d.amount)
    close_batch(name, me)
    frappe.response["message"] = {"approved": n, "amount": total, "batch": name}

elif action == "settings":
    # what the app's forms need from Settlement Settings
    lv = ""
    if emp:
        lv = level_of(frappe.db.get_value("Employee", emp.name, "custom_role_profile"), frappe.db.get_value("Employee", emp.name, "designation"),
                      me, CEO_USER, CEO_DESIGNATION, LEVELS)
    own = []
    own_words = []
    tada = []
    for k in BOOKING["kinds"]:
        if k["own"]:
            own.append(k["kind"])
            # the app picks an own bill's kind off the bill with these (24 Nov 2026)
            own_words.append({"kind": k["kind"], "words": k["words"]})
        if k["ta_da"]:
            tada.append({"kind": k["kind"], "words": k["words"]})
    frappe.response["message"] = {"own_kinds": own, "own_kind_words": own_words, "ta_da_kinds": tada, "activity_limit": BOOKING["activity_limit"],
                                  "service_needs_record": bool(BOOKING["service_needs_record"]), "max_amount": BILL_MAX_AMOUNT,
                                  "max_age_days": BILL_MAX_AGE_DAYS, "can_request_cash": str(lv).upper() in BOOKING["advance_levels"],
                                  "level": lv, "doctor_ready": {"activity": bool(BOOKING["activity_account"]), "service": bool(BOOKING["service_account"])}}

elif action == "doctors":
    # the caller's doctors matching q (the Lead permission rules apply)
    q = " ".join(str(fd.get("q") or "").split())[:60]
    out = []
    if len(q) >= 2:
        for x in frappe.get_list("Lead", or_filters=[["name", "like", "%" + q + "%"], ["lead_name", "like", "%" + q + "%"]],
                                 fields=["name", "lead_name", "city"], order_by="lead_name asc", limit_page_length=20):
            out.append({"id": x.name, "name": x.lead_name or x.name, "city": x.city or ""})
    frappe.response["message"] = {"doctors": out}

elif action == "services":
    # the doctor services a bill over the limit can be tagged to: this doctor's,
    # asked for in the app (approved or still in approval), with room left
    doctor = str(fd.get("doctor") or "").strip()
    if not doctor or not frappe.get_list("Lead", filters={"name": doctor}, pluck="name", limit_page_length=1):
        frappe.throw("That doctor is not one of yours.")
    # only the bill's month (24 Nov 2026, the user: "the already approved or
    # requested service for that month"); no date = this month
    day = str(fd.get("date") or frappe.utils.today())[:10]
    if not (len(day) == 10 and day[4] == "-" and day[7] == "-"):
        day = frappe.utils.today()
    flt = {"doctor": doctor, "workflow_state": ["is", "set"],
           "date": ["between", [str(frappe.utils.get_first_day(day)), str(frappe.utils.get_last_day(day))]]}
    out = []
    for x in frappe.get_all("Doctor Service", filters=flt, pluck="name", order_by="creation desc", limit_page_length=30):
        sv = service_state(x)
        if sv and not sv["refused"] and sv["left"] > 0.5:
            out.append(sv)
    frappe.response["message"] = {"services": out}

else:
    frappe.throw("Unknown action.")
