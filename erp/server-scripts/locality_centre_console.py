# SYSTEM CONSOLE -- every Locality gets its "Centre of the Area" (lat, lng) from Google (19 Nov 2026).
# The new BE HQ / HQ-EQ rule measures BE seat Locality centre -> doctor Locality centre, so each of
# the ~803 Localities needs one point. Prod first. Desk > System Console, type Python, as Administrator.
#   1) DRY = True, "Commit" unticked: adds nothing, asks Google for DRY_SAMPLE Localities only and
#      prints what it got -- to see the key works and the answers look right before paying for all.
#   2) DRY = False, tick "Commit", Execute. Up to LIMIT Localities a run; Execute again until "left: 0".
# Safe to re-run: a Locality whose Centre of the Area is already filled is never asked again, so
# a centre corrected by hand stays.
#
#   1. DocType Locality: new field "Centre of the Area" (centre) -- one text field "lat, lng",
#      e.g. "13.006700, 80.220600", the same form Google Maps copies on a right-click, so a bad
#      centre is fixed with one paste. Plus Google Address and Google Match (read only: what
#      Google matched, to spot a wrong hit).
#   2. Google Geocoding API with the key in API Settings (google_maps_api_key, the key the road-km
#      pull uses), then the older key in Field Expense Settings. Google refuses a key whose Cloud
#      project has no "Geocoding API" switched on (REQUEST_DENIED, as on 19 Nov 2026) -- then, with
#      SOURCE = "auto", Mapbox (the token in the Doctor Address server script, the same one the
#      Map Town Fill job uses). Asked "<name>, <city>, India", India only. The point an area comes
#      back with is its centre. Google Match says which source answered.
#   3. Checks, printed (nothing is refused):
#      CITY ONLY  Google knew only the district/city, not the area -> the city's centre is kept
#                 (the user, 19 Nov 2026); a better point can still be typed in by hand.
#      NOT FOUND  Google has no such area -> asked again for its city, and the city's centre is
#                 kept (Google Match "CITY (area not found)"); left empty only if the city is unknown too.
#      FAR        the centre is more than CHECK_KM from the middle of the doctors mapped to that
#                 Locality -- maybe a same-named place elsewhere; check it.
#   Order: the Localities on BE seats (Role Profile.custom_locality) first, then the doctor towns by
#   how many doctors they hold.
# safe_exec: no import, no tuple unpacking, no underscore names; defs read no top-level names.

DRY = True
REDO = True        # 19 Nov 2026: ask Google again for the Localities a first run filled from Mapbox (Google
                   # was still switching on) or flagged FAR -- Google only, no Mapbox. Finished when it
                   # prints "left: 0"; then set False (a normal run only fills empty centres).
SOURCE = "auto"    # "auto": Google (API Settings key, then the Field Expense Settings key), and if Google
                   # refuses both, Mapbox (the token in the Doctor Address server script). Or "google" / "mapbox".
LIMIT = 300        # lookups per run (one per Locality)
DRY_SAMPLE = 10    # lookups in a dry run
CHECK_KM = 15      # flag a centre this far from its own doctors' middle
DOC_MIDDLE_KM = 25 # farther than this from its own doctors' middle (3+ doctors): a wrong place of the same
                   # name (Bilaspur in Chhattisgarh for a southern Bilaspur) -> the doctors' middle is used

NEW_FIELDS = [
    {"fieldname": "centre", "label": "Centre of the Area", "fieldtype": "Data", "in_list_view": 1,
     "description": "lat, lng -- e.g. 13.006700, 80.220600. To fix one: right-click the spot on Google Maps, click the numbers to copy, paste here."},
    {"fieldname": "geo_address", "label": "Google Address", "fieldtype": "Data", "read_only": 1},
    {"fieldname": "geo_match", "label": "Google Match", "fieldtype": "Data", "read_only": 1, "in_standard_filter": 1},
]
GOOD_TYPES = ["sublocality", "sublocality_level_1", "sublocality_level_2", "sublocality_level_3", "neighborhood",
              "locality", "colloquial_area", "premise", "point_of_interest", "establishment", "route",
              "postal_code", "administrative_area_level_4", "administrative_area_level_5"]


def km_between(a1, o1, a2, o2):
    # straight-line km, flat-earth (fine below 100 km); cos from its series -- no math module
    def cos(x):
        return 1 - x * x / 2 + x ** 4 / 24 - x ** 6 / 720
    lat = (a1 + a2) / 2 * 3.14159265 / 180
    dy = (a2 - a1) * 111.32
    dx = (o2 - o1) * 111.32 * cos(lat)
    return (dx * dx + dy * dy) ** 0.5


def geocode(src, q, key, tok):
    # one lookup -> {"st": "OK" | "NONE" | "DENIED" | "ERR", "lat", "lng", "types", "addr", "partial", "msg"}
    if src == "google":
        try:
            out = frappe.make_get_request("https://maps.googleapis.com/maps/api/geocode/json",
                                          params={"address": q, "components": "country:IN", "key": key})
        except Exception as ex:
            return {"st": "ERR", "msg": "Google call failed: " + str(ex)[:200]}
        st = (out or {}).get("status")
        if st == "ZERO_RESULTS":
            return {"st": "NONE"}
        if st == "REQUEST_DENIED":
            return {"st": "DENIED", "msg": str((out or {}).get("error_message") or "")[:200]}
        if st != "OK":
            return {"st": "ERR", "msg": "Google said " + str(st) + ": " + str((out or {}).get("error_message") or "")[:200]}
        g = out["results"][0]
        ac = g.get("address_components") or [{}]
        return {"st": "OK", "lat": g["geometry"]["location"]["lat"], "lng": g["geometry"]["location"]["lng"],
                "types": g.get("types") or [], "addr": g.get("formatted_address") or "", "partial": bool(g.get("partial_match")),
                "text": ac[0].get("long_name") or ""}
    # Mapbox: the search text goes in the path, so it is percent-encoded here
    enc = ""
    for c in q:
        enc = enc + (c if (c.isalnum() and ord(c) < 128) or c in "-_.~" else "%%%02X" % ord(c))
    try:
        out = frappe.make_get_request("https://api.mapbox.com/geocoding/v5/mapbox.places/" + enc
                                      + ".json?country=in&limit=1&types=neighborhood,locality,place,district&access_token=" + tok)
    except Exception as ex:
        return {"st": "ERR", "msg": "Mapbox call failed: " + str(ex)[:200]}
    f = (out or {}).get("features") or []
    if not f:
        return {"st": "NONE"}
    c0 = f[0].get("center") or [0, 0]
    return {"st": "OK", "lat": c0[1], "lng": c0[0], "types": f[0].get("place_type") or [],
            "addr": f[0].get("place_name") or "", "partial": False, "text": f[0].get("text") or ""}


def median(xs):
    s = sorted(xs)
    n = len(s)
    if not n:
        return None
    if n % 2:
        return s[n // 2]
    return (s[n // 2 - 1] + s[n // 2]) / 2


if not frappe.db.exists("DocType", "Locality"):
    frappe.throw("No Locality DocType on this ERP -- run locality_console.py first.")
W = "WOULD " if DRY else ""

# 1. the fields
dt = frappe.get_doc("DocType", "Locality")
have = [f.fieldname for f in dt.fields]
missing = [f for f in NEW_FIELDS if f["fieldname"] not in have]
if missing:
    print(W + "DocType Locality: add " + ", ".join([f["label"] for f in missing]))
    if not DRY:
        for f in missing:
            dt.append("fields", f)
        dt.save(ignore_permissions=True)
        frappe.db.commit()
        have = have + [f["fieldname"] for f in missing]
else:
    print("ok: Locality has Centre of the Area, Google Address, Google Match")
fields_on = "centre" in have

# 2. which Localities, in which order
cols = "name, locality_name, city" + (", centre, geo_match" if fields_on else "")
rows = frappe.db.sql("select " + cols + " from `tabLocality`", as_dict=True)
if REDO and fields_on:
    def far_km(gm):
        # "FAR 22 km: ..." -> 22; anything else -> 0
        if not gm.startswith("FAR "):
            return 0
        n = gm[4:].split(" ")[0]
        return int(n) if n.isdigit() else 0
    todo = [r for r in rows if "mapbox:" in (r.geo_match or "") or far_km(r.geo_match or "") > DOC_MIDDLE_KM]
    print("REDO: " + str(len(todo)) + " Localities filled from Mapbox or flagged FAR -- asked Google again")
else:
    todo = [r for r in rows if not (fields_on and (r.centre or "").strip())]
seat_locs = {}
if frappe.get_meta("Role Profile").has_field("custom_locality"):
    for x in frappe.db.sql("""select custom_locality from `tabRole Profile` where ifnull(custom_locality, '') != ''""", as_dict=True):
        seat_locs[x.custom_locality] = 1
else:
    print("note: Role Profile has no Locality field yet (role_profile_locality_console.py) -- seat areas not put first")
docs = {}
if frappe.get_meta("Lead").has_field("custom_locality"):
    for x in frappe.db.sql("""select custom_locality, custom_latitude, custom_longitude from `tabLead`
            where ifnull(custom_locality, '') != '' and custom_latitude between 5 and 38
              and custom_longitude between 66 and 98""", as_dict=True):
        docs.setdefault(x.custom_locality, []).append([float(x.custom_latitude), float(x.custom_longitude)])
todo.sort(key=lambda r: (0 if r.name in seat_locs else 1, -len(docs.get(r.name, []))))
print(str(len(rows)) + " Localities | centre already set: " + str(len(rows) - len(todo)) + " | to ask Google: " + str(len(todo))
      + " (BE seat Localities among them: " + str(len([r for r in todo if r.name in seat_locs])) + ")")

# 3. Google, or Mapbox
# the Google keys ERPNext holds: API Settings (what the road-km pull uses), then the older one in
# Field Expense Settings -- no server script has a Google key written in it
keys = []
for k in [frappe.get_doc("API Settings").get_password("google_maps_api_key", raise_exception=False),
          frappe.get_doc("Field Expense Settings").get_password("google_api_key", raise_exception=False)]:
    if k and k not in keys:
        keys.append(k)
key = keys[0] if keys else ""
mb_src = frappe.db.get_value("Server Script", "Doctor Address", "script") or ""
mb_i = mb_src.find('MAPBOX_TOKEN = "')
tok = mb_src[mb_i + 16:mb_src.find('"', mb_i + 16)] if mb_i >= 0 else ""
src = "google" if REDO else SOURCE
if src == "auto":
    src = "google" if key else "mapbox"
if src == "google" and not key:
    frappe.throw("No Google key in API Settings or Field Expense Settings")
if src == "mapbox" and not tok:
    frappe.throw("No Mapbox token in the Doctor Address server script")
print("Google keys found: " + str(len(keys)) + " | Mapbox token: " + ("yes" if tok else "no"))
batch = todo[:DRY_SAMPLE] if DRY else todo[:LIMIT]
done = 0
city_only = []
far = []
not_found = []
empty = 0
stopped = None
for r in batch:
    q = (r.locality_name or r.name) + ", " + (r.city + ", " if r.city else "") + "India"
    res = geocode(src, q, key, tok)
    while res["st"] == "DENIED" and src == "google" and keys.index(key) + 1 < len(keys):
        # this key has no Geocoding API: the next Google key ERPNext holds
        print("note: Google key " + str(keys.index(key) + 1) + " refused -- trying key " + str(keys.index(key) + 2))
        key = keys[keys.index(key) + 1]
        res = geocode(src, q, key, tok)
    if res["st"] == "DENIED" and SOURCE == "auto" and tok and not REDO:
        # every Google key refused (Geocoding API not switched on): Mapbox from here on
        print("note: Google refused (" + res.get("msg", "") + ") -- using Mapbox instead")
        src = "mapbox"
        res = geocode(src, q, key, tok)
    fell_back = False
    if res["st"] == "NONE" and r.city:
        fell_back = True
        # the area is unknown: the centre of its city instead (the user, 19 Nov 2026)
        not_found.append(r.name + "  (asked: " + q + ") -> centre of " + r.city)
        res = geocode(src, r.city + ", India", key, tok)
    if res["st"] == "NONE":
        not_found.append(r.name + "  (asked: " + q + ") -> nothing, left empty")
        empty = empty + 1
        if not DRY:
            frappe.db.set_value("Locality", r.name, {"geo_match": "NOT FOUND"}, update_modified=False)
        continue
    if res["st"] != "OK":
        stopped = res.get("msg") or res["st"]
        break
    loc = {"lat": res["lat"], "lng": res["lng"]}
    types = res["types"]
    # a real hit: an area-level type, or a town ("place") that carries the Locality's own name -- a
    # Mapbox "place" called Chennai for Guindy is only the city
    nm = "".join([c for c in (r.locality_name or r.name).lower() if c.isalnum()])
    tx = "".join([c for c in (res.get("text") or "").lower() if c.isalnum()])
    good = len([t for t in types if t in GOOD_TYPES and t != "locality"]) > 0 or \
        ((("locality" in types) or ("place" in types)) and bool(nm) and (tx == nm or tx.startswith(nm) or nm.startswith(tx)) and bool(tx))
    match = src + ": " + (types[0] if types else "?") + (" (partial)" if res["partial"] else "")
    if fell_back:
        match = "CITY (area not found): " + match
    elif not good:
        # Google knew only the city: its centre is kept (the user, 19 Nov 2026), flagged
        match = "CITY ONLY: " + match
        city_only.append(r.name + " -> " + res["addr"])
    d = docs.get(r.name) or []
    off = None
    if len(d) >= 3:
        mid = [median([p[0] for p in d]), median([p[1] for p in d])]
        off = km_between(loc["lat"], loc["lng"], mid[0], mid[1])
        if off > DOC_MIDDLE_KM:
            # a same-named place elsewhere: the middle of the Locality's own doctors instead
            far.append(r.name + " -> " + res["addr"] + " was " + str(int(off)) + " km from its " + str(len(d)) + " doctors -> DOCTORS' MIDDLE used")
            match = "DOCTORS' MIDDLE (" + src + " was " + str(int(off)) + " km off): " + match
            loc = {"lat": mid[0], "lng": mid[1]}
            off = 0
        elif off > CHECK_KM:
            match = "FAR " + str(int(off)) + " km: " + match
            far.append(r.name + " -> " + res["addr"] + " is " + str(int(off)) + " km from its " + str(len(d)) + " doctors")
    done = done + 1
    if DRY or done <= 12:
        print("   " + r.name + " -> " + str(round(loc["lat"], 6)) + ", " + str(round(loc["lng"], 6)) + "  " + match
              + "  | " + res["addr"] + ("" if off is None else "  | doctors' middle " + str(round(off, 1)) + " km off"))
    if not DRY:
        frappe.db.set_value("Locality", r.name, {"centre": "%.6f, %.6f" % (loc["lat"], loc["lng"]),
                            "geo_address": res["addr"][:140], "geo_match": match[:140]},
                            update_modified=False)
        if done % 50 == 0:
            frappe.db.commit()

if stopped:
    print("STOPPED -- " + stopped)
print(W + "set: " + str(done) + " | CITY ONLY: " + str(len(city_only)) + " | FAR: " + str(len(far)) + " | NOT FOUND: " + str(len(not_found)))
for x in city_only:
    print("   CITY ONLY  " + x)
for x in far:
    print("   FAR        " + x)
for x in not_found:
    print("   NOT FOUND  " + x)
if DRY:
    print("dry run -- nothing changed (" + str(len(batch)) + " sample Google calls).")
else:
    frappe.db.commit()
    print("left: " + str(len(todo) - done - empty) + ("  -- Execute again" if len(todo) - done - empty > 0 else ""))
