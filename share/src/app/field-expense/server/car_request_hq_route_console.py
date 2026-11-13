# Car requests: the route shows the rep's own HQ by name (13 Nov 2026).
#
# Paste into ERP > System Console (Execute).
#   1. Server Script "Car Request API": a new request's bare "HQ" stops become
#      "<territory> (HQ)" (the seat's Role Profile territory), e.g.
#      "Coimbatore (HQ) -> Madurai -> Bodi -> Coimbatore (HQ)"; the reject
#      message no longer says "the rep sees this".
#   2. The requests already saved get the same route text.
# DRY = True only reports. Set DRY = False to save.

DRY = True

API_SCRIPT = '# Server Script "Car Request API" -- type API, method car_request (12 Nov 2026).\n# A rep asks to go by own car on a trip; the GM approves (the amount may be\n# changed) or rejects. Every action goes through here -- reps have no\n# DocType permission on Car Request, so nobody approves their own car.\n#\n#   GET  action=mine                      the caller\'s requests (not withdrawn)\n#   POST action=create   trip, from_date, to_date, places, km, fuel,\n#                        fuel_cost, tolls, suggested, ask\n#   POST action=withdraw name             only the rep\'s own, only while Pending\n#   GET  action=queue                     the decider: Pending + last 30 days decided\n#   POST action=decide   name, decision (Approve | Reject), amount, note\n#\n# Decider = the GM seat (Employee.custom_role_profile or User.role_profile_name\n# "GM"), System Manager, Administrator. A rejection needs a note (the rep sees it).\n# Each response says `decider` so the app knows whether to show the GM\'s tab.\n\nAPPROVER_SEATS = ["GM"]\nADMIN_ROLES = ["System Manager"]\nCOLS = ["name", "employee", "employee_name", "status", "trip", "from_date", "to_date", "places", "km", "fuel",\n        "fuel_cost", "tolls", "suggested", "ask", "approved_amount", "approver", "decided_by", "decided_on",\n        "note", "creation"]\n\nfd = frappe.form_dict\naction = str(fd.get("action") or "mine")\nme = frappe.session.user\nif not me or me == "Guest":\n    frappe.throw("Please log in", frappe.PermissionError)\nemp = frappe.db.get_value("Employee", {"user_id": me, "status": "Active"}, ["name", "employee_name", "custom_role_profile"], as_dict=True)\n\ndecider = me == "Administrator"\nif not decider and emp and (emp.custom_role_profile or "") in APPROVER_SEATS:\n    decider = True\nif not decider and (frappe.db.get_value("User", me, "role_profile_name") or "") in APPROVER_SEATS:\n    decider = True\nif not decider and frappe.db.exists("Has Role", {"parent": me, "parenttype": "User", "role": ["in", ADMIN_ROLES]}):\n    decider = True\n\nif action == "mine":\n    rows = []\n    if emp:\n        rows = frappe.get_all("Car Request", filters={"employee": emp.name, "status": ["!=", "Withdrawn"]}, fields=COLS, order_by="from_date desc", limit_page_length=200)\n    frappe.response["message"] = {"requests": rows, "decider": decider}\n\nelif action == "create":\n    if not emp:\n        frappe.throw("No active employee is linked to this login.")\n    f = str(fd.get("from_date") or "")[:10]\n    t = str(fd.get("to_date") or "")[:10]\n    if len(f) != 10 or len(t) != 10 or t < f:\n        frappe.throw("Which dates is the car for?")\n    ask = frappe.utils.flt(fd.get("ask"))\n    if ask <= 0:\n        frappe.throw("Say how much you ask for the car.")\n    clash = frappe.get_all("Car Request", filters={"employee": emp.name, "status": ["in", ["Pending", "Approved"]], "from_date": ["<=", t], "to_date": [">=", f]}, fields=["name", "status"], limit_page_length=1)\n    if clash:\n        if clash[0].status == "Approved":\n            frappe.throw("The car is already approved for these dates (" + clash[0].name + ").")\n        frappe.throw("A car request for these dates is already waiting (" + clash[0].name + ") -- withdraw it to change it.")\n    gm = None\n    for g in frappe.get_all("Employee", filters={"custom_role_profile": ["in", APPROVER_SEATS], "status": "Active"}, fields=["user_id"], limit_page_length=5):\n        if g.user_id and not gm:\n            gm = g.user_id\n    # the route starts and ends at the rep\'s own HQ BY NAME (13 Nov 2026): a\n    # bare "HQ" stop becomes "Coimbatore (HQ)" -- the seat\'s territory\n    places = str(fd.get("places") or "")[:500]\n    home = ""\n    if emp.custom_role_profile:\n        home = str(frappe.db.get_value("Role Profile", emp.custom_role_profile, "custom_territory") or "").strip()\n    if home.upper().startswith("HQ"):\n        home = home[2:].lstrip("-· ").strip()\n    if home:\n        stops = []\n        for st in places.split("→"):\n            st = st.strip()\n            if st.upper() == "HQ":\n                st = home + " (HQ)"\n            stops.append(st)\n        places = " → ".join(stops)[:500]\n    fuel = str(fd.get("fuel") or "Petrol")\n    if fuel not in ["Petrol", "Diesel", "EV"]:\n        fuel = "Petrol"\n    doc = frappe.get_doc({\n        "doctype": "Car Request",\n        "employee": emp.name,\n        "status": "Pending",\n        "trip": str(fd.get("trip") or "")[:40],\n        "from_date": f,\n        "to_date": t,\n        "places": places,\n        "km": frappe.utils.flt(fd.get("km")),\n        "fuel": fuel,\n        "fuel_cost": frappe.utils.flt(fd.get("fuel_cost")),\n        "tolls": frappe.utils.flt(fd.get("tolls")),\n        "suggested": frappe.utils.flt(fd.get("suggested")),\n        "ask": ask,\n        "approver": gm,\n    })\n    doc.insert(ignore_permissions=True)\n    row = frappe.get_all("Car Request", filters={"name": doc.name}, fields=COLS, limit_page_length=1)\n    frappe.response["message"] = {"request": row[0] if row else None, "decider": decider}\n\nelif action == "withdraw":\n    name = str(fd.get("name") or "")\n    row = frappe.db.get_value("Car Request", name, ["employee", "status"], as_dict=True) if name else None\n    if not row or not emp or row.employee != emp.name:\n        frappe.throw("That is not your car request.", frappe.PermissionError)\n    if row.status != "Pending":\n        frappe.throw("Only a request still waiting can be withdrawn -- this one is " + str(row.status).lower() + ".")\n    frappe.db.set_value("Car Request", name, "status", "Withdrawn")\n    frappe.response["message"] = {"withdrawn": name}\n\nelif action == "queue":\n    if not decider:\n        frappe.throw("Car requests are approved by the GM.", frappe.PermissionError)\n    pending = frappe.get_all("Car Request", filters={"status": "Pending"}, fields=COLS, order_by="from_date asc", limit_page_length=500)\n    recent = frappe.get_all("Car Request", filters={"status": ["in", ["Approved", "Rejected"]], "decided_on": [">=", frappe.utils.add_days(frappe.utils.today(), -30)]}, fields=COLS, order_by="decided_on desc", limit_page_length=100)\n    frappe.response["message"] = {"pending": pending, "recent": recent, "decider": True}\n\nelif action == "decide":\n    if not decider:\n        frappe.throw("Car requests are approved by the GM.", frappe.PermissionError)\n    name = str(fd.get("name") or "")\n    decision = str(fd.get("decision") or "")\n    note = " ".join(str(fd.get("note") or "").split())[:1000]\n    row = frappe.db.get_value("Car Request", name, ["status", "ask"], as_dict=True) if name else None\n    if not row:\n        frappe.throw("No such car request.")\n    if row.status != "Pending":\n        frappe.throw("This request is already " + str(row.status).lower() + ".")\n    if decision == "Approve":\n        amount = frappe.utils.flt(fd.get("amount")) or frappe.utils.flt(row.ask)\n        if amount <= 0:\n            frappe.throw("Say the amount you approve.")\n        frappe.db.set_value("Car Request", name, {"status": "Approved", "approved_amount": amount, "decided_by": me, "decided_on": frappe.utils.now(), "note": note})\n    elif decision == "Reject":\n        if not note:\n            frappe.throw("Say why it is rejected.")\n        frappe.db.set_value("Car Request", name, {"status": "Rejected", "approved_amount": 0, "decided_by": me, "decided_on": frappe.utils.now(), "note": note})\n    else:\n        frappe.throw("Approve or Reject?")\n    out = frappe.get_all("Car Request", filters={"name": name}, fields=COLS, limit_page_length=1)\n    frappe.response["message"] = {"request": out[0] if out else None}\n\nelse:\n    frappe.throw("Unknown action.")\n'

ss = frappe.get_doc("Server Script", "Car Request API")
if ss.script.replace("\r\n", "\n") == API_SCRIPT:
    print("ok: Server Script Car Request API is current")
else:
    print(("would update" if DRY else "update") + " Server Script Car Request API")
    if not DRY:
        ss.script = API_SCRIPT
        ss.save()

ARROW = "→"
fixed = 0
for r in frappe.get_all("Car Request", fields=["name", "employee", "places"], limit_page_length=0):
    places = str(r.places or "")
    seat = frappe.db.get_value("Employee", r.employee, "custom_role_profile")
    home = str(frappe.db.get_value("Role Profile", seat, "custom_territory") or "").strip() if seat else ""
    if home.upper().startswith("HQ"):
        home = home[2:].lstrip("-· ").strip()
    if not home:
        continue
    stops = []
    for st in places.split(ARROW):
        st = st.strip()
        if st.upper() == "HQ":
            st = home + " (HQ)"
        stops.append(st)
    new = (" " + ARROW + " ").join(stops)
    if new != places:
        fixed += 1
        print(r.name + ": " + places + "  ->  " + new)
        if not DRY:
            frappe.db.set_value("Car Request", r.name, "places", new[:500], update_modified=False)

if not DRY:
    frappe.db.commit()
print(str(fixed) + " request route(s) " + ("to fix" if DRY else "fixed") + (" -- DRY RUN: set DRY = False and run again" if DRY else ""))
