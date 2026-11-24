# SYSTEM CONSOLE -- the BE Locality rule for HQ / HQ-EQ on /field-expenses (19 Nov 2026).
# Prod first. Desk > System Console, type Python, as Administrator.
#   1) DRY = True, "Commit" unticked: checks every anchor is found exactly once, changes nothing.
#   2) DRY = False, tick "Commit", Execute. Then open /field-expenses (hard refresh) for a month.
# Safe to re-run: a script already patched (marker "BE Locality rule") is left alone.
# Backups: the old Data API script and the old page JavaScript are saved as private Files attached
# to the Web Page "field-expenses" before anything is written.
#
# THE RULE (agreed with the user 19 Nov 2026, BE only -- other roles unchanged):
#   A BE's day in his own HQ is measured from the centre of his seat's Locality
#   (Role Profile.custom_locality) to the centre of the farthest Locality among the doctors he
#   visited that day (Lead.custom_locality) -- Google road km between the two centres, the same
#   Road Distance store and "Pull road km" button the page already uses.
#   The km only goes UP: if the next 5 km mark is 2.5 km away or less it becomes that mark
#   (22.5 -> 25, 27.5 -> 30, 32.5 -> 35), otherwise it stays (25.1, 27.4, 32.4). Never down.
#   Under 22.5 km = HQ day. 22.5 and over = HQ-EQ: EQ allowance, TA on that km both ways at the
#   per-km rate (the old roundKm is not applied on top).
#   Missing data: until the seat AND every doctor of the day have a Locality with a "Centre of the
#   Area" (Locality.centre, "lat, lng" -- locality_centre_console.py fills it, a hand edit counts
#   too), the day is measured by GPS as before -- it switches by itself
#   once the data is there. Days at another HQ, meetings, tours: unchanged.
#   City guard (the user's choice, 19 Nov 2026): a doctor whose Locality is only the BE's own HQ
#   city ("Chennai" for a Chennai BE) counts as "no area yet" -> that day stays on GPS, until city
#   doctors are given area Localities (Tambaram, Adyar...). Town BEs move to the rule now.
#
# Needs first: role_profile_locality_console.py (seat Localities), doctor_locality_console.py
# (doctor Localities), locality_centre_console.py (centres). The patch itself is harmless without
# them -- every day just stays on GPS.

DRY = True
MARK = "BE Locality rule"

# ---- 1. Server Script "Field Expense - Data API": hand the page the Localities ----
API_EDITS = [
    ["leads: custom_locality",
     '''"custom_latitude_and_longitude", "custom_map_town", "custom_map_town_point"], [], [])''',
     '''"custom_latitude_and_longitude", "custom_map_town", "custom_map_town_point"]
                         + (["custom_locality"] if frappe.get_meta("Lead").has_field("custom_locality") else []), [], [])  # BE Locality rule (2026-11-19)'''],
    ["roleProfiles: custom_locality + localities",
     '''msg["roleProfiles"] = frappe.get_all("Role Profile", fields=["name", "custom_territory", "parent_role_profile", "custom_employee_id", "custom_department"], order_by="name asc", limit_page_length=0)''',
     '''msg["roleProfiles"] = frappe.get_all("Role Profile", fields=["name", "custom_territory", "parent_role_profile", "custom_employee_id", "custom_department"]
                                         + (["custom_locality"] if frappe.get_meta("Role Profile").has_field("custom_locality") else []), order_by="name asc", limit_page_length=0)
    # BE Locality rule (2026-11-19): every Locality's centre, for seat Locality -> doctor Locality km
    msg["localities"] = (frappe.get_all("Locality", fields=["name", "centre"], filters=[["centre", "is", "set"]], limit_page_length=0)
                         if frappe.db.exists("DocType", "Locality") and frappe.get_meta("Locality").has_field("centre") else [])'''],
]

# ---- 2. Web Page "field-expenses": the rule in the page's engine and its screen pass ----
JS_EDITS = [
    # inputs: the seat's Locality, and the Locality centres
    ["seat Locality",
     """return { name: s.name, hq: s.custom_territory, parent: s.parent_role_profile, emp: s.custom_employee_id, dept: s.custom_department };""",
     """return { name: s.name, hq: s.custom_territory, parent: s.parent_role_profile, emp: s.custom_employee_id, dept: s.custom_department, loc: s.custom_locality || null };"""],
    ["Locality centres",
     """roleProfiles: { seats: seats, employeeSeat: eseat }, roadKm: { km: road },""",
     """roleProfiles: { seats: seats, employeeSeat: eseat }, roadKm: { km: road },
          // BE Locality rule (2026-11-19): Locality -> [lat, lng] from its "Centre of the Area" ("13.006700, 80.220600")
          localities: (function () { var o = {}; (b.localities || []).forEach(function (x) { var p = String(x.centre || '').split(','), la = Number(p[0]), lo = Number(p[1]); if (p.length === 2 && isFinite(la) && isFinite(lo) && Math.abs(la) > 1 && Math.abs(lo) > 1) o[x.name] = [la, lo]; }); return o; })(),"""],
    # each visited doctor's Locality, and per day the Localities visited
    ["doctor Locality",
     """      mt: null };""",
     """      mt: null,
      // the doctor's Locality (Lead custom_locality), for the BE Locality rule (2026-11-19)
      loc: l.custom_locality || null };"""],
    ["day Localities",
     """      docs: Object.keys(v.docs).length,""",
     """      docs: Object.keys(v.docs).length,
      // BE Locality rule (2026-11-19): the Localities of the day's doctors, and how many doctors have none
      dlocs: Object.keys(Object.keys(v.docs).reduce((o, d) => { const x = doctorGeo[d] && doctorGeo[d].loc; if (x) o[x] = 1; return o; }, {})),
      dlocMiss: Object.keys(v.docs).filter(d => !(doctorGeo[d] && doctorGeo[d].loc)).length,"""],
    # the measure
    ["beLocKm",
     """  const ALL_ANCH = {};""",
     """  // ---------- BE Locality rule (the owner, 2026-11-19) ----------
  // A BE's day in his own HQ is measured Locality centre to Locality centre: from the centre of
  // his seat's Locality (Role Profile custom_locality) to the centre of the farthest Locality of
  // the doctors he visited (Lead custom_locality), Google's road km between the two centres.
  // The km only ever goes up: 2.5 km or less below the next 5 km mark it becomes that mark
  // (22.5 -> 25, 27.5 -> 30), otherwise it stays (25.1, 32.4). Under 22.5 is an HQ day; 25 and
  // over (after rounding) is HQ-EQ, TA on that km both ways. Until the seat and every doctor of
  // the day have a Locality with a centre, the day is measured by GPS as before.
  // City guard (the owner, 2026-11-19): a doctor whose Locality is only the BE's own HQ city
  // ("Chennai" for a Chennai BE -- the doctor towns came from Mapbox at town level) has no area
  // yet, so that day stays on GPS too until city doctors get area Localities. HQ names and
  // Locality names spell some cities differently, hence the aliases.
  const LOC_C = inp.localities || {};
  const SEAT_LOC = {}, BE_SEAT_HQ = {};
  ((inp.roleProfiles || {}).seats || []).forEach(s => { if (s.loc) SEAT_LOC[s.name] = s.loc; if (s.hq) BE_SEAT_HQ[s.name] = s.hq; });
  const CITY_ALIAS = { bangalore: 'bengaluru', mysore: 'mysuru', trichy: 'tiruchirappalli', tanjore: 'thanjavur',
    cochin: 'kochi', ernakulam: 'kochi', pondicherry: 'puducherry', pondy: 'puducherry', calicut: 'kozhikode',
    mangalore: 'mangaluru', trivandrum: 'thiruvananthapuram', belgaum: 'belagavi', gulbarga: 'kalaburagi',
    vizag: 'visakhapatnam', newdelhi: 'delhi', tuticorin: 'thoothukkudi', thoothukudi: 'thoothukkudi',
    tirupur: 'tiruppur', ooty: 'udhagamandalam', madras: 'chennai' };
  const cityKey = s => { const k = String(s || '').replace(/^HQ\\s*-?\\s*/i, '').toLowerCase().replace(/[^a-z]/g, ''); return CITY_ALIAS[k] || k; };
  const beUp = km => { const n = Math.ceil(Math.round(km * 1000) / 1000 / 5) * 5; return n - km <= 2.5 + 1e-9 ? n : km; };
  function beLocKm(e, v) {
    if (String(e.role || '').toUpperCase() !== 'BE' || !v || !v.n) return null;
    const seat = ((inp.roleProfiles || {}).employeeSeat || {})[e.code];
    const from = seat ? SEAT_LOC[seat] : null;
    const a = from ? LOC_C[from] : null;
    if (!a || !v.dlocs || !v.dlocs.length || v.dlocMiss) return null;
    const beHqCity = {};
    [e.anchorHq, e.hq, seat ? BE_SEAT_HQ[seat] : null].forEach(h => { if (h) beHqCity[cityKey(h)] = 1; });
    let best = 0, to = from, missing = false;
    for (let i = 0; i < v.dlocs.length; i++) {
      const l = v.dlocs[i], b = LOC_C[l];
      if (!b) return null;
      if (beHqCity[cityKey(l)]) return null;   // city guard: the doctor's Locality is only the HQ city
      if (l === from) continue;
      const k = roadKm(a[0], a[1], b[0], b[1]);
      if (k === null) { missing = true; continue; }
      if (k > best) { best = k; to = l; }
    }
    best = Math.round(best * 10) / 10;
    return { raw: best, km: best > 0 ? beUp(best) : 0, from: from, to: to, missing: missing };
  }

  const ALL_ANCH = {};"""],
    # the HQ day takes it in place of the GPS reach
    ["HQ day uses it",
     """          { type: 'HQ', km: km, fare: null, town: null, gps: true, src: undefined, as: undefined });""",
     """          { type: 'HQ', km: km, fare: null, town: null, gps: true, src: undefined, as: undefined });
        // BE Locality rule (2026-11-19): Locality centre to Locality centre replaces the GPS reach
        { const bl = beLocKm(e, v);
          if (bl) {
            km = bl.km; far = Math.round(bl.km / D.roadFactor * 1000) / 1000; reachP = null;
            roadMissing = bl.missing ? true : undefined;
            Object.assign(sf, { km: bl.km, beLoc: bl.raw, beFrom: bl.from, beTo: bl.to });
          } }"""],
    ["row keeps it",
     """fare: sf.fare === undefined ? null : sf.fare, otherHq: sf.otherHq || undefined, gps: sf.gps || undefined,""",
     """fare: sf.fare === undefined ? null : sf.fare, otherHq: sf.otherHq || undefined, gps: sf.gps || undefined,
                    // BE Locality rule (2026-11-19): the km before rounding, and the two Localities
                    beLoc: sf.beLoc, beFrom: sf.beFrom || undefined, beTo: sf.beTo || undefined,"""],
    # build pass pricing
    ["build: fareFor exact",
     """  const fareFor = (e, km) => {
    km = roundKm(km);""",
     """  const fareFor = (e, km, exact) => {
    km = exact ? km : roundKm(km);   // exact: already rounded by the BE Locality rule (2026-11-19)"""],
    ["build: price call",
     """          sf && sf.fare !== null && sf.fare !== undefined ? { fare: sf.fare } : null);""",
     """          sf && sf.fare !== null && sf.fare !== undefined ? { fare: sf.fare } : sf && sf.beLoc !== undefined ? { fare: null, beLoc: true } : null);"""],
    ["build: HQ-EQ TA",
     """    if (dayType === 'HQ' && D.taOnHqDay === false) ta = hqBeyond(e, km);""",
     """    // BE Locality rule (2026-11-19): km already rounded up; 25 and over pays it both ways
    if (dayType === 'HQ' && D.taOnHqDay === false) ta = ex && ex.beLoc ? (km >= D.hqKm ? Math.round(2 * fareFor(e, km, true)) : 0) : hqBeyond(e, km);"""],
    ["build: HQ-EQ band",
     """        if (dayType === 'HQ' && reach > D.hqKm) {   // every role (2026-11-10)""",
     """        if (dayType === 'HQ' && (reach > D.hqKm || (sf && sf.beLoc !== undefined && reach >= D.hqKm))) {   // every role (2026-11-10); BE Locality rule: 25 and over (2026-11-19)"""],
    # screen pass pricing (what is shown and saved to Field Expense Day)
    ["screen: fareFor exact",
     """  function fareFor(e, km) {
    km = roundKm(km);""",
     """  function fareFor(e, km, exact) {
    km = exact ? km : roundKm(km);   // exact: already rounded by the BE Locality rule (2026-11-19)"""],
    ["screen: HQ-EQ TA",
     """      ta = hk > S.hqKm ? 2 * fareFor(e, hk) : 0;""",
     """      var bl = !!(ex && ex.beLoc);   // BE Locality rule (2026-11-19): km already rounded up, 25 and over pays
      ta = hk > S.hqKm || (bl && hk >= S.hqKm) ? 2 * fareFor(e, hk, bl) : 0;"""],
    ["screen: price call",
     """          localKm === null ? null : { localKm: localKm, fare: sfc && sfc.fare !== undefined ? sfc.fare : null }, !!r.oneWay);""",
     """          localKm === null ? null : { localKm: localKm, fare: sfc && sfc.fare !== undefined ? sfc.fare : null, beLoc: !!(sfc && sfc.beLoc !== undefined) }, !!r.oneWay);"""],
    ["screen: HQ-EQ band",
     """        if (dayType === 'HQ' && (localKm || 0) > S.hqKm) {   // every role (2026-11-10)""",
     """        if (dayType === 'HQ' && ((localKm || 0) > S.hqKm || (sfc && sfc.beLoc !== undefined && (localKm || 0) >= S.hqKm))) {   // every role (2026-11-10); BE Locality rule (2026-11-19)"""],
]


def patch(text, edits):
    # -> [new text, problems]; every anchor must be there exactly once
    out = text
    bad = []
    for x in edits:
        n = out.count(x[1])
        if n != 1:
            bad.append(x[0] + ": anchor found " + str(n) + " times")
        else:
            out = out.replace(x[1], x[2])
    return [out, bad]


W = "WOULD " if DRY else ""
api = frappe.get_doc("Server Script", "Field Expense - Data API")
page = frappe.get_doc("Web Page", "field-expenses")
api_src = (api.script or "").replace("\r\n", "\n")
js_src = (page.javascript or "").replace("\r\n", "\n")
todo = []
if MARK in api_src:
    print("ok: Data API already patched")
else:
    r = patch(api_src, API_EDITS)
    if r[1]:
        print("Data API -- NOT patched: " + "; ".join(r[1]))
    else:
        print(W + "patch Data API (" + str(len(API_EDITS)) + " edits)")
        todo.append(["api", r[0]])
if MARK in js_src:
    print("ok: /field-expenses page already patched")
else:
    r = patch(js_src, JS_EDITS)
    if r[1]:
        print("/field-expenses page -- NOT patched: " + "; ".join(r[1]))
    else:
        print(W + "patch /field-expenses page JavaScript (" + str(len(JS_EDITS)) + " edits, " + str(len(js_src)) + " -> " + str(len(r[0])) + " chars)")
        todo.append(["js", r[0]])

if not DRY and todo:
    # "2026-11-19 18:05:33.123" -> "20261119-1805" (no strftime: it imports a module, which safe_exec refuses)
    now = str(frappe.utils.now_datetime())
    stamp = now[0:4] + now[5:7] + now[8:10] + "-" + now[11:13] + now[14:16]
    for t in todo:
        old = api.script if t[0] == "api" else page.javascript
        frappe.get_doc({"doctype": "File", "file_name": ("field-expense-data-api" if t[0] == "api" else "field-expenses-js") + "-before-be-locality-" + stamp + (".py" if t[0] == "api" else ".js"),
                        "attached_to_doctype": "Web Page", "attached_to_name": "field-expenses", "is_private": 1,
                        "content": old}).insert(ignore_permissions=True)
    for t in todo:
        if t[0] == "api":
            api.script = t[1]
            api.save(ignore_permissions=True)
        else:
            page.javascript = t[1]
            page.save(ignore_permissions=True)
    frappe.db.commit()
    print("done -- backups attached to Web Page field-expenses. Open /field-expenses, hard refresh, pick a month.")
elif DRY:
    print("dry run -- nothing changed.")
