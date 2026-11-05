# Sales entry of Doctor Services (5 Nov 2026): ABMs, RBMs and SMs may now
# enter a service for their own doctors, behind the ROI gate that the
# "Doctor Service Guard" enforces on save. Saving needs create + write on
# Doctor Service: ABM (and BE) already have both; RBM and SM can only read.
#
# Paste into ERP > System Console (type Python), logged in as a System Manager.
# 1) Run with DRY = True and "Commit" UNticked: it only prints what it would do.
# 2) Set DRY = False, tick "Commit", run again.
# Safe to re-run: a role that already has the rights is skipped.
#
# What it does: on Doctor Service's role permissions (Custom DocPerm, level 0)
# sets create = 1 and write = 1 for the RBM and SM roles, as ABM has. Nothing
# else changes. The guard still decides WHAT they may save (only for
# themselves, only past the ROI bar), and locks app services once in approval.
#
# safe_exec: no import, no .format(), no set literals, no tuple unpacking,
# no underscore-prefixed names.

DRY = True

DT = "Doctor Service"
ROLES = ["RBM", "SM", "ABM"]
W = "WOULD " if DRY else ""

for role in ROLES:
    if not frappe.db.exists("Role", role):
        print("skip: no role " + role)
        continue
    rows = frappe.get_all("Custom DocPerm", filters={"parent": DT, "role": role, "permlevel": 0},
                          fields=["name", "read", "write", "create", "if_owner"])
    if not rows:
        print(W + "add " + role + ": read + write + create")
        if not DRY:
            frappe.get_doc({"doctype": "Custom DocPerm", "parent": DT, "parenttype": "DocType",
                            "parentfield": "permissions", "role": role, "permlevel": 0,
                            "read": 1, "write": 1, "create": 1}).insert(ignore_permissions=True)
        continue
    for r in rows:
        if r.get("write") and r.get("create"):
            print("ok: " + role + " already has write + create")
            continue
        print(W + "set " + role + ": write + create (was write=" + str(r.get("write"))
              + ", create=" + str(r.get("create")) + ")")
        if not DRY:
            # saved as a document, so its own save clears Doctor Service's
            # cache (frappe.clear_cache is not allowed in the console)
            perm = frappe.get_doc("Custom DocPerm", r.get("name"))
            perm.read = 1
            perm.write = 1
            perm.create = 1
            perm.save(ignore_permissions=True)

if DRY:
    print("DRY RUN: nothing changed. Set DRY = False, tick Commit, run again.")
