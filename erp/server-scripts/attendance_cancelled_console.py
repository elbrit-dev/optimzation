# SYSTEM CONSOLE -- a CANCELLED Attendance row no longer counts (20 Nov 2026, the user).
# Found in the claims test: Vignesh S (E00869) 3 + 5 Oct were priced as "Leave" (TA/DA 0, flag
# "Visit on Leave") although he logged 7 and 9 visits. The only leave was Attendance HR-ATT-2026-01227..1229
# "On Leave", all CANCELLED (docstatus 2). The /field-expenses engine indexed every Attendance row the
# Data API sends, cancelled ones too, and an "On Leave" row outranks visits.
# Now a cancelled row is skipped; the day falls back to the Leave Application / visits as usual.
# Oct-Nov 2026 cancelled rows: E00869 3, 4, 5 Oct; D0002 15 Oct.
# Draft rows (docstatus 0) are left as they are -- none in Oct-Nov; old saved months may carry no docstatus.
#
# After it: open /field-expenses as Administrator / HR, pick Oct 2026, Ctrl+Shift+R. The page re-saves every
# changed day to Field Expense Day by itself ("Saved N changed day(s)"): E00869 3 + 5 Oct become paid days.
# Claimed / finalised days are not touched by the save.
# Prod. System Console, Python, Administrator.
#   1) DRY = True, "Commit" unticked.  2) DRY = False, tick "Commit", Execute.
# Safe to re-run (marker "Cancelled attendance skipped"). Backup of the page JavaScript saved first.

DRY = True
MARK = "Cancelled attendance skipped"

EDITS = [
    ["skip cancelled Attendance rows",
     """  E.attendance.forEach(a => attIdx[a.employee + '|' + a.attendance_date] = a);""",
     """  // Cancelled attendance skipped (the user, 2026-11-20): a cancelled "On Leave" row made a worked day a leave day
  E.attendance.forEach(a => { if (a.docstatus === 2) return; attIdx[a.employee + '|' + a.attendance_date] = a; });""", 1],
]

W = "WOULD " if DRY else ""
page = frappe.get_doc("Web Page", "field-expenses")
js = (page.javascript or "").replace("\r\n", "\n")
new_js = None
if MARK in js:
    print("ok: already patched (" + MARK + ")")
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

# what it changes: the cancelled rows in the last two months
rows = frappe.get_all("Attendance", filters={"docstatus": 2, "attendance_date": [">=", frappe.utils.add_months(frappe.utils.today(), -2)]},
                      fields=["name", "employee", "employee_name", "attendance_date", "status"], order_by="attendance_date")
print("cancelled Attendance rows now ignored (last 2 months): " + str(len(rows)))
for r in rows:
    print("   " + r.name + "  " + r.employee + " " + str(r.employee_name) + "  " + str(r.attendance_date) + "  " + str(r.status))

if not DRY and new_js:
    now = str(frappe.utils.now_datetime())
    stamp = now[0:4] + now[5:7] + now[8:10] + "-" + now[11:13] + now[14:16]
    frappe.get_doc({"doctype": "File", "file_name": "field-expenses-js-before-cancelled-attendance-" + stamp + ".js",
                    "attached_to_doctype": "Web Page", "attached_to_name": "field-expenses", "is_private": 1,
                    "content": page.javascript}).insert(ignore_permissions=True)
    page.javascript = new_js
    page.save(ignore_permissions=True)
    frappe.db.commit()
    print("done -- backup attached. Open /field-expenses, Oct 2026, Ctrl+Shift+R: the changed days re-save.")
elif DRY:
    print("dry run -- nothing changed.")
