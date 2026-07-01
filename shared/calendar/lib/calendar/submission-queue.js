"use client";

import {
  deleteEventFromErp,
  saveEvent,
  saveDocToQuotation,
} from "@calendar/components/calendar/module/event/services/event.service";
import { saveLeaveApplication, updateLeaveAttachment } from "@calendar/components/calendar/module/leave/services/leave.service";
import { saveDocToErp } from "@calendar/components/calendar/module/todo/services/todo.service";
import { uploadLeaveMedicalCertificate } from "@calendar/lib/file.service";

const STORAGE_KEY = "calendar-submission-queue:v1";
const QUEUE_EVENT = "calendar-submission-queue:changed";

const listeners = new Set();
let isProcessing = false;

function isBrowser() {
  return typeof window !== "undefined";
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

      if (item.status === "syncing") {
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
    if (item.status === "syncing") {
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
    .filter((item) => item.status !== "synced")
    .map((item) => item.optimisticEvent)
    .filter(Boolean);

  if (!queuedEvents.length) {
    return serverEvents;
  }

  const overriddenIds = new Set();

  queueItems.forEach((item) => {
    if (item.targetErpName) overriddenIds.add(item.targetErpName);
    if (item.optimisticEvent?.erpName && !String(item.optimisticEvent.erpName).startsWith("local-")) {
      overriddenIds.add(item.optimisticEvent.erpName);
    }
  });

  const filteredServerEvents = serverEvents.filter(
    (event) => !overriddenIds.has(event.erpName)
  );

  return [...filteredServerEvents, ...queuedEvents];
}

export async function enqueueSubmission(submission) {
  const currentQueue = readQueue();
  const replaceIndex = currentQueue.findIndex((item) => {
    if (submission.replaceQueueId && item.id === submission.replaceQueueId) {
      return true;
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

  const savedEvent = await saveEvent(workingDoc, saveOptions);

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

function isRetryableError(error) {
  const message = String(error?.message ?? "").toLowerCase();
  return (
    !navigator.onLine ||
    message.includes("failed to fetch") ||
    message.includes("networkerror") ||
    message.includes("network request failed")
  );
}

export async function processSubmissionQueue(runtime = {}) {
  if (!isBrowser() || isProcessing) {
    return { processedCount: 0 };
  }

  isProcessing = true;
  let processedCount = 0;

  try {
    resetStaleSyncingItems(readQueue());

    while (true) {
      const queue = readQueue();
      const nextItem = queue.find(
        (item) => item.status === "pending"
      );

      if (!nextItem) {
        break;
      }

      updateQueueItem(nextItem.id, (item) => ({
        ...item,
        status: "syncing",
        error: null,
      }));

      try {
        const result = await processQueueItem(nextItem, runtime);
        processedCount += 1;
        removeQueueItem(nextItem.id);
        await runtime.onSuccess?.(normalizeQueueItem(nextItem), result);
      } catch (error) {
        const shouldRetry = isRetryableError(error);

        updateQueueItem(nextItem.id, (item) => ({
          ...item,
          status: shouldRetry ? "pending" : "failed",
          retryCount: (item.retryCount ?? 0) + 1,
          error: error?.message ?? "Sync failed",
        }));

        await runtime.onError?.(normalizeQueueItem(nextItem), error, {
          retryable: shouldRetry,
        });

        if (shouldRetry) {
          break;
        }
      }
    }
  } finally {
    isProcessing = false;
  }

  return { processedCount };
}
