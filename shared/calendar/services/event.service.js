import { graphqlRequest } from "@calendar/lib/graphql-client";
import { serializeEventDoc } from "./event-to-erp";
import { EVENTS_BY_RANGE_QUERY, LEAVE_ALLOCATIONS_QUERY, LEAVE_APPLICATIONS_QUERY, LEAVE_QUERY, TODO_LIST_QUERY } from "@calendar/services/events.query";
import { mapErpGraphqlEventToCalendar } from "@calendar/services/erp-to-event";
import { getCachedEvents, setCachedEvents } from "@calendar/lib/calendar/event-cache";
import { buildRangeCacheKey } from "@calendar/lib/calendar/cache-key";
import { clearEventCache } from "@calendar/lib/calendar/event-cache";
import { format } from "date-fns";
import { getCached } from "@calendar/lib/participants-cache";
import {
  getCachedLeaveBalance,
  setCachedLeaveBalance,
  getLeaveCacheKey,
  clearLeaveCache,
} from "@calendar/lib/calendar/leave-cache";
import { mapErpLeaveToCalendar } from "./leave-to-erp";
import { mapErpTodoToCalendar } from "./todo-to-erp-graphql";
const PAGE_SIZE = 50;

const SAVE_EVENT_MUTATION = `
mutation SaveEvent($doc: String!) {
  saveDoc(doctype: "Event", doc: $doc) {
    doc {
      name
    }
  }
}
`;
const SAVE_EVENT_TODO = `
mutation SaveEvent($doc: String!) {
  saveDoc(doctype: "ToDo", doc: $doc) {
    doc {
      name
    }
  }
}
`;
const SAVE_LEAVE_APPLICATION_MUTATION = `
mutation SaveEvent($doc: String!) {
  saveDoc(doctype: "Leave Application", doc: $doc) {
    doc {
      name
    }
  }
}
`;
const UPDATE_LEAVE_STATUS_MUTATION = `
mutation UpdateLeaveStatus(
  $name: String!
  $value: DOCFIELD_VALUE_TYPE!
) {
  setValue(
    doctype: "Leave Application"
    name: $name
    fieldname: "status"
    value: $value
  ) {
    name
  }
}
`;


const UPDATE_LEAVE_ATTACHMENT_MUTATION = `
mutation UpdateLeaveAttachment(
  $name: String!
  $value: DOCFIELD_VALUE_TYPE!
) {
  setValue(
    doctype: "Leave Application"
    name: $name
    fieldname: "fsl_attach"
    value: $value
  ) {
    name
  }
}
`;
export async function updateLeaveAttachment(leaveName, fileUrl) {
  if (!leaveName || !fileUrl) return;

  const data = await graphqlRequest(
    UPDATE_LEAVE_ATTACHMENT_MUTATION,
    {
      name: leaveName,
      value: fileUrl,
    }
  );

  if (!data?.setValue?.name) {
    throw new Error("Failed to update leave attachment");
  }
  clearLeaveCache();
  return true;
}


export async function saveEvent(doc) {
  const data = await graphqlRequest(SAVE_EVENT_MUTATION, {
    doc: serializeEventDoc(doc),
  });

  if (!data?.saveDoc?.doc?.name) {
    throw new Error("ERP did not return Event name");
  }
  // invalidate cache only after successful write
  clearEventCache();

  return data.saveDoc.doc;
}
export async function updateLeaveStatus(leaveName, newStatus) {
  if (!leaveName || !newStatus) {
    throw new Error("Invalid leave update payload");
  }

  const data = await graphqlRequest(
    UPDATE_LEAVE_STATUS_MUTATION,
    {
      name: leaveName,
      value: newStatus,
    }
  );

  if (!data?.setValue?.name) {
    throw new Error("Failed to update leave status");
  }

  // Clear all relevant caches
  clearLeaveCache();

  return true;
}
export async function addLeadNote(leadName, newNoteHtml) {
  if (!leadName || !newNoteHtml) {
    throw new Error("Invalid note payload");
  }

  // 1️⃣ Fetch current lead with notes
  const leadRes = await graphqlRequest(
    `
    query GetLead($name: String!) {
      Lead(name: $name) {
        name
        notes {
          note
        }
      }
    }
    `,
    { name: leadName }
  );

  const existingNotes =
    leadRes?.Lead?.notes?.map(n => ({ note: n.note })) ?? [];

  // 2️⃣ Append new note
  const updatedDoc = {
    name: leadName,
    notes: [
      ...existingNotes,
      { note: newNoteHtml }
    ]
  };

  // 3️⃣ Save Lead
  const saveRes = await graphqlRequest(
    `
    mutation SaveLead($doc: String!) {
      saveDoc(doctype: "Lead", doc: $doc) {
        doc { name }
      }
    }
    `,
    { doc: JSON.stringify(updatedDoc) }
  );

  if (!saveRes?.saveDoc?.doc?.name) {
    throw new Error("Failed to save lead note");
  }

  return true;
}

export async function saveDocToErp(doc) {
  const data = await graphqlRequest(SAVE_EVENT_TODO, {
    doc: JSON.stringify(doc),
  });

  if (!data?.saveDoc?.doc?.name) {
    throw new Error("ERP did not return document name");
  }

  clearEventCache();
  return data.saveDoc.doc;
}

export async function saveLeaveApplication(doc) {
  const data = await graphqlRequest(SAVE_LEAVE_APPLICATION_MUTATION, {
    doc: JSON.stringify(doc),
  });

  if (!data?.saveDoc?.doc?.name) {
    throw new Error("Failed to create Leave Application");
  }

  clearLeaveCache();
  return data.saveDoc.doc;
}
export async function fetchAllLeaveApplications() {
  return getCached("LEAVE_APPLICATIONS", async () => {
    const data = await graphqlRequest(LEAVE_QUERY, {
      first: 500,
    });

    return data.LeaveApplications.edges
      .map(edge => mapErpLeaveToCalendar(edge.node))
      .filter(Boolean);
  });
}
export async function fetchAllTodoList() {
   return getCached("TODO_LIST", async () => {
       const data = await graphqlRequest(TODO_LIST_QUERY, {
         first: 500,
       });
       return data.ToDoes.edges
         .map(edge => mapErpTodoToCalendar(edge.node))
         .filter(Boolean);
     });
}

export async function fetchEventsByRange(startDate, endDate, view) {
  const cacheKey = buildRangeCacheKey(view, startDate, endDate);

  const cached = getCachedEvents(cacheKey);
  if (cached) {
    return cached;
  }

  let after = null;
  let events = [];

  const filter = [
    {
      fieldname: "starts_on",
      operator: "LTE",
      value: endDate.toISOString(),
    },
    {
      fieldname: "ends_on",
      operator: "GTE",
      value: startDate.toISOString(),
    },
  ];

  while (true) {
    const data = await graphqlRequest(EVENTS_BY_RANGE_QUERY, {
      first: PAGE_SIZE,
      after,
      filter,
    });

    const connection = data?.Events;
    if (!connection) break;

    const pageEvents = connection.edges
      .map(edge => mapErpGraphqlEventToCalendar(edge.node))
      .filter(Boolean);

    events.push(...pageEvents);

    if (!connection.pageInfo?.hasNextPage) break;
    after = connection.pageInfo.endCursor;
  }

  const leaves = await fetchAllLeaveApplications();
  const todolist = await fetchAllTodoList();
  const merged = [...events, ...leaves, ...todolist];
  setCachedEvents(cacheKey, merged);
  return merged;
}

const DELETE_EVENT_MUTATION = `
mutation DeleteEvent($doctype: String!, $name: String!) {
  deleteDoc(doctype: $doctype, name: $name) {
    name
  }
}
`;

export async function deleteEventFromErp(erpName) {
  if (!erpName) return true;

  try {
    const data = await graphqlRequest(DELETE_EVENT_MUTATION, {
      doctype: "Event",
      name: erpName,
    });

    // Success path
    clearEventCache();
    return true;

  } catch (error) {
    const message = error?.message || "";

    // ✅ ERP already deleted → treat as success
    if (
      message.includes("not found") ||
      message.includes("does not exist") ||
      message.includes("Missing document")
    ) {
      clearEventCache();
      return true;
    }

    // ❌ real error
    throw error;
  }
}

// ---------------------------------------------
// Leave Filters
// ---------------------------------------------
const getLeaveAllocationFilters = (employeeId) => [
  { fieldname: "employee", operator: "EQ", value: employeeId },
  { fieldname: "docstatus", operator: "EQ", value: "1" },
];

const getLeaveUsedFilters = (employeeId) => [
  { fieldname: "employee", operator: "EQ", value: employeeId },
  { fieldname: "status", operator: "EQ", value: "Approved" },
  { fieldname: "docstatus", operator: "EQ", value: "1" },
];

const getLeavePendingFilters = (employeeId) => [
  { fieldname: "employee", operator: "EQ", value: employeeId },
  { fieldname: "status", operator: "EQ", value: "Open" },
];

/* =====================================================
   EMPLOYEE LEAVE BALANCE (WITH CACHE)
===================================================== */
export async function fetchEmployeeLeaveBalance(employeeId) {
  const cacheKey = getLeaveCacheKey(employeeId);
  const cached = getCachedLeaveBalance(cacheKey);

  // ⏱ 5-minute TTL
  if (cached && Date.now() - cached.ts < 5 * 60 * 1000) {
    return cached.data;
  }

  const [allocRes, usedRes, pendingRes] = await Promise.all([
    graphqlRequest(LEAVE_ALLOCATIONS_QUERY, {
      first: 20,
      filters: getLeaveAllocationFilters(employeeId),
    }),
    graphqlRequest(LEAVE_APPLICATIONS_QUERY, {
      first: 100,
      filters: getLeaveUsedFilters(employeeId),
    }),
    graphqlRequest(LEAVE_APPLICATIONS_QUERY, {
      first: 100,
      filters: getLeavePendingFilters(employeeId),
    }),
  ]);

  const balance = {};

  allocRes.LeaveAllocations.edges.forEach(({ node }) => {
    balance[node.leave_type__name] = {
      allocated: node.total_leaves_allocated,
      used: 0,
      pending: 0,
    };
  });

  usedRes.LeaveApplications.edges.forEach(({ node }) => {
    if (balance[node.leave_type__name]) {
      balance[node.leave_type__name].used += node.total_leave_days;
    }
  });

  pendingRes.LeaveApplications.edges.forEach(({ node }) => {
    if (balance[node.leave_type__name]) {
      balance[node.leave_type__name].pending += node.total_leave_days;
    }
  });

  Object.values(balance).forEach((b) => {
    b.available = b.allocated - b.used - b.pending;
  });

  setCachedLeaveBalance(cacheKey, balance);
  return balance;
}
export function formatDateForERP(date) {
  return format(date, "yyyy-MM-dd");
}
export async function updateLeadDob(leadName, dob) {
  const mutation = `
  mutation UpdateLeadDOB(
  $name: String!
  $value: DOCFIELD_VALUE_TYPE!
) {
  setValue(
    doctype: "Lead"
    name: $name
    fieldname: "fsl_dob"
    value: $value
  ) {
    name
  }
}
  `;

  return graphqlRequest(mutation, {
    name: leadName,
    value: formatDateForERP(dob),
  });
}