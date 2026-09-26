/* A component's props, from its Plasmic registration — the same list Studio
 * shows, so the harness never drifts from what a page can actually set.
 *
 *   controlsFor(meta, { bound, hidden })   the controls to draw
 *   resolveProps(meta, { values, bound, overridden, log })   the props to pass
 *
 * BOUND props (gqlToken, gqlEnvironment, viewer…) are filled from who you
 * are acting as; each can be overridden by hand. EVENT HANDLERS are logged.
 * An unset prop gets the harness's default (the entry's and its mode's
 * `defaults` — the screen's sample props), else its registered defaultValue,
 * as Studio would pass it.
 *
 * OBJECT props are edited as text: JSON, or a JavaScript expression, so a
 * value can hold functions (a Ring Nav tile's `show: ({ day }) => day <= 5`).
 * A default is shown in its box as source (toSource) and edited in place. */

const KNOWN = ['string', 'number', 'boolean', 'choice', 'object', 'code', 'eventHandler'];

function typeOf(def) {
  const t = typeof def === 'string' ? def : def?.type;
  return KNOWN.includes(t) ? t : t === 'slot' ? 'slot' : 'string';
}

export function controlsFor(meta, { bound = {}, hidden = [] } = {}) {
  return Object.entries(meta?.props ?? {})
    .filter(([name, def]) => !hidden.includes(name) && typeOf(def) !== 'slot')
    .map(([name, def]) => ({
      name,
      type: typeOf(def),
      label: def?.displayName || name,
      help: def?.helpText || def?.description || '',
      defaultValue: def?.defaultValue,
      options: Array.isArray(def?.options) ? def.options.map((o) => (typeof o === 'object' ? o : { value: o, label: String(o) })) : [],
      multiSelect: Boolean(def?.multiSelect),
      advanced: Boolean(def?.advanced),
      bound: Object.prototype.hasOwnProperty.call(bound, name),
    }));
}

/* JSON or JavaScript text → value, or { error }. Empty text is "unset". */
export function parseObject(text) {
  const t = String(text ?? '').trim();
  if (!t) return { value: undefined };
  try {
    return { value: JSON.parse(t) };
  } catch {
    try {
      // eslint-disable-next-line no-new-func
      return { value: new Function(`"use strict"; return (${t});`)() };
    } catch (e) {
      return { error: e.message };
    }
  }
}

const IDENT = /^[A-Za-z_$][\w$]*$/;

/* A value → the JavaScript that makes it, functions included (their own
   source), laid out for the Props panel's box. */
export function toSource(value, indent = '') {
  if (typeof value === 'function') return value.toString();
  if (value === undefined) return 'undefined';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  const inner = `${indent}  `;
  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    return `[\n${value.map((v) => inner + toSource(v, inner)).join(',\n')},\n${indent}]`;
  }
  const keys = Object.keys(value);
  if (!keys.length) return '{}';
  const lines = keys.map((k) => `${inner}${IDENT.test(k) ? k : JSON.stringify(k)}: ${toSource(value[k], inner)}`);
  return `{\n${lines.join(',\n')},\n${indent}}`;
}

/* `defaults` are the HARNESS's starting values (sample data, a bottomGap
   that clears the device's edge), used when the prop is unset, ahead of the
   registered defaultValue. An object default may be a real value (functions
   and all); an edited one arrives as text. */
export function resolveProps(meta, { values = {}, bound = {}, overridden = [], log = () => {}, defaults = {} } = {}) {
  const props = {};
  const errors = {};
  for (const control of controlsFor(meta, { bound })) {
    const { name, type, defaultValue } = control;
    if (type === 'eventHandler') {
      props[name] = (...args) => log(name, args);
      continue;
    }
    if (control.bound && !overridden.includes(name)) {
      props[name] = bound[name];
      continue;
    }
    const raw = values[name] ?? defaults[name];
    if (type === 'object' || type === 'code') {
      if (type === 'code') {
        if (raw != null && raw !== '') props[name] = raw;
        continue;
      }
      const parsed = typeof raw === 'string' ? parseObject(raw) : { value: raw };
      if (parsed.error) errors[name] = parsed.error;
      else if (parsed.value !== undefined) props[name] = parsed.value;
      else if (defaultValue !== undefined) props[name] = defaultValue;
      continue;
    }
    if (raw === undefined || raw === '') {
      if (defaultValue !== undefined) props[name] = defaultValue;
      continue;
    }
    if (type === 'number') {
      const n = Number(raw);
      if (Number.isFinite(n)) props[name] = n;
      else errors[name] = 'Not a number';
      continue;
    }
    props[name] = raw;
  }
  return { props, errors };
}
