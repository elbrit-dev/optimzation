/* fx-claims — the final check of the planner's field TA/DA claims, inside the
 * field-expenses dashboard (12 Nov 2026). Installed by
 * field_expense_claims_console.py: this block appended to the Web Page's
 * script, plus five small hooks in the dashboard (a Claim column, its cell, the
 * claim panel in an opened day, a claim row under each employee, render()
 * exposed). Re-run that console after the dashboard is rebuilt.
 *
 * 13 Nov 2026: every claim's RISK (the bill check's score over all its lines:
 * 90+ Low, 70-89 Medium, below 70 High) on each claim row, in an opened day
 * and counted in the top bar; HANDWRITTEN bills marked (the rep's reason and
 * the payment proof); an employee with more than one claim in the month (a
 * trip sent after the month was approved starts a new one) shows each.
 *
 * After the reporting officer approves a month claim, it waits here. A
 * verifier (Sathish, the CEO, System Managers -- the ERP checks, not this page)
 * sees each day's claimed lines next to what the dashboard worked out, may
 * adjust a line with a reason (stored on the claim line: amount, reason, who,
 * when), and finalises the WHOLE month with one button: one Additional Salary
 * ("Field Expenses Reimbursement") per employee with the final amounts.
 * Everything goes through the ERP API script field_expense_claims. */
(function () {
  if (window.FXClaims) return;
  var M = { on: false, verifier: false, month: null, claims: {}, byDay: {}, byEmp: {}, names: {}, rev: 0, worked: {} };
  window.FXClaims = M;

  var esc = function (s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var inr = function (n) { return '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN'); };
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var monthWord = function (m) { return m ? MON[Number(m.slice(5, 7)) - 1] + ' ' + m.slice(0, 4) : ''; };
  var eff = function (l) { return l.custom_adjusted ? Number(l.custom_adjusted_amount) || 0 : Number(l.amount) || 0; };
  var STATE = {
    'Waiting for Approval': ['with officer', 'var(--ink-3)'],
    'Approved': ['officer approved', 'var(--accent)'],
    'Verified': ['final', 'var(--ok, #16a34a)'],
    'Rejected': ['rejected', 'var(--critical)'],
    'Draft': ['not sent', 'var(--ink-3)'],
  };
  // the claims the final check works on: approved by the officer, or finalised
  var SHOWN = { Approved: 1, 'In Review': 1, Verified: 1, Paid: 1 };

  function api(method, params) {
    var hdr = { Accept: 'application/json' };
    var opt = { credentials: 'same-origin', headers: hdr };
    var url = '/api/method/field_expense_claims';
    if (method === 'GET') url += '?' + new URLSearchParams(params).toString();
    else {
      hdr['Content-Type'] = 'application/x-www-form-urlencoded';
      if (window.frappe && window.frappe.csrf_token) hdr['X-Frappe-CSRF-Token'] = window.frappe.csrf_token;
      opt.method = 'POST';
      opt.body = new URLSearchParams(params).toString();
    }
    return fetch(url, opt).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) {
          var msg = j.exception || ('HTTP ' + r.status);
          try { msg = JSON.parse(JSON.parse(j._server_messages)[0]).message || msg; } catch (e) { /* keep */ }
          var err = new Error(String(msg).replace(/<[^>]*>/g, '').replace(/^[\w.]+Error:\s*/, ''));
          err.status = r.status;
          throw err;
        }
        return j.message;
      });
    });
  }

  function load() {
    return api('GET', { action: 'month', month: M.month }).then(function (m) {
      M.verifier = !!m.verifier;
      M.names = m.names || {};
      M.claims = {}; M.byDay = {}; M.byEmp = {}; M.notYet = {};
      (m.claims || []).forEach(function (c) { if (!SHOWN[c.workflow_state]) (M.notYet[c.employee] = M.notYet[c.employee] || []).push(c); });
      // 13 Nov 2026: only what the reporting officer has APPROVED comes here
      // (and, as a record, what is already finalised) -- a claim still with
      // the officer, sent back or not sent is theirs, not the final check's
      (m.claims || []).filter(function (c) { return SHOWN[c.workflow_state]; })
        .forEach(function (c) { c.lines = []; M.claims[c.name] = c; (M.byEmp[c.employee] = M.byEmp[c.employee] || []).push(c); });
      (m.lines || []).forEach(function (l) {
        var c = M.claims[l.parent];
        if (!c) return;
        c.lines.push(l);
        var k = c.employee + '|' + String(l.expense_date).slice(0, 10);
        (M.byDay[k] = M.byDay[k] || { claim: c, lines: [] }).lines.push(l);
      });
      M.on = true;
      M.rev++;
      M.worked = {};
      bar();
      if (window.__fxRender) window.__fxRender();
    }).catch(function (e) {
      // not a verifier (403), or the API is not installed: the dashboard stays as it is
      M.on = false;
      if (e.status !== 403) console.warn('[fx-claims]', e.message);
    });
  }

  /* a claim's risk: the bill check's score over every line (the ERP keeps
     risk in step with it: 90+ Low, 70-89 Medium, below 70 High) */
  var RISK = {
    Low: ['Low risk', '#067647', '#ecfdf3'],
    Medium: ['Medium risk', '#b54708', '#fffaeb'],
    High: ['High risk', '#b42318', '#fef3f2'],
  };
  var riskOf = function (c) { return c && c.custom_ai_summary ? c.custom_ai_risk || null : null; };
  var riskPill = function (c, big) {
    var k = riskOf(c);
    if (!k) return '<span title="Not scored yet: it is scored when the rep sends or changes the month" style="display:inline-block;font-size:10.5px;font-weight:700;line-height:16px;padding:0 7px;border-radius:9px;color:var(--ink-3);border:1px dashed var(--ink-4, #98a2b3)">not scored</span>';
    var r = RISK[k];
    return '<span title="' + esc(c.custom_ai_summary || '') + '" style="display:inline-block;font-size:' + (big ? '11.5' : '10.5') + 'px;font-weight:800;line-height:' + (big ? '19' : '16') + 'px;padding:0 8px;border-radius:9px;color:' + r[1] + ';background:' + r[2] + ';border:1px solid ' + r[1] + '">' +
      (k === 'High' ? '⚠ ' : '') + r[0] + '</span>';
  };

  /* the employee's tag in the dashboard's list (fx-claims-risk hook in
     empLabel): the WORST risk among their approved / finalised claims, so the
     verifier sees who to check first without opening anyone; a claim still
     with the officer only says so. */
  M.empBadge = function (code) {
    var list = M.byEmp[code] || [];
    var wait = (M.notYet && M.notYet[code]) || [];
    var rank = { High: 3, Medium: 2, Low: 1 };
    var worst = null;
    list.forEach(function (c) { var k = riskOf(c); if (k && (!worst || rank[k] > rank[riskOf(worst)])) worst = c; });
    var out = '';
    if (worst) out += ' ' + riskPill(worst);
    else if (list.length) out += ' ' + riskPill(list[0]);
    var hand = 0;
    list.forEach(function (c) { hand += sums(c.lines).hand; });
    if (hand) out += ' <span title="handwritten bills on the approved claim" style="font-size:10.5px;font-weight:800;color:#b54708">✍ ' + hand + '</span>';
    if (!list.length && wait.length) out += ' <span style="display:inline-block;font-size:10.5px;font-weight:700;line-height:16px;padding:0 7px;border-radius:9px;color:var(--ink-3);border:1px solid var(--line)">claim with officer</span>';
    return out;
  };
  /* a handwritten bill (it could not be read, the rep typed it in): the line
     carries "… · handwritten: <reason> · proof: <payment proof file>" */
  var isHand = function (l) { return !!l.custom_bill && (/entered by hand/i.test(l.custom_ai_reason || '') || / · handwritten: /.test(l.description || '')); };
  var handOf = function (l) {
    var d = String(l.description || '');
    var w = / · handwritten: ([^·]*)/.exec(d), p = / · proof: (\S+)/.exec(d);
    return { why: w ? w[1].trim() : '', proof: p ? p[1] : '' };
  };
  // the description without the parts shown on their own
  // (the proof first: removing the reason takes the space before its " · ")
  var plainNote = function (l) { return String(l.description || '').replace(/ · proof: \S+/, '').replace(/ · handwritten: [^·]*/, '').trim(); };
  var HAND_TAG = '<span style="display:inline-block;font-size:10.5px;font-weight:800;line-height:16px;padding:0 7px;border-radius:9px;color:#b54708;background:#fffaeb;border:1px solid #fedf89">✍ Handwritten</span>';

  var TA_TYPES = { Travel: 1, Fuel: 1, Toll: 1 };
  var TYPE_C = { Travel: '#2563eb', 'Daily Allowance': '#0f766e', Stay: '#4f46e5', Food: '#d97706', Fuel: '#ea580c', Toll: '#9333ea' };
  var pill = function (st) {
    return '<span style="display:inline-block;font-size:10.5px;font-weight:700;line-height:16px;padding:0 7px;border-radius:9px;' +
      'color:' + st[1] + ';border:1px solid ' + st[1] + '">' + esc(st[0]) + '</span>';
  };
  /* the day's claim lines, summed: claimed, final (after adjustments), TA / DA
     parts, bills -- against what the dashboard worked out for the day */
  function sums(lines) {
    var o = { claimed: 0, fin: 0, ta: 0, da: 0, adj: 0, bills: 0, stayFood: 0, car: 0, hand: 0, flag: 0, unchecked: 0 };
    lines.forEach(function (l) {
      var a = Number(l.amount) || 0;
      o.claimed += a; o.fin += eff(l);
      if (TA_TYPES[l.expense_type]) o.ta += a; else o.da += a;
      if (l.custom_adjusted) o.adj++;
      if (l.custom_bill) o.bills++;
      if (l.expense_type === 'Stay' || l.expense_type === 'Food') o.stayFood += a;
      if (l.expense_type === 'Fuel' || l.expense_type === 'Toll') o.car += a;
      // a bill: handwritten / never checked / a possible repeat (checked, under 90)
      if (isHand(l)) o.hand++;
      else if (l.custom_bill && !l.custom_ai_reason) o.unchecked++;
      else if (l.custom_bill && Number(l.custom_ai_score) < 90) o.flag++;
    });
    return o;
  }
  /* 13 Nov 2026: once the officer APPROVED a claim, its own TA / DA are the
     day's TA / DA on the dashboard (the fx-claims-paid hook in computeRows
     asks here): TA = its travel, fuel and toll lines; DA = its DA, stay and
     food lines -- each after any adjustment on the final check. What the
     dashboard had worked out is kept (M.worked) to compare. Only approved /
     finalised claims are in M.byDay. -> { ta, da, bills } | null */
  M.dayPaid = function (emp, date, ta, da) {
    var d = M.byDay[emp + '|' + date];
    if (!d || !d.lines.length) return null;
    var o = { ta: 0, da: 0, bills: 0 };
    d.lines.forEach(function (l) {
      var a = eff(l);
      if (TA_TYPES[l.expense_type]) o.ta += a; else o.da += a;
      if (l.expense_type === 'Stay' || l.expense_type === 'Food') o.bills += a;
    });
    M.worked[emp + '|' + date] = { ta: Number(ta) || 0, da: Number(da) || 0 };
    o.ta = Math.round(o.ta); o.da = Math.round(o.da); o.bills = Math.round(o.bills);
    return o;
  };
  // what the dashboard itself worked out for the day (before an approved claim replaced it)
  var workedOf = function (r) {
    var w = M.worked[r.emp + '|' + r.date];
    return w ? { ta: w.ta, da: w.da } : { ta: Number(r.taA) || 0, da: Number(r.daA) || 0 };
  };

  /* why the claim differs from the worked-out day, in words */
  function delta(r, x) {
    var w0 = workedOf(r);
    var cal = w0.ta + w0.da;
    var d = Math.round(x.claimed - cal);
    if (!r.payable && !x.claimed) return '';
    if (Math.abs(d) < 1) return '<span style="color:var(--ink-3)">= worked out</span>';
    var why = [];
    if (x.stayFood) why.push('stay / food bills');
    if (x.car) why.push('own car');
    return '<span style="color:' + (d > 0 ? 'var(--warn, #b45309)' : 'var(--accent)') + '">' + (d > 0 ? '+' : '−') + inr(Math.abs(d)) +
      (why.length ? ' · ' + why.join(' + ') : ' vs worked out') + '</span>';
  }

  /* a line in words: what it is (the route, the hotel, the shop) and its
     detail -- the type word and the day are not repeated (the chip and the
     day say them); the handwritten / proof parts are shown on their own */
  var DAY_RE = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2} [A-Z][a-z]{2}$/;
  var unshout = function (t) { return /[a-z]/.test(t) || !/[A-Z]{3}/.test(t) ? t : t.toLowerCase().replace(/\b\w/g, function (c) { return c.toUpperCase(); }); };
  function lineWords(l) {
    var parts = plainNote(l).split(' · ').map(function (x) { return x.trim(); }).filter(Boolean);
    var rest = parts.slice(1).filter(function (x) { return !DAY_RE.test(x) && !/^(fuel|toll|own car)$/i.test(x); });
    if (/^own car/i.test(parts[0] || '')) return { main: l.expense_type === 'Fuel' ? 'Fuel bill' : 'Toll receipt', sub: 'own car' + (rest.filter(function (x) { return /^capped/.test(x); })[0] ? ' · ' + rest.filter(function (x) { return /^capped/.test(x); })[0] : '') };
    if (/top-up/i.test(parts[0] || '')) return { main: 'Top-up to 50 % DA', sub: rest.join(' · ') };
    if (l.expense_type === 'Daily Allowance') return { main: 'Daily allowance' + (rest[0] ? ' · ' + rest[0] : ''), sub: rest.slice(1).join(' · ') };
    return { main: unshout(rest[0] || l.expense_type), sub: rest.slice(1).join(' · ') };
  }
  /* a bill line's check, in two words and a colour */
  function checkWord(l) {
    if (!l.custom_bill) return ['worked out by the ERP', 'var(--ink-3)'];
    if (isHand(l)) return ['entered by hand — compare the photo and the payment proof', '#b54708'];
    if (!l.custom_ai_reason) return ['bill not checked', '#b54708'];
    var sc = Number(l.custom_ai_score) || 0;
    return sc >= 90 ? ['✓ checked', 'var(--ok, #16a34a)'] : sc >= 70 ? ['⚠ possible repeat', '#b42318'] : ['✗ does not match', '#b42318'];
  }

  /* a DAY's risk, by the same rules as the claim's score: a bill never checked
     or not matching -> High; a handwritten bill or a possible repeat ->
     Medium; else Low. Level only (13 Nov 2026), seen on every day row. */
  function dayRiskPill(x, lines) {
    var bad = lines.some(function (l) { return l.custom_bill && !isHand(l) && l.custom_ai_reason && Number(l.custom_ai_score) < 70; });
    var k = x.unchecked || bad ? 'High' : x.hand || x.flag ? 'Medium' : 'Low';
    var r = RISK[k];
    var why = k === 'High' ? (x.unchecked ? x.unchecked + ' bill(s) never checked' : 'a bill does not match') : k === 'Medium' ? (x.hand ? 'handwritten bill' : 'possible repeat') : 'every line checked or worked out by the ERP';
    return '<span title="' + esc(k + ' risk: ' + why) + '" style="display:inline-block;font-size:10px;font-weight:800;line-height:15px;padding:0 6px;border-radius:8px;color:' + r[1] + ';background:' + r[2] + ';border:1px solid ' + r[1] + '">' + (k === 'High' ? '⚠ ' : '') + k + '</span>';
  }

  /* the day's claim cell in the employee's day table: the amount, the day's
     risk, ONE Check button, and one short line under it */
  M.cell = function (r) {
    var td = '<td style="padding:6px 10px;border-bottom:1px solid var(--surface-2);text-align:right;white-space:nowrap;vertical-align:middle">';
    var d = M.byDay[r.emp + '|' + r.date];
    if (!d) return td + '<span style="color:var(--ink-4)">—</span></td>';
    var x = sums(d.lines);
    var amount = x.adj
      ? '<s style="color:var(--ink-3);font-weight:400">' + inr(x.claimed) + '</s> <b style="color:var(--warn, #b45309)">' + inr(x.fin) + '</b>'
      : '<b style="font-size:13.5px">' + inr(x.claimed) + '</b>';
    var btn = M.verifier && d.claim.workflow_state === 'Approved'
      ? '<button type="button" data-fxclaim="' + esc(r.emp + '|' + r.date) + '" title="Check / adjust this day" ' +
        'style="border:1px solid var(--accent);background:transparent;color:var(--accent);border-radius:6px;cursor:pointer;padding:2px 10px;font-size:12px;font-weight:600">Check</button>'
      : '';
    // one line: the difference from the worked-out day, then the bills that need a look
    var notes = [];
    var dl = delta(r, x);
    if (dl) notes.push(dl);
    if (x.hand) notes.push('<span style="color:#b54708;font-weight:700">✍ ' + (x.hand > 1 ? x.hand + ' ' : '') + 'handwritten</span>');
    if (x.flag) notes.push('<span style="color:#b42318;font-weight:700">⚠ ' + x.flag + ' possible repeat</span>');
    if (x.unchecked) notes.push('<span style="color:#b54708">' + x.unchecked + ' bill' + (x.unchecked > 1 ? 's' : '') + ' not checked</span>');
    else if (x.bills && !x.hand && !x.flag) notes.push('<span style="color:var(--ink-3)">' + x.bills + ' bill' + (x.bills > 1 ? 's' : '') + ' ✓</span>');
    return td +
      '<div style="display:inline-flex;flex-direction:column;align-items:flex-end;gap:3px;line-height:1.2">' +
        '<span style="display:inline-flex;align-items:center;gap:8px">' + amount + dayRiskPill(x, d.lines) + btn + '</span>' +
        (notes.length ? '<span style="font-size:11px">' + notes.join(' <span style="color:var(--ink-4)">·</span> ') + '</span>' : '') +
      '</div></td>';
  };

  /* the claim, inside the opened day: a clear header, three figures, then
     every line -- what it is, its detail, its bill and check, any adjustment */
  M.panel = function (r) {
    var d = M.byDay[r.emp + '|' + r.date];
    if (!d) return '';
    var c = d.claim, x = sums(d.lines);
    var st = STATE[c.workflow_state] || [c.workflow_state, 'var(--ink-3)'];
    var w0 = workedOf(r);
    var cal = w0.ta + w0.da;
    var diff = Math.round((x.adj ? x.fin : x.claimed) - cal);
    var fig = function (label, val, color, note) {
      return '<div style="flex:1;min-width:120px;padding:8px 12px;border-radius:8px;background:var(--surface-2)">' +
        '<div style="font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3)">' + label + '</div>' +
        '<div style="font-size:16px;font-weight:700;margin-top:2px;color:' + (color || 'inherit') + '">' + val + '</div>' +
        (note ? '<div style="font-size:11px;color:var(--ink-3);margin-top:1px">' + note + '</div>' : '') + '</div>';
    };
    var why = [];
    if (x.stayFood) why.push('stay / food bills');
    if (x.car) why.push('own car');
    var rows = d.lines.map(function (l, i) {
      var col = TYPE_C[l.expense_type] || 'var(--ink-3)';
      var w = lineWords(l);
      var ck = checkWord(l);
      var hand = isHand(l) ? handOf(l) : null;
      var label = l.expense_type === 'Daily Allowance' ? (/top-up/i.test(l.description || '') ? 'DA +' : 'DA') : l.expense_type;
      return '<div style="display:grid;grid-template-columns:64px minmax(0,1fr) auto;gap:12px;align-items:start;padding:10px 0;' + (i ? 'border-top:1px solid var(--line);' : '') + (hand ? 'background:rgba(254,223,137,.08);' : '') + '">' +
        '<span style="text-align:center;font-size:11px;font-weight:700;padding:2px 0;border-radius:5px;color:#fff;background:' + col + '">' + esc(label) + '</span>' +
        '<div style="min-width:0">' +
          '<div style="font-size:13px;font-weight:600">' + esc(w.main) + (hand ? ' ' + HAND_TAG : '') + '</div>' +
          (w.sub ? '<div style="font-size:11.5px;color:var(--ink-3);margin-top:2px">' + esc(w.sub) + '</div>' : '') +
          '<div style="font-size:11.5px;margin-top:4px;display:flex;gap:10px;flex-wrap:wrap">' +
            '<span style="color:' + ck[1] + ';font-weight:600">' + ck[0] + '</span>' +
            (l.custom_bill ? '<a href="' + esc(l.custom_bill) + '" target="_blank" rel="noopener">View bill</a>' : '') +
            (hand ? (hand.proof ? '<a href="' + esc(hand.proof) + '" target="_blank" rel="noopener" style="font-weight:700">Payment proof</a>' : '<b style="color:#b42318">no payment proof</b>') : '') +
          '</div>' +
          (hand ? '<div style="font-size:11.5px;margin-top:3px;color:#d97706">Rep&rsquo;s reason: <i>&ldquo;' + esc(hand.why || 'none given') + '&rdquo;</i></div>' : '') +
          (l.custom_adjusted ? '<div style="font-size:11.5px;margin-top:3px;color:var(--warn, #b45309)">Adjusted ' + inr(l.amount) + ' → ' + inr(l.custom_adjusted_amount) + ' by ' + esc(M.names[l.custom_adjusted_by] || l.custom_adjusted_by || '') + ' — “' + esc(l.custom_adjust_reason || '') + '”</div>' : '') +
        '</div>' +
        '<div style="text-align:right;white-space:nowrap;font-size:13.5px;font-weight:700">' +
          (l.custom_adjusted ? '<s style="color:var(--ink-3);font-weight:400;font-size:12px">' + inr(l.amount) + '</s> ' + inr(l.custom_adjusted_amount) : inr(l.amount)) + '</div>' +
        '</div>';
    }).join('');
    return '<div style="margin-top:12px;border:1px solid var(--line);border-left:3px solid var(--accent);border-radius:10px;padding:12px 14px;background:var(--surface)">' +
      '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
        '<span style="font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3)">Planner claim</span>' +
        '<b>' + esc(c.name) + '</b>' + pill(st) + riskPill(c) +
        '<span style="flex:1"></span>' +
        (M.verifier && c.workflow_state === 'Approved'
          ? '<button type="button" data-fxclaim="' + esc(r.emp + '|' + r.date) + '" style="border:0;background:var(--brand, #2563eb);color:#fff;border-radius:6px;cursor:pointer;padding:5px 14px;font-size:12.5px;font-weight:600">Check / adjust</button>'
          : '') +
      '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 4px">' +
        fig('Claimed', x.adj ? '<s style="color:var(--ink-3);font-weight:400;font-size:13px">' + inr(x.claimed) + '</s> ' + inr(x.fin) : inr(x.claimed), null, x.adj ? 'after ' + x.adj + ' adjustment' + (x.adj > 1 ? 's' : '') : '') +
        fig('Worked out', inr(cal), null, 'TA ' + inr(w0.ta) + ' + DA ' + inr(w0.da) + (M.worked[r.emp + '|' + r.date] ? ' · the row now shows the approved claim' : '')) +
        fig('Difference', Math.abs(diff) < 1 ? '—' : (diff > 0 ? '+' : '−') + inr(Math.abs(diff)), Math.abs(diff) < 1 ? null : diff > 0 ? 'var(--warn, #b45309)' : 'var(--accent)', Math.abs(diff) < 1 ? 'same as worked out' : why.join(' + ')) +
      '</div>' +
      rows +
    '</div>';
  };

  /* the employee's claims, under their day table: one row each, with its risk */
  M.foot = function (a) {
    var emp = (a && a.rows && a.rows[0] && a.rows[0].emp) || '';
    var list = M.byEmp[emp] || [];
    var style = 'padding:8px 10px;border-top:2px solid var(--line);font-size:12.5px;background:var(--surface-2)';
    var wait = (M.notYet && M.notYet[emp]) || [];
    // claims not approved yet are the officer's: named, not shown
    var waitNote = wait.length ? '<div style="margin-top:' + (list.length ? '4' : '0') + 'px;color:var(--ink-3)">' + wait.map(function (c) {
      return 'Planner claim ' + esc(c.name) + ' is ' + esc((STATE[c.workflow_state] || [c.workflow_state])[0]) + ' — it comes here once the officer approves it.';
    }).join('<br>') + '</div>' : '';
    if (!list.length) return '<tr><td colspan="99" style="' + style + ';color:var(--ink-3)">' + (waitNote || 'No field claim from the planner for ' + esc(monthWord(M.month)) + ' yet.') + '</td></tr>';
    // the riskiest first
    var order = { High: 0, Medium: 1, Low: 2 };
    return list.slice().sort(function (p, q) { return (order[riskOf(p)] === undefined ? -1 : order[riskOf(p)]) - (order[riskOf(q)] === undefined ? -1 : order[riskOf(q)]); })
      .map(function (c, i) { return claimRow(c, i ? style.replace('border-top:2px', 'border-top:1px') : style); }).join('') +
      (waitNote ? '<tr><td colspan="99" style="' + style.replace('border-top:2px', 'border-top:1px') + ';font-size:12px">' + waitNote + '</td></tr>' : '');
  };
  function claimRow(c, style) {
    var x = sums(c.lines);
    var claimed = x.claimed, fin = x.fin, adj = x.adj;
    var st = STATE[c.workflow_state] || [c.workflow_state, 'var(--ink-3)'];
    var days = {};
    c.lines.forEach(function (l) { days[String(l.expense_date).slice(0, 10)] = 1; });
    return '<tr><td colspan="99" style="' + style + '">' +
      '<b>Planner claim ' + esc(c.name) + '</b> ' + pill(st) + ' ' + riskPill(c, true) +
      ' · ' + Object.keys(days).length + ' days · ' + c.lines.length + ' lines' +
      ' · claimed <b>' + inr(claimed) + '</b> (TA ' + inr(x.ta) + ' + DA ' + inr(x.da) + ')' +
      (x.bills ? ' · 🧾 ' + x.bills + ' bill' + (x.bills > 1 ? 's' : '') : '') +
      (x.hand ? ' · ' + HAND_TAG.replace('✍ Handwritten', '✍ ' + x.hand + ' handwritten') : '') +
      (x.flag ? ' · <span style="color:var(--critical)">⚠ ' + x.flag + ' possible repeat</span>' : '') +
      (adj ? ' · after ' + adj + ' adjustment' + (adj > 1 ? 's' : '') + ' <b style="color:var(--warn, #b45309)">' + inr(fin) + '</b>' : '') +
      (c.workflow_state === 'Verified' ? ' · finalised by ' + esc(M.names[c.custom_finalised_by] || c.custom_finalised_by || '') + (c.custom_additional_salary ? ' · ' + esc(c.custom_additional_salary) : '') : '') +
      (c.workflow_state === 'Approved' && M.verifier ? ' · <span style="color:var(--ink-3)">open a day or press Check, then Finalise in the top bar</span>' : '') +
      (riskOf(c) && riskOf(c) !== 'Low' ? '<div style="margin-top:4px;font-size:12px;color:' + RISK[riskOf(c)][1] + '">' + esc(c.custom_ai_summary || '') + '</div>' : '') +
      '</td></tr>';
  }

  /* ---------- the day's check / adjust panel ---------- */
  function overlay(inner) {
    var o = document.createElement('div');
    o.setAttribute('data-fxclaims-modal', '1');
    o.style.cssText = 'position:fixed;inset:0;z-index:1000;background:rgba(10,14,22,.55);display:flex;align-items:center;justify-content:center;padding:16px';
    o.innerHTML = '<div style="background:var(--surface, #fff);color:var(--ink, #111);border:1px solid var(--line);border-radius:12px;max-width:640px;width:100%;max-height:90vh;overflow:auto;padding:18px;font-size:13px;box-shadow:0 20px 50px rgba(0,0,0,.35)">' + inner + '</div>';
    o.addEventListener('click', function (ev) { if (ev.target === o) o.remove(); });
    document.body.appendChild(o);
    return o;
  }

  function openDay(key) {
    var d = M.byDay[key];
    if (!d) return;
    var c = d.claim;
    var rows = d.lines.map(function (l) {
      return '<tr>' +
        '<td style="padding:6px 4px;vertical-align:top"><b>' + esc(l.expense_type) + '</b><div style="color:var(--ink-3);font-size:11.5px;max-width:300px">' + esc(l.description || '') + '</div>' +
          (isHand(l) ? '<div style="margin-top:2px">' + HAND_TAG + ' <span style="font-size:11.5px;color:#7a2e0e">&ldquo;' + esc(handOf(l).why || 'no reason') + '&rdquo;</span></div>' : '') +
          (l.custom_bill ? '<a href="' + esc(l.custom_bill) + '" target="_blank" rel="noopener" style="font-size:11.5px">View bill</a>' : '') +
          (isHand(l) ? (handOf(l).proof ? ' · <a href="' + esc(handOf(l).proof) + '" target="_blank" rel="noopener" style="font-size:11.5px;font-weight:700">Payment proof</a>' : ' · <b style="font-size:11.5px;color:#b42318">no payment proof</b>') : '') +
          (l.custom_ai_reason ? '<div style="font-size:11px;color:' + (Number(l.custom_ai_score) >= 90 ? 'var(--ok, #16a34a)' : 'var(--warn, #b45309)') + '">' + esc(l.custom_ai_reason) + '</div>' : '') +
        '</td>' +
        '<td style="padding:6px 4px;text-align:right;vertical-align:top;white-space:nowrap">' + inr(l.amount) + '</td>' +
        '<td style="padding:6px 4px;text-align:right;vertical-align:top"><input data-fxrow="' + esc(l.name) + '" type="number" min="0" step="1" value="' + Math.round(eff(l)) + '" ' +
          'style="width:96px;text-align:right;padding:4px 6px;border:1px solid var(--line);border-radius:6px;background:var(--surface);color:inherit;font-weight:600"></td>' +
        '</tr>';
    }).join('');
    var prev = d.lines.filter(function (l) { return l.custom_adjusted; }).map(function (l) {
      return esc(l.expense_type) + ': ' + inr(l.amount) + ' → ' + inr(l.custom_adjusted_amount) + ' — ' + esc(l.custom_adjust_reason || '') + ' (' + esc(M.names[l.custom_adjusted_by] || l.custom_adjusted_by || '') + ')';
    }).join('<br>');
    var o = overlay(
      '<div style="display:flex;align-items:baseline;gap:8px;margin-bottom:8px"><b style="font-size:15px">' + esc(c.employee_name) + ' · ' + esc(key.split('|')[1]) + '</b>' +
        '<span style="color:var(--ink-3)">' + esc(c.name) + '</span> ' + riskPill(c) + '</div>' +
      '<div style="color:var(--ink-3);margin-bottom:8px">The worked-out day is in the row behind this. Change a line only if it is wrong; the rep sees the new amount, who changed it and why.</div>' +
      '<table style="width:100%;border-collapse:collapse"><thead><tr style="color:var(--ink-3);font-size:11.5px;text-align:left"><th>Line</th><th style="text-align:right">Claimed</th><th style="text-align:right">Final</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      (prev ? '<div style="margin-top:8px;font-size:12px;color:var(--warn, #b45309)">' + prev + '</div>' : '') +
      '<label style="display:block;margin-top:10px;font-weight:600">Reason for a change <span style="font-weight:400;color:var(--ink-3)">(needed when an amount changes)</span>' +
        '<textarea data-fxreason rows="2" style="display:block;width:100%;margin-top:4px;padding:6px 8px;border:1px solid var(--line);border-radius:6px;background:var(--surface);color:inherit"></textarea></label>' +
      '<div data-fxerr style="color:var(--critical);margin-top:6px"></div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px">' +
        '<button type="button" data-fxcancel style="padding:6px 14px;border:1px solid var(--line);border-radius:8px;background:var(--surface);color:inherit;cursor:pointer">Cancel</button>' +
        '<button type="button" data-fxsave style="padding:6px 16px;border:0;border-radius:8px;background:var(--brand, #2563eb);color:#fff;font-weight:600;cursor:pointer">Save</button></div>');
    o.querySelector('[data-fxcancel]').onclick = function () { o.remove(); };
    o.querySelector('[data-fxsave]').onclick = function () {
      var lines = [];
      o.querySelectorAll('[data-fxrow]').forEach(function (i) { lines.push({ row: i.getAttribute('data-fxrow'), amount: Number(i.value) }); });
      var reason = o.querySelector('[data-fxreason]').value.trim();
      var btn = this;
      btn.disabled = true; btn.textContent = 'Saving…';
      api('POST', { action: 'adjust', claim: c.name, lines: JSON.stringify(lines), reason: reason })
        .then(function () { o.remove(); return load(); })
        .catch(function (e) { o.querySelector('[data-fxerr]').textContent = e.message; btn.disabled = false; btn.textContent = 'Save'; });
    };
  }

  /* ---------- one button for the whole month ---------- */
  function bar() {
    var host = document.getElementById('fx-erp-bar');
    if (!host) return;
    var b = document.getElementById('fx-claims-final');
    if (!M.verifier) { if (b) b.remove(); return; }
    var ready = Object.keys(M.claims).map(function (k) { return M.claims[k]; }).filter(function (c) { return c.workflow_state === 'Approved'; });
    var total = 0;
    ready.forEach(function (c) { c.lines.forEach(function (l) { if (l.expense_type !== 'Advance') total += eff(l); }); });
    if (!b) {
      b = document.createElement('button');
      b.id = 'fx-claims-final';
      b.type = 'button';
      b.style.cssText = 'padding:5px 12px;border-radius:8px;border:0;font-weight:600;cursor:pointer;background:var(--brand, #2563eb);color:#fff';
      b.onclick = finalise;
      host.appendChild(b);
    }
    b.disabled = !ready.length;
    b.style.opacity = ready.length ? '1' : '.5';
    b.textContent = ready.length
      ? 'Finalise ' + monthWord(M.month) + ' for payroll · ' + ready.length + ' claim' + (ready.length > 1 ? 's' : '') + ' · ' + inr(total)
      : 'No approved claims to finalise for ' + monthWord(M.month);
    b.dataset.count = ready.length;
    b.dataset.total = total;
    riskBar(host, ready);
  }

  /* the month's claims by risk, the High ones by name -- beside Finalise */
  function riskBar(host, ready) {
    var all = Object.keys(M.claims).map(function (k) { return M.claims[k]; });
    var n = { High: [], Medium: [], Low: [], none: [] };
    all.forEach(function (c) { (n[riskOf(c)] || n.none).push(c); });
    var r = document.getElementById('fx-claims-risk');
    if (!r) {
      r = document.createElement('span');
      r.id = 'fx-claims-risk';
      r.style.cssText = 'display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:12px;margin-left:8px';
      host.appendChild(r);
    }
    var chip = function (k) {
      var x = RISK[k];
      return n[k].length ? '<span title="' + esc(n[k].map(function (c) { return c.employee_name + ' · ' + c.name; }).join('\n')) + '" style="font-weight:800;padding:1px 8px;border-radius:9px;color:' + x[1] + ';background:' + x[2] + ';border:1px solid ' + x[1] + '">' + n[k].length + ' ' + k + '</span>' : '';
    };
    r.innerHTML = '<span style="color:var(--ink-3)">Risk:</span>' + chip('High') + chip('Medium') + chip('Low') +
      (n.none.length ? '<span style="color:var(--ink-3)">' + n.none.length + ' not scored</span>' : '') +
      (n.High.length ? '<span style="color:#b42318;font-weight:600">· check first: ' + esc(n.High.map(function (c) { return c.employee_name; }).filter(function (v, i, s) { return s.indexOf(v) === i; }).join(', ')) + '</span>' : '');
    M.readyRisk = { High: ready.filter(function (c) { return riskOf(c) === 'High'; }).length, Medium: ready.filter(function (c) { return riskOf(c) === 'Medium'; }).length };
  }

  function finalise() {
    var b = document.getElementById('fx-claims-final');
    var n = Number(b && b.dataset.count) || 0;
    if (!n) return;
    var o = overlay(
      '<b style="font-size:15px">Finalise ' + esc(monthWord(M.month)) + ' for payroll?</b>' +
      '<p style="margin:8px 0">All <b>' + n + '</b> approved field claim' + (n > 1 ? 's' : '') + ' — <b>' + inr(b.dataset.total) + '</b> with every adjustment — go to payroll now: one Additional Salary (Field Expenses Reimbursement) per employee, in next month&rsquo;s payroll. The claims become final and can no longer be adjusted.</p>' +
      ((M.readyRisk && (M.readyRisk.High || M.readyRisk.Medium))
        ? '<p style="margin:8px 0;padding:8px 10px;border-radius:8px;background:#fef3f2;color:#912018">Included: ' +
          (M.readyRisk.High ? '<b>' + M.readyRisk.High + ' High risk</b>' : '') + (M.readyRisk.High && M.readyRisk.Medium ? ' and ' : '') +
          (M.readyRisk.Medium ? '<b>' + M.readyRisk.Medium + ' Medium risk</b>' : '') + ' claim(s). Check them first (open the day, adjust if needed).</p>'
        : '') +
      '<p style="margin:8px 0;color:var(--ink-3)">Claims still with an officer are not included; they can be finalised once approved.</p>' +
      '<div data-fxerr style="color:var(--critical);margin-top:6px"></div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px">' +
        '<button type="button" data-fxcancel style="padding:6px 14px;border:1px solid var(--line);border-radius:8px;background:var(--surface);color:inherit;cursor:pointer">Cancel</button>' +
        '<button type="button" data-fxgo style="padding:6px 16px;border:0;border-radius:8px;background:var(--brand, #2563eb);color:#fff;font-weight:600;cursor:pointer">Finalise ' + n + ' claim' + (n > 1 ? 's' : '') + '</button></div>');
    o.querySelector('[data-fxcancel]').onclick = function () { o.remove(); };
    o.querySelector('[data-fxgo]').onclick = function () {
      var btn = this;
      btn.disabled = true; btn.textContent = 'Finalising…';
      api('POST', { action: 'finalize', month: M.month })
        .then(function (r) {
          o.remove();
          var msg = (r.finalised || []).length + ' claim(s) finalised · ' + inr(r.total) + ' in payroll on ' + r.payroll_date +
            ((r.failed || []).length ? '\n' + r.failed.length + ' could not be finalised (see the ERP Error Log): ' + r.failed.map(function (f) { return f.employee; }).join(', ') : '');
          window.alert(msg);
          return load();
        })
        .catch(function (e) { o.querySelector('[data-fxerr]').textContent = e.message; btn.disabled = false; btn.textContent = 'Finalise'; });
    };
  }

  // a ✎ in a day row opens the check panel -- and must not also open the day
  document.addEventListener('click', function (ev) {
    var t = ev.target && ev.target.closest && ev.target.closest('[data-fxclaim]');
    if (!t) return;
    ev.preventDefault();
    ev.stopPropagation();
    openDay(t.getAttribute('data-fxclaim'));
  }, true);

  // start once the dashboard has worked out its month
  var tries = 0;
  var wait = setInterval(function () {
    tries++;
    if (window.__fxMonth && window.__fxRender) {
      clearInterval(wait);
      M.month = window.__fxMonth;
      load();
    } else if (tries > 600) clearInterval(wait);
  }, 500);
})();
