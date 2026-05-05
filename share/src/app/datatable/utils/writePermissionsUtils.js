/**
 * Write permissions for enableWrite mode: granular create / update / delete.
 * All flags default true when omitted (backward compatible).
 */

/** @type {{ create: boolean, update: boolean, delete: boolean }} */
export const WRITE_PERMISSIONS_ALL_TRUE = { create: true, update: true, delete: true };

/**
 * @param {boolean} enableWrite - Master switch from query doc / force flag
 * @param {Partial<{ create: boolean, update: boolean, delete: boolean }> | undefined} partial - From config; missing keys stay true
 * @returns {{ create: boolean, update: boolean, delete: boolean }}
 */
export function resolveWritePermissions(enableWrite, partial) {
  if (!enableWrite) return { ...WRITE_PERMISSIONS_ALL_TRUE };
  return {
    ...WRITE_PERMISSIONS_ALL_TRUE,
    ...(partial && typeof partial === 'object' ? partial : {}),
  };
}

/**
 * Infer which operation types are required to persist the current main-table diff.
 * @param {Array<{ type: string, changes?: object }>} added
 * @param {Array<{ type: string, changes?: object }>} changed
 * @param {Array<{ type: string }>} removed
 * @returns {{ create: boolean, update: boolean, delete: boolean }}
 */
export function computeWriteOpsNeeded(added, changed, removed) {
  const needed = { create: false, update: false, delete: false };
  if (added.length > 0) needed.create = true;
  if (removed.length > 0) needed.delete = true;
  for (const ch of changed) {
    const entries = ch.changes && typeof ch.changes === 'object' ? Object.entries(ch.changes) : [];
    for (const [, val] of entries) {
      if (val && Array.isArray(val.nested)) {
        for (const n of val.nested) {
          if (n.type === 'added') needed.create = true;
          else if (n.type === 'changed') needed.update = true;
          else if (n.type === 'removed') needed.delete = true;
        }
      } else if (val && (Object.prototype.hasOwnProperty.call(val, 'from') || Object.prototype.hasOwnProperty.call(val, 'to'))) {
        needed.update = true;
      } else if (val && !val.nested) {
        needed.update = true;
      }
    }
  }
  return needed;
}

/**
 * @param {{ create: boolean, update: boolean, delete: boolean }} needed
 * @param {{ create: boolean, update: boolean, delete: boolean }} allowed
 * @returns {string | null} First violation message key or null
 */
export function getFirstWritePermissionViolation(needed, allowed) {
  if (needed.create && !allowed.create) return 'create';
  if (needed.update && !allowed.update) return 'update';
  if (needed.delete && !allowed.delete) return 'delete';
  return null;
}
