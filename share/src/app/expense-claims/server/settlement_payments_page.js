// Web Page "settlement-payments" (/settlement-payments) -- SCRIPT (18 Nov 2026).
// Accounts' dashboard for paying settlement bills, listed on the Dashboards
// workspace next to Field Expenses. Everything for this one process in one
// place: what is owed (bills the CEO approved, already booked on 2120, and
// cash advances) with its ageing, the payment run (bank file, UTR, record
// payment -- the ERP makes the Payment Entries), and what was paid. Data +
// actions: Server Script "Settlement Accounts API" (/api/method/settlement_accounts).
(function () {
  function start() {
    var root = document.getElementById("sp");
    if (!root) return;
    var $ = function (s) { return root.querySelector(s); };
    var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
    var inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2, minimumFractionDigits: 2 });
    var money = function (v) { return inr.format(v || 0); };
    // a payment: the bills' Bank Entry is a Journal Entry (ACC-JV-), an advance's a Payment Entry (23 Nov 2026)
    var docUrl = function (n) { return (/^ACC-JV-/.test(String(n)) ? "/app/journal-entry/" : "/app/payment-entry/") + encodeURIComponent(n); };
    var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    var dfmt = function (d) { if (!d) return ""; var p = String(d).slice(0, 10).split("-"); return p[2] + " " + MON[+p[1] - 1] + " " + p[0]; };
    var plural = function (n, w, ws) { return n + " " + (n === 1 ? w : (ws || w + "s")); };
    var today = new Date().toISOString().slice(0, 10);
    var rows = [], picked = {}, open = {}, utrs = {}, query = "", ageOn = null;
    // ageing bands, days since the CEO's approval (= the booking date)
    var AGES = [
      { label: "0–7 days", max: 7, color: "var(--a1)" },
      { label: "8–15 days", max: 15, color: "var(--a2)" },
      { label: "16–30 days", max: 30, color: "var(--a3)" },
      { label: "Over 30 days", max: 1e9, color: "var(--a4)" },
    ];
    var daysOf = function (d) { return d ? Math.max(0, Math.round((new Date(today) - new Date(String(d).slice(0, 10))) / 864e5)) : 0; };
    var bandOf = function (d) { var n = daysOf(d); for (var i = 0; i < AGES.length; i++) if (n <= AGES[i].max) return i; return AGES.length - 1; };
    var items = function (r) { return r.claims.concat(r.advances); };
    var since = function (r) { var d = ""; items(r).forEach(function (x) { if (!d || x.date < d) d = x.date; }); return d; };
    var last4 = function (s) { s = String(s || ""); return s.length > 4 ? "••" + s.slice(-4) : s; };

    function api(method, params) {
      var hdr = { Accept: "application/json" };
      var opt = { credentials: "same-origin", headers: hdr };
      var url = "/api/method/settlement_accounts";
      if (method === "GET") url += "?" + new URLSearchParams(params).toString();
      else {
        hdr["Content-Type"] = "application/x-www-form-urlencoded";
        if (window.frappe && window.frappe.csrf_token) hdr["X-Frappe-CSRF-Token"] = window.frappe.csrf_token;
        opt.method = "POST";
        opt.body = new URLSearchParams(params).toString();
      }
      return fetch(url, opt).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (r.ok) return j.message || {};
          var msg = "";
          try { msg = JSON.parse(JSON.parse(j._server_messages)[0]).message; } catch (e) { msg = j.exception || ("Error " + r.status); }
          var err = new Error(String(msg).replace(/<[^>]+>/g, ""));
          err.denied = r.status === 403 || j.exc_type === "PermissionError";
          throw err;
        });
      });
    }

    // ---- dialogs (the website has no frappe.confirm / msgprint)
    function dialog(title, html, yesText, onYes, wide) {
      $(".sp-dialog").classList.toggle("sp-wide", !!wide);
      $("[data-mtitle]").textContent = title;
      $("[data-mbody]").innerHTML = html;
      $("[data-myes]").textContent = yesText || "OK";
      $("[data-mno]").hidden = !onYes;
      $("[data-modal]").hidden = false;
      $("[data-myes]").onclick = function () { $("[data-modal]").hidden = true; if (onYes) onYes(); };
      $("[data-mno]").onclick = function () { $("[data-modal]").hidden = true; };
      $("[data-myes]").focus();
    }

    function load() {
      $("[data-sub]").textContent = "Loading…";
      return api("GET", { action: "due" }).then(function (m) {
        rows = (m.employees || []).sort(function (a, b) { return b.total - a.total; });
        Object.keys(picked).forEach(function (id) { if (!rows.some(function (x) { return x.employee === id; })) delete picked[id]; });
        if (m.today) today = m.today;
        if (!$("[data-date]").value) $("[data-date]").value = today;
        var sel = $("[data-bank]"), keep = sel.value;
        sel.innerHTML = (m.banks || []).map(function (b) { return '<option value="' + esc(b) + '">' + esc(b.replace(/ - ELPL$/, "")) + "</option>"; }).join("");
        sel.value = keep || m.default_bank || (m.banks || [])[0] || "";
        summary(m);
        render();
        renderPaid(m.paid || []);
      }).catch(function (e) {
        if (e.denied) {
          root.innerHTML = '<div class="sp-panel sp-empty"><h2>This page is for the Accounts team</h2><p class="sp-note">Log in with your Accounts login to pay settlements.</p>'
            + '<p><a class="sp-btn sp-primary" href="/login?redirect-to=/settlement-payments">Log in</a></p></div>';
        } else $("[data-sub]").textContent = "Could not load: " + e.message + " — press Refresh.";
      });
    }

    function summary(m) {
      var total = 0, bills = 0, billsAmt = 0, adv = 0, advAmt = 0, oldest = "";
      rows.forEach(function (r) {
        total += r.total;
        r.claims.forEach(function (c) { bills++; billsAmt += c.amount; });
        r.advances.forEach(function (a) { adv++; advAmt += a.amount; });
        var s = since(r);
        if (s && (!oldest || s < oldest)) oldest = s;
      });
      $('[data-k="total"]').textContent = money(total);
      $('[data-k="total_sub"]').textContent = rows.length ? plural(rows.length, "employee") + (oldest ? " · oldest " + plural(daysOf(oldest), "day") : "") : "Nothing to pay";
      $('[data-k="bills"]').textContent = money(billsAmt);
      $('[data-k="bills_sub"]').textContent = plural(bills, "bill");
      $('[data-k="adv"]').textContent = money(advAmt);
      $('[data-k="adv_sub"]').textContent = plural(adv, "advance");
      $('[data-k="paid"]').textContent = money(m.paid_month);
      $('[data-k="paid_sub"]').textContent = plural(m.paid_month_count || 0, "payment entry", "payment entries");
      $("[data-sub]").textContent = rows.length
        ? "Employee bills and cash advances approved by the CEO, booked to 2120 Employee Expense Payable and waiting for payment."
        : "Nothing to pay. Approved bills appear here as soon as the CEO approves them.";
    }

    function ageing() {
      var amt = [0, 0, 0, 0], total = 0;
      rows.forEach(function (r) { items(r).forEach(function (x) { amt[bandOf(x.date)] += x.amount; total += x.amount; }); });
      var bar = $("[data-agebar]");
      bar.classList.toggle("filtered", ageOn !== null);
      bar.innerHTML = total ? AGES.map(function (a, i) {
        return amt[i] ? '<button data-age="' + i + '" class="' + (ageOn === i ? "on" : "") + '" style="flex:' + amt[i] + ";background:" + a.color + '" title="' + esc(a.label + " · " + money(amt[i])) + '" aria-label="' + esc("Show " + a.label) + '"></button>' : "";
      }).join("") : "";
      $("[data-agekeys]").innerHTML = AGES.map(function (a, i) {
        return '<button class="sp-key' + (ageOn === i ? " on" : "") + '" data-age="' + i + '"' + (amt[i] ? "" : " disabled") + '><i style="background:' + a.color + '"></i>' + esc(a.label) + " <b>" + money(amt[i]) + "</b></button>";
      }).join("");
      $("[data-age-clear]").hidden = ageOn === null;
    }

    function shown() {
      return rows.filter(function (r) {
        if (query && (r.employee_name + " " + r.employee + " " + r.hq).toLowerCase().indexOf(query) < 0) return false;
        if (ageOn !== null && !items(r).some(function (x) { return bandOf(x.date) === ageOn; })) return false;
        return true;
      });
    }

    var CARET = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';

    function rowHtml(r) {
      var on = !!picked[r.employee], bankOk = r.bank_ac_no && r.ifsc;
      var bAmt = r.claims.reduce(function (s, c) { return s + c.amount; }, 0);
      var aAmt = r.advances.reduce(function (s, a) { return s + a.amount; }, 0);
      var d = since(r), n = daysOf(d), band = AGES[bandOf(d)];
      var main = '<tr class="sp-row' + (on ? " on" : "") + '">'
        + '<td class="c"><input type="checkbox" data-pick="' + esc(r.employee) + '"' + (on ? " checked" : "") + ' aria-label="' + esc("Pay " + r.employee_name) + '"></td>'
        + '<td><div class="sp-who"><button class="sp-caret' + (open[r.employee] ? " open" : "") + '" data-open="' + esc(r.employee) + '" aria-expanded="' + !!open[r.employee] + '" aria-label="' + esc("Show " + r.employee_name + "'s documents") + '">' + CARET + "</button>"
        + '<div><span class="sp-name">' + esc(r.employee_name) + '</span><span class="sp-sub mono">' + esc(r.employee) + "</span></div></div></td>"
        + "<td>" + esc(r.hq || "–") + "</td>"
        + '<td class="r">' + (r.claims.length ? '<span class="sp-amt">' + money(bAmt) + '</span><span class="sp-sub">' + plural(r.claims.length, "bill") + "</span>" : '<span class="sp-sub">–</span>') + "</td>"
        + '<td class="r">' + (r.advances.length ? '<span class="sp-amt">' + money(aAmt) + "</span>" : '<span class="sp-sub">–</span>') + "</td>"
        + '<td><span class="sp-age"><i style="background:' + band.color + '"></i>' + plural(n, "day") + '</span><span class="sp-sub">since ' + dfmt(d) + "</span></td>"
        + "<td>" + (bankOk ? esc(r.bank_name || "Bank") + '<span class="sp-sub mono" title="' + esc(r.bank_ac_no) + '">' + esc(last4(r.bank_ac_no)) + " · " + esc(r.ifsc) + "</span>"
          : '<span class="sp-nobank">No bank details</span><span class="sp-sub">Ask HR to add them</span>') + "</td>"
        + '<td class="r sp-total">' + money(r.total) + "</td></tr>";
      if (!open[r.employee]) return main;
      var docs = r.claims.map(function (c) {
        return '<tr class="sp-doc"><td></td><td colspan="4"><span class="sp-tag">Bill</span><b>' + esc(c.title) + '</b> <span class="sp-sub" style="display:inline">· ' + dfmt(c.bill_date || c.date) + " · " + esc((c.account || "").replace(/ - ELPL$/, "")) + "</span></td>"
          + '<td><span class="sp-sub" style="display:inline">approved ' + dfmt(c.date) + "</span></td>"
          + '<td><span class="sp-doclinks"><a class="mono" href="/app/settlement-expense/' + encodeURIComponent(c.name) + '" target="_blank">' + esc(c.name) + "</a>"
          + (c.entry ? '<a class="mono" href="/app/journal-entry/' + encodeURIComponent(c.entry) + '" target="_blank">' + esc(c.entry) + "</a>" : "")
          + (c.bill ? '<a href="' + esc(c.bill) + '" data-photo="' + esc(c.bill) + '" data-ptitle="' + esc(r.employee_name + " · " + c.title + " · " + money(c.amount)) + '" data-claim="' + esc(c.name) + '">Bill photo</a>' : "") + "</span></td>"
          + '<td class="r sp-amt">' + money(c.amount) + "</td></tr>";
      }).concat(r.advances.map(function (a) {
        return '<tr class="sp-doc"><td></td><td colspan="4"><span class="sp-tag">Advance</span><b>' + esc(a.purpose || "Cash advance") + "</b></td>"
          + '<td><span class="sp-sub" style="display:inline">approved ' + dfmt(a.date) + "</span></td>"
          + '<td><a class="mono" href="/app/employee-advance/' + encodeURIComponent(a.name) + '" target="_blank">' + esc(a.name) + "</a></td>"
          + '<td class="r sp-amt">' + money(a.amount) + "</td></tr>";
      })).join("");
      return main + docs;
    }

    function render() {
      ageing();
      var list = shown();
      var body = $("[data-rows]");
      if (!list.length) {
        body.innerHTML = '<tr><td colspan="8" class="sp-empty">' + (rows.length ? "No one matches. Clear the search or the ageing filter." : "Nothing to pay. Approved bills appear here as soon as the CEO approves them.") + "</td></tr>";
      } else body.innerHTML = list.map(rowHtml).join("");
      $("[data-regnote]").textContent = rows.length ? (list.length === rows.length ? plural(rows.length, "employee") + ", largest first" : list.length + " of " + plural(rows.length, "employee") + " shown") : "";
      $("[data-all]").checked = list.length > 0 && list.every(function (r) { return picked[r.employee]; });
      run();
    }

    // the payment run: who is ticked, their UTRs, and the total
    function run() {
      var sel = rows.filter(function (r) { return picked[r.employee]; });
      var amt = sel.reduce(function (s, r) { return s + r.total; }, 0);
      $("[data-runtotal]").textContent = money(amt);
      $("[data-runinfo]").textContent = sel.length ? plural(sel.length, "employee") + " in this run" : "Tick employees in the list to add them.";
      var noBank = sel.filter(function (r) { return !(r.bank_ac_no && r.ifsc); });
      $("[data-runlist]").innerHTML = sel.map(function (r) {
        return "<li><span><b>" + esc(r.employee_name) + '</b><span class="sp-sub">' + esc(r.bank_name || "No bank details") + (r.bank_ac_no ? " " + esc(last4(r.bank_ac_no)) : "") + "</span></span>"
          + '<span class="sp-amt">' + money(r.total) + "</span>"
          + '<input data-utr-for="' + esc(r.employee) + '" value="' + esc(utrs[r.employee] || "") + '" placeholder="Own UTR (if paid separately)" aria-label="' + esc("UTR for " + r.employee_name) + '">'
          + '<button class="sp-x" data-unpick="' + esc(r.employee) + '">Remove</button></li>';
      }).join("");
      $("[data-runwarn]").hidden = !noBank.length;
      $("[data-runwarn]").textContent = noBank.length ? noBank.map(function (r) { return r.employee_name; }).join(", ") + " " + (noBank.length === 1 ? "has" : "have") + " no bank details in the ERP — the bank file leaves them empty." : "";
      $("[data-pay]").textContent = sel.length ? "Record payment · " + money(amt) : "Record payment";
      $("[data-pay]").disabled = !sel.length;
      $("[data-csv]").disabled = !sel.length;
    }

    function renderPaid(paid) {
      $("[data-paid]").innerHTML = paid.length ? paid.map(function (p) {
        return "<tr><td>" + dfmt(p.posting_date) + '</td><td><span class="sp-name">' + esc(p.party_name || p.party) + '</span><span class="sp-sub mono">' + esc(p.party) + "</span></td>"
          + "<td>" + (String(p.paid_to || "").indexOf("Advance") >= 0 ? "Cash advance" : "Bills") + "</td>"
          + '<td class="mono">' + esc(p.reference_no) + "</td>"
          + '<td><a class="mono" href="' + docUrl(p.name) + '" target="_blank">' + esc(p.name) + "</a></td>"
          + '<td class="r sp-amt">' + money(p.paid_amount) + "</td></tr>";
      }).join("") : '<tr><td colspan="6" class="sp-empty">No payments recorded in the last 30 days.</td></tr>';
    }

    function bankFile() {
      var sel = rows.filter(function (r) { return picked[r.employee]; });
      var q = function (v) { return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"'; };
      var lines = [["Name", "Employee", "Account number", "IFSC", "Bank", "Amount", "Narration"]];
      sel.forEach(function (r) { lines.push([r.employee_name, r.employee, r.bank_ac_no, r.ifsc, r.bank_name, r.total.toFixed(2), "Elbrit settlement " + today]); });
      var blob = new Blob([lines.map(function (l) { return l.map(q).join(","); }).join("\r\n")], { type: "text/csv" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "settlement-bank-file-" + today + ".csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      var missing = sel.filter(function (r) { return !(r.bank_ac_no && r.ifsc); }).map(function (r) { return esc(r.employee_name); });
      if (missing.length) dialog("Bank details missing", "The ERP has no bank account or IFSC for <b>" + missing.join(", ") + "</b>. Their rows in the file are empty — ask HR to fill them in the Employee record, or pay them separately.");
    }

    function pay() {
      var sel = rows.filter(function (r) { return picked[r.employee]; });
      if (!sel.length) return;
      var common = $("[data-utr]").value.trim();
      var date = $("[data-date]").value || today;
      var params = { action: "pay", employees: sel.map(function (r) { return r.employee; }).join(","), bank_account: $("[data-bank]").value, date: date, utr: common };
      var noUtr = [];
      sel.forEach(function (r) {
        var v = (utrs[r.employee] || "").trim();
        if (v) params["utr_" + r.employee] = v;
        else if (!common) noUtr.push(esc(r.employee_name));
      });
      if (noUtr.length) return dialog("UTR needed", "Type the bank reference (UTR) once in <b>UTR for the run</b>, or on the line of: <b>" + noUtr.join(", ") + "</b>.");
      var amt = sel.reduce(function (s, r) { return s + r.total; }, 0);
      dialog("Record this payment?",
        "<p><b>" + money(amt) + "</b> to <b>" + plural(sel.length, "employee") + "</b>, paid from <b>" + esc(params.bank_account.replace(/ - ELPL$/, "")) + "</b> on <b>" + dfmt(date) + "</b>.</p>"
        + "<table>" + sel.map(function (r) { return "<tr><td>" + esc(r.employee_name) + '</td><td class="mono">UTR ' + esc(params["utr_" + r.employee] || common) + '</td><td class="mono" style="text-align:right">' + money(r.total) + "</td></tr>"; }).join("") + "</table>"
        + '<p class="sp-note">Do this only after the money has left the bank. The ERP records the payments and the bills turn Paid in the employee's app.</p>',
        "Record payment", function () {
          $("[data-pay]").disabled = true;
          $("[data-pay]").textContent = "Recording…";
          api("POST", params).then(function (m) {
            picked = {};
            utrs = {};
            var done = m.paid || [];
            dialog("Payment recorded",
              "<table>" + done.map(function (d) {
                return "<tr><td><b>" + esc(d.employee_name) + '</b></td><td class="mono">' + d.entries.map(function (e) { return '<a href="' + docUrl(e) + '" target="_blank">' + esc(e) + "</a>"; }).join(", ")
                  + '</td><td class="mono" style="text-align:right">' + money(d.amount) + "</td></tr>";
              }).join("") + "</table>"
              + (m.missing_utr && m.missing_utr.length ? "<p>Not recorded (no UTR): " + m.missing_utr.map(esc).join(", ") + "</p>" : ""));
            load();
          }).catch(function (e) {
            dialog("Not recorded", esc(e.message) + "<p class='sp-note'>Nothing was recorded in the ERP for anyone in this run -- every employee is still owed as before. Fix the problem and record the run again (the bank transfers you already made stay as they are).</p>");
            load();
          });
        });
    }

    // the bill opens in a popup on this page (an image, or a PDF in a viewer)
    function photo(a) {
      var url = a.getAttribute("data-photo"), claim = a.getAttribute("data-claim");
      var pdf = /\.pdf($|\?)/i.test(url);
      var body = (pdf ? '<iframe class="sp-pdf" src="' + esc(url) + '"></iframe>'
                      : '<div class="sp-photo"><img src="' + esc(url) + '" alt="bill"></div>')
        + '<p class="sp-note"><a href="' + esc(url) + '" target="_blank">Open full size</a> · <a href="/app/settlement-expense/' + encodeURIComponent(claim) + '" target="_blank">Bill ' + esc(claim) + "</a></p>";
      dialog(a.getAttribute("data-ptitle"), body, "Close", null, true);
      var img = $(".sp-photo img");
      if (img) img.onerror = function () { img.parentNode.innerHTML = '<p class="sp-bad">The photo could not be shown here — use "Open full size".</p>'; };
    }

    root.addEventListener("click", function (ev) {
      var t = ev.target;
      var o = t.closest("[data-open]"), ph = t.closest("[data-photo]"), ag = t.closest("[data-age]"), un = t.closest("[data-unpick]");
      if (ph) { ev.preventDefault(); photo(ph); }
      else if (o) { var id = o.getAttribute("data-open"); if (open[id]) delete open[id]; else open[id] = 1; render(); }
      else if (ag) { var i = +ag.getAttribute("data-age"); ageOn = ageOn === i ? null : i; render(); }
      else if (un) { delete picked[un.getAttribute("data-unpick")]; render(); }
      else if (t.closest("[data-age-clear]")) { ageOn = null; render(); }
      else if (t.closest("[data-reload]")) load();
      else if (t.closest("[data-csv]")) bankFile();
      else if (t.closest("[data-pay]")) pay();
      else if (t === $("[data-modal]")) $("[data-modal]").hidden = true;
    });
    root.addEventListener("change", function (ev) {
      var t = ev.target;
      if (t.matches("[data-pick]")) {
        var id = t.getAttribute("data-pick");
        if (t.checked) picked[id] = 1; else delete picked[id];
        render();
      } else if (t.matches("[data-all]")) {
        shown().forEach(function (r) { if (t.checked) picked[r.employee] = 1; else delete picked[r.employee]; });
        render();
      }
    });
    root.addEventListener("input", function (ev) {
      if (ev.target.matches("[data-utr-for]")) utrs[ev.target.getAttribute("data-utr-for")] = ev.target.value;
    });
    document.addEventListener("keydown", function (ev) { if (ev.key === "Escape") $("[data-modal]").hidden = true; });
    $("[data-q]").addEventListener("input", function (ev) { query = ev.target.value.trim().toLowerCase(); render(); });
    load();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
