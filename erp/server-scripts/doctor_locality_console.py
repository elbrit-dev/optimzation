# SYSTEM CONSOLE -- each doctor (Lead) gets its Locality (19 Nov 2026).
# Needs the Locality DocType first (locality_console.py). Run on prod; UAT later, after locality_console there.
#   Desk > System Console, type Python, logged in as Administrator: paste all of this.
#   1) DRY = True, "Commit" unticked: only prints.  2) DRY = False, tick "Commit", Execute.
#   Then Clear Cache once (user menu) -- a new field is unknown to GraphQL until then.
# Safe to re-run (worked out from the data each time): picks up doctors that got a Map Town since.
#
#   1. Custom Field Lead.custom_locality -- "Locality", Link -> Locality, after Map Town Point,
#      filterable in the list.
#   2. A Map Town on the doctors with no Locality record yet (a town Mapbox named after the Locality
#      list was made) -> that Locality is created, so every Map Town has one.
#   3. Every doctor (active and inactive) with a Map Town: custom_locality = the Locality of that name
#      (Locality IDs ARE the Map Town names). Only doctors whose custom_locality is empty or different
#      are written. Doctors with no Map Town are left empty.
#      One UPDATE per town (frappe.db.set_value with a filter), modified left as it is.
#
# IN ROUNDS, so no run times out: the run that adds the field does only that (adding a column to
# Lead takes a while) and stops. Each run after does at most BATCH towns and saves every 25 towns,
# so even a cut-off run keeps what it did. Run again until it says "towns left: 0".

DRY = True
BATCH = 150                 # towns per run; lower it if a run still times out
W = "WOULD " if DRY else ""

if not frappe.db.exists("DocType", "Locality"):
    frappe.throw("No Locality DocType on this ERP -- run locality_console.py first.")

# 1. the field -- on its own run
stop = False
if frappe.db.exists("Custom Field", {"dt": "Lead", "fieldname": "custom_locality"}):
    print("ok: Lead.custom_locality exists")
else:
    print(W + "add field Lead.custom_locality (Link -> Locality, after custom_map_town_point)")
    if not DRY:
        frappe.get_doc({"doctype": "Custom Field", "dt": "Lead", "fieldname": "custom_locality", "label": "Locality",
                        "fieldtype": "Link", "options": "Locality", "insert_after": "custom_map_town_point",
                        "in_standard_filter": 1, "in_list_view": 0}).insert(ignore_permissions=True)
        print("field added -- run this again (Commit ticked) to fill the doctors.")
        stop = True

# 2. + 3. per Map Town: how many doctors, how many already right
# Doctors whose Locality came from their own map point (city_doctor_area_console.py ticks
# "Locality from map point") are left alone, so a re-run never puts them back to the city.
split = frappe.get_meta("Lead").has_field("custom_locality_split")
skip = " and ifnull(custom_locality_split, 0) = 0" if split else ""
towns = frappe.db.sql("""select custom_map_town as town, count(*) as n from `tabLead`
    where ifnull(custom_map_town, '') != ''""" + skip + """ group by custom_map_town order by n desc""", as_dict=True)
has_col = frappe.get_meta("Lead").has_field("custom_locality")
right = {}
if has_col:
    for r in frappe.db.sql("""select custom_map_town as town, count(*) as n from `tabLead`
        where ifnull(custom_map_town, '') != '' and custom_locality = custom_map_town""" + skip + """ group by custom_map_town""", as_dict=True):
        right[r.town] = r.n

new_loc = []
pending = []                # towns with at least one doctor not yet right
todo = 0
total = 0
for t in towns:
    total = total + t.n
    if not frappe.db.exists("Locality", t.town):
        new_loc.append(t.town)
    if (right.get(t.town) or 0) < t.n:
        pending.append(t)
        todo = todo + t.n - (right.get(t.town) or 0)

this_run = pending[:BATCH]
this_docs = 0
for t in this_run:
    this_docs = this_docs + t.n - (right.get(t.town) or 0)

print(str(len(towns)) + " Map Towns on " + str(total) + " doctors | Locality records: " + str(frappe.db.count("Locality")))
print("to do: " + str(todo) + " doctors in " + str(len(pending)) + " towns (" + str(total - todo) + " doctors already right)")
if stop:
    pass
else:
    print(W + "create " + str(len(new_loc)) + " missing Locality records" + ((": " + ", ".join(new_loc[:15])) if new_loc else ""))
    print(W + "this run: " + str(len(this_run)) + " towns, " + str(this_docs) + " doctors"
          + ((" (" + ", ".join([t.town for t in this_run[:6]]) + " ...)") if this_run else ""))
    if not DRY:
        for town in new_loc:
            frappe.get_doc({"doctype": "Locality", "locality_name": town}).insert(ignore_permissions=True)
        frappe.db.commit()
        written = 0
        for t in this_run:
            flt = {"custom_map_town": t.town}
            if split:
                flt["custom_locality_split"] = 0     # never a doctor whose Locality came from his map point
            frappe.db.set_value("Lead", flt, "custom_locality", t.town, update_modified=False)
            written = written + 1
            if written % 25 == 0:
                frappe.db.commit()
        frappe.db.commit()
        print("done -- " + str(written) + " towns written. Towns left: " + str(len(pending) - written)
              + ("  -> run again." if len(pending) > written else "  -> all doctors have their Locality. Press Clear Cache once."))
    else:
        print("dry run -- nothing changed. Rounds needed: about " + str((len(pending) + BATCH - 1) // BATCH if BATCH else 0)
              + (" (+1 for adding the field)" if not has_col else ""))
