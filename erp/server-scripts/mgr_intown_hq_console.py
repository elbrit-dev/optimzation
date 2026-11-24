# SYSTEM CONSOLE -- ABM and above: an in-town day is HQ, never "EQ-HQ" (19 Nov 2026, the user:
# "EQ-HQ with no fare inside the HQ will confuse people"). Goes on top of mgr_locality_rule_console.py.
# Prod. Desk > System Console, type Python, as Administrator.
#   1) DRY = True, "Commit" unticked: checks the anchor.  2) DRY = False, tick "Commit", Execute.
# Safe to re-run (marker "in-town HQ"). Backup of the page JavaScript saved as a private File first.
#
# Before: a manager's doctor NOT mapped to a BE under him, under 22.5 km from his HQ centre (e.g. a
# Chennai ABM's Adyar doctor on a Vasco BE) made the day "EQ-HQ" (EQ-HQ rate row, no fare).
# Now: that day is plain HQ -- HQ allowance, no fare. 22.5 km and over stays EQ-EQ (fare km x 2).

DRY = True
MARK = "in-town HQ"

EDITS = [
    ["in-town day is HQ",
     """    } else if (docs.some(d => d.kind === 'eq')) {
      type = 'EQ-HQ';
      otherHq = e.anchorHq || undefined;
    }""",
     """    }
    // in-town HQ (the user, 19 Nov 2026): every doctor under 22.5 km -- his BE's or not -- is an HQ day
    // (HQ allowance, no fare); it used to read EQ-HQ for a doctor not mapped to his BE, which confused people""", 1],
]

W = "WOULD " if DRY else ""
page = frappe.get_doc("Web Page", "field-expenses")
js = (page.javascript or "").replace("\r\n", "\n")
new_js = None
if MARK in js:
    print("ok: already patched (in-town HQ)")
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
    frappe.get_doc({"doctype": "File", "file_name": "field-expenses-js-before-intown-hq-" + stamp + ".js",
                    "attached_to_doctype": "Web Page", "attached_to_name": "field-expenses", "is_private": 1,
                    "content": page.javascript}).insert(ignore_permissions=True)
    page.javascript = new_js
    page.save(ignore_permissions=True)
    frappe.db.commit()
    print("done -- backup attached. Open /field-expenses (Ctrl+Shift+R).")
elif DRY:
    print("dry run -- nothing changed.")
