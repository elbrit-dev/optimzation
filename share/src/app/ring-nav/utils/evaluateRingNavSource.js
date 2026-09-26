/* Parse the /ring-nav harness editor into RingNav props.
 *
 * JavaScript, not JSON, for the same reason as the timeline playground: the
 * config can carry an `onItemClick` function. Accepts either a bare items
 * array or
 *
 *   { items: [...], stickyBar?, inset?, ariaLabel?, data?, now?, refreshEvery?,
 *     onItemClick?: (id, href) => void }
 *
 * Every key but `items` mirrors a RingNav prop of the same name, so what runs
 * here is exactly what Studio's props panel would pass. */

const BOOLEAN_KEYS = ['stickyBar', 'inset'];
const STRING_KEYS = ['ariaLabel', 'now'];
const OBJECT_KEYS = ['data'];
const NUMBER_KEYS = ['refreshEvery'];

function evaluate(trimmed) {
  try {
    return { value: JSON.parse(trimmed) };
  } catch {
    try {
      // eslint-disable-next-line no-new-func
      return { value: new Function(`"use strict"; return (${trimmed});`)() };
    } catch (e) {
      return { error: e?.message ? String(e.message) : 'Invalid JSON or JavaScript.' };
    }
  }
}

/**
 * @param {string} source
 * @returns {{ ok: true, props: object, onItemClick: ((id: string, href: string) => void) | null }
 *   | { ok: false, error: string }}
 */
export function evaluateRingNavSource(source) {
  const trimmed = typeof source === 'string' ? source.trim() : '';
  if (!trimmed) return { ok: false, error: 'Editor is empty.' };

  const result = evaluate(trimmed);
  if ('error' in result) return { ok: false, error: result.error };
  const parsed = result.value;

  if (Array.isArray(parsed)) {
    return { ok: true, props: { items: parsed }, onItemClick: null };
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.items)) {
    return { ok: false, error: 'Result must be an items array or { items: [...], ...props }.' };
  }

  const props = { items: parsed.items };
  for (const key of STRING_KEYS) {
    if (parsed[key] == null) continue;
    if (typeof parsed[key] !== 'string') return { ok: false, error: `${key} must be a string.` };
    props[key] = parsed[key];
  }
  for (const key of OBJECT_KEYS) {
    if (parsed[key] == null) continue;
    if (typeof parsed[key] !== 'object' || Array.isArray(parsed[key])) return { ok: false, error: `${key} must be an object.` };
    props[key] = parsed[key];
  }
  for (const key of NUMBER_KEYS) {
    if (parsed[key] == null) continue;
    if (typeof parsed[key] !== 'number') return { ok: false, error: `${key} must be a number.` };
    props[key] = parsed[key];
  }
  for (const key of BOOLEAN_KEYS) {
    if (parsed[key] == null) continue;
    if (typeof parsed[key] !== 'boolean') return { ok: false, error: `${key} must be true or false.` };
    props[key] = parsed[key];
  }

  let onItemClick = null;
  if (Object.prototype.hasOwnProperty.call(parsed, 'onItemClick')) {
    if (typeof parsed.onItemClick !== 'function') {
      return {
        ok: false,
        error: 'onItemClick must be a function (id, href) => void. Omit it to disable. '
          + '(Strict JSON cannot hold a function — write JavaScript.)',
      };
    }
    onItemClick = parsed.onItemClick;
  }

  return { ok: true, props, onItemClick };
}
