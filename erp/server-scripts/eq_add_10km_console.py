# SYSTEM CONSOLE -- an EQ-type day is paid on its km + 10 (19 Nov 2026, the user: "25 becomes 35").
# Goes on top of locality_fixes_console.py (with or without why_day_locality_console.py). Prod.
# System Console, Python, Administrator.
#   1) DRY = True, "Commit" unticked: checks the anchors.  2) DRY = False, tick "Commit", Execute.
#   Then /field-expenses (Ctrl+Shift+R), October -> "Pull road km & save" (every EQ-type day changes).
# Safe to re-run (marker "EQ_ADD_KM"). Backup of the page JavaScript saved first.
#
# Every day priced by the Locality rules (BE and ABM-and-above):
#   - the day type is decided first, on the real km: under 22.5 HQ / OS-HQ (no TA, nothing added),
#     22.5 and over the EQ type (HQ-EQ, OS-EQ);
#   - an EQ-type day is then paid on the rounded km + 10: TA = (km + 10) x 2 at the per-km rate (rail fare
#     above 100 km). 25 -> 35, 30 -> 40, 57.4 -> 67.4.
#   - the route shows only the total paid: "Kumbakonam -> Tharangambadi (67.4 km)" -- no "+ 10" (the user).
# Not changed: the journey between HQs on OS days, days still on GPS, meeting-only days.

DRY = True
MARK = "EQ_ADD_KM"

EDITS = [
    ["the 10 km",
     """  const MGR_OS_KM = 30, LOC_FAR_KM = 50;""",
     """  const MGR_OS_KM = 30, LOC_FAR_KM = 50;
  // EQ_ADD_KM (the user, 2026-11-19): an EQ-type Locality day (HQ-EQ, OS-EQ) is paid on its km + 10
  const EQ_ADD_KM = 10;""", 1],
    ["manager: paid km",
     """          km = md.km; far = Math.round(md.km / D.roadFactor * 1000) / 1000; reachP = null;""",
     """          // EQ_ADD_KM: an EQ-type day (OS-EQ, or HQ past the band = HQ-EQ) is paid on km + 10; the type is already decided
          const mdAdd = (md.type === 'OS-EQ' || (md.type === 'HQ' && md.km >= D.hqKm)) ? EQ_ADD_KM : 0;
          km = md.km + mdAdd; far = Math.round(km / D.roadFactor * 1000) / 1000; reachP = null;""", 1],
    ["manager: row km",
     """          sf = { hq: e.anchorHq, type: md.type, km: md.type === 'OS-HQ' || md.type === 'EQ-HQ' ? null : md.km, fare: null,""",
     """          sf = { hq: e.anchorHq, type: md.type, km: md.type === 'OS-HQ' || md.type === 'EQ-HQ' ? null : md.km + mdAdd, fare: null, addKm: mdAdd || undefined,""", 1],
    ["BE: paid km",
     """          km = bh.km; far = Math.round(bh.km / D.roadFactor * 1000) / 1000; reachP = null;""",
     """          // EQ_ADD_KM: an HQ-EQ day (22.5 km and over) is paid on km + 10; under it nothing is added
          const bhAdd = bh.km >= D.hqKm ? EQ_ADD_KM : 0;
          km = bh.km + bhAdd; far = Math.round(km / D.roadFactor * 1000) / 1000; reachP = null;""", 1],
    ["BE: row km",
     """          sf = { hq: e.anchorHq, type: 'HQ', km: bh.km, fare: null, town: null, gps: true,   // A5""",
     """          sf = { hq: e.anchorHq, type: 'HQ', km: bh.km + bhAdd, fare: null, town: null, gps: true, addKm: bhAdd || undefined,   // A5""", 1],
    ["row keeps it",
     """                    mgrTown: sf.mgrTown || undefined,""",
     """                    mgrTown: sf.mgrTown || undefined,
                    addKm: sf.addKm || undefined,   // EQ_ADD_KM: the 10 km added on an EQ-type day""", 1],
]

W = "WOULD " if DRY else ""
page = frappe.get_doc("Web Page", "field-expenses")
js = (page.javascript or "").replace("\r\n", "\n")
new_js = None
if MARK in js:
    print("ok: already patched (EQ_ADD_KM)")
elif "Manager Locality rule, revised" not in js:
    print("NOT patched: run locality_fixes_console.py first")
elif "Locality display" not in js:
    print("NOT patched: run ui_locality_route_console.py first")
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
    frappe.get_doc({"doctype": "File", "file_name": "field-expenses-js-before-eq-add-10km-" + stamp + ".js",
                    "attached_to_doctype": "Web Page", "attached_to_name": "field-expenses", "is_private": 1,
                    "content": page.javascript}).insert(ignore_permissions=True)
    page.javascript = new_js
    page.save(ignore_permissions=True)
    frappe.db.commit()
    print("done -- backup attached. /field-expenses (Ctrl+Shift+R), October -> Pull road km & save.")
elif DRY:
    print("dry run -- nothing changed.")
