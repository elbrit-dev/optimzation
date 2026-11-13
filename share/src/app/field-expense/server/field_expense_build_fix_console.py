# Field Expense Build: keep each day's visits, kind and context (11 Nov 2026).
#
# The pricing step (price_month) drops `kind` and `n` from every row it
# returns, and its rows never carried forced / joint / others / reachTo /
# osHq / roadMissing. The build then wrote Field Expense Day from those rows,
# so EVERY day was saved with visits 0, kind empty, force_visits 0, joint 0,
# no centre HQ, no farthest place and no other work -- while the dashboard,
# which reads the month file (the engine's own rows), showed them. The planner
# reads Field Expense Day, so it needs them on the record.
#
# This patches the save loop of the "Field Expense - Build" Server Script:
# each priced row is laid over the engine's row for the same employee-day, so
# the engine's fields fill in what pricing left out (pricing still wins on
# every amount). Nothing else in the 240 KB script changes. Then it asks the
# build to re-save REBUILD (days already Claimed are never touched).
#
# Paste into ERP > System Console (type Python), logged in as a System Manager.
# 1) DRY = True, "Commit" unticked: only prints.  2) DRY = False, tick Commit.
# Safe to re-run: an already patched script is left as it is.

DRY = True
W = "WOULD " if DRY else ""
REBUILD = "2026-10"
NAME = "Field Expense - Build"

OLD = '''    for r in priced["rows"]:
        k = r["emp"] + "|" + r["date"]
        keep[k] = 1
'''
NEW = '''    # the engine's own row for each employee-day: pricing drops kind and n
    # (visits) and never carried forced / joint / others / reachTo / osHq
    eng = {}
    for r0 in out["rows"]:
        eng[r0["emp"] + "|" + r0["date"]] = r0
    for r in priced["rows"]:
        k = r["emp"] + "|" + r["date"]
        keep[k] = 1
        e0 = eng.get(k)
        if e0:
            m0 = {}
            m0.update(e0)
            m0.update(r)           # pricing wins on every field it has
            r = m0
'''

ss = frappe.get_doc("Server Script", NAME)
src = ss.script or ""
# the script is stored with Windows line ends: match them
if "\r\n" in src:
    OLD = OLD.replace("\n", "\r\n")
    NEW = NEW.replace("\n", "\r\n")
if "eng[r0[\"emp\"] + \"|\" + r0[\"date\"]] = r0" in src:
    print("ok: " + NAME + " is already patched")
elif src.count(OLD) != 1:
    print("STOP: the save loop in " + NAME + " is not as expected (found " + str(src.count(OLD)) + " times) -- nothing changed")
else:
    print(W + "patch " + NAME + ": keep visits, kind, forced, joint, other work, centre HQ on each day")
    if not DRY:
        ss.script = src.replace(OLD, NEW)
        ss.save(ignore_permissions=True)
    if REBUILD:
        print(W + "ask the build to re-save " + REBUILD + " (next hourly run, or Execute field_expense___build_hourly_long)")
        if not DRY:
            frappe.db.set_value("Field Expense Settings", "Field Expense Settings", "build_request", REBUILD)

print("done" if not DRY else "DRY RUN: nothing changed. Set DRY = False, tick Commit, run again.")
