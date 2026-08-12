import { DEFAULT_HD_TICKET_VALUES, HD_TICKET_FORM_FIELDS } from "./hdTicketFields";

function compactDoc(doc) {
  return Object.fromEntries(
    Object.entries(doc).filter(([, value]) => value !== undefined && value !== null && value !== "")
  );
}

function linkName(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value.name || value.value || "";
}

function nowDateParts() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toTimeString().slice(0, 8);
  return { date, time };
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

export function mapCreateTicketFormToHDTicketDoc(form, context = {}) {
  const { date, time } = nowDateParts();
  const raisedBy = [form.raisedBy, context.user?.email, context.user?.username].find(isEmail) || "";
  const description = form.description?.trim() || "";

  if (!raisedBy) {
    throw new Error("Raised by must be a valid email address.");
  }

  return compactDoc({
    [HD_TICKET_FORM_FIELDS.subject]: form.subject?.trim(),
    [HD_TICKET_FORM_FIELDS.raisedBy]: raisedBy,
    [HD_TICKET_FORM_FIELDS.ticketType]: form.ticketType || DEFAULT_HD_TICKET_VALUES.ticket_type,
    [HD_TICKET_FORM_FIELDS.agentGroup]: form.agentGroup,
    [HD_TICKET_FORM_FIELDS.status]: form.status || DEFAULT_HD_TICKET_VALUES.status,
    [HD_TICKET_FORM_FIELDS.priority]: form.priority || DEFAULT_HD_TICKET_VALUES.priority,
    [HD_TICKET_FORM_FIELDS.statusCategory]: form.statusCategory || DEFAULT_HD_TICKET_VALUES.status_category,
    [HD_TICKET_FORM_FIELDS.summary]: form.summary || description,
    [HD_TICKET_FORM_FIELDS.description]: description,
    [HD_TICKET_FORM_FIELDS.template]: form.template || DEFAULT_HD_TICKET_VALUES.template,
    [HD_TICKET_FORM_FIELDS.key]: form.key,
    [HD_TICKET_FORM_FIELDS.sla]: form.sla,
    [HD_TICKET_FORM_FIELDS.responseBy]: form.responseBy,
    [HD_TICKET_FORM_FIELDS.raisedOutsideWorkingHours]:
      form.raisedOutsideWorkingHours ?? DEFAULT_HD_TICKET_VALUES.raised_outside_working_hours,
    [HD_TICKET_FORM_FIELDS.agreementStatus]: form.agreementStatus,
    [HD_TICKET_FORM_FIELDS.resolutionBy]: form.resolutionBy,
    [HD_TICKET_FORM_FIELDS.serviceLevelAgreementCreation]: form.serviceLevelAgreementCreation,
    [HD_TICKET_FORM_FIELDS.onHoldSince]: form.onHoldSince,
    [HD_TICKET_FORM_FIELDS.totalHoldTime]: form.totalHoldTime,
    [HD_TICKET_FORM_FIELDS.firstResponseTime]: form.firstResponseTime,
    [HD_TICKET_FORM_FIELDS.firstRespondedOn]: form.firstRespondedOn,
    [HD_TICKET_FORM_FIELDS.avgResponseTime]: form.avgResponseTime,
    [HD_TICKET_FORM_FIELDS.lastAgentResponse]: form.lastAgentResponse,
    [HD_TICKET_FORM_FIELDS.lastCustomerResponse]: form.lastCustomerResponse,
    [HD_TICKET_FORM_FIELDS.resolutionDetails]: form.resolutionDetails,
    [HD_TICKET_FORM_FIELDS.openingDate]: form.openingDate || date,
    [HD_TICKET_FORM_FIELDS.openingTime]: form.openingTime || time,
    [HD_TICKET_FORM_FIELDS.resolutionDate]: form.resolutionDate,
    [HD_TICKET_FORM_FIELDS.resolutionTime]: form.resolutionTime,
    [HD_TICKET_FORM_FIELDS.userResolutionTime]: form.userResolutionTime,
  });
}

export function mapHDTicketNodeToSupportTicket(node) {
  const ticketType = linkName(node.ticket_type) || node.ticket_type || "Unspecified";
  const template = linkName(node.template) || node.template || "";
  const agentGroup = linkName(node.agent_group) || node.agent_group || "";
  const status = linkName(node.status) || node.status || "Open";
  const priority = linkName(node.priority) || node.priority || "Medium";

  return {
    id: node.name,
    name: node.name,
    status,
    title: node.subject || node.name,
    subject: node.subject || "",
    category: ticketType,
    date: node.opening_date || node.creation || "",
    createdAt: node.creation || "",
    updatedAt: node.modified || "",
    employee: node.raised_by || "Requester",
    raisedBy: node.raised_by || "",
    team: agentGroup || "Helpdesk",
    assignee: agentGroup || "Helpdesk",
    agentGroup,
    ticketType,
    priority,
    statusCategory: node.status_category || "",
    firstResponse: node.first_response_time || "",
    resolution: node.resolution_time || "",
    description: node.description || node.summary || "",
    summary: node.summary || "",
    template,
    raw: node,
    conversation: [
      {
        id: `${node.name}-description`,
        author: node.raised_by || "Requester",
        role: "Requester",
        time: node.creation || "",
        tone: "user",
        message: node.description || node.summary || node.subject || "",
      },
    ].filter((message) => message.message),
  };
}

export function mapHDTicketsResponse(data) {
  return (
    data?.HDTickets?.edges?.map((edge) => mapHDTicketNodeToSupportTicket(edge.node)).filter(Boolean) || []
  );
}
