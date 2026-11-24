# SYSTEM CONSOLE -- the person's summary cards follow the new figures (19 Nov 2026, the user).
# Goes on top of days_count_console.py. Prod. System Console, Python, Administrator.
#   1) DRY = True, "Commit" unticked.  2) DRY = False, tick "Commit", Execute.  Then Ctrl+Shift+R.
# Display only -- nothing to re-save. Safe to re-run (marker "cards: paid / claimable"). Backup saved first.
#
#   Calculated as worked  "Rs 46,180/74,680"  spent / claimable (each outstation day at its full rate),
#                         "TA Rs 10,480 + DA Rs 35,700 · 24 paid days"
#   Day mix               only the day types he has: "8 HQ · 1 HQ-EQ · 7 OS-HQ · 8 OS-EQ · 1 no GPS"
#                         (no "0 EQ · 0 EQ-EQ")
#   Day coverage          "96%"  "24 paid of 25 working days (• 1)"  -- the same count as the header

DRY = True
MARK = "cards: paid / claimable"
START = """      ['Calculated as worked (cal)', '₹' + fmt(a.cal), 'TA ₹' + fmt(a.taA) + ' + DA ₹' + fmt(a.daA) +"""
END = """        null, a.working ? a.visitDays / a.working : 0]
    ], true);"""

NEW = """      // cards: paid / claimable (the user, 2026-11-19) -- spent over what he can claim, only the day types he has,
      // and the day coverage on paid days with the same issue count as the header
      ['Calculated as worked (cal)', (function () {
          var extra = 0;
          (a.rows || []).forEach(function (r) { if (r.payable && r.osA && r.osDaFull) extra += r.osDaFull - r.osA; });
          return '₹' + fmt(a.cal) + (extra > 0 ? '<span style="color:var(--ink-3);font-weight:400">/' + fmt(a.cal + extra) + '</span>' : '');
        })(),
        'TA ₹' + fmt(a.taA) + ' + DA ₹' + fmt(a.daA) + ' · ' + fmt(a.paidDays) + (a.paidDays === 1 ? ' paid day' : ' paid days'), 'var(--ink)', 'var(--good)', null],
      ['Visits', fmt(a.visits),
        'on ' + fmt(a.visitDays) + (a.visitDays === 1 ? ' logged day' : ' logged days') +
          (a.jointVisits ? ' · ' + fmt(a.jointVisits) + ' joint' : '') +
          (a.offVisits ? ' · ' + fmt(a.offVisits) + ' on a non-working day' : ''),
        'var(--ink)', null, null],
      ['Visit avg', visitAvg(a.visits, a.visitDays),
        'visits a logged day · ' + fmt(a.visits) + ' over ' + fmt(a.visitDays) + (a.visitDays === 1 ? ' day' : ' days'), 'var(--ink)', null, null],
      ['Day mix', fmt(days) + (days === 1 ? ' day' : ' days'),
        // only the day types he has (2026-11-19)
        [[a.hq - (a.hqeq || 0), 'HQ'], [a.hqeq || 0, 'HQ-EQ'], [a.os, 'OS-HQ'], [a.oseq, 'OS-EQ'], [a.eq, 'EQ'], [a.eqeq || 0, 'EQ-EQ'], [a.osp, 'tour'], [a.noGps, 'no GPS']]
          .filter(function (x) { return x[0] > 0; }).map(function (x) { return x[0] + ' ' + x[1]; }).join(' · ') || '—', 'var(--ink)', null, null],
      ['Driven (GPS)', fmt(Math.round(a.drive)) + ' km',
        esc(e.zone) + ' rate card', 'var(--ink)', null, null],
      ['Day coverage', pct(a.working ? a.paidDays / a.working : 0),
        fmt(a.paidDays) + ' paid of ' + fmt(a.working) + ' working days' +
          (a.issueDays.length || a.nrDays.length ? ' <span style="white-space:nowrap" title="' + esc((a.issueDays.length ? 'logged but not paid: ' + a.issueDays.join(', ') : '') + (a.issueDays.length && a.nrDays.length ? ' · ' : '') + (a.nrDays.length ? 'nothing logged: ' + a.nrDays.join(', ') : '')) + '">(' +
            (a.issueDays.length ? '<span style="color:#f97316;font-weight:600"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#f97316;vertical-align:1px"></span> ' + a.issueDays.length + '</span>' : '') +
            (a.issueDays.length && a.nrDays.length ? ' ' : '') +
            (a.nrDays.length ? '<span style="color:var(--critical);font-weight:600"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--critical);vertical-align:1px"></span> ' + a.nrDays.length + '</span>' : '') +
            ')</span>' : ''),
        'var(--ink)', null, a.working ? a.paidDays / a.working : 0]
    ], true);"""

W = "WOULD " if DRY else ""
page = frappe.get_doc("Web Page", "field-expenses")
js = (page.javascript or "").replace("\r\n", "\n")
new_js = None
if MARK in js:
    print("ok: already patched (cards)")
elif "paidDays" not in js:
    print("NOT patched: run days_count_console.py first")
else:
    s = js.find(START)
    t = js.find(END, s) if s >= 0 else -1
    if js.count(START) != 1 or t < 0:
        print("NOT patched: the summary cards block not found exactly once")
    else:
        new_js = js[:s] + NEW + js[t + len(END):]
        print(W + "patch /field-expenses page JavaScript (1 edit, " + str(len(js)) + " -> " + str(len(new_js)) + " chars)")

if not DRY and new_js:
    now = str(frappe.utils.now_datetime())
    stamp = now[0:4] + now[5:7] + now[8:10] + "-" + now[11:13] + now[14:16]
    frappe.get_doc({"doctype": "File", "file_name": "field-expenses-js-before-emp-cards-" + stamp + ".js",
                    "attached_to_doctype": "Web Page", "attached_to_name": "field-expenses", "is_private": 1,
                    "content": page.javascript}).insert(ignore_permissions=True)
    page.javascript = new_js
    page.save(ignore_permissions=True)
    frappe.db.commit()
    print("done -- backup attached. /field-expenses, Ctrl+Shift+R.")
elif DRY:
    print("dry run -- nothing changed.")
