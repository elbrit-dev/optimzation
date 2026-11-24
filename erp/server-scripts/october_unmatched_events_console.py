# SYSTEM CONSOLE -- the October rows of "unmatched_visits_all.csv" that the 13 Nov "Sheet upload Oct 2026"
# load left out (19 Nov 2026, the user). Prod. Desk > System Console, type Python, as Administrator.
#   1) DRY = True, "Commit" unticked: only prints what it would make.  2) DRY = False, tick "Commit", Execute.
# Safe to re-run: a row is skipped when the person already has that visit / Other Work / leave on that day.
#
# Same shape as the 13 Nov load (description "Sheet upload Oct 2026"), owned by the person himself:
#   VISITS  26 doctor visits whose doctor is clear (Doctor Visit plan, Completed, Private, all day, the
#           doctor's x/y on the event, the person a participant attending Yes). The other 94 sheet visits
#           only give a first name -- the team picks the doctor in october_unmatched_visits_to_pick.csv,
#           then they go in VISITS and this runs again.
#   OTHER   meetings / inductions / admin from the sheet as Other Work (Public, Completed, all day), the
#           place in Meeting Location, its HQ in HQ Territory. Induction = type Meeting (the user).
#           Vivek 01-Oct and Lakshmanan 13-Oct are on the sheet date (the user: change later if needed).
#   LEAVES  Ashish Agarwal 15-Oct, Shivendra Singh 20 + 21-Oct: Leave Application, Probationary Leave Policy
#           (both on probation), approved and submitted.
#   Not made: Giridharan 19-Oct "HOLIDAY" (no work), Srinivasan G "Abscond" (left, no date).

DRY = True
W = "WOULD " if DRY else ""
DESC = "Sheet upload Oct 2026"

# [employee, date, doctor, name on the sheet]
VISITS = [
    ["E01298", "2026-10-17", "DR-81693", "USHA"],
    ["E01298", "2026-10-17", "DR-81709", "THILAK"],              # Tilakraj K -- his doctor, same area as Usha that day
    ["E01298", "2026-10-20", "DR-81795", "SIVARAMAN"],
    ["E01298", "2026-10-28", "DR-81795", "SIVARAMAN"],
    ["E01298", "2026-10-20", "DR-81796", "KARTHIKEYAN"],
    ["E01298", "2026-10-24", "DR-81796", "KARTHIKEYAN"],
    ["E01298", "2026-10-21", "DR-55228", "SIVAPRASAD"],
    ["E01306", "2026-10-10", "DR-73179", "DR RASHMI"],           # 10-Oct: four Mogappair East doctors in a row
    ["E01306", "2026-10-10", "DR-73180", "DR.GEOVINE"],
    ["E01306", "2026-10-10", "DR-73176", "DR.KUNDAVI"],
    ["E01306", "2026-10-10", "DR-73181", "DR.GEETHA"],
    ["E01306", "2026-10-16", "DR-73469", "Dhanya Menon"],
    ["E01306", "2026-10-16", "DR-43143", "Geetha V"],
    ["E01306", "2026-10-20", "DR-41078", "Dr balamurugan"],      # joint with Giridharan + Pooranakumar
    ["E01306", "2026-10-23", "DR-74218", "Dr Sasikala"],         # joint with Giridharan
    ["E01321", "2026-10-16", "DR-43143", "Dr.geetha"],
    ["E01321", "2026-10-20", "DR-41078", "Dr balamurugan"],
    ["E01321", "2026-10-23", "DR-74218", "Dr Sasikala"],
    ["E01321", "2026-10-24", "DR-55357", "Dr uma"],              # joint with Pooranakumar
    ["E01321", "2026-10-25", "DR-43143", "dr.geetha"],
    ["E01323", "2026-10-20", "DR-41078", "Dr balamurugan"],
    ["E01323", "2026-10-24", "DR-55357", "Dr uma"],
    ["E01323", "2026-10-31", "DR-55357", "Dr uma"],
    ["E01323", "2026-10-27", "DR-55322", "Dr Sharmila"],
    ["E01325", "2026-10-26", "DR-81700", "Dr Suhasini"],
    ["E01325", "2026-10-28", "DR-74228", "Dr Shanmuga Boopathy"],
]

# [employee, date, Other type, subject, Meeting Location, HQ Territory]
OTHER = [
    ["E01291", "2026-10-06", "Meeting", "ABM & RBM REVIEW MEETING", "Chennai (Vadapalani) Gokulam Park", "HQ-Chennai"],
    ["E00719", "2026-10-01", "Meeting", "CYCLE MEETING", "Bangalore", "HQ-Bangalore"],
    ["E01252", "2026-10-13", "Meeting", "MEETING", "Chennai Guindy Office", "HQ-Chennai"],
    ["E01192", "2026-10-05", "Meeting", "MT", "Chennai", "HQ-Chennai"],
    ["E01192", "2026-10-15", "Meeting", "MT", "Chennai Guindy Office", "HQ-Chennai"],
    ["E01298", "2026-10-06", "Meeting", "MEETING", "Chennai", "HQ-Chennai"],
    ["E00422", "2026-10-06", "Meeting", "MT", "Bangalore", "HQ-Bangalore"],
    ["E00442", "2026-10-06", "Meeting", "MT", "Bangalore", "HQ-Bangalore"],
    ["E00454", "2026-10-06", "Meeting", "MT", "Bangalore", "HQ-Bangalore"],
    ["E00805", "2026-10-06", "Meeting", "MT", "Bangalore", "HQ-Bangalore"],
    ["E00817", "2026-10-06", "Meeting", "MT", "Bangalore", "HQ-Bangalore"],
    ["E00906", "2026-10-06", "Meeting", "MT", "Bangalore", "HQ-Bangalore"],
    ["E01009", "2026-10-06", "Meeting", "MT", "Bangalore", "HQ-Bangalore"],
    ["E01075", "2026-10-06", "Meeting", "MT", "Bangalore", "HQ-Bangalore"],
    ["E01084", "2026-10-06", "Meeting", "MT", "Bangalore", "HQ-Bangalore"],
    ["E01087", "2026-10-06", "Meeting", "MT", "Bangalore", "HQ-Bangalore"],
    ["E01088", "2026-10-06", "Meeting", "MT", "Bangalore", "HQ-Bangalore"],
    ["E01095", "2026-10-06", "Meeting", "MT", "Bangalore", "HQ-Bangalore"],
    ["E01100", "2026-10-06", "Meeting", "MT", "Bangalore", "HQ-Bangalore"],
    ["E01104", "2026-10-06", "Meeting", "MT", "Bangalore", "HQ-Bangalore"],
    ["E01105", "2026-10-06", "Meeting", "MT", "Bangalore", "HQ-Bangalore"],
    ["E01108", "2026-10-06", "Meeting", "MT", "Bangalore", "HQ-Bangalore"],
    ["E01129", "2026-10-06", "Meeting", "MT", "Bangalore", "HQ-Bangalore"],
    ["E01153", "2026-10-06", "Meeting", "MT", "Bangalore", "HQ-Bangalore"],
    ["E01207", "2026-10-06", "Meeting", "MT", "Bangalore", "HQ-Bangalore"],
    ["E01249", "2026-10-06", "Meeting", "MT", "Bangalore", "HQ-Bangalore"],
    ["E01142", "2026-10-12", "Meeting", "INDUCTION to team", "Perundurai Road Erode (Ram INN)", "HQ-Erode"],
    ["E01310", "2026-10-12", "Meeting", "Induction", "Perundurai Road Erode (Ram INN)", "HQ-Erode"],
    ["E01315", "2026-10-12", "Meeting", "INDUCTION WITH MARIMUTHU", "Coimbatore", "HQ-Coimbatore"],
    ["E01315", "2026-10-13", "Meeting", "INDUCTION WITH AZAR", "Coimbatore", "HQ-Coimbatore"],
    ["E01241", "2026-10-13", "Meeting", "Induction - new joinee (list not available)", "Chennai", "HQ-Chennai"],
    ["E01241", "2026-10-14", "Meeting", "Induction - new joinee (list not available)", "Chennai", "HQ-Chennai"],
    ["E01039", "2026-10-13", "Admin Day", "ADMIN", "Rajahmundry", "HQ-Rajamundry"],
    ["E01278", "2026-10-01", "Meeting", "Online Review Meeting (Own HQ)", "Varanasi", "HQ-Varanasi"],
    ["E01278", "2026-10-09", "Meeting", "New Delhi Meeting", "New Delhi", "HQ-Delhi"],
    ["E01278", "2026-10-10", "Meeting", "New Delhi Meeting", "New Delhi", "HQ-Delhi"],
    ["E00719", "2026-10-08", "Meeting", "INDUCTION", "Bangalore", "HQ-Bangalore"],
    ["E01304", "2026-10-06", "Meeting", "GIVEN INDUCTION Half day", "Bellary", "HQ-Bellary"],
]

# [employee, date]
LEAVES = [
    ["E01278", "2026-10-15"],
    ["E01312", "2026-10-20"],
    ["E01312", "2026-10-21"],
]
LEAVE_TYPE = "Probationary Leave Policy"

# safe_exec: no import, no tuple unpacking, no underscore names, no def -- everything inline.
EMP = {}
for e in list(set([r[0] for r in VISITS] + [r[0] for r in OTHER] + [r[0] for r in LEAVES])):
    x = frappe.db.get_value("Employee", e, ["employee_name", "custom_role_profile", "reports_to", "user_id", "company", "leave_approver", "status"], as_dict=True)
    if x:
        rp = frappe.db.get_value("Role Profile", x.custom_role_profile, ["custom_department", "custom_territory"], as_dict=True) if x.custom_role_profile else None
        x.seat = x.custom_role_profile
        x.dept = rp.custom_department if rp else None
        x.hq = rp.custom_territory if rp else None
        x.mseat = frappe.db.get_value("Employee", x.reports_to, "custom_role_profile") if x.reports_to else None
    EMP[e] = x

EV_Q = ("select count(*) from `tabEvent` ev join `tabEvent Participants` p on p.parent = ev.name "
        "where p.reference_doctype = 'Employee' and p.reference_docname = %s and date(ev.starts_on) = %s and ev.event_category = %s")

made = {"visit": 0, "other": 0, "leave": 0}
skip = []
bad = []
new_events = []

# 1. doctor visits
for v in VISITS:
    x = EMP.get(v[0])
    l = frappe.db.get_value("Lead", v[2], ["lead_name", "custom_latitude", "custom_longitude", "custom_latitude_and_longitude"], as_dict=True)
    if not x or not x.seat or not x.user_id:
        bad.append("visit " + v[0] + " " + v[1] + ": employee / seat / user missing")
        continue
    if not l:
        bad.append("visit " + v[0] + " " + v[1] + ": doctor " + v[2] + " not found")
        continue
    if frappe.db.sql(EV_Q + " and ev.custom_doctor = %s", [v[0], v[1], "Doctor Visit plan", v[2]])[0][0] > 0:
        skip.append("visit " + v[0] + " " + v[1] + " " + v[2] + " (already there)")
        continue
    la = l.custom_latitude
    lo = l.custom_longitude
    if (not la or not lo) and l.custom_latitude_and_longitude:
        j = json.loads(l.custom_latitude_and_longitude)
        la = j.get("x")
        lo = j.get("y")
    nm = "Dr" + (l.lead_name or "").replace("Dr ", "").replace("Dr.", "").replace(" ", "").replace(".", "")
    doc = {"doctype": "Event", "subject": nm + "-Visit-" + (x.dept or "").replace(" - ELPL", "").replace(" ", ""),
           "event_category": "Doctor Visit plan", "event_type": "Private", "color": "#16A34A", "starts_on": v[1] + " 00:00:00",
           "status": "Completed", "all_day": 1, "custom_role_profile": x.seat, "custom_reporting_to": x.mseat,
           "custom_department": x.dept, "custom_reporting_emp": x.reports_to, "custom_hq": x.hq, "custom_employee_id": v[0],
           "custom_doctor": v[2], "custom_latitude": str(la) if la else None, "custom_longitude": str(lo) if lo else None,
           "description": DESC, "sync_with_google_calendar": 0,
           "event_participants": [{"reference_doctype": "Employee", "reference_docname": v[0], "email": x.user_id,
                                   "custom_role_profile": x.seat, "attending": "Yes"}]}
    print("   " + W + "visit  " + v[0] + " " + x.employee_name + "  " + v[1] + "  " + v[2] + " " + str(l.lead_name) + "  (sheet: " + v[3] + ")")
    if not DRY:
        ev = frappe.get_doc(doc)
        ev.insert(ignore_permissions=True)
        frappe.db.set_value("Event", ev.name, "owner", x.user_id, update_modified=False)
        for p in ev.event_participants:
            frappe.db.set_value("Event Participants", p.name, "owner", x.user_id, update_modified=False)
        new_events.append(ev.name)
    made["visit"] = made["visit"] + 1

# 2. Other Work
for o in OTHER:
    x = EMP.get(o[0])
    if not x or not x.seat or not x.user_id:
        bad.append("other " + o[0] + " " + o[1] + ": employee / seat / user missing")
        continue
    if not frappe.db.exists("Territory", o[5]):
        bad.append("other " + o[0] + " " + o[1] + ": no Territory " + o[5])
        continue
    if frappe.db.sql(EV_Q + " and ev.custom_other_type = %s", [o[0], o[1], "Other", o[2]])[0][0] > 0:
        skip.append("other " + o[0] + " " + o[1] + " " + o[2] + " (already there)")
        continue
    doc = {"doctype": "Event", "subject": o[3], "event_category": "Other", "custom_other_type": o[2],
           "event_type": "Public", "color": "#2563EB", "starts_on": o[1] + " 00:00:00", "status": "Completed", "all_day": 1,
           "custom_meeting_location": o[4], "custom_role_profile": x.seat, "custom_reporting_to": x.mseat,
           "custom_department": x.dept, "custom_reporting_emp": x.reports_to, "custom_employee_id": o[0],
           "custom_hq_territory": o[5], "description": DESC, "sync_with_google_calendar": 0,
           "event_participants": [{"reference_doctype": "Employee", "reference_docname": o[0], "email": x.user_id,
                                   "custom_role_profile": x.seat}]}
    print("   " + W + "other  " + o[0] + " " + x.employee_name + "  " + o[1] + "  " + o[2] + ": " + o[3] + " @ " + o[4])
    if not DRY:
        ev = frappe.get_doc(doc)
        ev.insert(ignore_permissions=True)
        frappe.db.set_value("Event", ev.name, "owner", x.user_id, update_modified=False)
        for p in ev.event_participants:
            frappe.db.set_value("Event Participants", p.name, "owner", x.user_id, update_modified=False)
        new_events.append(ev.name)
    made["other"] = made["other"] + 1

# 3. leave, approved
for lv in LEAVES:
    x = EMP.get(lv[0])
    if not x:
        bad.append("leave " + lv[0] + " " + lv[1] + ": employee missing")
        continue
    on = frappe.db.sql("select name, status from `tabLeave Application` where employee = %s and docstatus < 2 and from_date <= %s and to_date >= %s",
                       [lv[0], lv[1], lv[1]], as_dict=True)
    if on:
        skip.append("leave " + lv[0] + " " + lv[1] + " (already " + on[0].name + " " + str(on[0].status) + ")")
        continue
    print("   " + W + "leave  " + lv[0] + " " + x.employee_name + "  " + lv[1] + "  " + LEAVE_TYPE + " -> Approved")
    if not DRY:
        la = frappe.get_doc({"doctype": "Leave Application", "employee": lv[0], "leave_type": LEAVE_TYPE, "company": x.company,
                             "from_date": lv[1], "to_date": lv[1], "posting_date": frappe.utils.today(), "status": "Open",
                             "leave_approver": x.leave_approver, "follow_via_email": 0, "description": DESC})
        la.insert(ignore_permissions=True)
        la.status = "Approved"
        la.submit()
        print("      " + la.name + " approved")
    made["leave"] = made["leave"] + 1

print("")
print(W + "make: " + str(made["visit"]) + " visits, " + str(made["other"]) + " Other Work, " + str(made["leave"]) + " leaves")
if skip:
    print("skipped (already in ERP): " + str(len(skip)))
    for s in skip:
        print("   " + s)
if bad:
    print("PROBLEMS: " + str(len(bad)))
    for b in bad:
        print("   " + b)
if new_events:
    print("events: " + new_events[0] + " .. " + new_events[-1])
print("dry run -- nothing changed." if DRY else "done.")
