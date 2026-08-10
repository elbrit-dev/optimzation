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
import { findOpenTicket, publicTicket } from "../../../lib/erpTickets";
import {
  variantDefaults,
  resolveProject,
  summarizeProblem,
  pick,
} from "../../../lib/loginHelpConfig";

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
  // Matches LOG_LIMIT in lib/consoleCapture.js. One GraphQL failure is a whole
  // console group — six or seven lines — so 60 held only a handful of them.
  const logs = Array.isArray(raw.logs) ? raw.logs.slice(-120) : [];

  return {
    url: str(raw.url, 400),
    userAgent: str(raw.userAgent, 300),
    viewport: str(raw.viewport, 40),
    online: raw.online !== false,
    at: str(raw.at, 40),
    logs: logs.map((entry) => ({
      level: str(entry?.level, 24),
      at: str(entry?.at, 40),
      // Slightly above the client's 400 so a trailing "(×12)" repeat marker
      // isn't the thing that gets cut.
      text: str(entry?.text, 440),
    })),
  };
}

/** Assignment is what puts the task in someone's queue; a Task nobody owns is invisible. */
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
  const defaults = variantDefaults(variant);

  const employeeId = normalizeEmployeeId(req.body?.employeeId);
  const designation = String(req.body?.designation ?? "").trim().slice(0, 140);
  const phoneRaw = String(req.body?.phone ?? "").trim();
  const phone = normalizePhone(phoneRaw);
  const note = String(req.body?.note ?? "").trim().slice(0, 1000);
  const diagnostics = sanitizeDiagnostics(req.body?.diagnostics);

  if (!employeeId) return res.status(400).json({ error: "Employee ID is required" });

  // In-app asks for NOTHING beyond the tap: identity rides along from the
  // page's employee prop, and the console capture is the report. A description
  // is accepted if a page still sends one, but never required.
  if (variant === "login") {
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

    // Both variants dedupe. Without it, a form whose only control is a Send
    // button turns one frustrated person into a dozen identical tickets — and
    // the person gets no sense that anything happened the first time.
    let existing = null;
    try {
      existing = await findOpenTicket(project, employeeId, creds);
    } catch (err) {
      // A dupe beats a dropped report, so a failed lookup falls through to
      // creating one rather than refusing.
      console.error("[hr/login-help] duplicate check failed:", err?.message);
    }

    if (existing) {
      return res.status(200).json({
        success: true,
        ticket: existing.name,
        ticketInfo: publicTicket(existing),
        duplicate: true,
        assigned: true,
      });
    }

    const employeeName = String(employee?.employee_name || "").trim();
    const subject = defaults
      .subject(employeeId, employeeName, summarizeProblem(note, diagnostics))
      .slice(0, 140);

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
      ticketInfo: { id: taskName, subject, status: "Open", raisedAt: "" },
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
