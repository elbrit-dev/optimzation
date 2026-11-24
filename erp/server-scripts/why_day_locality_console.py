# SYSTEM CONSOLE -- the "Why this day" pop-up explains the Locality rules, not the old GPS checks (19 Nov 2026).
# Goes on top of locality_fixes_console.py. Prod. System Console, Python, Administrator.
#   1) DRY = True, "Commit" unticked: checks the anchor.  2) DRY = False, tick "Commit", Execute.
# Safe to re-run (marker "Why-this-day Locality"). Also fixes the far-from-check-in guard (forced check-ins
# count) -- that changes amounts on a few days, so after it: October -> "Pull road km & save" once more.
#
# A day priced by the Locality rules now reads, under DAY TYPE:
#   BE:       [x] Start: his base area · Kumbakonam (seat Locality)
#   manager:  [x] OS: a doctor of his BE away from his HQ · Vellore · from Katpadi     (OS day)
#             [x] At own HQ · from Avadi                                             (not OS)
#   all:      [x] Farthest doctor's area · Sembanarkoil · 57.4 km, Locality centre to centre
#             [ ] Within 22.5 km · 57.4 km both ways                 ([x] ... no TA, when under 22.5)
# A day still on GPS keeps the old lines and adds:
#             [ ] Locality rule · seat BE7-ELBR-CH-CHE has no Locality · measured by GPS

DRY = True
MARK = "Why-this-day Locality"

OLD = """          var atOwn = dt === 'HQ';
          d.push(tick(atOwn, 'At own HQ', esc(atOwn ? own : centre + ', not ' + own)));
          if (!atOwn) d.push(tick(isOS, esc(centre) + ' is his OS HQ',
            isOS ? (big ? 'his department' : 'his team') : role === 'BE' ? 'BE: no OS' : big ? 'not his department' : 'no team there'));
          if (!meet) d.push(tick(atOwn ? !r.hqEq : /-HQ$/.test(dt), 'Farthest visit within ' + S.hqKm + ' km',
            (r.km !== null && r.km !== undefined ? km(r.km) : '') + (far ? ' · ' + esc(far) : '')));
          if (r.sfc && r.sfc.wayVia) d.push(tick(true, esc(r.sfc.wayVia) + ' on the way', 'no EQ run'));"""

NEW = """          // Why-this-day Locality (2026-11-19): a Locality-rule day explains the Locality rule
          if (r.n && r.sfc && r.sfc.beLoc !== undefined) {
            var wlf = String(r.sfc.beFrom || '').replace(/\\s*\\(HQ\\)$/, ''), wlt = r.sfc.beTo || wlf;
            var wkm = r.sfc.km !== null && r.sfc.km !== undefined ? r.sfc.km : r.km;
            var wos = /^OS-/.test(dt);
            if (role === 'BE') d.push(tick(true, 'Start: his base area', esc(wlf) + ' (seat Locality)'));
            else if (wos) d.push(tick(true, 'OS: a doctor of his BE away from his HQ', esc(nm(r.osHq || '')) + ' · from ' + esc(wlf)));
            else d.push(tick(true, 'At own HQ', 'from ' + esc(wlf)));
            d.push(tick(true, 'Farthest doctor\\'s area', esc(wlt) + ' · ' + r.sfc.beLoc + ' km, Locality centre to centre'));
            var wwithin = !(wkm >= S.hqKm) && !r.hqEq;
            d.push(tick(wwithin, 'Within 22.5 km', wwithin ? 'no TA' : wkm + ' km both ways'));
          } else {
          var atOwn = dt === 'HQ';
          d.push(tick(atOwn, 'At own HQ', esc(atOwn ? own : centre + ', not ' + own)));
          if (!atOwn) d.push(tick(isOS, esc(centre) + ' is his OS HQ',
            isOS ? (big ? 'his department' : 'his team') : role === 'BE' ? 'BE: no OS' : big ? 'not his department' : 'no team there'));
          if (!meet) d.push(tick(atOwn ? !r.hqEq : /-HQ$/.test(dt), 'Farthest visit within ' + S.hqKm + ' km',
            (r.km !== null && r.km !== undefined ? km(r.km) : '') + (far ? ' · ' + esc(far) : '')));
          if (r.locMiss) d.push(tick(false, 'Locality rule', esc(r.locMiss) + ' · measured by GPS'));
          }
          if (r.sfc && r.sfc.wayVia) d.push(tick(true, esc(r.sfc.wayVia) + ' on the way', 'no EQ run'));"""

# Guard fix (19 Nov 2026, found on E01175 6 Oct / E01123 12 Oct): a doctor whose saved location is wrong is
# exactly the one his BE has to FORCE-check-in (the app's 500 m check fails), so forced check-ins count for
# the "Locality far from the check-in" guard too; only "Migrated from Ecubix" ones are ignored. This one
# changes amounts on those days -> after the run, October: "Pull road km & save" once more.
OLD2 = """      if (e.custom_doctor && usable(la, lo) && Number(r.custom_is_force_visit) !== 1 && !v.dpt[e.custom_doctor]) v.dpt[e.custom_doctor] = [la, lo];"""
NEW2 = """      // forced check-ins count too (a wrong Lead point is exactly what forces one); Ecubix migrations do not (2026-11-19)
      if (e.custom_doctor && usable(la, lo) && !/migrated from ecubix/i.test(String(r.custom_force_visit_reason || '')) && !v.dpt[e.custom_doctor]) v.dpt[e.custom_doctor] = [la, lo];"""

W = "WOULD " if DRY else ""
page = frappe.get_doc("Web Page", "field-expenses")
js = (page.javascript or "").replace("\r\n", "\n")
new_js = None
if MARK in js:
    print("ok: already patched (Why-this-day Locality)")
elif "Manager Locality rule, revised" not in js:
    print("NOT patched: run locality_fixes_console.py first")
elif js.count(OLD) != 1:
    print("NOT patched: the Why-this-day block found " + str(js.count(OLD)) + " times, expected 1")
elif js.count(OLD2) != 1:
    print("NOT patched: the guard's check-in line found " + str(js.count(OLD2)) + " times, expected 1")
else:
    new_js = js.replace(OLD, NEW).replace(OLD2, NEW2)
    print(W + "patch /field-expenses page JavaScript (2 edits, " + str(len(js)) + " -> " + str(len(new_js)) + " chars)")

if not DRY and new_js:
    now = str(frappe.utils.now_datetime())
    stamp = now[0:4] + now[5:7] + now[8:10] + "-" + now[11:13] + now[14:16]
    frappe.get_doc({"doctype": "File", "file_name": "field-expenses-js-before-why-day-" + stamp + ".js",
                    "attached_to_doctype": "Web Page", "attached_to_name": "field-expenses", "is_private": 1,
                    "content": page.javascript}).insert(ignore_permissions=True)
    page.javascript = new_js
    page.save(ignore_permissions=True)
    frappe.db.commit()
    print("done -- backup attached. Open /field-expenses (Ctrl+Shift+R) and a day's \"Why this day\".")
elif DRY:
    print("dry run -- nothing changed.")
