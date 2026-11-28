# SYSTEM CONSOLE -- HR, PMT, Accounts and CFA see every page's data (prod, 28 Nov 2026).
# Found 28 Nov: Ameen (PMT, BO-MKT-SPX1) and Vikram Babu (HR, BO-HR-SHRM1) saw nothing on Home,
# Primary, Secondary, Support or Visits. Cause: the "Auto User Permissions" script (16 Nov) adds a
# Department permission on ALL DocTypes whenever an Employee is saved -- HR saved both on 27 Nov,
# so they were pinned to "Marketing - ELPL" / "HR - ELPL", which no sales record carries.
#
# FULL-VIEW SEATS (the user, 28 Nov): HR, PMT, Accounts and CFA --
#   seat BO-HR-*, BO-MKT-*, BO-ACC-*, or "CFA" anywhere in the seat or its role template
#   (BO-DIST-CFAM1, BO-DIST-BIL1 = template "CFA Coimbatore", "cfa admin", old "CFA Coimbatore" logins).
#   1. Auto User Permissions: no Department permission for those seats (a re-save also removes it)
#   2. their existing all-DocTypes Department permissions are deleted
#   3. Elbrit Visit Summary + Elbrit Visit Rows: those seats see every visit (visits are private Events)
#   4. read access their roles lacked: Doctor Support (User PMT, Accounts User),
#      Secondary Data Entry (Accounts User, CFA Billing Operator), Lead (Accounts User)
# Doctor Service is NOT opened (the user: leave Service).
# Each script patch is applied only if prod still has the expected text exactly once (else that
# script is left as it is); each script is saved first as a private File.
# Paste into ERP > System Console (type Python), logged in as Administrator, TICK "Commit", Execute.

SEATS = ("BO-HR-", "BO-MKT-", "BO-ACC-")
STAMP = str(frappe.utils.now())[:16].replace("-", "").replace(":", "").replace(" ", "-")

VISIT_OLD = ("    if (frappe.db.get_value(\"Role Profile\", frappe.db.get_value(\"User\", frappe.session.user, \"role_profile_name\") or \"-\", \"custom_role_template\")"
             " or frappe.db.get_value(\"User\", frappe.session.user, \"role_profile_name\")) in ALL_VISITS_PROFILES:\n")
VISIT_NEW = ("    # HR, PMT, Accounts and CFA seats see every visit too (28 Nov 2026).\n"
             "    rp = frappe.db.get_value(\"User\", frappe.session.user, \"role_profile_name\") or \"\"\n"
             "    tpl = (frappe.db.get_value(\"Role Profile\", rp, \"custom_role_template\") if rp else \"\") or \"\"\n"
             "    if (tpl or rp) in ALL_VISITS_PROFILES or rp.startswith((\"BO-HR-\", \"BO-MKT-\", \"BO-ACC-\")) or \"cfa\" in (rp + \" \" + tpl).lower():\n")

AUP_OLD = "    # 1. Department\n    if doc.department:\n        add_perm(user, \"Department\", doc.department)\n"
AUP_NEW = ("    # 1. Department -- not for HR / PMT / Accounts / CFA seats (BO-HR-*, BO-MKT-*, BO-ACC-*, \"CFA\"\n"
           "    #    in the seat or its template): they see every division; a Department permission on all\n"
           "    #    DocTypes hid every sales record from them (28 Nov 2026)\n"
           "    seat = doc.get(\"custom_role_profile\") or frappe.db.get_value(\"User\", user, \"role_profile_name\") or \"\"\n"
           "    tpl = (frappe.db.get_value(\"Role Profile\", seat, \"custom_role_template\") if seat else \"\") or \"\"\n"
           "    open_seat = seat.startswith((\"BO-HR-\", \"BO-MKT-\", \"BO-ACC-\")) or \"cfa\" in (seat + \" \" + tpl).lower()\n"
           "    if open_seat:\n"
           "        for name in frappe.get_all(\"User Permission\",\n"
           "                filters={\"user\": user, \"allow\": \"Department\", \"apply_to_all_doctypes\": 1},\n"
           "                pluck=\"name\"):\n"
           "            frappe.delete_doc(\"User Permission\", name, ignore_permissions=True)\n"
           "    if doc.department and not open_seat:\n"
           "        add_perm(user, \"Department\", doc.department)\n")

PATCHES = [
    ["Auto User Permissions", AUP_OLD, AUP_NEW, "open_seat = "],
    ["Elbrit Visit Summary", VISIT_OLD, VISIT_NEW, "\"BO-ACC-\""],
    ["Elbrit Visit Rows", VISIT_OLD, VISIT_NEW, "\"BO-ACC-\""],
]

for p in PATCHES:
    sc = frappe.get_doc("Server Script", p[0])
    src = sc.script.replace("\r\n", "\n")
    if p[3] in src:
        print(p[0] + ": already patched -- nothing to do")
    elif src.count(p[1]) != 1:
        print(p[0] + ": STOPPED -- prod text differs from what this patch expects; left unchanged")
    else:
        frappe.get_doc({"doctype": "File", "file_name": p[0].lower().replace(" ", "-") + "-before-full-view-" + STAMP + ".py",
                        "content": sc.script, "is_private": 1, "attached_to_doctype": "Server Script",
                        "attached_to_name": p[0]}).insert(ignore_permissions=True)
        sc.script = src.replace(p[1], p[2])
        sc.save(ignore_permissions=True)
        print(p[0] + ": patched")

# 2. The all-DocTypes Department permissions already made for full-view seat holders.
#    A login's seat: its Active Employee's role profile, else the User's own role profile.
tpl_of = {}
for r in frappe.get_all("Role Profile", fields=["name", "custom_role_template"], limit_page_length=0):
    tpl_of[r.name] = r.custom_role_template or ""
seats_of = {}
for u in frappe.get_all("User", filters={"enabled": 1}, fields=["name", "role_profile_name"], limit_page_length=0):
    seats_of[u.name] = [u.role_profile_name or ""]
for e in frappe.get_all("Employee", filters={"status": "Active", "user_id": ["is", "set"]},
                        fields=["user_id", "custom_role_profile"], limit_page_length=0):
    if e.user_id in seats_of and e.custom_role_profile:
        seats_of[e.user_id].append(e.custom_role_profile)
removed = 0
for up in frappe.get_all("User Permission", filters={"allow": "Department", "apply_to_all_doctypes": 1},
                         fields=["name", "user", "for_value"], limit_page_length=0):
    hit = ""
    for s in seats_of.get(up.user) or []:
        if s and (s.startswith(SEATS) or "cfa" in (s + " " + tpl_of.get(s, "")).lower()):
            hit = s
    if hit:
        frappe.delete_doc("User Permission", up.name, ignore_permissions=True)
        removed = removed + 1
        print("  removed Department " + up.for_value + " from " + up.user + " (" + hit + ")")
print("Department permissions removed: " + str(removed))

# 4. Read access the full-view roles lacked (saving a Custom DocPerm clears that DocType's cache)
GRANTS = [
    ["Doctor Support", "User PMT"],
    ["Doctor Support", "Accounts User"],
    ["Secondary Data Entry", "Accounts User"],
    ["Secondary Data Entry", "CFA Billing Operator"],
    ["Lead", "Accounts User"],
]
for g in GRANTS:
    existing = frappe.db.get_value("Custom DocPerm", {"parent": g[0], "role": g[1], "permlevel": 0}, "name")
    if existing:
        dp = frappe.get_doc("Custom DocPerm", existing)
        if dp.read and dp.report:
            print(g[0] + " / " + g[1] + ": already readable")
            continue
        dp.read = 1
        dp.report = 1
        dp.save(ignore_permissions=True)
        print(g[0] + " / " + g[1] + ": read ticked on the existing row")
    else:
        frappe.get_doc({"doctype": "Custom DocPerm", "parent": g[0], "parenttype": "DocType",
                        "parentfield": "permissions", "role": g[1], "permlevel": 0,
                        "read": 1, "report": 1}).insert(ignore_permissions=True)
        print(g[0] + " / " + g[1] + ": read added")

print("done. Saved only if Commit was ticked. Ask those users to log out and in again.")
