import { firestoreService } from '@/app/graphql-playground/services/firestoreService';

// ─── Structured, buffered logging for the SmartData flow ──────────────────────
//
// Off by default (see smartDataTableConfig.js's `loggingEnabled`). When enabled,
// buffers structured events in memory and periodically ships them to the
// Firestore `logs` collection, grouped by a per-page-load sessionId.
//
// Call sites never need to guard with an `if` — logSmartDataEvent() is a no-op
// while disabled.

const FLUSH_INTERVAL_MS = 4000;
const MAX_BUFFER_SIZE = 25;

let enabled = false;
let source = null;
let sessionId = null;
let buffer = [];
let flushTimer = null;

function getSessionId() {
  if (!sessionId) {
    sessionId = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `sess_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }
  return sessionId;
}

function onVisibilityChange() {
  if (document.visibilityState === 'hidden') flush();
}

function startFlushTimer() {
  if (flushTimer) return;
  flushTimer = setInterval(flush, FLUSH_INTERVAL_MS);
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', onVisibilityChange);
  }
}

function stopFlushTimer() {
  clearInterval(flushTimer);
  flushTimer = null;
  if (typeof window !== 'undefined') {
    window.removeEventListener('beforeunload', flush);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  }
}

async function flush() {
  if (buffer.length === 0) return;
  const batch = buffer;
  buffer = [];
  try {
    await firestoreService.writeLogs(batch);
  } catch (err) {
    console.warn('[smartDataLogger] failed to flush logs:', err);
  }
}

/**
 * Turns logging on/off and tags subsequent events with a source (report name).
 * Disabling clears any unflushed buffer so logs never leak across reports.
 * @param {{ enabled: boolean, source?: string }} opts
 */
export function configureSmartDataLogging({ enabled: nextEnabled, source: nextSource } = {}) {
  source = nextSource ?? source;
  const wasEnabled = enabled;
  enabled = !!nextEnabled;

  if (!enabled) {
    buffer = [];
    if (wasEnabled) stopFlushTimer();
    return;
  }
  if (!wasEnabled) startFlushTimer();
}

/**
 * Buffers a structured log event. No-op when logging is disabled.
 * @param {'debug'|'info'|'warn'|'error'} level
 * @param {string} category
 * @param {string} message
 * @param {object} [data]
 */
export function logSmartDataEvent(level, category, message, data) {
  if (!enabled) return;
  buffer.push({
    timestamp: new Date().toISOString(),
    level,
    source,
    sessionId: getSessionId(),
    category,
    message,
    data: data ?? null,
  });
  if (buffer.length >= MAX_BUFFER_SIZE) flush();
}

/** Test-only: force an immediate flush. */
export function _flushSmartDataLogs() {
  return flush();
}
