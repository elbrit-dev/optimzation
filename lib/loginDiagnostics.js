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

/** "a · b · c", dropping anything empty, so absent fields leave no gaps. */
const joinDot = (...values) =>
  values
    .map((v) => String(v ?? "").trim())
    .filter(Boolean)
    .join(" · ");

const MUTED = 'style="color:#6b7280"';

// Longest-lived UAs first: Chrome's string contains "Safari", Edge's contains
// "Chrome", so the order here is what makes each match the right browser.
const BROWSERS = [
  [/EdgA?\/(\d+)/, "Edge"],
  [/OPR\/(\d+)/, "Opera"],
  [/SamsungBrowser\/(\d+)/, "Samsung Internet"],
  [/FxiOS\/(\d+)/, "Firefox"],
  [/Firefox\/(\d+)/, "Firefox"],
  [/CriOS\/(\d+)/, "Chrome"],
  [/Chrome\/(\d+)/, "Chrome"],
  [/Version\/(\d+)[\d.]*\s+(?:Mobile\/\S+\s+)?Safari/, "Safari"],
];

const PLATFORMS = [
  [/Android[ /]([\d.]+)/, "Android"],
  [/(?:iPhone|iPad|iPod)[^)]*OS (\d+)/, "iOS"],
  // Deliberately version-less: "Windows NT 10.0" is both 10 and 11, so the
  // number would say less than nothing.
  [/Windows NT/, "Windows"],
  [/Mac OS X/, "macOS"],
  [/Linux/, "Linux"],
];

/**
 * "Chrome 150 on Android 10, mobile" — the whole of what anyone actually reads
 * off a user-agent, without the 130 characters of boilerplate around it. Falls
 * back to the raw string rather than dropping an unrecognised UA on the floor.
 */
export function summarizeBrowser(ua) {
  const s = String(ua || "").trim();
  if (!s) return "";

  let out = "";
  for (const [re, name] of BROWSERS) {
    const m = re.exec(s);
    if (m) {
      out = m[1] ? `${name} ${m[1]}` : name;
      break;
    }
  }
  for (const [re, name] of PLATFORMS) {
    const m = re.exec(s);
    if (m) {
      const os = m[1] ? `${name} ${m[1]}` : name;
      out = out ? `${out} on ${os}` : os;
      break;
    }
  }
  if (!out) return s;
  return /Mobi|Android/i.test(s) ? `${out}, mobile` : out;
}

// "unhandled-rejection" is three times the width of every other level and would
// wreck the column on its own.
const LEVEL_LABEL = { "unhandled-rejection": "reject" };
const LEVEL_WIDTH = 8;

/** Older app bundles sent a full ISO stamp per line; keep just the clock. */
const shortTime = (at) => {
  const s = String(at || "");
  const iso = /T(\d{2}:\d{2}:\d{2})/.exec(s);
  return iso ? iso[1] : s;
};

/**
 * Fixed time and level columns, so the indentation console groups carry — which
 * is what makes a GraphQL failure readable — survives into the ticket.
 */
function formatLogLines(logs) {
  return logs
    .map((l) => {
      const level = LEVEL_LABEL[l.level] || String(l.level || "log");
      return `${shortTime(l.at)}  ${level.padEnd(LEVEL_WIDTH)}  ${l.text}`;
    })
    .join("\n");
}

/**
 * ERP timestamps are read by people in IST, so show IST. The raw value is an
 * ISO string from the browser; anything unparseable is passed through as-is.
 */
function formatWhen(iso) {
  const raw = String(iso || "").trim();
  if (!raw) return "";

  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;

  try {
    const at = new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Kolkata",
    }).format(d);
    return `${at} IST`;
  } catch {
    return d.toISOString();
  }
}

/**
 * The bug report. Everything here answers "what is broken and where" — the
 * ticket is read by IT, who need the symptom first and the reporter's identity
 * only as one line of context. The full ERP account dump belongs to the login
 * variant, where it IS the diagnosis; here it would bury the one sentence that
 * matters under twenty rows nobody reads.
 */
function renderInAppDescription({ diagnosis, employeeId, note, diagnostics }) {
  const emp = diagnosis.employee;
  const parts = [];

  // Their own words, first and largest — the only part of the ticket that
  // can't be reconstructed from the records afterwards.
  parts.push(
    `<p style="font-size:15px;line-height:1.6"><b>${escapeHtml(
      note || "(no description given)"
    )}</b></p>`
  );

  const reporter = joinDot(
    emp?.employee_name,
    employeeId,
    emp?.designation,
    emp?.fsl_hq || emp?.custom_territory
  );
  parts.push(`<p ${MUTED}>Reported by ${escapeHtml(reporter || employeeId)}</p>`);

  if (diagnostics) {
    const where = joinDot(
      diagnostics.url,
      summarizeBrowser(diagnostics.userAgent),
      diagnostics.viewport,
      formatWhen(diagnostics.at),
      // Only worth a word when it's the abnormal case — and then it may well
      // be the whole explanation.
      diagnostics.online ? "" : "DEVICE WAS OFFLINE"
    );
    if (where) parts.push(`<p ${MUTED}>${escapeHtml(where)}</p>`);

    if (diagnostics.logs.length) {
      parts.push(`<p><b>Console (${diagnostics.logs.length})</b></p>`);
      // <pre> keeps stack fragments, indentation and long URLs readable in the
      // ERP desk, where a <p> would reflow them into soup.
      parts.push(
        `<pre style="white-space:pre-wrap;font-size:12px">${escapeHtml(
          formatLogLines(diagnostics.logs)
        )}</pre>`
      );
    } else {
      parts.push(
        `<p ${MUTED}>Console: nothing logged. The page failed quietly — so this is more likely bad or empty data coming back than a crash.</p>`
      );
    }
  }

  // One line, labels only. An account problem rarely explains a bug, but when
  // it does (no ERP User, so every request comes back empty) it explains all
  // of it — and the fix detail is HR's, not IT's.
  if (diagnosis.blockers.length) {
    const flags = diagnosis.blockers.map((b) => b.label).join(" · ");
    parts.push(`<p ${MUTED}>Account flags: ${escapeHtml(flags)}</p>`);
  }

  parts.push(
    `<p ${MUTED}><i>Raised automatically from the Elbrit One in-app report form.</i></p>`
  );

  return parts;
}

/**
 * The login-help ticket. HR is being asked to fix an account, so here the
 * records ARE the content: every row is something they may have to change.
 */
function renderLoginDescription({
  diagnosis,
  employeeId,
  designation,
  phone,
  note,
  diagnostics,
}) {
  const emp = diagnosis.employee;
  const user = diagnosis.user;
  const row = (label, value) =>
    `<p><b>${escapeHtml(label)}:</b> ${escapeHtml(value || "—")}</p>`;

  const parts = [];

  parts.push("<p><b>Reported from the app login screen — cannot sign in.</b></p>");

  parts.push("<p><b>Who reported it</b></p>");
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

  // Console capture is off by default on the login screen, so this is usually
  // absent — but if a page did attach it, it's still worth carrying.
  if (diagnostics) {
    parts.push("<p><b>Where they were</b></p>");
    parts.push(row("Page", diagnostics.url));
    parts.push(row("Device", joinDot(summarizeBrowser(diagnostics.userAgent), diagnostics.viewport)));
    parts.push(row("Online", diagnostics.online ? "Yes" : "No — device was offline"));
    parts.push(row("Reported at", formatWhen(diagnostics.at)));

    if (diagnostics.logs.length) {
      parts.push("<p><b>Browser console</b></p>");
      parts.push(
        `<pre style="white-space:pre-wrap;font-size:12px">${escapeHtml(
          formatLogLines(diagnostics.logs)
        )}</pre>`
      );
    }
  }

  if (diagnosis.blockers.length) {
    parts.push("<p><b>Likely cause — fix these</b></p><ul>");
    for (const b of diagnosis.blockers) {
      parts.push(`<li><b>${escapeHtml(b.label)}</b><br>${escapeHtml(b.detail)}</li>`);
    }
    parts.push("</ul>");
  } else {
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

  parts.push("<p><i>Raised automatically by the Elbrit One login-help form.</i></p>");

  return parts;
}

/**
 * Renders the Task description HTML. Frappe stores rich text wrapped in
 * `.ql-editor` (see the existing HR tasks), so we match that to render
 * correctly in the desk.
 *
 * The two variants are deliberately different shapes, not one template with
 * fields switched off — they are read by different teams looking for different
 * things. See each renderer.
 */
export function renderTaskDescription({ variant = "login", ...rest }) {
  const parts =
    variant === "in-app" ? renderInAppDescription(rest) : renderLoginDescription(rest);

  return `<div class="ql-editor read-mode">${parts.join("")}</div>`;
}
