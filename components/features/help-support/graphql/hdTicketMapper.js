import { DEFAULT_HD_TICKET_VALUES, HD_TICKET_FORM_FIELDS } from "./hdTicketFields";
import { formatERPDuration, formatIndiaDateTime } from "./dateTime";

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

function normalizeIdentity(value) {
  return String(value || "").trim().toLowerCase();
}

function isSameIdentity(left, right) {
  return Boolean(normalizeIdentity(left) && normalizeIdentity(left) === normalizeIdentity(right));
}

function isCurrentUserIdentity(value, user = {}) {
  return [user.email, user.username, user.name].some((identity) => isSameIdentity(value, identity));
}

function isEnabled(node) {
  return !Number(node?.disabled || 0);
}

function mapOptionNode(node) {
  if (!node?.name) return null;
  return {
    name: node.name,
    label: node.description || node.name,
    description: node.description || "",
    priority: linkName(node.priority) || node.priority__name || "",
    integerValue: Number.isFinite(Number(node.integer_value)) ? Number(node.integer_value) : null,
  };
}

function parseJsonField(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeAssetUrls(html, config = {}) {
  const baseUrl = config.endpointUrl?.replace(/\/api\/method\/graphql$/, "") || "";

  if (!baseUrl || !html) return html || "";
  return String(html)
    .replace(/(src|href)="\/files\//g, `$1="${baseUrl}/files/`)
    .replace(/(src|href)='\/files\//g, `$1='${baseUrl}/files/`)
    .replace(/(src|href)="\/assets\//g, `$1="${baseUrl}/assets/`)
    .replace(/(src|href)='\/assets\//g, `$1='${baseUrl}/assets/`);
}

function sanitizeHtml(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/\son\w+=(?:"[^"]*"|'[^']*')/gi, "")
    .replace(/(href|src)=["']javascript:[^"']*["']/gi, '$1="#"');
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

export function mapHDTicketNodeToSupportTicket(node, config = {}) {
  const ticketType = node.ticket_type__name || linkName(node.ticket_type) || node.ticket_type || "Unspecified";
  const template = node.template__name || linkName(node.template) || node.template || "";
  const agentGroup = node.agent_group__name || linkName(node.agent_group) || node.agent_group || "";
  const status = node.status__name || linkName(node.status) || node.status || "Open";
  const priority = node.priority__name || linkName(node.priority) || node.priority || "Medium";
  // Only a real ToDo allocation counts as an assignee. The old chain fell back to
  // owner/modified_by, which named the ticket's creator rather than whoever it is
  // assigned to — and those User links are no longer fetched.
  const assignee = node.assignee || node.allocated_to__name || linkName(node.allocated_to) || "";
  const employee = node.raised_by || node.contact__name || node.customer__name || "";
  const descriptionHtml = sanitizeHtml(normalizeAssetUrls(node.description || node.summary || "", config));
  const ticketDate = node.opening_date || node.creation || "";
  const createdAt = node.creation || "";
  const updatedAt = node.modified || "";

  return {
    id: node.name,
    name: node.name,
    status,
    title: node.subject || node.name,
    subject: node.subject || "",
    category: ticketType,
    date: ticketDate,
    dateLabel: formatIndiaDateTime(ticketDate, { dateOnly: Boolean(node.opening_date) }),
    createdAt,
    createdAtLabel: formatIndiaDateTime(createdAt),
    updatedAt,
    updatedAtLabel: formatIndiaDateTime(updatedAt),
    employee: employee || "Requester",
    raisedBy: node.raised_by || "",
    team: agentGroup || "Unassigned team",
    assignee: assignee || "Unassigned",
    agentGroup,
    ticketType,
    priority,
    statusCategory: node.status_category || "",
    firstResponse: formatIndiaDateTime(node.first_responded_on) || formatERPDuration(node.first_response_time),
    firstResponseDuration: formatERPDuration(node.first_response_time),
    resolution: formatIndiaDateTime(node.resolution_date) || formatERPDuration(node.resolution_time),
    resolutionDuration: formatERPDuration(node.resolution_time),
    description: descriptionHtml,
    summary: node.summary || "",
    template,
    raw: node,
    conversation: [
      {
        id: `${node.name}-description`,
        author: node.raised_by || "Requester",
        role: "Requester",
        time: formatIndiaDateTime(node.creation || ""),
        tone: "user",
        message: descriptionHtml || node.subject || "",
        isHtml: Boolean(descriptionHtml),
      },
    ].filter((message) => message.message),
  };
}

export function mapHDTicketsResponse(data, config = {}) {
  return (
    data?.HDTickets?.edges?.map((edge) => mapHDTicketNodeToSupportTicket(edge.node, config)).filter(Boolean) || []
  );
}

export function mapHDTicketAssignmentsResponse(data) {
  const assignments = new Map();

  data?.ToDoes?.edges
    ?.map((edge) => edge.node)
    .filter((node) => node?.reference_name)
    .filter((node) => !node.status || node.status !== "Closed")
    .forEach((node) => {
      const assignee = node.allocated_to__name || linkName(node.allocated_to);
      if (assignee && !assignments.has(node.reference_name)) {
        assignments.set(node.reference_name, assignee);
      }
    });

  return assignments;
}

export function applyHDTicketAssignments(tickets, assignments = new Map()) {
  if (!assignments.size) return tickets;
  return tickets.map((ticket) => {
    const assignee = assignments.get(ticket.id);
    return assignee ? { ...ticket, assignee } : ticket;
  });
}

export function mapHDTicketOptionsResponse(data) {
  const ticketTypes =
    data?.HDTicketTypes?.edges
      ?.map((edge) => edge.node)
      .filter(isEnabled)
      .map(mapOptionNode)
      .filter(Boolean) || [];
  const priorities =
    data?.HDTicketPrioritys?.edges
      ?.map((edge) => edge.node)
      .filter(isEnabled)
      .map(mapOptionNode)
      .filter(Boolean)
      .sort((a, b) => {
        if (a.integerValue === null && b.integerValue === null) return a.name.localeCompare(b.name);
        if (a.integerValue === null) return 1;
        if (b.integerValue === null) return -1;
        return a.integerValue - b.integerValue;
      }) || [];
  const statuses = data?.HDTicketStatuses?.edges?.map((edge) => mapOptionNode(edge.node)).filter(Boolean) || [];

  return { ticketTypes, priorities, statuses };
}

export function mapHDTicketCommentsResponse(data, user = {}) {
  return (
    data?.HDTicketComments?.edges
      ?.map((edge) => edge.node)
      .filter((node) => node?.content)
      .sort((a, b) => new Date(a.creation || 0) - new Date(b.creation || 0))
      .map((node) => {
        const author = node.commented_by__name || linkName(node.commented_by) || node.owner__name || linkName(node.owner) || "Support";
        const own =
          isCurrentUserIdentity(node.commented_by__name, user) ||
          isCurrentUserIdentity(linkName(node.commented_by), user) ||
          isCurrentUserIdentity(node.owner__name, user) ||
          isCurrentUserIdentity(linkName(node.owner), user);

        return {
          id: node.name,
          author,
          role: node.is_pinned ? "Pinned comment" : own ? "Requester" : "Support",
          time: formatIndiaDateTime(node.creation || ""),
          tone: own ? "user" : "agent",
          message: node.content,
        };
      }) || []
  );
}

export function mapHDViewsResponse(data) {
  return (
    data?.HDViews?.edges
      ?.map((edge) => edge.node)
      .filter((node) => (node?.dt__name || linkName(node?.dt)) === "HD Ticket")
      .filter((node) => (node?.label || node?.name) !== "My Feedback")
      .map((node) => ({
        id: node.name,
        label: node.label || node.name,
        icon: node.icon || "",
        routeName: node.route_name || "",
        isDefault: Boolean(Number(node.is_default || 0)),
        isCustomerPortal: Boolean(Number(node.is_customer_portal || 0)),
        isStandard: Boolean(Number(node.is_standard || 0)),
        pinned: Boolean(Number(node.pinned || 0)),
        public: Boolean(Number(node.public || 0)),
        type: node.type || "",
        filters: parseJsonField(node.filters, {}),
        orderBy: node.order_by || "",
        columns: parseJsonField(node.columns, []),
        rows: parseJsonField(node.rows, []),
        groupByField: node.group_by_field || "",
        raw: node,
      })) || []
  );
}
