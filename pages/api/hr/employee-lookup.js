import {
  fetchEmployee,
  normalizeEmployeeId,
  normalizePhone,
  rateLimit,
  callerIp,
  resolveErpCredentials,
} from "../../../lib/erpServer";
import { diagnose } from "../../../lib/loginDiagnostics";

/**
 * Confirms an Employee ID + phone pair so the login-help form can auto-fill.
 *
 * PUBLIC endpoint — the caller is by definition not logged in. Two rules keep
 * that safe:
 *   1. It reveals a name/designation ONLY when the submitted phone matches the
 *      `cell_number` on the record. Employee IDs are sequential (E01269,
 *      E01270, E01271…), so without that check this would be a staff directory
 *      anyone could walk.
 *   2. It never echoes back the phone/email held on the record — that would
 *      turn "verify" into "reveal" for anyone holding just an ID.
 *
 * POST { employeeId, phone, erpTarget?, erpUrl?, authToken? }
 *   The trailing three are the Plasmic props — same prop → env → default chain
 *   as /api/hr/login-help.
 *  -> { found, verified, employeeName?, designation? }
 */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const limit = rateLimit(`lookup:${callerIp(req)}`, { max: 20, windowMs: 60_000 });
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfter));
    return res.status(429).json({ error: "Too many attempts. Try again shortly." });
  }

  const employeeId = normalizeEmployeeId(req.body?.employeeId);
  const phone = normalizePhone(req.body?.phone);

  if (!employeeId) {
    return res.status(400).json({ error: "Employee ID is required" });
  }
  // Don't burn an ERP round-trip until there's a full number to compare.
  if (phone.length < 10) {
    return res.status(200).json({ found: false, verified: false });
  }

  try {
    const creds = resolveErpCredentials({
      url: req.body?.erpUrl,
      token: req.body?.authToken,
      target: req.body?.erpTarget,
    });
    const employee = await fetchEmployee(employeeId, creds);
    const diagnosis = diagnose(employee, phone);

    if (!diagnosis.verified) {
      // Deliberately indistinguishable from "no such employee": a caller who
      // guesses an ID but not the phone learns nothing either way.
      return res.status(200).json({ found: diagnosis.found, verified: false });
    }

    return res.status(200).json({
      found: true,
      verified: true,
      employeeName: employee.employee_name || "",
      designation: employee.designation || "",
    });
  } catch (err) {
    console.error("[hr/employee-lookup]", err);
    // The form must stay usable even when ERP is down — the ticket itself is
    // what matters, auto-fill is a convenience.
    return res.status(200).json({ found: false, verified: false, degraded: true });
  }
}
