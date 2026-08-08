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

// Baked-in defaults, confirmed against ERP: project "LoginIssue" exists as
// BUG-0002, and hr@elbrit.org ("Elbrit HR") is an enabled User. Both are
// overridable per-page from Plasmic, then by env, so neither needs a Netlify
// change to work.
const DEFAULT_PROJECT = "LoginIssue";
const DEFAULT_ASSIGNEE = "hr@elbrit.org";

// Tickets may only be assigned inside the company. The assignee arrives from a
// PUBLIC page, so without this anyone could POST an arbitrary address and have
// ERP mail strangers on our behalf.
const ASSIGNEE_DOMAIN = "@elbrit.org";

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

  const employeeId = normalizeEmployeeId(req.body?.employeeId);
  const designation = String(req.body?.designation ?? "").trim().slice(0, 140);
  const phoneRaw = String(req.body?.phone ?? "").trim();
  const phone = normalizePhone(phoneRaw);
  const note = String(req.body?.note ?? "").trim().slice(0, 1000);

  if (!employeeId) return res.status(400).json({ error: "Employee ID is required" });
  if (!designation) return res.status(400).json({ error: "Designation is required" });
  if (phone.length < 10) {
    return res.status(400).json({ error: "Enter a valid 10-digit mobile number" });
  }

  // Prop → env → baked-in default, for each knob.
  const projectSetting = pick(
    req.body?.project,
    process.env.ERP_LOGIN_HELP_PROJECT,
    DEFAULT_PROJECT
  );
  const assignee = pick(
    req.body?.assignee,
    process.env.ERP_LOGIN_HELP_ASSIGNEE,
    DEFAULT_ASSIGNEE
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

    const existing = await findOpenTicket(project, employeeId, creds);
    if (existing) {
      return res.status(200).json({
        success: true,
        ticket: existing,
        duplicate: true,
        assigned: true,
      });
    }

    const who = employee?.employee_name ? ` — ${employee.employee_name}` : "";
    const subject = `Cannot log in: ${employeeId}${who}`.slice(0, 140);

    const created = await erpFetch("/api/resource/Task", {
      method: "POST",
      creds,
      body: {
        subject,
        project: project || undefined,
        status: "Open",
        priority: diagnosis.severity === "high" ? "High" : "Medium",
        description: renderTaskDescription({
          diagnosis,
          employeeId,
          designation,
          phone: phoneRaw,
          note,
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
    console.error("[hr/login-help]", err);
    return res.status(500).json({
      error:
        "We couldn't reach HR just now. Please try again in a few minutes, or call your manager.",
    });
  }
}
