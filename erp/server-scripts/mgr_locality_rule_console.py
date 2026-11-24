# SYSTEM CONSOLE -- the Locality rule for ABM and above on /field-expenses (19 Nov 2026).
# Goes on top of be_locality_rule_console.py (live since 19 Nov 14:52). Prod first.
# Desk > System Console, type Python, as Administrator.
#   1) DRY = True, "Commit" unticked: checks every anchor, changes nothing.
#   2) DRY = False, tick "Commit", Execute. Then open /field-expenses (hard refresh), Pull road km.
# Safe to re-run: a page already patched (marker "Manager Locality rule") is left alone.
# Backup: the page JavaScript as it was is saved as a private File on the Web Page first.
#
# THE RULE (agreed with the user 19 Nov 2026) for ABM, DRBM, RBM, Sr RBM, SM, ZSM, GM, on a day
# with doctor visits -- the doctors' BE mapping decides the day, not the GPS:
#   Each doctor:
#     mapped to a BE seat UNDER him (ABM / DRBM: his seat tree; RBM and above: his tree + any BE
#     seat of his department; several -> the nearest) -> measured from that BE's Locality centre
#     to the doctor's Locality centre. That BE in another HQ -> an OS doctor; in his own HQ -> own.
#     NOT mapped to a BE under him (another team's BE, or none) -> measured from HIS HQ centre (the
#     Centre of the Area of his HQ city's Locality) to the doctor's Locality centre -> an EQ doctor.
#   The day:
#     any OS doctor -> OS day: farthest is an OS doctor -> under 22.5 km OS-HQ, else OS-EQ;
#       farthest is not (measured from his BE's area there) -> OS-EQ. Journey + OS DA as today.
#     else any doctor 22.5 km or more -> the farthest decides: his BE's doctor -> HQ-EQ, an EQ
#       doctor -> EQ-EQ (TA on that km x 2).
#     else (all under 22.5) any EQ doctor -> EQ-HQ (no fare); else HQ.
#   Same Locality = 0 km; BE rounding (up to the next 5 only within 2.5 km, never down).
#   DA: as today per type, except an in-town EQ-HQ day from this rule pays the EQ-HQ rate row,
#   never the BE/ABM 100% outstation DA (the user, 19 Nov 2026); away days keep the 100%.
#   Stays on GPS (today's method): a doctor with no Locality / centre, a doctor mapped to his BE
#   whose seat has no Locality, and meeting-only days (HQ based as now). BE: its own rule.
#   NO CITY GUARD (the user, 19 Nov 2026), for BE too -- this run also takes it off the live BE
#   rule: a doctor whose Locality is a city ("Chennai") is measured to that city's Google centre,
#   the point Google Maps shows when you search "Chennai" (its Centre of the Area).

DRY = True
MARK = "Manager Locality rule"

JS_EDITS = [
    # per day, each doctor's Locality and the BE seats mapped to him
    ["day doctors' BE seats",
     """      dlocMiss: Object.keys(v.docs).filter(d => !(doctorGeo[d] && doctorGeo[d].loc)).length,""",
     """      dlocMiss: Object.keys(v.docs).filter(d => !(doctorGeo[d] && doctorGeo[d].loc)).length,
      // Manager Locality rule (2026-11-19): per doctor [his Locality, the BE seats mapped to him]
      dmap: Object.keys(v.docs).map(d => [(doctorGeo[d] && doctorGeo[d].loc) || null, (LEAD_SEATS[d] || []).filter(s => /^BE\\d*-/i.test(s))]),""", 1],
    # the rule
    ["manager rule",
     """  const ALL_ANCH = {};""",
     """  // ---------- Manager Locality rule (the owner, 2026-11-19) ----------
  // ABM and above: each doctor visited is an OS doctor (mapped to his BE in another HQ), an own
  // doctor (mapped to his BE in his own HQ) -- both measured from that BE's Locality centre -- or an
  // EQ doctor (not mapped to a BE under him), measured from his HQ city's centre. Any OS doctor
  // makes it an OS day; otherwise the farthest doctor past 22.5 km decides HQ-EQ / EQ-EQ; under
  // that, any EQ doctor makes it EQ-HQ (no fare), else HQ. BE rounding and cut-off.
  const MGR_ROLES = { ABM: 1, DRBM: 1, DEPUTYRBM: 1, DYRBM: 1, RBM: 1, SRRBM: 1, SM: 1, ZSM: 1, GM: 1 };
  const MGR_BIG = { RBM: 1, SRRBM: 1, SM: 1, ZSM: 1, GM: 1 };
  const mgrKey = r => String(r || '').toUpperCase().replace(/[^A-Z]/g, '');
  const isMgr = e => !!MGR_ROLES[mgrKey(e.role)];
  const SEAT_KIDS = {}, BE_SEAT_DEPT = {}, SEAT_DEPT_OF = {};
  ((inp.roleProfiles || {}).seats || []).forEach(s => {
    if (s.parent) (SEAT_KIDS[s.parent] = SEAT_KIDS[s.parent] || []).push(s.name);
    SEAT_DEPT_OF[s.name] = s.dept || null;
    if (/^BE\\d*-/i.test(s.name) && s.dept) BE_SEAT_DEPT[s.name] = s.dept;
  });
  const BE_UNDER = {};
  const mgrUnder = e => {
    if (BE_UNDER[e.code]) return BE_UNDER[e.code];
    const seat = ((inp.roleProfiles || {}).employeeSeat || {})[e.code], m = {};
    if (seat) { const walk = n => (SEAT_KIDS[n] || []).forEach(c => { if (!m[c]) { m[c] = 1; walk(c); } }); walk(seat); }
    // RBM and above also answer for every BE seat of their department (today's OS rule)
    if (MGR_BIG[mgrKey(e.role)]) {
      const dept = (seat && SEAT_DEPT_OF[seat]) || e.department;
      if (dept) Object.keys(BE_SEAT_DEPT).forEach(s => { if (BE_SEAT_DEPT[s] === dept) m[s] = 1; });
    }
    BE_UNDER[e.code] = m;
    return m;
  };
  const LOC_BY_CITY = {};
  Object.keys(LOC_C).forEach(n => { const k = cityKey(n); if (!(k in LOC_BY_CITY)) LOC_BY_CITY[k] = n; });
  // his HQ centre: the Centre of the Area of his HQ city's Locality, else his HQ anchor point
  const hqCentreOf = e => {
    const hs = [e.anchorHq, e.hq];
    for (let i = 0; i < hs.length; i++) { const n = hs[i] ? LOC_BY_CITY[cityKey(hs[i])] : null; if (n && LOC_C[n]) return { name: n, pt: LOC_C[n] }; }
    const a = anchors[e.code];
    return a ? { name: e.anchorHq || 'HQ', pt: [a.lat, a.lng] } : null;
  };
  const hqStrip = h => String(h || '').replace(/^HQ\\s*-?\\s*/i, '').trim();
  const kmBetween = (a, b, la, lb) => la && lb && la === lb ? 0 : roadKm(a[0], a[1], b[0], b[1]);
  function mgrDay(e, v) {
    if (!isMgr(e) || !v || !v.n || !v.dmap || !v.dmap.length) return null;
    const under = mgrUnder(e), hc = hqCentreOf(e), own = {};
    [e.anchorHq, e.hq].forEach(h => { if (h) own[cityKey(h)] = 1; });
    const docs = [];
    for (let i = 0; i < v.dmap.length; i++) {
      const l = v.dmap[i][0], seatsD = v.dmap[i][1] || [], b = l ? LOC_C[l] : null;
      if (!b) return null;                                                     // no Locality / centre: GPS
      // no city guard (the user, 19 Nov 2026): a doctor whose Locality is a city ("Chennai") is
      // measured to that city's Google centre, the point Google Maps shows for "Chennai"
      const mine = seatsD.filter(s => under[s]);
      if (mine.length) {
        const wl = mine.filter(s => SEAT_LOC[s] && LOC_C[SEAT_LOC[s]]);
        if (!wl.length) return null;                                           // his BE has no area yet: GPS
        let pk = null, pick = wl[0];
        wl.forEach(s => { const k = kmBetween(LOC_C[SEAT_LOC[s]], b, SEAT_LOC[s], l); if (k !== null && (pk === null || k < pk)) { pk = k; pick = s; } });
        const hq = hqStrip(BE_SEAT_HQ[pick]);
        docs.push({ kind: hq && !own[cityKey(hq)] ? 'os' : 'own', km: pk, from: SEAT_LOC[pick], to: l, hq: hq });
      } else {
        if (!hc) return null;
        docs.push({ kind: 'eq', km: kmBetween(hc.pt, b, hc.name, l), from: hc.name + ' (HQ)', to: l });
      }
    }
    const os = docs.filter(d => d.kind === 'os');
    if (os.length) {
      // an OS day: the doctors not mapped to his BE there are measured from his BE's area (the nearest)
      const areas = [];
      os.forEach(d => { if (areas.indexOf(d.from) < 0) areas.push(d.from); });
      docs.forEach(d => {
        if (d.kind === 'os') return;
        let pk = null, pf = areas[0];
        areas.forEach(a => { const k = kmBetween(LOC_C[a], LOC_C[d.to], a, d.to); if (k !== null && (pk === null || k < pk)) { pk = k; pf = a; } });
        d.km = pk; d.from = pf;
      });
    }
    const missing = docs.some(d => d.km === null);
    let far = null;
    docs.forEach(d => { if (d.km !== null && (far === null || d.km > far.km)) far = d; });
    if (!far) return { type: os.length ? 'OS-HQ' : 'HQ', km: 0, raw: 0, from: null, to: null,
                       otherHq: os.length ? canonHq(os[0].hq) : undefined, missing: true };
    const raw = Math.round(far.km * 10) / 10, km = raw > 0 ? beUp(raw) : 0;
    let type = 'HQ', otherHq;
    if (os.length) {
      type = far.kind === 'os' ? (km >= D.hqKm ? 'OS-EQ' : 'OS-HQ') : 'OS-EQ';
      const osd = os.slice().sort((x, y) => (y.km || 0) - (x.km || 0))[0];
      otherHq = canonHq(far.kind === 'os' ? far.hq : osd.hq);
    } else if (km >= D.hqKm) {
      type = far.kind === 'eq' ? 'EQ-EQ' : 'HQ';                              // HQ past the band -> HQ-EQ below
      otherHq = far.kind === 'eq' ? far.to : undefined;
    } else if (docs.some(d => d.kind === 'eq')) {
      type = 'EQ-HQ';
      otherHq = e.anchorHq || undefined;
    }
    return { type: type, km: km, raw: raw, from: far.from, to: far.to, otherHq: otherHq, missing: missing };
  }

  const ALL_ANCH = {};""", 1],
    # the day takes it, after the GPS reading (which stays the fallback)
    ["manager override",
     """        ownArea = true;
      }
      // (The one-OS-type collapse of earlier on 2026-11-10 is gone: OS-HQ / OS-EQ are split""",
     """        ownArea = true;
      }
      // Manager Locality rule (2026-11-19): ABM and above on a doctor-visit day with the data -- the
      // doctors' BE mapping decides the day (mgrDay); the GPS reading above is only the fallback
      { const md = mgrDay(e, v);
        if (md) {
          dayType = g = md.type;
          km = md.km; far = Math.round(md.km / D.roadFactor * 1000) / 1000; reachP = null;
          roadMissing = md.missing ? true : undefined;
          sf = { hq: e.anchorHq, type: md.type, km: md.type === 'OS-HQ' || md.type === 'EQ-HQ' ? null : md.km, fare: null,
                 town: md.to || null, otherHq: md.otherHq || undefined, gps: true,
                 beLoc: md.raw, beFrom: md.from || undefined, beTo: md.to || undefined, mgrTown: md.type === 'EQ-HQ' || undefined };
          xqDay = true; ownArea = undefined; noOs = undefined; farEq = undefined;
        } }
      // (The one-OS-type collapse of earlier on 2026-11-10 is gone: OS-HQ / OS-EQ are split""", 1],
    # the BE rule's city guard comes off (the user, 19 Nov 2026): a city Locality's Google centre is the point
    ["BE: no city guard",
     """      if (beHqCity[cityKey(l)]) return null;   // city guard: the doctor's Locality is only the HQ city""",
     """      // no city guard any more (the user, 19 Nov 2026): a doctor whose Locality is a city ("Chennai") is
      // measured to that city's Google centre -- the point Google Maps shows when you search "Chennai\"""", 1],
    ["row keeps it",
     """beLoc: sf.beLoc, beFrom: sf.beFrom || undefined, beTo: sf.beTo || undefined,""",
     """beLoc: sf.beLoc, beFrom: sf.beFrom || undefined, beTo: sf.beTo || undefined,
                    // Manager Locality rule: an in-town EQ-HQ day (pays the EQ-HQ row, not the outstation DA)
                    mgrTown: sf.mgrTown || undefined,""", 1],
    # DA: an in-town EQ-HQ day from the rule never takes the BE/ABM 100% outstation DA
    ["DA: in-town EQ-HQ",
     """(fullOs && osRate > 0 && (dayType === 'EQ-HQ' || dayType === 'EQ-EQ')))) {""",
     """(fullOs && osRate > 0 && (dayType === 'EQ-HQ' || dayType === 'EQ-EQ') && !(dayType === 'EQ-HQ' && r.sfc && r.sfc.mgrTown)))) {   // Manager Locality rule (2026-11-19)""", 1],
    # TA on the rule's km as it is (build pass and screen pass)
    ["fare on the local km",
     """ta = legs * fareFor(e, ex.localKm);""",
     """ta = legs * fareFor(e, ex.localKm, !!ex.beLoc);""", 2],
    ["fare on the km",
     """ta = legs * fareFor(e, km);""",
     """ta = legs * fareFor(e, km, !!(ex && ex.beLoc));""", 2],
]


def patch(text, edits):
    # -> [new text, problems]; each anchor must be there exactly the expected number of times
    out = text
    bad = []
    for x in edits:
        n = out.count(x[1])
        if n != x[3]:
            bad.append(x[0] + ": anchor found " + str(n) + " times, expected " + str(x[3]))
        else:
            out = out.replace(x[1], x[2])
    return [out, bad]


W = "WOULD " if DRY else ""
page = frappe.get_doc("Web Page", "field-expenses")
js_src = (page.javascript or "").replace("\r\n", "\n")
new_js = None
if MARK in js_src:
    print("ok: /field-expenses page already has the Manager Locality rule")
elif "BE Locality rule" not in js_src:
    print("NOT patched: run be_locality_rule_console.py first (the BE rule is not on the page)")
else:
    r = patch(js_src, JS_EDITS)
    if r[1]:
        print("/field-expenses page -- NOT patched: " + "; ".join(r[1]))
    else:
        print(W + "patch /field-expenses page JavaScript (" + str(len(JS_EDITS)) + " edits, " + str(len(js_src)) + " -> " + str(len(r[0])) + " chars)")
        new_js = r[0]

if not DRY and new_js:
    # "2026-11-19 18:05:33.123" -> "20261119-1805" (no strftime: safe_exec refuses its import)
    now = str(frappe.utils.now_datetime())
    stamp = now[0:4] + now[5:7] + now[8:10] + "-" + now[11:13] + now[14:16]
    frappe.get_doc({"doctype": "File", "file_name": "field-expenses-js-before-mgr-locality-" + stamp + ".js",
                    "attached_to_doctype": "Web Page", "attached_to_name": "field-expenses", "is_private": 1,
                    "content": page.javascript}).insert(ignore_permissions=True)
    page.javascript = new_js
    page.save(ignore_permissions=True)
    frappe.db.commit()
    print("done -- backup attached to Web Page field-expenses. Open /field-expenses, hard refresh, Pull road km.")
elif DRY:
    print("dry run -- nothing changed.")
