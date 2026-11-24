# SYSTEM CONSOLE -- "Why this day" shows each doctor's BE seat (20 Nov 2026, the user).
# A manager's Locality day is decided by the BE seat each doctor is mapped to. The pop-up now lists them,
# so a day can be checked by looking, without running a query:
#
#   DOCTORS AND THEIR BE
#   Doctor                   Doctor's area  BE seat           Held by   Measured from  km    Counts as
#   Dr K Meenakshi Sundaram  Mayor Nagar    BE6-AURA-CO-SAL   vacant    Namakkal       52.3  OS  (farthest, bold)
#   Dr SARANYA DINESH        Rasipuram      BE6-AURA-CO-SAL   vacant    Namakkal       ...   OS
#
#   Held by = the active employee on that seat who had joined by that day; "vacant · Suresh Chandrasekar
#   joined 10 Nov" when the seat was empty then. Counts as: OS (the BE's base area is over 30 km from his HQ),
#   his BE (base area inside his HQ), no BE of his (measured from his HQ), near home (left to the journey).
# Also: the "Within 22.5 km" line reads "paid on 60.2 km both ways" on an EQ-type day (the +10 km),
# so it no longer looks like a second distance.
# Display only -- not saved in the day record, nothing to re-save. Reload the month to see it.
# Prod. System Console, Python, Administrator.
#   1) DRY = True, "Commit" unticked.  2) DRY = False, tick "Commit", Execute.  Then Ctrl+Shift+R.
# Safe to re-run (marker "Why-this-day BE mapping"). Backup of the page JavaScript saved first.

DRY = True
MARK = "Why-this-day BE mapping"

EDITS = [
    ["doctor of his BE: keep name and seat",
     """        docs.push({ kind: away ? 'os' : 'own', km: pk, from: sl, to: l, hq: away ? (th && !own[cityKey(th)] ? th : sl) : null });""",
     """        docs.push({ kind: away ? 'os' : 'own', km: pk, from: sl, to: l, hq: away ? (th && !own[cityKey(th)] ? th : sl) : null, nm: nm, seat: pick });""", 1],
    ["doctor of no BE of his: keep name and seat",
     """        docs.push({ kind: 'eq', km: kmBetween(hc.pt, b, hc.name, l), from: hc.name + ' (HQ)', to: l });""",
     """        docs.push({ kind: 'eq', km: kmBetween(hc.pt, b, hc.name, l), from: hc.name + ' (HQ)', to: l, nm: nm, seat: seatsD[0] || null, other: seatsD.length ? 1 : 0 });""", 1],
    ["list the doctors for the pop-up",
     """    const live = docs.filter(d => !d.skip);
    const missing = live.some(d => d.km === null);""",
     """    const live = docs.filter(d => !d.skip);
    // Why-this-day BE mapping (the user, 2026-11-20): [doctor, area, seat, seat base area, kind, km, near home, from, not his team]
    LOC_DOCS = docs.map(d => [d.nm || '', d.to || '', d.seat || '', d.seat ? (SEAT_LOC[d.seat] || '') : '', d.kind,
      d.km === null || d.km === undefined ? null : Math.round(d.km * 10) / 10, d.skip ? 1 : 0, d.from || '', d.other ? 1 : 0]);
    const missing = live.some(d => d.km === null);""", 1],
    ["holder of each seat on the day",
     """  let LOC_WHY = null;""",
     """  let LOC_WHY = null, LOC_DOCS = null;
  // Why-this-day BE mapping (the user, 2026-11-20): who held each doctor's BE seat that day
  const SEAT_HOLD = {};
  employees.forEach(x => { const s = ((inp.roleProfiles || {}).employeeSeat || {})[x.code];
    if (s && master[x.code] && master[x.code].status === 'Active') (SEAT_HOLD[s] = SEAT_HOLD[s] || []).push(x); });
  const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const mgrBeDocs = (xs, ds) => xs && xs.length ? xs.map(x => {
    if (!x[2]) return x.concat(['']);
    const hs = SEAT_HOLD[x[2]] || [], on = hs.filter(p => !p.doj || p.doj <= ds), later = hs.filter(p => p.doj && p.doj > ds);
    return x.concat([on.length ? on.map(p => p.name).join(', ')
      : 'vacant' + (later.length ? ' · ' + later[0].name + ' joined ' + (+later[0].doj.slice(8, 10)) + ' ' + MON3[+later[0].doj.slice(5, 7) - 1] : '')]);
  }) : undefined;""", 1],
    ["reset before each manager day",
     """      { LOC_WHY = null; const md = mgrDay(e, v);""",
     """      { LOC_WHY = null; LOC_DOCS = null; const md = mgrDay(e, v);""", 1],
    ["keep the list on the day",
     """                 beLoc: md.raw, beFrom: md.from || undefined, beTo: md.to || undefined, mgrTown: md.type === 'EQ-HQ' || undefined };""",
     """                 beLoc: md.raw, beFrom: md.from || undefined, beTo: md.to || undefined, mgrTown: md.type === 'EQ-HQ' || undefined,
                 beDocs: mgrBeDocs(LOC_DOCS, ds) };""", 1],
    ["pass it to the screen",
     """                    addKm: sf.addKm || undefined,   // EQ_ADD_KM: the 10 km added on an EQ-type day""",
     """                    addKm: sf.addKm || undefined,   // EQ_ADD_KM: the 10 km added on an EQ-type day
                    beDocs: sf.beDocs || undefined,   // Why-this-day BE mapping: each doctor's BE seat (display only)""", 1],
    ["Within 22.5 km: say the paid km",
     """            d.push(tick(wwithin, 'Within 22.5 km', wwithin ? 'no TA' : wkm + ' km both ways'));""",
     """            d.push(tick(wwithin, 'Within 22.5 km', wwithin ? 'no TA' : (r.sfc.addKm ? 'paid on ' : '') + wkm + ' km both ways'));""", 1],
    ["pop-up: doctors and their BE",
     """    var out = sec('Day type', badge, d.join(''));
    if (!r.payable) return out;""",
     """    var out = sec('Day type', badge, d.join(''));
    // Why-this-day BE mapping (the user, 2026-11-20): the BE seat each doctor is mapped to, its base area and who held it
    if (r.sfc && r.sfc.beDocs && r.sfc.beDocs.length) {
      var bd = r.sfc.beDocs.slice().sort(function (p, q) { return (p[6] - q[6]) || ((q[5] || 0) - (p[5] || 0)); });
      var bdFar = -1;
      bd.forEach(function (x, i) { if (bdFar < 0 && !x[6] && x[5] !== null && x[1] === r.sfc.beTo) bdFar = i; });
      var bdKind = { os: 'OS', own: 'his BE', eq: 'no BE of his' };
      var bdTip = { os: 'the BE\\'s base area is over 30 km from his HQ', own: 'the BE\\'s base area is in his HQ', eq: 'measured from his HQ' };
      var th = function (t, right) { return '<th style="text-align:' + (right ? 'right' : 'left') + ';font-weight:500;font-size:11px;color:var(--ink-3);padding:4px 8px 4px 0;white-space:nowrap;border-bottom:1px solid var(--line)">' + t + '</th>'; };
      var td = function (t, st) { return '<td style="padding:4px 8px 4px 0;border-bottom:1px solid var(--surface-2);' + (st || '') + '">' + t + '</td>'; };
      // the BE as "name · his base-area Locality", the seat under it (the user, 2026-11-20)
      var grey = function (t) { return '<div style="font-size:11px;color:var(--ink-3);font-weight:400">' + t + '</div>'; };
      var beCell = function (x) {
        if (!x[2]) return '<span style="color:var(--ink-3)">not mapped to a BE</span>';
        var who = x[9] || '', vac = /^vacant/.test(who), nmB = vac ? 'Vacant' : who, later = vac ? who.replace(/^vacant\\s*·?\\s*/, '') : '';
        return '<span style="' + (vac ? 'color:var(--critical);' : '') + 'font-weight:500">' + esc(nmB) + '</span>' +
          (x[3] ? ' · ' + esc(x[3]) : ' · <span style="color:var(--critical)">no base area</span>') +
          grey(esc(x[2]) + (later ? ' · ' + esc(later) : '') + (x[8] ? ' · not his team' : ''));
      };
      out += sec('Doctors and their BE', '', '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12.5px">' +
        '<thead><tr>' + th('Doctor') + th('Doctor\\'s area') + th('BE · his area') + th('km', 1) + th('Counts as') + '</tr></thead><tbody>' +
        bd.map(function (x, i) {
          var b = i === bdFar ? 'font-weight:600;' : '', g = x[6] ? 'color:var(--ink-3);' : '';
          var from = String(x[7] || '').replace(/\\s*\\(HQ\\)$/, '');
          var how = x[6] ? 'near home · the journey pays'
            : '<span title="' + esc(bdTip[x[4]] || '') + '">' + (bdKind[x[4]] || '') + (i === bdFar ? ' · farthest' : '') + '</span>' +
              (x[4] === 'eq' ? grey('from his HQ ' + esc(from)) : from && from !== x[3] ? grey('from ' + esc(from)) : '');
          return '<tr style="vertical-align:top;' + b + g + '">' + td(esc(x[0]), 'white-space:nowrap') + td(esc(x[1] || '—')) +
            td(beCell(x)) + td(x[6] || x[5] === null ? '—' : x[5], 'text-align:right;white-space:nowrap') + td(how, 'white-space:nowrap') + '</tr>';
        }).join('') + '</tbody></table></div>');
    }
    if (!r.payable) return out;""", 1],
]

W = "WOULD " if DRY else ""
page = frappe.get_doc("Web Page", "field-expenses")
js = (page.javascript or "").replace("\r\n", "\n")
new_js = None
if MARK in js:
    print("ok: already patched (Why-this-day BE mapping)")
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
        print(W + "patch /field-expenses page JavaScript (" + str(len(EDITS)) + " edits, " + str(len(js)) + " -> " + str(len(out)) + " chars)")
        new_js = out

if not DRY and new_js:
    now = str(frappe.utils.now_datetime())
    stamp = now[0:4] + now[5:7] + now[8:10] + "-" + now[11:13] + now[14:16]
    frappe.get_doc({"doctype": "File", "file_name": "field-expenses-js-before-why-be-mapping-" + stamp + ".js",
                    "attached_to_doctype": "Web Page", "attached_to_name": "field-expenses", "is_private": 1,
                    "content": page.javascript}).insert(ignore_permissions=True)
    page.javascript = new_js
    page.save(ignore_permissions=True)
    frappe.db.commit()
    print("done -- backup attached. /field-expenses, Ctrl+Shift+R.")
elif DRY:
    print("dry run -- nothing changed.")
