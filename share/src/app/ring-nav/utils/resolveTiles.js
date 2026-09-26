/* Tile definitions → the tiles on the strip.
 *
 * ANY FIELD OF A TILE MAY BE A FUNCTION of the context — caption, count,
 * segments, href, anything — and `show` decides whether the tile is there:
 *
 *   {
 *     id: 'secondary-entry',
 *     label: 'Secondary',
 *     show: ({ day }) => day <= 5,
 *     caption: ({ data }) => `${data.draft} to enter`,
 *     segments: ({ data }) => [
 *       { value: data.approved, tone: 'success' },
 *       { value: data.draft, tone: 'danger' },
 *     ],
 *   }
 *
 * The context is the same for every tile:
 *   data      whatever the page passes as `data` (a query's answer, flags…)
 *   now       a Date, local time
 *   today     'YYYY-MM-DD'
 *   day       1-31     weekday  1-7 (ISO, Monday = 1)     month  1-12
 *
 * A whole tile may be a function too, returning the tile or null.
 *
 * FAILURE IS LOCAL. A field whose function throws is left out (the tile
 * draws without it); a `show` that throws keeps the tile. Either way the
 * error is in the console — one bad rule must not take the strip with it. */

function dayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function tileContext(now, data) {
  const d = new Date(now);
  return {
    data: data ?? {},
    now: d,
    today: dayKey(d),
    day: d.getDate(),
    weekday: d.getDay() === 0 ? 7 : d.getDay(),
    month: d.getMonth() + 1,
  };
}

/* Does anything in these definitions depend on the context? */
export function isDynamic(defs) {
  return (
    Array.isArray(defs) &&
    defs.some((def) => typeof def === 'function' || (def && typeof def === 'object' && Object.values(def).some((v) => typeof v === 'function')))
  );
}

function call(fn, ctx, what) {
  try {
    return { value: fn(ctx) };
  } catch (error) {
    console.error(`[RingNav] ${what} threw.`, error);
    return { error };
  }
}

export function resolveTile(def, ctx) {
  if (typeof def === 'function') {
    const r = call(def, ctx, 'a tile function');
    return r.error ? null : (r.value ?? null);
  }
  if (!def || typeof def !== 'object' || Array.isArray(def)) return def;

  const name = def.id ?? def.label ?? 'a tile';
  if ('show' in def) {
    const r = typeof def.show === 'function' ? call(def.show, ctx, `${name}: show`) : { value: def.show };
    if (!r.error && !r.value) return null;
  }
  const tile = {};
  for (const [key, v] of Object.entries(def)) {
    if (key === 'show') continue;
    if (typeof v !== 'function') {
      tile[key] = v;
      continue;
    }
    const r = call(v, ctx, `${name}: ${key}`);
    if (!r.error) tile[key] = r.value;
  }
  return tile;
}

export function resolveTiles(defs, ctx) {
  if (!Array.isArray(defs)) return [];
  return defs.map((def) => resolveTile(def, ctx)).filter((t) => t != null);
}

/* Definitions written as JavaScript text (a Studio code field, a saved
   config) → the array. Compiled once per string; the text is an EXPRESSION —
   the array itself — and runs with the page's rights, so it must come from
   whoever builds the page, never from data a user can edit. */
export function compileTiles(source) {
  const text = typeof source === 'string' ? source.trim() : '';
  if (!text) return [];
  try {
    // eslint-disable-next-line no-new-func
    const value = new Function(`"use strict"; return (${text});`)();
    if (Array.isArray(value)) return value;
    console.error('[RingNav] items code must evaluate to an array of tiles.', value);
  } catch (error) {
    console.error('[RingNav] items code does not compile.', error);
  }
  return [];
}
