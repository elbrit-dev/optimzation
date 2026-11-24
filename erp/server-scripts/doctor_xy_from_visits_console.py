# SYSTEM CONSOLE -- fills the location of active doctors (Lead) that have none, from the GPS the
# reps saved on their visits. Works it out from the ERP's own data every time it runs: nothing is
# hard-coded, so a re-run next week picks up the doctors visited since.
# Desk > System Console, type Python: paste all of this.
#   1) DRY = True, "Commit" unticked: only prints what it would do.
#   2) DRY = False, tick "Commit", Execute.
# Safe to re-run: a doctor whose custom_latitude_and_longitude is already filled is never touched.
#
# Which doctors: Active Leads with custom_latitude_and_longitude empty ('', 'null', '{}').
#   a) their own custom_latitude / custom_longitude are set -> the combined field is built from those.
#   b) else: every Employee participant's latitude/longitude on the doctor's visit Events since SINCE
#      (force AND normal visits; points outside India / 0,0 dropped). The point with the most other
#      points within NEAR metres is the centre of the tightest group; the doctor's x,y = the median of
#      that group, so a force visit marked from far away does not pull it. Kinds:
#        agreed    2+ visit points within NEAR m of each other -> the middle of that group
#        single    only one visit point                      -> that point
#        scattered 2+ points, none within NEAR m of another   -> the point closest to all the others
#   Doctors with no visit GPS (only planned visits, only backdated ones, or no visit) are left as they are.
#
# Map Town: NOT done here. The "Field Expense - Map Town Fill" scheduler (every minute, 300 doctors a
# run, Mapbox) names the town for every active doctor with custom_latitude_and_longitude filled and
# custom_map_town_point empty -- this script empties custom_map_town_point so it picks them up.
#
# Uses frappe.db.set_value (no doc.save): many doctor Leads have the mandatory custom_doctor_code
# empty and would refuse a save. safe_exec: no import, no tuple unpacking, no underscore names; the
# one def reads no top-level names (its helpers are nested in it).

DRY = True
WRITE = ["agreed", "single", "scattered"]   # take a kind out to skip it
ALSO_SEPARATE = True        # also set custom_latitude / custom_longitude -- the app's 500 m visit
                            # check reads these; False = only the combined x/y field
SINCE = "2000-01-01"        # visits from this day on: every visit (18 Nov 2026, the user: any doctor
                            # with visit GPS gets filled, the rest stay as they are)
NEAR = 200                  # metres: visit points this close count as the same place
SHOW = 15                   # doctors listed in the output


def place(pts, near):
    # pts [[lat, lng], ...] -> [kind, x, y, points in the group]
    def metres(a, b):
        # flat-earth distance: exact enough at a few hundred metres
        x = (a[0] + b[0]) / 2 * 0.017453292519943295
        x2 = x * x
        cos = 1 - x2 / 2 + x2 * x2 / 24 - x2 * x2 * x2 / 720
        dy = (b[0] - a[0]) * 111195.0
        dx = (b[1] - a[1]) * 111195.0 * cos
        return (dx * dx + dy * dy) ** 0.5

    def median(xs):
        s = list(xs)
        s.sort()
        m = len(s) // 2
        if len(s) % 2:
            return s[m]
        return (s[m - 1] + s[m]) / 2

    best = -1
    bestsum = 0
    group = []
    for a in pts:
        g = []
        total = 0
        for b in pts:
            d = metres(a, b)
            total = total + d
            if d <= near:
                g.append(b)
        # most neighbours wins; a tie goes to the point closest to all the others
        if len(g) > best or (len(g) == best and total < bestsum):
            best = len(g)
            bestsum = total
            group = g
    lat = []
    lng = []
    for g in group:
        lat.append(g[0])
        lng.append(g[1])
    kind = "agreed" if len(group) >= 2 else "scattered"
    if len(pts) == 1:
        kind = "single"
    return [kind, float("%.7f" % median(lat)), float("%.7f" % median(lng)), len(group)]


W = "WOULD " if DRY else ""
flt = frappe.utils.flt
xy = lambda x, y: '{"x":' + str(x) + ',"y":' + str(y) + '}'

empty = frappe.db.sql("""select count(*) from `tabLead` where status = 'Active'
    and ifnull(custom_latitude_and_longitude, '') in ('', 'null', '{}')""")[0][0]
print("active doctors with no location: " + str(empty) + " | visits since " + SINCE)
shown = 0
done = 0

# a) own custom_latitude / custom_longitude, combined field empty
own = frappe.db.sql("""select name, custom_latitude, custom_longitude from `tabLead`
    where status = 'Active' and ifnull(custom_latitude_and_longitude, '') in ('', 'null', '{}')
      and abs(ifnull(custom_latitude, 0)) > 1 and abs(ifnull(custom_longitude, 0)) > 1""", as_dict=True)
own_names = {}
for r in own:
    own_names[r.name] = 1
    if shown < SHOW:
        print(W + "set " + r.name + " from its own latitude/longitude: " + xy(r.custom_latitude, r.custom_longitude))
        shown = shown + 1
    if not DRY:
        frappe.db.set_value("Lead", r.name, {"custom_latitude_and_longitude": xy(r.custom_latitude, r.custom_longitude),
                                            "custom_map_town_point": ""}, update_modified=False)
    done = done + 1

# b) from the visits: the reps' GPS on each doctor's visit Events since SINCE
rows = frappe.db.sql("""select e.custom_doctor as doc, p.custom_latitude as la, p.custom_longitude as lo
    from `tabEvent` e
    join `tabEvent Participants` p on p.parent = e.name and p.parenttype = 'Event' and p.reference_doctype = 'Employee'
    join `tabLead` l on l.name = e.custom_doctor
    where e.starts_on >= %s and l.status = 'Active'
      and ifnull(l.custom_latitude_and_longitude, '') in ('', 'null', '{}')
    order by e.name, p.idx""", (SINCE,), as_dict=True)
pts = {}
order = []
for r in rows:
    la = flt(r.la)
    lo = flt(r.lo)
    if la > 6 and la < 37 and lo > 68 and lo < 98:      # India; drops 0,0 and junk
        if r.doc not in pts:
            pts[r.doc] = []
            order.append(r.doc)
        pts[r.doc].append([la, lo])

kinds = {"agreed": 0, "single": 0, "scattered": 0}
left = 0
for name in order:
    if own_names.get(name):
        continue
    v = place(pts[name], NEAR)
    kinds[v[0]] = kinds[v[0]] + 1
    if v[0] not in WRITE:
        left = left + 1
        continue
    upd = {"custom_latitude_and_longitude": xy(v[1], v[2]), "custom_map_town_point": ""}
    if ALSO_SEPARATE:
        upd["custom_latitude"] = v[1]
        upd["custom_longitude"] = v[2]
    if shown < SHOW:
        print(W + "set " + name + " " + upd["custom_latitude_and_longitude"] + " (" + v[0] + ", " + str(v[3]) + " of " + str(len(pts[name])) + " visit points)")
        shown = shown + 1
    if not DRY:
        frappe.db.set_value("Lead", name, upd, update_modified=False)
    done = done + 1

print("")
print("from own lat/long: " + str(len(own)) + " | from visits: agreed " + str(kinds["agreed"]) + ", single " + str(kinds["single"])
      + ", scattered " + str(kinds["scattered"]) + " | left out (kind not in WRITE): " + str(left))
print(W + "fill " + str(done) + " doctors | still without a location after this: " + str(empty - done))
print("dry run -- nothing changed." if DRY else "done -- Map Town fills itself within a few minutes (300 doctors a minute).")
