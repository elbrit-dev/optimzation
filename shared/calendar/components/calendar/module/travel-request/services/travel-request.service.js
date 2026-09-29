import { graphqlRequest } from "@calendar/lib/graphql-client";
import { invalidateCalendarData } from "@calendar/lib/calendar/invalidate";
import { getCached } from "@calendar/lib/data-cache";
import {
  DELETE_DOC_MUTATION,
  PROCUREMENT_TASK_QUERY,
  PROJECT_BY_NAME_QUERY,
  SAVE_TASK_MUTATION,
  SAVE_TODO_MUTATION,
  SAVE_TRAVEL_REQUEST_MUTATION,
  TRAVEL_APPROVAL_TODOS_QUERY,
  TRAVEL_REQUESTS_QUERY,
} from "@calendar/components/calendar/module/travel-request/graphql/travel-request.query";
import { mapErpTravelRequestToCalendar } from "@calendar/components/calendar/module/travel-request/mappers/travel-request.mapper";
import {
  TRAVEL_REQUEST_PROJECT_NAME,
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

// The Procurement project is looked up by its name, so the same code works
// on every ERP site (its ID differs between UAT and production).
let procurementProjectPromise = null;
export function resolveProcurementProject() {
  procurementProjectPromise ??= graphqlRequest(PROJECT_BY_NAME_QUERY, {
    filter: [
      { fieldname: "project_name", operator: "EQ", value: TRAVEL_REQUEST_PROJECT_NAME },
    ],
  }).then((data) => {
    const name = data?.Projects?.edges?.[0]?.node?.name;
    if (!name) {
      throw new Error(
        `Project "${TRAVEL_REQUEST_PROJECT_NAME}" was not found in ERP. Create it (or give this user access) to file travel requests.`
      );
    }
    return name;
  });
  // A failed lookup is retried next time rather than remembered.
  procurementProjectPromise.catch(() => {
    procurementProjectPromise = null;
  });
  return procurementProjectPromise;
}

// The Task is linked to its request only through the request ID written into
// the Task's description (Travel Request has no field for it).
export async function findProcurementTaskName(travelRequestName) {
  const project = await resolveProcurementProject();
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

// Every active GM with an ERP user to assign the Task to. Read from the full
// employee list, since the requester's own team list may not include the GM.
export async function fetchTravelApprovers() {
  const employees = await fetchEmployees();
  return employees.filter((employee) => employee.email && isTravelApprover(employee));
}

// The ToDos pointing at a document — for a Task, its assignments (one per GM).
export async function findTodosFor(doctype, name) {
  const data = await graphqlRequest(TRAVEL_APPROVAL_TODOS_QUERY, {
    filter: [
      { fieldname: "reference_type", operator: "EQ", value: doctype },
      { fieldname: "reference_name", operator: "EQ", value: name },
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

// The GM approves by marking their assignment of the Procurement Task done:
// the request is submitted, the Task is completed, and the other GMs'
// assignments are closed too (best effort — a GM may not be allowed to edit
// another GM's ToDo).
export async function approveTravelRequest(
  travelRequestName,
  { taskName, closedTodoName } = {}
) {
  await saveDocWith(
    SAVE_TRAVEL_REQUEST_MUTATION,
    { name: travelRequestName, docstatus: 1 },
    "Travel Request"
  );

  const task =
    taskName ?? (await findProcurementTaskName(travelRequestName).catch(() => null));
  if (task) {
    await saveDocWith(SAVE_TASK_MUTATION, { name: task, status: "Completed" }, "Task");
  }

  const siblings = task ? await findTodosFor("Task", task).catch(() => []) : [];
  await Promise.allSettled(
    siblings
      .filter((todo) => todo.name !== closedTodoName && todo.status === "Open")
      .map((todo) =>
        saveDocWith(SAVE_TODO_MUTATION, { name: todo.name, status: "Closed" }, "ToDo")
      )
  );

  invalidateCalendarData({ reason: "travel-request:approve" });
}

// Deleting a draft request also removes the Procurement Task and the GMs'
// assignments of it, so nobody is left with work for a request that no
// longer exists.
export async function deleteTravelRequest(name) {
  const taskName = await findProcurementTaskName(name).catch(() => null);
  const todos = [
    ...(taskName ? await findTodosFor("Task", taskName) : []),
    // Approval ToDos filed against the request itself (before Tasks were used).
    ...(await findTodosFor("Travel Request", name)),
  ];
  for (const todo of todos) {
    await graphqlRequest(DELETE_DOC_MUTATION, { doctype: "ToDo", name: todo.name });
  }
  if (taskName) {
    await graphqlRequest(DELETE_DOC_MUTATION, { doctype: "Task", name: taskName });
  }
  await graphqlRequest(DELETE_DOC_MUTATION, { doctype: "Travel Request", name });
  invalidateCalendarData({ broadcast: false, reason: "travel-request:delete" });
}
