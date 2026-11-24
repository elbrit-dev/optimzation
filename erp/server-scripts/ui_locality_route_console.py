# SYSTEM CONSOLE -- /field-expenses shows Locality -> Locality, not "HQ Tanjore -> ..." (19 Nov 2026, the user).
# Goes on top of be_home_locality_console.py. Prod. System Console, Python, Administrator.
#   1) DRY = True, "Commit" unticked: checks the anchors.  2) DRY = False, tick "Commit", Execute.
#   Then /field-expenses (Ctrl+Shift+R), October -> it re-saves the days (their route text changed).
# Safe to re-run (marker "Locality display"). Backup of the page JavaScript saved first.
#
# Every role, every day priced by the Locality rules (BE and ABM-and-above):
#   Route column (and the saved Field Expense Day route the app reads -- same function):
#     HQ / OS-HQ day             -> "Kumbakonam"                      (the base / start area)
#     HQ-EQ / EQ-EQ / OS-EQ day  -> "Kumbakonam -> Sembanarkoil (60 km)"
#     OS day                     -> the journey between HQs first ("HQ Chennai -> HQ Vellore -> Katpadi -> ...")
#   Day pop-up "Fare km" table, Local row: From = the start Locality, To = the farthest doctor's Locality,
#   km as paid (no extra rounding).
# Unchanged: meeting-only days, days still on GPS (missing Locality data), the HQ-to-HQ journey rows.

DRY = True
MARK = "Locality display"

EDITS = [
    ["route cell",
     """  function routeCell(r, cap) {
    if (!r.payable) return r.others ? '' : routeCellOld(r, cap);""",
     """  function routeCell(r, cap) {
    if (!r.payable) return r.others ? '' : routeCellOld(r, cap);
    // Locality display (the user, 19 Nov 2026): a day priced by the Locality rules names its two
    // Localities -- "Kumbakonam" on an HQ day, "Kumbakonam -> Sembanarkoil (60 km)" past the band.
    // HQ names stay only for the journey between HQs on an OS day; meeting-only and GPS days as before.
    if (r.n && r.sfc && r.sfc.beLoc !== undefined) {
      var lk = function (x) { return String(x || '').toLowerCase().replace(/^hq\\s*-?\\s*/, '').replace(/[^a-z0-9]/g, ''); };
      var lH = function (x) { return 'HQ ' + String(x || '').replace(/^HQ\\s*-?\\s*/i, ''); };
      var ldim = 'color:var(--ink-3);font-weight:400';
      var lfrom = String(r.sfc.beFrom || '').replace(/\\s*\\(HQ\\)$/, ''), lto = String(r.sfc.beTo || '');
      var lkm = r.sfc.km !== null && r.sfc.km !== undefined ? r.sfc.km : r.km;
      var lparts = [];
      if (/^OS-/.test(r.dayType) && r.osHq) {
        var lstart = tripStartHq(r);
        if (lk(lstart) !== lk(r.osHq)) lparts.push('<span style="' + ldim + '">' + esc(lH(lstart)) + '</span>', '<span style="' + ldim + '">' + esc(lH(r.osHq)) + '</span>');
      }
      lparts.push(esc(lfrom || lto || 'HQ'));
      if ((r.hqEq || /-EQ$/.test(r.dayType)) && lto && lk(lto) !== lk(lfrom))
        lparts.push('<span style="color:var(--critical);font-weight:600" title="farthest doctor area, Locality centre to centre">' +
          esc(lto) + ' <span style="font-size:11px">(' + lkm + ' km)</span></span>');
      if (r.homeBack) lparts.push('<span style="' + ldim + '">' + esc(lH((EMP[r.emp] && (EMP[r.emp].anchorHq || EMP[r.emp].hq)) || '')) + '</span>');
      return lparts.join(ARROW);
    }""", 1],
    ["fare table: names",
     """      var rtv = r.reachTo || {};
      // the place only, not the doctor (the owner, 2026-11-11)
      var farName = rtv.place || 'farthest visit';""",
     """      var rtv = r.reachTo || {};
      // the place only, not the doctor (the owner, 2026-11-11)
      var farName = rtv.place || 'farthest visit';
      // Locality display (2026-11-19): the Local row runs Locality centre to Locality centre
      var LRd = !!(r.sfc && r.sfc.beLoc !== undefined);
      if (LRd) farName = r.sfc.beTo || farName;
      var lrFrom = LRd ? String(r.sfc.beFrom || '').replace(/\\s*\\(HQ\\)$/, '') : null;""", 1],
    ["fare table: local row",
     """      if (local !== null) rowsT.push(['Local', r.dayType === 'OS' && r.osFrom ? r.osFrom : Hn(cen), farName, fk('local', roundKm(local) + (both2 ? ' ↑↓' : ''))]);""",
     """      if (local !== null) rowsT.push(['Local', LRd ? lrFrom : r.dayType === 'OS' && r.osFrom ? r.osFrom : Hn(cen), farName, fk('local', (LRd ? local : roundKm(local)) + (both2 ? ' ↑↓' : ''))]);""", 1],
    ["fare table: within row",
     """        rowsT.push(['Local', Hn(cen), farName, roundKm(r.km) + ' <span style="color:var(--ink-3)">(within ' + S.hqKm + ', no TA)</span>']);""",
     """        rowsT.push(['Local', LRd ? lrFrom : Hn(cen), farName, (LRd ? r.km : roundKm(r.km)) + ' <span style="color:var(--ink-3)">(within ' + S.hqKm + ', no TA)</span>']);""", 1],
]

W = "WOULD " if DRY else ""
page = frappe.get_doc("Web Page", "field-expenses")
js = (page.javascript or "").replace("\r\n", "\n")
new_js = None
if MARK in js:
    print("ok: already patched (Locality display)")
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
    frappe.get_doc({"doctype": "File", "file_name": "field-expenses-js-before-locality-display-" + stamp + ".js",
                    "attached_to_doctype": "Web Page", "attached_to_name": "field-expenses", "is_private": 1,
                    "content": page.javascript}).insert(ignore_permissions=True)
    page.javascript = new_js
    page.save(ignore_permissions=True)
    frappe.db.commit()
    print("done -- backup attached. Open /field-expenses (Ctrl+Shift+R), October -- it re-saves the days.")
elif DRY:
    print("dry run -- nothing changed.")
