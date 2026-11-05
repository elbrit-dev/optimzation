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
# viewer      { user, employee, employee_name, can_enter, can_view, approver, verifier,
#               entry, grade, seat }
#             can_enter  MIS / User MIS / MIS Admin / Manager MIS / CRM Manager / IT
#                        -- entry "mis", no limits -- OR (5 Nov 2026) a sales
#                        seat holder: ABM, RBM (SRBM, Deputy RBM) or SM (ZSM)
#                        -- entry "sales", grade "ABM" / "RBM" / "SM": they
#                        enter for THEMSELVES only, and only for a doctor whose
#                        latest ROI clears their grade's bar (see ROI GATE).
#                        Only when the call says v=2 (the new app code): the
#                        older app does not, so sales users get no button there.
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
#   previous    (every entry role) the doctor's latest GIVEN service --
#               { name, service, date, amount } or null; `exclude=<name>`
#               leaves out the one being edited. increase_limit (10,000):
#               a new amount more than that above `previous` needs a
#               "Reason for the increase" (custom_increase_reason), which
#               the guard requires on save. previous_service() is COPIED
#               into doctor_service_guard.py -- change both.
#   gate        (sales viewer) the ROI GATE for this doctor:
#               { allowed, grade, need, needed_grade, roi, department,
#                 latest: { service, date, amount } or null,
#                 support_since, months, from, to, linked }
#               employees is then just the viewer, with the doctor's pairs
#               that reach them (none: not linked -> not allowed).
#
# ROI GATE (5 Nov 2026). A doctor's LATEST ROI = the doctor page's "Latest
# ROI": the support from the month of their latest service up to today,
# divided by every service from that date on (an app service counts unless
# rejected or never submitted). Counted in the viewer's seat department (an SM
# seat has none: the whole doctor), from FROM_MONTH on. Who may enter:
#   ROI >= 4    ABM and above        ROI >= 3.5  RBM and above
#   ROI >= 3    SM / ZSM only        (no amount limit in these three)
#   below 3     SM / ZSM only, at most LOW_CAP (5,000) a service
#   NEW doctor (no given service since FROM_MONTH): ABM, RBM and SM, each
#               up to NEW_CAP -- ABM 20,000, RBM 35,000, SM 50,000; over it,
#               ask ESCALATE (ABM -> RBM, RBM -> SM, SM -> MIS)
# gate.cap is the viewer's amount limit (null: none); gate.mode new/low/roi.
# MIS has no gate. roi_gate() is COPIED into doctor_service_guard.py, which
# enforces it on save -- change both.
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
# ---- ROI GATE (see the header). The bar per grade, highest first.
FROM_MONTH = "2024-04"
GATE = [["ABM", 4.0], ["RBM", 3.5], ["SM", 3.0]]
# Seat grade -> rank (higher = more senior); SRBM / Deputy RBM sit with RBM,
# a ZSM holds an "SM-" seat.
SALES_RANK = {"ABM": 1, "RBM": 2, "SRBM": 2, "DEPUTY RBM": 2, "SM": 3}
GATE_GRADE = {"ABM": "ABM", "RBM": "RBM", "SRBM": "RBM", "DEPUTY RBM": "RBM", "SM": "SM"}
# ROI below the lowest bar: SM / ZSM only, at most LOW_CAP a service.
LOW_GRADE = "SM"
LOW_CAP = 5000
# A NEW doctor (no given service yet): every sales grade, up to its own cap;
# over it, ESCALATE says whom to ask.
NEW_CAP = {"ABM": 20000, "RBM": 35000, "SM": 50000}
ESCALATE = {"ABM": "RBM", "RBM": "SM", "SM": "MIS"}
# A new service more than this above the doctor's previous one needs a reason.
INCREASE_LIMIT = 10000


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


def linked_managers(doctor, grades=None):
    # -> [{ employee, employee_name, seat, grade, pairs: [{department, hq}] }]
    # grades: the seat grades to collect (default ON_BEHALF_GRADES).
    want = grades or ON_BEHALF_GRADES
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
                if g in want and e.get("status") == "Active" and not is_vacant_name(e.get("employee_name")):
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




def roi_gate(doctor, dept, grade):
    # COPIED into doctor_service_guard.py -- change both. `grade`: the
    # viewer's seat grade (a SALES_RANK key). -> the gate (see the header).
    # The same "Latest ROI" as the doctor page (12 Nov 2026 -- it differed:
    # 777x here against 3.89x there for DR-1): every service counts except
    # an app one rejected or never submitted; support runs to TODAY; and the
    # divisor is every service from the latest one's date on.
    today = frappe.utils.nowdate()
    last_key = today[:7]
    start = FROM_MONTH + "-01"
    end = today
    # the latest service in the department, inside the window
    meta = frappe.get_meta("Doctor Service")
    fields = ["name", "service_name", "service_amount", "service_date", "date", "department", "role_profile"]
    for extra in ["custom_via_app", "custom_tracker"]:
        if meta.has_field(extra):
            fields.append(extra)
    rows = frappe.get_all("Doctor Service", filters={"doctor": doctor}, fields=fields, limit_page_length=0)
    trackers = []
    seats = []
    for r in rows:
        if r.get("custom_via_app") and r.get("custom_tracker"):
            trackers.append(r.get("custom_tracker"))
        if r.get("role_profile") and r.get("role_profile") not in seats:
            seats.append(r.get("role_profile"))
    state = {}
    if trackers:
        for t in frappe.get_all("Operational Tracker", filters=[["name", "in", trackers]],
                                fields=["name", "workflow_state"], limit_page_length=0):
            state[t.get("name")] = str(t.get("workflow_state") or "")
    rp_dept = {}
    if seats:
        for p in frappe.get_all("Role Profile", filters=[["name", "in", seats]], fields=["name", "custom_department"],
                                limit_page_length=0):
            rp_dept[p.get("name")] = p.get("custom_department") or ""
    latest = None
    counted = []
    for r in rows:
        d = str(r.get("service_date") or r.get("date") or "")[:10]
        if not d or d < start or d > end:
            continue
        if r.get("custom_via_app"):
            st = state.get(r.get("custom_tracker")) or ""
            if not st or st.endswith("Rejected"):
                continue
        if dept and (rp_dept.get(r.get("role_profile")) or r.get("department") or "") != dept:
            continue
        if float(r.get("service_amount") or 0) <= 0:
            continue
        counted.append([d, float(r.get("service_amount") or 0)])
        if latest is None or d > latest["date"]:
            latest = {"service": r.get("service_name"), "date": d, "amount": float(r.get("service_amount") or 0)}
    # the divisor: every service from the latest one's date on (same date and
    # amount once, as the doctor page dedupes)
    spent = 0
    if latest:
        seen_sv = {}
        for c in counted:
            k = c[0] + "|" + str(c[1])
            if c[0] >= latest["date"] and not seen_sv.get(k):
                seen_sv[k] = 1
                spent = spent + c[1]
    # the support since that service's month, this month's included (a
    # support record is dated at its month's end)
    since = 0
    months = 0
    if latest:
        from_day = latest["date"][:7] + "-01"
        months = (int(last_key[:4]) - int(from_day[:4])) * 12 + int(last_key[5:7]) - int(from_day[5:7]) + 1
        si = "Support Items"
        si_meta = frappe.get_meta(si)
        si_dept = "custom_department" if si_meta.has_field("custom_department") else (
            "department" if si_meta.has_field("department") else "")
        si_seat = "custom_role_profile" if si_meta.has_field("custom_role_profile") else (
            "role_profile" if si_meta.has_field("role_profile") else "")
        heads = {}
        for s in frappe.get_all("Doctor Support",
                                filters=[["doctor", "=", doctor], ["date", ">=", from_day],
                                         ["date", "<=", str(frappe.utils.get_last_day(today))]],
                                fields=["name", "custom_total_amount"], limit_page_length=0):
            heads[s.get("name")] = float(s.get("custom_total_amount") or 0)
        if heads:
            lf = ["parent", "amount"]
            if si_dept:
                lf.append(si_dept + " as dept")
            if si_seat:
                lf.append(si_seat + " as seat")
            lines = frappe.get_all(si, filters=[["parenttype", "=", "Doctor Support"],
                                                ["parent", "in", list(heads.keys())]],
                                   fields=lf, limit_page_length=0)
            lseats = []
            for it in lines:
                if it.get("seat") and it.get("seat") not in rp_dept and it.get("seat") not in lseats:
                    lseats.append(it.get("seat"))
            if lseats:
                for p in frappe.get_all("Role Profile", filters=[["name", "in", lseats]],
                                        fields=["name", "custom_department"], limit_page_length=0):
                    rp_dept[p.get("name")] = p.get("custom_department") or ""
            with_lines = {}
            for it in lines:
                with_lines[it.get("parent")] = 1
                # the SEAT's department; the line's own only for a seat without one
                if dept and (rp_dept.get(it.get("seat")) or it.get("dept") or "") != dept:
                    continue
                since = since + float(it.get("amount") or 0)
            if not dept:
                # a record without lines counts by its own total
                for n in heads:
                    if not with_lines.get(n):
                        since = since + heads[n]
    roi = (since / spent) if latest and spent else None
    mine = GATE_GRADE.get(grade) or ""
    need = None
    for g in GATE:
        if g[0] == mine:
            need = g[1]
    # Three cases (5 Nov 2026):
    #   new  no given service yet -- every sales grade, up to NEW_CAP[grade]
    #   low  ROI below the lowest bar (3) -- SM / ZSM only, up to LOW_CAP
    #   roi  ROI >= 3 -- the grade bars (GATE), no amount limit
    cap = None
    if roi is None:
        mode = "new"
        needed = "ABM"
        cap = NEW_CAP.get(mine)
    else:
        needed = None
        for g in GATE:
            if needed is None and roi >= g[1]:
                needed = g[0]
        if needed:
            mode = "roi"
        else:
            mode = "low"
            needed = LOW_GRADE
            cap = LOW_CAP
    allowed = (SALES_RANK.get(grade) or 0) >= (SALES_RANK.get(needed) or 99)
    return {"allowed": allowed, "grade": mine, "need": need, "needed_grade": needed, "mode": mode,
            "cap": cap if allowed else None, "escalate": ESCALATE.get(mine) or "",
            "roi": round(roi, 2) if roi is not None else None, "department": dept or "",
            "latest": latest, "spent": round(spent, 2), "support_since": round(since, 2), "months": months,
            "from": FROM_MONTH, "to": last_key, "linked": True}


def previous_service(doctor, exclude):
    # The doctor's latest GIVEN service (imported = paid; an app one once
    # finally approved), any department, any date; `exclude` = the record
    # being edited. -> { name, service, date, amount } or None.
    meta = frappe.get_meta("Doctor Service")
    fields = ["name", "service_name", "service_amount", "service_date", "date"]
    for extra in ["custom_via_app", "custom_tracker"]:
        if meta.has_field(extra):
            fields.append(extra)
    rows = frappe.get_all("Doctor Service", filters={"doctor": doctor}, fields=fields, limit_page_length=0)
    trackers = []
    for r in rows:
        if r.get("custom_via_app") and r.get("custom_tracker"):
            trackers.append(r.get("custom_tracker"))
    state = {}
    if trackers:
        for t in frappe.get_all("Operational Tracker", filters=[["name", "in", trackers]],
                                fields=["name", "workflow_state"], limit_page_length=0):
            state[t.get("name")] = str(t.get("workflow_state") or "")
    best = None
    for r in rows:
        if exclude and r.get("name") == exclude:
            continue
        if r.get("custom_via_app"):
            st = state.get(r.get("custom_tracker")) or ""
            if not (st.endswith("Approved and Verified") or st.endswith("Approved and Waiting for Verification")):
                continue
        amt = float(r.get("service_amount") or 0)
        d = str(r.get("service_date") or r.get("date") or "")[:10]
        if amt <= 0 or not d:
            continue
        if best is None or d > best["date"]:
            best = {"name": r.get("name"), "service": r.get("service_name"), "date": d, "amount": amt}
    return best


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
    me = frappe.get_all("Employee", filters={"user_id": user, "status": "Active"},
                        fields=["name", "employee_name", "custom_role_profile"], limit=1)
    me = me[0] if me else {}
    # A sales seat holder (ABM / RBM / SM) enters for themselves, behind the
    # ROI gate; the MIS entry roles stay unrestricted.
    entry = "mis" if can_enter else None
    grade = grade_of(me.get("custom_role_profile"))
    # ...only for an app that asks for it (v=2): app-uat's code sends it, the
    # live app.elbrit.org (older code) does not, so it shows them no button.
    sales_on = str(frappe.form_dict.get("v") or "") == "2"
    if not can_enter and sales_on and grade in SALES_RANK and not is_vacant_name(me.get("employee_name")):
        can_enter = True
        entry = "sales"
    # Verify is the workflow's MIS step: the MIS role itself, not System Manager.
    verifier = user == "Administrator" or "MIS" in roles
    approvers = []
    for r in ["GM", "CEO"]:
        if r in roles:
            approvers.append(r)
    approver = approvers[-1] if approvers else None
    return {"user": user, "employee": me.get("name"),
            "employee_name": me.get("employee_name") or frappe.db.get_value("User", user, "full_name") or user,
            "can_enter": can_enter, "can_view": can_view, "approver": approver, "approvers": approvers,
            "verifier": verifier, "entry": entry, "grade": GATE_GRADE.get(grade) if entry == "sales" else None,
            "seat": me.get("custom_role_profile") or ""}


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
        if viewer["entry"] == "sales":
            # Only themselves, with the doctor's pairs that reach them.
            employees = []
            for m in linked_managers(doctor, list(SALES_RANK.keys())):
                if m["employee"] == viewer["employee"]:
                    employees.append(m)
            my_dept = ""
            if viewer["seat"]:
                my_dept = frappe.db.get_value("Role Profile", viewer["seat"], "custom_department") or ""
            gate = roi_gate(doctor, my_dept, grade_of(viewer["seat"]))
            if not employees:
                gate["allowed"] = False
                gate["linked"] = False
            answer["gate"] = gate
        else:
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
        answer["previous"] = previous_service(doctor, str(frappe.form_dict.get("exclude") or "").strip())
        answer["increase_limit"] = INCREASE_LIMIT
        answer["services"] = services

frappe.response["message"] = answer
