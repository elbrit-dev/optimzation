old = doc.get_doc_before_save()

WAITING_SUFFIX = " Approval Waiting"
REWORK_STATE = "Rework"

# ---- 0. mirror dynamic reference into per-type Link fields (clean GraphQL) ----
# Clear every mirror field first, then set only the one matching the current
# reference_doctype, so a changed reference never leaves a stale link behind.
refmap = {
    "Secondary Data Entry": "custom_ref_secondary_data_entry",
    "Doctor Service": "custom_ref_doctor_service",
    "Doctor Support":"custom_ref_doctor_support",
}
for reffield in refmap.values():
    doc.set(reffield, None)
reftarget = refmap.get(doc.reference_doctype)
if reftarget and doc.reference:
    doc.set(reftarget, doc.reference)

# ---- helpers (must be self-contained: may use frappe, but NOT each other / module vars) ----
def find_role_user(start_rp, target_role):
    rp = start_rp
    seen = 0
    while rp and seen < 10:
        seen = seen + 1
        users = frappe.get_all("User", filters={"role_profile_name": rp, "enabled": 1}, fields=["name"])
        for u in users:
            if frappe.db.exists("Has Role", {"parent": u.name, "role": target_role}):
                return u.name
        nxt = frappe.db.get_value("Role Profile", rp, "parent_role_profile")
        if not nxt or nxt == rp:
            break
        rp = nxt
    return None

def cond_passes(cond, val):
    for p in cond.split(" and "):
        p = p.strip()
        op = ""
        for o in [">=", "<=", "==", "!=", ">", "<"]:
            if o in p:
                op = o
                num_str = p[p.find(o) + len(o):].strip()
                break
        if not op:
            return False
        try:
            num = float(num_str)
        except Exception:
            return False
        checks = {">=": val >= num, "<=": val <= num, ">": val > num,
                  "<": val < num, "==": val == num, "!=": val != num}
        if not checks.get(op):
            return False
    return True

# ---- 1a. read Approval Settings (moved ABOVE the revisit block so that the
#          restart role can be derived from manager_level / the configured
#          approver role instead of the hardcoded sales map) ----
amount_value = doc.data or 0
matched_condition = ""
matched_role = None
verifier_value = None
manager_level = 0
try:
    settings = frappe.get_doc("Approval Settings", doc.setting or doc.reference_doctype or "Doctor Service")
    verifier_value = settings.verifier
    manager_level = settings.manager_level or 0
    rows = settings.approver_list or []
    if len(rows) == 1:
        matched_condition = (rows[0].conditions_for_final_approver or "").strip()
        matched_role = rows[0].role
    else:
        for x in rows:
            cond = (x.conditions_for_final_approver or "").strip()
            if cond and cond_passes(cond, amount_value):
                matched_condition = cond
                matched_role = x.role
except Exception:
    frappe.log_error(frappe.get_traceback(),
        "Operational Tracker: Approval Settings lookup failed for " + str(doc.setting))

# ---- 0.5 revisit detection ----
# The Revisit workflow action lands the doc in the flat "Rework" state. The only
# thing needed here is to RECOGNISE it, so section 2 does not mistake the move
# for an approval and push the doc on to "<Role> Approved and Waiting for
# Verification". No fields are cleared and the state set by the workflow is left
# exactly as-is.
is_revisit = bool(old) \
    and (old.workflow_state or "") != (doc.workflow_state or "") \
    and (doc.workflow_state or "") == REWORK_STATE

# ---- 1b. apply matched condition + final approver ----
doc.conditions = matched_condition
doc.final_approver = matched_role

# ---- 1.1 resolve final approver role -> user id ----
doc.custom_final_approver_id = find_role_user(doc.role_profile, matched_role) if (matched_role and doc.role_profile) else None

# ---- 1.5 populate / normalize next_approver ----
if manager_level:
    # Manager-level: single approver = role-profile holder's manager, climbing past
    # any vacant/inactive manager to the first live one. Only while awaiting approval,
    # and only when the current approver is missing or vacant.
    st = doc.workflow_state or doc.status or ""
    need = False
    if (st.endswith(WAITING_SUFFIX) or st == REWORK_STATE) and doc.role_profile:
        if not doc.next_approver:
            need = True
        else:
            en = frappe.db.get_value("Employee", {"user_id": doc.next_approver}, "employee_name")
            if en and en[:6].lower() == "vacant":
                need = True
    if need:
        holders = frappe.get_all("Employee",
            filters={"custom_role_profile": doc.role_profile, "status": "Active"},
            fields=["employee_name", "reports_to"], limit=20)
        rt = None
        for h in holders:
            if (h.employee_name or "")[:6].lower() != "vacant":
                rt = h.reports_to
                break
            if rt is None:
                rt = h.reports_to
        appr = None
        hops = 0
        while rt and hops < 15:
            hops = hops + 1
            mrows = frappe.get_all("Employee", filters={"name": rt},
                fields=["employee_name", "status", "user_id", "reports_to"], limit=1)
            if not mrows:
                break
            m = mrows[0]
            if m.status == "Active" and (m.employee_name or "")[:6].lower() != "vacant" and m.user_id:
                appr = m.user_id
                break
            rt = m.reports_to
        if appr:
            doc.next_approver = appr
elif not doc.next_approver and doc.next_role and doc.role_profile:
    emp_user = frappe.db.get_value("Employee", {"custom_role_profile": doc.role_profile, "status": "Active"}, "user_id")
    if emp_user:
        doc.next_approver = emp_user

# ---- 2. workflow state change handler (trigger on OLD = pending with approver) ----
# "Rework" carries no role in its name, so when an approval is granted FROM it
# the role is taken from next_role (set while the doc was last pending) or, as a
# fallback, the role configured in Approval Settings.
ws = doc.workflow_state or ""
just_approved_role = None
if old and old.workflow_state:
    if old.workflow_state.endswith(WAITING_SUFFIX):
        just_approved_role = old.workflow_state[:-len(WAITING_SUFFIX)]
    elif old.workflow_state == REWORK_STATE:
        just_approved_role = doc.next_role or matched_role

if old and old.workflow_state != doc.workflow_state \
   and just_approved_role \
   and not is_revisit \
   and not ws.endswith("Rejected"):
    mgr = manager_level
    # Manager-level is single-step: any approval is final -> verification.
    # Hierarchy flow climbs until just_approved_role == matched_role.
    # A step that itself lands in "... Approved and Waiting for Verification"
    # ("Approve to Verification" -- e.g. GM approving as final) is final too.
    # "Final Approve" (Doctor Service) lands in "<Role> Approved and Verified":
    # final and already verified -- the state is kept.
    final_verified = ws.endswith(" Approved and Verified")
    is_final = mgr or (matched_role and just_approved_role == matched_role) or ws.endswith(" Approved and Waiting for Verification") or final_verified
    if is_final:
        doc.flags.ignore_validate_workflow = True
        if not final_verified:
            doc.workflow_state = just_approved_role + " Approved and Waiting for Verification"
        doc.next_approver = None
        doc.verifier = verifier_value
        # ToDo for the verifier (Approval Settings), the assignee who acts after
        # the approval. On a final "<Role> Approved and Verified" (Doctor
        # Service) it is the hand-over to carry the approved work out -- not an
        # approval step. No verifier configured -> no ToDo.
        if verifier_value and doc.department:
            try:
                # MIS subtree via parent_role_profile (lft/rgt all-zero on this tree)
                subtree = [verifier_value]
                frontier = [verifier_value]
                seen = 0
                while frontier and seen < 20:
                    seen = seen + 1
                    kids = frappe.get_all("Role Profile",
                        filters={"parent_role_profile": ["in", frontier]},
                        fields=["name"])
                    frontier = []
                    for k in kids:
                        if k.name not in subtree:
                            subtree.append(k.name)
                            frontier.append(k.name)

                # department leaf -> its parent (the verifier group)
                start_rp = None
                for rp_name in subtree:
                    ldoc = frappe.get_doc("Role Profile", rp_name)
                    if ldoc.is_group:
                        continue
                    for d in (ldoc.custom_departments or []):
                        if d.department == doc.department:
                            start_rp = ldoc.parent_role_profile
                            break
                    if start_rp:
                        break

                # climb parents until a role profile has enabled users
                assignees = []
                rp = start_rp
                hops = 0
                while rp and hops < 15:
                    hops = hops + 1
                    us = frappe.get_all("User",
                        filters={"role_profile_name": rp, "enabled": 1}, fields=["name"])
                    if us:
                        for u in us:
                            assignees.append(u.name)
                        break
                    rp = frappe.db.get_value("Role Profile", rp, "parent_role_profile")

                # fallback: any enabled MIS-subtree user
                if not assignees:
                    us = frappe.get_all("User",
                        filters={"role_profile_name": ["in", subtree], "enabled": 1}, fields=["name"])
                    for u in us:
                        assignees.append(u.name)

                todo_text = "Verify Operational Tracker " + doc.name
                if final_verified:
                    todo_text = "Approved (" + ws + ") - carry out " + str(doc.reference_doctype) + " " + str(doc.reference)
                first_todo_name = None
                for au in assignees:
                    try:
                        todo = frappe.get_doc({
                            "doctype": "ToDo",
                            "allocated_to": au,
                            "description": todo_text,
                            "reference_type": "Operational Tracker",
                            "reference_name": doc.name,
                            "priority": "Medium",
                            "status": "Open",
                        })
                        todo.flags.ignore_permissions = True
                        todo.insert()
                        if not first_todo_name:
                            first_todo_name = todo.name
                    except Exception:
                        pass
                if first_todo_name:
                    doc.todo = first_todo_name
            except Exception:
                pass
    elif doc.next_approver:
        # hierarchy flow: multi-level advance up the reports_to chain
        reports_to = frappe.db.get_value("Employee", {"user_id": doc.next_approver, "status": "Active"}, "reports_to")
        doc.next_approver = frappe.db.get_value("Employee", reports_to, "user_id") if reports_to else None

# ---- 2.9 fallback approver = next_approver's manager ----
if doc.next_approver:
    fb = None
    if manager_level:
        rt = frappe.db.get_value("Employee", {"user_id": doc.next_approver, "status": "Active"}, "reports_to")
        hops = 0
        while rt and hops < 15:
            hops = hops + 1
            mrows = frappe.get_all("Employee", filters={"name": rt},
                fields=["employee_name", "status", "user_id", "reports_to"], limit=1)
            if not mrows:
                break
            m = mrows[0]
            if m.status == "Active" and (m.employee_name or "")[:6].lower() != "vacant" and m.user_id:
                fb = m.user_id
                break
            rt = m.reports_to
    else:
        fb_rt = frappe.db.get_value("Employee", {"user_id": doc.next_approver, "status": "Active"}, "reports_to")
        fb = frappe.db.get_value("Employee", fb_rt, "user_id") if fb_rt else None
    doc.custom_fallback_approver = fb
else:
    doc.custom_fallback_approver = None

# ---- 3. derive next_role ----
state = doc.workflow_state or doc.status
if state and state.endswith(WAITING_SUFFIX):
    doc.next_role = state[:-len(WAITING_SUFFIX)]
elif state == REWORK_STATE:
    # "Rework" names no role: keep whatever next_role the doc already carried.
    pass
elif state and (state == "Approved" or state.endswith("Approved and Verified") or state.endswith("Rejected") or state.endswith("Waiting for Verification")):
    doc.next_role = None

# ---- 4. sync status ----
if doc.workflow_state:
    doc.status = doc.workflow_state

# ---- 5. sync state to source ----
# NOTE: this stays keyed on the reference doctype, NOT manager_level. The child
# table `secondary tracker` and the parent `Secondary Data Entry` only exist for
# SDE; keying this on manager_level would make Doctor Support look for rows that
# do not exist and silently no-op inside the except.
if doc.reference_doctype and doc.reference and old and old.workflow_state != doc.workflow_state:
    try:
        if doc.setting == "Secondary Data Entry":
            child_name = frappe.db.get_value("secondary tracker",
                {"parent": doc.reference, "tracker": doc.name}, "name")
            if child_name:
                frappe.db.set_value("secondary tracker", child_name, "status", doc.workflow_state, update_modified=False)
            # ---- roll sibling tracker statuses up into the parent SDE ----
            sibling_rows = frappe.get_all("secondary tracker",
                filters={"parent": doc.reference}, fields=["status"], limit_page_length=0)
            states = []
            for sr in sibling_rows:
                states.append((sr.status or "").strip())
            new_state = None
            if states:
                n = len(states)
                n_verified = 0
                n_await_verif = 0
                rej = []
                for s in states:
                    if s.endswith("Rejected"):
                        rej.append(s)
                    elif s == "Approved and Verified":
                        n_verified = n_verified + 1
                    elif s.endswith("Approved and Waiting for Verification"):
                        n_await_verif = n_await_verif + 1
                uniq = list(set(states))
                if len(rej) == n:
                    rej_uniq = list(set(rej))
                    new_state = rej_uniq[0] if len(rej_uniq) == 1 else "Approval Rejected"
                elif len(rej) > 0:
                    new_state = "Partially Rejected"
                elif n_verified == n:
                    new_state = "Approved and Verified"
                elif len(uniq) == 1:
                    only = uniq[0]
                    new_state = "Waiting for Verification" if only.endswith("Approved and Waiting for Verification") else only
                elif (n_verified + n_await_verif) == n:
                    new_state = "Partially Verified"
                else:
                    new_state = "Partially Approved"
            # ---- Draft-gate: SDE stays in Draft until EVERY item row is Submitted ----
            draft_rows = frappe.get_all("Secondary Data Table",
                filters={"parent": doc.reference, "custom_status": "Draft"}, fields=["name"], limit=1)
            if draft_rows:
                new_state = "Draft"
            if new_state:
                frappe.db.set_value("Secondary Data Entry", doc.reference,
                    "workflow_state", new_state, update_modified=False)
        else:
            frappe.db.set_value(doc.reference_doctype, doc.reference, "workflow_state", doc.workflow_state, update_modified=False)
            # Mirror of the SDE update above: keep the parent's approver-table row in
            # step with this tracker. Doctor Support's `custom_approver_table` is a
            # Table field on the SAME child doctype, "secondary tracker". Without this
            # the row keeps the status it was created with and goes stale on every
            # transition, while the parent's own workflow_state moves on.
            appr_row = frappe.db.get_value("secondary tracker",
                {"parent": doc.reference, "tracker": doc.name}, "name")
            if appr_row:
                frappe.db.set_value("secondary tracker", appr_row, "status", doc.workflow_state, update_modified=False)
    except Exception:
        pass