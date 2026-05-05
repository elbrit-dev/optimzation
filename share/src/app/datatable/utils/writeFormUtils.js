/**
 * writeForm — `{ layout, fields }`: root `layout` is drawer chrome; `fields` is the Doc field tree.
 * Per-field `layout: { row, col, colSpan?, rowSpan? }` places items in the drawer grid.
 * Column typing for grid/pipeline stays in columnTypesOverride (+ inference).
 */

/** @param {*} wf */
export function getWriteFormFields(wf) {
  if (!wf || typeof wf !== 'object' || Array.isArray(wf)) return {};
  const f = wf.fields;
  return f && typeof f === 'object' && !Array.isArray(f) ? f : {};
}

/** @param {*} wf */
export function getWriteFormLayout(wf) {
  if (!wf || typeof wf !== 'object' || Array.isArray(wf)) return {};
  const L = wf.layout;
  return L && typeof L === 'object' && !Array.isArray(L) ? L : {};
}

/**
 * Canonical shape for config merge / empty defaults.
 * @param {*} wf
 */
export function normalizeWriteForm(wf) {
  return {
    layout: getWriteFormLayout(wf),
    fields: getWriteFormFields(wf),
  };
}

/**
 * Leaf / group node under `fields` for a main column (and optional object sub-key).
 * @param {Object} fieldsTree - `writeForm.fields`
 * @param {string} columnName
 * @param {string|null} [objectSubKey]
 * @returns {*|null}
 */
export function getWriteFormFieldNode(fieldsTree, columnName, objectSubKey = null) {
  const tree = fieldsTree && typeof fieldsTree === 'object' ? fieldsTree : {};
  const parent = tree[columnName];
  if (!parent || typeof parent !== 'object' || Array.isArray(parent)) return null;
  if (objectSubKey) {
    const grp = parent.fields;
    if (!grp || typeof grp !== 'object' || Array.isArray(grp)) return null;
    const leaf = grp[objectSubKey];
    return leaf && typeof leaf === 'object' && !Array.isArray(leaf) ? leaf : null;
  }
  return parent;
}

/**
 * @param {*} layout - field node's `layout`
 * @returns {import('react').CSSProperties|undefined}
 */
export function gridItemStyleFromFieldLayout(layout) {
  if (!layout || typeof layout !== 'object' || Array.isArray(layout)) return undefined;
  const row = Number(layout.row);
  const col = Number(layout.col);
  if (!Number.isFinite(row) || !Number.isFinite(col)) return undefined;
  const rs = Math.max(1, Number(layout.rowSpan) || 1);
  const cs = Math.max(1, Number(layout.colSpan) || 1);
  return {
    gridRow: `${row} / span ${rs}`,
    gridColumn: `${col} / span ${cs}`,
  };
}

/**
 * Stable sort: items with valid `fieldLayout` (row+col) first by row, col; then items without.
 * @param {Array<{ fieldLayout?: *, _drawerOrder: number }>} items
 */
export function sortDrawerFieldItemsByLayout(items) {
  const withL = [];
  const without = [];
  for (const item of items) {
    const L = item.fieldLayout;
    if (
      L &&
      typeof L === 'object' &&
      !Array.isArray(L) &&
      Number.isFinite(Number(L.row)) &&
      Number.isFinite(Number(L.col))
    ) {
      withL.push(item);
    } else {
      without.push(item);
    }
  }
  withL.sort((a, b) => {
    const ra = Number(a.fieldLayout.row);
    const rb = Number(b.fieldLayout.row);
    if (ra !== rb) return ra - rb;
    const ca = Number(a.fieldLayout.col);
    const cb = Number(b.fieldLayout.col);
    if (ca !== cb) return ca - cb;
    return a._drawerOrder - b._drawerOrder;
  });
  return [...withL, ...without];
}

/**
 * Repeating child rows (Frappe child table / link list).
 * @param {*} node
 */
export function isTableNode(node) {
  return node && typeof node === 'object' && !Array.isArray(node) && node.ui === 'table';
}

/**
 * Object-shaped field group (nested `fields`, not a table).
 */
export function isObjectGroupNode(node) {
  return (
    node &&
    typeof node === 'object' &&
    !Array.isArray(node) &&
    node.fields &&
    typeof node.fields === 'object' &&
    !isTableNode(node)
  );
}

/**
 * Drawer / cell edit eligibility: `edit: true`, or `write: true` when not explicitly `edit: false`.
 * Matches presets that only set `write` for API parity.
 * @param {*} node
 */
export function isWriteFormFieldEditable(node) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return false;
  if (node.edit === false) return false;
  if (node.edit === true) return true;
  if (node.write === true) return true;
  return false;
}

/**
 * Drawer display-only: both flags false — show value in the drawer without editing.
 * @param {*} node
 */
export function isWriteFormFieldReadOnlyDisplay(node) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return false;
  return node.edit === false && node.write === false;
}

/**
 * Deep-merge field trees (values under `writeForm.fields`).
 * @param {Object} base
 * @param {Object} next
 */
function mergeFieldsTree(base = {}, next = {}) {
  const out = { ...base };
  for (const k of Object.keys(next || {})) {
    const bv = base[k];
    const nv = next[k];
    if (
      bv &&
      typeof bv === 'object' &&
      !Array.isArray(bv) &&
      nv &&
      typeof nv === 'object' &&
      !Array.isArray(nv) &&
      !isTableNode(bv) &&
      !isTableNode(nv)
    ) {
      const childFieldsMerge =
        bv.fields && nv.fields && typeof bv.fields === 'object' && typeof nv.fields === 'object';
      if (childFieldsMerge) {
        out[k] = { ...bv, ...nv, fields: mergeFieldsTree(bv.fields, nv.fields) };
      } else {
        out[k] = { ...bv, ...nv };
      }
    } else {
      out[k] = nv;
    }
  }
  return out;
}

/**
 * Merge root `writeForm` objects (`layout` + `fields`).
 * @param {Object} base
 * @param {Object} next
 */
export function deepMergeWriteForm(base = {}, next = {}) {
  const b = normalizeWriteForm(base);
  const n = normalizeWriteForm(next);
  const bl = b.layout;
  const nl = n.layout;
  const bdg = bl.drawerGrid && typeof bl.drawerGrid === 'object' && !Array.isArray(bl.drawerGrid) ? bl.drawerGrid : {};
  const ndg = nl.drawerGrid && typeof nl.drawerGrid === 'object' && !Array.isArray(nl.drawerGrid) ? nl.drawerGrid : {};
  const mergedLayout = {
    ...bl,
    ...nl,
    drawerGrid: { ...bdg, ...ndg },
  };
  return {
    layout: mergedLayout,
    fields: mergeFieldsTree(b.fields, n.fields),
  };
}

/**
 * @param {Object} writeForm - full `{ layout, fields }`
 * @returns {{ main: string[], nested: Record<string, string[]>, object: Record<string, string[]> }}
 */
export function deriveEditableColumns(writeForm) {
  const main = [];
  const nestedMap = {};
  const objectMap = {};
  const fieldTree = getWriteFormFields(writeForm);
  for (const [key, node] of Object.entries(fieldTree)) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) continue;
    if (isTableNode(node) && node.fields) {
      const cols = [];
      for (const [col, child] of Object.entries(node.fields)) {
        if (isWriteFormFieldEditable(child)) cols.push(col);
      }
      nestedMap[key] = cols;
    } else if (isObjectGroupNode(node)) {
      const keys = [];
      for (const [sub, child] of Object.entries(node.fields)) {
        if (isWriteFormFieldEditable(child)) keys.push(sub);
      }
      if (keys.length) {
        objectMap[key] = keys;
        main.push(key);
      }
    } else if (isWriteFormFieldEditable(node)) {
      main.push(key);
    }
  }
  return { main, nested: nestedMap, object: objectMap };
}

/**
 * Columns whose writeForm nodes are display-only (`edit: false` and `write: false`).
 * @param {Object} writeForm - full `{ layout, fields }`
 * @returns {{ main: string[], nested: Record<string, string[]>, object: Record<string, string[]> }}
 */
export function deriveReadOnlyDisplayColumns(writeForm) {
  const main = [];
  const nestedMap = {};
  const objectMap = {};
  const fieldTree = getWriteFormFields(writeForm);
  for (const [key, node] of Object.entries(fieldTree)) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) continue;
    if (isTableNode(node) && node.fields) {
      const cols = [];
      for (const [col, child] of Object.entries(node.fields)) {
        if (isWriteFormFieldReadOnlyDisplay(child)) cols.push(col);
      }
      nestedMap[key] = cols;
    } else if (isObjectGroupNode(node)) {
      const keys = [];
      for (const [sub, child] of Object.entries(node.fields)) {
        if (isWriteFormFieldReadOnlyDisplay(child)) keys.push(sub);
      }
      if (keys.length) {
        objectMap[key] = keys;
        main.push(key);
      }
    } else if (isWriteFormFieldReadOnlyDisplay(node)) {
      main.push(key);
    }
  }
  return { main, nested: nestedMap, object: objectMap };
}

/**
 * @param {Object} writeForm
 * @returns {{ main: Record<string,*>, nested: Record<string, Record<string,*>>, object: Record<string, Record<string,*>> }}
 */
export function deriveFormInputOverride(writeForm) {
  const main = {};
  const nested = {};
  const object = {};
  const fieldTree = getWriteFormFields(writeForm);
  for (const [key, node] of Object.entries(fieldTree)) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) continue;
    if (isTableNode(node) && node.fields) {
      const row = {};
      for (const [col, child] of Object.entries(node.fields)) {
        if (child && 'input' in child && child.input != null) row[col] = child.input;
      }
      if (Object.keys(row).length) nested[key] = row;
    } else if (isObjectGroupNode(node)) {
      const row = {};
      for (const [sub, child] of Object.entries(node.fields)) {
        if (child && 'input' in child && child.input != null) row[sub] = child.input;
      }
      if (Object.keys(row).length) object[key] = row;
    } else if ('input' in node && node.input != null) {
      main[key] = node.input;
    }
  }
  return { main, nested, object };
}

/**
 * @param {Object} writeForm
 * @returns {Array<{ parentCol: string, col: string }>}
 */
export function collectSelectPrefetchTargets(writeForm) {
  const out = [];
  const fieldTree = getWriteFormFields(writeForm);
  if (!fieldTree || typeof fieldTree !== 'object') return out;

  function visitInput(parentCol, col, input) {
    if (!input) return;
    if (typeof input === 'object' && input.type === 'Select' && (input.getOptions || input.getOptionsCode)) {
      out.push({ parentCol, col });
    }
  }

  for (const [key, node] of Object.entries(fieldTree)) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) continue;
    if (isTableNode(node) && node.fields) {
      for (const [col, child] of Object.entries(node.fields)) {
        visitInput(key, col, child?.input);
      }
    } else if (isObjectGroupNode(node)) {
      for (const [sub, child] of Object.entries(node.fields)) {
        visitInput('object', `${key}::${sub}`, child?.input);
      }
    } else {
      visitInput('main', key, node.input);
    }
  }
  return out;
}

/**
 * @param {Object} writeForm - full `{ layout, fields }`
 * @param {string[]} path - segment keys under `fields`, e.g. ['child_item_table']
 * @returns {*|null} node or null
 */
export function getNodeAtPath(writeForm, path) {
  if (!writeForm || typeof writeForm !== 'object') return null;
  const fieldTree = getWriteFormFields(writeForm);
  if (!path || path.length === 0) return fieldTree;
  let cur = fieldTree;
  for (const seg of path) {
    if (!cur || typeof cur !== 'object') return null;
    cur = cur[seg];
  }
  return cur ?? null;
}

/**
 * Schema shape used by bulk save helpers when query `writeSchema` is absent.
 * @param {Object} writeForm
 * @returns {{ mainFields: string[], childTables: Record<string, string[]> }}
 */
export function deriveSchemaStructureFromWriteForm(writeForm) {
  const mainFields = [];
  const childTables = {};
  const fieldTree = getWriteFormFields(writeForm);
  if (!fieldTree || typeof fieldTree !== 'object') {
    return { mainFields, childTables };
  }
  for (const [key, node] of Object.entries(fieldTree)) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) continue;
    if (isTableNode(node) && node.fields && typeof node.fields === 'object') {
      childTables[key] = Object.keys(node.fields);
    } else {
      mainFields.push(key);
    }
  }
  return { mainFields, childTables };
}

/**
 * @param {Object} writeForm
 */
export function materializeWriteFormRuntime(writeForm) {
  const wf = writeForm && typeof writeForm === 'object' ? writeForm : {};
  return {
    editableColumns: deriveEditableColumns(wf),
    readOnlyDisplayColumns: deriveReadOnlyDisplayColumns(wf),
    formInputOverride: deriveFormInputOverride(wf),
  };
}
