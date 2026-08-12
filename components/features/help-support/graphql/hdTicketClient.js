import {
  CREATE_HD_TICKET_MUTATION,
  DELETE_HD_TICKET_MUTATION,
  HD_TICKETS_QUERY,
  UPDATE_HD_TICKET_MUTATION,
} from "./hdTicket.graphql";
import { mapCreateTicketFormToHDTicketDoc, mapHDTicketNodeToSupportTicket, mapHDTicketsResponse } from "./hdTicketMapper";
import { clearHelpDeskGraphQLCache, executeHelpDeskGraphQL } from "./graphqlClient";

export async function fetchHDTickets({ first = 50, filters = null } = {}) {
  const data = await executeHelpDeskGraphQL(HD_TICKETS_QUERY, { first, filters }, { cache: true });
  return mapHDTicketsResponse(data);
}

export async function createHDTicket(form, context) {
  const doc = mapCreateTicketFormToHDTicketDoc(form, context);
  const data = await executeHelpDeskGraphQL(CREATE_HD_TICKET_MUTATION, { doc: JSON.stringify(doc) });
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
  const doc = { name, ...patch };
  const data = await executeHelpDeskGraphQL(UPDATE_HD_TICKET_MUTATION, { doc: JSON.stringify(doc) });
  clearHelpDeskGraphQLCache();
  return data?.saveDoc?.doc?.name || name;
}

export async function deleteHDTicket(name) {
  if (!name) throw new Error("Ticket name is required.");
  await executeHelpDeskGraphQL(DELETE_HD_TICKET_MUTATION, { name });
  clearHelpDeskGraphQLCache();
  return name;
}
