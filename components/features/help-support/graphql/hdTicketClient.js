import {
  CREATE_HD_TICKET_MUTATION,
  DELETE_HD_TICKET_MUTATION,
  HD_TICKET_ASSIGNMENTS_QUERY,
  HD_TICKET_COMMENTS_QUERY,
  HD_TICKET_OPTIONS_QUERY,
  HD_TICKETS_QUERY,
  HD_VIEWS_QUERY,
  SAVE_HD_TICKET_COMMENT_MUTATION,
  UPDATE_HD_TICKET_MUTATION,
} from "./hdTicket.graphql";
import {
  applyHDTicketAssignments,
  mapCreateTicketFormToHDTicketDoc,
  mapHDTicketAssignmentsResponse,
  mapHDTicketCommentsResponse,
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
  return mapHDTicketCommentsResponse(data, user);
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

export async function deleteHDTicket(name, graphqlConfig) {
  if (!name) throw new Error("Ticket name is required.");
  await executeHelpDeskGraphQL(DELETE_HD_TICKET_MUTATION, { name }, { config: graphqlConfig });
  clearHelpDeskGraphQLCache();
  return name;
}
