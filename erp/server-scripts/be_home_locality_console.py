# SYSTEM CONSOLE -- a BE's home is his seat's Locality, never the Employee record or the HQ fields
# (19 Nov 2026, the user). Goes on top of mgr_intown_hq_console.py. Prod. System Console, Python, Administrator.
#   1) DRY = True, "Commit" unticked: checks the anchor.  2) DRY = False, tick "Commit", Execute.
#   Then /field-expenses (Ctrl+Shift+R), October -> "Pull road km & save".
# Safe to re-run (marker "BE home = his seat's Locality"). Backup of the page JavaScript saved first.
#
# Before: the BE rule ran only on days the page placed in his "own HQ" -- and his own HQ came from the
# seat's Territory (Prabanjan J, BE9-VASC-CO-KUM: Territory HQ-Tanjore, base area Kumbakonam), so a day
# in Kumbakonam read "another HQ" -> EQ / EQ-EQ.
# Now: EVERY BE doctor-visit day is measured from his seat's Locality centre to the farthest doctor's
# Locality centre, wherever the HQ fields put him: under 22.5 km HQ, 22.5 and over HQ-EQ (EQ allowance,
# TA on that km both ways). A BE has no EQ / OS days. Still GPS: missing Locality data, meeting-only days.

DRY = True
MARK = "BE home = his seat's Locality"

EDITS = [
    ["BE home",
     """          xqDay = true; ownArea = undefined; noOs = undefined; farEq = undefined;
        } }
      // (The one-OS-type collapse""",
     """          xqDay = true; ownArea = undefined; noOs = undefined; farEq = undefined;
        } }
      // BE home = his seat's Locality (the user, 19 Nov 2026: never the Employee record or the HQ
      // fields): every BE doctor-visit day is measured base area -> farthest doctor area, wherever the
      // HQ fields put him -- under 22.5 km HQ, 22.5 and over HQ-EQ (hqEq below). No EQ / OS days for a BE.
      if (String(e.role || '').toUpperCase() === 'BE') {
        const bh = beLocKm(e, v);
        if (bh) {
          dayType = g = 'HQ';
          km = bh.km; far = Math.round(bh.km / D.roadFactor * 1000) / 1000; reachP = null;
          roadMissing = bh.missing ? true : undefined;
          sf = { hq: e.anchorHq, type: 'HQ', km: bh.km, fare: null, town: bh.to || null, gps: true,
                 beLoc: bh.raw, beFrom: bh.from || undefined, beTo: bh.to || undefined };
          xqDay = true; ownArea = true; noOs = undefined; farEq = undefined;
        }
      }
      // (The one-OS-type collapse""", 1],
]

W = "WOULD " if DRY else ""
page = frappe.get_doc("Web Page", "field-expenses")
js = (page.javascript or "").replace("\r\n", "\n")
new_js = None
if MARK in js:
    print("ok: already patched (BE home)")
elif "Manager Locality rule" not in js:
    print("NOT patched: run mgr_locality_rule_console.py first")
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
        print(W + "patch /field-expenses page JavaScript (" + str(len(EDITS)) + " edit, " + str(len(js)) + " -> " + str(len(out)) + " chars)")
        new_js = out

if not DRY and new_js:
    now = str(frappe.utils.now_datetime())
    stamp = now[0:4] + now[5:7] + now[8:10] + "-" + now[11:13] + now[14:16]
    frappe.get_doc({"doctype": "File", "file_name": "field-expenses-js-before-be-home-" + stamp + ".js",
                    "attached_to_doctype": "Web Page", "attached_to_name": "field-expenses", "is_private": 1,
                    "content": page.javascript}).insert(ignore_permissions=True)
    page.javascript = new_js
    page.save(ignore_permissions=True)
    frappe.db.commit()
    print("done -- backup attached. Open /field-expenses (Ctrl+Shift+R), October, Pull road km & save.")
elif DRY:
    print("dry run -- nothing changed.")
