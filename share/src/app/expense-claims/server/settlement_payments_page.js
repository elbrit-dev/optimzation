// Web Page "settlement-payments" (/settlement-payments) -- SCRIPT (18 Nov 2026).
// Accounts' dashboard for paying settlement bills, listed on the Dashboards
// workspace next to Field Expenses. Everything for this one process in one
// place: what is owed (bills the CEO approved, already booked on 2120, and
// cash advances), the bank file, recording the payment (the ERP makes the
// Payment Entries), and what was paid. Data + actions: Server Script
// "Settlement Accounts API" (/api/method/settlement_accounts).
(function () {
  function start() {
    var root = document.getElementById("sp");
    if (!root) return;
    var $ = function (s) { return root.querySelector(s); };
    var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
    var inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
    var money = function (v) { return inr.format(v || 0); };
    var dmy = function (d) { return d ? String(d).slice(0, 10).split("-").reverse().join("-") : ""; };
    var plural = function (n, w) { return n + " " + w + (n === 1 ? "" : "s"); };
    var today = new Date().toISOString().slice(0, 10);
    var rows = [], picked = {}, open = {}, utrs = {}, query = "";

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
        kpis(m);
        renderRows();
        renderPaid(m.paid || []);
      }).catch(function (e) {
        if (e.denied) {
          $("[data-sub]").textContent = "";
          root.innerHTML = '<div class="sp-card sp-empty"><h2>This page is for the Accounts team</h2><p class="sp-muted">Log in with your Accounts login to pay settlements.</p>'
            + '<p><a class="sp-btn sp-primary" href="/login?redirect-to=/settlement-payments">Log in</a></p></div>';
        } else $("[data-sub]").textContent = "Could not load: " + e.message + " — press Refresh.";
      });
    }

    function kpis(m) {
      var total = 0, bills = 0, billsAmt = 0, adv = 0, advAmt = 0, oldest = "";
      rows.forEach(function (r) {
        total += r.total;
        r.claims.forEach(function (c) { bills++; billsAmt += c.amount; if (!oldest || c.date < oldest) oldest = c.date; });
        r.advances.forEach(function (a) { adv++; advAmt += a.amount; if (!oldest || a.date < oldest) oldest = a.date; });
      });
      var days = oldest ? Math.round((new Date(today) - new Date(oldest)) / 864e5) : 0;
      $('[data-k="total"]').textContent = money(total);
      $('[data-k="total_sub"]').textContent = rows.length ? plural(rows.length, "employee") + (oldest ? " · oldest waiting " + plural(days, "day") : "") : "nothing to pay";
      $('[data-k="bills"]').textContent = String(bills);
      $('[data-k="bills_sub"]').textContent = money(billsAmt);
      $('[data-k="adv"]').textContent = String(adv);
      $('[data-k="adv_sub"]').textContent = money(advAmt);
      $('[data-k="paid"]').textContent = money(m.paid_month);
      $('[data-k="paid_sub"]').textContent = plural(m.paid_month_count || 0, "payment entry").replace("entrys", "entries");
      $("[data-sub]").textContent = rows.length
        ? "Bills approved by the CEO and already booked in the ERP, waiting to be paid. " + (m.user ? "Logged in as " + m.user + "." : "")
        : "Nothing to pay — every approved bill is paid.";
    }

    function shown() {
      if (!query) return rows;
      return rows.filter(function (r) { return (r.employee_name + " " + r.employee + " " + r.hq).toLowerCase().indexOf(query) >= 0; });
    }

    function since(r) {
      var d = "";
      r.claims.concat(r.advances).forEach(function (x) { if (!d || x.date < d) d = x.date; });
      return d;
    }

    function renderRows() {
      var list = shown();
      var body = $("[data-rows]");
      if (!list.length) {
        body.innerHTML = '<tr><td colspan="9" class="sp-empty">' + (rows.length ? "No one matches the search." : "Nothing to pay. New bills appear here as soon as the CEO approves them.") + "</td></tr>";
      } else {
        body.innerHTML = list.map(function (r) {
          var on = !!picked[r.employee], bankOk = r.bank_ac_no && r.ifsc;
          var bAmt = r.claims.reduce(function (s, c) { return s + c.amount; }, 0);
          var aAmt = r.advances.reduce(function (s, a) { return s + a.amount; }, 0);
          var d = since(r), days = d ? Math.round((new Date(today) - new Date(d)) / 864e5) : 0;
          var main = '<tr class="sp-row' + (on ? " on" : "") + '">'
            + '<td class="c"><input type="checkbox" data-pick="' + esc(r.employee) + '"' + (on ? " checked" : "") + "></td>"
            + '<td><button class="sp-name" data-open="' + esc(r.employee) + '">' + (open[r.employee] ? "▾ " : "▸ ") + esc(r.employee_name) + '</button><span class="sp-sub">' + esc(r.employee) + "</span></td>"
            + "<td>" + esc(r.hq || "–") + "</td>"
            + '<td class="r">' + (r.claims.length ? plural(r.claims.length, "bill") + '<span class="sp-sub">' + money(bAmt) + "</span>" : "–") + "</td>"
            + '<td class="r">' + (r.advances.length ? money(aAmt) : "–") + "</td>"
            + '<td class="r sp-amt">' + money(r.total) + "</td>"
            + "<td" + (days > 7 ? ' class="sp-old"' : "") + ">" + dmy(d) + '<span class="sp-sub">' + plural(days, "day") + "</span></td>"
            + "<td>" + (bankOk ? esc(r.bank_name || "Bank") + '<span class="sp-sub">' + esc(r.bank_ac_no) + " · " + esc(r.ifsc) + "</span>" : '<span class="sp-bad">Missing — ask HR</span>') + "</td>"
            + '<td><input data-utr-for="' + esc(r.employee) + '" value="' + esc(utrs[r.employee] || "") + '" placeholder="UTR"></td></tr>';
          if (!open[r.employee]) return main;
          var lines = r.claims.map(function (c) {
            return '<div class="sp-line"><span><b>' + esc(c.title) + '</b> <span class="sp-sub" style="display:inline">· bill date ' + dmy(c.bill_date || c.date) + " · " + esc((c.account || "").replace(/ - ELPL$/, "")) + "</span></span>"
              + '<span><a href="/app/expense-claim/' + encodeURIComponent(c.name) + '" target="_blank">' + esc(c.name) + "</a>"
              + (c.bill ? ' · <a href="' + esc(c.bill) + '" data-photo="' + esc(c.bill) + '" data-ptitle="' + esc(r.employee_name + " · " + c.title + " · " + money(c.amount)) + '" data-claim="' + esc(c.name) + '">bill photo</a>' : "") + " · <b>" + money(c.amount) + "</b></span></div>";
          }).concat(r.advances.map(function (a) {
            return '<div class="sp-line"><span><b>Cash advance</b> · ' + esc(a.purpose) + ' <span class="sp-sub" style="display:inline">· ' + dmy(a.date) + "</span></span>"
              + '<span><a href="/app/employee-advance/' + encodeURIComponent(a.name) + '" target="_blank">' + esc(a.name) + "</a> · <b>" + money(a.amount) + "</b></span></div>";
          })).join("");
          return main + '<tr class="sp-detail"><td colspan="9">' + lines + "</td></tr>";
        }).join("");
      }
      var sel = rows.filter(function (r) { return picked[r.employee]; });
      var amt = sel.reduce(function (s, r) { return s + r.total; }, 0);
      $("[data-selinfo]").textContent = sel.length ? plural(sel.length, "employee") + " ticked · " + money(amt) : "Tick the employees to pay";
      $("[data-pay]").textContent = sel.length ? "Record payment · " + money(amt) : "Record payment";
      $("[data-pay]").disabled = !sel.length;
      $("[data-csv]").disabled = !sel.length;
      $("[data-all]").checked = list.length > 0 && list.every(function (r) { return picked[r.employee]; });
    }

    function renderPaid(paid) {
      $("[data-paid]").innerHTML = paid.length ? paid.map(function (p) {
        return "<tr><td>" + dmy(p.posting_date) + "</td><td>" + esc(p.party_name || p.party) + '<span class="sp-sub">' + esc(p.party) + "</span></td>"
          + "<td>" + (String(p.paid_to || "").indexOf("Advance") >= 0 ? "Cash advance" : "Bills") + "</td>"
          + '<td class="r sp-amt">' + money(p.paid_amount) + "</td><td>" + esc(p.reference_no) + "</td>"
          + '<td><a href="/app/payment-entry/' + encodeURIComponent(p.name) + '" target="_blank">' + esc(p.name) + "</a></td></tr>";
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
      if (missing.length) dialog("Bank details missing", "The ERP has no bank account / IFSC for <b>" + missing.join(", ") + "</b>. Their rows in the file are empty — ask HR to fill them in the Employee record, or pay them separately.");
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
      if (noUtr.length) return dialog("UTR needed", "Type the UTR (bank reference) — once in <b>UTR for all</b>, or on the line of: <b>" + noUtr.join(", ") + "</b>.");
      var amt = sel.reduce(function (s, r) { return s + r.total; }, 0);
      dialog("Record this payment?",
        "<p><b>" + money(amt) + "</b> to <b>" + plural(sel.length, "employee") + "</b>, paid from <b>" + esc(params.bank_account.replace(/ - ELPL$/, "")) + "</b> on <b>" + dmy(date) + "</b>.</p>"
        + "<ul>" + sel.map(function (r) { return "<li>" + esc(r.employee_name) + " — " + money(r.total) + " · UTR " + esc(params["utr_" + r.employee] || common) + "</li>"; }).join("") + "</ul>"
        + '<p class="sp-muted">Do this only after the money has left the bank. The ERP makes the Payment Entries, the bills turn Paid and each employee is told.</p>',
        "Record payment", function () {
          $("[data-pay]").disabled = true;
          $("[data-pay]").textContent = "Recording…";
          api("POST", params).then(function (m) {
            picked = {};
            utrs = {};
            var done = m.paid || [];
            dialog("Payments recorded",
              "<ul>" + done.map(function (d) {
                return "<li><b>" + esc(d.employee_name) + "</b>: " + money(d.amount) + " · UTR " + esc(d.utr) + " · "
                  + d.entries.map(function (e) { return '<a href="/app/payment-entry/' + encodeURIComponent(e) + '" target="_blank">' + esc(e) + "</a>"; }).join(", ") + "</li>";
              }).join("") + "</ul>"
              + (m.missing_utr && m.missing_utr.length ? "<p>Not recorded (no UTR): " + m.missing_utr.map(esc).join(", ") + "</p>" : ""));
            load();
          }).catch(function (e) {
            dialog("Not recorded", esc(e.message) + "<p class='sp-muted'>Nothing was saved for the employee this stopped at. Check and try again.</p>");
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
        + '<p class="sp-muted"><a href="' + esc(url) + '" target="_blank">Open full size</a> · <a href="/app/expense-claim/' + encodeURIComponent(claim) + '" target="_blank">Claim ' + esc(claim) + "</a></p>";
      dialog(a.getAttribute("data-ptitle"), body, "Close", null, true);
      var img = $(".sp-photo img");
      if (img) img.onerror = function () { img.parentNode.innerHTML = '<p class="sp-bad">The photo could not be shown here — use "Open full size".</p>'; };
    }

    root.addEventListener("click", function (ev) {
      var t = ev.target;
      var o = t.closest("[data-open]");
      var ph = t.closest("[data-photo]");
      if (ph) { ev.preventDefault(); photo(ph); }
      else if (o) { var id = o.getAttribute("data-open"); if (open[id]) delete open[id]; else open[id] = 1; renderRows(); }
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
        renderRows();
      } else if (t.matches("[data-all]")) {
        shown().forEach(function (r) { if (t.checked) picked[r.employee] = 1; else delete picked[r.employee]; });
        renderRows();
      }
    });
    root.addEventListener("input", function (ev) {
      if (ev.target.matches("[data-utr-for]")) utrs[ev.target.getAttribute("data-utr-for")] = ev.target.value;
    });
    $("[data-q]").addEventListener("input", function (ev) { query = ev.target.value.trim().toLowerCase(); renderRows(); });
    load();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
