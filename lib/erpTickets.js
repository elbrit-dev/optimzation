import { erpFetch } from "./erpServer";

/**
 * Finding the ticket a person already has open, so we can show it back to them
 * instead of raising another one.
 *
 * Shared by /api/hr/login-help (which must not create a second ticket) and
 * /api/hr/ticket-status (which the form calls before it shows a send button).
 * Both must agree on what "already open" means, or the form offers to send and
 * the server then refuses — so the definition lives here, once.
 */

// "Overdue" is a real Task status, not a flag: a ticket nobody has touched in
// time is still very much open, and leaving it out would let a second one be
// raised for the same problem.
export const OPEN_STATUSES = ["Open", "Working", "Pending Review", "Overdue"];

const TICKET_FIELDS = ["name", "subject", "status", "priority", "creation"];

/**
 * The employee ID is matched inside the subject, which every subject format
 * embeds. Not a foreign key, so it is a substring match — safe with Elbrit's
 * fixed-width IDs (E00004, DE067, IN002), where no ID contains another.
 *
 * @returns the newest open ticket, or null. Throws on ERP failure — callers
 *          decide whether that should block them.
 */
export async function findOpenTicket(project, employeeId, creds) {
  const filters = [
    ["status", "in", OPEN_STATUSES],
    ["subject", "like", `%${employeeId}%`],
  ];
  if (project) filters.push(["project", "=", project]);

  const json = await erpFetch("/api/resource/Task", {
    creds,
    query: {
      filters,
      fields: TICKET_FIELDS,
      limit_page_length: 1,
      order_by: "creation desc",
    },
  });

  return json?.data?.[0] ?? null;
}

/**
 * Trims an ERP Task down to what a non-ERP user should see. Deliberately not
 * the whole doc: this answers a PUBLIC endpoint, and the description carries
 * the account diagnosis and console logs.
 */
export function publicTicket(task) {
  if (!task) return null;
  return {
    id: task.name,
    subject: task.subject || "",
    status: task.status || "Open",
    raisedAt: task.creation || "",
  };
}
