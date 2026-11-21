# Field Expense: KAM paid as ABM (11 Nov 2026).
#
# The build maps the designation "Key Account Manager" to the role KAM
# (Field Expense Input "config" > designationToRole), but the rate card
# (TA DA Rate) had no KAM rows, so every KAM day -- HQ, ex-HQ, outstation --
# priced at TA 0 and DA 0. KAMs are on the ABM grade: this copies each zone's
# ABM row to a KAM row (per km, rail class, HQ / ex-HQ / outstation DA), so
# KAMs keep their own label and are priced like ABMs. Then it asks the build
# to re-price REBUILD (the hourly "Field Expense - Build" picks it up; days
# already Claimed are never re-priced).
#
# Paste into ERP > System Console (type Python), logged in as a System Manager.
# 1) DRY = True, "Commit" unticked: only prints.  2) DRY = False, tick Commit.
# Safe to re-run: a zone that already has a KAM row is left as it is.

DRY = True
W = "WOULD " if DRY else ""
REBUILD = "2026-10"          # the month to re-price; "" = none
COPY = ["per_km", "rail_class", "da_hq", "da_hq_eq", "da_eq", "da_eq_eq", "da_os"]

for a in frappe.get_all("TA DA Rate", filters={"role": "ABM"}, fields=["zone"] + COPY, order_by="zone asc", limit_page_length=0):
    if frappe.db.exists("TA DA Rate", {"zone": a.zone, "role": "KAM"}):
        print("ok: " + a.zone + " already has a KAM row")
        continue
    print(W + "add " + a.zone + "-KAM: per km " + str(a.per_km) + ", DA HQ " + str(a.da_hq) + " / ex-HQ " + str(a.da_hq_eq) + " / outstation " + str(a.da_os))
    if not DRY:
        d = {"doctype": "TA DA Rate", "zone": a.zone, "role": "KAM"}
        for f in COPY:
            d[f] = a.get(f)
        frappe.get_doc(d).insert(ignore_permissions=True)

if REBUILD:
    print(W + "ask the build to re-price " + REBUILD + " (next hourly run)")
    if not DRY:
        frappe.db.set_value("Field Expense Settings", "Field Expense Settings", "build_request", REBUILD)

print("done" if not DRY else "DRY RUN: nothing changed. Set DRY = False, tick Commit, run again.")
