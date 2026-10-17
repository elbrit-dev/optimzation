# =====================================================================
# SERVER SCRIPT — the source of truth for the ERP's copy. Keep in step.
#
#   Name        : Elbrit Service Allocation Save
#   Script Type : API
#   API Method  : elbrit_service_allocation_save
#   Allow Guest : NO
#
#   POST /api/method/elbrit_service_allocation_save
#     { "month": "2026-10", "kind": "allocate",
#       "rows": [ { "employee": "E00010", "amount": 500000 }, ... ] }
#         the GM / CEO / IT: one amount per SM / ZSM for the month
#     { "month": "2026-10", "kind": "split",
#       "rows": [ { "department": "Elbrit Bangalore - ELPL", "amount": 200000 }, ... ] }
#         an SM / ZSM: their OWN allocation, across their own departments;
#         IT (role or IT role profile) may pass "employee" to split an SM's
#         allocation on their behalf (the comment says it was IT)
#     { "month": "2026-10", "kind": "request", "amount": 50000, "reason": "..." }
#         an SM / ZSM asks the GM for more (IT may pass "employee"). One
#         pending request at a time. Open ALL month, after the 20th too; a
#         request with nothing allocated yet starts the record at 0.
#     { "month": "2026-10", "kind": "decide", "employee": "E00010",
#       "request": "<request row name>", "action": "approve" | "reject",
#       "amount": 40000, "note": "..." }
#         the GM / CEO / IT: approve the amount asked or a revised "amount"
#         (it is ADDED to the allocation), or reject. Any time.
#
# Allocating only until the month's CUTOFF_DAY (the 20th). Splitting too,
# unless a request was approved after the 20th: that sets "reopened" so the
# SM can split the extra; it clears once fully split. A split may be up to the allocation -- over is allowed (the app shows
# it red) -- and decides the status: nothing split = "Not split", the whole
# allocation = "Split", else "Partly split".
#
# A SPLIT ALSO SETS THE DEPARTMENT BUDGET: each affected department's
# Department Service Budget row for the month becomes the sum of every SM's
# split for that department (made if the month row is missing).
#
# Every change leaves a comment on the allocation, and the doctype tracks
# changes (version history).
#
# safe_exec: no import, no .format(), no set literals, no tuple
# unpacking, no underscore-prefixed names.
# =====================================================================

CUTOFF_DAY = 20
PARENT = "Service Allocation"
CHILD = "Service Allocation Split"
BUDGET = "Department Service Budget"
BUDGET_FIELD = "custom_service_budget"
MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def is_vacant(eid, name):
    n = (name or "").strip().lower()
    return (eid or "")[:1].upper() == "V" and (eid or "")[1:2].isdigit() or n[:6] == "vacant"


def as_list(v):
    if isinstance(v, str):
        return json.loads(v or "[]")
    return v or []


def money(n):
    return frappe.utils.fmt_money(float(n or 0), currency="INR")


def status_of(amount, split_total):
    if split_total <= 0:
        return "Not split"
    if amount > 0 and split_total >= amount:
        return "Split"
    return "Partly split"


me = frappe.session.user
roles = frappe.get_all("Has Role", filters={"parent": me, "parenttype": "User"}, pluck="role")
# IT has full access too: the IT role, or the IT role profile.
it_profile = (frappe.db.get_value("User", me, "role_profile_name") or "") == "IT"
can_allocate = me == "Administrator" or "GM" in roles or "CEO" in roles or "IT" in roles or it_profile
emp = frappe.get_all("Employee", filters={"user_id": me, "status": "Active"},
                     fields=["name", "employee_name", "custom_role_profile"], limit=1)
emp = emp[0] if emp else {}
my_seat = emp.get("custom_role_profile") or ""
is_sm = my_seat[:3].upper() == "SM-" and not is_vacant(emp.get("name"), emp.get("employee_name"))

body = frappe.form_dict
month = str(body.get("month") or "").strip()[:7]
kind = str(body.get("kind") or "").strip()
rows = as_list(body.get("rows"))
if len(month) != 7 or month[4] != "-" or not (month[:4].isdigit() and month[5:].isdigit()):
    frappe.throw("month must be YYYY-MM")
if kind not in ["allocate", "split", "request", "decide"]:
    frappe.throw("kind must be allocate, split, request or decide")
today = frappe.utils.nowdate()
cutoff = month + "-" + ("0" if CUTOFF_DAY < 10 else "") + str(CUTOFF_DAY)
locked = today > cutoff
LOCKED_MSG = "This month is locked: changes were open until the " + str(CUTOFF_DAY) + "th."
# Allocating stays locked after the 20th. A split then needs the allocation
# reopened (an extra amount approved late); a request is open all month; a
# decision any time.
if kind == "allocate" and locked:
    frappe.throw(LOCKED_MSG)
if kind == "request" and month < today[:7]:
    frappe.throw("Requests for " + month + " are closed: the month is over.")
month_first = month + "-01"
now = frappe.utils.now()
is_it = me == "Administrator" or "IT" in roles or it_profile


def sm_target():
    # The SM a split / request is for: the caller, or (IT only) the
    # "employee" passed. Returns [employee dict, on_behalf].
    target = str(body.get("employee") or "").strip()
    if target and target != emp.get("name"):
        if not is_it:
            frappe.throw("Only IT can act on someone else's allocation on their behalf.")
        t = frappe.db.get_value("Employee", target, ["name", "employee_name", "custom_role_profile", "status"],
                                as_dict=True)
        if not t or t.get("status") != "Active" or (t.get("custom_role_profile") or "")[:3].upper() != "SM-":
            frappe.throw(target + " is not an active Sales Manager / ZSM.")
        return [t, True]
    if not is_sm:
        frappe.throw("Only a Sales Manager / ZSM works on their own allocation.")
    return [emp, False]


def sync_budget(dept):
    # The department's month row = every SM's split for it this month.
    total = 0
    parents = frappe.get_all(PARENT, filters={"month_key": month}, pluck="name", limit_page_length=0)
    if parents:
        for s in frappe.get_all(CHILD, filters=[["parenttype", "=", PARENT], ["parent", "in", parents],
                                                ["department", "=", dept]],
                                fields=["amount"], limit_page_length=0):
            total = total + float(s.get("amount") or 0)
    row = frappe.get_all(BUDGET, filters={"parenttype": "Department", "parent": dept,
                                          "parentfield": BUDGET_FIELD, "month": month_first},
                         pluck="name", limit=1)
    if row:
        frappe.db.set_value(BUDGET, row[0], "amount", total)
    else:
        n = len(frappe.get_all(BUDGET, filters={"parenttype": "Department", "parent": dept,
                                               "parentfield": BUDGET_FIELD}, pluck="name", limit_page_length=0))
        frappe.get_doc({"doctype": BUDGET, "parent": dept, "parenttype": "Department",
                        "parentfield": BUDGET_FIELD, "idx": n + 1, "month": month_first,
                        "month_label": MON[int(month[5:]) - 1] + " " + month[:4],
                        "amount": total}).insert(ignore_permissions=True)


if kind == "allocate":
    if not can_allocate:
        frappe.throw("Only the GM, the CEO or IT can allocate.")
    done = 0
    for r in rows:
        eid = str(r.get("employee") or "").strip()
        amount = float(r.get("amount") or 0)
        if not eid:
            continue
        if amount < 0:
            frappe.throw("An allocation cannot be negative.")
        e = frappe.db.get_value("Employee", eid, ["name", "employee_name", "custom_role_profile", "status"],
                                as_dict=True)
        if not e or e.get("status") != "Active" or (e.get("custom_role_profile") or "")[:3].upper() != "SM-":
            frappe.throw(eid + " is not an active Sales Manager / ZSM.")
        name = "SA-" + month + "-" + eid
        if frappe.db.exists(PARENT, name):
            doc = frappe.get_doc(PARENT, name)
            before = float(doc.amount or 0)
            if before == amount:
                continue
            doc.amount = amount
        else:
            before = None
            doc = frappe.get_doc({"doctype": PARENT, "employee": eid, "employee_name": e.get("employee_name"),
                                  "seat": e.get("custom_role_profile"), "month": month_first, "month_key": month,
                                  "amount": amount, "split_total": 0})
        doc.allocated_by = me
        doc.allocated_at = now
        doc.status = status_of(amount, float(doc.split_total or 0))
        if before is None:
            doc.insert(ignore_permissions=True)
        else:
            doc.save(ignore_permissions=True)
        doc.add_comment("Comment", ("Allocated " if before is None else "Allocation changed from " + money(before) + " to ")
                        + money(amount) + " for " + month)
        done = done + 1
    frappe.response["message"] = {"ok": True, "saved": done}
elif kind == "request":
    # An SM / ZSM asks the GM for more (IT may ask on their behalf).
    pair = sm_target()
    emp = pair[0]
    on_behalf = pair[1]
    amount = float(body.get("amount") or 0)
    reason = str(body.get("reason") or "").strip()
    if amount <= 0:
        frappe.throw("Enter the extra amount you need.")
    if not reason:
        frappe.throw("Say why you need more.")
    name = "SA-" + month + "-" + emp.get("name")
    if frappe.db.exists(PARENT, name):
        doc = frappe.get_doc(PARENT, name)
        for r in doc.requests or []:
            if r.status == "Pending":
                frappe.throw("A request for " + money(r.amount_requested) + " is still waiting for the GM. "
                             "Wait for that decision before asking again.")
    else:
        # Nothing allocated yet: the request starts the month's record at 0.
        doc = frappe.get_doc({"doctype": PARENT, "employee": emp.get("name"),
                              "employee_name": emp.get("employee_name"), "seat": emp.get("custom_role_profile"),
                              "month": month_first, "month_key": month, "amount": 0, "split_total": 0,
                              "status": "Not split"})
    doc.append("requests", {"amount_requested": amount, "reason": reason, "status": "Pending",
                            "requested_by": me, "requested_at": now})
    if doc.is_new():
        doc.insert(ignore_permissions=True)
    else:
        doc.save(ignore_permissions=True)
    doc.add_comment("Comment", "Asked for " + money(amount) + " more: " + reason
                    + (" -- by IT on their behalf" if on_behalf else ""))
    frappe.response["message"] = {"ok": True, "requested": amount}
elif kind == "decide":
    # The GM / CEO / IT approves (the amount asked, or a revised one) or rejects.
    if not can_allocate:
        frappe.throw("Only the GM, the CEO or IT can decide on a request.")
    target = str(body.get("employee") or "").strip()
    req = str(body.get("request") or "").strip()
    action = str(body.get("action") or "").strip().lower()
    note = str(body.get("note") or "").strip()
    if action not in ["approve", "reject"]:
        frappe.throw("action must be approve or reject")
    name = "SA-" + month + "-" + target
    if not target or not frappe.db.exists(PARENT, name):
        frappe.throw("No allocation record for " + (target or "that employee") + " in " + month + ".")
    doc = frappe.get_doc(PARENT, name)
    row = None
    for r in doc.requests or []:
        if r.name == req:
            row = r
    if not row:
        frappe.throw("That request was not found; reload the page.")
    if row.status != "Pending":
        frappe.throw("That request was already " + (row.status or "").lower() + ".")
    row.decided_by = me
    row.decided_at = now
    row.decision_note = note
    if action == "approve":
        granted = float(body.get("amount") if body.get("amount") not in [None, ""] else row.amount_requested or 0)
        if granted <= 0:
            frappe.throw("Approve an amount above zero, or reject the request.")
        row.status = "Approved"
        row.amount_approved = granted
        before = float(doc.amount or 0)
        doc.amount = before + granted
        doc.status = status_of(float(doc.amount or 0), float(doc.split_total or 0))
        if locked:
            # past the 20th: let the SM split the extra
            doc.reopened = 1
        doc.save(ignore_permissions=True)
        doc.add_comment("Comment", "Request approved: " + money(granted)
                        + (" (asked " + money(row.amount_requested) + ")" if granted != float(row.amount_requested or 0) else "")
                        + "; allocation " + money(before) + " -> " + money(doc.amount)
                        + (". Note: " + note if note else ""))
    else:
        row.status = "Rejected"
        row.amount_approved = 0
        doc.save(ignore_permissions=True)
        doc.add_comment("Comment", "Request for " + money(row.amount_requested) + " rejected"
                        + (": " + note if note else ""))
    frappe.response["message"] = {"ok": True, "status": row.status, "amount": float(doc.amount or 0)}
else:
    pair = sm_target()
    emp = pair[0]
    on_behalf = pair[1]
    name = "SA-" + month + "-" + emp.get("name")
    if not frappe.db.exists(PARENT, name):
        frappe.throw(("Nothing has been allocated to " + (emp.get("employee_name") or emp.get("name")) if on_behalf
                      else "Nothing has been allocated to you") + " for " + month + " yet.")
    if locked and not frappe.db.get_value(PARENT, name, "reopened"):
        frappe.throw(LOCKED_MSG)
    # the departments under this SM, as the read script lists them
    staff = frappe.get_all("Employee", filters={"status": "Active"},
                           fields=["name", "reports_to", "custom_role_profile"], limit_page_length=0)
    kids = {}
    for e in staff:
        if e.get("reports_to"):
            if e.get("reports_to") not in kids:
                kids[e.get("reports_to")] = []
            kids[e.get("reports_to")].append(e)
    seat_dept = {}
    for p in frappe.get_all("Role Profile", filters=[["custom_department", "is", "set"]],
                            fields=["name", "custom_department"], limit_page_length=0):
        seat_dept[p.get("name")] = p.get("custom_department")
    allowed = {}
    seen = {}
    frontier = [emp.get("name")]
    hops = 0
    while frontier and hops < 15:
        hops = hops + 1
        nxt = []
        for x in frontier:
            for k in kids.get(x) or []:
                if seen.get(k.get("name")):
                    continue
                seen[k.get("name")] = 1
                nxt.append(k.get("name"))
                d = seat_dept.get(k.get("custom_role_profile"))
                if d:
                    allowed[d] = 1
        # Down a level. Missing at first, so only direct reports' departments
        # were allowed: an SM's department two levels down (Sanjay Kumar's
        # Elbrit Mysore, 17 Oct 2026) was refused though the page listed it.
        frontier = nxt
    doc = frappe.get_doc(PARENT, name)
    touched = []
    for s in doc.splits or []:
        if s.department not in touched:
            touched.append(s.department)
    doc.set("splits", [])
    total = 0
    for r in rows:
        d = str(r.get("department") or "").strip()
        amount = float(r.get("amount") or 0)
        if not d or amount == 0:
            continue
        if amount < 0:
            frappe.throw("A split cannot be negative.")
        if not allowed.get(d):
            frappe.throw(d + " is not one of your departments.")
        doc.append("splits", {"department": d, "amount": amount})
        total = total + amount
        if d not in touched:
            touched.append(d)
    doc.split_total = total
    doc.split_by = me
    doc.split_at = now
    doc.status = status_of(float(doc.amount or 0), total)
    if doc.status == "Split" and doc.get("reopened"):
        doc.reopened = 0
    doc.save(ignore_permissions=True)
    doc.add_comment("Comment", "Split " + money(total) + " of " + money(doc.amount) + " across " +
                    str(len(doc.splits)) + " department(s)" + (" -- by IT on their behalf" if on_behalf else ""))
    for d in touched:
        sync_budget(d)
    frappe.response["message"] = {"ok": True, "split_total": total, "status": doc.status}
