/* Parse the /ring-tabs harness editor into RingTabs props.
 *
 * JavaScript, not JSON, for the same reason as the timeline playground: the
 * config carries an `onChange` function. Accepts either a bare tabs array or
 *
 *   { tabs: [...], value?, defaultValue?, keepInactiveMounted?, stickyBar?,
 *     ariaLabel?, onChange?: (tabId) => void }
 *
 * Every key but `tabs` mirrors a RingTabs prop of the same name, so what runs
 * here is exactly what Studio's props panel would pass. */

const BOOLEAN_KEYS = ['keepInactiveMounted', 'stickyBar'];
const STRING_KEYS = ['value', 'defaultValue', 'ariaLabel'];

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
 * @returns {{ ok: true, props: object, onChange: ((id: string) => void) | null }
 *   | { ok: false, error: string }}
 */
export function evaluateRingTabsSource(source) {
  const trimmed = typeof source === 'string' ? source.trim() : '';
  if (!trimmed) return { ok: false, error: 'Editor is empty.' };

  const result = evaluate(trimmed);
  if ('error' in result) return { ok: false, error: result.error };
  const parsed = result.value;

  if (Array.isArray(parsed)) {
    return { ok: true, props: { tabs: parsed }, onChange: null };
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.tabs)) {
    return { ok: false, error: 'Result must be a tabs array or { tabs: [...], ...props }.' };
  }

  const props = { tabs: parsed.tabs };
  for (const key of STRING_KEYS) {
    if (parsed[key] == null) continue;
    if (typeof parsed[key] !== 'string') return { ok: false, error: `${key} must be a string.` };
    props[key] = parsed[key];
  }
  for (const key of BOOLEAN_KEYS) {
    if (parsed[key] == null) continue;
    if (typeof parsed[key] !== 'boolean') return { ok: false, error: `${key} must be true or false.` };
    props[key] = parsed[key];
  }

  let onChange = null;
  if (Object.prototype.hasOwnProperty.call(parsed, 'onChange')) {
    if (typeof parsed.onChange !== 'function') {
      return {
        ok: false,
        error: 'onChange must be a function (tabId) => void. Omit it to disable. '
          + '(Strict JSON cannot hold a function — write JavaScript.)',
      };
    }
    onChange = parsed.onChange;
  }

  return { ok: true, props, onChange };
}
