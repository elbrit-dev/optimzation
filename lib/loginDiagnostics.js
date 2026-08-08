/**
 * Works out WHY an employee can't sign in, from their ERP records.
 *
 * The app signs people in with Firebase (Google or phone, defaultCountry IN —
 * components/FirebaseUIComponent.jsx) and then maps that identity onto an ERP
 * User. So a login fails when the ERP side of that mapping is missing or
 * disabled — and that is visible on the Employee doc and the User it links to,
 * neither of which the person staring at the login screen can see.
 *
 * The phone is deliberately NOT verified. `User.mobile_no` is empty on all but
 * a couple of Users in this instance, so checking against it would report a
 * mismatch for nearly everyone; the number is simply recorded for HR to act on.
 *
 * Server-only: `detail` strings quote what's on the records and must not be
 * sent back to the browser.
 */

/**
 * @param {object|null} employee  raw ERP Employee doc, or null if not found
 * @param {object|null} user      raw ERP User doc linked via Employee.user_id
 */
export function diagnose(employee, user) {
  const blockers = [];
  const notes = [];

  if (!employee) {
    return {
      found: false,
      severity: "high",
      blockers: [
        {
          code: "employee_not_found",
          label: "No Employee record for this ID",
          detail:
            "Nothing in ERP matches the Employee ID entered. Either it was typed wrong, or the employee was never created / has been deleted.",
        },
      ],
      notes,
      employee: null,
      user: null,
    };
  }

  if (employee.status !== "Active") {
    blockers.push({
      code: "employee_inactive",
      label: `Employee status is "${employee.status}"`,
      detail:
        "Only Active employees can sign in. If this person is back on the rolls, set the status to Active.",
    });
  }

  const userId = String(employee.user_id || "").trim();

  if (!userId) {
    // The single most common cause. `user_id` is the link from Employee to the
    // ERP User account; with it empty there is no account to sign in AS, no
    // matter how cleanly Firebase authenticates them.
    blockers.push({
      code: "no_user_id",
      label: "No ERP User linked (user_id is empty)",
      detail:
        "Create/enable an ERP User for this employee and set it on Employee → user_id. Until then the app has no ERP account to map the login onto.",
    });
  } else if (!user) {
    blockers.push({
      code: "user_missing",
      label: `Employee points at "${userId}", but no such ERP User exists`,
      detail:
        "The user_id link is stale — the User was renamed or deleted. Point it at the live account, or create one.",
    });
  } else if (!user.enabled) {
    blockers.push({
      code: "user_disabled",
      label: `ERP User "${userId}" is disabled`,
      detail:
        "The account exists but is switched off, so every sign-in is rejected. Re-enable it in ERP → User.",
    });
  }

  return {
    found: true,
    severity: blockers.length ? "high" : "medium",
    blockers,
    notes,
    employee,
    user,
  };
}

const escapeHtml = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * Renders the diagnosis as the Task description HTML. Frappe stores rich text
 * wrapped in `.ql-editor` (see the existing HR tasks), so we match that to
 * render correctly in the desk.
 */
export function renderTaskDescription({
  variant = "login",
  diagnosis,
  employeeId,
  designation,
  phone,
  note,
  diagnostics,
}) {
  const isInApp = variant === "in-app";
  const emp = diagnosis.employee;
  const user = diagnosis.user;
  const row = (label, value) =>
    `<p><b>${escapeHtml(label)}:</b> ${escapeHtml(value || "—")}</p>`;

  const parts = [];

  parts.push(
    isInApp
      ? "<p><b>Reported from inside the app — something looks wrong on screen.</b></p>"
      : "<p><b>Reported from the app login screen — cannot sign in.</b></p>"
  );

  // For a bug report the person's own description is the most valuable line in
  // the ticket, so it leads rather than trailing the identity fields.
  if (isInApp && note) {
    parts.push("<p><b>What they reported</b></p>");
    parts.push(`<p>${escapeHtml(note)}</p>`);
  }

  parts.push(`<p><b>Who reported it</b></p>`);
  parts.push(row("Employee ID", employeeId));
  // In-app never asks for these, so only show what we actually have — the ERP
  // record below carries the authoritative versions either way.
  if (!isInApp || designation) parts.push(row("Designation", designation));
  if (!isInApp || phone) parts.push(row("Phone", phone));
  if (!isInApp && note) parts.push(row("Their note", note));

  if (emp) {
    parts.push("<p><b>What ERP has on record</b></p>");
    parts.push(row("Name", emp.employee_name));
    parts.push(row("Designation", emp.designation));
    parts.push(row("Department", emp.department));
    parts.push(row("Company", emp.company));
    parts.push(row("HQ / Territory", emp.fsl_hq || emp.custom_territory));
    parts.push(row("Status", emp.status));
    parts.push(row("user_id", emp.user_id || "(empty)"));
    parts.push(row("Reports to", emp.reports_to));
  }

  if (user) {
    parts.push("<p><b>The ERP User it points at</b></p>");
    parts.push(row("User", user.name));
    parts.push(row("Full name", user.full_name));
    parts.push(row("Enabled", user.enabled ? "Yes" : "No"));
    parts.push(row("User type", user.user_type));
    parts.push(row("mobile_no", user.mobile_no || "(empty)"));
  }

  if (diagnostics) {
    parts.push("<p><b>Where they were</b></p>");
    parts.push(row("Page", diagnostics.url));
    parts.push(row("Screen", diagnostics.viewport));
    parts.push(row("Online", diagnostics.online ? "Yes" : "No — device was offline"));
    parts.push(row("Reported at", diagnostics.at));
    parts.push(row("Browser", diagnostics.userAgent));

    parts.push("<p><b>Browser console</b></p>");
    if (diagnostics.logs.length) {
      // <pre> keeps stack fragments and long URLs readable in the ERP desk,
      // where a <p> would reflow them into soup.
      const lines = diagnostics.logs
        .map((l) => `[${l.level}] ${l.at}  ${l.text}`)
        .join("\n");
      parts.push(
        `<pre style="white-space:pre-wrap;font-size:12px">${escapeHtml(lines)}</pre>`
      );
    } else {
      parts.push(
        "<p>Nothing was logged. The page failed quietly — so this is more likely bad or empty data coming back than a crash.</p>"
      );
    }
  }

  if (diagnosis.blockers.length) {
    parts.push(
      isInApp
        ? "<p><b>Their ERP account — for context, not necessarily the cause</b></p>"
        : "<p><b>Likely cause — fix these</b></p>"
    );
    parts.push("<ul>");
    for (const b of diagnosis.blockers) {
      parts.push(
        `<li><b>${escapeHtml(b.label)}</b><br>${escapeHtml(b.detail)}</li>`
      );
    }
    parts.push("</ul>");
  } else if (!isInApp) {
    parts.push(
      "<p><b>No ERP-side blocker detected.</b> The Employee record is Active and its ERP User is linked and enabled, so the failure is likely on the Firebase/auth side — check that an auth user exists for the number above and that the employee is entering the right country code.</p>"
    );
  }

  if (diagnosis.notes.length) {
    parts.push("<p><b>Notes</b></p><ul>");
    for (const n of diagnosis.notes) {
      parts.push(`<li>${escapeHtml(n.label)} — ${escapeHtml(n.detail)}</li>`);
    }
    parts.push("</ul>");
  }

  parts.push(
    isInApp
      ? "<p><i>Raised automatically from the Elbrit One in-app report form.</i></p>"
      : "<p><i>Raised automatically by the Elbrit One login-help form.</i></p>"
  );

  return `<div class="ql-editor read-mode">${parts.join("")}</div>`;
}
