import {
  normalizeEmployeeId,
  rateLimit,
  callerIp,
  resolveErpCredentials,
} from "../../../lib/erpServer";
import { findOpenTicket, publicTicket } from "../../../lib/erpTickets";
import { resolveProject, variantDefaults } from "../../../lib/loginHelpConfig";

/**
 * Does this person already have a ticket open?
 *
 * The form asks before it shows anything, so someone who already reported a
 * problem is shown its progress instead of a send button. Without this they
 * tap send, get told "already reported", and have learned nothing they could
 * not have been told up front.
 *
 * POST { variant, employeeId, project?, erpTarget?, erpUrl?, authToken? }
 *  -> { ticket: { id, subject, status, raisedAt } | null }
 */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Looser than the submit limit — this is a read, and the form fires it every
  // time the sheet opens.
  const limit = rateLimit(`status:${callerIp(req)}`, { max: 40, windowMs: 60_000 });
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfter));
    return res.status(429).json({ error: "Too many requests" });
  }

  const variant = req.body?.variant === "in-app" ? "in-app" : "login";
  const employeeId = normalizeEmployeeId(req.body?.employeeId);

  if (!employeeId) return res.status(200).json({ ticket: null });

  try {
    const creds = resolveErpCredentials({
      url: req.body?.erpUrl,
      token: req.body?.authToken,
      target: req.body?.erpTarget,
    });

    const project = await resolveProject(
      req.body?.project ||
        process.env.ERP_LOGIN_HELP_PROJECT ||
        variantDefaults(variant).project,
      creds
    );

    const ticket = await findOpenTicket(project, employeeId, creds);
    return res.status(200).json({ ticket: publicTicket(ticket) });
  } catch (err) {
    console.error("[hr/ticket-status]", err?.message);
    // Never block the form on this. Reporting "no ticket" lets them send, and
    // the submit path dedupes server-side anyway — so the worst case is one
    // wasted tap, not a lost report.
    return res.status(200).json({ ticket: null, degraded: true });
  }
}
