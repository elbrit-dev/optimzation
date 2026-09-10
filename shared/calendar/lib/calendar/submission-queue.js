"use client";

import {
  deleteEventFromErp,
  saveEvent,
  saveDocToQuotation,
} from "@calendar/components/calendar/module/event/services/event.service";
import { saveLeaveApplication, updateLeaveAttachment } from "@calendar/components/calendar/module/leave/services/leave.service";
import { saveDocToErp } from "@calendar/components/calendar/module/todo/services/todo.service";
import { syncDocShares } from "@calendar/components/calendar/module/event/services/docshare.service";
import { uploadLeaveMedicalCertificate } from "@calendar/lib/file.service";

const STORAGE_KEY = "calendar-submission-queue:v1";
const QUEUE_EVENT = "calendar-submission-queue:changed";
const LOCK_KEY = "calendar-submission-queue:v1:lock";

// An ERP write that has not settled within this window is treated as abandoned
// (the tab that owned it was closed or crashed). Anything newer is assumed to
// still be in flight somewhere and must not be re-sent: these writes are
// non-idempotent creates, so a second send produces a duplicate document.
const LOCK_TTL_MS = 60_000;

const listeners = new Set();
let isProcessing = false;

// Identifies this browsing context (tab / iframe). `isProcessing` only guards
// re-entry within one context; the queue lives in localStorage and is shared by
// every same-origin context, so the lock below is what actually serialises them.
const PROCESSOR_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

function isBrowser() {
  return typeof window !== "undefined";
}

function readLock() {
  if (!isBrowser()) return null;
  return safeJsonParse(window.localStorage.getItem(LOCK_KEY), null);
}

// localStorage has no compare-and-swap, so claim the lock and then read it back:
// if two contexts race, the last write wins and the other sees a foreign owner
// and backs off.
function acquireProcessingLock() {
  if (!isBrowser()) return false;

  const existing = readLock();
  const now = Date.now();

  if (
    existing &&
    existing.owner !== PROCESSOR_ID &&
    Number(existing.expiresAt) > now
  ) {
    return false;
  }

  window.localStorage.setItem(
    LOCK_KEY,
    JSON.stringify({ owner: PROCESSOR_ID, expiresAt: now + LOCK_TTL_MS })
  );

  return readLock()?.owner === PROCESSOR_ID;
}

function renewProcessingLock() {
  if (!isBrowser()) return;

  const existing = readLock();
  if (existing && existing.owner !== PROCESSOR_ID) return;

  window.localStorage.setItem(
    LOCK_KEY,
    JSON.stringify({
      owner: PROCESSOR_ID,
      expiresAt: Date.now() + LOCK_TTL_MS,
    })
  );
}

function releaseProcessingLock() {
  if (!isBrowser()) return;
  if (readLock()?.owner === PROCESSOR_ID) {
    window.localStorage.removeItem(LOCK_KEY);
  }
}

// True while another context may still be waiting on this item's ERP response.
function isSyncInFlight(item) {
  const startedAt = Date.parse(item?.syncStartedAt ?? "");
  return Number.isFinite(startedAt) && startedAt > Date.now() - LOCK_TTL_MS;
}

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function readQueue() {
  if (!isBrowser()) return [];
  const parsed = safeJsonParse(
    window.localStorage.getItem(STORAGE_KEY),
    []
  );

  return Array.isArray(parsed) ? parsed : [];
}

function normalizeQueueForStartup(queue) {
  let mutated = false;

  const normalizedQueue = queue
    .flatMap((item) => {
      if (item.status === "pending") {
        return [item];
      }

      if (item.status === "failed") {
        return [item];
      }

      if (item.status === "syncing") {
        // A tab mounting must not reclaim a write another tab is still waiting
        // on - that re-sends the create and duplicates the ERP document.
        if (isSyncInFlight(item)) {
          return [item];
        }

        mutated = true;
        return [
          {
            ...item,
            status: "pending",
            error: null,
          },
        ];
      }

      mutated = true;
      return [];
    });

  return {
    mutated,
    queue: normalizedQueue,
  };
}

function isDeleteAlreadyCompletedError(error) {
  const message = String(error?.message ?? "").toLowerCase();

  return (
    message.includes("does not exist") ||
    message.includes("not found") ||
    message.includes("no document") ||
    message.includes("unable to find") ||
    message.includes("cannot find")
  );
}

function resetStaleSyncingItems(queue) {
  let mutated = false;

  const normalizedQueue = queue.map((item) => {
    // Despite the name this used to reset *every* syncing item, including ones
    // still awaiting a response, which is how one submit became several ERP
    // documents. Only reclaim writes whose owner is gone.
    if (item.status === "syncing" && !isSyncInFlight(item)) {
      mutated = true;

      return {
        ...item,
        status: "pending",
      };
    }

    return item;
  });

  if (mutated) {
    writeQueue(normalizedQueue);
  }

  return normalizedQueue;
}

function writeQueue(queue) {
  if (!isBrowser()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  listeners.forEach((listener) => listener(queue));
  window.dispatchEvent(new CustomEvent(QUEUE_EVENT, { detail: queue }));
}

function createQueueId(prefix = "submission") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

async function serializeAttachment(file) {
  if (!file) return null;
  if (typeof file === "string") {
    return {
      kind: "existing",
      fileUrl: file,
    };
  }

  return {
    kind: "file",
    name: file.name,
    type: file.type,
    size: file.size,
    dataUrl: await fileToDataUrl(file),
  };
}

async function restoreAttachment(serializedAttachment) {
  if (!serializedAttachment || serializedAttachment.kind !== "file") {
    return null;
  }

  const response = await fetch(serializedAttachment.dataUrl);
  const blob = await response.blob();

  return new File([blob], serializedAttachment.name, {
    type: serializedAttachment.type,
  });
}

function decorateOptimisticEvent(optimisticEvent, queueItem) {
  return {
    ...optimisticEvent,
    __localQueueId: queueItem.id,
    __syncStatus: queueItem.status,
    __syncError: queueItem.error ?? null,
    __queueKind: queueItem.kind,
    __pendingDelete: queueItem.kind === "delete",
  };
}

function normalizeQueueItem(queueItem) {
  return {
    ...queueItem,
    optimisticEvent: decorateOptimisticEvent(
      queueItem.optimisticEvent,
      queueItem
    ),
  };
}

export function getSubmissionQueue() {
  return readQueue().map(normalizeQueueItem);
}

export function pruneSubmissionQueueOnStartup() {
  const currentQueue = readQueue();
  const { mutated, queue } = normalizeQueueForStartup(currentQueue);

  if (mutated) {
    writeQueue(queue);
  }

  return queue.map(normalizeQueueItem);
}

export function subscribeSubmissionQueue(listener) {
  if (!isBrowser()) {
    return () => {};
  }

  const wrappedListener = (queue = readQueue()) => {
    listener(queue.map(normalizeQueueItem));
  };

  listeners.add(wrappedListener);

  const handleStorage = (browserEvent) => {
    if (browserEvent.key && browserEvent.key !== STORAGE_KEY) return;
    wrappedListener(readQueue());
  };

  const handleCustomEvent = (browserEvent) => {
    wrappedListener(browserEvent.detail ?? readQueue());
  };

  window.addEventListener("storage", handleStorage);
  window.addEventListener(QUEUE_EVENT, handleCustomEvent);

  return () => {
    listeners.delete(wrappedListener);
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(QUEUE_EVENT, handleCustomEvent);
  };
}

export function mergeServerEventsWithQueuedEvents(serverEvents = [], queueItems = []) {
  if (!queueItems.length) {
    return serverEvents;
  }

  const queuedEvents = queueItems
    .filter(
      (item) =>
        item.status !== "synced" &&
        item.kind !== "delete" &&
        // Permission work on an event ERP already has: no optimistic event of
        // its own to merge into the calendar.
        item.kind !== "share" &&
        !(item.status === "failed" && item.targetErpName)
    )
    .map((item) => item.optimisticEvent)
    .filter(Boolean);

  const overriddenIds = new Set();
  const deletingIds = new Set();

  queueItems.forEach((item) => {
    // A failed update must reveal the last state ERP actually confirmed. Keep
    // the failed queue item for retry and attach its error to the server event
    // below, but do not let its optimistic fields replace ERP truth.
    const isFailedExistingWrite =
      item.status === "failed" && Boolean(item.targetErpName);
    if (item.targetErpName && !isFailedExistingWrite) {
      overriddenIds.add(item.targetErpName);
    }
    if (
      !isFailedExistingWrite &&
      item.optimisticEvent?.erpName &&
      !String(item.optimisticEvent.erpName).startsWith("local-")
    ) {
      overriddenIds.add(item.optimisticEvent.erpName);
    }

    if (
      item.kind === "delete" &&
      item.status !== "failed"
    ) {
      const deletingId =
        item.targetErpName ??
        item.optimisticEvent?.erpName;

      if (deletingId) {
        deletingIds.add(deletingId);
      }
    }
  });

  const failedWritesByErpName = new Map(
    queueItems
      .filter((item) => item.status === "failed" && item.targetErpName)
      .map((item) => [String(item.targetErpName), item])
  );
  const filteredServerEvents = serverEvents
    .filter(
      (event) =>
        !overriddenIds.has(event.erpName) &&
        !deletingIds.has(event.erpName)
    )
    .map((event) => {
      const failedItem = failedWritesByErpName.get(String(event.erpName));
      return failedItem ? decorateOptimisticEvent(event, failedItem) : event;
    });

  return [...filteredServerEvents, ...queuedEvents];
}

export async function enqueueSubmission(submission) {
  const currentQueue = readQueue();
  const replaceIndex = currentQueue.findIndex((item) => {
    if (submission.replaceQueueId && item.id === submission.replaceQueueId) {
      return true;
    }

    // A share item lives alongside the event write for the same document. The
    // erpName/targetErpName matching below would have one replace the other,
    // dropping either the save or the share.
    if (submission.kind === "share" || item.kind === "share") {
      return (
        submission.kind === item.kind &&
        submission.payload?.documentName === item.payload?.documentName
      );
    }

    if (
      submission.optimisticEvent?.erpName &&
      item.optimisticEvent?.erpName === submission.optimisticEvent.erpName
    ) {
      return true;
    }

    if (
      submission.targetErpName &&
      item.targetErpName === submission.targetErpName
    ) {
      return true;
    }

    return false;
  });

  const queueItem = {
    id:
      replaceIndex >= 0
        ? currentQueue[replaceIndex].id
        : createQueueId(submission.kind),
    createdAt: new Date().toISOString(),
    status: "pending",
    retryCount: 0,
    error: null,
    ...submission,
  };

  if (queueItem.kind === "leave") {
    queueItem.payload = {
      ...queueItem.payload,
      medicalAttachment:
        await serializeAttachment(queueItem.payload?.medicalAttachment),
    };
  }

  const nextQueue =
    replaceIndex >= 0
      ? currentQueue.map((item, index) =>
          index === replaceIndex ? queueItem : item
        )
      : [...currentQueue, queueItem];
  writeQueue(nextQueue);

  return normalizeQueueItem(queueItem);
}

export function discardQueuedSubmission(match = {}) {
  const currentQueue = readQueue();
  const nextQueue = currentQueue.filter((item) => {
    if (match.queueId && item.id === match.queueId) {
      return false;
    }

    if (match.erpName) {
      if (item.targetErpName === match.erpName) {
        return false;
      }

      if (item.optimisticEvent?.erpName === match.erpName) {
        return false;
      }
    }

    return true;
  });

  writeQueue(nextQueue);
}

// Hitting Retry Sync means "now", so the backoff marker is dropped too.
export function requeueFailedSubmissions() {
  const currentQueue = readQueue();
  let mutated = false;

  const nextQueue = currentQueue.map((item) => {
    // Failed items go back in the queue with a fresh attempt budget, and items
    // merely waiting out their backoff become due immediately: the user asked
    // for this to happen now.
    if (item.status === "failed") {
      mutated = true;
      return {
        ...item,
        status: "pending",
        retryCount: 0,
        nextAttemptAt: null,
        error: null,
      };
    }

    if (item.status === "pending" && item.nextAttemptAt) {
      mutated = true;
      return {
        ...item,
        nextAttemptAt: null,
      };
    }

    return item;
  });

  if (mutated) {
    writeQueue(nextQueue);
  }

  return nextQueue.map(normalizeQueueItem);
}

export async function enqueueDeletion({ event, docname }) {
  if (!event) {
    throw new Error("Missing event for delete queue");
  }

  const queueItem = {
    id: createQueueId("delete"),
    createdAt: new Date().toISOString(),
    status: "pending",
    retryCount: 0,
    error: null,
    kind: "delete",
    targetErpName: event.erpName ?? null,
    optimisticEvent: {
      ...event,
      __deletedDocType: docname ?? "Event",
    },
    payload: {
      docname: docname ?? "Event",
    },
  };

  const nextQueue = [...readQueue(), queueItem];
  writeQueue(nextQueue);

  return normalizeQueueItem(queueItem);
}

function updateQueueItem(queueId, updater) {
  const currentQueue = readQueue();
  const nextQueue = currentQueue.map((item) =>
    item.id === queueId ? updater(item) : item
  );
  writeQueue(nextQueue);
  return nextQueue.find((item) => item.id === queueId) ?? null;
}

function removeQueueItem(queueId) {
  const currentQueue = readQueue();
  const nextQueue = currentQueue.filter((item) => item.id !== queueId);
  writeQueue(nextQueue);
}

function buildSyncedCalendarEvent(queueItem, savedName, patch = {}) {
  return {
    ...queueItem.optimisticEvent,
    ...patch,
    erpName: savedName,
    id: savedName,
    __localQueueId: undefined,
    __syncStatus: undefined,
    __syncError: undefined,
  };
}

async function processEventSubmission(queueItem) {
  const { erpDoc, quotationDoc, saveOptions } = queueItem.payload;
  let workingDoc = {
    ...erpDoc,
  };

  if (quotationDoc) {
    const savedQuotation = await saveDocToQuotation(quotationDoc);
    if (savedQuotation?.name) {
      workingDoc.reference_doctype = "Quotation";
      workingDoc.reference_docname = savedQuotation.name;
    }
  }

  // Sharing is handed to the queue instead of being fired and forgotten inside
  // saveEvent, so it gets the same persistence and backoff as the save itself.
  const { shareWithUserIds, ...saveOptionsWithoutShares } = saveOptions ?? {};
  const savedEvent = await saveEvent(workingDoc, saveOptionsWithoutShares);

  if (shareWithUserIds?.length) {
    await enqueueSubmission({
      kind: "share",
      payload: {
        doctype: "Event",
        documentName: savedEvent.name,
        userIds: shareWithUserIds,
      },
    });
  }

  return {
    name: savedEvent.name,
    calendarEvent: buildSyncedCalendarEvent(queueItem, savedEvent.name, {
      reference_doctype: workingDoc.reference_doctype
        ? { name: workingDoc.reference_doctype }
        : queueItem.optimisticEvent.reference_doctype,
      reference_docname:
        workingDoc.reference_docname ??
        queueItem.optimisticEvent.reference_docname,
    }),
  };
}

async function processLeaveSubmission(queueItem, runtime) {
  const { leaveDoc, saveOptions, medicalAttachment } = queueItem.payload;
  const payload = {
    ...leaveDoc,
  };

  delete payload.custom_attachement;

  const savedLeave = await saveLeaveApplication(payload, saveOptions);

  let uploadedFileUrl = null;
  const restoredFile = await restoreAttachment(medicalAttachment);

  if (restoredFile) {
    const uploadResult = await uploadLeaveMedicalCertificate(
      {
        medicalAttachment: restoredFile,
      },
      savedLeave.name,
      runtime.erpUrl,
      runtime.authToken
    );

    if (uploadResult?.fileUrl) {
      await updateLeaveAttachment(savedLeave.name, uploadResult.fileUrl);
      uploadedFileUrl = uploadResult.fileUrl;
    }
  } else if (medicalAttachment?.kind === "existing") {
    uploadedFileUrl = medicalAttachment.fileUrl;
  }

  return {
    name: savedLeave.name,
    calendarEvent: buildSyncedCalendarEvent(
      queueItem,
      savedLeave.name,
      uploadedFileUrl
        ? {
            medicalAttachment: uploadedFileUrl,
          }
        : {}
    ),
  };
}

async function processTodoSubmission(queueItem) {
  const { todoDoc, saveOptions } = queueItem.payload;
  const savedTodo = await saveDocToErp(todoDoc, saveOptions);

  return {
    name: savedTodo.name,
    calendarEvent: buildSyncedCalendarEvent(queueItem, savedTodo.name),
  };
}

async function processDeleteSubmission(queueItem) {
  const targetName =
    queueItem.targetErpName ?? queueItem.optimisticEvent?.erpName;

  if (!targetName || String(targetName).startsWith("local-")) {
    return {
      removed: true,
      name: targetName,
    };
  }

  try {
    await deleteEventFromErp(
      targetName,
      queueItem.payload?.docname
    );
  } catch (error) {
    if (isDeleteAlreadyCompletedError(error)) {
      return {
        removed: true,
        name: targetName,
      };
    }

    throw error;
  }

  return {
    removed: true,
    name: targetName,
  };
}

async function processQueueItem(queueItem, runtime) {
  switch (queueItem.kind) {
    case "event":
      return processEventSubmission(queueItem);
    case "share":
      return processShareSubmission(queueItem);
    case "leave":
      return processLeaveSubmission(queueItem, runtime);
    case "todo":
      return processTodoSubmission(queueItem);
    case "delete":
      return processDeleteSubmission(queueItem);
    default:
      throw new Error(`Unsupported queue item kind: ${queueItem.kind}`);
  }
}

/**
 * Sharing an event with the people who must see it.
 *
 * Its own queue item, rather than fire-and-forget work after the save, so it
 * survives a failed request, a closed tab or a reload. Fired and forgotten, a
 * share that failed was lost with nothing but a console line, and somebody had
 * to re-share the visit by hand. Kept separate from the event item because the
 * event is already safely in ERP: a share needing another attempt must never
 * make the calendar re-save the event.
 */
async function processShareSubmission(queueItem) {
  const { doctype, documentName, userIds } = queueItem.payload;

  await syncDocShares(doctype, documentName, userIds, {
    // Always re-check on an attempt: a previous try may have written some of
    // the shares before failing, and rewriting those is wasted work against a
    // document that is already contended.
    skipExistingCheck: false,
  });

  return { name: documentName, shareOnly: true };
}

/**
 * Backoff between automatic retries.
 *
 * The drain effect re-runs whenever the queue changes, so an item left pending
 * would be retried the instant it was written back — a hot loop against an ERP
 * that is already contended. `nextAttemptAt` is what makes a retry wait, and
 * the attempt cap is what stops an item retrying forever instead of surfacing.
 */
const RETRY_BACKOFF_MS = [2000, 6000, 20000, 60000, 180000];
const MAX_AUTOMATIC_ATTEMPTS = RETRY_BACKOFF_MS.length;

function resolveRetryDelayMs(retryCount) {
  const index = Math.min(
    Math.max(retryCount - 1, 0),
    RETRY_BACKOFF_MS.length - 1
  );
  const base = RETRY_BACKOFF_MS[index];

  // Jittered: the contending writers are other clients running this same code.
  return Math.round(base * (0.7 + Math.random() * 0.6));
}

function isDueForAttempt(item, now = Date.now()) {
  if (!item.nextAttemptAt) return true;

  const dueAt = Date.parse(item.nextAttemptAt);
  return Number.isNaN(dueAt) || dueAt <= now;
}

/**
 * Milliseconds until the earliest deferred item is due, or null when nothing is
 * waiting. Callers use it to schedule the next drain — without a timer a
 * deferred item would sit until the queue happens to change again.
 */
export function getNextQueueAttemptDelayMs() {
  const now = Date.now();

  const dueTimes = readQueue()
    .filter((item) => item.status === "pending" && item.nextAttemptAt)
    .map((item) => Date.parse(item.nextAttemptAt))
    .filter((dueAt) => !Number.isNaN(dueAt) && dueAt > now);

  if (!dueTimes.length) return null;

  return Math.max(Math.min(...dueTimes) - now, 0);
}

function isRetryableError(error) {
  const message = String(error?.message ?? "").toLowerCase();
  return (
    !navigator.onLine ||
    message.includes("failed to fetch") ||
    message.includes("networkerror") ||
    message.includes("network request failed") ||
    // Database contention: another writer held the Event while this save ran.
    // Nothing is wrong with the payload, so parking it as "Sync Failed" for the
    // user to retry by hand is wrong — it just needs another attempt later.
    message.includes("erp is busy") ||
    message.includes("lock wait timeout") ||
    message.includes("deadlock found") ||
    message.includes("has been modified after you have opened it")
  );
}

export async function processSubmissionQueue(runtime = {}) {
  if (!isBrowser() || isProcessing) {
    return { processedCount: 0 };
  }

  // Another tab / iframe on this origin is already draining the queue.
  if (!acquireProcessingLock()) {
    return { processedCount: 0 };
  }

  isProcessing = true;
  let processedCount = 0;

  try {
    resetStaleSyncingItems(readQueue());

    while (true) {
      renewProcessingLock();

      const queue = readQueue();
      const nextItem = queue.find(
        (item) => item.status === "pending" && isDueForAttempt(item)
      );

      if (!nextItem) {
        break;
      }

      updateQueueItem(nextItem.id, (item) => ({
        ...item,
        status: "syncing",
        syncStartedAt: new Date().toISOString(),
        nextAttemptAt: null,
        error: null,
      }));

      // A MySQL lock wait can keep the request open close to the lock TTL.
      // Renew while awaiting ERP so another tab cannot reclaim and resend the
      // same queue item in the middle of a legitimate in-flight request.
      const lockHeartbeatId = window.setInterval(
        renewProcessingLock,
        Math.floor(LOCK_TTL_MS / 3)
      );

      try {
        const result = await processQueueItem(nextItem, runtime);
        processedCount += 1;
        removeQueueItem(nextItem.id);
        await runtime.onSuccess?.(normalizeQueueItem(nextItem), result);
      } catch (error) {
        const retryCount = (nextItem.retryCount ?? 0) + 1;
        // Offline is not an attempt against a budget — the queue simply waits
        // for the network, so it must not burn through the cap.
        const isOffline =
          typeof navigator !== "undefined" && !navigator.onLine;
        const shouldRetry =
          isRetryableError(error) &&
          (isOffline || retryCount < MAX_AUTOMATIC_ATTEMPTS);

        updateQueueItem(nextItem.id, (item) => ({
          ...item,
          status: shouldRetry ? "pending" : "failed",
          retryCount,
          nextAttemptAt: shouldRetry
            ? new Date(Date.now() + resolveRetryDelayMs(retryCount)).toISOString()
            : null,
          error: error?.message ?? "Sync failed",
        }));

        await runtime.onError?.(normalizeQueueItem(nextItem), error, {
          retryable: shouldRetry,
        });

        if (shouldRetry) {
          break;
        }
      } finally {
        window.clearInterval(lockHeartbeatId);
      }
    }
  } finally {
    isProcessing = false;
    releaseProcessingLock();
  }

  return { processedCount };
}
