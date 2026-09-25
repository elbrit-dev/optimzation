import { graphqlRequest } from "@calendar/lib/graphql-client";
import { invalidateCalendarData } from "@calendar/lib/calendar/invalidate";
import { getCached } from "@calendar/lib/data-cache";
import {
  DELETE_DOC_MUTATION,
  PROCUREMENT_TASK_QUERY,
  SAVE_TASK_MUTATION,
  SAVE_TRAVEL_REQUEST_MUTATION,
  TRAVEL_REQUESTS_QUERY,
} from "@calendar/components/calendar/module/travel-request/graphql/travel-request.query";
import { mapErpTravelRequestToCalendar } from "@calendar/components/calendar/module/travel-request/mappers/travel-request.mapper";
import { TRAVEL_REQUEST_PROJECT } from "@calendar/components/calendar/module/travel-request/helpers/travel-request.helper";

export async function fetchAllTravelRequests() {
  return getCached("TRAVEL_REQUESTS", async () => {
    const data = await graphqlRequest(TRAVEL_REQUESTS_QUERY, {
      first: 500,
    });

    return (data?.TravelRequests?.edges ?? [])
      .map((edge) => mapErpTravelRequestToCalendar(edge.node))
      .filter(Boolean);
  });
}

async function saveDocWith(mutation, doc, label) {
  const data = await graphqlRequest(mutation, {
    doc: JSON.stringify(doc),
  });

  if (!data?.saveDoc?.doc?.name) {
    throw new Error(`ERP did not return a ${label} name`);
  }

  return data.saveDoc.doc;
}

export async function saveTravelRequest(doc) {
  const saved = await saveDocWith(SAVE_TRAVEL_REQUEST_MUTATION, doc, "Travel Request");
  invalidateCalendarData({ reason: "travel-request:save" });
  return saved;
}

// The Task is linked to its request only through the request ID written into
// the Task's description (Travel Request has no field for it).
export async function findProcurementTaskName(project, travelRequestName) {
  const data = await graphqlRequest(PROCUREMENT_TASK_QUERY, {
    filter: [
      { fieldname: "project", operator: "EQ", value: project },
      { fieldname: "description", operator: "LIKE", value: `%${travelRequestName}%` },
    ],
  });

  return data?.Tasks?.edges?.[0]?.node?.name ?? null;
}

export function saveProcurementTask(doc) {
  return saveDocWith(SAVE_TASK_MUTATION, doc, "Task");
}

// Deleting a draft request also removes the Procurement Task filed with it, so
// procurement is not left with a task for a request that no longer exists.
export async function deleteTravelRequest(name) {
  const taskName = await findProcurementTaskName(TRAVEL_REQUEST_PROJECT, name);
  if (taskName) {
    await graphqlRequest(DELETE_DOC_MUTATION, { doctype: "Task", name: taskName });
  }
  await graphqlRequest(DELETE_DOC_MUTATION, { doctype: "Travel Request", name });
  invalidateCalendarData({ broadcast: false, reason: "travel-request:delete" });
}
