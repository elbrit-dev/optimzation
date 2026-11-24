# SYSTEM CONSOLE -- the right "Centre of the Area" for 7 BE base areas Google could not place by name
# (19 Nov 2026). Points from Google Places, each checked against the middle of that BE's own visit
# check-ins in his HQ. Prod. Desk > System Console, type Python, as Administrator.
#   1) DRY = True, "Commit" unticked: prints old -> new.  2) DRY = False, tick "Commit", Execute.
# Safe to re-run. Can run while city_doctor_area_console.py runs in another tab (it never changes a centre).
#
#   Locality         new centre                 what it is                          vs his work   (old)
#   Vellakoil        10.945907, 77.713126       Vellakoil town (Google)             13.5 km  (was 32.0, a road near Erode)
#   Jayadeva         12.917890, 77.599207       Jayadeva Hospital jn, Bannerghatta   0.1 km  (was  8.3, district point)
#   Mysore Jayadeva  12.342670, 76.629770       Sri Jayadeva Institute, Mysuru       3.7 km  (was Mysuru city centre)
#   GTPT             13.088224, 80.280887       midway George Town / Park Town       3.9 km  (was 10.6, Chennai centre)
#   Jaipur Old City  26.924046, 75.826714       Badi Chaupar / Hawa Mahal            3.2 km  (was Jaipur city point)
#   Fourhouse        11.663540, 78.147591       Four Roads, Salem  -- CONFIRM        2.4 km  ("4 HOUSE's" POI 11.671700, 78.160401 is 3.2)
#   Centre City      17.385832, 78.479427       Koti, Hyderabad    -- CONFIRM        2.3 km  (City Center Mall, Banjara Hills is 5.4)

DRY = True

CENTRES = [
    ["Vellakoil", "10.945907, 77.713126", "Vellakoil town (Google Places)"],
    ["Jayadeva", "12.917890, 77.599207", "Jayadeva Hospital junction, Bannerghatta Rd (Google Places)"],
    ["Mysore Jayadeva", "12.342670, 76.629770", "Sri Jayadeva Institute, Mysuru (Google Places)"],
    ["GTPT", "13.088224, 80.280887", "midway George Town / Park Town, Chennai (Google Places)"],
    ["Jaipur Old City", "26.924046, 75.826714", "Badi Chaupar / Hawa Mahal, Jaipur (Google Places)"],
    ["Fourhouse", "11.663540, 78.147591", "Four Roads, Salem (Google Places)"],
    ["Centre City", "17.385832, 78.479427", "Koti, Hyderabad (Google Places)"],
]

W = "WOULD " if DRY else ""
for c in CENTRES:
    if not frappe.db.exists("Locality", c[0]):
        print("NOT FOUND: Locality " + c[0])
        continue
    old = frappe.db.get_value("Locality", c[0], "centre")
    print(W + "set " + c[0] + ": " + str(old) + " -> " + c[1] + "   (" + c[2] + ")")
    if not DRY:
        frappe.db.set_value("Locality", c[0], {"centre": c[1], "geo_address": c[2][:140],
                            "geo_match": "hand-set 19 Nov 2026: " + c[2][:110]}, update_modified=False)
if not DRY:
    frappe.db.commit()
    print("done -- open /field-expenses and Pull road km (new pairs from these centres).")
else:
    print("dry run -- nothing changed.")
