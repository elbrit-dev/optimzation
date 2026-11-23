# SYSTEM CONSOLE -- FIELD EXPENSES DASHBOARD: TA BY TRAIN / BUS TICKET (23 Nov 2026).
# The planner now pays RBM and above the LARGER of a journey's fare and its train / bus tickets
# (app commit b16d398): such a day's claim has its tickets as Travel lines with their bills. The
# /field-expenses final check compared them with the worked-out fare and showed "+Rs 500 vs worked
# out". The user: it should show the total as the correct TA. After this, on a ticket day:
#   - the worked-out TA is the ticket TA (fare 1,000 + ticket 1,500 -> TA 1,500, "fare 1,000" noted),
#     so the day reads "= worked out · TA by train / bus ticket" -- no difference;
#   - the ticket line reads "Train / bus ticket · <operator>".
# Only the fx-claims block of Web Page "field-expenses" changes (7 small edits, each anchor must be
# found exactly once, else nothing is changed); a backup of the page script is attached first.
# Paste into ERP > System Console (type Python), logged in as Administrator.
#   1) DRY = True, "Commit" unticked: only prints.   2) DRY = False, TICK "Commit", Execute.
# Safe to re-run. Then open /field-expenses with Ctrl+Shift+R.
# Source: share/src/app/field-expense/web/fx-claims.js (the same edits).

DRY = True
W = "WOULD " if DRY else ""
CRLF = chr(13) + chr(10)
LF = chr(10)

EDITS = [['sums: ticket total', '    var o = { claimed: 0, fin: 0, ta: 0, da: 0, adj: 0, bills: 0, stayFood: 0, car: 0, hand: 0, flag: 0, unchecked: 0 };', '    var o = { claimed: 0, fin: 0, ta: 0, da: 0, adj: 0, bills: 0, stayFood: 0, car: 0, hand: 0, flag: 0, unchecked: 0, tickets: 0 };'], ['sums: ticket lines', "      if (l.expense_type === 'Fuel' || l.expense_type === 'Toll') o.car += a;\n      // a bill: handwritten / never checked / a possible repeat (checked, under 90)", "      if (l.expense_type === 'Fuel' || l.expense_type === 'Toll') o.car += a;\n      // fx-ticket: a train / bus ticket line (a Travel line with its bill, 23 Nov 2026)\n      if (l.expense_type === 'Travel' && l.custom_bill) o.tickets += a;\n      // a bill: handwritten / never checked / a possible repeat (checked, under 90)"], ['expectedOf', "  // what the dashboard itself worked out for the day (before an approved claim replaced it)\n  var workedOf = function (r) {\n    var w = M.worked[r.emp + '|' + r.date];\n    return w ? { ta: w.ta, da: w.da } : { ta: Number(r.taA) || 0, da: Number(r.daA) || 0 };\n  };", '  // what the dashboard itself worked out for the day (before an approved claim replaced it)\n  var workedOf = function (r) {\n    var w = M.worked[r.emp + \'|\' + r.date];\n    return w ? { ta: w.ta, da: w.da } : { ta: Number(r.taA) || 0, da: Number(r.daA) || 0 };\n  };\n  /* fx-ticket (23 Nov 2026): a day whose journey is paid by TRAIN / BUS TICKET\n     -- the planner pays the larger of the fare and the tickets -- has the\n     claimed TA as its correct TA (fare 1,000 + ticket 1,500 -> TA 1,500), not\n     "+500 vs worked out". -> { ta, da, fare, ticket } */\n  var expectedOf = function (r, x) {\n    var w = workedOf(r);\n    if (x && x.tickets > 0 && x.ta > w.ta) return { ta: x.ta, da: w.da, fare: w.ta, ticket: true };\n    return { ta: w.ta, da: w.da, fare: w.ta, ticket: false };\n  };'], ['delta: ticket TA', '  function delta(r, x) {\n    var w0 = workedOf(r);\n    var cal = w0.ta + w0.da;\n    var d = Math.round(x.claimed - cal);\n    if (!r.payable && !x.claimed) return \'\';\n    if (Math.abs(d) < 1) return \'<span style="color:var(--ink-3)">= worked out</span>\';', '  function delta(r, x) {\n    var w0 = expectedOf(r, x);\n    var cal = w0.ta + w0.da;\n    var d = Math.round(x.claimed - cal);\n    if (!r.payable && !x.claimed) return \'\';\n    if (Math.abs(d) < 1) return \'<span style="color:var(--ink-3)">= worked out\' + (w0.ticket ? \' · TA by train / bus ticket\' : \'\') + \'</span>\';'], ['day panel: ticket TA', '    var w0 = workedOf(r);\n    var cal = w0.ta + w0.da;\n    var diff = Math.round((x.adj ? x.fin : x.claimed) - cal);', '    var w0 = expectedOf(r, x);\n    var cal = w0.ta + w0.da;\n    var diff = Math.round((x.adj ? x.fin : x.claimed) - cal);'], ['day panel: worked-out note', "        fig('Worked out', inr(cal), null, 'TA ' + inr(w0.ta) + ' + DA ' + inr(w0.da) +", "        fig('Worked out', inr(cal), null, 'TA ' + inr(w0.ta) + (w0.ticket ? ' (by train / bus ticket; fare ' + inr(w0.fare) + ')' : '') + ' + DA ' + inr(w0.da) +"], ['line words: ticket', "    if (/top-up/i.test(parts[0] || '')) return { main: 'Top-up to 50 % DA', sub: rest.join(' · ') };", "    if (/top-up/i.test(parts[0] || '')) return { main: 'Top-up to 50 % DA', sub: rest.join(' · ') };\n    if (/^TA by ticket/i.test(parts[0] || '')) return { main: 'Train / bus ticket' + (rest[0] ? ' · ' + unshout(rest[0]) : ''), sub: rest.slice(1).join(' · ') };"]]

stamp = str(frappe.utils.now())[:16].replace("-", "").replace(":", "").replace(" ", "-")
page = frappe.get_doc("Web Page", "field-expenses")
rawjs = page.javascript or ""
pcrlf = CRLF in rawjs
js = rawjs.replace(CRLF, LF)
if "/* ==== fx-claims: field_expense_claims_console.py ==== */" not in js:
    print("NOT patched: the fx-claims block is not on the page (run field_expense_claims_console.py first)")
elif "fx-ticket: a train / bus ticket line" in js:
    print("ok: /field-expenses already shows TA by ticket")
else:
    bad = []
    out = js
    for x in EDITS:
        n = out.count(x[1])
        if n != 1:
            bad.append(x[0] + ": anchor found " + str(n) + " times")
        else:
            out = out.replace(x[1], x[2])
    if bad:
        print("NOT patched (nothing changed): " + "; ".join(bad))
    else:
        print(W + "patch /field-expenses page JavaScript (" + str(len(EDITS)) + " edits, " + str(len(js)) + " -> " + str(len(out)) + " chars)")
        if not DRY:
            frappe.get_doc({"doctype": "File", "file_name": "field-expenses-js-before-ticket-ta-" + stamp + ".js",
                            "attached_to_doctype": "Web Page", "attached_to_name": "field-expenses", "is_private": 1, "content": rawjs}).insert(ignore_permissions=True)
            page.javascript = out.replace(LF, CRLF) if pcrlf else out
            page.save(ignore_permissions=True)
            print("done -- backup attached to the Web Page. /field-expenses: Ctrl+Shift+R.")
print("dry run -- nothing changed." if DRY else "")
