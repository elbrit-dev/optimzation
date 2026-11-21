# Server Script · API · method field_expense_month
# The month's computed days for the web page and for Elbrit One:
#   GET /api/method/field_expense_month?month=2026-10[&employee=E00004 | all]
# Without employee=: the CALLER's own days (their active Employee record), for
# everyone. employee=<code> / employee=all: the viewers only (System Manager,
# HR Manager, IT department, CEO, GM). Read with frappe.get_all after that check:
# the Employee role has no DocType permission on Field Expense Day.
# Each day carries detail_json: the full day as the server worked it out (legs, visits,
# route, flags), so a client never recomputes anything.
if frappe.session.user == "Guest":
    frappe.throw("Please log in", frappe.PermissionError)

# settings_only=1: just the Field Expense Settings the app and the bill check need (21 Nov 2026)
if str(frappe.form_dict.get("settings_only") or "") == "1":
    s0 = frappe.get_doc("Field Expense Settings")
    frappe.response["message"] = {"cash_default": 0 if s0.get("cash_paid_default") == 0 else 1,
                                  "hw_reason_optional": 0 if s0.get("hw_reason_optional") == 0 else 1,
                                  "hq_km": s0.hq_km, "eq_km": s0.eq_km}
else:

    VIEW_ROLES = ["System Manager", "HR Manager"]
    VIEW_PROFILES = ["CEO", "GM"]
    VIEW_DEPTS = ["IT - ELPL"]
    me = frappe.session.user
    see_all = me == "Administrator"
    if not see_all and frappe.db.exists("Has Role", {"parent": me, "parenttype": "User", "role": ["in", VIEW_ROLES]}):
        see_all = True
    if not see_all and (frappe.db.get_value("User", me, "role_profile_name") or "") in VIEW_PROFILES:
        see_all = True
    own = []
    for e in frappe.get_all("Employee", filters={"user_id": me, "status": "Active"},
                            fields=["name", "department", "custom_role_profile"], limit_page_length=0):
        own.append(e.name)
        if (e.department or "") in VIEW_DEPTS or (e.custom_role_profile or "") in VIEW_PROFILES:
            see_all = True

    month = str(frappe.form_dict.get("month") or "").strip()
    if not month:
        frappe.throw("month is required, e.g. 2026-10")
    filters = {"month": month}
    emp = str(frappe.form_dict.get("employee") or "").strip()
    if emp == "all":
        if not see_all:
            frappe.throw("You can see only your own field expense days.", frappe.PermissionError)
    elif emp:
        if not see_all and emp not in own:
            frappe.throw("You can see only your own field expense days.", frappe.PermissionError)
        filters["employee"] = emp
    else:
        filters["employee"] = ["in", own or ["-"]]
    days = frappe.get_all("Field Expense Day", filters=filters,
        fields=["name", "employee", "employee_name", "date", "kind", "day_type", "centre_hq", "route",
                "reach_km", "farthest_place", "visits", "force_visits", "joint", "other_work",
                "road_missing", "ta", "da", "total", "os_da_full", "bill", "flight", "status", "detail_json"],
        order_by="employee asc, date asc", limit_page_length=0)
    for d in days:
        d["detail"] = json.loads(d.get("detail_json")) if d.get("detail_json") else None
        d.pop("detail_json", None)
    # One person's month (their own, or the employee= asked for): who they are, as
    # the build sees them -- role from Field Expense Input "config" designationToRole
    # (else the designation's initials, as the build does), HQ from their seat.
    head = None
    who = emp if emp != "all" else ""
    if not emp and len(own) == 1:
        who = own[0]
    if who:
        e = frappe.db.get_value("Employee", who, ["name", "employee_name", "designation", "custom_role_profile"], as_dict=True)
        if e:
            d2r = {}
            cfg = frappe.db.get_value("Field Expense Input", "config", "json")
            if cfg:
                d2r = json.loads(cfg).get("designationToRole") or {}
            role = d2r.get(e.designation or "") or ""
            if not role and e.designation:
                for w in str(e.designation).split():
                    role = role + w[0].upper()
                role = role[:5]
            hq = frappe.db.get_value("Role Profile", e.custom_role_profile, "custom_territory") if e.custom_role_profile else None
            head = {"code": e.name, "name": e.employee_name, "designation": e.designation, "role": role or None,
                    "seat": e.custom_role_profile, "hq": hq}
    s = frappe.get_doc("Field Expense Settings")
    frappe.response["message"] = {
        "month": month, "days": days, "scope": "all" if see_all else "own", "employee": head,
        "built_on": s.last_built_on, "built_month": s.last_built_month,
        "hq_km": s.hq_km, "eq_km": s.eq_km,
        # a handwritten bill opens with "Paid in cash" ticked (Field Expense Settings, 21 Nov 2026)
        "cash_default": 0 if s.get("cash_paid_default") == 0 else 1,
        # the reason for a handwritten bill may be left empty (Field Expense Settings, 21 Nov 2026)
        "hw_reason_optional": 0 if s.get("hw_reason_optional") == 0 else 1
    }
