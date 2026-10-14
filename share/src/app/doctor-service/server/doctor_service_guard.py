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
#   4. custom_entered_by — the MIS employee who raised it (if the field
#      exists).
#   5. INTO APPROVAL — on an entry role's save of a new service (or one
#      without a tracker), or of one sent back (Rework): the tracker is made
#      (or reset) at GM Approval Waiting. next_approver = the first active
#      GM above the on-behalf employee (reports_to, by the user's GM role);
#      custom_fallback_approver = that GM's manager (the CEO). A new
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
    OT = "Operational Tracker"
    SETTING = "Doctor Service"
    START = "GM Approval Waiting"
    REWORK = "Rework"
    CONTENT = ["doctor", "service_name", "service_date", "service_amount", "by",
               "department", "hq", "remarks", "service_attachement"]
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


    def linked_managers(doctor):
        # COPIED from elbrit_doctor_service_options.py — change both.
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


    def has_role(u, role):
        return bool(frappe.db.exists("Has Role", {"parent": u, "parenttype": "User", "role": role}))


    def live_employee(eid):
        e = frappe.db.get_value("Employee", eid, ["name", "employee_name", "status", "user_id", "reports_to"],
                                as_dict=True)
        if e and e.get("status") == "Active" and e.get("user_id") and not is_vacant_name(e.get("employee_name")):
            return e
        return None


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


    def same(a, b, field):
        if field == "service_amount":
            return round(float(a or 0), 2) == round(float(b or 0), 2)
        return str(a or "").strip() == str(b or "").strip()


    if has(APP_FLAG) and doc.get(APP_FLAG):
        user = frappe.session.user
        roles = frappe.get_all("Has Role", filters={"parent": user, "parenttype": "User"}, pluck="role")
        can_enter = user == "Administrator" or "System Manager" in roles
        for r in ENTRY_ROLES:
            if r in roles:
                can_enter = True
        mine = frappe.get_all("Employee", filters={"user_id": user, "status": "Active"}, pluck="name", limit=1)
        me = mine[0] if mine else user

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
        if old and changed and not editable and (late or ot_state != START):
            done = str(ot_state or "").endswith("Rejected") or str(ot_state or "").endswith("Verified")
            frappe.throw("This service is " + (str(ot_state) if done else "in approval (" + str(ot_state) + ")")
                         + " and can no longer be edited.")
        if (not old or changed) and not can_enter:
            frappe.throw("Only the MIS team can add or edit a doctor service.")

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

            amount = round(float(doc.get("service_amount") or 0), 2)
            if amount <= 0:
                frappe.throw("Enter an amount above 0.")
            doc.service_amount = amount

            if not doc.get("service_date"):
                frappe.throw("Pick the service date.")
            if str(doc.get("service_date")) > frappe.utils.nowdate():
                frappe.throw("The service date cannot be in the future.")

            if not doc.get("by"):
                frappe.throw("Choose the RBM or SM this service is entered for.")
            chosen = None
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
            pair_users = gm_and_ceo(doc.get("by"))
            gm_user = pair_users[0]
            ceo_user = pair_users[1]
            if not gm_user:
                frappe.throw("No GM found above " + str(doc.get("by")) + " (reports_to), so the service has no one to go to.")
            by_user = frappe.db.get_value("Employee", doc.get("by"), "user_id")
            vals = {"status": START, "workflow_state": START, "next_role": "GM",
                    "next_approver": gm_user, "custom_fallback_approver": ceo_user,
                    "data": doc.get("service_amount"), "role_profile": doc.get("role_profile"),
                    "department": doc.get("department"), "hq": doc.get("hq"), "user": by_user}
            if not tracker:
                ot = frappe.get_doc({
                    "doctype": OT, "reference_doctype": "Doctor Service", "setting": SETTING,
                    "reference": doc.name, "role_profile": doc.get("role_profile"),
                    "department": doc.get("department"), "hq": doc.get("hq"), "user": by_user,
                    "next_approver": gm_user, "next_role": "GM",
                    "data": doc.get("service_amount"), "status": START,
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
            frappe.get_doc(OT, tracker).add_comment("Workflow", START)
            doc.custom_tracker = tracker
            # The service mirrors its tracker (the team's "operational tracker"
            # script keeps it in step from the next step on). Safe now that the
            # doctype's own "Doctor Service" workflow is inactive.
            doc.workflow_state = START


guard(doc)
