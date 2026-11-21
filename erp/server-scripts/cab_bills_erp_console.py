# SYSTEM CONSOLE -- managers' CAB BILLS, the ERP side (20 Nov 2026, the user).
# SM / ZSM add the month's cab bills on a card of their own in the planner (not TA/DA, no day asked).
# The claim is an Expense Claim with remark "Field Cab · YYYY-MM" (rows: Travel / Cab), sent to the
# reporting officer; the officer's approval is FINAL and it is a RECORD ONLY -- Accounts pays it,
# outside payroll. This console:
#   1. Server Script "Expense Claim Route": a "Field Cab · " claim that is Approved stays Approved --
#      no AI routing, no Verified, no Additional Salary.   <-- run BEFORE anyone approves a cab claim
#   2. Server Script "Field Expense Claims API" (action=month): returns the month's cab claims + lines
#   3. Web Page "field-expenses" (the fx-claims block): a "🚕 Cab ₹X" pill by each manager's name and a
#      "Cab bills" row under their days; both open the bills (date, cab, amount, bill check, View bill)
# Sources: share/src/app/expense-claims/server/expense_claim_route.py,
#          share/src/app/field-expense/server/field_expense_claims_api.py,
#          share/src/app/field-expense/web/fx-claims.js
# Prod. System Console, Python, Administrator.
#   1) DRY = True, "Commit" unticked.  2) DRY = False, tick "Commit", Execute.  Then Ctrl+Shift+R on /field-expenses.
# Safe to re-run: each part checks for its own marker first. Backups of the page JS and both scripts saved first.

DRY = True
W = "WOULD " if DRY else ""
CRLF = chr(13) + chr(10)
LF = chr(10)

ROUTE_EDITS = [
    ["route: a cab claim's approval is final, record only",
     "    if now == \"Approved\" and not str(doc.remark or \"\").startswith(\"Field TA/DA · \"):\n",
     "    # A manager's cab bills (remark \"Field Cab · \", 20 Nov 2026) are a record\n    # only: the officer's approval is final and Accounts pays it outside\n    # payroll -- no AI routing, no Verified, no Additional Salary.\n    if now == \"Approved\" and not str(doc.remark or \"\").startswith(\"Field TA/DA · \") and not str(doc.remark or \"\").startswith(\"Field Cab · \"):\n"],
]
API_EDITS = [
    ["claims API: the month's cab claims",
     "    frappe.response[\"message\"] = {\"month\": month, \"verifier\": verifier, \"claims\": claims, \"lines\": lines, \"names\": who, \"km\": km,\n                                  \"people\": people, \"cars\": cars}\n",
     "    # 20 Nov 2026: a manager's (SM / ZSM) cab bills of the month -- their own\n    # claim, remark \"Field Cab · YYYY-MM\", approved by the reporting officer and\n    # kept as a record (Accounts pays it; not TA/DA, no payroll). The dashboard\n    # shows them per employee, not per day.\n    cabs = []\n    cab_lines = []\n    if action == \"month\":\n        cabs = frappe.get_all(\"Expense Claim\", filters={\"remark\": \"Field Cab · \" + month, \"docstatus\": [\"<\", 2]}, fields=CLAIM_COLS, order_by=\"employee_name asc\", limit_page_length=0)\n        cab_names = []\n        for c in cabs:\n            cab_names.append(c.name)\n            if c.expense_approver and not who.get(c.expense_approver):\n                who[c.expense_approver] = frappe.db.get_value(\"User\", c.expense_approver, \"full_name\") or c.expense_approver\n        if cab_names:\n            cab_lines = frappe.get_all(\"Expense Claim Detail\", filters={\"parent\": [\"in\", cab_names], \"parenttype\": \"Expense Claim\"},\n                                       fields=[\"name\", \"parent\", \"idx\", \"expense_date\", \"expense_type\", \"custom_sub_type\", \"description\", \"amount\",\n                                               \"custom_bill\", \"custom_bill_vendor\", \"custom_ai_score\", \"custom_ai_reason\"],\n                                       order_by=\"parent asc, expense_date asc\", limit_page_length=0)\n    frappe.response[\"message\"] = {\"month\": month, \"verifier\": verifier, \"claims\": claims, \"lines\": lines, \"names\": who, \"km\": km,\n                                  \"people\": people, \"cars\": cars, \"cabs\": cabs, \"cab_lines\": cab_lines}\n"],
]
PAGE_EDITS = [
    ["load: read the cab claims",
     "      M.all = m.claims || []; M.people = m.people || []; M.cars = m.cars || [];\n",
     "      M.all = m.claims || []; M.people = m.people || []; M.cars = m.cars || [];\n      // fx-cab (20 Nov 2026): a manager's cab bills of the month -- their own claim\n      // (\"Field Cab · YYYY-MM\"), approved by the reporting officer, record only\n      M.cabs = {};\n      (m.cabs || []).forEach(function (c) {\n        c.lines = (m.cab_lines || []).filter(function (l) { return l.parent === c.name; });\n        (M.cabs[c.employee] = M.cabs[c.employee] || []).push(c);\n      });\n"],
    ["name badge: the cab pill",
     "    }\n    return out;\n  };\n  /* a handwritten bill",
     "    }\n    return out + cabPill(code);\n  };\n  /* a handwritten bill"],
    ["under the days: the cab rows",
     "  M.foot = function (a) {\n",
     "  M.foot = function (a) { return footClaims(a) + cabFoot(a); };\n  var footClaims = function (a) {\n"],
    ["the cab pill, rows and bill list",
     "  // a ✎ in a day row opens the check panel -- and must not also open the day\n",
     "  /* ---------- fx-cab: a manager's cab bills (20 Nov 2026) ----------\n     SM / ZSM scan the month's cab bills in the planner on a card of their own\n     (no day asked, never TA/DA); the claim (remark \"Field Cab · YYYY-MM\") goes\n     to the reporting officer, whose approval is final. It is a record only --\n     Accounts pays it, outside payroll -- so it is shown per employee, not per\n     day: a pill by the name and a row under the days, both open the bills. */\n  var CAB_STATE = {\n    'Approved': ['approved · record only', '#067647'],\n    'Verified': ['approved · record only', '#067647'],\n    'Waiting for Approval': ['with officer', 'var(--ink-3)'],\n    'Rejected': ['sent back', '#b42318'],\n    'Draft': ['not sent', 'var(--ink-3)'],\n  };\n  var cabSum = function (c) { return (c.lines || []).reduce(function (s, l) { return s + (Number(l.amount) || 0); }, 0); };\n  var cabDate = function (d) { d = String(d || '').slice(0, 10); return d ? Number(d.slice(8, 10)) + ' ' + MON[Number(d.slice(5, 7)) - 1] : ''; };\n  var cabVendor = function (l) { return l.custom_bill_vendor || String(l.description || '').split(' · ')[1] || 'Cab'; };\n  var CAB_BTN = 'cursor:pointer;display:inline-flex;align-items:center;gap:4px;font:inherit;font-size:10.5px;font-weight:800;line-height:16px;padding:0 7px;border-radius:9px;color:#1d4ed8;background:#eef4ff;border:1px solid #b2ccff';\n  function cabPill(code) {\n    var list = (M.cabs || {})[code] || [];\n    if (!list.length) return '';\n    var n = 0, amt = 0;\n    list.forEach(function (c) { n += c.lines.length; amt += cabSum(c); });\n    return ' <button type=\"button\" data-fxcab=\"' + esc(code) + '\" title=\"Cab bills: ' + n + ' bill' + (n === 1 ? '' : 's') + ', ' + inr(amt) + ' -- not TA/DA, open to see them\" style=\"' + CAB_BTN + '\">🚕 Cab ' + inr(amt) + '</button>';\n  }\n  function cabFoot(a) {\n    var emp = (a && a.rows && a.rows[0] && a.rows[0].emp) || '';\n    var list = (M.cabs || {})[emp] || [];\n    var style = 'padding:8px 10px;border-top:1px solid var(--line);font-size:12.5px;background:var(--surface-2)';\n    return list.map(function (c) {\n      var st = CAB_STATE[c.workflow_state] || [c.workflow_state || 'not sent', 'var(--ink-3)'];\n      return '<tr><td colspan=\"99\" style=\"' + style + '\">🚕 <b>Cab bills ' + esc(c.name) + '</b> ' + pill(st) +\n        ' · ' + c.lines.length + ' bill' + (c.lines.length === 1 ? '' : 's') + ' · <b>' + inr(cabSum(c)) + '</b>' +\n        ' · <span style=\"color:var(--ink-3)\">not TA/DA · paid by Accounts, not payroll</span>' +\n        ' <button type=\"button\" data-fxcab=\"' + esc(emp) + '\" style=\"' + CAB_BTN + ';margin-left:6px\">View bills</button></td></tr>';\n    }).join('');\n  }\n  function openCab(code) {\n    var list = (M.cabs || {})[code] || [];\n    if (!list.length) return;\n    var TH = 'text-align:left;padding:5px 8px;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3);border-bottom:1px solid var(--line)';\n    var TD = 'padding:6px 8px;border-bottom:1px solid var(--surface-2);vertical-align:top';\n    var total = 0;\n    var blocks = list.map(function (c) {\n      var st = CAB_STATE[c.workflow_state] || [c.workflow_state || 'not sent', 'var(--ink-3)'];\n      total += cabSum(c);\n      var rows = c.lines.slice().sort(function (p, q) { return String(p.expense_date).localeCompare(String(q.expense_date)); }).map(function (l) {\n        var sc = Number(l.custom_ai_score) || 0;\n        var chk = l.custom_ai_reason ? '<span style=\"color:' + (sc >= 90 ? 'var(--ok, #16a34a)' : 'var(--warn, #b45309)') + '\">' + esc(l.custom_ai_reason) + '</span>' : '<span style=\"color:var(--ink-3)\">not checked</span>';\n        return '<tr><td style=\"' + TD + ';white-space:nowrap\">' + esc(cabDate(l.expense_date)) + '</td><td style=\"' + TD + '\"><b>' + esc(cabVendor(l)) + '</b><div style=\"font-size:11.5px\">' + chk + '</div></td>' +\n          '<td style=\"' + TD + ';text-align:right;white-space:nowrap;font-weight:600\">' + inr(l.amount) + '</td>' +\n          '<td style=\"' + TD + ';white-space:nowrap\">' + (l.custom_bill ? '<a href=\"' + esc(l.custom_bill) + '\" target=\"_blank\" rel=\"noopener\">View bill</a>' : '') + '</td></tr>';\n      }).join('');\n      var head = '<table style=\"width:100%;border-collapse:collapse;font-size:12.5px\"><thead><tr>' +\n        '<th style=\"' + TH + '\">Date</th><th style=\"' + TH + '\">Cab · bill check</th><th style=\"' + TH + ';text-align:right\">Amount</th><th style=\"' + TH + '\"></th></tr></thead>';\n      return '<div style=\"margin-top:10px\"><div style=\"display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px\"><b>' + esc(c.name) + '</b> ' + pill(st) +\n        (c.expense_approver ? '<span style=\"color:var(--ink-3)\">· officer ' + esc(M.names[c.expense_approver] || c.expense_approver) + '</span>' : '') +\n        '<span style=\"margin-left:auto;font-weight:700\">' + inr(cabSum(c)) + '</span></div>' + head + '<tbody>' + rows + '</tbody></table></div>';\n    }).join('');\n    var o = overlay('<b style=\"font-size:15px\">Cab bills · ' + esc(list[0].employee_name || code) + ' · ' + esc(monthWord(M.month)) + '</b>' +\n      '<div style=\"margin:4px 0 2px;color:var(--ink-3)\">Kept apart from TA/DA: the reporting officer&#39;s approval is final and Accounts pays it outside payroll. ' +\n      list.reduce(function (s, c) { return s + c.lines.length; }, 0) + ' bills · <b style=\"color:var(--ink)\">' + inr(total) + '</b></div>' + blocks +\n      '<div style=\"display:flex;justify-content:flex-end;margin-top:12px\"><button type=\"button\" data-fxcancel style=\"padding:6px 14px;border:1px solid var(--line);border-radius:8px;background:var(--surface);color:inherit;cursor:pointer\">Close</button></div>');\n    o.querySelector('[data-fxcancel]').onclick = function () { o.remove(); };\n  }\n  // the cab pill / View bills: open the list, and never also open or fold the employee's row\n  document.addEventListener('click', function (ev) {\n    var t = ev.target && ev.target.closest && ev.target.closest('[data-fxcab]');\n    if (!t) return;\n    ev.preventDefault();\n    ev.stopPropagation();\n    openCab(t.getAttribute('data-fxcab'));\n  }, true);\n  /* ---------- /fx-cab ---------- */\n\n  // a ✎ in a day row opens the check panel -- and must not also open the day\n"],
]

now = str(frappe.utils.now_datetime())
stamp = now[0:4] + now[5:7] + now[8:10] + "-" + now[11:13] + now[14:16]
todo = []

# ---- 1 + 2: the two server scripts
for part in [["Expense Claim Route", ROUTE_EDITS, 'startswith("Field Cab · ")'], ["Field Expense Claims API", API_EDITS, '"cabs": cabs, "cab_lines": cab_lines']]:
    ss = frappe.get_doc("Server Script", part[0])
    raw = ss.script or ""
    crlf = CRLF in raw
    src = raw.replace(CRLF, LF)
    if part[2] in src:
        print("ok: " + part[0] + " already has the cab change")
        continue
    bad = []
    out = src
    for x in part[1]:
        n = out.count(x[1])
        if n != 1:
            bad.append(x[0] + ": anchor found " + str(n) + " times")
        else:
            out = out.replace(x[1], x[2])
    if bad:
        print("NOT patched " + part[0] + ": " + "; ".join(bad))
        continue
    print(W + "patch Server Script '" + part[0] + "' (" + str(len(part[1])) + " edit)")
    todo.append(["script", ss, out.replace(LF, CRLF) if crlf else out, raw])

# ---- 3: the dashboard's fx-claims block
page = frappe.get_doc("Web Page", "field-expenses")
rawjs = page.javascript or ""
pcrlf = CRLF in rawjs
js = rawjs.replace(CRLF, LF)
if "/* ==== fx-claims: field_expense_claims_console.py ==== */" not in js:
    print("NOT patched field-expenses: the fx-claims block is not on the page (run field_expense_claims_console.py first)")
elif "fx-cab: a manager's cab bills" in js:
    print("ok: field-expenses already shows cab bills")
else:
    bad = []
    out = js
    for x in PAGE_EDITS:
        n = out.count(x[1])
        if n != 1:
            bad.append(x[0] + ": anchor found " + str(n) + " times")
        else:
            out = out.replace(x[1], x[2])
    if bad:
        print("NOT patched field-expenses: " + "; ".join(bad))
    else:
        print(W + "patch /field-expenses page JavaScript (" + str(len(PAGE_EDITS)) + " edits, " + str(len(js)) + " -> " + str(len(out)) + " chars)")
        todo.append(["page", page, out.replace(LF, CRLF) if pcrlf else out, rawjs])

if not DRY:
    for t in todo:
        if t[0] == "script":
            frappe.get_doc({"doctype": "File", "file_name": "server-script-" + t[1].name.replace(" ", "-").lower() + "-before-cab-" + stamp + ".py",
                            "attached_to_doctype": "Server Script", "attached_to_name": t[1].name, "is_private": 1, "content": t[3]}).insert(ignore_permissions=True)
            t[1].script = t[2]
            t[1].save(ignore_permissions=True)
        else:
            frappe.get_doc({"doctype": "File", "file_name": "field-expenses-js-before-cab-bills-" + stamp + ".js",
                            "attached_to_doctype": "Web Page", "attached_to_name": "field-expenses", "is_private": 1, "content": t[3]}).insert(ignore_permissions=True)
            t[1].javascript = t[2]
            t[1].save(ignore_permissions=True)
    frappe.db.commit()
    print("done -- " + str(len(todo)) + " part(s) changed, backups attached. /field-expenses: Ctrl+Shift+R.")
else:
    print("dry run -- nothing changed.")
