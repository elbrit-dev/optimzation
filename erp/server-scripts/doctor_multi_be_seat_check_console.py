# SYSTEM CONSOLE -- READ ONLY. How many active doctors are mapped to more than one BE seat, and in how
# many of those do two of the BE seats share a manager seat up to SM (ABM, DRBM, RBM, Sr RBM, SM)?
# (19 Nov 2026.) That shared-manager case is the only one where the Manager Locality rule has to
# choose between BE seats (it then takes the nearest). Changes nothing; "Commit" can stay unticked.
# Desk > System Console, type Python, as Administrator, paste, Execute.

SHOW = 15
UP_TO_SM = ["ABM", "DRBM", "RBM", "SRRBM", "SM"]

parent = {}
holder = {}
for s in frappe.db.sql("""select name, parent_role_profile, custom_employee_id from `tabRole Profile`""", as_dict=True):
    parent[s.name] = s.parent_role_profile
    holder[s.name] = s.custom_employee_id or "vacant"

seats = {}
for x in frappe.db.sql("""select m.parent, m.role_profile_list from `tabRole Profile Multiselect` m
        join `tabLead` l on l.name = m.parent and l.status = 'Active'
        where m.parenttype = 'Lead' and m.parentfield = 'custom_role_profile' and m.role_profile_list like 'BE%%'""", as_dict=True):
    if x.role_profile_list not in seats.setdefault(x.parent, []):
        seats[x.parent].append(x.role_profile_list)

multi = [d for d in seats if len(seats[d]) > 1]
shared = []
for d in multi:
    s = seats[d]
    chains = {}
    for b in s:
        c = []
        p = parent.get(b)
        n = 0
        while p and n < 20:
            c.append(p)
            p = parent.get(p)
            n = n + 1
        chains[b] = c
    hit = None
    i = 0
    while i < len(s) and not hit:
        j = i + 1
        while j < len(s) and not hit:
            for a in chains[s[i]]:
                role = "".join([ch for ch in a.split("-")[0] if ch.isalpha()]).upper()
                if a in chains[s[j]] and role in UP_TO_SM:
                    hit = [s[i], s[j], a]
                    break
                if a in chains[s[j]]:
                    break
            j = j + 1
        i = i + 1
    if hit:
        shared.append([d, hit])

print("active doctors mapped to a BE seat: " + str(len(seats)))
print("  mapped to 2+ BE seats: " + str(len(multi)))
print("  ...of which 2 BE seats share a manager up to SM: " + str(len(shared)))
for x in shared[:SHOW]:
    h = x[1]
    print("   " + x[0] + ": " + h[0] + " (" + holder.get(h[0], "?") + ") + " + h[1] + " (" + holder.get(h[1], "?") + ") -> both under " + h[2])
if multi and not shared:
    print("  examples of 2+ seats in different teams (each manager takes his own BE -- no choice needed):")
    for d in multi[:5]:
        print("   " + d + ": " + ", ".join(seats[d]))
