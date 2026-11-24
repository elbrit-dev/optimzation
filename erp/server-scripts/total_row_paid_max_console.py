# SYSTEM CONSOLE -- the day table's bottom Total row shows "paid / max" too (19 Nov 2026, the user).
# Goes with total_paid_max_console.py (the rows). The Total row now reads (figures for illustration):
#   DA    20,250/36,500   (DA paid over the DA he can claim -- each outstation day at its full rate)
#   Total 28,994/45,244   (TA + DA spent over TA + DA he can claim)
# A month with no outstation DA keeps one number. Display only -- nothing to re-save.
# Prod. System Console, Python, Administrator.
#   1) DRY = True, "Commit" unticked.  2) DRY = False, tick "Commit", Execute.  Then Ctrl+Shift+R.
# Safe to re-run. Backup of the page JavaScript saved first.

DRY = True
MARK = "Total row paid / max"

EDITS = [
    ["sums",
     """    var tv = 0, tk = 0, tt = 0, td2 = 0;""",
     """    var tv = 0, tk = 0, tt = 0, td2 = 0, tdx = 0;   // tdx: the DA he can claim (Total row paid / max, 2026-11-19)""", 1],
    ["claimable DA per day",
     """      tt += r.taA; td2 += r.daA;""",
     """      tt += r.taA; td2 += r.daA;
      tdx += r.osA && r.osDaFull ? r.daA - r.osA + r.osDaFull : r.daA;   // an outstation day at its full rate""", 1],
    ["DA and Total cells",
     """      '<td style="' + T + ';text-align:right">' + fmt(td2) + '</td>' +
      '<td style="' + T + ';text-align:right">' + fmt(tt + td2) + '</td>' +""",
     """      '<td style="' + T + ';text-align:right;white-space:nowrap">' + fmt(td2) + (tdx > td2 ? '<span style="color:var(--ink-3);font-weight:400">/' + fmt(tdx) + '</span>' : '') + '</td>' +
      '<td style="' + T + ';text-align:right;white-space:nowrap">' + fmt(tt + td2) + (tdx > td2 ? '<span style="color:var(--ink-3);font-weight:400">/' + fmt(tt + tdx) + '</span>' : '') + '</td>' +""", 1],
]

W = "WOULD " if DRY else ""
page = frappe.get_doc("Web Page", "field-expenses")
js = (page.javascript or "").replace("\r\n", "\n")
new_js = None
if MARK in js:
    print("ok: already patched (Total row paid / max)")
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
    frappe.get_doc({"doctype": "File", "file_name": "field-expenses-js-before-total-row-" + stamp + ".js",
                    "attached_to_doctype": "Web Page", "attached_to_name": "field-expenses", "is_private": 1,
                    "content": page.javascript}).insert(ignore_permissions=True)
    page.javascript = new_js
    page.save(ignore_permissions=True)
    frappe.db.commit()
    print("done -- backup attached. /field-expenses, Ctrl+Shift+R.")
elif DRY:
    print("dry run -- nothing changed.")
