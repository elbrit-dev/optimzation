import { graphqlRequest } from "@calendar/lib/graphql-client";
import { serializeEventDoc } from "../mappers/event-to-erp";
import { CUSTOMER_QUERY, EVENTS_BY_RANGE_QUERY, QUOTATIONS_BY_NAMES_QUERY, SAVE_EVENT_MUTATION,SAVE_EVENT_QUOTATION } from "@calendar/components/calendar/module/event/graphql/events.query";
import { mapErpGraphqlEventToCalendar } from "@calendar/components/calendar/module/event/mappers/erp-to-event";
import { getCachedEvents, setCachedEvents } from "@calendar/lib/calendar/event-cache";
import { buildRangeCacheKey } from "@calendar/lib/calendar/cache-key";
import { clearEventCache } from "@calendar/lib/calendar/event-cache";
import { format } from "date-fns";
import { getCached } from "@calendar/lib/data-cache";
import { GOOGLE_CALENDAR_BY_USER } from "@calendar/components/calendar/google-auth/queries";
import { fetchAllTodoList } from "@calendar/components/calendar/module/todo/services/todo.service";
import { fetchAllLeaveApplications } from "@calendar/components/calendar/module/leave/services/leave.service";
const PAGE_SIZE = 50;


export async function fetchQuotationsByNames(names) {
  if (!names?.length) return {};

  const map = {};

  await Promise.all(
    names.map(async (name) => {
      const data = await graphqlRequest(
        QUOTATIONS_BY_NAMES_QUERY,
        {
          first: 1,
          filters: [
            {
              fieldname: "name",
              operator: "EQ",
              value: name,
            },
          ],
        }
      );

      const node =
        data?.Quotations?.edges?.[0]?.node;

      if (node) {
        map[node.name] = node;
      }
    })
  );

  return map;
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

export async function fetchGoogleCalendarStatus(email) {
  if (!email) return null;

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
}

export async function fetchEventsByRange(startDate, endDate, view) {
  const cacheKey = buildRangeCacheKey(view, startDate, endDate);

  const cached = getCachedEvents(cacheKey);
  if (cached) return cached;

  let after = null;
  let rawEventNodes = [];

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

  // --------------------------------------------
  // 1️⃣ FETCH RAW EVENT NODES (NO MAPPING YET)
  // --------------------------------------------
  while (true) {
    const data = await graphqlRequest(EVENTS_BY_RANGE_QUERY, {
      first: PAGE_SIZE,
      after,
      filter,
    });

    const connection = data?.Events;
    if (!connection) break;

    rawEventNodes.push(
      ...connection.edges.map((edge) => edge.node)
    );

    if (!connection.pageInfo?.hasNextPage) break;
    after = connection.pageInfo.endCursor;
  }

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
  const quotationMap =
    await fetchQuotationsByNames(uniqueQuotationNames);
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
          ? "Yes"
          : "No";
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
