import { resolveApiConfig } from './apiRegistry.js';
import { parseGraphQLVariables } from '@/app/graphql-playground/utils/variableParser';
import { deepMerge, setPath, getPath } from './varUtils.js';
import { reportGraphQLFailure, reportGraphQLErrors } from '@/lib/graphqlErrorReport';

// ─── Field type map ───────────────────────────────────────────────────────────

const FIELDTYPE_MAP = {
  Int:      { type: 'number',  filterType: 'numeric' },
  Float:    { type: 'number',  filterType: 'numeric' },
  Currency: { type: 'number',  filterType: 'numeric' },
  Percent:  { type: 'number',  filterType: 'numeric' },
  Date:     { type: 'date',    filterType: 'date'    },
  Datetime: { type: 'date',    filterType: 'date'    },
  Check:    { type: 'boolean', filterType: 'boolean' },
};

// ─── Private data helpers ─────────────────────────────────────────────────────

const NUMERIC_RANGE_RE    = /^(-?\d+(?:\.\d+)?)\s*<>\s*(-?\d+(?:\.\d+)?)$/;
const NUMERIC_OPERATOR_RE = /^(<=|>=|<|>|=)\s*(-?\d+(?:\.\d+)?)$/;

function _matchesNumeric(cellValue, raw) {
  const num = Number(cellValue);
  if (isNaN(num)) return false;
  const s = String(raw).trim();
  const range = s.match(NUMERIC_RANGE_RE);
  if (range) return num >= Number(range[1]) && num <= Number(range[2]);
  const op = s.match(NUMERIC_OPERATOR_RE);
  if (op) {
    const n = Number(op[2]);
    if (op[1] === '<')  return num <  n;
    if (op[1] === '>')  return num >  n;
    if (op[1] === '<=') return num <= n;
    if (op[1] === '>=') return num >= n;
    if (op[1] === '=')  return num === n;
  }
  const plain = Number(s);
  return !isNaN(plain) && num === plain;
}

function _filter(rows, filters) {
  if (!filters || Object.keys(filters).length === 0) return rows;
  return rows.filter(row => {
    for (const [field, filterValue] of Object.entries(filters)) {
      if (!filterValue) continue;
      const { type, value } = filterValue;
      if (value === null || value === undefined || value === '') continue;
      const cell = row[field]?.value;
      switch (type) {
        case 'text':
          if (!String(cell ?? '').toLowerCase().includes(String(value).toLowerCase())) return false;
          break;
        case 'numeric':
          if (!_matchesNumeric(cell, value)) return false;
          break;
        case 'multiselect':
          if (Array.isArray(value) && value.length && !new Set(value).has(cell)) return false;
          break;
        case 'date': {
          const d = cell instanceof Date ? cell : new Date(cell);
          if (isNaN(d)) return false;
          if (value.start && d < new Date(value.start)) return false;
          if (value.end   && d > new Date(value.end))   return false;
          break;
        }
        case 'boolean':
          if (value !== null && Boolean(cell) !== value) return false;
          break;
      }
    }
    return true;
  });
}

function _sort(rows, sortMeta) {
  if (!sortMeta?.length) return rows;
  return [...rows].sort((a, b) => {
    for (const { field, order } of sortMeta) {
      const av = a[field]?.value, bv = b[field]?.value;
      let cmp = 0;
      if (av == null)                                                    cmp = bv == null ? 0 : -1;
      else if (bv == null)                                               cmp = 1;
      else if (typeof av === 'number' && typeof bv === 'number')         cmp = av - bv;
      else if (av instanceof Date || (typeof av === 'string' && !isNaN(Date.parse(av)))) cmp = new Date(av) - new Date(bv);
      else if (typeof av === 'boolean')                                  cmp = av === bv ? 0 : av ? 1 : -1;
      else cmp = String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' });
      if (cmp !== 0) return cmp * order;
    }
    return 0;
  });
}

function _paginate(rows, { first, rows: perPage }) {
  return { rows: rows.slice(first, first + perPage), totalRecords: rows.length };
}

/** A row's own label segment. _parseFrappeResponse already resolved this from
 *  label/label2/... so it holds the row's own value at every depth. */
function _ownLabel(row) {
  const cell = row.label;
  return cell?.value ?? cell ?? '';
}

/**
 * @param {object[]} flatRows
 * @param {string[]|null} pathDimensions — group_by as ReportDimension enums. When
 *   given, every row is stamped with `_path`: its own ancestor chain as
 *   [{ dimension, value }], which is exactly what reportDrillDown's parent_path
 *   wants. Built from the nesting stack here rather than reconstructed from
 *   rendered labels later, where the flat/pivot label split and formatStep's
 *   { value, repr } wrapping both have to be guessed at.
 */
function _nestRows(flatRows, pathDimensions = null) {
  const roots = [];
  const stack = [];
  for (const raw of flatRows) {
    const row = { ...raw };
    const depth = row.indent ?? 0;
    if (pathDimensions) {
      const labels = [...stack.slice(0, depth).map(_ownLabel), _ownLabel(row)];
      row._path = labels
        .map((value, i) => ({ dimension: pathDimensions[i], value }))
        .filter(entry => entry.dimension);
    }
    if (row.is_group) {
      row._children = [];
      stack.length = depth;
      const parent = depth > 0 ? stack[depth - 1] : null;
      (parent ? parent._children : roots).push(row);
      stack[depth] = row;
    } else {
      const parent = stack[stack.length - 1] ?? null;
      (parent ? parent._children : roots).push(row);
    }
  }
  return roots;
}

// ─── Value formatters ─────────────────────────────────────────────────────────

const _INR_FMT = new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR',
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});
const _NUM_FMT = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});

const _identity = (v) => ({ value: v, repr: v });

const _right = 'block text-right tabular-nums';

const _DEFAULT_FORMATTERS = {
  Currency: (n) => ({ value: n, repr: <span className={_right}>{_INR_FMT.format(n)}</span> }),
  Float:    (n) => ({ value: n, repr: <span className={_right}>{_NUM_FMT.format(n)}</span> }),
  Int:      (n) => ({ value: n, repr: <span className={_right}>{n}</span> }),
  Percent:  (n) => ({ value: n, repr: <span className={_right}>{n}%</span> }),
};

// ─── Frappe Query Report response parser ──────────────────────────────────────
//
// Ports to_api() from client-script/sales-api.py:
//   - Single O(n_cols) pass to classify columns
//   - Pre-computes pivot tuples once (not per row)
//   - Single O(n_rows) pass to normalise labels
//
// Returns { columns, columnGroups, rows } in SmartDataTable pipeline format.
// formatStep() will wrap raw cell values into { value, repr } after this.

function _parseFrappeResponse(frappeColumns, result, selectedColumns) {
  const monthGroups = {};  // { 'YYYY-MM': [{ field, label, type }] }
  const flatChildren = [];
  const metricDefs   = {};  // field → def  (totals group reuses these)
  const labelKeys    = [];  // ['label', 'label2', ...]
  const labelColDefs = [];  // [{ field: 'label', header: 'Department' }, { field: 'label2', header: 'HQ' }, ...]

  const allowedMetrics = selectedColumns?.length ? new Set(selectedColumns) : null;
  const SKIP = new Set(['_meta', 'level', 'indent', 'is_group']);

  for (const c of frappeColumns) {
    const fn = c.fieldname;
    if (!fn || SKIP.has(fn) || c.hidden) continue;
    if (fn.startsWith('label')) { labelKeys.push(fn); labelColDefs.push({ field: fn, header: c.label ?? fn }); continue; }
    if (fn.startsWith('total_')) continue;  // rebuilt from metricDefs below

    // Detect metric_YYYY_MM — same 3-part split as sales-api.py
    const parts = fn.split('_');
    const last  = parts.at(-1);
    const penult = parts.at(-2);
    const isMonth = parts.length >= 3
      && penult?.length === 4 && /^\d+$/.test(penult)
      && last?.length  === 2 && /^\d+$/.test(last);

    if (isMonth) {
      const field    = parts.slice(0, -2).join('_');
      if (allowedMetrics && !allowedMetrics.has(field)) continue;
      const monthKey = `${penult}-${last}`;
      // "May 2025 Qty" → split on ' ' → take from index 2 (mirrors sales-api.py lp[2])
      const lp     = (c.label ?? '').split(' ');
      const mLabel = lp.length >= 3 ? lp.slice(2).join(' ') : (c.label ?? fn);
      const mdef   = { field, label: mLabel, type: c.fieldtype };
      (monthGroups[monthKey] ??= []).push(mdef);
      metricDefs[field] ??= mdef;
    } else {
      flatChildren.push({ field: fn, label: c.label ?? fn, type: c.fieldtype });
    }
  }

  const isPivot = Object.keys(monthGroups).length > 0;
  const months  = Object.keys(monthGroups).sort();

  // ── Build columns + columnGroups ──────────────────────────────────────────

  function _toCol(field, label, fieldtype, width) {
    return {
      field,
      header:     label,
      sortable:   true,
      filterable: true,
      _fieldtype: fieldtype ?? 'Data',
      ...(FIELDTYPE_MAP[fieldtype] ?? { type: 'string', filterType: 'text' }),
      ...(width ? { width: `${width}px` } : {}),
    };
  }

  // label column — always first
  const labelColDef = frappeColumns.find(c => c.fieldname === 'label');
  const labelCol    = _toCol('label', labelColDef?.label ?? 'Name', 'Data', labelColDef?.width);

  let columns, columnGroups;

  if (!isPivot) {
    columns = [
      labelCol,
      ...flatChildren.map(c => _toCol(c.field, c.label, c.type)),
    ];
    columnGroups = null;
  } else {
    const MONTH_NAMES = { '01':'Jan','02':'Feb','03':'Mar','04':'Apr','05':'May','06':'Jun',
                          '07':'Jul','08':'Aug','09':'Sep','10':'Oct','11':'Nov','12':'Dec' };

    const flatCols = flatChildren.map(c => _toCol(c.field, c.label, c.type));
    columns      = [labelCol, ...flatCols];
    columnGroups = [{
      id:     'identity',
      label:  '',
      fields: flatChildren.map(c => c.field),
    }];

    for (const m of months) {
      const [year, mon] = m.split('-');
      const groupLabel  = `${MONTH_NAMES[mon] ?? mon} ${year}`;
      const fields      = [];
      for (const def of monthGroups[m]) {
        columns.push(_toCol(def.field + '_' + m.replace('-', '_'), def.label, def.type));
        fields.push(def.field + '_' + m.replace('-', '_'));
      }
      columnGroups.push({ id: m, label: groupLabel, fields });
    }

    // Totals group — mirrors to_api()'s total_field_map
    const totalFields = [];
    for (const fk of Object.keys(metricDefs)) {
      const def = metricDefs[fk];
      columns.push(_toCol('total_' + fk, 'Total ' + def.label, def.type));
      totalFields.push('total_' + fk);
    }
    columnGroups.push({ id: 'totals', label: 'Total', fields: totalFields });
  }

  // ── Normalise rows (O(n_rows), no per-field string ops) ───────────────────
  //
  // Mirrors to_api()'s label_keys iteration.
  // Raw field values are left as-is; formatStep() wraps them into { value, repr }.

  const rows = result.map(row => {
    let label = '';
    for (const lk of labelKeys) {
      if (row[lk]) { label = row[lk]; break; }
    }
    return label !== row.label ? { ...row, label } : row;
  });

  return { columns, columnGroups, rows, labelColDefs };
}

// ─── Pipeline ─────────────────────────────────────────────────────────────────

/**
 * Wraps raw cell values into { value, repr } objects so the table can
 * display formatted strings while filter/sort operate on the underlying value.
 */
export function formatStep(formatters = {}) {
  const active = { ..._DEFAULT_FORMATTERS, ...formatters };

  const step = (state) => {
    const fieldFmt = {};
    for (const col of (state.columns ?? [])) {
      fieldFmt[col.field] = (col._fieldtype && active[col._fieldtype]) ?? _identity;
    }

    const fields = Object.keys(fieldFmt);
    if (fields.length === 0) return state;

    const rows = state.rows.map(row => {
      const out = { ...row };
      for (const field of fields) {
        const raw = row[field];
        out[field] = raw != null ? fieldFmt[field](raw) : { value: null, repr: null };
      }
      return out;
    });

    const columns = state.columns.map(col => {
      if (col.footer != null) {
        return { ...col, footer: fieldFmt[col.field]?.(col.footer) ?? _identity(col.footer) };
      }
      return col;
    });

    return { ...state, rows, columns };
  };
  step.stepName = 'format';
  return step;
}

/** Snapshots rows into state.allRows before any filtering. */
export const captureAllRowsStep = (state) => ({ ...state, allRows: state.rows });

/** Applies sidebar multiselect filters stored in viewParams._sidebar.filters (client-side). */
export const sidebarFilterStep = (state, { viewParams }) => {
  const filters = viewParams?._sidebar?.filters;
  if (!filters || Object.keys(filters).length === 0) return state;
  const rows = state.rows.filter(row =>
    Object.entries(filters).every(([field, values]) => {
      if (!values?.length) return true;
      const cell = row[field];
      const str = cell != null && typeof cell === 'object' && 'value' in cell
        ? (cell.value != null ? String(cell.value) : '')
        : String(cell ?? '');
      return values.includes(str);
    })
  );
  return { ...state, rows };
};

/** Applies sidebar sort stored in viewParams._sidebar.sort. */
export const sidebarSortStep = (state, { viewParams }) => {
  const s = viewParams?._sidebar?.sort;
  if (!s?.field) return state;
  const dir = s.direction === 'desc' ? -1 : 1;
  const rows = [...state.rows].sort((a, b) => {
    const av = a[s.field]?.value ?? a[s.field];
    const bv = b[s.field]?.value ?? b[s.field];
    if (av == null) return bv == null ? 0 : -dir;
    if (bv == null) return dir;
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
    if (!isNaN(Date.parse(av))) return (new Date(av) - new Date(bv)) * dir;
    return String(av).localeCompare(String(bv)) * dir;
  });
  return { ...state, rows };
};

/** Applies active table column filters to state.rows. */
export const filterStep = (state, { filters }) => ({
  ...state,
  rows: _filter(state.rows, filters),
});

/** Sorts state.rows by sortMeta. */
export const sortStep = (state, { sortMeta }) => ({
  ...state,
  rows: _sort(state.rows, sortMeta),
});

/**
 * Fallback for backends that return a single `label` field with slash-separated
 * ancestor paths (e.g. "Department / HQ / Customer" at indent 2).
 * Rewrites each row's label to its own segment (last part) and synthesises
 * labelColDefs entries for every depth so all downstream label/export logic
 * works identically to the multi-label case.
 * Must run after graphqlFetch (needs filterDefs) and before formatStep (label still a raw string).
 */
/**
 * When the backend returns a single `label` column whose header is slash-separated
 * (e.g. "Department / HQ / Customer"), split it into per-depth labelColDefs so all
 * downstream label-header and export logic works identically to the multi-label case.
 * Row values are not modified — each row already has its own value in `label`.
 */
export const expandSlashLabelsStep = (state) => {
  if (state.labelColDefs?.length !== 1) return state;
  const header = state.labelColDefs[0]?.header ?? '';
  if (!header.includes(' / ')) return state;

  const labelColDefs = header.split(' / ').map(h => ({ field: 'label', header: h.trim() }));
  const columns = (state.columns ?? []).map(col =>
    col.field === 'label' ? { ...col, header: labelColDefs[0].header } : col
  );
  return { ...state, columns, labelColDefs };
};

/**
 * Extend per-depth label headers to cover every level of the tree.
 *
 * A response only describes the levels it returned, so under drill-down the
 * deeper levels have no entry and fall back to the label column's own header --
 * every drilled table reading "Department". The rest are filled in from the
 * client's own group_by, which is the same list the drill-down calls slice from.
 * Existing entries win, so a header the server named is kept.
 */
function _padLabelColDefs(labelColDefs = [], fullGroupBy = []) {
  if (labelColDefs.length >= fullGroupBy.length) return labelColDefs;
  const padded = [...labelColDefs];
  for (let i = labelColDefs.length; i < fullGroupBy.length; i += 1) {
    const header = ENUM_TO_DIMENSION_LABEL[fullGroupBy[i]];
    if (!header) break;
    padded.push({ field: 'label', header });
  }
  return padded;
}

/**
 * Converts flat indent-based rows into a parent→_children tree.
 *
 * `expandable` normally means "some row in this result has children", which is
 * the right test when the whole tree arrived in one response. Under drill-down
 * a row's children have not been fetched yet, so that test is always false and
 * the expander column would never render at all -- hence the override.
 */
export const nestStep = (state) => {
  const pathDimensions = state.drillDownMeta ? state.groupByEnums : null;
  const rows = _nestRows(state.rows, pathDimensions);

  // labelColDefs describes only the levels this response fetched, so under
  // drill-down the deeper levels have no entry and each falls back to the label
  // column's own header -- every drilled table reading "Department". Pad it out
  // to the full tree so `labelColDefs[depth]` names the right dimension all the
  // way down. Runs here rather than in the fetch step because
  // expandSlashLabelsStep rewrites labelColDefs in between.
  const labelColDefs = state.drillDownMeta
    ? _padLabelColDefs(state.labelColDefs, state.drillDownMeta.fullGroupBy)
    : state.labelColDefs;

  return {
    ...state,
    rows,
    labelColDefs,
    expandable: !!state.drillDownMeta || rows.some(r => r._children?.length > 0),
  };
};

/** Sets totalRecords from server meta_pagination. Rows already paged by the server. Terminal step. */
export const paginateStep = (state) => ({
  ...state,
  totalRecords: state.metaPagination?.total_roots ?? state.rows.length,
});

// ─── Pipeline composer ────────────────────────────────────────────────────────

/**
 * Composes steps into a DataSourceFn.
 *
 * @param {Function[]} steps
 * @param {object} [extraResult]
 * @returns {DataSourceFn}
 */
export function buildPipeline(steps, extraResult = {}) {
  const run = async (params) => {
    let state = { rows: [] };
    for (const step of steps) {
      state = await step(state, params);
      params._debugCapture?.(step.stepName ?? step.name, state);
    }
    return { ...state, ...extraResult };
  };
  return run;
}

// ─── GraphQL Custom Report data source ───────────────────────────────────────
//
// Controls write outputs to viewParams._controls[key] via setControlOutput.
// api.variablesMap maps 'controls.{key}.{outputKey}' / 'sort' / 'pagination.*' → variable paths.
// The resolved flat vars are translated to customReportV2's structured input
// by buildCustomReportV2Input() just before the fetch.

// ─── customReportV2 input translation ────────────────────────────────────────
//
// Maps the flat V1-shaped `filters` blob (still produced by resolveVariablesMap
// from the unchanged Firestore reportConfig) into customReportV2's structured,
// registry-validated `input`. Enum names mirror report_registry.py's
// to_enum_name() output for the real sales_config in report_config.py.

const DIMENSION_LABEL_TO_ENUM = {
  Department: 'DEPARTMENT', HQ: 'HQ', Customer: 'CUSTOMER', Item: 'ITEM',
  Brand: 'BRAND', Warehouse: 'WAREHOUSE', 'Batch No': 'BATCH_NO',
  'Item Group': 'ITEM_GROUP', Territory: 'TERRITORY', Invoice: 'INVOICE',
};

const FILTER_KEY_TO_DIMENSION_ENUM = {
  department: 'DEPARTMENT', hq: 'HQ', customer: 'CUSTOMER', item: 'ITEM',
  brand: 'BRAND', warehouse: 'WAREHOUSE', batch_no: 'BATCH_NO',
  item_group: 'ITEM_GROUP', territory: 'TERRITORY', invoice: 'INVOICE',
};

const METRIC_KEY_TO_ENUM = {
  target_value: 'TARGET_VALUE', target_pct: 'TARGET_PCT', qty: 'QTY',
  net_primary: 'NET_PRIMARY', gross_primary: 'GROSS_PRIMARY',
  inc_primary: 'INC_PRIMARY', credit_note: 'CREDIT_NOTE', expired: 'EXPIRED',
  breakage: 'BREAKAGE', sales_return: 'SALES_RETURN', prod_offer: 'PROD_OFFER',
  inv_offer: 'INV_OFFER', claim: 'CLAIM',
};

// Canonical dimension order for the sidebar. Under customReportV2 the server no
// longer reports which dimensions exist -- options.include_filter_values is
// deprecated and _meta.meta_filter_values is always {} -- so the tab list comes
// from this registry mirror instead of from the response.
const ALL_FILTER_KEYS = Object.keys(FILTER_KEY_TO_DIMENSION_ENUM);

const ENUM_TO_DIMENSION_LABEL = Object.fromEntries(
  Object.entries(DIMENSION_LABEL_TO_ENUM).map(([label, dimEnum]) => [dimEnum, label]),
);

/** Filter key to sidebar label: hq -> HQ, batch_no -> Batch no. */
function _dimensionLabel(key) {
  return key.toUpperCase() === key || key === 'hq'
    ? key.toUpperCase()
    : key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
}

const V2_FILTER_DEFS = ALL_FILTER_KEYS.map(key => ({ key, label: _dimensionLabel(key) }));

const REPORT_API_VERSIONS = new Set(['v1', 'v2']);
const DEFAULT_REPORT_API_VERSION = 'v1';

// Levels the initial customReportV2 call asks for when drill-down is on. Two
// renders a useful first screen; the measured cost is flat up to three levels
// and only explodes below that.
const DEFAULT_INITIAL_DEPTH = 2;

/** The reportApiVersion a config resolves to, defaulting to v1. */
export function resolveReportApiVersion(rawApiConfig) {
  return REPORT_API_VERSIONS.has(rawApiConfig?.reportApiVersion)
    ? rawApiConfig.reportApiVersion
    : DEFAULT_REPORT_API_VERSION;
}

/**
 * Drill-down settings for a view, or null when it does not apply.
 *
 * reportDrillDown is a sibling of customReportV2 and has no v1 equivalent -- v1's
 * customReport returns a different envelope entirely -- so `api.drillDown` is
 * ignored unless the view also resolves to v2. Every drill-down branch in this
 * module and in the provider goes through this one function, so the gate exists
 * in a single place rather than being re-derived at each call site.
 *
 * Callers must pass the *view's* resolved api config. reportApiVersion can be
 * overridden per view inside views.<id>.api, so a report may legitimately mix a
 * v2 drill-down view with a v1 one.
 */
export function resolveDrillDown(rawApiConfig) {
  const drillDown = rawApiConfig?.drillDown;
  if (!drillDown?.enabled) return null;
  if (resolveReportApiVersion(rawApiConfig) !== 'v2') {
    console.warn('[drillDown] ignored — the view is not on reportApiVersion "v2"');
    return null;
  }
  const depth = drillDown.initialDepth;
  return {
    initialDepth: Number.isInteger(depth) && depth > 0 ? depth : DEFAULT_INITIAL_DEPTH,
    includeChildCounts: drillDown.includeChildCounts !== false,
  };
}

/** group_by as ReportDimension enums, unsliced. */
export function groupByEnumsOf(gqlVars) {
  return _toList((gqlVars.filters ?? {}).group_by)
    .map(label => {
      const dimEnum = DIMENSION_LABEL_TO_ENUM[label];
      if (!dimEnum) console.warn(`[customReportV2] unrecognized group_by dimension "${label}" — dropping`);
      return dimEnum;
    })
    .filter(Boolean);
}

function _toList(value) {
  if (value == null || value === '') return [];
  if (Array.isArray(value)) return value;
  return String(value).split(',').map(v => v.trim()).filter(Boolean);
}

/** Build the `sort` array for customReportV2 from V1's `sort_by` "field:dir,..." string. */
function _buildSortInput(sortBy, groupByEnums) {
  const pairs = _toList(sortBy).map(entry => {
    const [field, dir] = entry.split(':');
    return { field: field?.trim(), direction: (dir || 'asc').trim().toUpperCase() };
  }).filter(p => p.field);

  const out = [];
  for (const { field, direction } of pairs) {
    if (field === 'label') {
      if (groupByEnums[0]) out.push({ dimension: groupByEnums[0], direction });
      continue;
    }
    const dimEnum = FILTER_KEY_TO_DIMENSION_ENUM[field];
    if (dimEnum) {
      if (groupByEnums.includes(dimEnum)) out.push({ dimension: dimEnum, direction });
      else console.warn(`[customReportV2] sort field "${field}" is not in group_by — dropping (would raise SORT_DIMENSION_NOT_GROUPED)`);
      continue;
    }
    const metricEnum = METRIC_KEY_TO_ENUM[field];
    if (metricEnum) { out.push({ metric: metricEnum, direction }); continue; }
    console.warn(`[customReportV2] unrecognized sort field "${field}" — dropping`);
  }
  return out;
}

/**
 * Translate the flat V1-shaped gqlVars (`{ filters: {...}, sort_by, page, limit }`)
 * into customReportV2's structured `CustomReportV2Input`.
 */
export function buildCustomReportV2Input(gqlVars, drillDown = null) {
  const filters = gqlVars.filters ?? {};

  // Under drill-down the initial call asks for the top levels only; the rest of
  // the tree arrives one node at a time. Sorting is resolved against the sliced
  // list too, so a sort on a level this call no longer groups by is dropped
  // rather than sent and rejected.
  const allGroupByEnums = groupByEnumsOf(gqlVars);
  const groupByEnums = drillDown
    ? allGroupByEnums.slice(0, drillDown.initialDepth)
    : allGroupByEnums;

  const metricEnums = _toList(filters.selected_columns).map(key => {
    const metricEnum = METRIC_KEY_TO_ENUM[key];
    if (!metricEnum) console.warn(`[customReportV2] unrecognized metric "${key}" — dropping`);
    return metricEnum;
  }).filter(Boolean);

  const dimensionFilters = Object.entries(FILTER_KEY_TO_DIMENSION_ENUM)
    .filter(([key]) => filters[key] != null && filters[key] !== '' && !(Array.isArray(filters[key]) && filters[key].length === 0))
    .map(([key, dimEnum]) => ({
      dimension: dimEnum,
      operator: 'IN',
      values: _toList(filters[key]),
    }));

  const sort = _buildSortInput(gqlVars.sort_by, groupByEnums);

  const input = {
    report: 'SALES',
    date_range: { from_date: filters.from_date, to_date: filters.to_date },
    group_by: groupByEnums,
    options: {
      pivot: !!filters.pivot_by_month,
      pivot_period: (filters.pivot_period || 'Month').toUpperCase(),
      display_in_lakhs: !!filters.display_in_lakhs,
      include_total_row: true,
      include_today_totals: true,
      // No include_filter_values: the server accepts it and ignores it. It used
      // to cost one full-range GROUP BY per dimension, all of which the report
      // had to wait on -- 5.4x the cost of the rest of the report. Dropdown
      // values come from the reportFilterValues query instead, one dimension at
      // a time, when a dropdown is actually opened.
    },
    page: gqlVars.page,
    limit: gqlVars.limit,
  };

  if (metricEnums.length)    input.metrics = metricEnums;
  if (dimensionFilters.length) input.dimension_filters = dimensionFilters;
  if (sort.length)           input.sort = sort;

  return input;
}

const CUSTOM_REPORT_V2_QUERY = `
  query CustomReportV2($input: CustomReportV2Input!) {
    customReportV2(input: $input) {
      report_meta
      edges { node }
    }
  }
`;

// ─── customReport (V1) — legacy query builder ────────────────────────────────
//
// Kept so a reportConfig can opt back into the old field via `api.reportApiVersion:
// 'v1'` — e.g. while a view's selected_columns/group_by hasn't been audited yet
// for v2's stricter metric/target-grouping validation.

// Infer a GQL type from a JS value when variableTypes is not provided.
function _inferGqlType(value) {
  if (value === null || value === undefined) return 'JSON';
  if (Array.isArray(value))               return 'JSON';
  if (typeof value === 'boolean')         return 'Boolean';
  if (typeof value === 'number')          return Number.isInteger(value) ? 'Int' : 'Float';
  if (typeof value === 'string')          return 'String';
  return 'JSON';
}

/**
 * Build the V1 customReport query string dynamically from the resolved variables.
 * When variableTypes is omitted, types are inferred from the variable values.
 * 'filters' is always routed into run_report[{ filters: $filters }]; all other keys are direct args.
 */
function buildCustomReportV1Query(variables, variableTypes) {
  const paramDecls = Object.keys(variables).map(k => {
    const type = variableTypes?.[k] ?? _inferGqlType(variables[k]);
    return `$${k}: ${type}`;
  }).join(', ');

  const directArgs = Object.keys(variables)
    .filter(k => k !== 'filters')
    .map(k => `${k}: $${k}`)
    .join(' ');

  return `
    query CustomReport(${paramDecls}) {
      customReport(${directArgs} run_report: [{ filters: $filters }]) {
        report_meta
        edges { node }
      }
    }
  `;
}

// Applied when api.variablesMap is not provided. Covers the standard control types.
const _DEFAULT_VARIABLES_MAP = {
  'controls.dateRange.start':      'filters.from_date',
  'controls.dateRange.end':        'filters.to_date',
  'controls.breakdown.value':      { path: 'filters.pivot_by_month', transform: v => v ? 1 : 0 },
  'controls.filterSort.filters':   { path: 'filters', merge: true },
  'sort':                          'sort_by',
  'pagination.page':               'page',
  'pagination.limit':              'limit',
};

/**
 * Resolve the final GQL variables object by applying api.variablesMap entries
 * on top of api.variables (baseVars).
 *
 * When variablesMap is omitted, _DEFAULT_VARIABLES_MAP is used for standard controls.
 * Default sort/pagination entries (sort_by, page, limit) are only applied when those
 * keys already exist in baseVars — avoids injecting unexpected variables into the query.
 *
 * Source key format:
 *   'controls.{key}.{outputKey}' → viewParams._controls[key][outputKey]
 *   'sort'                       → params.sortBy formatted as ['field:dir', ...]
 *   'pagination.page'            → computed page number
 *   'pagination.limit'           → pagination row count
 *
 * Mapping value:
 *   string              → dot-path target in variables (direct set)
 *   { path }            → same, explicit form
 *   { path, transform } → apply transform(value) before writing
 *   { path, merge:true} → shallow-merge object value into existing path
 */
export function resolveVariablesMap(baseVars, variablesMap, { controls, sortBy, pagination, viewParams = {} }) {
  const page  = Math.floor(pagination.first / pagination.rows) + 1;
  const limit = pagination.rows;

  const sortEntries = Object.entries(sortBy ?? {});
  const sortValue   = sortEntries.map(([f, d]) => `${f}:${d}`).join(',') || undefined;
  const sortField   = sortEntries[0]?.[0];
  const sortOrder   = sortEntries[0]?.[1];

  const builtInSources = {
    sort:              sortValue,
    'sort.field':      sortField,
    'sort.order':      sortOrder,
    'pagination.page':  page,
    'pagination.limit': limit,
  };

  let vars = deepMerge({}, baseVars);

  // When no explicit variablesMap, use defaults but skip sort/pagination entries
  // unless their target key already exists in baseVars (avoids polluting the query).
  const effectiveMap = variablesMap ?? _DEFAULT_VARIABLES_MAP;
  const isDefault    = !variablesMap;

  for (const [sourceKey, mapping] of Object.entries(effectiveMap)) {
    let value;
    if (sourceKey.startsWith('controls.')) {
      const rest = sourceKey.slice('controls.'.length);
      value = getPath(controls, rest);
    } else if (sourceKey.startsWith('viewParam.')) {
      const rest = sourceKey.slice('viewParam.'.length);
      value = getPath(viewParams, rest);
    } else {
      value = builtInSources[sourceKey];
    }

    if (value === undefined) continue;

    // When using defaults, don't add sort_by / page / limit if not in baseVars.
    if (isDefault) {
      const targetRoot = (typeof mapping === 'string' ? mapping : mapping.path).split('.')[0];
      if ((sourceKey === 'sort' || sourceKey.startsWith('sort.') || sourceKey.startsWith('pagination.')) && !(targetRoot in baseVars)) continue;
    }

    const { path, transform, merge } =
      typeof mapping === 'string' ? { path: mapping } : mapping;

    const finalVal = transform ? transform(value) : value;

    if (merge && finalVal && typeof finalVal === 'object') {
      vars = setPath(vars, path, { ...(getPath(vars, path) ?? {}), ...finalVal });
    } else {
      vars = setPath(vars, path, finalVal);
    }
  }

  return vars;
}

/** Resolve GQL variables for a report api config (same path as graphqlQueryReportDataSource). */
export async function resolveReportGqlVars(rawApiConfig, { viewParams, sortBy, pagination }) {
  const { variables: baseVars = {} } = await resolveApiConfig(rawApiConfig);
  const controls = viewParams?._controls ?? {};
  return resolveVariablesMap(baseVars, rawApiConfig.variablesMap, {
    controls,
    sortBy,
    pagination,
    viewParams: viewParams ?? {},
  });
}

/**
 * Resolve GQL variables for api.index fetch.
 * Base: saved query doc variables merged with api.indexVariables (api wins on conflict).
 * Then api.indexVariablesMap is applied on top (controls, sort, pagination).
 */
export function resolveIndexGqlVars(rawApiConfig, queryDoc, { viewParams, sortBy, pagination }) {
  const fromDoc = queryDoc?.variables
    ? parseGraphQLVariables(queryDoc.variables)
    : {};
  const baseVars = deepMerge(fromDoc, rawApiConfig.indexVariables ?? {});
  const controls = viewParams?._controls ?? {};
  return resolveVariablesMap(baseVars, rawApiConfig.indexVariablesMap ?? {}, {
    controls,
    sortBy,
    pagination,
    viewParams: viewParams ?? {},
  });
}

/**
 * @param {{ urlKey?: string, variables: object, variablesMap?: object, reportApiVersion?: 'v1'|'v2' }} rawApiConfig
 *   variables        — base GraphQL variables (report, filters, and any custom fields)
 *   variablesMap     — maps source keys (controls.*, sort, pagination.*) to variable dot-paths;
 *                      omit to use _DEFAULT_VARIABLES_MAP (dateRange, breakdown, filterSort)
 *   reportApiVersion — 'v1' (default, calls the legacy customReport field as-is) or
 *                      'v2' (translates the resolved flat vars into customReportV2's
 *                      structured input via buildCustomReportV2Input() before the
 *                      fetch). Defaults to 'v1' so existing/unaudited configs keep
 *                      today's behavior until a view explicitly opts in.
 */
export function graphqlQueryReportDataSource(rawApiConfig) {
  const version = resolveReportApiVersion(rawApiConfig);
  const drillDown = resolveDrillDown(rawApiConfig);

  const step = async (state, params) => {
    const { endpoint, token, variables: baseVars = {} } = await resolveApiConfig(rawApiConfig);

    const controls   = params.viewParams?._controls ?? {};
    const pagination = params.pagination ?? { first: 0, rows: 50 };

    const gqlVars  = resolveVariablesMap(baseVars, rawApiConfig.variablesMap, {
      controls,
      sortBy: params.sortBy,
      pagination,
      viewParams: params.viewParams ?? {},
    });

    const isV2 = version === 'v2';
    const v2Input = isV2 ? buildCustomReportV2Input(gqlVars, drillDown) : null;
    const query = isV2 ? CUSTOM_REPORT_V2_QUERY : buildCustomReportV1Query(gqlVars, rawApiConfig.variableTypes);
    const body  = isV2 ? { input: v2Input } : gqlVars;

    const res = await fetch(endpoint, {
      method:  'POST',
      headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ query, variables: body }),
    });
    // `body`, not gqlVars: on v2 the request carries the structured input, and
    // reporting the flat V1-shaped vars would describe a payload never sent.
    const errCtx = {
      source: 'graphqlQueryReportDataSource',
      operation: isV2 ? 'CustomReportV2' : 'CustomReport',
      endpoint, query, variables: body,
    };
    if (!res.ok) throw await reportGraphQLFailure(res, errCtx);
    const { data, errors } = await res.json();
    if (errors?.length) throw reportGraphQLErrors(errors, errCtx);

    const { report_meta, edges } = isV2 ? data.customReportV2 : data.customReport;
    const gqlColumns = report_meta[0]?.columns ?? [];
    const gqlRows    = edges.map(e => e.node).filter(node => !node._is_total_row);

    const metaCol         = gqlColumns.find(c => c.fieldname === '_meta');
    const filterValues    = metaCol?.meta_filter_values ?? {};
    const metaTotals      = metaCol?.meta_totals        ?? {};
    const metaTodayTotals = metaCol?.meta_today_totals  ?? {};
    const metaPagination  = metaCol?.meta_pagination    ?? null;

    const filters = gqlVars.filters ?? {};
    const { columns: rawColumns, columnGroups, rows, labelColDefs } = _parseFrappeResponse(gqlColumns, gqlRows, filters.selected_columns);

    // Attach meta_totals as raw footer values; formatStep() will wrap them into { value, repr }
    const columns = Object.keys(metaTotals).length > 0
      ? rawColumns.map(col => (metaTotals[col.field] != null ? { ...col, footer: metaTotals[col.field] } : col))
      : rawColumns;

    // V1 reports which dimensions exist through _meta. V2 no longer does --
    // meta_filter_values is always {} there -- so the tab list is static and the
    // values behind each tab are fetched on demand by fetchFilterValues.
    const filterDefs = isV2
      ? V2_FILTER_DEFS
      : Object.keys(filterValues).map(key => ({ key, label: _dimensionLabel(key) }));

    // groupByEnums is the sliced list this call actually grouped by, so a row's
    // _path indexes into it correctly. drillDown carries the full list separately
    // for the expand calls.
    return {
      ...state, columns, columnGroups, rows, filterValues, filterDefs, labelColDefs,
      metaTotals, metaTodayTotals, metaPagination, metaCol,
      // drillDownMeta, not drillDown: the store already has a `drillDown` key on
      // each view holding the fetched children, and one name for two things
      // invites splicing a config object where a node map is expected.
      drillDownMeta: drillDown && { ...drillDown, fullGroupBy: groupByEnumsOf(gqlVars) },
      groupByEnums: v2Input?.group_by ?? null,
    };
  };
  step.stepName = 'graphqlFetch';

  return buildPipeline([
    step,
    expandSlashLabelsStep,
    formatStep(),
    captureAllRowsStep,
    filterStep,
    nestStep,
    paginateStep,
  ]);
}

// ─── reportDrillDown — lazy tree expansion ───────────────────────────────────
//
// customReportV2 returns the whole subtree of every root on the page, which at
// five levels over a full year is ~204K rows and over a minute. The initial call
// asks for the top levels only (see resolveDrillDown) and one node's children
// are fetched from here when the user expands it.

const _GQL_REPORT_DRILL_DOWN = `
  query ReportDrillDown($input: ReportDrillDownInput!) {
    reportDrillDown(input: $input) {
      report_meta
      edges { node }
    }
  }
`;

/**
 * Build a ReportDrillDownInput from the same resolved vars the top-level call used.
 *
 * group_by is the FULL list, unsliced -- the server needs it to know how deep the
 * tree goes and to validate parent_path against it. Filters, metrics and sort are
 * forwarded unchanged: the server re-bases metric filter levels, drops sorts that
 * no longer apply, and strips target metrics once the slice is past HQ.
 */
/**
 * Stable identity for a node, for keying the fetched-children map.
 *
 * JSON rather than a joined string: a dimension value may contain anything a
 * user typed, and a slash or a pipe separator would collide two different nodes
 * onto one key -- splicing one node's children under another. JSON escaping
 * makes that impossible, and the key stays readable in devtools.
 */
export function drillDownKey(path) {
  return JSON.stringify((path ?? []).map(p => [p.dimension, p.value]));
}

/**
 * Does a server-echoed parent_path describe the node we asked about?
 *
 * Values only, positionally. The two sides spell dimensions differently and
 * always will: `parent_path` goes out as a ReportDimension enum ("DEPARTMENT"),
 * while `_meta.meta_parent_path` comes back as untyped JSON built from the
 * registry's internal key ("Department"). Comparing dimension names would mean
 * keeping two vocabularies in sync forever, and getting it wrong rejects every
 * successful response rather than none -- which is exactly what happened.
 *
 * Position already fixes which dimension each entry is, because parent_path must
 * be a prefix of group_by in order, so the values carry the whole identity.
 */
export function samePathValues(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((entry, i) => entry?.value === b[i]?.value);
}

export function buildDrillDownInput(gqlVars, path, {
  depth, includeChildCounts = true, page = 1, limit,
} = {}) {
  const base = buildCustomReportV2Input(gqlVars);

  const input = {
    report: base.report,
    date_range: base.date_range,
    group_by: base.group_by,
    parent_path: path.map(({ dimension, value }) => ({ dimension, value })),
    options: {
      ...base.options,
      // A branch is not the report. A grand-total row spliced under an expanded
      // node would read as that node's total, and today-totals are a page-level
      // summary the client already has from the initial call.
      include_total_row: false,
      include_today_totals: false,
    },
    page,
    limit: limit ?? gqlVars.limit,
  };

  if (base.metrics)           input.metrics = base.metrics;
  if (base.dimension_filters) input.dimension_filters = base.dimension_filters;
  if (base.sort)              input.sort = base.sort;
  if (depth != null)          input.depth = depth;
  if (!includeChildCounts)    input.include_child_counts = false;

  return input;
}

/**
 * Fetch one node's children.
 *
 * @param {object} rawApiConfig — the *view's* resolved api config
 * @param {object} gqlVars      — resolved vars from the top-level call
 * @param {{dimension: string, value: string}[]} path — the row's _path
 * @returns {Promise<{ rows, columns, columnGroups, labelColDefs, hasNextPage, parentPath }>}
 */
export async function graphqlFetchDrillDown(rawApiConfig, gqlVars, path, opts = {}) {
  const { endpoint, token } = await resolveApiConfig(rawApiConfig);
  const input = buildDrillDownInput(gqlVars, path, opts);

  const res = await fetch(endpoint, {
    method:  'POST',
    headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ query: _GQL_REPORT_DRILL_DOWN, variables: { input } }),
    signal:  opts.signal,
  });
  const errCtx = {
    source: 'graphqlFetchDrillDown',
    operation: `ReportDrillDown(${path.map(p => p.value).join(' / ')})`,
    endpoint, query: _GQL_REPORT_DRILL_DOWN, variables: { input },
  };
  if (!res.ok) throw await reportGraphQLFailure(res, errCtx);
  const { data, errors } = await res.json();
  if (errors?.length) throw reportGraphQLErrors(errors, errCtx);

  const { report_meta, edges } = data.reportDrillDown;
  const gqlColumns = report_meta[0]?.columns ?? [];
  const gqlRows    = edges.map(e => e.node).filter(node => !node._is_total_row);
  const metaCol    = gqlColumns.find(c => c.fieldname === '_meta');

  const filters = gqlVars.filters ?? {};
  const parsed = _parseFrappeResponse(gqlColumns, gqlRows, filters.selected_columns);

  // Same formatting the main pipeline applies, because the table renders every
  // cell as `row[field].repr`. _parseFrappeResponse deliberately leaves raw
  // values behind for formatStep to wrap into { value, repr } -- and the
  // drill-down rows never went through the pipeline, so without this they
  // arrive raw and every cell renders as an empty string.
  const { columns, rows: formattedRows } = formatStep()(parsed);

  // Stamp each child with its own ancestor chain, exactly as _nestRows does for
  // the main pipeline. Without it these rows have no _path, so makeCanExpand
  // reads their depth as 0 and they render with no expander -- the tree stops
  // dead at the first drilled level even though the server reports has_children.
  //
  // Only level 0 is stamped, which is every row while depth is 1 (what the
  // provider always requests). A deeper response would need the nesting stack,
  // and is not nested here either.
  const fullGroupBy = groupByEnumsOf(gqlVars);
  const childDimension = fullGroupBy[path.length];
  const rows = childDimension
    ? formattedRows.map(row => (
        (row.level ?? 0) === 0
          ? { ...row, _path: [...path, { dimension: childDimension, value: row.label?.value ?? row.label }] }
          : row
      ))
    : formattedRows;

  return {
    rows, columns, columnGroups: parsed.columnGroups, labelColDefs: parsed.labelColDefs,
    // Echoed back by the server so a response that lands after the user
    // collapsed or re-expanded the row can be discarded instead of spliced
    // under the wrong node.
    parentPath: metaCol?.meta_parent_path ?? null,
    hasMoreLevels: metaCol?.meta_has_more_levels ?? false,
    hasNextPage: metaCol?.meta_pagination?.has_next ?? false,
    page: metaCol?.meta_pagination?.page ?? 1,
  };
}

// ─── reportFilterValues — sidebar filter dropdowns ────────────────────────────
//
// customReportV2 used to compute these inline via options.include_filter_values:
// one full-range GROUP BY per dimension, with the report unable to return until
// every one finished. That option is deprecated and ignored; this query replaces
// it. Fetching one dimension when its dropdown opens is the intended usage --
// asking for all ten up front is what the split was meant to stop.

const _GQL_REPORT_FILTER_VALUES = `
  query ReportFilterValues($input: ReportFilterValuesInput!) {
    reportFilterValues(input: $input) {
      groups {
        filter_key
        values { value distinct_count line_count }
        truncated
      }
    }
  }
`;

/**
 * Fetches filter values for one sidebar dimension via the reportFilterValues query.
 * Used by SmartDataProvider.fetchFilterValues for views on reportApiVersion 'v2';
 * v1 views keep going through elbritFilterApi.
 *
 * @param {object} rawApiConfig — same shape as graphqlQueryReportDataSource (urlKey / endpoint / token / variables)
 * @param {string} key         — dimension key (e.g. "hq", "customer", "item_group")
 * @param {{ page?, pageLength?, search?, currentFilters?, dateRange?, includeCounts? }} opts
 *   includeCounts — false drops COUNT(DISTINCT)/COUNT(*), which lets the query stop at
 *                   `limit` distinct values instead of aggregating the whole range first
 *                   (~300x faster on high-cardinality dimensions). The sidebar's count
 *                   badge comes back null, so it is opt-in per call.
 * @returns {Promise<{ items: Array<{ value, label, count }>, hasMore: boolean }>}
 */
export async function graphqlFetchReportFilterValues(rawApiConfig, key, {
  page = 1, pageLength = 20, search = '', currentFilters = {}, dateRange = {}, includeCounts = true,
} = {}) {
  const dimension = FILTER_KEY_TO_DIMENSION_ENUM[key];
  if (!dimension) {
    console.warn(`[reportFilterValues] unknown dimension key "${key}" — returning no values`);
    return { items: [], hasMore: false };
  }

  const { endpoint, token, variables: baseVars = {} } = await resolveApiConfig(rawApiConfig);

  // date_range is non-null on the input type. The sidebar's date control is the
  // source of truth; api.variables.filters is the fallback for views without one.
  const baseFilters = baseVars.filters ?? {};
  const from_date = dateRange.from_date ?? baseFilters.from_date;
  const to_date   = dateRange.to_date   ?? baseFilters.to_date;
  if (!from_date || !to_date) {
    console.warn(`[reportFilterValues] no date range resolved for "${key}" — returning no values`);
    return { items: [], hasMore: false };
  }

  // Cross-filtering, so dropdowns narrow each other. The dimension's own filter is
  // left out: the server excludes it anyway, and sending it would fragment the
  // permission-scoped cache once per selection the user makes in that dropdown.
  const dimensionFilters = Object.entries(currentFilters)
    .filter(([k, v]) => k !== key && v?.length && FILTER_KEY_TO_DIMENSION_ENUM[k])
    .map(([k, v]) => ({ dimension: FILTER_KEY_TO_DIMENSION_ENUM[k], operator: 'IN', values: v }));

  const input = {
    report: 'SALES',
    date_range: { from_date, to_date },
    dimensions: [dimension],
    // The server has no offset — ask for everything up to this page and slice below.
    limit: page * pageLength,
    include_counts: includeCounts,
  };
  if (search)                  input.search = search;
  if (dimensionFilters.length) input.dimension_filters = dimensionFilters;

  const res = await fetch(endpoint, {
    method:  'POST',
    headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ query: _GQL_REPORT_FILTER_VALUES, variables: { input } }),
  });
  const errCtx = { source: 'graphqlFetchReportFilterValues', operation: `ReportFilterValues(${key})`, endpoint, query: _GQL_REPORT_FILTER_VALUES, variables: { input } };
  if (!res.ok) throw await reportGraphQLFailure(res, errCtx);
  const { data, errors } = await res.json();
  if (errors?.length) throw reportGraphQLErrors(errors, errCtx);

  const groups = data.reportFilterValues?.groups ?? [];
  const group  = groups.find(g => g.filter_key === key) ?? groups[0];
  if (!group) return { items: [], hasMore: false };

  const start = (page - 1) * pageLength;
  return {
    // line_count is null when includeCounts is false; the sidebar hides the badge.
    items: group.values.slice(start, start + pageLength)
      .map(v => ({ value: v.value, label: v.value, count: v.line_count })),
    // truncated means the server returned exactly `limit` values, so more may exist.
    hasMore: !!group.truncated,
  };
}
