# SYSTEM CONSOLE -- the employee's day count reads "paid days / working days · issues" (19 Nov 2026, the user).
# Before: "23/25d" counted only days with doctor visits -- a paid meeting day looked like a missing day.
# Now (Suresh R E00006, Oct): "24/25d (• 1)" -- a small dot with the count in brackets, details on hover
#   24 = working days that are paid (23 visit days + the 31 Oct meeting with its HQ)
#   25 = working days (month less weekly offs and holidays)
#   orange dot = a working day logged but not paid (10 Oct: a meeting with no Hq Territory)
#   red dot    = a working day with nothing logged
#   hover: "24 paid of 25 working days · logged but not paid: 10/10"
# Same in the Excel "Days worked" line. Display only -- nothing to re-save.
# Prod. System Console, Python, Administrator.
#   1) DRY = True, "Commit" unticked.  2) DRY = False, tick "Commit", Execute.  Then Ctrl+Shift+R.
# Safe to re-run (marker "paidDays"). Backup of the page JavaScript saved first.

DRY = True
MARK = "paidDays"

EDITS = [
    ["counters",
     """        visitDays: 0, visits: 0, offVisits: 0, hq: 0, eq: 0, os: 0, oseq: 0, osp: 0, noGps: 0, drive: 0,""",
     """        visitDays: 0, visits: 0, offVisits: 0, hq: 0, eq: 0, os: 0, oseq: 0, osp: 0, noGps: 0, drive: 0,
        paidDays: 0, issueDays: [], nrDays: [],   // paid / working · issues (2026-11-19)""", 1],
    ["count them",
     """      if (working) a.working++;
      if (r.n) { a.visitDays++; a.visits += r.n; if (!working) a.offVisits += r.n; }""",
     """      if (working) a.working++;
      if (r.n) { a.visitDays++; a.visits += r.n; if (!working) a.offVisits += r.n; }
      // paid / working · issues (2026-11-19): a working day is paid, or logged but not paid (an issue), or empty
      if (working) {
        if (payable) a.paidDays++;
        else if (r.n || (r.others && r.others.length)) a.issueDays.push(String(r.date).slice(8, 10) + '/' + String(r.date).slice(5, 7));
        else a.nrDays.push(String(r.date).slice(8, 10) + '/' + String(r.date).slice(5, 7));
      }""", 1],
    ["header",
     """text-align:right;color:var(--ink-3)">' + a.visitDays + '/' + a.working + 'd</td>' +""",
     """text-align:right;color:var(--ink-3);white-space:nowrap"' +
            ' title="' + esc(a.paidDays + ' paid of ' + a.working + ' working days' + (a.issueDays.length ? ' · logged but not paid: ' + a.issueDays.join(', ') : '') + (a.nrDays.length ? ' · nothing logged: ' + a.nrDays.join(', ') : '')) + '">' +
            a.paidDays + '/' + a.working + 'd' +
            // clean (the user, 2026-11-19): a small dot only -- orange = logged but not paid, red = nothing logged
            // "24/25d (• 1)" -- dot + count in brackets; both kinds share one bracket "(• 1 • 2)" (the user, 2026-11-19)
            (a.issueDays.length || a.nrDays.length ? ' <span style="white-space:nowrap">(' +
              (a.issueDays.length ? '<span style="color:#f97316;font-weight:600"><span aria-label="issues" style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#f97316;vertical-align:1px"></span> ' + a.issueDays.length + '</span>' : '') +
              (a.issueDays.length && a.nrDays.length ? ' ' : '') +
              (a.nrDays.length ? '<span style="color:var(--critical);font-weight:600"><span aria-label="not reported" style="display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--critical);vertical-align:1px"></span> ' + a.nrDays.length + '</span>' : '') +
              ')</span>' : '') + '</td>' +""", 1],
    ["excel",
     """      ['Days worked', a.visitDays + '/' + a.working, '', 'Visits'""",
     """      ['Days worked', a.paidDays + '/' + a.working + (a.issueDays.length ? ' · ' + a.issueDays.length + ' issue' + (a.issueDays.length === 1 ? '' : 's') + ' (' + a.issueDays.join(', ') + ')' : '') + (a.nrDays.length ? ' · ' + a.nrDays.length + ' not reported' : ''), '', 'Visits'""", 1],
]

W = "WOULD " if DRY else ""
page = frappe.get_doc("Web Page", "field-expenses")
js = (page.javascript or "").replace("\r\n", "\n")
new_js = None
if MARK in js:
    print("ok: already patched (paid / working days)")
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
    frappe.get_doc({"doctype": "File", "file_name": "field-expenses-js-before-days-count-" + stamp + ".js",
                    "attached_to_doctype": "Web Page", "attached_to_name": "field-expenses", "is_private": 1,
                    "content": page.javascript}).insert(ignore_permissions=True)
    page.javascript = new_js
    page.save(ignore_permissions=True)
    frappe.db.commit()
    print("done -- backup attached. /field-expenses, Ctrl+Shift+R.")
elif DRY:
    print("dry run -- nothing changed.")
