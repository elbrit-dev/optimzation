# SYSTEM CONSOLE -- /field-expenses says WHY a day is still on the GPS method (19 Nov 2026, the user).
# Goes on top of be_home_locality_console.py (with or without ui_locality_route_console.py).
# Prod. System Console, Python, Administrator.
#   1) DRY = True, "Commit" unticked: checks the anchors.  2) DRY = False, tick "Commit", Execute.
# Safe to re-run (marker "why a day stayed on GPS"). Backup of the page JavaScript saved first.
#
# A day the Locality rules could not price stays on GPS; its Route cell now ends with a warning:
#   "⚠ seat BE7-ELBR-CH-CHE has no Locality"         (BE: his seat has no base area)
#   "⚠ no Locality on Dr Ramesh, Dr Priya +2 more"   (doctors visited that day with no Locality)
#   "⚠ Locality Anekal has no centre"
#   "⚠ seat BE9-ELBR-CH-CHE has no Locality (BE of Dr X)"   (manager: his BE mapped to that doctor)
#   "⚠ no Locality for his HQ Chennai"
# Only on screen: the route saved to Field Expense Day (what the app shows) drops the warning.

DRY = True
MARK = "why a day stayed on GPS"

EDITS = [
    ["doctor names per day",
     """      dmap: Object.keys(v.docs).map(d => [(doctorGeo[d] && doctorGeo[d].loc) || null, (LEAD_SEATS[d] || []).filter(s => /^BE\\d*-/i.test(s))]),""",
     """      dmap: Object.keys(v.docs).map(d => [(doctorGeo[d] && doctorGeo[d].loc) || null, (LEAD_SEATS[d] || []).filter(s => /^BE\\d*-/i.test(s)), docName(d)]),
      // the day's doctors with no Locality, by name -- shown when the day stays on GPS (2026-11-19)
      dnoLoc: Object.keys(v.docs).filter(d => !(doctorGeo[d] && doctorGeo[d].loc)).map(d => docName(d)),""", 1],
    ["reason holder",
     """  const ALL_ANCH = {};""",
     """  // why a day stayed on GPS (2026-11-19): the Locality rules leave the reason in LOC_WHY, the day keeps it
  let LOC_WHY = null;
  const LOC_MISS = {};
  const locNames = xs => { xs = (xs || []).filter(Boolean); return xs.slice(0, 3).join(', ') + (xs.length > 3 ? ' +' + (xs.length - 3) + ' more' : ''); };

  const ALL_ANCH = {};""", 1],
    ["BE: reasons",
     """    if (!a || !v.dlocs || !v.dlocs.length || v.dlocMiss) return null;""",
     """    if (!from) { LOC_WHY = 'seat ' + (seat || '(no seat)') + ' has no Locality'; return null; }
    if (!a) { LOC_WHY = 'Locality ' + from + ' has no centre'; return null; }
    if (v.dlocMiss) { LOC_WHY = 'no Locality on ' + locNames(v.dnoLoc); return null; }
    if (!v.dlocs || !v.dlocs.length) { LOC_WHY = 'no doctor on the visits'; return null; }""", 1],
    ["BE: locality without centre",
     """      if (!b) return null;
      // no city guard any more""",
     """      if (!b) { LOC_WHY = 'Locality ' + l + ' has no centre'; return null; }
      // no city guard any more""", 1],
    ["manager: doctor without Locality",
     """      if (!b) return null;                                                     // no Locality / centre: GPS""",
     """      if (!b) { LOC_WHY = l ? 'Locality ' + l + ' has no centre' : 'no Locality on ' + locNames(v.dnoLoc || [v.dmap[i][2]]); return null; }""", 1],
    ["manager: his BE without Locality",
     """        if (!wl.length) return null;                                           // his BE has no area yet: GPS""",
     """        if (!wl.length) { LOC_WHY = 'seat ' + mine.join(', ') + ' has no Locality (BE of ' + (v.dmap[i][2] || 'a doctor') + ')'; return null; }""", 1],
    ["manager: no HQ centre",
     """        if (!hc) return null;""",
     """        if (!hc) { LOC_WHY = 'no Locality for his HQ ' + (e.anchorHq || e.hq || ''); return null; }""", 1],
    ["manager override keeps the reason",
     """      { const md = mgrDay(e, v);
        if (md) {""",
     """      { LOC_WHY = null; const md = mgrDay(e, v);
        if (!md && isMgr(e) && v && v.n && LOC_WHY) LOC_MISS[e.code + '|' + ds] = LOC_WHY;
        if (md) {""", 1],
    ["BE override keeps the reason",
     """        const bh = beLocKm(e, v);
        if (bh) {""",
     """        LOC_WHY = null; const bh = beLocKm(e, v);
        if (!bh && v && v.n && LOC_WHY) LOC_MISS[e.code + '|' + ds] = LOC_WHY;
        if (bh) {""", 1],
    ["build row carries it",
     """        emp: e.code, date: ds, day: DOW[ds], kind: kind, label: label, src: src,""",
     """        emp: e.code, date: ds, day: DOW[ds], kind: kind, label: label, src: src,
        locMiss: LOC_MISS[e.code + '|' + ds] || undefined,   // why the day stayed on GPS (2026-11-19)""", 1],
    ["screen row carries it",
     """        reachTo: r.reachTo || null, others: r.others || null, meetNoHq: r.meetNoHq || null,""",
     """        reachTo: r.reachTo || null, others: r.others || null, meetNoHq: r.meetNoHq || null, locMiss: r.locMiss || null,""", 1],
    ["route cell shows it",
     """    if (r.homeBack) parts.push('<span style="' + dim + '">' + esc(H(own)) + '</span>');
    return parts.join(ARROW);
  }
  function routeCellOld""",
     """    if (r.homeBack) parts.push('<span style="' + dim + '">' + esc(H(own)) + '</span>');
    // why the day is still on GPS (2026-11-19) -- the saved route drops this note (fxDayRecord)
    return parts.join(ARROW) + (r.locMiss ? ' <span style="color:var(--warning);font-weight:600;font-size:11px" title="this day stays on the GPS method until the Locality is filled">⚠ ' + esc(r.locMiss) + '</span>' : '');
  }
  function routeCellOld""", 1],
    ["saved route without the note",
     """      centre_hq: r.osHq || '', route: working ? plain(routeCell(r) || '') : '',""",
     """      centre_hq: r.osHq || '', route: working ? plain(routeCell(r) || '').replace(/\\s*⚠.*$/, '') : '',""", 1],
]

W = "WOULD " if DRY else ""
page = frappe.get_doc("Web Page", "field-expenses")
js = (page.javascript or "").replace("\r\n", "\n")
new_js = None
if MARK in js:
    print("ok: already patched (why a day stayed on GPS)")
elif "BE home = his seat's Locality" not in js:
    print("NOT patched: run be_home_locality_console.py first")
else:
    bad = []
    out = js
    for x in EDITS:
        n = out.count(x[1])
        if n != x[3]:
            bad.append(x[0] + ": anchor found " + str(n) + " times, expected " + str(x[3]))
        else:
            out = out.replace(x[1], x[2])
    if bad:
        print("NOT patched: " + "; ".join(bad))
    else:
        print(W + "patch /field-expenses page JavaScript (" + str(len(EDITS)) + " edits, " + str(len(js)) + " -> " + str(len(out)) + " chars)")
        new_js = out

if not DRY and new_js:
    now = str(frappe.utils.now_datetime())
    stamp = now[0:4] + now[5:7] + now[8:10] + "-" + now[11:13] + now[14:16]
    frappe.get_doc({"doctype": "File", "file_name": "field-expenses-js-before-locality-reason-" + stamp + ".js",
                    "attached_to_doctype": "Web Page", "attached_to_name": "field-expenses", "is_private": 1,
                    "content": page.javascript}).insert(ignore_permissions=True)
    page.javascript = new_js
    page.save(ignore_permissions=True)
    frappe.db.commit()
    print("done -- backup attached. Open /field-expenses (Ctrl+Shift+R).")
elif DRY:
    print("dry run -- nothing changed.")
