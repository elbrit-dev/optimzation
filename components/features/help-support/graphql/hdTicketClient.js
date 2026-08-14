import {
  CREATE_HD_TICKET_MUTATION,
  DELETE_HD_TICKET_MUTATION,
  HD_TICKET_ASSIGNMENTS_QUERY,
  HD_MY_TICKET_ASSIGNMENTS_QUERY,
  HD_TICKET_COMMENTS_QUERY,
  HD_TICKET_COMMUNICATIONS_QUERY,
  HD_TICKET_OPTIONS_QUERY,
  HD_TICKETS_QUERY,
  HD_VIEWS_QUERY,
  SAVE_HD_TICKET_COMMENT_MUTATION,
  SAVE_HD_TICKET_COMMUNICATION_MUTATION,
  UPDATE_HD_TICKET_MUTATION,
} from "./hdTicket.graphql";
import {
  applyHDTicketAssignments,
  mapCreateTicketFormToHDTicketDoc,
  mapHDTicketAssignmentsResponse,
  mapHDTicketCommentsResponse,
  mapHDTicketCommunicationsResponse,
  mapHDTicketNodeToSupportTicket,
  mapHDTicketOptionsResponse,
  mapHDTicketsResponse,
  mapHDViewsResponse,
} from "./hdTicketMapper";
import { clearHelpDeskGraphQLCache, executeHelpDeskGraphQL, executeHelpDeskMethod } from "./graphqlClient";

export async function fetchHDTickets({ first = 50, filters = null, graphqlConfig } = {}) {
  const data = await executeHelpDeskGraphQL(HD_TICKETS_QUERY, { first, filters }, { cache: true, config: graphqlConfig });
  const tickets = mapHDTicketsResponse(data, graphqlConfig);

  try {
    const assignmentsData = await executeHelpDeskGraphQL(
      HD_TICKET_ASSIGNMENTS_QUERY,
      { first: 200 },
      { cache: true, config: graphqlConfig }
    );
    return applyHDTicketAssignments(tickets, mapHDTicketAssignmentsResponse(assignmentsData));
  } catch {
    return tickets;
  }
}

export async function fetchHDTicketByName(ticketName, graphqlConfig) {
  if (!ticketName) return null;
  const tickets = await fetchHDTickets({
    first: 1,
    filters: [{ fieldname: "name", operator: "EQ", value: ticketName }],
    graphqlConfig,
  });
  return tickets[0] || null;
}

// Fetched one name at a time on purpose: the filter operators this backend accepts for
// a name-list lookup are unverified, and a single EQ per ticket is known to work. Calls
// run in parallel and hit the request cache, and the count is capped below.
async function fetchHDTicketDocs(names, graphqlConfig) {
  const docs = await Promise.all(
    names.map((name) =>
      executeHelpDeskGraphQL(
        HD_TICKETS_QUERY,
        { first: 1, filters: [{ fieldname: "name", operator: "EQ", value: name }] },
        { cache: true, config: graphqlConfig }
      )
        .then((data) => mapHDTicketsResponse(data, graphqlConfig)[0] || null)
        .catch(() => null)
    )
  );
  return docs.filter(Boolean);
}

export async function fetchHDTicketsAssignedTo(user, graphqlConfig, { maxTickets = 50 } = {}) {
  if (!user) return [];
  const data = await executeHelpDeskGraphQL(
    HD_MY_TICKET_ASSIGNMENTS_QUERY,
    { first: 200, user },
    { cache: true, config: graphqlConfig }
  );
  const names = Array.from(
    new Set(
      (data?.ToDoes?.edges || [])
        .map((edge) => edge.node)
        .filter((node) => node?.reference_name && node.status !== "Cancelled")
        .map((node) => node.reference_name)
    )
  ).slice(0, maxTickets);

  const tickets = await fetchHDTicketDocs(names, graphqlConfig);
  // Assigned to the caller by definition, so skip the separate assignment merge.
  return tickets.map((ticket) => ({
    ...ticket,
    assignee: ticket.assignee && ticket.assignee !== "Unassigned" ? ticket.assignee : user,
  }));
}

export async function fetchHDTicketOptions({ first = 100, graphqlConfig } = {}) {
  const data = await executeHelpDeskGraphQL(HD_TICKET_OPTIONS_QUERY, { first }, { cache: true, config: graphqlConfig });
  return mapHDTicketOptionsResponse(data);
}

export async function fetchHDViews({ first = 100, graphqlConfig } = {}) {
  const data = await executeHelpDeskGraphQL(
    HD_VIEWS_QUERY,
    { first, filters: [{ fieldname: "dt", operator: "EQ", value: "HD Ticket" }] },
    { cache: true, config: graphqlConfig }
  );
  return mapHDViewsResponse(data);
}

export async function fetchHelpDeskLoggedUser(graphqlConfig) {
  const loggedUser = await executeHelpDeskMethod("frappe.auth.get_logged_user", {}, { config: graphqlConfig });
  return typeof loggedUser === "string" ? loggedUser : loggedUser?.user || loggedUser?.name || "";
}

export async function createHDTicket(form, context) {
  const doc = mapCreateTicketFormToHDTicketDoc(form, context);
  const data = await executeHelpDeskGraphQL(CREATE_HD_TICKET_MUTATION, { doc: JSON.stringify(doc) }, { config: context.graphqlConfig });
  clearHelpDeskGraphQLCache();
  const name = data?.saveDoc?.doc?.name;

  if (!name) {
    throw new Error("Ticket was created but the server did not return a ticket name.");
  }

  return {
    ...mapHDTicketNodeToSupportTicket({ ...doc, name, creation: new Date().toISOString(), modified: new Date().toISOString() }),
    raw: { ...doc, name },
  };
}

export async function updateHDTicket(name, patch) {
  if (!name) throw new Error("Ticket name is required.");
  const { graphqlConfig, ...fields } = patch || {};
  const doc = { name, ...fields };
  const data = await executeHelpDeskGraphQL(UPDATE_HD_TICKET_MUTATION, { doc: JSON.stringify(doc) }, { config: graphqlConfig });
  clearHelpDeskGraphQLCache();
  return data?.saveDoc?.doc?.name || name;
}

export async function fetchHDTicketComments(ticketName, graphqlConfig, user = {}) {
  if (!ticketName) return [];
  const data = await executeHelpDeskGraphQL(
    HD_TICKET_COMMENTS_QUERY,
    { ticketName },
    { cache: true, config: graphqlConfig }
  );
  return mapHDTicketCommentsResponse(data, user, graphqlConfig);
}

export async function saveHDTicketComment(ticketName, comment, context = {}) {
  if (!ticketName) throw new Error("Ticket name is required.");
  if (!comment?.trim()) throw new Error("Comment is required.");
  const commentedBy = context.user?.email || context.user?.username || "";
  const doc = {
    reference_ticket: ticketName,
    content: comment.trim(),
    ...(commentedBy ? { commented_by: commentedBy } : {}),
  };
  const data = await executeHelpDeskGraphQL(
    SAVE_HD_TICKET_COMMENT_MUTATION,
    { doc: JSON.stringify(doc) },
    { config: context.graphqlConfig }
  );
  clearHelpDeskGraphQLCache();
  return data?.saveDoc?.doc?.name;
}

export async function fetchHDTicketCommunications(ticketName, graphqlConfig, user = {}) {
  if (!ticketName) return [];
  const data = await executeHelpDeskGraphQL(
    HD_TICKET_COMMUNICATIONS_QUERY,
    { ticketName },
    { cache: true, config: graphqlConfig }
  );
  return mapHDTicketCommunicationsResponse(data, user, graphqlConfig);
}

// Records the message on the ticket thread. It does NOT dispatch an email — sending
// would have to go through the Helpdesk's own reply API.
export async function saveHDTicketCommunication(ticketName, content, context = {}) {
  if (!ticketName) throw new Error("Ticket name is required.");
  if (!content?.trim()) throw new Error("Message is required.");
  const sender = context.user?.email || context.user?.username || "";
  const fromAgent = Boolean(context.fromAgent);
  const doc = {
    communication_type: "Communication",
    communication_medium: "Email",
    sent_or_received: fromAgent ? "Sent" : "Received",
    reference_doctype: HD_TICKET_DOCTYPE,
    reference_name: ticketName,
    subject: context.subject ? `Re: ${context.subject}` : `Re: ${ticketName}`,
    content: content.trim(),
    status: "Linked",
    ...(sender ? { sender } : {}),
    ...(fromAgent && context.recipients ? { recipients: context.recipients } : {}),
  };
  const data = await executeHelpDeskGraphQL(
    SAVE_HD_TICKET_COMMUNICATION_MUTATION,
    { doc: JSON.stringify(doc) },
    { config: context.graphqlConfig }
  );
  clearHelpDeskGraphQLCache();
  return data?.saveDoc?.doc?.name;
}

export async function deleteHDTicket(name, graphqlConfig) {
  if (!name) throw new Error("Ticket name is required.");
  await executeHelpDeskGraphQL(DELETE_HD_TICKET_MUTATION, { name }, { config: graphqlConfig });
  clearHelpDeskGraphQLCache();
  return name;
}
