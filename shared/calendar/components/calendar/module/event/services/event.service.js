import { graphqlRequest } from "@calendar/lib/graphql-client";
import { serializeEventDoc } from "../mappers/event-to-erp";
import {
  CUSTOMER_QUERY,
  EVENTS_BY_RANGE_QUERY,
  SAVE_EVENT_MUTATION,
  SAVE_EVENT_QUOTATION,
} from "@calendar/components/calendar/module/event/graphql/events.query";
import { mapErpGraphqlEventToCalendar } from "@calendar/components/calendar/module/event/mappers/erp-to-event";
import {
  getCachedEvents,
  getEventCacheGeneration,
  setCachedEvents,
} from "@calendar/lib/calendar/event-cache";
import { buildRangeCacheKey } from "@calendar/lib/calendar/cache-key";
import { invalidateCalendarData } from "@calendar/lib/calendar/invalidate";
import { format } from "date-fns";
import { clearCached, getCached } from "@calendar/lib/data-cache";
import { GOOGLE_CALENDAR_BY_USER } from "@calendar/components/calendar/google-auth/queries";
import { fetchAllTodoList } from "@calendar/components/calendar/module/todo/services/todo.service";
import { fetchAllLeaveApplications } from "@calendar/components/calendar/module/leave/services/leave.service";
import {
  enqueueDocShareSync,
  fetchDocShareNamesForUser,
  syncEventDocShares,
} from "@calendar/components/calendar/module/event/services/docshare.service";
import { LOGGED_IN_USER } from "@calendar/components/auth/calendar-users";
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
            creation
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
  invalidateCalendarData({ reason: "event:save" });

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

  invalidateCalendarData({ reason: "quotation:save" });
  return data.saveDoc.doc;
}
export async function fetchAllCustomers() {
  return getCached("CUSTOMERS", async () => {
    const data = await graphqlRequest(CUSTOMER_QUERY, {
      first: 500,
    });

    return data.Customers.edges
      .map((edge) => ({
        name: edge.node?.name ?? "",
        territory: edge.node?.territory__name ?? null,
      }))
      .filter((customer) => customer.name);
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
      data?.Customers?.edges
        ?.map((edge) => ({
          name: edge.node?.name ?? "",
          territory: edge.node?.territory__name ?? null,
        }))
        .filter((customer) => customer.name) ?? []
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

/**
 * @param {{ force?: boolean }} [options] `force` skips both the range cache and
 *   the in-flight dedupe. A request that started before the caches were dropped
 *   already resolved its leaves/todos/doc-shares from the *old* caches, so
 *   handing that promise back to a Sync click is what made Sync look broken.
 */
export async function fetchEventsByRange(startDate, endDate, view, options = {}) {
  // includeLeaves / includeTodos follow the calendar's enabled event types: a
  // disabled type costs no query. They are part of the cache key because they
  // change the shape of the result.
  const { force = false, includeLeaves = true, includeTodos = true } = options;
  const cacheKey = `${buildRangeCacheKey(view, startDate, endDate)}:${
    includeLeaves ? "L" : "-"
  }${includeTodos ? "T" : "-"}`;

  if (!force) {
    const cached = getCachedEvents(cacheKey);
    if (cached) return cached;

    const inFlight = pendingEventRequests.get(cacheKey);
    if (inFlight) return inFlight;
  }

  const generation = getEventCacheGeneration();

  const request = fetchEventsByRangeUncached(
    cacheKey,
    startDate,
    endDate,
    generation,
    { includeLeaves, includeTodos }
  )
    .finally(() => {
      // A forced fetch may have replaced this entry — only clear our own.
      if (pendingEventRequests.get(cacheKey) === request) {
        pendingEventRequests.delete(cacheKey);
      }
    });

  pendingEventRequests.set(cacheKey, request);
  return request;
}

// ERP refuses cursor pagination when an `after` cursor is combined with a
// `filter` — it answers "Filter must be a tuple or list (in a list)". Because
// `graphqlRequest` throws on GraphQL errors, that killed the *entire* fetch on
// page 2, so any user whose visible event count crossed one page had a calendar
// that never loaded or refreshed at all (page 1's rows were discarded with the
// exception). Rather than walk cursors, ask for a window large enough to hold
// the whole answer and widen it if ERP reports there is more.
const INITIAL_EVENT_WINDOW = 500;
const MAX_EVENT_WINDOW = 8000;

async function fetchRawEventNodes(filter) {
  let windowSize = INITIAL_EVENT_WINDOW;
  let nodes = null;

  while (true) {
    let connection;

    try {
      // `after` is deliberately left unprovided rather than passed as null —
      // absent is what tells ERP "no cursor" without going near the broken
      // cursor+filter path.
      const data = await graphqlRequest(EVENTS_BY_RANGE_QUERY, {
        first: windowSize,
        filters: filter,
      });
      connection = data?.Events;
    } catch (error) {
      // The widened window was refused. Showing the rows we already hold beats
      // failing the whole calendar.
      if (nodes) {
        console.warn(
          `Event fetch capped at ${nodes.length} rows — ERP refused a larger window.`,
          error
        );
        return nodes;
      }

      throw error;
    }

    if (!connection) return nodes ?? [];

    nodes = connection.edges.map((edge) => edge.node);

    if (!connection.pageInfo?.hasNextPage) return nodes;

    if (windowSize >= MAX_EVENT_WINDOW) {
      console.warn(
        `Event fetch truncated at ${MAX_EVENT_WINDOW} rows — some events are not being shown.`
      );
      return nodes;
    }

    windowSize = Math.min(windowSize * 2, MAX_EVENT_WINDOW);
  }
}

async function fetchEventsByRangeUncached(
  cacheKey,
  startDate,
  endDate,
  generation,
  { includeLeaves = true, includeTodos = true } = {}
) {
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
  let rawEventNodes = (await fetchRawEventNodes(filter)).filter((node) =>
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
    sharedEventNamesResult,
  ] = await Promise.allSettled([
    fetchQuotationsByNames(uniqueQuotationNames),
    // Two queries per calendar load that are pure waste while these types are
    // switched off (see DISABLED_TAG_IDS) — they'd be filtered out on arrival.
    includeLeaves ? fetchAllLeaveApplications() : [],
    includeTodos ? fetchAllTodoList() : [],
    fetchDocShareNamesForUser(LOGGED_IN_USER.email),
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
  const sharedEventNames =
    sharedEventNamesResult.status === "fulfilled"
      ? sharedEventNamesResult.value
      : new Set();

  if (sharedEventNamesResult.status === "rejected") {
    console.error(
      "Failed to fetch events shared with current user",
      sharedEventNamesResult.reason
    );
  }

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
      node.pob_creation = quotation.creation ?? null;
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
    .filter(Boolean)
    .map((event) =>
      event?.erpName && sharedEventNames.has(event.erpName)
        ? { ...event, isSharedWithCurrentUser: true }
        : event
    );
  // --------------------------------------------
  // 6️⃣ MERGE LEAVES + TODOS
  // --------------------------------------------
  const merged = [...events, ...leaves, ...todolist];
  setCachedEvents(cacheKey, merged, generation);

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
    invalidateCalendarData({ reason: "event:delete" });
    return true;

  } catch (error) {
    const message = error?.message || "";

    // ✅ ERP already deleted → treat as success
    if (
      message.includes("not found") ||
      message.includes("does not exist") ||
      message.includes("Missing document")
    ) {
      invalidateCalendarData({ reason: "event:delete" });
      return true;
    }

    // ❌ real error
    throw error;
  }
}


export function formatDateForERP(date) {
  return format(date, "yyyy-MM-dd");
}
