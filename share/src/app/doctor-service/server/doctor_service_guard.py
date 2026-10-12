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
# ROUTE (the ERP Workflow, set up by the team — see README.md):
#   Draft -> GM Approval -> CEO Approval -> Approved
#   GM may "Approve as final": GM Approval -> Approved (CEO not needed)
#   GM / CEO may Reject -> Rejected; MIS edits a Rejected one and resubmits
#
# WHAT THIS SCRIPT ADDS ON TOP OF THE WORKFLOW:
#   1. CONTENT LOCK — doctor, service, date, amount, on-behalf employee,
#      department, HQ, remarks and attachment change only on a new row or
#      while it is Draft / Rejected, and only by the entry roles
#      (ENTRY_ROLES) or System Manager.
#   2. ON BEHALF OF — `by` must be an RBM / SM linked to the doctor (the
#      same rule as elbrit_doctor_service_options: linked_managers() is
#      COPIED from there — change both). Department, HQ and role_profile
#      are SET HERE from that employee's pair for this doctor, so the app
#      cannot file a service under the wrong department.
#   3. CHECKS — amount above 0 (2 places), service date not in the future,
#      service in Doctor Service Master, doctor exists. Attachment optional.
#   4. REJECTION REASON — moving into Rejected needs custom_rejection_reason
#      (3+ characters). Leaving Rejected (resubmit) copies the old reason
#      into a comment and clears the field.
#   5. STAMPS — who and when at GM and CEO, into the optional fields
#      custom_gm_action_by / _on, custom_ceo_action_by / _on,
#      custom_ceo_skipped, custom_entered_by. Each is written only if the
#      field exists, so none is required for the script to run.
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
    DRAFT = "Draft"
    GM_STATE = "GM Approval"
    CEO_STATE = "CEO Approval"
    APPROVED = "Approved"
    REJECTED = "Rejected"
    EDITABLE = [DRAFT, REJECTED]
    CONTENT = ["doctor", "service_name", "service_date", "service_amount", "by",
               "department", "hq", "remarks", "service_attachement"]


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
                                                  "custom_role_profile", "role_id"], as_dict=True)
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
        old_state = old.get("workflow_state") if old else None
        new_state = doc.get("workflow_state") or DRAFT

        changed = []
        if old:
            for f in CONTENT:
                if not same(old.get(f), doc.get(f), f):
                    changed.append(f)

        # ---- 1. content lock
        if old and changed and old_state not in EDITABLE:
            frappe.throw("This service is in " + str(old_state) + " and can no longer be edited.")
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

        # ---- 4. rejection reason
        if new_state == REJECTED and old_state != REJECTED:
            if len(str(doc.get("custom_rejection_reason") or "").strip()) < 3:
                frappe.throw("Add a short reason for the rejection — the MIS team sees it.")
        if old_state == REJECTED and new_state != REJECTED:
            reason = str(doc.get("custom_rejection_reason") or "").strip()
            if reason:
                doc.add_comment("Comment", "Earlier rejection: " + reason)
            put("custom_rejection_reason", "")

        # ---- 5. stamps
        if old_state != new_state:
            now = frappe.utils.now()
            if old_state == GM_STATE and new_state in [CEO_STATE, APPROVED, REJECTED]:
                put("custom_gm_action_by", me)
                put("custom_gm_action_on", now)
                if new_state == APPROVED:
                    put("custom_ceo_skipped", 1)
            if old_state == CEO_STATE and new_state in [APPROVED, REJECTED]:
                put("custom_ceo_action_by", me)
                put("custom_ceo_action_on", now)
            if new_state == GM_STATE:
                put("custom_gm_action_by", None)
                put("custom_gm_action_on", None)
                put("custom_ceo_action_by", None)
                put("custom_ceo_action_on", None)
                put("custom_ceo_skipped", 0)


guard(doc)
