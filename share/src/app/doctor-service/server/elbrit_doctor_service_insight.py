# =====================================================================
# SERVER SCRIPT — the source of truth for the ERP's copy. Keep in step.
#
#   Name        : Elbrit Doctor Service Insight
#   Script Type : API
#   API Method  : elbrit_doctor_service_insight
#   Allow Guest : NO
#
#   GET /api/method/elbrit_doctor_service_insight?doctor=DR-1
#   GET ...&exclude=<Doctor Service name>   leave that service out of the
#                                           history (the one being decided)
#
# "Is this doctor worth it?" for one doctor — the block on the approval
# detail, the Add service form and the doctor page's Services card:
#
#   months    the last MONTHS months up to last month, oldest first:
#             { month: "YYYY-MM", support, by_dept: { department: amount } }
#             — support = Doctor Support's monthly custom_total_amount (what
#             the doctor gave back, every department); by_dept = the same
#             month split by its Support Items lines' department
#   services  every Doctor Service for the doctor, newest first:
#             { name, date, service, amount, department, role_profile,
#               by_name, status, via_app } — department is the ROLE
#             PROFILE's (Role Profile.custom_department): the imported rows'
#             own department field is wrong (Elbrit seats filed as CND). An
#             SM seat covers several departments and has none of its own,
#             so it keeps the row's (the app's guard sets it from the
#             doctor's pair). Rows on different seats are SEPARATE services,
#             even on the same date for the same amount. Status for an app row: "Approved" once finally
#             approved (verified or not), "Rejected", else the tracker's
#             state; "Paid" for an imported one
#   visits    BE / ABM / RBM / SM: the last 3 visits MADE (Event Completed,
#             or an employee participant attending / time-stamped — the
#             doctor page's rule), in the window: { role, name, dates }
#
# The client works out totals and ROI = support / service from these, for
# ONE department (the service's) -- by_dept and the services' department --
# or for the whole doctor.
#
# WHO: the viewing roles (VIEW_ROLES); read past permissions — visits are
# Private events, readable by their participants only.
#
# safe_exec: no import, no .format(), no set literals, no tuple
# unpacking, no underscore-prefixed names.
# =====================================================================

MONTHS = 18
ROLES = ["BE", "ABM", "RBM", "SM"]
ENTRY_ROLES = ["MIS", "User MIS", "MIS Admin", "Manager MIS", "CRM Manager", "IT"]
VIEW_ROLES = ["IT", "MIS", "User MIS", "MIS Admin", "Manager MIS", "CRM Manager", "GM", "CEO"]


def viewer_of(user):
    # COPIED from elbrit_doctor_service_options — change all three together.
    roles = frappe.get_all("Has Role", filters={"parent": user, "parenttype": "User"}, pluck="role")
    admin = user == "Administrator" or "System Manager" in roles
    profile = frappe.db.get_value("User", user, "role_profile_name") or ""
    can_enter = admin
    for r in ENTRY_ROLES:
        if r in roles:
            can_enter = True
    can_view = admin or can_enter or profile[:2].upper() == "IT"
    for r in VIEW_ROLES:
        if r in roles:
            can_view = True
    return can_view


def grade_of(seat):
    head = (seat or "").split("-")[0]
    out = ""
    for ch in head:
        if not ch.isdigit():
            out = out + ch
    return out.strip().upper()


# An app row's state is its tracker's ("Approval flow"). Once the final
# approval is given the service counts as given ("Approved"), verified or not.
def app_status(state):
    st = str(state or "")
    if st.endswith("Approved and Verified") or st.endswith("Approved and Waiting for Verification"):
        return "Approved"
    if st.endswith("Rejected"):
        return "Rejected"
    if st == "Rework":
        return "Sent back"
    if st.endswith(" Approval Waiting"):
        return "In approval"
    return st or "Not submitted"


def ym(y, m):
    return str(y) + "-" + ("0" if m < 10 else "") + str(m)


if not viewer_of(frappe.session.user):
    frappe.throw("Doctor services are open to IT, the MIS team, GM and CEO only.")

doctor = str(frappe.form_dict.get("doctor") or "").strip()
exclude = str(frappe.form_dict.get("exclude") or "").strip()
if not doctor:
    frappe.throw("Send the doctor (doctor=DR-...).")
lead = frappe.db.get_value("Lead", doctor, ["name", "lead_name"], as_dict=True)
if not lead:
    frappe.throw("No such doctor: " + doctor)

# ---- the window: MONTHS months ending last month
today = frappe.utils.nowdate()
y = int(today[:4])
m = int(today[5:7]) - 1
if m < 1:
    m = 12
    y = y - 1
keys = []
i = 0
while i < MONTHS:
    keys.insert(0, ym(y, m))
    m = m - 1
    if m < 1:
        m = 12
        y = y - 1
    i = i + 1
start = keys[0] + "-01"
end = str(frappe.utils.get_last_day(keys[-1] + "-01"))

# ---- support: the month's total, and the same split by department from its
# Support Items lines (custom_department on production, department on UAT)
SI = "Support Items"
si_meta = frappe.get_meta(SI)
si_dept = "custom_department" if si_meta.has_field("custom_department") else ("department" if si_meta.has_field("department") else "")
support = {}
by_dept = {}
month_of = {}
for s in frappe.get_all("Doctor Support",
                        filters=[["doctor", "=", doctor], ["date", ">=", start], ["date", "<=", end]],
                        fields=["name", "date", "custom_total_amount"], limit_page_length=0):
    k = str(s.get("date"))[:7]
    support[k] = (support.get(k) or 0) + float(s.get("custom_total_amount") or 0)
    month_of[s.get("name")] = k
if si_dept and month_of:
    for it in frappe.get_all(SI, filters=[["parenttype", "=", "Doctor Support"], ["parent", "in", list(month_of.keys())]],
                             fields=["parent", si_dept + " as dept", "amount"], limit_page_length=0):
        k = month_of.get(it.get("parent"))
        if not k:
            continue
        if k not in by_dept:
            by_dept[k] = {}
        d = it.get("dept") or ""
        by_dept[k][d] = (by_dept[k].get(d) or 0) + float(it.get("amount") or 0)
months = []
for k in keys:
    split = {}
    for d in (by_dept.get(k) or {}):
        split[d] = round(by_dept[k][d], 2)
    months.append({"month": k, "support": round(support.get(k) or 0, 2), "by_dept": split})

# ---- services
meta = frappe.get_meta("Doctor Service")
fields = ["name", "service_name", "service_amount", "service_date", "date", "department", "role_profile", "by",
          "workflow_state"]
for extra in ["custom_via_app", "custom_tracker"]:
    if meta.has_field(extra):
        fields.append(extra)
rows = frappe.get_all("Doctor Service", filters={"doctor": doctor}, fields=fields,
                      order_by="service_date desc", limit_page_length=0)
# An app row's state is its tracker's: read it there (the service's own
# workflow_state only follows once the tracker takes its first step).
tracker_ids = []
for r in rows:
    if r.get("custom_via_app") and r.get("custom_tracker"):
        tracker_ids.append(r.get("custom_tracker"))
tracker_state = {}
if tracker_ids:
    for t in frappe.get_all("Operational Tracker", filters=[["name", "in", tracker_ids]],
                            fields=["name", "workflow_state"], limit_page_length=0):
        tracker_state[t.get("name")] = t.get("workflow_state")
# A service's department is its role profile's (see the header).
rp_ids = []
for r in rows:
    if r.get("role_profile") and r.get("role_profile") not in rp_ids:
        rp_ids.append(r.get("role_profile"))
rp_dept = {}
if rp_ids:
    for p in frappe.get_all("Role Profile", filters=[["name", "in", rp_ids]], fields=["name", "custom_department"],
                            limit_page_length=0):
        rp_dept[p.get("name")] = p.get("custom_department") or ""
by_ids = []
for r in rows:
    if r.get("by") and r.get("by") not in by_ids:
        by_ids.append(r.get("by"))
names = {}
if by_ids:
    for e in frappe.get_all("Employee", filters=[["name", "in", by_ids]], fields=["name", "employee_name"],
                            limit_page_length=0):
        names[e.get("name")] = e.get("employee_name")
services = []
for r in rows:
    if r.get("name") == exclude:
        continue
    via = bool(r.get("custom_via_app"))
    services.append({"name": r.get("name"), "date": str(r.get("service_date") or r.get("date") or ""),
                     "service": r.get("service_name"), "amount": float(r.get("service_amount") or 0),
                     "department": rp_dept.get(r.get("role_profile")) or r.get("department") or "",
                     "role_profile": r.get("role_profile") or "", "by_name": names.get(r.get("by")) or r.get("by"),
                     "status": app_status(tracker_state.get(r.get("custom_tracker")) or r.get("workflow_state")) if via else "Paid",
                     "via_app": via})

# ---- visits made, by role
events = frappe.get_all("Event", filters=[["custom_doctor", "=", doctor], ["starts_on", ">=", start]],
                        fields=["name", "starts_on", "status", "custom_role_profile", "custom_employee_id"],
                        order_by="starts_on desc", limit_page_length=0)
ev_names = []
for e in events:
    ev_names.append(e.get("name"))
parts = {}
if ev_names:
    for p in frappe.get_all("Event Participants",
                            filters=[["parent", "in", ev_names], ["parenttype", "=", "Event"]],
                            fields=["parent", "reference_doctype", "reference_docname", "attending",
                                    "custom_visit_time", "custom_role_profile"],
                            limit_page_length=0):
        if p.get("parent") not in parts:
            parts[p.get("parent")] = []
        parts[p.get("parent")].append(p)

made = {}
emp_ids = []
for e in events:
    plist = parts.get(e.get("name")) or []
    done = str(e.get("status") or "").lower() == "completed"
    seen = False
    for p in plist:
        if p.get("reference_doctype") != "Employee":
            continue
        att = str(p.get("attending") or "").lower()
        if not (done or att == "yes" or att == "1" or p.get("custom_visit_time")):
            continue
        g = grade_of(p.get("custom_role_profile") or e.get("custom_role_profile"))
        if g not in ROLES:
            continue
        seen = True
        if g not in made:
            made[g] = []
        made[g].append({"emp": p.get("reference_docname"),
                        "date": str(p.get("custom_visit_time") or e.get("starts_on"))[:10]})
        if p.get("reference_docname") not in emp_ids:
            emp_ids.append(p.get("reference_docname"))
    if not seen and done and e.get("custom_employee_id"):
        g = grade_of(e.get("custom_role_profile"))
        if g in ROLES:
            if g not in made:
                made[g] = []
            made[g].append({"emp": e.get("custom_employee_id"), "date": str(e.get("starts_on"))[:10]})
            if e.get("custom_employee_id") not in emp_ids:
                emp_ids.append(e.get("custom_employee_id"))
who = {}
if emp_ids:
    for e in frappe.get_all("Employee", filters=[["name", "in", emp_ids]], fields=["name", "employee_name"],
                            limit_page_length=0):
        who[e.get("name")] = e.get("employee_name")
# `made` is newest first already: the events were read starts_on desc.
visits = []
for g in ROLES:
    lst = made.get(g) or []
    dates = []
    for v in lst:
        if v["date"] not in dates and len(dates) < 3:
            dates.append(v["date"])
    visits.append({"role": g, "name": (who.get(lst[0]["emp"]) or lst[0]["emp"]) if lst else "",
                   "dates": dates})

frappe.response["message"] = {"doctor": {"id": lead.get("name"), "name": lead.get("lead_name") or lead.get("name")},
                              "months": months, "services": services, "visits": visits}
