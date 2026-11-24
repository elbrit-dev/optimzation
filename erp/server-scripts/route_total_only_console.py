# SYSTEM CONSOLE -- the route shows only the total km, no "57.4 + 10 = 67.4" (19 Nov 2026, the user).
# The first eq_add_10km_console.py run put the "+ 10 =" text in the Route column; this takes it out.
# Display only: the 10 km stays in the pay. Prod. System Console, Python, Administrator.
#   1) DRY = True, "Commit" unticked.  2) DRY = False, tick "Commit", Execute.
#   Then /field-expenses (Ctrl+Shift+R), October -- it re-saves the route text of the EQ days.
# Safe to re-run. Backup of the page JavaScript saved first.

DRY = True

OLD = """          esc(lto) + ' <span style="font-size:11px">(' + (r.sfc.addKm ? Math.round((lkm - r.sfc.addKm) * 10) / 10 + ' + ' + r.sfc.addKm + ' = ' : '') + lkm + ' km)</span></span>');"""
NEW = """          esc(lto) + ' <span style="font-size:11px">(' + lkm + ' km)</span></span>');   // total only (the user, 2026-11-19)"""

W = "WOULD " if DRY else ""
page = frappe.get_doc("Web Page", "field-expenses")
js = (page.javascript or "").replace("\r\n", "\n")
n = js.count(OLD)
if n == 0 and "total only (the user, 2026-11-19)" in js:
    print("ok: already showing the total only")
elif n != 1:
    print("NOT patched: the route line found " + str(n) + " times, expected 1")
else:
    new_js = js.replace(OLD, NEW)
    print(W + "patch /field-expenses page JavaScript (1 edit, " + str(len(js)) + " -> " + str(len(new_js)) + " chars)")
    if not DRY:
        now = str(frappe.utils.now_datetime())
        stamp = now[0:4] + now[5:7] + now[8:10] + "-" + now[11:13] + now[14:16]
        frappe.get_doc({"doctype": "File", "file_name": "field-expenses-js-before-route-total-" + stamp + ".js",
                        "attached_to_doctype": "Web Page", "attached_to_name": "field-expenses", "is_private": 1,
                        "content": page.javascript}).insert(ignore_permissions=True)
        page.javascript = new_js
        page.save(ignore_permissions=True)
        frappe.db.commit()
        print("done -- backup attached. /field-expenses (Ctrl+Shift+R), October.")
    else:
        print("dry run -- nothing changed.")
