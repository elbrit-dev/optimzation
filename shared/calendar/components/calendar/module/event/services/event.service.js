import { graphqlRequest } from "@calendar/lib/graphql-client";
import { serializeEventDoc } from "../mappers/event-to-erp";
import {
  CUSTOMER_QUERY,
  EVENTS_BY_RANGE_QUERY,
  SAVE_EVENT_MUTATION,
  SAVE_EVENT_QUOTATION,
} from "@calendar/components/calendar/module/event/graphql/events.query";
import { mapErpGraphqlEventToCalendar } from "@calendar/components/calendar/module/event/mappers/erp-to-event";
import { getCachedEvents, setCachedEvents } from "@calendar/lib/calendar/event-cache";
import { buildRangeCacheKey } from "@calendar/lib/calendar/cache-key";
import { clearEventCache } from "@calendar/lib/calendar/event-cache";
import { format } from "date-fns";
import { clearCached, getCached } from "@calendar/lib/data-cache";
import { GOOGLE_CALENDAR_BY_USER } from "@calendar/components/calendar/google-auth/queries";
import { fetchAllTodoList } from "@calendar/components/calendar/module/todo/services/todo.service";
import { fetchAllLeaveApplications } from "@calendar/components/calendar/module/leave/services/leave.service";
import {
  enqueueDocShareSync,
  syncEventDocShares,
} from "@calendar/components/calendar/module/event/services/docshare.service";
const PAGE_SIZE = 200;
const QUOTATION_BATCH_SIZE = 25;
const pendingEventRequests = new Map();


export async function fetchQuotationsByNames(names) {
  if (!names?.length) return {};

  const uniqueNames = [...new Set(names.filter(Boolean))];
  const map = {};

  for (let index = 0; index < uniqueNames.length; index += QUOTATION_BATCH_SIZE) {
    const batch = uniqueNames.slice(index, index + QUOTATION_BATCH_SIZE);
    const variableDefinitions = batch
      .map((_, batchIndex) => `$filters${batchIndex}: [DBFilterInput!]`)
      .join(", ");
    const queryFields = batch
      .map(
        (_, batchIndex) => `
      quotation_${batchIndex}: Quotations(
        first: 1
        filter: $filters${batchIndex}
      ) {
        edges {
          node {
            name
            items {
              item_code { name }
              qty
              rate
              amount
            }
          }
        }
      }`
      )
      .join("\n");

    const variables = Object.fromEntries(
      batch.map((name, batchIndex) => [
        `filters${batchIndex}`,
        [
          {
            fieldname: "name",
            operator: "EQ",
            value: name,
          },
        ],
      ])
    );

    const data = await graphqlRequest(
      `query QuotationsByNames(${variableDefinitions}) {${queryFields}
      }`,
      variables
    );

    Object.values(data ?? {}).forEach((connection) => {
      const node = connection?.edges?.[0]?.node;
      if (node?.name) {
        map[node.name] = node;
      }
    });
  }

  return map;
}
export async function saveEvent(doc, options = {}) {
  const data = await graphqlRequest(SAVE_EVENT_MUTATION, {
    doc: serializeEventDoc(doc),
  });

  if (!data?.saveDoc?.doc?.name) {
    throw new Error("ERP did not return Event name");
  }
  // invalidate cache only after successful write
  clearEventCache();

  if (options.shareWithUserIds?.length) {
    const shareOptions = {
      skipExistingCheck: options.skipExistingShareCheck,
    };

    if (options.deferShareSync !== false) {
      void enqueueDocShareSync(
        "Event",
        data.saveDoc.doc.name,
        options.shareWithUserIds,
        shareOptions
      );
    } else {
      await syncEventDocShares(
        data.saveDoc.doc.name,
        options.shareWithUserIds,
        shareOptions
      );
    }
  }

  return data.saveDoc.doc;
}
async function fetchLeadNotes(leadName) {
  const res = await graphqlRequest(
    `
    query GetLead($name: String!) {
      Lead(name: $name) {
        name
        notes {
      name
      note
      idx
      parentfield
      parenttype
      doctype
      creation
      modified
    }
      }
    }
    `,
    { name: leadName }
  );

  if (!res?.Lead) {
    throw new Error("Lead not found");
  }

  return res.Lead.notes || [];
}

async function saveLeadNotes(leadName, notes) {
  const updatedDoc = {
    name: leadName,
    notes,
  };

  const saveRes = await graphqlRequest(
    `
    mutation SaveLead($doc: String!) {
      saveDoc(doctype: "Lead", doc: $doc) {
        doc {
          name
        }
      }
    }
    `,
    {
      doc: JSON.stringify(updatedDoc),
    }
  );

  if (!saveRes?.saveDoc?.doc?.name) {
    throw new Error("Failed to save lead notes");
  }

  return true;
}

export async function addLeadNote(leadName, newNoteHtml) {
  if (!leadName || !newNoteHtml) {
    throw new Error("Invalid note payload");
  }

  const existingNotes = await fetchLeadNotes(leadName);

  return saveLeadNotes(leadName, [
    ...existingNotes,
    {
      note: newNoteHtml,
    },
  ]);
}
export async function deleteLeadNote(
  leadName,
  noteName
) {
  if (!leadName || !noteName) {
    throw new Error(
      "Invalid delete payload"
    );
  }

  const existingNotes =
    await fetchLeadNotes(leadName);

  const filteredNotes =
    existingNotes.filter(
      (note) =>
        note.name !== noteName
    );

  return saveLeadNotes(
    leadName,
    filteredNotes
  );
}

export async function saveDocToQuotation(doc) {
  const data = await graphqlRequest(SAVE_EVENT_QUOTATION, {
    doc: JSON.stringify(doc),
  });

  if (!data?.saveDoc?.doc?.name) {
    throw new Error("ERP did not return document name");
  }

  clearEventCache();
  return data.saveDoc.doc;
}
export async function fetchAllCustomers() {
  return getCached("CUSTOMERS", async () => {
    const data = await graphqlRequest(CUSTOMER_QUERY, {
      first: 500,
    });

    return data.Customers.edges
      .map(edge => edge.node.name)  // return only the name of the customer to the UI to show in the calendar as a customer name to select from the calendar
  });
}

export async function fetchCustomersByTerritory(territory) {
  if (!territory) return [];

  return getCached(`CUSTOMERS:${territory}`, async () => {
    const data = await graphqlRequest(CUSTOMER_QUERY, {
      first: 500,
      filters: [
        {
          fieldname: "territory",
          operator: "EQ",
          value: territory,
        },
      ],
    });

    return (
      data?.Customers?.edges?.map((edge) => edge.node?.name).filter(Boolean) ?? []
    );
  });
}

export async function fetchGoogleCalendarStatus(email) {
  if (!email) return null;

  return getCached(`GOOGLE_CALENDAR_STATUS:${email.toLowerCase()}`, async () => {
    const data = await graphqlRequest(
      GOOGLE_CALENDAR_BY_USER,
      {
        first: 1,
        filter: [
          {
            fieldname: "user",
            operator: "EQ",
            value: email,
          },
        ],
      }
    );

    return (
      data?.GoogleCalendars?.edges?.[0]?.node ||
      null
    );
  });
}

export function clearGoogleCalendarStatusCache(email) {
  if (!email) return;
  clearCached([`GOOGLE_CALENDAR_STATUS:${email.toLowerCase()}`]);
}

export async function fetchEventsByRange(startDate, endDate, view) {
  const cacheKey = buildRangeCacheKey(view, startDate, endDate);

  const cached = getCachedEvents(cacheKey);
  if (cached) return cached;

  if (pendingEventRequests.has(cacheKey)) {
    return pendingEventRequests.get(cacheKey);
  }

  const request = fetchEventsByRangeUncached(
    cacheKey,
    startDate,
    endDate
  )
    .finally(() => {
      pendingEventRequests.delete(cacheKey);
    });

  pendingEventRequests.set(cacheKey, request);
  return request;
}

async function fetchEventsByRangeUncached(
  cacheKey,
  startDate,
  endDate
) {
  let after = null;
  let rawEventNodes = [];

  const filter = [
    {
      fieldname: "starts_on",
      operator: "LTE",
      value: endDate.toISOString(),
    },
  ];

  // --------------------------------------------
  // 1️⃣ FETCH RAW EVENT NODES (NO MAPPING YET)
  // --------------------------------------------
  while (true) {
    const data = await graphqlRequest(EVENTS_BY_RANGE_QUERY, {
      first: PAGE_SIZE,
      after,
      filters: filter,
    });
    const connection = data?.Events;
    if (!connection) break;

    rawEventNodes.push(
      ...connection.edges.map((edge) => edge.node)
    );

    if (!connection.pageInfo?.hasNextPage) break;
    after = connection.pageInfo.endCursor;
  }
  rawEventNodes = rawEventNodes.filter((node) =>
    doesEventOverlapRange(node, startDate, endDate)
  );
  // --------------------------------------------
  // 2️⃣ COLLECT QUOTATION REFERENCES
  // --------------------------------------------
  const quotationNames = rawEventNodes
    .filter(
      (node) =>
        node.reference_doctype__name === "Quotation" &&
        node.reference_docname__name
    )
    .map((node) => node.reference_docname__name);
  const uniqueQuotationNames = [
    ...new Set(quotationNames),
  ];

  // --------------------------------------------
  // 3️⃣ FETCH QUOTATIONS IN BATCH
  // --------------------------------------------
  const [
    quotationResult,
    leavesResult,
    todoResult,
  ] = await Promise.allSettled([
    fetchQuotationsByNames(uniqueQuotationNames),
    fetchAllLeaveApplications(),
    fetchAllTodoList(),
  ]);
  const quotationMap =
    quotationResult.status === "fulfilled"
      ? quotationResult.value
      : {};
  const leaves =
    leavesResult.status === "fulfilled"
      ? leavesResult.value
      : [];
  const todolist =
    todoResult.status === "fulfilled"
      ? todoResult.value
      : [];

  if (quotationResult.status === "rejected") {
    console.error(
      "Failed to fetch quotation references",
      quotationResult.reason
    );
  }

  if (leavesResult.status === "rejected") {
    console.error(
      "Failed to fetch leave applications",
      leavesResult.reason
    );
  }

  if (todoResult.status === "rejected") {
    console.error(
      "Failed to fetch todo list",
      todoResult.reason
    );
  }
  // --------------------------------------------
  // 4️⃣ INJECT QUOTATION ITEMS INTO RAW NODES
  // --------------------------------------------
  const enrichedNodes = rawEventNodes.map((node) => {
    if (
      node.reference_doctype__name === "Quotation" &&
      quotationMap[node.reference_docname__name]
    ) {
      const quotation =
        quotationMap[node.reference_docname__name];
      node.fsl_doctor_item =
        quotation.items?.map((row) => ({
          item__name: row.item_code?.name,
          qty: Number(row.qty) || 0,
          rate: Number(row.rate) || 0,
          amount: Number(row.amount) || 0,
        })) || [];
      node.pob_given =
        quotation.items?.length > 0
          ? 1
          : 0;
    }

    return node;
  });

  // --------------------------------------------
  // 5️⃣ NOW MAP TO CALENDAR
  // --------------------------------------------
  const events = enrichedNodes
    .map((node) =>
      mapErpGraphqlEventToCalendar(node)
    )
    .filter(Boolean);
  // --------------------------------------------
  // 6️⃣ MERGE LEAVES + TODOS
  // --------------------------------------------
  const merged = [...events, ...leaves, ...todolist];
  setCachedEvents(cacheKey, merged);

  return merged;
}

function doesEventOverlapRange(node, rangeStart, rangeEnd) {
  const eventStart = parseErpDateValue(node?.starts_on);
  if (!eventStart) {
    return false;
  }

  const eventEnd =
    parseErpDateValue(node?.ends_on) ?? eventStart;

  return eventStart <= rangeEnd && eventEnd >= rangeStart;
}

function parseErpDateValue(value) {
  if (!value || typeof value !== "string") {
    return null;
  }

  const isoLike = value.replace(" ", "T");
  const date = new Date(isoLike);

  return Number.isNaN(date.getTime()) ? null : date;
}

const DELETE_EVENT_MUTATION = `
mutation DeleteEvent($doctype: String!, $name: String!) {
  deleteDoc(doctype: $doctype, name: $name) {
    name
  }
}
`;
export async function deleteEventFromErp(erpName, docname) {
  if (!erpName) return true;

  try {
    const data = await graphqlRequest(DELETE_EVENT_MUTATION, {
      doctype: docname ?? "Event",
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


export function formatDateForERP(date) {
  return format(date, "yyyy-MM-dd");
}
