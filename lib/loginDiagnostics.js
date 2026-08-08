/**
 * Works out WHY an employee can't sign in, from their ERP Employee record.
 *
 * The app signs people in with Firebase (Google or phone, defaultCountry IN —
 * components/FirebaseUIComponent.jsx) and then maps that identity onto an ERP
 * user. So a login fails when the ERP side of that mapping is missing or stale,
 * and in practice that is one of four things — all of them visible on the
 * Employee doc, none of them visible to the person staring at the login screen.
 *
 * Server-only: the returned `detail` strings quote the phone/email ON RECORD
 * and must never be sent back to the browser. Only `blockers[].code` and the
 * summary are safe to expose, and today we don't expose even those.
 */

import { normalizePhone } from "./erpServer";

/**
 * @param {object|null} employee  raw ERP Employee doc, or null if not found
 * @param {string} submittedPhone the phone the person typed into the form
 */
export function diagnose(employee, submittedPhone) {
  const blockers = [];
  const notes = [];

  if (!employee) {
    return {
      found: false,
      verified: false,
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
    };
  }

  const onRecord = normalizePhone(employee.cell_number);
  const entered = normalizePhone(submittedPhone);
  const phoneMatches = Boolean(onRecord && entered && onRecord === entered);

  if (employee.status !== "Active") {
    blockers.push({
      code: "employee_inactive",
      label: `Employee status is "${employee.status}"`,
      detail:
        "Only Active employees can sign in. If this person is back on the rolls, set the status to Active.",
    });
  }

  // The single most common cause. `user_id` is the link from Employee to the
  // ERP User account; with it empty there is no ERP account to sign in AS, no
  // matter how cleanly Firebase authenticates them.
  if (!String(employee.user_id || "").trim()) {
    blockers.push({
      code: "no_user_id",
      label: "No ERP User linked (user_id is empty)",
      detail:
        "Create/enable an ERP User for this employee and set it on Employee → user_id. Until then the app has no ERP account to map the login onto.",
    });
  }

  if (!onRecord) {
    blockers.push({
      code: "no_cell_number",
      label: "No phone number on the Employee record",
      detail:
        "cell_number is empty, so phone sign-in can never match. Add the mobile number the employee actually uses.",
    });
  } else if (!phoneMatches) {
    blockers.push({
      code: "phone_mismatch",
      label: "Phone entered does not match the Employee record",
      detail: `Form: ${entered || "(blank)"} · Employee.cell_number: ${onRecord}. Phone sign-in matches on this field — update whichever one is wrong.`,
    });
  }

  // Informational only: empty company_email is normal for field staff at
  // Elbrit, so it is never on its own a reason the login failed.
  if (!String(employee.company_email || "").trim()) {
    notes.push({
      code: "no_company_email",
      label: "company_email is empty",
      detail:
        "Expected for field roles. Only matters if this person is meant to sign in with Google rather than phone.",
    });
  }

  return {
    found: true,
    // "verified" gates auto-fill in the UI: we only echo a name/designation
    // back to an unauthenticated caller once ID and phone agree, so the form
    // can't be used to enumerate staff by walking sequential employee IDs.
    verified: phoneMatches,
    severity: blockers.length ? "high" : "medium",
    blockers,
    notes,
    employee,
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
 * wrapped in `.ql-editor` (see the existing BUGS - HR tasks), so we match that
 * to render correctly in the desk.
 */
export function renderTaskDescription({
  diagnosis,
  employeeId,
  designation,
  phone,
  note,
}) {
  const emp = diagnosis.employee;
  const row = (label, value) =>
    `<p><b>${escapeHtml(label)}:</b> ${escapeHtml(value || "—")}</p>`;

  const parts = [];

  parts.push("<p><b>Reported from the app login screen — cannot sign in.</b></p>");

  parts.push("<p><b>What the employee entered</b></p>");
  parts.push(row("Employee ID", employeeId));
  parts.push(row("Designation", designation));
  parts.push(row("Phone", phone));
  if (note) parts.push(row("Their note", note));

  if (emp) {
    parts.push("<p><b>What ERP has on record</b></p>");
    parts.push(row("Name", emp.employee_name));
    parts.push(row("Designation", emp.designation));
    parts.push(row("Department", emp.department));
    parts.push(row("Company", emp.company));
    parts.push(row("HQ / Territory", emp.fsl_hq || emp.custom_territory));
    parts.push(row("Status", emp.status));
    parts.push(row("cell_number", emp.cell_number));
    parts.push(row("user_id", emp.user_id || "(empty)"));
    parts.push(row("company_email", emp.company_email || "(empty)"));
    parts.push(row("Reports to", emp.reports_to));
  }

  if (diagnosis.blockers.length) {
    parts.push("<p><b>Likely cause — fix these</b></p>");
    parts.push("<ul>");
    for (const b of diagnosis.blockers) {
      parts.push(
        `<li><b>${escapeHtml(b.label)}</b><br>${escapeHtml(b.detail)}</li>`
      );
    }
    parts.push("</ul>");
  } else {
    parts.push(
      "<p><b>No ERP-side blocker detected.</b> The Employee record looks complete and the phone matches, so the failure is likely on the Firebase/auth side — check that an auth user exists for this number and that the employee is entering the right country code.</p>"
    );
  }

  if (diagnosis.notes.length) {
    parts.push("<p><b>Notes</b></p><ul>");
    for (const n of diagnosis.notes) {
      parts.push(
        `<li>${escapeHtml(n.label)} — ${escapeHtml(n.detail)}</li>`
      );
    }
    parts.push("</ul>");
  }

  parts.push(
    "<p><i>Raised automatically by the Elbrit One login-help form.</i></p>"
  );

  return `<div class="ql-editor read-mode">${parts.join("")}</div>`;
}
