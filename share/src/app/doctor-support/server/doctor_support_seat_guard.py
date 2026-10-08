# =====================================================================
# SERVER SCRIPT — the source of truth for the ERP's copy. Keep in step.
#
#   Name          : Doctor Support Seat Guard
#   Script Type   : DocType Event
#   Reference     : Doctor Support
#   Event         : Before Save
#
# Per seat: who may add/change/delete that seat's lines, based on the
# seat's approval state. Unchanged from production except that NUMBERS ARE
# COMPARED TO 2 PLACES (as in secondary_data_entry_seat_guard.py): an
# amount of 642.9 and 642.9000000000001 is the same line, not an edit (a
# float-noise difference used to block every save on a Doctor Support with
# a seat waiting for verification).
#
# safe_exec: no import, no .format(), no set literals, no tuple
# unpacking, no underscore-prefixed names.
# =====================================================================

user = frappe.session.user
roles = frappe.get_all("Has Role", filters={"parent": user, "parenttype": "User"}, pluck="role")
is_admin = (user == "Administrator") or ("System Manager" in roles)

if not is_admin:
    is_team = False
    for tr_role in ["ABM", "RBM", "SM", "GM", "CEO"]:
        if tr_role in roles:
            is_team = True
    is_mis = ("MIS" in roles) or ("User MIS" in roles)
    is_verify_admin = ("MIS Admin" in roles) or ("CRM Manager" in roles)
    seat = frappe.db.get_value("User", user, "role_profile_name") or ""
    is_be = seat.startswith("BE") and not is_team and not is_mis and not is_verify_admin

    old = doc.get_doc_before_save()
    before = {}
    trackers = {}
    tracker_states = {}
    if old:
        for r in old.item_table:
            before[r.name] = r
        for t in (old.custom_approver_table or []):
            if t.role_profile and t.tracker:
                trackers[t.role_profile] = t.tracker
                tracker_states[t.role_profile] = t.status or ""

    # Item-table fieldnames (passed to prev.get(f) / r.get(f)), so these carry the
    # custom_ prefix. "item", "qty" and "amount" are unprefixed on this table.
    watched = ["item", "qty", "amount", "custom_status",
               "custom_role_profile", "custom_department", "custom_hq"]
    numeric = ["qty", "amount"]

    # seats whose lines this save adds, changes or removes -> a row number for messages
    touched = {}
    now_names = {}
    for r in doc.item_table:
        prev = before.get(r.name) if r.name else None
        if r.name:
            now_names[r.name] = 1
        changed = prev is None
        if prev:
            for f in watched:
                if f in numeric:
                    differs = frappe.utils.flt(prev.get(f), 2) != frappe.utils.flt(r.get(f), 2)
                else:
                    differs = (prev.get(f) or "") != (r.get(f) or "")
                if differs:
                    changed = True
                    break
        if changed:
            if prev and prev.custom_role_profile:
                touched[prev.custom_role_profile] = r.idx
            if r.custom_role_profile:
                touched[r.custom_role_profile] = r.idx
    for n in before:
        if n not in now_names and before[n].custom_role_profile:
            touched[before[n].custom_role_profile] = before[n].idx

    for s in touched:
        tr = trackers.get(s)
        state = tracker_states.get(s, "")
        where = " (seat " + s + ", row " + str(touched[s]) + ")"

        if state.endswith("Approved and Waiting for Verification"):
            if not is_verify_admin:
                if not is_mis:
                    frappe.throw("These lines are waiting for verification and can only be changed by the "
                                 "assigned MIS, MIS Admin or CRM Manager" + where + ".")
                assigned = frappe.get_all("ToDo",
                    filters={"reference_type": "Operational Tracker", "reference_name": tr, "status": "Open"},
                    pluck="allocated_to")
                if assigned and user not in assigned:
                    frappe.throw("Only the MIS members assigned to verify this tracker, MIS Admin or "
                                 "CRM Manager can change these lines" + where + ".")
        elif is_mis and not is_team and not is_verify_admin:
            frappe.throw("MIS can change lines only while they are waiting for verification" + where + ".")
        elif is_be:
            if s != seat:
                frappe.throw("You can only change your own seat's lines (" + seat + ")" + where + ".")
            if state and state != "Rework":
                frappe.throw("Your lines are in '" + state + "' and can't be changed. "
                             "They can be edited only after they are sent back for Rework.")

    if is_be and touched:
        seats = frappe.get_all("Role Profile Multiselect",
            filters={"parenttype": "Lead", "parent": doc.doctor},
            pluck="role_profile_list")
        if seat not in seats:
            frappe.throw("Your seat " + seat + " is not assigned to doctor "
                         + str(doc.doctor) + ".")
