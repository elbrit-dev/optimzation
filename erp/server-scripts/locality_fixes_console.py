# SYSTEM CONSOLE -- fixes from the 19 Nov 2026 audit + the user's C1 / C2 answers, on /field-expenses.
# Goes on top of locality_missing_reason_console.py (run that first). Prod. System Console, Python, Administrator.
#   1) DRY = True, "Commit" unticked: checks the anchors.  2) DRY = False, tick "Commit", Execute.
#   Then /field-expenses (Ctrl+Shift+R), October -> "Pull road km & save".
# Safe to re-run (marker "Manager Locality rule, revised"). Backup of the page JavaScript saved first.
#
#   C1  A manager's day is OS by his BE's BASE AREA, not the seat's Territory: a doctor mapped to his BE is
#       an OS doctor when that BE's Locality centre is more than 30 km (straight line) from his HQ centre.
#       The Territory only names the OS HQ for the journey (the BE's Locality when the Territory is his own HQ).
#       (E00811: 10 Jaipur doctors on the Dausa-territory seat with base Mansarovar -> HQ, not OS.)
#   C2  Management: no EQ-EQ for a manager. Not OS and 22.5 km or more -> HQ-EQ (EQ allowance + TA), never
#       the 100% outstation DA.
#   A1  OS day: a doctor nearer his HQ centre than his BE's area there is on the way out or home -- left to
#       the journey, not measured from the far area (E00010 5 Oct 305 km, E00069 23 Oct 119.5 km...). The type
#       follows the km whoever's doctor is farthest (no forced OS-EQ at 10 km).
#   A2  The journey pass re-prices Locality days on the km as it is (no old roundKm; 25 km HQ-EQ no longer 0).
#   A3  The far-day flag (over 100 km) is kept, so flights and the far-day notes still work.
#   A4  "SRBM" is a manager role.
#   A5  A Locality name is no longer looked up in the HQ fare chart (it could wipe the day's local TA).
#   B   Guard: a doctor whose Locality centre is more than 50 km from where that visit was checked in (not a
#       forced check-in) is not trusted -- the day stays on GPS and says "Dr X's Locality Gudur is 515 km from
#       the check-in" (E01123 Gudur 515 km, E01175 Kalaburagi 645 km, Atmakur, Bassi...).
#   Rounding: the 22.5 km cut is taken before rounding to 0.1 (22.46 km stays HQ).

DRY = True
MARK = "Manager Locality rule, revised"

NEW_MGRDAY = """  // ---------- Manager Locality rule, revised (the user, 19 Nov 2026 evening) ----------
  // C1: OS by the BE's base area, not the seat's Territory -- a doctor mapped to his BE is an OS doctor
  // when that BE's Locality centre is more than MGR_OS_KM (straight line) from his HQ centre; the Territory
  // only names the OS HQ. A1: on an OS day a doctor nearer home than his BE's area there is left to the
  // journey, and the type follows the km. C2: no EQ-EQ for a manager -- not OS and past 22.5 km is HQ-EQ.
  // B: a doctor whose Locality centre is more than LOC_FAR_KM from where the visit was checked in is not
  // trusted (the day stays on GPS and says why).
  const MGR_OS_KM = 30, LOC_FAR_KM = 50;
  const crowKm = (a, b) => { const la = (a[0] + b[0]) / 2 * Math.PI / 180, dy = (b[0] - a[0]) * 111.32, dx = (b[1] - a[1]) * 111.32 * Math.cos(la); return Math.sqrt(dx * dx + dy * dy); };
  function mgrDay(e, v) {
    if (!isMgr(e) || !v || !v.n || !v.dmap || !v.dmap.length) return null;
    const under = mgrUnder(e), hc = hqCentreOf(e), own = {};
    [e.anchorHq, e.hq].forEach(h => { if (h) own[cityKey(h)] = 1; });
    if (!hc) { LOC_WHY = 'no Locality for his HQ ' + (e.anchorHq || e.hq || ''); return null; }
    const docs = [];
    for (let i = 0; i < v.dmap.length; i++) {
      const l = v.dmap[i][0], seatsD = v.dmap[i][1] || [], nm = v.dmap[i][2], cp = v.dmap[i][3], b = l ? LOC_C[l] : null;
      if (!b) { LOC_WHY = l ? 'Locality ' + l + ' has no centre' : 'no Locality on ' + locNames(v.dnoLoc || [nm]); return null; }
      if (cp && crowKm(cp, b) > LOC_FAR_KM) { LOC_WHY = (nm || 'a doctor') + "'s Locality " + l + ' is ' + Math.round(crowKm(cp, b)) + ' km from the check-in'; return null; }
      const mine = seatsD.filter(s => under[s]);
      if (mine.length) {
        const wl = mine.filter(s => SEAT_LOC[s] && LOC_C[SEAT_LOC[s]]);
        if (!wl.length) { LOC_WHY = 'seat ' + mine.join(', ') + ' has no Locality (BE of ' + (nm || 'a doctor') + ')'; return null; }
        let pk = null, pick = wl[0];
        wl.forEach(s => { const k = kmBetween(LOC_C[SEAT_LOC[s]], b, SEAT_LOC[s], l); if (k !== null && (pk === null || k < pk)) { pk = k; pick = s; } });
        const sl = SEAT_LOC[pick], away = crowKm(hc.pt, LOC_C[sl]) > MGR_OS_KM, th = hqStrip(BE_SEAT_HQ[pick]);
        docs.push({ kind: away ? 'os' : 'own', km: pk, from: sl, to: l, hq: away ? (th && !own[cityKey(th)] ? th : sl) : null });
      } else {
        docs.push({ kind: 'eq', km: kmBetween(hc.pt, b, hc.name, l), from: hc.name + ' (HQ)', to: l });
      }
    }
    const os = docs.filter(d => d.kind === 'os');
    if (os.length) {
      const areas = [];
      os.forEach(d => { if (areas.indexOf(d.from) < 0) areas.push(d.from); });
      docs.forEach(d => {
        if (d.kind === 'os') return;
        const dt = LOC_C[d.to];
        // A1: nearer home than his BE's area there -- on the way out or home, the journey pays for it
        if (crowKm(hc.pt, dt) <= Math.min.apply(null, areas.map(a => crowKm(LOC_C[a], dt)))) { d.skip = true; return; }
        let pk = null, pf = areas[0];
        areas.forEach(a => { const k = kmBetween(LOC_C[a], dt, a, d.to); if (k !== null && (pk === null || k < pk)) { pk = k; pf = a; } });
        d.km = pk; d.from = pf;
      });
    }
    const live = docs.filter(d => !d.skip);
    const missing = live.some(d => d.km === null);
    let far = null;
    live.forEach(d => { if (d.km !== null && (far === null || d.km > far.km)) far = d; });
    const osHqOf = () => { const o = os.slice().sort((x, y) => (y.km || 0) - (x.km || 0))[0]; return canonHq(far && far.kind === 'os' ? far.hq : o.hq); };
    if (!far) return { type: os.length ? 'OS-HQ' : 'HQ', km: 0, raw: 0, from: null, to: null, otherHq: os.length ? osHqOf() : undefined, missing: true };
    // the 22.5 km cut on the km itself, then 0.1 for show (22.46 stays HQ)
    const raw = Math.round(far.km * 10) / 10, km = far.km > 0 ? Math.round(beUp(far.km) * 10) / 10 : 0;
    if (os.length) return { type: km >= D.hqKm ? 'OS-EQ' : 'OS-HQ', km: km, raw: raw, from: far.from, to: far.to, otherHq: osHqOf(), missing: missing };
    return { type: 'HQ', km: km, raw: raw, from: far.from, to: far.to, otherHq: undefined, missing: missing };
  }

"""

EDITS = [
    ["A: check-in point holder",
     """        forcedList: [], withList: [], visitList: [] };""",
     """        forcedList: [], withList: [], visitList: [], dpt: {} };""", 1],
    ["B: the doctor's own check-in point",
     """      if (usable(la, lo)) v.pts[la + ',' + lo] = 1;""",
     """      if (usable(la, lo)) v.pts[la + ',' + lo] = 1;
      // the doctor's own (not forced) check-in point, to test his Locality against (2026-11-19)
      if (e.custom_doctor && usable(la, lo) && Number(r.custom_is_force_visit) !== 1 && !v.dpt[e.custom_doctor]) v.dpt[e.custom_doctor] = [la, lo];""", 1],
    ["B: points on the day",
     """      dmap: Object.keys(v.docs).map(d => [(doctorGeo[d] && doctorGeo[d].loc) || null, (LEAD_SEATS[d] || []).filter(s => /^BE\\d*-/i.test(s)), docName(d)]),""",
     """      dmap: Object.keys(v.docs).map(d => [(doctorGeo[d] && doctorGeo[d].loc) || null, (LEAD_SEATS[d] || []).filter(s => /^BE\\d*-/i.test(s)), docName(d), v.dpt[d] || null]),
      // per doctor [Locality, check-in point, name] -- a Locality far from the check-in is not trusted (2026-11-19)
      dpts: Object.keys(v.docs).map(d => [(doctorGeo[d] && doctorGeo[d].loc) || null, v.dpt[d] || null, docName(d)]),""", 1],
    ["A4: SRBM",
     """  const MGR_ROLES = { ABM: 1, DRBM: 1, DEPUTYRBM: 1, DYRBM: 1, RBM: 1, SRRBM: 1, SM: 1, ZSM: 1, GM: 1 };""",
     """  const MGR_ROLES = { ABM: 1, DRBM: 1, DEPUTYRBM: 1, DYRBM: 1, RBM: 1, SRRBM: 1, SRBM: 1, SM: 1, ZSM: 1, GM: 1 };""", 1],
    ["A4: SRBM big",
     """  const MGR_BIG = { RBM: 1, SRRBM: 1, SM: 1, ZSM: 1, GM: 1 };""",
     """  const MGR_BIG = { RBM: 1, SRRBM: 1, SRBM: 1, SM: 1, ZSM: 1, GM: 1 };""", 1],
    ["B: BE guard",
     """    if (!v.dlocs || !v.dlocs.length) { LOC_WHY = 'no doctor on the visits'; return null; }""",
     """    if (!v.dlocs || !v.dlocs.length) { LOC_WHY = 'no doctor on the visits'; return null; }
    for (let i = 0; i < (v.dpts || []).length; i++) {
      const x = v.dpts[i], c = x[0] ? LOC_C[x[0]] : null;
      if (c && x[1] && crowKm(x[1], c) > LOC_FAR_KM) { LOC_WHY = (x[2] || 'a doctor') + "'s Locality " + x[0] + ' is ' + Math.round(crowKm(x[1], c)) + ' km from the check-in'; return null; }
    }""", 1],
    ["BE: cut before rounding",
     """    best = Math.round(best * 10) / 10;
    return { raw: best, km: best > 0 ? beUp(best) : 0, from: from, to: to, missing: missing };""",
     """    // the 22.5 km cut on the km itself, then 0.1 for show (22.46 stays HQ)
    return { raw: Math.round(best * 10) / 10, km: best > 0 ? Math.round(beUp(best) * 10) / 10 : 0, from: from, to: to, missing: missing };""", 1],
    ["A5: manager town",
     """                 town: md.to || null, otherHq: md.otherHq || undefined, gps: true,""",
     """                 town: null, otherHq: md.otherHq || undefined, gps: true,   // A5: no fare-chart lookup on a Locality name""", 1],
    ["A3: manager far flag",
     """          xqDay = true; ownArea = undefined; noOs = undefined; farEq = undefined;""",
     """          xqDay = true; ownArea = undefined; noOs = undefined; farEq = md.km > D.eqKm ? true : undefined;   // A3""", 1],
    ["A5: BE town",
     """          sf = { hq: e.anchorHq, type: 'HQ', km: bh.km, fare: null, town: bh.to || null, gps: true,""",
     """          sf = { hq: e.anchorHq, type: 'HQ', km: bh.km, fare: null, town: null, gps: true,   // A5""", 1],
    ["A3: BE far flag",
     """          xqDay = true; ownArea = true; noOs = undefined; farEq = undefined;""",
     """          xqDay = true; ownArea = true; noOs = undefined; farEq = bh.km > D.eqKm ? true : undefined;   // A3""", 1],
    ["A2: journey pass re-price",
     """        (banded ? (r.dayType === 'HQ' && !direct ? hqBeyond(r.daZone ? Object.assign({}, e, { zone: r.daZone }) : e, local) : 0) : Math.round(((r.dayType === 'EQ' || r.dayType === 'OS-EQ' || r.dayType === 'EQ-EQ') && !r.oneWay ? 2 : legs) * (sheetFare !== null ? sheetFare : fareFor(r.daZone ? Object.assign({}, e, { zone: r.daZone }) : e, local))));""",
     """        (banded ? (r.dayType === 'HQ' && !direct ? (r.sfc && r.sfc.beLoc !== undefined ? (local >= D.hqKm ? Math.round(2 * fareFor(r.daZone ? Object.assign({}, e, { zone: r.daZone }) : e, local, true)) : 0) : hqBeyond(r.daZone ? Object.assign({}, e, { zone: r.daZone }) : e, local)) : 0) : Math.round(((r.dayType === 'EQ' || r.dayType === 'OS-EQ' || r.dayType === 'EQ-EQ') && !r.oneWay ? 2 : legs) * (sheetFare !== null ? sheetFare : fareFor(r.daZone ? Object.assign({}, e, { zone: r.daZone }) : e, local, !!(r.sfc && r.sfc.beLoc !== undefined)))));   // A2: Locality days on the km as it is""", 1],
    ["A2: one-way re-price",
     """            pr.taA = (pr.taOut || 0) + Math.round(pf !== null ? pf : fareFor(pr.daZone ? Object.assign({}, e, { zone: pr.daZone }) : e, pk));""",
     """            pr.taA = (pr.taOut || 0) + Math.round(pf !== null ? pf : fareFor(pr.daZone ? Object.assign({}, e, { zone: pr.daZone }) : e, pk, !!(pr.sfc && pr.sfc.beLoc !== undefined)));   // A2""", 1],
]

W = "WOULD " if DRY else ""
page = frappe.get_doc("Web Page", "field-expenses")
js = (page.javascript or "").replace("\r\n", "\n")
new_js = None
if MARK in js:
    print("ok: already patched (Manager Locality rule, revised)")
elif "why a day stayed on GPS" not in js:
    print("NOT patched: run locality_missing_reason_console.py first")
else:
    bad = []
    out = js
    for x in EDITS:
        n = out.count(x[1])
        if n != x[3]:
            bad.append(x[0] + ": anchor found " + str(n) + " times, expected " + str(x[3]))
        else:
            out = out.replace(x[1], x[2])
    # the whole mgrDay function is replaced by the revised one
    s = out.find("  function mgrDay(e, v) {")
    t = out.find("  // why a day stayed on GPS (2026-11-19)", s) if s >= 0 else -1
    if out.count("  function mgrDay(e, v) {") != 1 or t < 0:
        bad.append("mgrDay: function not found exactly once")
    else:
        out = out[:s] + NEW_MGRDAY + out[t:]
    if bad:
        print("NOT patched: " + "; ".join(bad))
    else:
        print(W + "patch /field-expenses page JavaScript (" + str(len(EDITS) + 1) + " edits, " + str(len(js)) + " -> " + str(len(out)) + " chars)")
        new_js = out

if not DRY and new_js:
    now = str(frappe.utils.now_datetime())
    stamp = now[0:4] + now[5:7] + now[8:10] + "-" + now[11:13] + now[14:16]
    frappe.get_doc({"doctype": "File", "file_name": "field-expenses-js-before-locality-fixes-" + stamp + ".js",
                    "attached_to_doctype": "Web Page", "attached_to_name": "field-expenses", "is_private": 1,
                    "content": page.javascript}).insert(ignore_permissions=True)
    page.javascript = new_js
    page.save(ignore_permissions=True)
    frappe.db.commit()
    print("done -- backup attached. Open /field-expenses (Ctrl+Shift+R), October -> Pull road km & save.")
elif DRY:
    print("dry run -- nothing changed.")
