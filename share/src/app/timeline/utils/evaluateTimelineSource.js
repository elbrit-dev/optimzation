const VALID_ALIGNS = new Set(['left', 'right', 'alternate']);

/**
 * @param {unknown} v
 * @returns {string | undefined} normalized align or undefined to mean “use default”
 */
function normalizeAlign(v) {
  if (v == null || v === '') return undefined;
  const s = String(v).toLowerCase();
  return VALID_ALIGNS.has(s) ? s : undefined;
}

/**
 * Playground root `{ align, events, onEventClick? }`.
 * If `onEventClick` is present it must be a function; omit it to disable click handling.
 * Event rows are opt-in: only `clickable: true` fires the handler; missing/false stays non-interactive.
 * @param {unknown} v
 * @param {boolean} keyPresent
 * @returns {{ handler: ((payload: object) => void) | null } | { error: string }}
 */
function resolvePlaygroundOnEventClick(v, keyPresent) {
  if (!keyPresent) {
    return { handler: null };
  }
  if (typeof v === 'function') {
    return { handler: v };
  }
  return {
    error:
      'onEventClick must be a function (payload) => void with { timelineEvent, clickSource }. ' +
      'Omit onEventClick to disable. Use JavaScript in the editor (strict JSON cannot include functions).',
  };
}

/**
 * Parse playground editor text into `events`, optional `align`, and optional `onEventClick` (playground).
 * Accepts:
 * - A JSON/JS **array** of event objects (no config-level onEventClick).
 * - A JSON/JS **object** `{ align?, onEventClick?: function, events: [...] }`.
 * @param {string} source
 * @returns {{ ok: true, events: object[], align?: string, onEventClickHandler: ((p: object) => void) | null } | { ok: false, events: [], error: string }}
 */
export function evaluateTimelineSource(source) {
  const trimmed = typeof source === 'string' ? source.trim() : '';
  if (!trimmed) {
    return { ok: false, events: [], error: 'Editor is empty.' };
  }

  const first = trimmed[0];
  let parsed;
  if (first === '[' || first === '{') {
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      try {
        const fn = new Function(`"use strict"; return (${trimmed});`);
        parsed = fn();
      } catch (e) {
        return {
          ok: false,
          events: [],
          error: e?.message ? String(e.message) : 'Invalid JSON or JavaScript.',
        };
      }
    }
  } else {
    try {
      const fn = new Function(`"use strict"; return (${trimmed});`);
      parsed = fn();
    } catch (e) {
      return {
        ok: false,
        events: [],
        error: e?.message ? String(e.message) : 'Failed to evaluate JavaScript.',
      };
    }
  }

  let arr;
  /** @type {string | undefined} */
  let align;
  /** @type {{ handler: ((payload: object) => void) | null }} */
  let clickCfg = { handler: null };

  if (Array.isArray(parsed)) {
    arr = parsed;
  } else if (parsed && typeof parsed === 'object' && Array.isArray(parsed.events)) {
    arr = parsed.events;
    align = normalizeAlign(parsed.align);
    if (parsed.align != null && parsed.align !== '' && align === undefined) {
      return {
        ok: false,
        events: [],
        error: `Invalid align "${parsed.align}". Use: left, right, alternate.`,
      };
    }
    const resolved = resolvePlaygroundOnEventClick(
      parsed.onEventClick,
      Object.prototype.hasOwnProperty.call(parsed, 'onEventClick')
    );
    if ('error' in resolved) {
      return { ok: false, events: [], error: resolved.error };
    }
    clickCfg = resolved;
  } else if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    arr = [parsed];
  } else {
    return {
      ok: false,
      events: [],
      error: 'Result must be an events array or { align?, onEventClick?, events }.',
    };
  }

  const events = arr.filter(
    (item) =>
      item != null &&
      typeof item === 'object' &&
      !Array.isArray(item) &&
      item.id != null &&
      item.date != null &&
      String(item.date).length > 0
  );

  if (events.length === 0 && arr.length > 0) {
    return {
      ok: false,
      events: [],
      error: 'No valid events: each item needs id and date.',
    };
  }

  const out = {
    ok: true,
    events,
    onEventClickHandler: clickCfg.handler,
  };
  if (align !== undefined) {
    out.align = align;
  }
  return out;
}
