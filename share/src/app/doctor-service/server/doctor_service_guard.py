# =====================================================================
# SERVER SCRIPT — the source of truth for the ERP's copy. Keep in step.
#
#   Name          : Doctor Service Guard
#   Script Type   : DocType Event
#   Reference     : Doctor Service
#   Event         : Before Save
#
# Guards the Doctor Services the app raises (custom_via_app = 1). Rows
# without the flag — the ~26.7k imported ones, and any future bulk load —
# are left exactly as they are.
#
# APPROVAL runs on an Operational Tracker ("Approval flow", Approval Settings
# "Doctor Service": final approver CEO, MIS verifies), not on this doctype.
# SAVING SUBMITS: this script makes the tracker and starts it at GM.
#
#   MIS saves -> GM Approval Waiting -> (GM Approve) CEO Approval Waiting
#             -> CEO approves -> CEO Approved and Waiting for Verification
#             -> (MIS) Approved and Verified
#   GM "Approve to Verification" = approve as final (CEO not needed).
#   GM / CEO "Revisit" -> Rework: MIS edits, and that save resubmits.
#   GM / CEO "Reject" -> <Role> Rejected: final.
#
# The team's "Doctor service tracker" (also Before Save) makes trackers for
# the desk's own entries, and only for a `date` next month or later; the
# app's rows carry today's date, so it never fires for them. From then on
# the team's "operational tracker" script mirrors the tracker's state into
# this record's workflow_state.
#
# WHAT THIS SCRIPT DOES:
#   1. CONTENT LOCK — doctor, service, date, amount, on-behalf employee,
#      department, HQ and remarks change only on a new service or while its
#      tracker is in Rework (sent back), and only by the entry roles
#      (ENTRY_ROLES) or System Manager. The attachment may also be added
#      while it waits on GM (the app uploads it right after the save).
#   2. ON BEHALF OF — `by` must be an RBM / SM linked to the doctor (the
#      same rule as elbrit_doctor_service_options: linked_managers() is
#      COPIED from there — change both). Department, HQ and role_profile
#      are SET HERE from that employee's pair for this doctor, so the app
#      cannot file a service under the wrong department.
#   3. CHECKS — amount above 0 (2 places), service date not in the future,
#      service in Doctor Service Master, doctor exists. Attachment optional.
#   2b. SALES ENTRY (5 Nov 2026) — an ABM / RBM / SM seat holder (no MIS
#      role) may enter a service for THEMSELVES only (`by` = their own
#      employee, linked to the doctor), and only when the doctor's latest
#      ROI clears their grade's bar: >= 4 ABM, >= 3.5 RBM, >= 3 SM; below 3
#      SM / ZSM only, up to 5,000; a NEW doctor (no given service): ABM up to
#      20,000, RBM 35,000, SM 50,000. roi_gate() is COPIED from elbrit_doctor_service_options.py
#      (see the ROI GATE there) -- change both. MIS has no gate.
#   3b. INCREASE REASON (5 Nov 2026) -- a service more than INCREASE_LIMIT
#      (10,000) above the doctor's previous given service needs
#      custom_increase_reason (when the field exists); at or under the limit
#      the field is cleared. previous_service() is COPIED from
#      elbrit_doctor_service_options.py -- change both.
#   4. custom_entered_by — the MIS employee who raised it (if the field
#      exists).
#   5. INTO APPROVAL — on an entry role's save of a new service (or one
#      without a tracker), or of one sent back (Rework): the tracker is made
#      (or reset) at the FIRST STEP OF THE CHAIN (11 Nov 2026): the first
#      live manager above the employee it is for (`by`), up reports_to --
#      an RBM seat -> RBM Approval Waiting, an SM seat (ZSM too) -> SM
#      Approval Waiting, a GM-role user -> GM Approval Waiting. So an ABM's
#      service starts with their RBM, an RBM's with their SM, an SM's with
#      the GM; a vacant level is skipped. MIS entries too. From there the
#      "operational tracker" script walks it up (RBM -> SM -> GM).
#      custom_fallback_approver = the manager above that first approver. A new
#      tracker is inserted and then set to its step, as the team's own
#      script does (the workflow starts every new one at ABM, and has no
#      step out of Rework). A send-back reason is kept as a comment.
#
# safe_exec: no import, no .format(), no set literals, no tuple
# unpacking, no underscore-prefixed names.
# WHY IT IS ALL ONE FUNCTION: a DocType Event script runs with `doc` and
# its own top-level names in a separate locals scope, so a top-level helper
# cannot see `doc`, the constants or the other helpers (NameError on save).
# Nested inside guard(), they are closures over its scope and can.
# =====================================================================

def guard(doc):
    APP_FLAG = "custom_via_app"
    ENTRY_ROLES = ["MIS", "User MIS", "MIS Admin", "Manager MIS", "CRM Manager", "IT"]
    ON_BEHALF_GRADES = ["RBM", "SM"]
    MAX_HOPS = 15
    # ROI GATE -- COPIED from elbrit_doctor_service_options.py, change both.
    FROM_MONTH = "2024-04"
    GATE = [["ABM", 4.0], ["RBM", 3.5], ["SM", 3.0]]
    SALES_RANK = {"ABM": 1, "RBM": 2, "SRBM": 2, "DEPUTY RBM": 2, "SM": 3}
    GATE_GRADE = {"ABM": "ABM", "RBM": "RBM", "SRBM": "RBM", "DEPUTY RBM": "RBM", "SM": "SM"}
    # ROI below the lowest bar: SM / ZSM only, at most LOW_CAP a service.
    LOW_GRADE = "SM"
    LOW_CAP = 5000
    # A NEW doctor (no given service yet): every sales grade, up to its own cap;
    # over it, ESCALATE says whom to ask.
    NEW_CAP = {"ABM": 20000, "RBM": 35000, "SM": 50000}
    ESCALATE = {"ABM": "RBM", "RBM": "SM", "SM": "MIS"}
    INCREASE_LIMIT = 10000
    OT = "Operational Tracker"
    SETTING = "Doctor Service"
    START = "GM Approval Waiting"
    REWORK = "Rework"
    CONTENT = ["doctor", "service_name", "service_date", "service_amount", "by",
               "department", "hq", "remarks", "service_attachement", "custom_service_details",
               "custom_increase_reason"]
    LATE_OK = ["service_attachement"]


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
        # COPIED from elbrit_doctor_service_options.py — change both.
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
        # COPIED from elbrit_doctor_service_options.py -- change both. `grade`: the
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
        # COPIED from elbrit_doctor_service_options.py -- change both.
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


    def has_role(u, role):
        return bool(frappe.db.exists("Has Role", {"parent": u, "parenttype": "User", "role": role}))


    def live_employee(eid):
        e = frappe.db.get_value("Employee", eid, ["name", "employee_name", "status", "user_id", "reports_to"],
                                as_dict=True)
        if e and e.get("status") == "Active" and e.get("user_id") and not is_vacant_name(e.get("employee_name")):
            return e
        return None


    def chain_start(by):
        # -> [state, role, approver_user, fallback_user]: the chain's first
        # step for `by` (see 5 in the header); [None, ...] when none is found.
        eid = frappe.db.get_value("Employee", by, "reports_to")
        hops = 0
        while eid and hops < MAX_HOPS:
            hops = hops + 1
            e = live_employee(eid)
            if e:
                role = None
                if has_role(e.get("user_id"), "GM"):
                    role = "GM"
                else:
                    g = GATE_GRADE.get(grade_of(frappe.db.get_value("Employee", eid, "custom_role_profile")))
                    if g == "RBM" or g == "SM":
                        role = g
                if role:
                    fb = None
                    up = e.get("reports_to")
                    h2 = 0
                    while up and h2 < MAX_HOPS and not fb:
                        h2 = h2 + 1
                        m = live_employee(up)
                        if m:
                            fb = m.get("user_id")
                        else:
                            up = frappe.db.get_value("Employee", up, "reports_to")
                    return [role + " Approval Waiting", role, e.get("user_id"), fb]
            eid = frappe.db.get_value("Employee", eid, "reports_to")
        return [None, None, None, None]


    def gm_and_ceo(by):
        # -> [gm_user, ceo_user]: the first active GM-role user above `by`,
        # and the first active manager above that GM.
        eid = frappe.db.get_value("Employee", by, "reports_to")
        hops = 0
        while eid and hops < MAX_HOPS:
            hops = hops + 1
            e = live_employee(eid)
            if e and has_role(e.get("user_id"), "GM"):
                up = e.get("reports_to")
                h2 = 0
                while up and h2 < MAX_HOPS:
                    h2 = h2 + 1
                    m = live_employee(up)
                    if m:
                        return [e.get("user_id"), m.get("user_id")]
                    up = frappe.db.get_value("Employee", up, "reports_to")
                return [e.get("user_id"), None]
            eid = frappe.db.get_value("Employee", eid, "reports_to")
        return [None, None]


    META = frappe.get_meta("Doctor Service")


    def has(field):
        return META.has_field(field)


    def put(field, value):
        if has(field):
            doc.set(field, value)


    def as_list(raw):
        # A JSON field's value: a list already, or its text.
        if not raw:
            return []
        if isinstance(raw, list):
            return raw
        try:
            v = json.loads(raw)
        except Exception:
            return []
        return v if isinstance(v, list) else []


    def same(a, b, field):
        if field == "service_amount":
            return round(float(a or 0), 2) == round(float(b or 0), 2)
        if field == "custom_service_details":
            return json.dumps(as_list(a), sort_keys=True) == json.dumps(as_list(b), sort_keys=True)
        return str(a or "").strip() == str(b or "").strip()


    if has(APP_FLAG) and doc.get(APP_FLAG):
        user = frappe.session.user
        roles = frappe.get_all("Has Role", filters={"parent": user, "parenttype": "User"}, pluck="role")
        can_enter = user == "Administrator" or "System Manager" in roles
        for r in ENTRY_ROLES:
            if r in roles:
                can_enter = True
        mine = frappe.get_all("Employee", filters={"user_id": user, "status": "Active"},
                              fields=["name", "employee_name", "custom_role_profile"], limit=1)
        me = mine[0].get("name") if mine else user
        # Sales entry: an ABM / RBM / SM seat holder without an MIS role.
        my_seat = (mine[0].get("custom_role_profile") or "") if mine else ""
        my_grade = grade_of(my_seat)
        sales = False
        if not can_enter and mine and my_grade in SALES_RANK and not is_vacant_name(mine[0].get("employee_name")):
            can_enter = True
            sales = True

        old = None if doc.is_new() else doc.get_doc_before_save()
        tracker = old.get("custom_tracker") if old else None
        ot_state = frappe.db.get_value(OT, tracker, "workflow_state") if tracker else None
        editable = (not tracker) or ot_state == REWORK
        # The tracker is set here (section 5) only, never by the client.
        if (doc.get("custom_tracker") or "") != (tracker or ""):
            doc.custom_tracker = tracker

        changed = []
        if old:
            for f in CONTENT:
                if not same(old.get(f), doc.get(f), f):
                    changed.append(f)

        # ---- 1. content lock
        late = []
        for f in changed:
            if f not in LATE_OK:
                late.append(f)
        if old and changed and not editable and (late or not str(ot_state or "").endswith(" Approval Waiting")):
            done = str(ot_state or "").endswith("Rejected") or str(ot_state or "").endswith("Verified")
            frappe.throw("This service is " + (str(ot_state) if done else "in approval (" + str(ot_state) + ")")
                         + " and can no longer be edited.")
        if (not old or changed) and not can_enter:
            frappe.throw("Only the MIS team, ABMs, RBMs and SMs can add or edit a doctor service.")

        # ---- 2 + 3. validate content, set department / HQ from the employee
        if not old or changed:
            if not doc.get("doctor"):
                frappe.throw("Choose the doctor.")
            if not frappe.db.exists("Lead", doc.get("doctor")):
                frappe.throw("No such doctor: " + str(doc.get("doctor")))
            put("doctor_name", frappe.db.get_value("Lead", doc.get("doctor"), "lead_name") or doc.get("doctor"))

            if not doc.get("service_name"):
                frappe.throw("Choose the service.")
            if not frappe.db.exists("Doctor Service Master", doc.get("service_name")):
                frappe.throw("Unknown service: " + str(doc.get("service_name")))
            # Service details: what the service asks for (its master's
            # custom_capture_fields -- EB Bill the EB number, Recharge the
            # mobile...). Only those keys are kept, values trimmed and
            # de-duplicated, one value where the field takes one, and a
            # required one must be there.
            if has("custom_service_details"):
                capture = []
                if frappe.get_meta("Doctor Service Master").has_field("custom_capture_fields"):
                    capture = as_list(frappe.db.get_value("Doctor Service Master", doc.get("service_name"),
                                                          "custom_capture_fields"))
                given = {}
                for d in as_list(doc.get("custom_service_details")):
                    if isinstance(d, dict) and d.get("key"):
                        given[str(d.get("key"))] = d.get("values") or []
                kept = []
                for f in capture:
                    if not isinstance(f, dict) or not str(f.get("key") or "").strip():
                        continue
                    key = str(f.get("key")).strip()
                    label = str(f.get("label") or key).strip()
                    vals = []
                    for v in (given.get(key) or []):
                        v = str(v or "").strip()
                        if v and v not in vals:
                            vals.append(v)
                    if not f.get("multi"):
                        vals = vals[:1]
                    if not vals and f.get("required") != 0:
                        frappe.throw("Add the " + label + " for " + str(doc.get("service_name")) + ".")
                    if vals:
                        kept.append({"key": key, "label": label, "values": vals})
                doc.custom_service_details = json.dumps(kept) if kept else None

            amount = round(float(doc.get("service_amount") or 0), 2)
            if amount <= 0:
                frappe.throw("Enter an amount above 0.")
            doc.service_amount = amount
            # 3b. a jump of more than INCREASE_LIMIT over the previous service needs a reason
            if has("custom_increase_reason"):
                prev = previous_service(doc.get("doctor"), None if doc.is_new() else doc.name)
                if prev and amount - prev["amount"] > INCREASE_LIMIT:
                    if not str(doc.get("custom_increase_reason") or "").strip():
                        frappe.throw("This is " + frappe.utils.fmt_money(amount - prev["amount"], currency="INR")
                                     + " more than the doctor's previous service (" + str(prev["service"]) + ", "
                                     + frappe.utils.fmt_money(prev["amount"], currency="INR")
                                     + "). Give the reason for the increase.")
                    doc.custom_increase_reason = str(doc.get("custom_increase_reason")).strip()
                else:
                    doc.custom_increase_reason = None

            if not doc.get("service_date"):
                frappe.throw("Pick the service date.")
            if str(doc.get("service_date")) > frappe.utils.nowdate():
                frappe.throw("The service date cannot be in the future.")

            if not doc.get("by"):
                frappe.throw("Choose the RBM or SM this service is entered for.")
            chosen = None
            if sales:
                # a sales entry is for the person entering it, and must pass the gate
                if doc.get("by") != me:
                    frappe.throw("You can enter a service only for yourself.")
                for m in linked_managers(doc.get("doctor"), list(SALES_RANK.keys())):
                    if m["employee"] == me:
                        chosen = m
                if not chosen:
                    frappe.throw("This doctor is not linked to you, so you cannot enter a service for them.")
                my_dept = frappe.db.get_value("Role Profile", my_seat, "custom_department") or "" if my_seat else ""
                gate = roi_gate(doc.get("doctor"), my_dept, my_grade)
                if not gate["allowed"]:
                    if gate["mode"] == "low":
                        frappe.throw("This doctor's latest ROI is " + str(gate["roi"]) + "x, below 3x: only an SM / ZSM"
                                     + " can enter a service for them, up to "
                                     + frappe.utils.fmt_money(LOW_CAP, currency="INR") + ".")
                    who = gate["needed_grade"] + " and above" if gate["needed_grade"] != "SM" else "SM / ZSM"
                    frappe.throw("This doctor's latest ROI is " + str(gate["roi"]) + "x; " + ("an " if gate["grade"][:1] in "AEFHILMNORSX" else "a ")
                                 + gate["grade"] + " needs " + str(gate["need"]) + "x to enter a service."
                                 + " It can be entered by " + who + ".")
                if gate["cap"] and float(doc.get("service_amount") or 0) > gate["cap"]:
                    if gate["mode"] == "low":
                        frappe.throw("You've hit the limit: you can't add more than "
                                     + frappe.utils.fmt_money(gate["cap"], currency="INR")
                                     + " of service for this doctor (latest ROI below 3x).")
                    esc = gate["escalate"]
                    frappe.throw("Your limit for a new doctor is " + frappe.utils.fmt_money(gate["cap"], currency="INR")
                                 + ". For more, contact " + ("the MIS team" if esc == "MIS" else "your " + esc) + ".")
            else:
                for m in linked_managers(doc.get("doctor")):
                    if m["employee"] == doc.get("by"):
                        chosen = m
            if not chosen:
                frappe.throw(str(doc.get("by")) + " is not an RBM or SM linked to this doctor, so the service cannot be filed under them.")

            pair = None
            for p in chosen["pairs"]:
                if p["department"] == (doc.get("department") or "") and p["hq"] == (doc.get("hq") or ""):
                    pair = p
            if not pair:
                same_dept = []
                for p in chosen["pairs"]:
                    if p["department"] == (doc.get("department") or ""):
                        same_dept.append(p)
                if len(chosen["pairs"]) == 1:
                    pair = chosen["pairs"][0]
                elif len(same_dept) == 1:
                    pair = same_dept[0]
            if not pair:
                names = []
                for p in chosen["pairs"]:
                    names.append(p["department"] + " / " + p["hq"])
                frappe.throw("Pick the department for " + str(chosen["employee_name"]) + ": " + ", ".join(names))
            doc.department = pair["department"]
            doc.hq = pair["hq"]
            put("role_profile", chosen["seat"])
            if not doc.get("date"):
                put("date", frappe.utils.nowdate())
            if not old:
                put("custom_entered_by", me)

        # ---- 5. into approval
        if can_enter and ((not tracker) or ot_state == REWORK):
            first = chain_start(doc.get("by"))
            step = first[0]
            step_role = first[1]
            gm_user = first[2]
            ceo_user = first[3]
            if not gm_user:
                frappe.throw("No RBM, SM or GM found above " + str(doc.get("by")) + " (reports_to), so the service has no one to go to.")
            by_user = frappe.db.get_value("Employee", doc.get("by"), "user_id")
            vals = {"status": step, "workflow_state": step, "next_role": step_role,
                    "next_approver": gm_user, "custom_fallback_approver": ceo_user,
                    "data": doc.get("service_amount"), "role_profile": doc.get("role_profile"),
                    "department": doc.get("department"), "hq": doc.get("hq"), "user": by_user}
            if not tracker:
                ot = frappe.get_doc({
                    "doctype": OT, "reference_doctype": "Doctor Service", "setting": SETTING,
                    "reference": doc.name, "role_profile": doc.get("role_profile"),
                    "department": doc.get("department"), "hq": doc.get("hq"), "user": by_user,
                    "next_approver": gm_user, "next_role": step_role,
                    "data": doc.get("service_amount"), "status": step,
                })
                ot.flags.update({"ignore_permissions": True, "ignore_mandatory": True, "ignore_links": True})
                ot.insert()
                tracker = ot.name
            else:
                reason = str(frappe.db.get_value(OT, tracker, "reason_for_rejection") or "").strip()
                if reason:
                    doc.add_comment("Comment", "Earlier send-back: " + reason)
                vals["reason_for_rejection"] = ""
            frappe.db.set_value(OT, tracker, vals)
            frappe.get_doc(OT, tracker).add_comment("Workflow", step)
            doc.custom_tracker = tracker
            # The service mirrors its tracker (the team's "operational tracker"
            # script keeps it in step from the next step on). Safe now that the
            # doctype's own "Doctor Service" workflow is inactive.
            doc.workflow_state = step


guard(doc)
