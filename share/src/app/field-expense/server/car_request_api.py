# Server Script "Car Request API" -- type API, method car_request (12 Nov 2026).
# A rep asks to go by own car on a trip; the GM approves (the amount may be
# changed) or rejects. Every action goes through here -- reps have no
# DocType permission on Car Request, so nobody approves their own car.
#
#   GET  action=mine                      the caller's requests (not withdrawn)
#   POST action=create   trip, from_date, to_date, places, km, fuel,
#                        fuel_cost, tolls, suggested, ask
#   POST action=withdraw name             only the rep's own, only while Pending
#   GET  action=queue                     the decider: Pending + last 30 days decided
#   POST action=decide   name, decision (Approve | Reject), amount, note
#
# Decider = the GM seat (Employee.custom_role_profile or User.role_profile_name
# "GM"), System Manager, Administrator. A rejection needs a note (the rep sees it).
# Each response says `decider` so the app knows whether to show the GM's tab.

APPROVER_SEATS = ["GM"]
ADMIN_ROLES = ["System Manager"]
COLS = ["name", "employee", "employee_name", "status", "trip", "from_date", "to_date", "places", "km", "fuel",
        "fuel_cost", "tolls", "suggested", "ask", "approved_amount", "approver", "decided_by", "decided_on",
        "note", "creation"]

fd = frappe.form_dict
action = str(fd.get("action") or "mine")
me = frappe.session.user
if not me or me == "Guest":
    frappe.throw("Please log in", frappe.PermissionError)
emp = frappe.db.get_value("Employee", {"user_id": me, "status": "Active"}, ["name", "employee_name", "custom_role_profile"], as_dict=True)

decider = me == "Administrator"
if not decider and emp and (emp.custom_role_profile or "") in APPROVER_SEATS:
    decider = True
if not decider and (frappe.db.get_value("User", me, "role_profile_name") or "") in APPROVER_SEATS:
    decider = True
if not decider and frappe.db.exists("Has Role", {"parent": me, "parenttype": "User", "role": ["in", ADMIN_ROLES]}):
    decider = True

if action == "mine":
    rows = []
    if emp:
        rows = frappe.get_all("Car Request", filters={"employee": emp.name, "status": ["!=", "Withdrawn"]}, fields=COLS, order_by="from_date desc", limit_page_length=200)
    frappe.response["message"] = {"requests": rows, "decider": decider}

elif action == "create":
    if not emp:
        frappe.throw("No active employee is linked to this login.")
    f = str(fd.get("from_date") or "")[:10]
    t = str(fd.get("to_date") or "")[:10]
    if len(f) != 10 or len(t) != 10 or t < f:
        frappe.throw("Which dates is the car for?")
    ask = frappe.utils.flt(fd.get("ask"))
    if ask <= 0:
        frappe.throw("Say how much you ask for the car.")
    clash = frappe.get_all("Car Request", filters={"employee": emp.name, "status": ["in", ["Pending", "Approved"]], "from_date": ["<=", t], "to_date": [">=", f]}, fields=["name", "status"], limit_page_length=1)
    if clash:
        if clash[0].status == "Approved":
            frappe.throw("The car is already approved for these dates (" + clash[0].name + ").")
        frappe.throw("A car request for these dates is already waiting (" + clash[0].name + ") -- withdraw it to change it.")
    gm = None
    for g in frappe.get_all("Employee", filters={"custom_role_profile": ["in", APPROVER_SEATS], "status": "Active"}, fields=["user_id"], limit_page_length=5):
        if g.user_id and not gm:
            gm = g.user_id
    # the route starts and ends at the rep's own HQ BY NAME (13 Nov 2026): a
    # bare "HQ" stop becomes "Coimbatore (HQ)" -- the seat's territory
    places = str(fd.get("places") or "")[:500]
    home = ""
    if emp.custom_role_profile:
        home = str(frappe.db.get_value("Role Profile", emp.custom_role_profile, "custom_territory") or "").strip()
    if home.upper().startswith("HQ"):
        home = home[2:].lstrip("-· ").strip()
    if home:
        stops = []
        for st in places.split("→"):
            st = st.strip()
            if st.upper() == "HQ":
                st = home + " (HQ)"
            stops.append(st)
        places = " → ".join(stops)[:500]
    fuel = str(fd.get("fuel") or "Petrol")
    if fuel not in ["Petrol", "Diesel", "EV"]:
        fuel = "Petrol"
    doc = frappe.get_doc({
        "doctype": "Car Request",
        "employee": emp.name,
        "status": "Pending",
        "trip": str(fd.get("trip") or "")[:40],
        "from_date": f,
        "to_date": t,
        "places": places,
        "km": frappe.utils.flt(fd.get("km")),
        "fuel": fuel,
        "fuel_cost": frappe.utils.flt(fd.get("fuel_cost")),
        "tolls": frappe.utils.flt(fd.get("tolls")),
        "suggested": frappe.utils.flt(fd.get("suggested")),
        "ask": ask,
        "approver": gm,
    })
    doc.insert(ignore_permissions=True)
    row = frappe.get_all("Car Request", filters={"name": doc.name}, fields=COLS, limit_page_length=1)
    frappe.response["message"] = {"request": row[0] if row else None, "decider": decider}

elif action == "withdraw":
    name = str(fd.get("name") or "")
    row = frappe.db.get_value("Car Request", name, ["employee", "status"], as_dict=True) if name else None
    if not row or not emp or row.employee != emp.name:
        frappe.throw("That is not your car request.", frappe.PermissionError)
    if row.status != "Pending":
        frappe.throw("Only a request still waiting can be withdrawn -- this one is " + str(row.status).lower() + ".")
    frappe.db.set_value("Car Request", name, "status", "Withdrawn")
    frappe.response["message"] = {"withdrawn": name}

elif action == "queue":
    if not decider:
        frappe.throw("Car requests are approved by the GM.", frappe.PermissionError)
    pending = frappe.get_all("Car Request", filters={"status": "Pending"}, fields=COLS, order_by="from_date asc", limit_page_length=500)
    recent = frappe.get_all("Car Request", filters={"status": ["in", ["Approved", "Rejected"]], "decided_on": [">=", frappe.utils.add_days(frappe.utils.today(), -30)]}, fields=COLS, order_by="decided_on desc", limit_page_length=100)
    frappe.response["message"] = {"pending": pending, "recent": recent, "decider": True}

elif action == "decide":
    if not decider:
        frappe.throw("Car requests are approved by the GM.", frappe.PermissionError)
    name = str(fd.get("name") or "")
    decision = str(fd.get("decision") or "")
    note = " ".join(str(fd.get("note") or "").split())[:1000]
    row = frappe.db.get_value("Car Request", name, ["status", "ask"], as_dict=True) if name else None
    if not row:
        frappe.throw("No such car request.")
    if row.status != "Pending":
        frappe.throw("This request is already " + str(row.status).lower() + ".")
    if decision == "Approve":
        amount = frappe.utils.flt(fd.get("amount")) or frappe.utils.flt(row.ask)
        if amount <= 0:
            frappe.throw("Say the amount you approve.")
        frappe.db.set_value("Car Request", name, {"status": "Approved", "approved_amount": amount, "decided_by": me, "decided_on": frappe.utils.now(), "note": note})
    elif decision == "Reject":
        if not note:
            frappe.throw("Say why it is rejected.")
        frappe.db.set_value("Car Request", name, {"status": "Rejected", "approved_amount": 0, "decided_by": me, "decided_on": frappe.utils.now(), "note": note})
    else:
        frappe.throw("Approve or Reject?")
    out = frappe.get_all("Car Request", filters={"name": name}, fields=COLS, limit_page_length=1)
    frappe.response["message"] = {"request": out[0] if out else None}

else:
    frappe.throw("Unknown action.")
