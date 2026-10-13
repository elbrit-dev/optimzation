# GM / CEO logins: own role profile each, full access.
# Paste into ERP > System Console (type Python), logged in as a System Manager.
# 1) Run with DRY = True and "Commit" UNticked: it only prints what it would do.
# 2) Set DRY = False, tick "Commit", run again.
#
#   Prakash (CEO)  ceo@elbrit.org       User role profile -> "CEO"
#   Rajkumar (GM)  rajkumar@elbrit.org  User role profile -> "GM"
# FULL ACCESS = the profile gets every role the "Admin" profile has. The GM
# profile never gets the CEO role (the workflow would let him approve at the
# CEO step).
# Only the USER logins change. Employee records stay (E00001 Admin, E00003
# Sales): "Sales" is Rajkumar's seat in the tree, the parent of every SM- seat.

DRY = True

PLAN = [
    {"user": "ceo@elbrit.org", "profile": "CEO", "keep_off": []},
    {"user": "rajkumar@elbrit.org", "profile": "GM", "keep_off": ["CEO"]},
]

W = "WOULD " if DRY else ""
admin = frappe.get_doc("Role Profile", "Admin")

for p in PLAN:
    name = p["profile"]
    rp = frappe.get_doc("Role Profile", name)

    # who else is on this profile -- they would get full access too
    others = []
    for u in frappe.get_all("User", filters={"role_profile_name": name}, pluck="name"):
        if u != p["user"]:
            others.append(u)
    if others:
        print("STOP " + name + ": other users are on this profile " + str(others) + " -- not changing it")
        continue

    have = []
    for r in rp.roles:
        have.append(r.role)
    add = []
    for r in admin.roles:
        if r.role not in have and r.role not in p["keep_off"] and r.role not in add:
            add.append(r.role)
    drop = []
    for r in have:
        if r in p["keep_off"]:
            drop.append(r)
    if add:
        print(W + "add " + str(len(add)) + " roles to profile " + name)
    if drop:
        print(W + "remove " + ", ".join(drop) + " from profile " + name)
    if not add and not drop:
        print("ok: profile " + name + " already full")
    if not DRY and (add or drop):
        keep = []
        for r in rp.roles:
            if r.role not in drop:
                keep.append({"role": r.role})
        for r in add:
            keep.append({"role": r})
        rp.set("roles", keep)
        rp.save(ignore_permissions=True)

    u = frappe.get_doc("User", p["user"])
    if u.role_profile_name == name:
        print("ok: " + p["user"] + " already on " + name)
    else:
        print(W + "set " + p["user"] + " role profile " + str(u.role_profile_name) + " -> " + name)
    if not DRY:
        u = frappe.get_doc("User", p["user"])
        u.role_profile_name = name
        if frappe.get_meta("User").has_field("role_profiles"):
            u.set("role_profiles", [{"role_profile": name}])
        u.save(ignore_permissions=True)

if not DRY:
    for p in PLAN:
        roles = frappe.get_all("Has Role", filters={"parent": p["user"], "parenttype": "User"}, pluck="role")
        print(p["user"] + ": " + str(len(roles)) + " roles; GM=" + str("GM" in roles) + " CEO=" + str("CEO" in roles))
print("DRY RUN done: nothing changed. Set DRY = False, tick Commit, run again." if DRY else "Done. Both should log out and back in.")
