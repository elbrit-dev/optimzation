# =====================================================================
# SERVER SCRIPT — the source of truth for the ERP's copy. Keep in step.
#
#   Name        : Elbrit Doctor Service Options
#   Script Type : API
#   API Method  : elbrit_doctor_service_options
#   Allow Guest : NO
#
#   GET /api/method/elbrit_doctor_service_options             who is asking
#   GET /api/method/elbrit_doctor_service_options?doctor=DR-1 + the form's lists
#
# viewer      { user, employee, employee_name, can_enter, can_view, approver, verifier }
#             can_enter  MIS / User MIS / MIS Admin / Manager MIS / CRM Manager / IT
#             can_view   those, plus IT (role, or an "IT" role profile), GM, CEO
#             approver   "GM" / "CEO" by role (CEO when both), else null
#             approvers  every one of GM / CEO the user holds — a tester or
#                        admin with both acts at whichever step it is on
#             verifier   the MIS role: verifies after the final approval
#             The doctor page calls this once to know whether to show the
#             Add service button and the Services card.
#
# With `doctor`, for an entry role only, what the "Add service" form needs:
#
#   employees   the RBMs and SMs LINKED TO THIS DOCTOR — the people the MIS
#               team may enter a service ON BEHALF OF. Linked = the doctor's
#               Role Profile table (Lead.custom_role_profile) lists a seat,
#               and walking up reports_to from that seat's holder passes
#               through them (the seat itself counts when it is an RBM / SM
#               seat). A vacant seat with no holder climbs the Role Profile
#               tree to the first held seat and walks from there. "Vacant_"
#               placeholders are never offered. A ZSM ("SM-" seat,
#               designation "Zonal Sales Manager") counts as an SM.
#               Each comes with `pairs`: the doctor's (department, HQ) rows
#               that reach them — the form sets department and HQ from the
#               chosen pair, and the Before Save guard
#               (doctor_service_guard.py) re-checks it.
#   services    Doctor Service Master, with its category when the master has
#               the custom_category field (Cash / EMI / Bookings / Gift /
#               Utilities), and `capture`: the details it asks for, from
#               custom_capture_fields [{key, label, multi, required}] --
#               EB Bill: the EB service number, Recharge: the mobile...
#   last        { service: { key: [values] } } -- what this doctor's LATEST
#               such service captured: the form fills these in (MIS may
#               change, remove or add -- a replaced number does not come back)
#   known       { service: { key: [values, newest first] } } -- every value
#               this doctor's earlier services captured: "used before" chips
#   doctor      { id, name }
#
# linked_managers() is COPIED into doctor_service_guard.py — change both.
#
# safe_exec: no import, no .format(), no set literals, no tuple
# unpacking, no underscore-prefixed names.
# =====================================================================

ENTRY_ROLES = ["MIS", "User MIS", "MIS Admin", "Manager MIS", "CRM Manager", "IT"]
# Seat grades an entry may be made on behalf of. Seat "RBM3-CND-CBE" -> "RBM".
ON_BEHALF_GRADES = ["RBM", "SM"]
MAX_HOPS = 15


def is_vacant_name(n):
    return (n or "").strip()[:6].lower() == "vacant"


def grade_of(seat):
    head = (seat or "").split("-")[0]
    out = ""
    for ch in head:
        if not ch.isdigit():
            out = out + ch
    return out.strip().upper()


EMP_CACHE = {}


def emp(eid):
    if eid not in EMP_CACHE:
        EMP_CACHE[eid] = frappe.db.get_value("Employee", eid,
                                             ["name", "employee_name", "status", "reports_to",
                                              "custom_role_profile", "role_id", "designation"], as_dict=True)
    return EMP_CACHE[eid]


def linked_managers(doctor):
    # -> [{ employee, employee_name, seat, grade, pairs: [{department, hq}] }]
    rows = frappe.get_all("Role Profile Multiselect",
                          filters={"parenttype": "Lead", "parent": doctor, "parentfield": "custom_role_profile"},
                          fields=["role_profile_list", "department", "hq"],
                          order_by="idx asc", limit_page_length=0)
    found = {}
    order = []
    for r in rows:
        seat = r.get("role_profile_list")
        if not seat:
            continue
        pair = {"department": r.get("department") or "", "hq": r.get("hq") or ""}

        starts = frappe.get_all("Employee", filters={"custom_role_profile": seat, "status": "Active"},
                                pluck="name", limit=20)
        cur = seat
        hops = 0
        while not starts and cur and hops < MAX_HOPS:
            hops = hops + 1
            cur = frappe.db.get_value("Role Profile", cur, "parent_role_profile")
            if cur:
                starts = frappe.get_all("Employee", filters={"custom_role_profile": cur, "status": "Active"},
                                        pluck="name", limit=20)

        for start in starts:
            eid = start
            hops = 0
            while eid and hops < MAX_HOPS:
                hops = hops + 1
                e = emp(eid)
                if not e:
                    break
                own = e.get("custom_role_profile") or e.get("role_id") or ""
                g = grade_of(own)
                if g in ON_BEHALF_GRADES and e.get("status") == "Active" and not is_vacant_name(e.get("employee_name")):
                    if eid not in found:
                        found[eid] = {"employee": eid, "employee_name": e.get("employee_name"),
                                      "seat": own, "grade": g, "pairs": []}
                        order.append(eid)
                    have = False
                    for p in found[eid]["pairs"]:
                        if p["department"] == pair["department"] and p["hq"] == pair["hq"]:
                            have = True
                    if not have:
                        found[eid]["pairs"].append(pair)
                eid = e.get("reports_to")

    out = []
    for eid in order:
        out.append(found[eid])
    return out




# ---- SERVICE DETAILS: what a service asks for (Doctor Service Master
# .custom_capture_fields: [{key, label, multi, required}]) and what a service
# captured (Doctor Service.custom_service_details: [{key, label, values}]).
def as_list(raw):
    if not raw:
        return []
    if isinstance(raw, list):
        return raw
    try:
        v = json.loads(raw)
    except Exception:
        return []
    return v if isinstance(v, list) else []


def capture_of(raw):
    out = []
    for f in as_list(raw):
        if not isinstance(f, dict) or not str(f.get("key") or "").strip():
            continue
        out.append({"key": str(f.get("key")).strip(), "label": str(f.get("label") or f.get("key")).strip(),
                    "multi": 1 if f.get("multi") else 0, "required": 0 if f.get("required") == 0 else 1})
    return out


def details_of(raw):
    out = []
    for d in as_list(raw):
        if not isinstance(d, dict) or not d.get("key"):
            continue
        vals = []
        for v in (d.get("values") or []):
            v = str(v or "").strip()
            if v and v not in vals:
                vals.append(v)
        out.append({"key": str(d.get("key")), "label": str(d.get("label") or d.get("key")), "values": vals})
    return out


# ---- WHO IS ASKING — copied into elbrit_doctor_service_list and
# elbrit_doctor_service_insight; change all three together.
VIEW_ROLES = ["IT", "MIS", "User MIS", "MIS Admin", "Manager MIS", "CRM Manager", "GM", "CEO"]


def viewer_of(user):
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
    # Verify is the workflow's MIS step: the MIS role itself, not System Manager.
    verifier = user == "Administrator" or "MIS" in roles
    approvers = []
    for r in ["GM", "CEO"]:
        if r in roles:
            approvers.append(r)
    approver = approvers[-1] if approvers else None
    me = frappe.get_all("Employee", filters={"user_id": user, "status": "Active"},
                        fields=["name", "employee_name"], limit=1)
    me = me[0] if me else {}
    return {"user": user, "employee": me.get("name"),
            "employee_name": me.get("employee_name") or frappe.db.get_value("User", user, "full_name") or user,
            "can_enter": can_enter, "can_view": can_view, "approver": approver, "approvers": approvers,
            "verifier": verifier}


viewer = viewer_of(frappe.session.user)
answer = {"viewer": viewer}

doctor = str(frappe.form_dict.get("doctor") or "").strip()
if doctor:
    lead = frappe.db.get_value("Lead", doctor, ["name", "lead_name"], as_dict=True)
    if not lead:
        frappe.throw("No such doctor: " + doctor)
    answer["doctor"] = {"id": lead.get("name"), "name": lead.get("lead_name") or lead.get("name")}
    if viewer["can_enter"]:
        master_meta = frappe.get_meta("Doctor Service Master")
        svc_fields = ["name"]
        if master_meta.has_field("custom_category"):
            svc_fields.append("custom_category")
        if master_meta.has_field("custom_capture_fields"):
            svc_fields.append("custom_capture_fields")
        services = []
        for s in frappe.get_all("Doctor Service Master", fields=svc_fields, order_by="name asc", limit_page_length=0):
            services.append({"name": s.get("name"), "category": s.get("custom_category") or "",
                             "capture": capture_of(s.get("custom_capture_fields"))})
        # What this doctor's earlier services captured, per service and key,
        # newest first: the form fills them in (MIS may change or add).
        # `last` = the latest such service's values: what the form fills in, so
        # a number the doctor has since replaced does not come back. `known` =
        # every value used before, offered as one-tap "used before" chips.
        known = {}
        last = {}
        if frappe.get_meta("Doctor Service").has_field("custom_service_details"):
            for r in frappe.get_all("Doctor Service",
                                    filters=[["doctor", "=", doctor], ["custom_service_details", "is", "set"]],
                                    fields=["service_name", "custom_service_details"],
                                    order_by="creation desc", limit_page_length=0):
                svc = r.get("service_name") or ""
                first_seen = svc not in known
                if first_seen:
                    known[svc] = {}
                    last[svc] = {}
                for d in details_of(r.get("custom_service_details")):
                    if first_seen:
                        last[svc][d["key"]] = d["values"]
                    if d["key"] not in known[svc]:
                        known[svc][d["key"]] = []
                    for v in d["values"]:
                        if v not in known[svc][d["key"]]:
                            known[svc][d["key"]].append(v)
        answer["known"] = known
        answer["last"] = last
        employees = linked_managers(doctor)
        # Each person's seat department (Role Profile.custom_department): the
        # key the form's "worth it" figures are split by, as the approval's.
        # An SM seat has none -- the chosen pair's department stands.
        seats = []
        for e in employees:
            if e.get("seat") and e.get("seat") not in seats:
                seats.append(e.get("seat"))
        seat_dept = {}
        if seats:
            for p in frappe.get_all("Role Profile", filters=[["name", "in", seats]], fields=["name", "custom_department"],
                                    limit_page_length=0):
                seat_dept[p.get("name")] = p.get("custom_department") or ""
        for e in employees:
            e["seat_department"] = seat_dept.get(e.get("seat")) or ""
        answer["employees"] = employees
        answer["services"] = services

frappe.response["message"] = answer
