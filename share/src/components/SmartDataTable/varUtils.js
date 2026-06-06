/**
 * Recursively merge two plain objects.
 * Arrays are replaced, not concatenated.
 */
export function deepMerge(base, override) {
  if (!override || typeof override !== 'object' || Array.isArray(override)) {
    return override !== undefined ? override : base;
  }
  const result = { ...(base ?? {}) };
  for (const [k, v] of Object.entries(override)) {
    result[k] =
      v && typeof v === 'object' && !Array.isArray(v) &&
      result[k] && typeof result[k] === 'object' && !Array.isArray(result[k])
        ? deepMerge(result[k], v)
        : v;
  }
  return result;
}

/**
 * Immutably set a value at a dot-separated path within a plain object.
 * setPath({}, 'filters.from_date', '2026-05-01')
 * → { filters: { from_date: '2026-05-01' } }
 */
export function setPath(obj, dotPath, value) {
  const [head, ...rest] = dotPath.split('.');
  if (!rest.length) return { ...(obj ?? {}), [head]: value };
  return { ...(obj ?? {}), [head]: setPath((obj ?? {})[head], rest.join('.'), value) };
}

/**
 * Read a value at a dot-separated path within a plain object.
 * getPath({ filters: { from_date: '2026-05-01' } }, 'filters.from_date')
 * → '2026-05-01'
 */
export function getPath(obj, dotPath) {
  return dotPath.split('.').reduce((cur, key) => cur?.[key], obj);
}
