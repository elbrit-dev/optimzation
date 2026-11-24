# SYSTEM CONSOLE -- city doctors get their real area as Locality, from their own map point (19 Nov 2026).
# ~9,550 active doctors carry only a big city as Locality ("Chennai", "Bengaluru"...) because their
# Localities came from Mapbox town names. Each of them has his own map point (custom_latitude /
# custom_longitude): Google says which area that point is in (Tambaram, Adyar, Koramangala...), and the
# doctor is linked to that area's Locality -- an existing one, or a new one with its Google centre.
# The BE / manager Locality rules on /field-expenses then measure to the area, not the city centre.
# Prod. Desk > System Console, type Python, as Administrator.
#   1) DRY = True, "Commit" unticked: asks Google for DRY_SAMPLE points only and prints what it got.
#   2) DRY = False, tick "Commit", Execute. The FIRST real run only adds the field and stops (adding a
#      column to Lead takes a while). Then Execute again and again until "left: 0" -- LIMIT points a run.
#   Then open /field-expenses and click "Pull road km" (new centre-to-centre pairs).
# Safe to re-run: a doctor already handled (Lead "Locality from map point" ticked) is never asked again.
#
#   1. Lead.custom_locality_split -- "Locality from map point" (Check, read only): ticked on every doctor
#      this script has looked at, moved or not. doctor_locality_console.py skips ticked doctors, so a
#      re-run of it never puts them back to the city.
#   2. Doctors: Active, Locality in CITY_LOCS, not ticked, with a map point in India. Grouped by point
#      (3 decimals, ~110 m) so doctors standing at one spot cost one Google call.
#   3. Google Geocoding (reverse), the key in API Settings: the area of the point, in this order --
#      sublocality_level_1 (Adyar, T. Nagar), a locality that is not the city itself (Avadi, Tambaram),
#      sublocality_level_2, neighborhood. Only the city again -> the doctor keeps the city (ticked).
#   4. The area -> a Locality: an existing one with the same name whose centre is within MATCH_KM of
#      the doctor (Anna Nagar Chennai vs Anna Nagar Madurai is told apart by that); else a new Locality
#      named after the area (" - <district>" added only when the name is already taken -- and then kept
#      in the name too: the database keeps locality_name unique), City = the
#      district, Centre of the Area = Google's centre of that area, Google Match "from doctors' points".
# safe_exec: no import, no tuple unpacking, no underscore names; defs read no top-level names.

DRY = True
CITY_LOCS = ["Chennai", "Bengaluru", "Hyderabad", "Coimbatore", "Madurai", "Jaipur", "Salem",
             "Tiruchirappalli", "Mysuru", "Kochi"]
LIMIT = 400          # Google calls (points) per run
DRY_SAMPLE = 15      # Google calls in a dry run
MATCH_KM = 12        # an existing Locality of the same name counts only this close to the doctor
TWIN_KM = 2          # a spelling twin (Vidyadhar / Vidhyadhar Nagar) is reused only this close
SHOW = 25


def km_between(a1, o1, a2, o2):
    def cos(x):
        return 1 - x * x / 2 + x ** 4 / 24 - x ** 6 / 720
    lat = (a1 + a2) / 2 * 3.14159265 / 180
    dy = (a2 - a1) * 111.32
    dx = (o2 - o1) * 111.32 * cos(lat)
    return (dx * dx + dy * dy) ** 0.5


def norm(s):
    return "".join([c for c in str(s or "").lower() if c.isalnum()])


def skel(s):
    # the spelling skeleton: no vowels, no h, no doubled letters -- "Vidhyadhar Nagar" and Google's
    # "Vidyadhar Nagar" both -> "vdydrngr"; "Seelanayakkanpatti" / "Seelanaickenpatti" stay apart
    # on "y" vs "c", so the 2 km + first-3-letters test below catches those
    out = ""
    for c in norm(s):
        if c in "aeiouh":
            continue
        if out and out[-1] == c:
            continue
        out = out + c
    return out


def area_of(out, city_keys):
    # Google reverse answer -> [area name, type, district, lat, lng, address] or None (only the city)
    res = (out or {}).get("results") or []
    def comp(r, t):
        for c in r.get("address_components") or []:
            if t in (c.get("types") or []):
                return c.get("long_name") or ""
        return ""
    for want in ["sublocality_level_1", "locality", "sublocality_level_2", "neighborhood"]:
        for r in res:
            if want not in (r.get("types") or []):
                continue
            nm = comp(r, want)
            if not nm or norm(nm) in city_keys:
                continue
            loc = (r.get("geometry") or {}).get("location") or {}
            dist = comp(r, "administrative_area_level_3") or comp(r, "administrative_area_level_2")
            return [nm, want, dist, loc.get("lat"), loc.get("lng"), r.get("formatted_address") or ""]
    return None


W = "WOULD " if DRY else ""
FIELD = "custom_locality_split"

# 1. the field -- on its own run
has_field = frappe.get_meta("Lead").has_field(FIELD)
if not has_field:
    print(W + "add field Lead." + FIELD + " (Check \"Locality from map point\", read only, after Locality)")
    if not DRY:
        frappe.get_doc({"doctype": "Custom Field", "dt": "Lead", "fieldname": FIELD, "label": "Locality from map point",
                        "fieldtype": "Check", "read_only": 1, "insert_after": "custom_locality", "default": "0",
                        "description": "Ticked by city_doctor_area_console.py: the Locality was set from the doctor's own map point."}
                       ).insert(ignore_permissions=True)
        frappe.db.commit()
        print("field added -- Execute again (Commit ticked) to start on the doctors.")
else:
    print("ok: Lead." + FIELD + " exists")

if has_field or DRY:
    # 2. the doctors, grouped by point
    city_keys = {}
    for c in CITY_LOCS:
        city_keys[norm(c)] = 1
    for x in ["bangalore", "mysore", "trichy", "cochin", "ernakulam", "secunderabad"]:
        city_keys[x] = 1
    cond = " and ifnull(l." + FIELD + ", 0) = 0" if has_field else ""
    docs = frappe.db.sql("""select l.name, l.custom_locality, l.custom_latitude, l.custom_longitude from `tabLead` l
        where l.status = 'Active' and l.custom_locality in %(c)s and l.custom_latitude between 5 and 38
          and l.custom_longitude between 66 and 98""" + cond, {"c": CITY_LOCS}, as_dict=True)
    pts = {}
    order = []
    for d in docs:
        k = "%.3f,%.3f" % (float(d.custom_latitude), float(d.custom_longitude))
        if k not in pts:
            pts[k] = []
            order.append(k)
        pts[k].append(d)
    by_city = {}
    for d in docs:
        by_city[d.custom_locality] = (by_city.get(d.custom_locality) or 0) + 1
    print(str(len(docs)) + " city doctors to do, at " + str(len(order)) + " points | "
          + ", ".join([c + " " + str(by_city[c]) for c in CITY_LOCS if by_city.get(c)]))

    # the Localities there are, to match an area to
    locs = {}
    for r in frappe.db.sql("""select name, locality_name, centre from `tabLocality`""", as_dict=True):
        p = str(r.centre or "").split(",")
        c = None
        if len(p) == 2:
            try:
                c = [float(p[0]), float(p[1])]
            except Exception:
                c = None
        # keyed by the area name without its " - <district>" ("Shastri Nagar - Jaipur" -> Shastri Nagar),
        # so a later run finds it again instead of making a second one
        locs.setdefault(norm(str(r.locality_name or r.name).split(" - ")[0]), []).append([r.name, c])
    # a new Locality's ID and its locality_name must both be free (the database keeps locality_name unique)
    taken = {}
    for r in frappe.db.sql("""select name, locality_name from `tabLocality`""", as_dict=True):
        taken[r.name] = 1
        if r.locality_name:
            taken[r.locality_name] = 1

    # 3. Google
    key = frappe.get_doc("API Settings").get_password("google_maps_api_key", raise_exception=False)
    if not key:
        frappe.throw("No google_maps_api_key in API Settings")
    batch = order[:DRY_SAMPLE] if DRY else order[:LIMIT]
    moved = {}
    created = []
    kept = 0
    done_docs = 0
    stopped = None
    shown = 0
    for k in batch:
        la = float(k.split(",")[0])
        lo = float(k.split(",")[1])
        try:
            out = frappe.make_get_request("https://maps.googleapis.com/maps/api/geocode/json", params={
                "latlng": k, "result_type": "sublocality_level_1|sublocality|neighborhood|locality", "key": key})
        except Exception as ex:
            stopped = "Google call failed: " + str(ex)[:200]
            break
        st = (out or {}).get("status")
        if st not in ["OK", "ZERO_RESULTS"]:
            stopped = "Google said " + str(st) + ": " + str((out or {}).get("error_message") or "")[:200]
            break
        a = area_of(out, city_keys) if st == "OK" else None
        target = None
        if a:
            # an existing Locality of that name near the doctor, else a new one
            best = None
            for c in locs.get(norm(a[0])) or []:
                if c[1]:
                    dk = km_between(la, lo, c[1][0], c[1][1])
                    if dk <= MATCH_KM and (best is None or dk < best[1]):
                        best = [c[0], dk]
            if not best:
                # a spelling twin of an existing Locality, close by: Google's "Vidyadhar Nagar" is the
                # BE sheet's "Vidhyadhar Nagar" -- same skeleton within TWIN_KM, or the same first 3
                # letters within TWIN_KM (Seelanaickenpatti / Seelanayakkanpatti)
                sk = skel(a[0])
                n3 = norm(a[0])[:3]
                for kk in locs:
                    for c in locs[kk]:
                        if not c[1] or not (skel(kk) == sk or kk[:3] == n3):
                            continue
                        dk = km_between(la, lo, c[1][0], c[1][1])
                        if dk <= TWIN_KM and (best is None or dk < best[1]):
                            best = [c[0], dk]
            if best:
                target = best[0]
            else:
                nid = a[0] if a[0] not in taken else a[0] + " - " + (a[2] or pts[k][0].custom_locality)
                n2 = 2
                while nid in taken:
                    nid = a[0] + " - " + (a[2] or pts[k][0].custom_locality) + " " + str(n2)
                    n2 = n2 + 1
                target = nid
                taken[nid] = 1
                cen = [a[3], a[4]] if a[3] and a[4] else [la, lo]
                locs.setdefault(norm(a[0]), []).append([nid, cen])
                created.append(nid + "  (" + (a[2] or "?") + ", " + a[1] + ")")
                if not DRY:
                    frappe.get_doc({"doctype": "Locality", "locality_name": nid, "city": a[2] or pts[k][0].custom_locality,
                                    "centre": "%.6f, %.6f" % (cen[0], cen[1]), "geo_address": a[5][:140],
                                    "geo_match": ("google: " + a[1] + " (from doctors' map points)")[:140]}
                                   ).insert(ignore_permissions=True, set_name=nid)
                    # the name stays as it is ("Shastri Nagar - Jaipur"): the database keeps
                    # locality_name unique, so the plain name cannot be put back when it is taken
        for d in pts[k]:
            if target and target != d.custom_locality:
                moved[d.custom_locality + " -> " + target] = (moved.get(d.custom_locality + " -> " + target) or 0) + 1
            else:
                kept = kept + 1
            if not DRY:
                upd = {FIELD: 1}
                if target and target != d.custom_locality:
                    upd["custom_locality"] = target
                frappe.db.set_value("Lead", d.name, upd, update_modified=False)
            done_docs = done_docs + 1
        if DRY and shown < DRY_SAMPLE:
            print("   " + k + "  " + str(len(pts[k])) + " dr  " + pts[k][0].custom_locality + " -> "
                  + (target or "(stays, Google gave only the city)") + ("" if not a else "   [" + a[1] + ": " + a[5][:70] + "]"))
            shown = shown + 1
        if not DRY and done_docs % 200 < len(pts[k]):
            frappe.db.commit()

    if stopped:
        print("STOPPED -- " + stopped)
    print(W + "doctors done: " + str(done_docs) + " | moved to an area: " + str(done_docs - kept)
          + " | kept the city: " + str(kept) + " | new Localities: " + str(len(created)))
    top = sorted(moved.keys(), key=lambda x: -moved[x])
    for x in top[:SHOW]:
        print("   " + str(moved[x]).rjust(4) + "  " + x)
    if len(top) > SHOW:
        print("   ... " + str(len(top) - SHOW) + " more areas")
    for x in created[:SHOW]:
        print("   new Locality: " + x)
    if len(created) > SHOW:
        print("   ... " + str(len(created) - SHOW) + " more new Localities")
    if DRY:
        print("dry run -- nothing changed (" + str(len(batch)) + " sample Google calls).")
    else:
        frappe.db.commit()
        left = len(order) - len(batch) if not stopped else len(order) - batch.index(k)
        print("points left: " + str(left) + ("  -- Execute again" if left > 0 else "  -- all city doctors done. Then Pull road km on /field-expenses."))
