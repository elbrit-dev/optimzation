# SYSTEM CONSOLE -- the day table's Total shows "paid / max" like the DA does (19 Nov 2026, the user).
# On an outstation day the DA reads "1,250/2,500" (paid -- half or the bill -- over the full outstation DA);
# the Total now reads the same way: "2,158/3,408" = TA + DA paid over TA + the full outstation DA.
# Days with no outstation DA keep one number. Display only -- no amounts change, nothing to re-save.
# Prod. System Console, Python, Administrator.
#   1) DRY = True, "Commit" unticked.  2) DRY = False, tick "Commit", Execute.  Then Ctrl+Shift+R.
# Safe to re-run. Backup of the page JavaScript saved first.

DRY = True

OLD = """        '<td style="padding:3px 8px;border-bottom:1px solid var(--surface-2);text-align:right;font-weight:500">' + (r.payable ? fmt(r.taA + r.daA) : '') + '</td>' +"""
NEW = """        // Total as "paid / max" on an outstation day, like the DA (the user, 2026-11-19): TA + DA paid over
        // TA + the full outstation DA (what a bill can raise it to)
        '<td style="padding:3px 8px;border-bottom:1px solid var(--surface-2);text-align:right;font-weight:500;white-space:nowrap">' + (r.payable ? fmt(r.taA + r.daA) + (r.osA && r.osDaFull
            ? '<span style="color:var(--ink-3);font-weight:400">/' + fmt(r.taA + r.daA - r.osA + r.osDaFull) + '</span>'
            : '') : '') + '</td>' +"""

W = "WOULD " if DRY else ""
page = frappe.get_doc("Web Page", "field-expenses")
js = (page.javascript or "").replace("\r\n", "\n")
n = js.count(OLD)
if n == 0 and "Total as \"paid / max\"" in js:
    print("ok: already patched (Total paid / max)")
elif n != 1:
    print("NOT patched: the Total cell found " + str(n) + " times, expected 1")
else:
    new_js = js.replace(OLD, NEW)
    print(W + "patch /field-expenses page JavaScript (1 edit, " + str(len(js)) + " -> " + str(len(new_js)) + " chars)")
    if not DRY:
        now = str(frappe.utils.now_datetime())
        stamp = now[0:4] + now[5:7] + now[8:10] + "-" + now[11:13] + now[14:16]
        frappe.get_doc({"doctype": "File", "file_name": "field-expenses-js-before-total-paid-max-" + stamp + ".js",
                        "attached_to_doctype": "Web Page", "attached_to_name": "field-expenses", "is_private": 1,
                        "content": page.javascript}).insert(ignore_permissions=True)
        page.javascript = new_js
        page.save(ignore_permissions=True)
        frappe.db.commit()
        print("done -- backup attached. /field-expenses, Ctrl+Shift+R.")
    else:
        print("dry run -- nothing changed.")
