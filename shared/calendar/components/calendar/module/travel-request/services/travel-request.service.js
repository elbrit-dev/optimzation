import { graphqlRequest } from "@calendar/lib/graphql-client";
import { invalidateCalendarData } from "@calendar/lib/calendar/invalidate";
import { getCached } from "@calendar/lib/data-cache";
import {
  DELETE_DOC_MUTATION,
  PROCUREMENT_TASK_QUERY,
  SAVE_TASK_MUTATION,
  SAVE_TODO_MUTATION,
  SAVE_TRAVEL_REQUEST_MUTATION,
  TRAVEL_APPROVAL_TODOS_QUERY,
  TRAVEL_REQUESTS_QUERY,
} from "@calendar/components/calendar/module/travel-request/graphql/travel-request.query";
import { mapErpTravelRequestToCalendar } from "@calendar/components/calendar/module/travel-request/mappers/travel-request.mapper";
import {
  TRAVEL_REQUEST_PROJECT,
  isTravelApprover,
} from "@calendar/components/calendar/module/travel-request/helpers/travel-request.helper";
import { fetchEmployees } from "@calendar/components/calendar/module/event/services/master-data.service";

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

// Every active GM with an ERP user to allocate a ToDo to. Read from the full
// employee list, since the requester's own team list may not include the GM.
export async function fetchTravelApprovers() {
  const employees = await fetchEmployees();
  return employees.filter((employee) => employee.email && isTravelApprover(employee));
}

export async function findApprovalTodos(travelRequestName) {
  const data = await graphqlRequest(TRAVEL_APPROVAL_TODOS_QUERY, {
    filter: [
      { fieldname: "reference_type", operator: "EQ", value: "Travel Request" },
      { fieldname: "reference_name", operator: "EQ", value: travelRequestName },
    ],
  });

  return (data?.ToDoes?.edges ?? []).map(({ node }) => ({
    name: node.name,
    status: node.status,
    allocatedTo: node.allocated_to__name,
  }));
}

export async function saveApprovalTodo(doc) {
  const saved = await saveDocWith(SAVE_TODO_MUTATION, doc, "ToDo");
  invalidateCalendarData({ reason: "travel-request:approval-todo" });
  return saved;
}

// The GM approves by closing their ToDo: the request is submitted, and the
// other GMs' ToDos for it are closed too (best effort — a GM may not be
// allowed to edit another GM's ToDo).
export async function approveTravelRequest(travelRequestName, { closedTodoName } = {}) {
  await saveDocWith(
    SAVE_TRAVEL_REQUEST_MUTATION,
    { name: travelRequestName, docstatus: 1 },
    "Travel Request"
  );

  const siblings = await findApprovalTodos(travelRequestName).catch(() => []);
  await Promise.allSettled(
    siblings
      .filter((todo) => todo.name !== closedTodoName && todo.status === "Open")
      .map((todo) =>
        saveDocWith(SAVE_TODO_MUTATION, { name: todo.name, status: "Closed" }, "ToDo")
      )
  );

  invalidateCalendarData({ reason: "travel-request:approve" });
}

// Deleting a draft request also removes the Procurement Task and the GM
// ToDos filed with it, so nobody is left with work for a request that no
// longer exists.
export async function deleteTravelRequest(name) {
  const taskName = await findProcurementTaskName(TRAVEL_REQUEST_PROJECT, name);
  if (taskName) {
    await graphqlRequest(DELETE_DOC_MUTATION, { doctype: "Task", name: taskName });
  }
  const approvalTodos = await findApprovalTodos(name);
  for (const todo of approvalTodos) {
    await graphqlRequest(DELETE_DOC_MUTATION, { doctype: "ToDo", name: todo.name });
  }
  await graphqlRequest(DELETE_DOC_MUTATION, { doctype: "Travel Request", name });
  invalidateCalendarData({ broadcast: false, reason: "travel-request:delete" });
}
