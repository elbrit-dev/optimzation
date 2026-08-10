import {
  erpFetch,
  fetchEmployee,
  fetchUser,
  normalizeEmployeeId,
  normalizePhone,
  rateLimit,
  callerIp,
  resolveErpCredentials,
} from "../../../lib/erpServer";
import { diagnose, renderTaskDescription } from "../../../lib/loginDiagnostics";

// Per-variant defaults, all confirmed against ERP: "LoginIssue" exists as
// BUG-0002 and hr@elbrit.org ("Elbrit HR") is an enabled User; "BUGS - IT" is
// PROJ-0011, where the Elbrit One app tasks already live. Overridable per-page
// from Plasmic, then by env, so neither needs a Netlify change to work.
//
// The two variants go to different teams on purpose: a login failure is an HR
// account problem, a blank home page is an IT bug.
const VARIANT_DEFAULTS = {
  login: {
    project: "LoginIssue",
    assignee: "hr@elbrit.org",
    subject: (id, name) => `Cannot log in: ${id}${name ? ` — ${name}` : ""}`,
    // Repeat taps mean the same stuck login, so reuse the open ticket.
    dedupe: true,
  },
  "in-app": {
    project: "BUGS - IT",
    // NOTE: vishnuk.mis@elbrit.org, with the k — "vishnu.mis@elbrit.org" does
    // not exist as an ERP User. A wrong address here fails quietly (assignment
    // errors are swallowed so they can't lose the ticket), leaving reports
    // filed but unassigned and unnoticed.
    assignee: "vishnuk.mis@elbrit.org",
    // The person's own words lead the subject so support can triage the ERP
    // list view without opening each ticket; the reporter trails it in one
    // bracketed piece, so the line doesn't read as three separate headings.
    subject: (id, name, note) => {
      const gist = String(note || "").replace(/\s+/g, " ").trim().slice(0, 70);
      const who = name ? `${name} (${id})` : id;
      return `${gist || "App issue"} — ${who}`;
    },
    // One person can hit several unrelated bugs — collapsing them onto one
    // ticket would silently lose reports.
    dedupe: false,
  },
};

// Tickets may only be assigned inside the company. The assignee arrives from a
// PUBLIC page, so without this anyone could POST an arbitrary address and have
// ERP mail strangers on our behalf.
const ASSIGNEE_DOMAIN = "@elbrit.org";

/**
 * The console capture arrives from the browser, so treat it as hostile input:
 * cap the shape and the size before any of it reaches an ERP document. The
 * client already trims, but nothing stops a crafted POST.
 */
function sanitizeDiagnostics(raw) {
  if (!raw || typeof raw !== "object") return null;

  const str = (v, max) => String(v ?? "").slice(0, max);
  const logs = Array.isArray(raw.logs) ? raw.logs.slice(-60) : [];

  return {
    url: str(raw.url, 400),
    userAgent: str(raw.userAgent, 300),
    viewport: str(raw.viewport, 40),
    online: raw.online !== false,
    at: str(raw.at, 40),
    logs: logs.map((entry) => ({
      level: str(entry?.level, 24),
      at: str(entry?.at, 40),
      text: str(entry?.text, 400),
    })),
  };
}

function pick(...values) {
  for (const value of values) {
    const trimmed = String(value ?? "").trim();
    if (trimmed) return trimmed;
  }
  return "";
}

/**
 * Accepts a project ID ("BUG-0002") or a human project_name ("LoginIssue") so
 * the prop can hold whichever HR quotes. Returns null if it can't be resolved
 * — the Task is still created, just unfiled, because losing the ticket is
 * worse than misfiling it.
 */
async function resolveProject(setting, creds) {
  if (!setting) return null;

  try {
    if (/^(PROJ|BUG)-/i.test(setting)) return setting;

    const json = await erpFetch("/api/resource/Project", {
      creds,
      query: {
        filters: [["project_name", "=", setting]],
        fields: ["name"],
        limit_page_length: 1,
      },
    });
    return json?.data?.[0]?.name ?? null;
  } catch (err) {
    console.error("[hr/login-help] project resolve failed", err);
    return null;
  }
}

/**
 * A field employee who can't log in will tap Submit more than once. Reuse any
 * still-open ticket for the same employee rather than handing HR five copies.
 */
async function findOpenTicket(project, employeeId, creds) {
  try {
    const filters = [
      ["status", "in", ["Open", "Working", "Pending Review"]],
      ["subject", "like", `%${employeeId}%`],
    ];
    if (project) filters.push(["project", "=", project]);

    const json = await erpFetch("/api/resource/Task", {
      creds,
      query: { filters, fields: ["name"], limit_page_length: 1, order_by: "creation desc" },
    });
    return json?.data?.[0]?.name ?? null;
  } catch (err) {
    console.error("[hr/login-help] duplicate check failed", err);
    return null; // fall through to creating one — a dupe beats a dropped ticket
  }
}

/** Assignment is what puts the task in HR's queue; a Task nobody owns is invisible. */
async function assignToHr(taskName, subject, assignee, creds) {
  if (!assignee) return false;
  try {
    await erpFetch("/api/method/frappe.desk.form.assign_to.add", {
      method: "POST",
      creds,
      body: {
        doctype: "Task",
        name: taskName,
        assign_to: [assignee],
        description: subject,
      },
    });
    return true;
  } catch (err) {
    console.error("[hr/login-help] assignment failed", err);
    return false;
  }
}

/**
 * Raises an HR task for someone stuck on the login screen.
 *
 * PUBLIC endpoint (pre-login by definition) — see lib/erpServer.js for why it
 * uses a service account, and for the rate-limit caveat.
 *
 * POST { employeeId, designation, phone, note?,
 *        project?, assignee?, erpTarget?, erpUrl?, authToken? }
 *   The trailing five are the Plasmic props, so the page can be retuned from
 *   Studio without a Netlify change. Each falls back to env, then to the
 *   baked-in default. See lib/erpServer.js for how erpUrl is constrained.
 *  -> { success, ticket, duplicate, assigned }
 */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const limit = rateLimit(`submit:${callerIp(req)}`, { max: 5, windowMs: 10 * 60_000 });
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfter));
    return res
      .status(429)
      .json({ error: "You've already sent this a few times. HR has it — please wait." });
  }

  const variant = req.body?.variant === "in-app" ? "in-app" : "login";
  const defaults = VARIANT_DEFAULTS[variant];

  const employeeId = normalizeEmployeeId(req.body?.employeeId);
  const designation = String(req.body?.designation ?? "").trim().slice(0, 140);
  const phoneRaw = String(req.body?.phone ?? "").trim();
  const phone = normalizePhone(phoneRaw);
  const note = String(req.body?.note ?? "").trim().slice(0, 1000);
  const diagnostics = sanitizeDiagnostics(req.body?.diagnostics);

  if (!employeeId) return res.status(400).json({ error: "Employee ID is required" });

  if (variant === "in-app") {
    // The only thing in-app asks for. Identity rides along from the page's
    // employee prop, and designation/phone are read off ERP below anyway.
    if (!note) {
      return res.status(400).json({ error: "Tell us what looks wrong" });
    }
  } else {
    if (!designation) return res.status(400).json({ error: "Designation is required" });
    if (phone.length < 10) {
      return res.status(400).json({ error: "Enter a valid 10-digit mobile number" });
    }
  }

  // Prop → env → this variant's default, for each knob. Note the env vars are
  // GLOBAL: setting one overrides both variants. Use the props to differentiate.
  const projectSetting = pick(
    req.body?.project,
    process.env.ERP_LOGIN_HELP_PROJECT,
    defaults.project
  );
  const assignee = pick(
    req.body?.assignee,
    process.env.ERP_LOGIN_HELP_ASSIGNEE,
    defaults.assignee
  ).toLowerCase();

  if (!assignee.endsWith(ASSIGNEE_DOMAIN)) {
    return res.status(400).json({ error: "Assignee must be an elbrit.org address" });
  }

  try {
    // Resolve credentials ONCE so every call in this request hits the same ERP.
    const creds = resolveErpCredentials({
      url: req.body?.erpUrl,
      token: req.body?.authToken,
      target: req.body?.erpTarget,
    });

    // The records are the source of truth — the posted designation is only
    // shown to HR as what the person believed, never used for the diagnosis.
    const employee = await fetchEmployee(employeeId, creds);
    const user = await fetchUser(employee?.user_id, creds);
    const diagnosis = diagnose(employee, user);

    const project = await resolveProject(projectSetting, creds);

    if (defaults.dedupe) {
      const existing = await findOpenTicket(project, employeeId, creds);
      if (existing) {
        return res.status(200).json({
          success: true,
          ticket: existing,
          duplicate: true,
          assigned: true,
        });
      }
    }

    const employeeName = String(employee?.employee_name || "").trim();
    const subject = defaults.subject(employeeId, employeeName, note).slice(0, 140);

    const created = await erpFetch("/api/resource/Task", {
      method: "POST",
      creds,
      body: {
        subject,
        project: project || undefined,
        status: "Open",
        // For a bug report the ERP account diagnosis says nothing about how bad
        // the bug is, so don't let it drive priority.
        priority:
          variant === "in-app"
            ? "Medium"
            : diagnosis.severity === "high"
            ? "High"
            : "Medium",
        description: renderTaskDescription({
          variant,
          diagnosis,
          employeeId,
          designation,
          phone: phoneRaw,
          note,
          diagnostics,
        }),
      },
    });

    const taskName = created?.data?.name;
    if (!taskName) throw new Error("ERP did not return a Task name");

    const assigned = await assignToHr(taskName, subject, assignee, creds);

    if (!project) {
      console.warn(
        `[hr/login-help] project "${projectSetting}" did not resolve — task created unfiled`
      );
    }

    return res.status(200).json({
      success: true,
      ticket: taskName,
      duplicate: false,
      assigned,
    });
  } catch (err) {
    // A misconfigured deployment and an ERP rejection both surface as "it
    // 500'd", but the fixes are in different places — so name which it was.
    const isConfig = err?.name === "ErpConfigError";

    console.error(
      `[hr/login-help] ${isConfig ? "CONFIG" : "ERP"} failure:`,
      err?.message,
      err?.status ? `(HTTP ${err.status})` : "",
      err?.stack
    );

    return res.status(500).json({
      error:
        "We couldn't reach HR just now. Please try again in a few minutes, or call your manager.",
      // Safe to expose: says WHERE the fault is, never what the values are.
      code: isConfig ? "config" : "erp",
      // Opt-in only. Set LOGIN_HELP_DEBUG=1 on Netlify to see the real reason
      // in the response while wiring this up, then remove it — the endpoint is
      // public, and ERP's messages name doctypes and permissions.
      ...(process.env.LOGIN_HELP_DEBUG === "1"
        ? { debug: err?.message, status: err?.status ?? null }
        : {}),
    });
  }
}
