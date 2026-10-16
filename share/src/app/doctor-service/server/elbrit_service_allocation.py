# =====================================================================
# SERVER SCRIPT — the source of truth for the ERP's copy. Keep in step.
#
#   Name        : Elbrit Service Allocation
#   Script Type : API
#   API Method  : elbrit_service_allocation
#   Allow Guest : NO
#
#   GET /api/method/elbrit_service_allocation?month=2026-10
#
# The service budget for one month: what the GM allocated to each SM / ZSM,
# and how each split it across their departments. READ-ONLY; saving is
# elbrit_service_allocation_save.
#
#   viewer    { user, employee, employee_name, seat, can_allocate, is_sm }
#             can_allocate  GM / CEO / IT (role or IT role profile), or
#                           Administrator: sees everyone and allocates
#             is_sm         holds an SM- seat (ZSMs too): sees their own
#             is_it         IT (role or IT role profile): the app lets them
#                           switch to any SM's split view (built from
#                           `people`) and split on that SM's behalf
#   month     "YYYY-MM" (default: this month)
#   cutoff_day, editable   both GM and SM may change a month until its
#             cutoff_day (the 20th); later it is locked. A past month is
#             locked; a coming one is open.
#   months    the current financial year's months, for the picker
#   people    (can_allocate) every SM / ZSM: [ person ]
#   mine      (is_sm) the caller's own person, or null
#
#   person    { employee, name, seat, designation,
#               allocation: { name, amount, split_total, status,
#                             allocated_by, allocated_at, split_by, split_at }
#                           or null (nothing allocated yet),
#               departments: [ { department, amount, budget } ] }
#             departments = the departments of the seats under them in the
#             reporting tree (Role Profile.custom_department); amount = their
#             split for it; budget = the Department Service Budget row for the
#             month (every SM's split for that department, summed)
#
# safe_exec: no import, no .format(), no set literals, no tuple
# unpacking, no underscore-prefixed names.
# =====================================================================

CUTOFF_DAY = 20
PARENT = "Service Allocation"
CHILD = "Service Allocation Split"
BUDGET = "Department Service Budget"
MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def is_vacant(eid, name):
    n = (name or "").strip().lower()
    return (eid or "")[:1].upper() == "V" and (eid or "")[1:2].isdigit() or n[:6] == "vacant"


def user_names(users):
    out = {}
    if users:
        for e in frappe.get_all("Employee", filters=[["user_id", "in", users]], fields=["user_id", "employee_name"],
                                limit_page_length=0):
            out[e.get("user_id")] = e.get("employee_name")
        for u in frappe.get_all("User", filters=[["name", "in", users]], fields=["name", "full_name"],
                                limit_page_length=0):
            if u.get("name") not in out:
                out[u.get("name")] = u.get("full_name") or u.get("name")
    return out


me = frappe.session.user
roles = frappe.get_all("Has Role", filters={"parent": me, "parenttype": "User"}, pluck="role")
# IT has full access too: the IT role, or the IT role profile.
it_profile = (frappe.db.get_value("User", me, "role_profile_name") or "") == "IT"
can_allocate = me == "Administrator" or "GM" in roles or "CEO" in roles or "IT" in roles or it_profile
emp = frappe.get_all("Employee", filters={"user_id": me, "status": "Active"},
                     fields=["name", "employee_name", "custom_role_profile"], limit=1)
emp = emp[0] if emp else {}
seat = emp.get("custom_role_profile") or ""
is_sm = seat[:3].upper() == "SM-" and not is_vacant(emp.get("name"), emp.get("employee_name"))
if not (can_allocate or is_sm):
    frappe.throw("Service allocation is for the GM, the CEO, IT and Sales Managers only.")

today = frappe.utils.nowdate()
month = str(frappe.form_dict.get("month") or today[:7]).strip()[:7]
if len(month) != 7 or month[4] != "-" or not (month[:4].isdigit() and month[5:].isdigit()):
    frappe.throw("month must be YYYY-MM")
month_first = month + "-01"
cutoff = month + "-" + ("0" if CUTOFF_DAY < 10 else "") + str(CUTOFF_DAY)
editable = today <= cutoff

# the current financial year (April - March)
y = int(today[:4])
m = int(today[5:7])
fy = y if m >= 4 else y - 1
months = []
i = 0
while i < 12:
    mm = 4 + i
    yy = fy
    if mm > 12:
        mm = mm - 12
        yy = yy + 1
    k = str(yy) + "-" + ("0" if mm < 10 else "") + str(mm)
    months.append({"key": k, "label": MON[mm - 1] + " " + str(yy)})
    i = i + 1

# ---- the org: seats, departments and who reports to whom
staff = frappe.get_all("Employee", filters={"status": "Active"},
                       fields=["name", "employee_name", "reports_to", "custom_role_profile", "designation"],
                       limit_page_length=0)
kids = {}
for e in staff:
    r = e.get("reports_to")
    if r:
        if r not in kids:
            kids[r] = []
        kids[r].append(e)
seat_dept = {}
for p in frappe.get_all("Role Profile", filters=[["custom_department", "is", "set"]],
                        fields=["name", "custom_department"], limit_page_length=0):
    seat_dept[p.get("name")] = p.get("custom_department")


def departments_of(eid):
    out = []
    seen = {}
    frontier = [eid]
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
                if d and d not in out:
                    out.append(d)
        frontier = nxt
    out.sort()
    return out


sms = []
for e in staff:
    s = e.get("custom_role_profile") or ""
    if s[:3].upper() == "SM-" and not is_vacant(e.get("name"), e.get("employee_name")):
        sms.append(e)
sms = sorted(sms, key=lambda e: (e.get("employee_name") or ""))

# ---- this month's allocations and their splits
allocs = {}
names = []
users = []
for a in frappe.get_all(PARENT, filters={"month_key": month},
                        fields=["name", "employee", "amount", "split_total", "status", "allocated_by",
                                "allocated_at", "split_by", "split_at"], limit_page_length=0):
    allocs[a.get("employee")] = a
    names.append(a.get("name"))
    for u in [a.get("allocated_by"), a.get("split_by")]:
        if u and u not in users:
            users.append(u)
split_of = {}
if names:
    for s in frappe.get_all(CHILD, filters=[["parenttype", "=", PARENT], ["parent", "in", names]],
                            fields=["parent", "department", "amount"], limit_page_length=0):
        split_of[s.get("parent") + "|" + s.get("department")] = float(s.get("amount") or 0)
budget = {}
for b in frappe.get_all(BUDGET, filters={"parenttype": "Department", "month": month_first},
                        fields=["parent", "amount"], limit_page_length=0):
    budget[b.get("parent")] = float(b.get("amount") or 0)
who = user_names(users)


def person(e):
    a = allocs.get(e.get("name"))
    depts = []
    for d in departments_of(e.get("name")):
        depts.append({"department": d,
                      "amount": split_of.get((a.get("name") if a else "") + "|" + d) or 0,
                      "budget": budget.get(d) or 0})
    alloc = None
    if a:
        alloc = {"name": a.get("name"), "amount": float(a.get("amount") or 0),
                 "split_total": float(a.get("split_total") or 0), "status": a.get("status") or "Not split",
                 "allocated_by": who.get(a.get("allocated_by")) or a.get("allocated_by"),
                 "allocated_at": str(a.get("allocated_at") or ""),
                 "split_by": who.get(a.get("split_by")) or a.get("split_by"),
                 "split_at": str(a.get("split_at") or "")}
    return {"employee": e.get("name"), "name": e.get("employee_name"), "seat": e.get("custom_role_profile"),
            "designation": e.get("designation") or "", "allocation": alloc, "departments": depts}


people = []
if can_allocate:
    for e in sms:
        people.append(person(e))
mine = None
if is_sm:
    for e in sms:
        if e.get("name") == emp.get("name"):
            mine = person(e)

frappe.response["message"] = {
    "viewer": {"user": me, "employee": emp.get("name"), "employee_name": emp.get("employee_name") or me,
               "seat": seat, "can_allocate": can_allocate, "is_sm": is_sm,
               "is_it": me == "Administrator" or "IT" in roles or it_profile},
    "month": month, "cutoff_day": CUTOFF_DAY, "editable": editable, "months": months,
    "people": people, "mine": mine,
}
