# SYSTEM CONSOLE -- the "logged but not paid" dot and count in clear orange, not the dark amber (19 Nov 2026).
# Fixes what days_count_console.py (header) and emp_cards_console.py (cards) put on the page with the
# theme's --warning colour, which reads brown. Red (not reported) stays. Display only.
# Prod. System Console, Python, Administrator.
#   1) DRY = True, "Commit" unticked.  2) DRY = False, tick "Commit", Execute.  Then Ctrl+Shift+R.
# Safe to re-run. Backup of the page JavaScript saved first.

DRY = True
ORANGE = "#f97316"
SWAPS = [
    ["background:var(--warning);vertical-align:1px", "background:" + ORANGE + ";vertical-align:1px"],
    ['color:var(--warning);font-weight:600"><span', "color:" + ORANGE + ';font-weight:600"><span'],
]

W = "WOULD " if DRY else ""
page = frappe.get_doc("Web Page", "field-expenses")
js = (page.javascript or "").replace("\r\n", "\n")
out = js
n = 0
for s in SWAPS:
    n = n + out.count(s[0])
    out = out.replace(s[0], s[1])
if n == 0:
    print("ok: nothing to change (already orange, or the day-count patch is not on the page)")
else:
    print(W + "recolour " + str(n) + " places on /field-expenses (" + str(len(js)) + " -> " + str(len(out)) + " chars)")
    if not DRY:
        now = str(frappe.utils.now_datetime())
        stamp = now[0:4] + now[5:7] + now[8:10] + "-" + now[11:13] + now[14:16]
        frappe.get_doc({"doctype": "File", "file_name": "field-expenses-js-before-orange-dot-" + stamp + ".js",
                        "attached_to_doctype": "Web Page", "attached_to_name": "field-expenses", "is_private": 1,
                        "content": page.javascript}).insert(ignore_permissions=True)
        page.javascript = out
        page.save(ignore_permissions=True)
        frappe.db.commit()
        print("done -- backup attached. /field-expenses, Ctrl+Shift+R.")
    else:
        print("dry run -- nothing changed.")
