# ===================== LEAVE ROUTE — shared block =====================
# Copied verbatim to the top of every leave script by install (one source:
# src/app/leave-approval/server/resolver.py). Who decides a leave, worked
# out LIVE from the Role Profile tree every time — nothing is stored, so a
# seat changing hands or the tree changing is picked up at once.
#
#   Privilege Leave   any Active employee of the HR department (never their own)
#   Sales             skip the applicant's immediate parent seat and take the
#                     one above it; never above GM (SM / ZSM -> GM). GM -> CEO.
#   Non-sales         the direct parent seat (BO- seats)
#   No usable seat    reports_to, up to the first real person
#   Vacant            a seat with no real holder (none, "Vacant_...", Left, or
#                     a disabled login) passes the decision up to the next
#                     seat that has one
#   Escalation        the next real person above the approver; may decide once
#                     the leave has waited ESCALATE_AFTER_DAYS or has started
#   Override          an HR-department person holding HR Manager may decide any
#                     leave; Administrator always
#
# safe_exec: no import, no .format(), no set literals, no tuple unpacking,
# no underscore-prefixed names; no comprehensions at top level.
#
# Written as ONE function holding the others: in DocType Event scripts Frappe
# runs the code so that top-level functions cannot see each other or the
# top-level constants (NameError); nested functions see them through the
# enclosing function. Use it as LRE["route"](employee, leave_type),
# LRE["can"](user, leave_row, route, today), LRE["names"](users).

def lr_engine():
    LR_PL_TYPES = ["Privilege Leave"]
    LR_HR_DEPARTMENTS = ["HR - ELPL"]
    LR_SALES_CODES = ["BE", "TL", "KAM", "ABM", "RBM", "SRBM", "DEPUTY RBM", "DRBM", "SM", "ZSM", "GM"]
    LR_CEO_SEATS = ["Admin", "CEO"]
    LR_OVERRIDE_ROLES = ["HR Manager"]
    ESCALATE_AFTER_DAYS = 2
    LR = {"parent": None, "holders": None, "emp": {}, "enabled": None}


    def lr_load():
        if LR["parent"] is not None:
            return
        par = {}
        for r in frappe.get_all("Role Profile", fields=["name", "parent_role_profile"], limit_page_length=0):
            par[r.get("name")] = r.get("parent_role_profile")
        LR["parent"] = par
        en = {}
        for u in frappe.get_all("User", filters={"enabled": 1}, fields=["name"], limit_page_length=0):
            en[u.get("name")] = 1
        LR["enabled"] = en
        hold = {}
        for e in frappe.get_all("Employee", filters={"status": "Active"},
                                fields=["name", "employee_name", "user_id", "custom_role_profile", "reports_to", "department"],
                                limit_page_length=0):
            LR["emp"][e.get("name")] = e
            if lr_real(e) and e.get("custom_role_profile"):
                hold.setdefault(e.get("custom_role_profile"), []).append(e.get("user_id"))
        LR["holders"] = hold


    def lr_real(e):
        if not e or e.get("status", "Active") != "Active":
            return False
        if (e.get("employee_name") or "")[:6].lower() == "vacant":
            return False
        return bool(e.get("user_id")) and bool(LR["enabled"].get(e.get("user_id")))


    def lr_code(seat):
        head = (seat or "").split("-")[0]
        out = ""
        for ch in head:
            if not ch.isdigit():
                out = out + ch
        return out.strip().upper()


    def lr_is_gm(seat):
        # The GM seat is "GM" (under "Sales"); before that clean-up the GM sat on "Sales" itself.
        if not seat:
            return False
        if lr_code(seat) == "GM":
            return True
        return seat == "Sales" and bool(LR["holders"].get("Sales"))


    def lr_gm_seat():
        if LR["holders"].get("GM"):
            return "GM"
        if LR["holders"].get("Sales"):
            return "Sales"
        return "GM"


    def lr_ceo():
        for s in LR_CEO_SEATS:
            if LR["holders"].get(s):
                return LR["holders"].get(s)
        return []


    def lr_up_held(seat, stop_at_gm):
        # The first seat at or above `seat` with a real holder.
        n = 0
        while seat and n < 25:
            if LR["holders"].get(seat):
                return seat
            if stop_at_gm and lr_is_gm(seat):
                return seat
            seat = LR["parent"].get(seat)
            n = n + 1
        return None


    def lr_via_reports(emp_id):
        # First real person up the reports_to chain from this employee (who may
        # have left since applying: their open leave still goes up their line).
        e = LR["emp"].get(emp_id) or frappe.db.get_value("Employee", emp_id, ["name", "reports_to"], as_dict=True)
        cur = e.get("reports_to") if e else None
        n = 0
        while cur and n < 20:
            m = LR["emp"].get(cur)
            if not m:
                m = frappe.db.get_value("Employee", cur, ["name", "employee_name", "user_id", "status", "reports_to"], as_dict=True)
            if m and lr_real(m):
                return m
            cur = m.get("reports_to") if m else None
            n = n + 1
        return None


    def lr_route(employee, leave_type):
        # -> {"kind", "approvers": [users], "escalation": [users], "approver_seat", "escalation_seat"}
        lr_load()
        e = LR["emp"].get(employee) or frappe.db.get_value("Employee", employee,
            ["name", "employee_name", "user_id", "custom_role_profile", "reports_to", "department", "status"], as_dict=True) or {}
        me_user = e.get("user_id")
        if leave_type in LR_PL_TYPES:
            hr = []
            for x in LR["emp"].values():
                if x.get("department") in LR_HR_DEPARTMENTS and lr_real(x) and x.get("user_id") != me_user:
                    hr.append(x.get("user_id"))
            return {"kind": "hr", "approvers": hr, "escalation": [], "approver_seat": None, "escalation_seat": None}
        seat = e.get("custom_role_profile")
        if seat and (lr_code(seat) in LR_SALES_CODES or lr_is_gm(seat)) and not seat.startswith("BO-"):
            if lr_is_gm(seat):
                return {"kind": "sales", "approvers": lr_ceo(), "escalation": [], "approver_seat": None, "escalation_seat": None}
            gm = lr_gm_seat()
            p1 = LR["parent"].get(seat)
            target = gm
            if p1 and not lr_is_gm(p1):
                p2 = LR["parent"].get(p1)
                if p2:
                    target = p2
            a = lr_up_held(target, True) or gm
            if lr_is_gm(a):
                return {"kind": "sales", "approvers": LR["holders"].get(a) or [], "escalation": lr_ceo(),
                        "approver_seat": a, "escalation_seat": None}
            esc = lr_up_held(LR["parent"].get(a), True)
            esc_users = (LR["holders"].get(esc) or []) if esc else []
            return {"kind": "sales", "approvers": LR["holders"].get(a) or [], "escalation": esc_users,
                    "approver_seat": a, "escalation_seat": esc}
        if seat and seat.startswith("BO-"):
            a = lr_up_held(LR["parent"].get(seat), False)
            if a and a not in LR_CEO_SEATS:
                esc = lr_up_held(LR["parent"].get(a), False)
                esc_users = (LR["holders"].get(esc) or []) if esc else lr_ceo()
                return {"kind": "seat", "approvers": LR["holders"].get(a) or [], "escalation": esc_users,
                        "approver_seat": a, "escalation_seat": esc}
        m = lr_via_reports(employee)
        if not m:
            return {"kind": "none", "approvers": [], "escalation": [], "approver_seat": None, "escalation_seat": None}
        m2 = lr_via_reports(m.get("name"))
        return {"kind": "reports_to", "approvers": [m.get("user_id")], "escalation": [m2.get("user_id")] if m2 else [],
                "approver_seat": None, "escalation_seat": None}


    def lr_days(a, b):
        return frappe.utils.date_diff(b, a) if a and b else 0


    def lr_can_decide(user, leave, route, today):
        # -> "approver" | "escalation" | "override" | None
        if user == "Administrator":
            return "override"
        applicant = (LR["emp"].get(leave.get("employee")) or {}).get("user_id")
        if user and user == applicant:
            return None
        if user in route.get("approvers"):
            return "approver"
        if user in route.get("escalation"):
            waited = lr_days(str(leave.get("posting_date") or today), today)
            if waited >= ESCALATE_AFTER_DAYS or str(leave.get("from_date") or today) <= today:
                return "escalation"
        # Override: an HR person (HR department) holding HR Manager. The IT profile
        # carries the HR Manager role too; that is not a licence to decide leaves.
        if user and frappe.db.exists("Has Role", {"parent": user, "parenttype": "User", "role": ["in", LR_OVERRIDE_ROLES]}):
            if frappe.db.exists("Employee", {"user_id": user, "status": "Active", "department": ["in", LR_HR_DEPARTMENTS]}):
                return "override"
        return None


    def lr_names(users):
        # "Arun Prakash, Meena R" for a list of logins.
        out = []
        for x in LR["emp"].values():
            if x.get("user_id") in users and x.get("employee_name") not in out:
                out.append(x.get("employee_name"))
        return ", ".join(out) if out else ", ".join(users)
    return {"route": lr_route, "can": lr_can_decide, "names": lr_names}


LRE = lr_engine()
# =================== end LEAVE ROUTE — shared block ===================
