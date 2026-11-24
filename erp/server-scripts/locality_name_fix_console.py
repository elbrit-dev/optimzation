# SYSTEM CONSOLE -- one-off fix (19 Nov 2026): the three Locality records whose ID carries the district
# got the ID copied into Locality Name on insert. Puts the plain area name back; the ID stays.
# Desk > System Console, type Python, as Administrator. Tick "Commit", Execute. Safe to re-run.

FIX = {
    "Anna Nagar - Chennai": "Anna Nagar",
    "Anna Nagar - Madurai": "Anna Nagar",
    "Kallur - Thrissur": "Kallur",
}
for name in FIX:
    cur = frappe.db.get_value("Locality", name, ["locality_name", "city"], as_dict=True)
    if not cur:
        print("missing: " + name)
    elif cur.locality_name == FIX[name]:
        print("ok: " + name + " -> " + FIX[name] + " (" + str(cur.city) + ")")
    else:
        frappe.db.set_value("Locality", name, "locality_name", FIX[name], update_modified=False)
        print("fixed: " + name + "   Locality Name " + str(cur.locality_name) + " -> " + FIX[name] + "   City " + str(cur.city))
