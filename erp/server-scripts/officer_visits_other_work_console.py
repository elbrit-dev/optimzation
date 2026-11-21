# SYSTEM CONSOLE -- the officer's visits list also says the day's Other Work (20 Nov 2026, the user).
# Found in the claims test: on the approvals page a meeting day (Vignesh S, 14 Oct, "Team Meeting") showed
# "⚠ No visits · fewer than expected". Server Script "Field Trip Officer API" (action=visits) now returns
# each day's Field Expense Day.other_work as "other"; the app skips the warning on such a day and shows it
# instead. Old app builds just ignore the new key. Source: share/src/app/field-expense/server/field_trip_officer_api.py
# Prod. System Console, Python, Administrator.
#   1) DRY = True, "Commit" unticked.  2) DRY = False, tick "Commit", Execute.
# Safe to re-run (it checks for the new text first).

DRY = True
EDITS = [
    ["read other_work",
     'fields=["date", "visits", "detail_json"]',
     'fields=["date", "visits", "other_work", "detail_json"]'],
    ["return it",
     'out[str(d.date)[:10]] = {"visits": d.visits or 0, "places": places}',
     'out[str(d.date)[:10]] = {"visits": d.visits or 0, "places": places, "other": d.other_work or ""}'],
]

W = "WOULD " if DRY else ""
ss = frappe.get_doc("Server Script", "Field Trip Officer API")
src = (ss.script or "").replace("\r\n", "\n")
if '"other": d.other_work' in src:
    print("ok: already returns other_work")
else:
    bad = []
    out = src
    for x in EDITS:
        n = out.count(x[1])
        if n != 1:
            bad.append(x[0] + ": anchor found " + str(n) + " times")
        else:
            out = out.replace(x[1], x[2])
    if bad:
        print("NOT patched: " + "; ".join(bad))
    else:
        print(W + "patch Server Script 'Field Trip Officer API' (" + str(len(EDITS)) + " edits)")
        if not DRY:
            ss.script = out
            ss.save(ignore_permissions=True)
            frappe.db.commit()
            print("done.")
if DRY:
    print("dry run -- nothing changed.")
