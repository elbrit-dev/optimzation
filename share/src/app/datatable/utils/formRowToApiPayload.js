/**
 * Build Frappe GraphQL bulkUpdate-style variables from diff + schema structure.
 */

import { uniq } from 'lodash';
import { getDataKeys, getDataValue } from './dataAccessUtils';

function isArray(v) {
  return Array.isArray(v);
}

/**
 * Non-empty trim string check (treats 0 / false as valid values elsewhere; here only strings for doc ids).
 * @param {*} v
 */
function nonBlankDocString(v) {
  if (v == null) return false;
  const s = String(v).trim();
  return s !== '';
}

/**
 * Parent document id for bulkUpdate `parent` / top-level update row (optional field override).
 * @param {Object|null} editRow
 * @param {string} [bulk_update_parent_field]
 * @returns {string|null}
 */
export function resolveBulkUpdateParentId(editRow, bulkUpdateParentField) {
  if (!editRow || typeof editRow !== 'object') return null;
  if (nonBlankDocString(bulkUpdateParentField)) {
    const fv = editRow[bulkUpdateParentField];
    if (nonBlankDocString(fv)) return String(fv).trim();
  }
  if (nonBlankDocString(editRow.name)) return String(editRow.name).trim();
  if (nonBlankDocString(editRow.id)) return String(editRow.id).trim();
  if (nonBlankDocString(editRow.key)) return String(editRow.key).trim();
  const ek = editRow.__editingKey__;
  return nonBlankDocString(ek) ? String(ek).trim() : null;
}

/**
 * Stable grouping key for coalescing duplicate `changed` rows (same Frappe doc).
 * @param {Object|null} editRow
 * @param {string} [bulkUpdateParentField]
 */
export function stableParentUpdateKey(editRow, bulkUpdateParentField) {
  const id = resolveBulkUpdateParentId(editRow, bulkUpdateParentField);
  if (id != null) return id;
  return `__ek__:${editRow?.__editingKey__ ?? ''}`;
}

function childRowNestedKey(item, idx) {
  if (!item || typeof item !== 'object') return `__nested_${idx}`;
  return item.__editingKey__ ?? item.id ?? item.key ?? item.__id__ ?? `__nested_${idx}`;
}

/**
 * Nested child-table diff (same semantics as DataProviderNew.diffFieldValue for array-of-objects).
 * @param {*} o
 * @param {*} e
 * @param {(k: string) => boolean} skipKey
 * @returns {{ nested: Array } | null}
 */
export function diffChildTableArrays(o, e, skipKey) {
  const coerceObjRows = (v) => {
    const arr = isArray(v) ? v : [];
    return arr.filter((item) => item != null && typeof item === 'object' && !isArray(item));
  };
  const origArr = coerceObjRows(o);
  const editArr = coerceObjRows(e);
  const getNestedKey = childRowNestedKey;
  const origMap = new Map();
  origArr.forEach((item, idx) => origMap.set(getNestedKey(item, idx), { row: item, index: idx }));
  const nested = [];
  editArr.forEach((editItem, editIdx) => {
    const editKey = getNestedKey(editItem, editIdx);
    const origEntry = origMap.get(editKey);
    origMap.delete(editKey);
    if (!origEntry) {
      nested.push({ nestedKey: editKey, type: 'added', row: editItem });
      return;
    }
    const no = origEntry.row;
    const nKeys = uniq([...getDataKeys(no), ...getDataKeys(editItem)].filter((k) => !skipKey(k)));
    const nChanges = {};
    nKeys.forEach((nk) => {
      const vo = getDataValue(no, nk);
      const ve = getDataValue(editItem, nk);
      if (JSON.stringify(vo) !== JSON.stringify(ve)) {
        nChanges[nk] = { from: vo, to: ve };
      }
    });
    if (Object.keys(nChanges).length > 0) {
      nested.push({ nestedKey: editKey, type: 'changed', changes: nChanges });
    }
  });
  origMap.forEach(({ row }, key) => nested.push({ nestedKey: key, type: 'removed', row }));
  return nested.length > 0 ? { nested } : null;
}

function mergeNestedChangeEvents(a, b) {
  const byKey = new Map();
  for (const n of [...a, ...b]) {
    const id = `${n.type}:${n.nestedKey}`;
    const prev = byKey.get(id);
    if (!prev) {
      byKey.set(id, n);
      continue;
    }
    if (prev.type === 'changed' && n.type === 'changed' && prev.changes && n.changes) {
      byKey.set(id, { ...prev, changes: { ...prev.changes, ...n.changes } });
    } else {
      byKey.set(id, n);
    }
  }
  return [...byKey.values()];
}

function mergeChangeValueMaps(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    if (!out[k]) {
      out[k] = v;
      continue;
    }
    const x = out[k];
    if (x?.nested && v?.nested) {
      out[k] = { nested: mergeNestedChangeEvents(x.nested, v.nested) };
    } else if (v?.nested) {
      out[k] = v;
    } else if (x?.nested) {
      /* keep nested wins over scalar for same key */
      out[k] = x;
    } else if (x?.to !== undefined && v?.to !== undefined) {
      out[k] = v;
    } else {
      out[k] = v;
    }
  }
  return out;
}

function mergeEditRowsForCoalesce(a, b) {
  if (!a) return b;
  if (!b) return a;
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    if (v === undefined) continue;
    if (isArray(v) && isArray(a[k]) && v.length > 0 && typeof v[0] === 'object' && !isArray(v[0])) {
      const map = new Map();
      const ingest = (rows) => {
        rows.forEach((item, i) => {
          if (!item || typeof item !== 'object') return;
          const key = childRowNestedKey(item, i);
          const prev = map.get(key) || {};
          map.set(key, { ...prev, ...item });
        });
      };
      ingest(a[k]);
      ingest(v);
      out[k] = [...map.values()];
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Merge multiple `type:'changed'` diff entries that refer to the same parent document.
 * @param {Array<{ changes: Object, editRow: Object, [key: string]: * }>} entries
 */
function mergeChangedEntries(entries) {
  const [first, ...rest] = entries;
  let mergedChanges = { ...first.changes };
  let mergedEditRow = first.editRow;
  for (const e of rest) {
    mergedChanges = mergeChangeValueMaps(mergedChanges, e.changes);
    mergedEditRow = mergeEditRowsForCoalesce(mergedEditRow, e.editRow);
  }
  return { ...first, changes: mergedChanges, editRow: mergedEditRow };
}

/**
 * Coalesce duplicate `added` diff entries that share the same rowKey (duplicate editing-buffer rows for one new row).
 * @param {Array<{ rowKey: string, row: Object, [key: string]: * }>} added
 */
export function coalesceAddedRows(added) {
  if (!added || !isArray(added) || added.length <= 1) return added || [];
  const groups = new Map();
  for (const a of added) {
    const k = a.rowKey != null ? String(a.rowKey) : `__noid_${groups.size}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(a);
  }
  const out = [];
  for (const [, g] of groups) {
    if (g.length === 1) out.push(g[0]);
    else {
      const first = g[0];
      let mergedRow = first.row;
      for (let i = 1; i < g.length; i++) {
        mergedRow = mergeEditRowsForCoalesce(mergedRow, g[i].row);
      }
      out.push({ ...first, row: mergedRow });
    }
  }
  return out;
}

/**
 * Coalesce `changed` rows so one update per stable parent id (fixes duplicate `fields[]` / duplicate parents).
 * @param {Array<{ editRow: Object, changes: Object }>} changed
 * @param {string} [bulkUpdateParentField]
 */
export function coalesceChangedRows(changed, bulkUpdateParentField) {
  if (!changed || !isArray(changed) || changed.length <= 1) return changed || [];
  const groups = new Map();
  for (const c of changed) {
    const k = stableParentUpdateKey(c.editRow, bulkUpdateParentField);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(c);
  }
  const out = [];
  for (const [, g] of groups) {
    out.push(g.length === 1 ? g[0] : mergeChangedEntries(g));
  }
  return out;
}

/**
 * @param {Object} writeSchema - GraphQL write schema doc shape (root doctype key)
 */
export function getDoctypeFromWriteSchema(writeSchema) {
  if (!writeSchema || typeof writeSchema !== 'object') return null;
  const rootKey = Object.keys(writeSchema)[0];
  if (!rootKey) return null;
  const withoutS = rootKey.endsWith('s') ? rootKey.slice(0, -1) : rootKey;
  return withoutS.replace(/([A-Z])/g, ' $1').trim();
}

/**
 * @param {Object} writeSchema
 * @returns {{ mainFields: string[], childTables: Record<string, string[]> }}
 */
export function getSchemaStructure(writeSchema) {
  if (!writeSchema || typeof writeSchema !== 'object') return { mainFields: [], childTables: {} };
  const root = Object.values(writeSchema)[0];
  const node = root?.edges?.node;
  if (!node || typeof node !== 'object') return { mainFields: [], childTables: {} };
  const mainFields = [];
  const childTables = {};
  for (const [k, v] of Object.entries(node)) {
    if (v?.type) mainFields.push(k);
    else if (v && typeof v === 'object' && !Array.isArray(v)) childTables[k] = Object.keys(v);
  }
  return { mainFields, childTables };
}

export function rowToCreateFields(row, schemaStructure, skipKey) {
  const { mainFields, childTables } = schemaStructure;
  const fields = {};
  const rowKeys = row ? Object.keys(row).filter((x) => !String(x).startsWith('__')) : [];
  for (const k of mainFields) {
    if (skipKey(k)) continue;
    const v = row[k];
    if (v === undefined) continue;
    fields[k] = v;
  }
  if (Object.keys(fields).length === 0 && rowKeys.length > 0) {
    for (const k of rowKeys) {
      if (k === 'name' && !mainFields.includes('name')) continue;
      if (skipKey(k)) continue;
      const v = row[k];
      if (v === undefined) continue;
      fields[k] = v;
    }
  }
  for (const [tableName, childFieldNames] of Object.entries(childTables)) {
    const tableValue = row[tableName];
    if (!Array.isArray(tableValue) && (!tableValue || typeof tableValue !== 'object')) {
      continue;
    }
    if (Array.isArray(tableValue)) {
      fields[tableName] = tableValue.map((child) => {
        const obj = {};
        for (const f of childFieldNames) {
          if (f === 'name') continue;
          if (!skipKey(f) && child && f in child) obj[f] = child[f];
        }
        return obj;
      });
      continue;
    }
    const obj = {};
    for (const f of childFieldNames) {
      if (f === 'name') continue;
      if (!skipKey(f) && tableValue && f in tableValue) obj[f] = tableValue[f];
    }
    if (Object.keys(obj).length > 0) fields[tableName] = obj;
  }
  return fields;
}

export function rowToUpdateFields(editRow, changes, schemaStructure, skipKey, bulkUpdateParentField) {
  const docName = resolveBulkUpdateParentId(editRow, bulkUpdateParentField);
  const fields = {};
  const getNestedKey = (item, idx) => {
    if (!item || typeof item !== 'object') return `__nested_${idx}`;
    return item.__editingKey__ ?? item.id ?? item.key ?? item.__id__ ?? `__nested_${idx}`;
  };
  for (const [k, val] of Object.entries(changes)) {
    if (skipKey(k)) continue;
    if (val?.nested) {
      const tableName = k;
      const editArr = editRow[k];
      if (!Array.isArray(editArr)) continue;
      const arr = [];
      for (const n of val.nested) {
        if (n.type === 'added' && n.row) {
          const obj = {};
          for (const [f, v] of Object.entries(n.row)) {
            if (!skipKey(f) && v !== undefined) obj[f] = v;
          }
          arr.push(obj);
        } else if (n.type === 'changed' && n.changes) {
          const nestedKey = n.nestedKey;
          const editItem = editArr.find((child, idx) => getNestedKey(child, idx) === nestedKey);
          const obj = {};
          if (editItem?.name != null) obj.name = editItem.name;
          else if (editItem?.id != null) obj.id = editItem.id;
          else if (editItem?.key != null) obj.key = editItem.key;
          for (const [f, cv] of Object.entries(n.changes)) {
            if (skipKey(f)) continue;
            if (cv?.to !== undefined) obj[f] = cv.to;
          }
          arr.push(obj);
        }
      }
      if (arr.length > 0) fields[tableName] = arr;
    } else if (val?.to !== undefined) {
      const inSchemaChild =
        schemaStructure.childTables &&
        Object.prototype.hasOwnProperty.call(schemaStructure.childTables, k);
      const isChild = inSchemaChild || isArray(editRow?.[k]);
      if (isChild && isArray(val.to) && !val.nested) {
        const synthetic = diffChildTableArrays(val.from, val.to, skipKey);
        if (synthetic?.nested) {
          const tableName = k;
          const editArr = editRow[k];
          if (Array.isArray(editArr)) {
            const arr = [];
            for (const n of synthetic.nested) {
              if (n.type === 'added' && n.row) {
                const obj = {};
                for (const [f, v] of Object.entries(n.row)) {
                  if (!skipKey(f) && v !== undefined) obj[f] = v;
                }
                arr.push(obj);
              } else if (n.type === 'changed' && n.changes) {
                const nestedKey = n.nestedKey;
                const editItem = editArr.find((child, idx) => getNestedKey(child, idx) === nestedKey);
                const obj = {};
                if (editItem?.name != null) obj.name = editItem.name;
                else if (editItem?.id != null) obj.id = editItem.id;
                else if (editItem?.key != null) obj.key = editItem.key;
                for (const [f, cv] of Object.entries(n.changes)) {
                  if (skipKey(f)) continue;
                  if (cv?.to !== undefined) obj[f] = cv.to;
                }
                arr.push(obj);
              }
            }
            if (arr.length > 0) fields[tableName] = arr;
          }
        } else {
          fields[k] = val.to;
        }
      } else {
        fields[k] = val.to;
      }
    }
  }
  if (schemaStructure.mainFields?.includes('name') && docName != null) {
    fields.name = docName;
  }
  return { name: docName, fields };
}

/**
 * @param {{ allowCreate?: boolean, allowUpdate?: boolean, allowDelete?: boolean }} [writeOpts]
 */
export function buildBulkUpdateVariables(doctype, changedRows, schemaStructure, skipKey, writeOpts = {}) {
  const allowCreate = writeOpts.allowCreate !== false;
  const allowUpdate = writeOpts.allowUpdate !== false;
  const allowDelete = writeOpts.allowDelete !== false;
  const bulkUpdateParentField = writeOpts.bulkUpdateParentField;
  const fields = [];
  const createChild = [];
  const updateChild = [];
  const deleteChild = [];

  const getNestedKey = (item, idx) => {
    if (!item || typeof item !== 'object') return `__nested_${idx}`;
    return item.__editingKey__ ?? item.id ?? item.key ?? item.__id__ ?? `__nested_${idx}`;
  };

  const childTableNames = schemaStructure?.childTables && typeof schemaStructure.childTables === 'object'
    ? new Set(Object.keys(schemaStructure.childTables))
    : new Set();

  /** Whole-array {from,to} child updates when schema/query omitted childTables or row shape dropped the array. */
  function isChildTableWholeArrayCandidate(k, val, editRow) {
    if (!val || val.nested || val.to === undefined || !isArray(val.to)) return false;
    if (childTableNames.has(k)) return true;
    if (isArray(editRow?.[k])) return true;
    return false;
  }

  function applyNestedVal(
    tableName,
    valNested,
    editRow,
    createByTable,
    updateByTable,
    deleteByTable,
    fallbackEditArr = null,
  ) {
    const editArr = Array.isArray(editRow[tableName])
      ? editRow[tableName]
      : Array.isArray(fallbackEditArr)
        ? fallbackEditArr
        : null;
    if (!Array.isArray(editArr)) return;
    for (const n of valNested) {
      if (n.type === 'added' && n.row && allowCreate) {
        const obj = {};
        for (const [f, v] of Object.entries(n.row)) {
          if (!skipKey(f) && v !== undefined) obj[f] = v;
        }
        if (Object.keys(obj).length > 0) {
          if (!createByTable[tableName]) createByTable[tableName] = [];
          createByTable[tableName].push(obj);
        }
      } else if (n.type === 'changed' && n.changes && allowUpdate) {
        const nestedKey = n.nestedKey;
        const editItem = editArr.find((child, idx) => getNestedKey(child, idx) === nestedKey);
        const obj = {};
        if (editItem?.name != null) obj.name = editItem.name;
        else if (editItem?.id != null) obj.id = editItem.id;
        else if (editItem?.key != null) obj.key = editItem.key;
        for (const [f, cv] of Object.entries(n.changes)) {
          if (skipKey(f)) continue;
          if (cv?.to !== undefined) obj[f] = cv.to;
        }
        if (!updateByTable[tableName]) updateByTable[tableName] = [];
        updateByTable[tableName].push(obj);
      } else if (n.type === 'removed' && n.row && allowDelete) {
        const childId = n.row?.name ?? n.row?.id ?? n.row?.key ?? n.row?.__editingKey__;
        if (childId != null) {
          if (!deleteByTable[tableName]) deleteByTable[tableName] = [];
          deleteByTable[tableName].push(childId);
        }
      }
    }
  }

  for (const entry of changedRows) {
    const { editRow, changes } = entry;
    const parentId = resolveBulkUpdateParentId(editRow, bulkUpdateParentField);
    if (!parentId) continue;

    const parentFields = {};
    const createByTable = {};
    const updateByTable = {};
    const deleteByTable = {};

    for (const [k, val] of Object.entries(changes)) {
      if (skipKey(k)) continue;
      if (val?.nested) {
        applyNestedVal(k, val.nested, editRow, createByTable, updateByTable, deleteByTable, null);
      } else if (val?.to !== undefined && allowUpdate && isChildTableWholeArrayCandidate(k, val, editRow)) {
        const synthetic = diffChildTableArrays(val.from, val.to, skipKey);
        if (synthetic?.nested) {
          applyNestedVal(k, synthetic.nested, editRow, createByTable, updateByTable, deleteByTable, val.to);
        } else {
          parentFields[k] = val.to;
        }
      } else if (val?.to !== undefined && allowUpdate) {
        parentFields[k] = val.to;
      }
    }

    if (Object.keys(parentFields).length > 0) {
      if (schemaStructure.mainFields?.includes('name') && parentId != null) {
        parentFields.name = parentId;
      }
      fields.push({ name: parentId, fields: parentFields });
    }

    if (Object.keys(createByTable).length > 0) {
      createChild.push({ parent: parentId, fields: createByTable });
    }
    if (Object.keys(updateByTable).length > 0) {
      updateChild.push({ parent: parentId, fields: updateByTable });
    }
    if (Object.keys(deleteByTable).length > 0) {
      deleteChild.push({ parent: parentId, fields: Object.entries(deleteByTable).map(([t, ids]) => ({ [t]: ids })) });
    }
  }

  const variables = { doctype };
  if (fields.length > 0) variables.fields = fields;
  if (createChild.length > 0) variables.create_child = createChild;
  if (updateChild.length > 0) variables.update_child = updateChild;
  if (deleteChild.length > 0) variables.delete_child = deleteChild;
  return variables;
}
