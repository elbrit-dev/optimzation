import { graphqlRequest } from "@calendar/lib/graphql-client";
import { serializeEventDoc } from "../mappers/event-to-erp";
import { normalizeParticipantAttending } from "@calendar/components/calendar/module/event/mappers/erp-to-event";
import { isParticipantVisitRecorded } from "@calendar/lib/calendar/visit";
import { ERP_EVENT_FIELDS } from "@calendar/components/calendar/module/event/graphql/field-config";
import {
  CUSTOMER_QUERY,
  EVENT_BY_NATURAL_KEY_QUERY,
  EVENT_PARTICIPANTS_QUERY,
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
import { fetchAllTravelRequests } from "@calendar/components/calendar/module/travel-request/services/travel-request.service";
import { isTravelApprovalTodo } from "@calendar/components/calendar/module/travel-request/helpers/travel-request.helper";
import {
  enqueueDocShareSync,
  fetchDocShareNamesForUser,
  syncEventDocShares,
} from "@calendar/components/calendar/module/event/services/docshare.service";
import { AUTH_CONFIG, LOGGED_IN_USER } from "@calendar/components/auth/calendar-users";
const QUOTATION_BATCH_SIZE = 25;
const pendingEventRequests = new Map();

function getErpBaseUrl() {
  const { erpUrl } = AUTH_CONFIG;

  if (!erpUrl) {
    throw new Error("Missing ERP auth configuration");
  }

  return erpUrl
    .replace(/(\/api(?:\/method)?\/graphql|\/graphql)\/?$/i, "")
    .replace(/\/$/, "");
}

async function syncEventGoogleCalendar(eventName) {
  const { authToken } = AUTH_CONFIG;

  if (!authToken) {
    throw new Error("Missing ERP auth configuration");
  }

  const response = await fetch(
    `${getErpBaseUrl()}/api/method/sync_event_google_Calendar`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `token ${authToken}`,
      },
      body: JSON.stringify({ name: eventName }),
    }
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
}

// Fire-and-forget: the save mutation always sends sync_with_google_calendar: 0
// (see mapFormToErpEvent) so Frappe's blocking native sync hook never fires
// in-request. This nudges the backend to sync sooner than the next Scheduler
// Event tick. It must never throw into the caller or delay the save response —
// the event is already saved successfully, and that Scheduler job is the
// retrying safety net if this call fails or times out.
async function enqueueGoogleCalendarSync(eventName) {
  try {
    return await syncEventGoogleCalendar(eventName);
  } catch (error) {
    console.error(`Google Calendar sync failed for Event:${eventName}`, error);
  }
}

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
            party_name__name
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
/* --------------------------------------------------------------------------
   PARTICIPANT MERGE

   Saving an Event replaces its whole `event_participants` table. Every client
   holds its own cached copy, invalidated only by its own writes, so a browser's
   copy of the other participants is routinely out of date. Sending it back is a
   lost update: whoever marked the visit first has their attendance, visit time
   and location wiped by whoever saves second, which also drops the doc out of
   "Completed" and reads to the user as "the visit reset, do it again".

   So the rows are rebuilt from ERP at write time. Only the acting participant's
   own row may change, and a visit that is already recorded is never cleared.
-------------------------------------------------------------------------- */

// Everything ERP records about one person's visit. Untouchable once set.
const PARTICIPANT_VISIT_FIELDS = [
  "attending",
  "custom_latitude",
  "custom_longitude",
  ERP_EVENT_FIELDS.participantDistanceWrite,
  ERP_EVENT_FIELDS.participantVisitTimeWrite,
  ERP_EVENT_FIELDS.participantForceVisitWrite,
  ERP_EVENT_FIELDS.participantForceVisitReasonWrite,
];

// Same rule the roster uses, so "already visited" means one thing everywhere.
const isVisitRecorded = isParticipantVisitRecorded;

// Event saves can collide when two participants complete the same visit at
// nearly the same time. Frappe rolls these transactions back with MySQL 1205
// (lock wait timeout) or 1213 (deadlock), so retrying that explicit response is
// safe. Each retry rebuilds the participant table from ERP below, which also
// prevents a stale retry from overwriting another participant's visit.
// Jittered, because the writers that contend here are other clients running
// this same code: fixed delays make two of them collide again on every retry.
const EVENT_SAVE_RETRY_DELAYS_MS = [600, 1400, 3000];

// Total wall-clock budget for a save including its retries.
//
// The retries above assume a collision that fails fast — a deadlock (MySQL
// 1213) is detected and rolled back in milliseconds, so trying again shortly
// after is nearly free and usually works. A lock *wait* timeout (1205) is the
// opposite: the request sat holding the connection for the server's whole
// innodb_lock_wait_timeout, 50s by default, because another transaction is
// sitting on the row. Retrying that burns another 50s per attempt and the user
// watches a locked dialog for three and a half minutes before being told it
// failed. Both arrive here as "contention", so the thing that separates them is
// not the message — it is how long the attempt took.
//
// The budget is therefore generous, not tight. A blocked save DOES usually land
// on a later attempt once the other transaction commits, so cutting the retries
// short would turn a slow success into a fast failure and leave the user with no
// event at all. What it must not do is run forever: four attempts against a 50s
// timeout is already ~3.5 minutes, and past that the lock is not transient and
// somebody needs to look at the server.
//
// The cost of waiting that long is paid in the UI instead — `onContention` below
// reports every attempt so the user can see it is working rather than frozen.
const SAVE_RETRY_TIME_BUDGET_MS = 150_000;

function withJitter(delayMs) {
  return Math.round(delayMs * (0.7 + Math.random() * 0.6));
}

/**
 * Two writers touching one Event at the same time.
 *
 * Frappe reports this several different ways depending on where the collision
 * lands: a row-lock timeout or deadlock from MySQL, a timestamp mismatch when
 * the row changed under the request, or an explicit document lock. All of them
 * mean the same thing for us — nothing is wrong with the payload, so the save
 * is worth retrying.
 */
function isDatabaseContentionError(error) {
  const message = String(error?.message ?? "").toLowerCase();

  return (
    // Matched loosely on purpose. Frappe surfaces the same MySQL condition with
    // several different wrappings, and anything that reaches the user as a raw
    // "deadlock" string is a retry we failed to make — it is contention, not a
    // problem with the payload.
    message.includes("lock wait") ||
    message.includes("deadlock") ||
    message.includes("try restarting transaction") ||
    message.includes("timestampmismatch") ||
    message.includes("has been modified after you have opened it") ||
    message.includes("document has been modified") ||
    message.includes("documentlocked") ||
    message.includes("document locked") ||
    message.includes("querytimeout") ||
    /operationalerror:\s*\((1205|1213)\b/.test(message)
  );
}

function waitForRetry(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function fetchEventParticipantRows(erpName) {
  const data = await graphqlRequest(EVENT_PARTICIPANTS_QUERY, {
    name: erpName,
  });

  // "No event came back" must never be read as "this event has no
  // participants": callers like join/leave send only the acting person's row,
  // so treating an unreadable event as empty would delete everyone else.
  if (!data?.Event) {
    throw new Error(`Event ${erpName} could not be read before saving`);
  }

  return (data.Event.event_participants ?? []).map((row) => ({
    name: row.name ?? undefined,
    reference_doctype: row.reference_doctype__name,
    reference_docname: String(row.reference_docname__name),
    // "YES" from the enum read is rejected on write; normalise before echoing.
    attending: normalizeParticipantAttending(row.attending),
    email: row.email ?? "",
    custom_latitude: row.custom_latitude ?? null,
    custom_longitude: row.custom_longitude ?? null,
    [ERP_EVENT_FIELDS.participantDistanceWrite]: row.custom_distance ?? null,
    [ERP_EVENT_FIELDS.participantVisitTimeWrite]: row.custom_visit_time ?? null,
    [ERP_EVENT_FIELDS.participantForceVisitWrite]: row.custom_is_force_visit
      ? 1
      : 0,
    [ERP_EVENT_FIELDS.participantForceVisitReasonWrite]:
      row.custom_force_visit_reason ?? "",
    ...(row.role_profile?.name && {
      [ERP_EVENT_FIELDS.participantRoleProfileWrite]: row.role_profile.name,
    }),
  }));
}

export function mergeParticipantRows({
  freshRows = [],
  outgoingRows = [],
  actingEmployeeId,
  removedEmployeeIds = [],
}) {
  const removed = new Set(removedEmployeeIds.map(String));
  const acting = actingEmployeeId != null ? String(actingEmployeeId) : null;
  const outgoingByEmployee = new Map(
    outgoingRows
      .filter((row) => row?.reference_docname != null)
      .map((row) => [String(row.reference_docname), row])
  );

  const merged = [];
  const seen = new Set();

  freshRows.forEach((freshRow) => {
    const employeeId = String(freshRow.reference_docname);
    seen.add(employeeId);

    if (removed.has(employeeId)) return;

    const outgoingRow = outgoingByEmployee.get(employeeId);

    // Someone else's row: ERP's copy wins outright. The client has no business
    // rewriting another person's visit.
    if (!outgoingRow || employeeId !== acting) {
      merged.push(freshRow);
      return;
    }

    const nextRow = { ...freshRow, ...outgoingRow, name: freshRow.name };

    // Done stays done: a stale blank must never undo a recorded visit.
    if (isVisitRecorded(freshRow)) {
      PARTICIPANT_VISIT_FIELDS.forEach((field) => {
        nextRow[field] = freshRow[field];
      });
    }

    merged.push(nextRow);
  });

  // Newly invited employees (and a join) exist only in the outgoing rows.
  outgoingRows.forEach((row) => {
    const employeeId = String(row?.reference_docname ?? "");
    if (!employeeId || seen.has(employeeId) || removed.has(employeeId)) return;
    seen.add(employeeId);
    merged.push(row);
  });

  return merged;
}

async function prepareEventDocForSave(doc, options) {
  let outgoingDoc = doc;

  if (options.mergeParticipants && doc?.name) {
    try {
      const freshRows = await fetchEventParticipantRows(doc.name);
      const mergedRows = mergeParticipantRows({
        freshRows,
        outgoingRows: doc.event_participants ?? [],
        actingEmployeeId: options.mergeParticipants.actingEmployeeId,
        removedEmployeeIds:
          options.mergeParticipants.removedEmployeeIds ?? [],
      });

      outgoingDoc = { ...doc, event_participants: mergedRows };

      // Completion follows the merged rows, so a visit is only "Completed" when
      // everyone really has visited — and one person's tick can't complete or
      // un-complete the visit on another person's behalf.
      if (options.mergeParticipants.recomputeDoctorVisitStatus) {
        const employeeRows = mergedRows.filter(
          (row) => row.reference_doctype === "Employee"
        );
        const allVisited =
          employeeRows.length > 0 && employeeRows.every(isVisitRecorded);

        outgoingDoc.status = allVisited ? "Completed" : "Open";
      }
    } catch (error) {
      // Writing the stale table anyway is what destroys other people's visits,
      // so fail instead. The cause is carried into the message on purpose: the
      // queue classifies retryability by matching the network signature, so a
      // dropped connection here still auto-retries rather than parking as a
      // hard failure the user has to notice.
      console.error("Failed to read current participants before save", error);
      throw new Error(
        `Couldn't confirm the current visit data, so nothing was saved. ${
          error?.message ?? ""
        }`.trim(),
        { cause: error }
      );
    }
  }

  return outgoingDoc;
}

/**
 * The document a previous attempt at this create already made, if any.
 *
 * Subject and starts_on together identify one of these events: the subject is
 * generated from the doctor/HQ and the employee, and the app already treats one
 * doctor per employee per day as unique. Matched with EQ only — this Frappe
 * GraphQL layer mishandles IN filters.
 */
export async function findExistingEventByNaturalKey({
  subject,
  startsOn,
  eventCategory,
}) {
  if (!subject || !startsOn) return null;

  const data = await graphqlRequest(EVENT_BY_NATURAL_KEY_QUERY, {
    first: 5,
    filters: [
      { fieldname: "subject", operator: "EQ", value: subject },
      { fieldname: "starts_on", operator: "EQ", value: startsOn },
    ],
  });

  const nodes =
    data?.Events?.edges?.map((edge) => edge?.node).filter(Boolean) ?? [];

  const match = eventCategory
    ? nodes.find((node) => node.event_category === eventCategory)
    : nodes[0];

  return match?.name ?? null;
}

export async function saveEvent(doc, options = {}) {
  let outgoingDoc = doc;
  let data;
  const startedAt = Date.now();

  for (
    let attempt = 0;
    attempt <= EVENT_SAVE_RETRY_DELAYS_MS.length;
    attempt += 1
  ) {
    // Do this inside the retry loop. Another participant may have completed
    // the visit while this request was waiting for the database lock.
    outgoingDoc = await prepareEventDocForSave(doc, options);

    try {
      data = await graphqlRequest(SAVE_EVENT_MUTATION, {
        doc: serializeEventDoc(outgoingDoc),
      });
      break;
    } catch (error) {
      const elapsedMs = Date.now() - startedAt;
      const withinTimeBudget = elapsedMs < SAVE_RETRY_TIME_BUDGET_MS;
      const canRetry =
        isDatabaseContentionError(error) &&
        attempt < EVENT_SAVE_RETRY_DELAYS_MS.length &&
        withinTimeBudget;

      if (!canRetry) {
        if (isDatabaseContentionError(error)) {
          // Nothing retries this in the background any more, so the message must
          // not promise that it will. The user is the retry now, and the form is
          // still open in front of them.
          //
          // If we spent minutes on this, the lock was not a passing collision
          // between two users — something on the server is holding the row and
          // pressing Save again will just queue behind it.
          const heldForSeconds = Math.round(elapsedMs / 1000);

          throw new Error(
            heldForSeconds >= 30
              ? `ERP kept this event locked for ${heldForSeconds}s across ${attempt + 1} attempts and it was not saved. Something on the server is holding it — report this rather than retrying.`
              : "ERP was busy with this event and the save did not go through. Press Save again.",
            { cause: error }
          );
        }

        throw error;
      }

      const nextDelayMs = withJitter(EVENT_SAVE_RETRY_DELAYS_MS[attempt]);

      // Tell the caller before sleeping. A blocked attempt has already cost the
      // server's whole lock timeout, so without this the UI sits silent and
      // locked for minutes and reads as a hung app.
      options.onContention?.({
        attempt: attempt + 1,
        maxAttempts: EVENT_SAVE_RETRY_DELAYS_MS.length + 1,
        elapsedMs,
        nextDelayMs,
      });

      await waitForRetry(nextDelayMs);
    }
  }

  if (!data?.saveDoc?.doc?.name) {
    throw new Error("ERP did not return Event name");
  }
  // invalidate cache only after successful write
  invalidateCalendarData({ broadcast: false, reason: "event:save" });

  // Only events that actually want Google Calendar sync (google_calendar set
  // by mapFormToErpEvent) need the nudge — everything else can just wait for
  // nothing, since sync_with_google_calendar is always 0 on the wire now.
  if (outgoingDoc.google_calendar) {
    void enqueueGoogleCalendarSync(data.saveDoc.doc.name);
  }

  // Only events that actually want Google Calendar sync (google_calendar set
  // by mapFormToErpEvent) need the nudge — everything else can just wait for
  // nothing, since sync_with_google_calendar is always 0 on the wire now.
  if (outgoingDoc.google_calendar) {
    void enqueueGoogleCalendarSync(data.saveDoc.doc.name);
  }

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
      try {
        await syncEventDocShares(
          data.saveDoc.doc.name,
          options.shareWithUserIds,
          shareOptions
        );
      } catch (error) {
        // The Event transaction has already committed. Reporting the whole
        // queue item as failed here makes a successful create look local-only
        // and can cause a duplicate create on retry. Sharing is independent
        // follow-up work, so record its failure without undoing Event success.
        console.error(
          `DocShare sync failed after Event:${data.saveDoc.doc.name} was saved`,
          error
        );
        // Re-read existing shares on the retry. Some recipients may already
        // have been saved before the failure, and creating them twice would
        // produce duplicate permission rows.
        void enqueueDocShareSync(
          "Event",
          data.saveDoc.doc.name,
          options.shareWithUserIds,
          { ...shareOptions, skipExistingCheck: false }
        );
      }
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
/**
 * Save only the POB of a visit.
 *
 * POB is captured and corrected long after the call, on visits that are already
 * marked, so this must not touch anything else about the event: no participants,
 * no attendance or visit time, no dates, no status, no location. ERP's `saveDoc`
 * merges the fields it is given (the same partial-write `joinDoctorVisit` relies
 * on), so the document carries the POB flag and the quotation link and nothing
 * more.
 */
export async function saveVisitPob({ erpName, pobGiven, quotationDoc }) {
  if (!erpName) throw new Error("Missing event to save POB against");

  let quotationFields = {};

  if (quotationDoc) {
    const savedQuotation = await saveDocToQuotation(quotationDoc);

    if (savedQuotation?.name) {
      quotationFields = {
        reference_doctype: "Quotation",
        reference_docname: savedQuotation.name,
      };
    }
  }

  const savedEvent = await saveEvent({
    name: erpName,
    [ERP_EVENT_FIELDS.pobGivenWrite]: Number(pobGiven) === 1 ? 1 : 0,
    ...quotationFields,
  });

  return {
    name: savedEvent.name,
    ...quotationFields,
  };
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
  const {
    force = false,
    includeLeaves = true,
    includeTodos = true,
    includeTravelRequests = true,
  } = options;
  const cacheKey = `${buildRangeCacheKey(view, startDate, endDate)}:${
    includeLeaves ? "L" : "-"
  }${includeTodos ? "T" : "-"}${includeTravelRequests ? "R" : "-"}`;

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
    { includeLeaves, includeTodos, includeTravelRequests }
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
//
// THE RANGE IS READ IN WEEK-SIZED SLICES, A FEW AT A TIME. It used to be one
// request for everything starting on or before the range's END -- no lower
// bound -- trimmed to the range afterwards, and capped at 8,000 rows. That
// read all of history to show one month, and once a manager can see their
// team's Doctor Visit plans (about 9,000 a month for an SM, measured on
// 28 Sep 2026) the cap cut visits from every view. A slice holds one week:
// a few hundred rows for a rep, a few thousand for a manager.
const INITIAL_EVENT_WINDOW = 2000;
const MAX_EVENT_WINDOW = 20000;
const SLICE_DAYS = 7;
const SLICE_CONCURRENCY = 3;
// Multi-day events (leave, tours) that began before the range but run into
// it: looked up separately, from this far back, with an ends_on bound.
const CARRY_IN_DAYS = 45;
const DAY_MS = 86400000;

// THE CALENDAR READS ITS EVENTS FROM THE `calendar_events` SERVER SCRIPT
// (erp/server-scripts/calendar_events.py). The GraphQL Events list reads every
// event in the range and runs Event's permission check on each one, plus a
// COUNT(*) over the same rows — at ~50k events a month that is ~12k rows per
// request for every user, and it is what saturated the database under load. The
// script finds the user's own / participant / public / shared events from
// indexes and lets Frappe check permissions on just those, and answers with the
// same node shape as EVENTS_BY_RANGE_QUERY, so nothing downstream changes.
// A site without the script (it answers 417 "Failed to get method") keeps the
// GraphQL path for the rest of the session; any other failure falls back once.
let calendarEventsScriptMissing = false;

async function fetchEventWindowFromScript(filter) {
  const { authToken } = AUTH_CONFIG;
  if (!authToken) throw new Error("Missing ERP auth configuration");

  let windowSize = INITIAL_EVENT_WINDOW;

  while (true) {
    const response = await fetch(`${getErpBaseUrl()}/api/method/calendar_events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `token ${authToken}`,
      },
      body: JSON.stringify({ filters: filter, first: windowSize }),
    });
    const json = await response.json().catch(() => null);

    if (!response.ok) {
      const error = new Error(json?.exception || `HTTP ${response.status}`);
      error.scriptMissing = /Failed to get method/i.test(String(json?.exception ?? ""));
      throw error;
    }

    const answer = json?.message;
    if (!Array.isArray(answer?.events)) throw new Error("calendar_events reply carried no events");
    if (!answer.has_more) return answer.events;

    if (windowSize >= MAX_EVENT_WINDOW) {
      console.warn(
        `Event fetch truncated at ${MAX_EVENT_WINDOW} rows in one week — some events are not being shown.`
      );
      return answer.events;
    }

    windowSize = Math.min(windowSize * 2, MAX_EVENT_WINDOW);
  }
}

async function fetchEventWindow(filter) {
  if (!calendarEventsScriptMissing) {
    try {
      return await fetchEventWindowFromScript(filter);
    } catch (error) {
      if (error.scriptMissing) calendarEventsScriptMissing = true;
      console.warn("calendar_events Server Script unavailable — reading events through GraphQL.", error);
    }
  }

  return fetchEventWindowFromGraphql(filter);
}

async function fetchEventWindowFromGraphql(filter) {
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

    // No `Events` in the reply is not "no events": it is another request's
    // answer or ERP's intermittent empty reply. Returning [] here blanked a
    // whole week with no error, so let the caller retry.
    if (!connection?.edges) {
      if (nodes) return nodes;
      throw new Error("ERP reply carried no Events");
    }

    nodes = connection.edges.map((edge) => edge.node);

    if (!connection.pageInfo?.hasNextPage) return nodes;

    if (windowSize >= MAX_EVENT_WINDOW) {
      console.warn(
        `Event fetch truncated at ${MAX_EVENT_WINDOW} rows in one week — some events are not being shown.`
      );
      return nodes;
    }

    windowSize = Math.min(windowSize * 2, MAX_EVENT_WINDOW);
  }
}

/* One slice, checked: this ERP can hand one request another request's answer
   when several are in flight (see the Support Report's note on it), so every
   event must start inside the slice it was asked for, or the slice is asked
   again. */
const SLICE_ATTEMPTS = 4;

async function fetchEventSlice(from, to, attempt = 1) {
  let nodes;
  let problem = null;

  try {
    nodes = await fetchEventWindow([
      { fieldname: "starts_on", operator: "GTE", value: from.toISOString() },
      { fieldname: "starts_on", operator: "LTE", value: to.toISOString() },
    ]);
    const foreign = nodes.some((node) => {
      const start = parseErpDateValue(node?.starts_on);
      return start && (start < new Date(from.getTime() - DAY_MS) || start > new Date(to.getTime() + DAY_MS));
    });
    if (foreign) problem = new Error("ERP answered this slice with another request's events");
  } catch (error) {
    problem = error;
  }

  if (!problem) return nodes;

  if (attempt < SLICE_ATTEMPTS) {
    await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
    return fetchEventSlice(from, to, attempt + 1);
  }

  // Fail the load rather than show a week that is silently empty or holds
  // the wrong rows: reloadEvents leaves the calendar's current events in
  // place when this throws.
  throw problem;
}

async function inPool(items, limit, run) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await run(items[i]);
      }
    })
  );
  return out;
}

// Slicing is for the bounded views (day/week/month, and the year Sync at 53
// slices). The agenda view asks for 2025-01-01..2100-12-31 — about 3,960
// weeks — so a range that long is read as one window instead.
const MAX_SLICED_RANGE_DAYS = 400;

async function fetchRawEventNodes(startDate, endDate) {
  const slices = [];
  if ((endDate.getTime() - startDate.getTime()) / DAY_MS > MAX_SLICED_RANGE_DAYS) {
    slices.push([startDate, endDate]);
  } else {
    for (let t = startDate.getTime(); t <= endDate.getTime(); t += SLICE_DAYS * DAY_MS) {
      const to = Math.min(t + SLICE_DAYS * DAY_MS - 1000, endDate.getTime());
      slices.push([new Date(t), new Date(to)]);
    }
  }

  const carryIn = fetchEventWindow([
    { fieldname: "starts_on", operator: "GTE", value: new Date(startDate.getTime() - CARRY_IN_DAYS * DAY_MS).toISOString() },
    { fieldname: "starts_on", operator: "LT", value: startDate.toISOString() },
    { fieldname: "ends_on", operator: "GTE", value: startDate.toISOString() },
  ]).catch((error) => {
    // Only multi-day events that began earlier ride on this; the range itself
    // does not depend on it.
    console.warn("Could not read events carried into this range", error);
    return [];
  });

  const [parts, carried] = await Promise.all([
    inPool(slices, SLICE_CONCURRENCY, ([from, to]) => fetchEventSlice(from, to)),
    carryIn,
  ]);

  // A slice boundary and the carry-in can both return one event.
  const byName = new Map();
  for (const node of [...carried, ...parts.flat()]) {
    byName.set(node?.name ?? `${byName.size}`, node);
  }
  return [...byName.values()];
}

async function fetchEventsByRangeUncached(
  cacheKey,
  startDate,
  endDate,
  generation,
  {
    includeLeaves = true,
    includeTodos = true,
    includeTravelRequests = true,
  } = {}
) {
  // --------------------------------------------
  // 1️⃣ FETCH RAW EVENT NODES (NO MAPPING YET)
  // --------------------------------------------
  let rawEventNodes = (await fetchRawEventNodes(startDate, endDate)).filter((node) =>
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
    travelRequestsResult,
  ] = await Promise.allSettled([
    fetchQuotationsByNames(uniqueQuotationNames),
    // Two queries per calendar load that are pure waste while these types are
    // switched off (see DISABLED_TAG_IDS) — they'd be filtered out on arrival.
    includeLeaves ? fetchAllLeaveApplications() : [],
    // Travel Request also needs the GM's approval ToDos, even with Todo off.
    includeTodos || includeTravelRequests ? fetchAllTodoList() : [],
    fetchDocShareNamesForUser(LOGGED_IN_USER.email),
    includeTravelRequests ? fetchAllTravelRequests() : [],
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
      ? todoResult.value.filter(
          (todo) => includeTodos || isTravelApprovalTodo(todo)
        )
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

  if (travelRequestsResult.status === "rejected") {
    console.error(
      "Failed to fetch travel requests",
      travelRequestsResult.reason
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
      // Without the customer the POB cannot be edited without re-picking it,
      // and the quotation would be revised against a blank party.
      node.customer = quotation.party_name__name ?? null;
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
  // Travel requests are their own doctype (never Events): keep the ones that
  // depart inside this range.
  const travelRequests =
    travelRequestsResult.status === "fulfilled"
      ? travelRequestsResult.value.filter((request) => {
          const departure = new Date(request.startDate);
          return departure >= startDate && departure <= endDate;
        })
      : [];
  const merged = [...events, ...leaves, ...todolist, ...travelRequests];
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
    invalidateCalendarData({ broadcast: false, reason: "event:delete" });
    return true;

  } catch (error) {
    const message = error?.message || "";

    // ✅ ERP already deleted → treat as success
    if (
      message.includes("not found") ||
      message.includes("does not exist") ||
      message.includes("Missing document")
    ) {
      invalidateCalendarData({ broadcast: false, reason: "event:delete" });
      return true;
    }

    // ❌ real error
    throw error;
  }
}


export function formatDateForERP(date) {
  return format(date, "yyyy-MM-dd");
}
