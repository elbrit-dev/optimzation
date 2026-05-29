import { getEndpointConfigFromUrlKeyAsync } from '@/app/graphql-playground/constants';

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

function _nestRows(flatRows) {
  const roots = [];
  const stack = [];
  for (const raw of flatRows) {
    const row = { ...raw };
    const depth = row.indent ?? 0;
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

const FIELDTYPE_MAP = {
  Int:      { type: 'number',  filterType: 'numeric' },
  Float:    { type: 'number',  filterType: 'numeric' },
  Currency: { type: 'number',  filterType: 'numeric' },
  Percent:  { type: 'number',  filterType: 'numeric' },
  Date:     { type: 'date',    filterType: 'date'    },
  Datetime: { type: 'date',    filterType: 'date'    },
  Check:    { type: 'boolean', filterType: 'boolean' },
};

// Fetches, flattens, and formats a UniGrid report in one pass.
// Combines what was previously _uniGridToShape + formatStep into a single O(n) loop.
function _uniGridFetchAndShape(uniGrid, formatters = {}) {
  const active = { ..._DEFAULT_FORMATTERS, ...formatters };
  const { title, meta, columns: colGroups, rows: uniRows } = uniGrid;

  const columns = [
    { field: 'label', header: title ?? 'Name', sortable: true, filterable: true, type: 'string', filterType: 'text', _fieldtype: 'Data' },
    ...colGroups.flatMap(group =>
      group.children.map(child => ({
        field:      group.id === 'default' ? child.field : `${group.id}__${child.field}`,
        header:     child.label,
        sortable:   true,
        filterable: true,
        _fieldtype: child.type ?? 'Data',
        ...(FIELDTYPE_MAP[child.type] ?? { type: 'string', filterType: 'text' }),
      }))
    ),
  ];

  // Build formatter map once per column, not per cell
  const fieldFmt = {};
  for (const col of columns) {
    fieldFmt[col.field] = (col._fieldtype && active[col._fieldtype]) ?? _identity;
  }

  let columnGroups = null;
  if (meta?.column_group) {
    columnGroups = colGroups.map(group => ({
      id:     group.id,
      label:  group.label,
      fields: group.children.map(child =>
        group.id === 'default' ? child.field : `${group.id}__${child.field}`
      ),
    }));
  }

  const flatRows = [];
  function flattenRow(row, depth) {
    const out = {
      label:    fieldFmt.label(row.label),
      indent:   depth,
      is_group: row.children?.length ? 1 : 0,
    };
    for (const group of colGroups) {
      const vals = row.values?.[group.id] ?? {};
      for (const child of group.children) {
        const field = group.id === 'default' ? child.field : `${group.id}__${child.field}`;
        const raw = vals[child.field] ?? null;
        out[field] = raw != null ? fieldFmt[field](raw) : { value: null, repr: null };
      }
    }
    flatRows.push(out);
    for (const child of (row.children ?? [])) flattenRow(child, depth + 1);
  }
  for (const row of uniRows) flattenRow(row, 0);

  return { columns, rows: flatRows, columnGroups, expandable: meta?.row_expansion ?? false };
}

async function _fetchUniGridReport(urlKey, view, filters = {}, { token, endpoint, method = 'POST' } = {}) {
  const { endpointUrl, authToken } = await getEndpointConfigFromUrlKeyAsync(urlKey);
  const origin = new URL(endpointUrl).origin;
  const effectiveToken = token ?? authToken;
  const effectivePath = endpoint ?? '/api/method/report';

  let res;
  if (method === 'GET') {
    // New GET-style API (e.g. /api/method/reports) — params go in query string
    const params = new URLSearchParams(
      Object.fromEntries(Object.entries(filters).filter(([, v]) => v != null && v !== ''))
    );
    res = await fetch(`${origin}${effectivePath}?${params}`, {
      headers: { Authorization: effectiveToken },
    });
  } else {
    // Existing POST API (e.g. /api/method/report)
    const body = new URLSearchParams({ view, ...filters });
    res = await fetch(`${origin}${effectivePath}`, {
      method:  'POST',
      headers: { Authorization: effectiveToken, 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
  }

  if (!res.ok) throw new Error(`UniGrid report fetch failed: HTTP ${res.status}`);
  const { message } = await res.json();
  return message.data; // may include .filters array when using the new GET API
}

async function _fetchReport(urlKey, reportName, requestFilters) {
  const { endpointUrl, authToken } = await getEndpointConfigFromUrlKeyAsync(urlKey);
  const origin = new URL(endpointUrl).origin;
  const params = new URLSearchParams({
    report_name:            reportName,
    filters:                JSON.stringify(requestFilters),
    ignore_prepared_report: 'false',
    are_default_filters:    'false',
  });
  const res = await fetch(
    `${origin}/api/method/frappe.desk.query_report.run?${params}`,
    { headers: { Authorization: authToken } }
  );
  if (!res.ok) throw new Error(`Report fetch failed: HTTP ${res.status}`);
  const { message: msg } = await res.json();
  return {
    rows:    msg.result ?? [],
    columns: (msg.columns ?? []).map(col => ({
      field:      col.fieldname,
      header:     col.label,
      width:      col.width ? `${col.width}px` : undefined,
      sortable:   true,
      filterable: true,
      _fieldtype: col.fieldtype,
      ...(FIELDTYPE_MAP[col.fieldtype] ?? { type: 'string', filterType: 'text' }),
    })),
  };
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

// ─── Pipeline ─────────────────────────────────────────────────────────────────
//
// State flows through every step:
//   { rows, columns?, totalRecords?, expandable?, ...anything }
//
// Step signature:  (state, params) => state | Promise<state>
// params shape:    { filters, sortMeta, pagination, viewId }

/**
 * Wraps raw cell values into { value, repr } objects so the table can
 * display formatted strings (e.g. "₹ 1,41,899.14") while filter/sort
 * still operate on the underlying number/date.
 *
 * Pass a `formatters` map to override or extend defaults:
 *   formatStep({ Percent: (n) => `${n}%` })
 *
 * Default formatters: { Currency → INR (₹) }
 *
 * Also wraps column footers so they display formatted too.
 *
 * Must run AFTER fetchStep (needs state.columns with _fieldtype).
 * Must run BEFORE filterStep/sortStep (filter/sort read .value directly).
 *
 * Every column field becomes { value, repr } — identity wrapper for fields
 * without a specific formatter, so filter/sort always have a consistent shape.
 *
 * Formatter signature: (rawValue) => { value: any, repr: ReactNode }
 */
export function formatStep(formatters = {}) {
  const active = { ..._DEFAULT_FORMATTERS, ...formatters };

  const step = (state) => {
    // Pre-build field → formatter map (one lookup per column, not per row)
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

/**
 * Fetches the Frappe report once, caches it, and populates
 * state.rows + state.columns for downstream steps.
 *
 * Attaches .refresh() so buildPipeline can propagate it.
 *
 * @param {{ urlKey: string, reportName: string, filters?: object }} options
 */
export function fetchStep({ urlKey, reportName, filters = {} }) {
  const step = async (state) => {
    const data = await _fetchReport(urlKey, reportName, filters);
    return { ...state, rows: data.rows, columns: data.columns };
  };
  step.stepName = 'fetch';
  return step;
}

/**
 * Snapshots rows into state.allRows immediately after formatting, before any filtering.
 * The FilterSortSidebar reads allRows to build per-field unique-value lists.
 */
export const captureAllRowsStep = (state) => ({ ...state, allRows: state.rows });

/**
 * Applies sidebar multiselect filters stored in viewParams._sidebar.filters.
 * Runs before column filterStep so column filters refine the sidebar-narrowed set.
 */
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

/**
 * Applies sidebar sort stored in viewParams._sidebar.sort.
 * Runs before column sortStep so a column header click overrides it.
 */
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

/** Applies active table filters to state.rows. */
export const filterStep = (state, { filters }) => ({
  ...state,
  rows: _filter(state.rows, filters),
});

/** Sorts state.rows by sortMeta. */
export const sortStep = (state, { sortMeta }) => ({
  ...state,
  rows: _sort(state.rows, sortMeta),
});

/** Converts flat indent-based rows into a parent→_children tree. */
export const nestStep = (state) => ({
  ...state,
  rows: _nestRows(state.rows),
});

/** Slices state.rows for the current page and sets totalRecords. Terminal step. */
export const paginateStep = (state, { pagination }) => {
  const { rows, totalRecords } = _paginate(state.rows, pagination);
  return { ...state, rows, totalRecords };
};

// ─── Pipeline composer ────────────────────────────────────────────────────────

/**
 * Composes steps into a DataSourceFn.
 *
 * State starts as `{ rows: [] }` and is passed through each step in order.
 * Any step with a `.refresh()` method gets called when the pipeline is refreshed.
 * `extraResult` is merged into the final state (e.g. `{ expandable: true }`).
 *
 * @param {Function[]} steps
 * @param {object} [extraResult]
 * @returns {DataSourceFn & { refresh(): void }}
 *
 * @example
 * const ds = buildPipeline([
 *   fetchStep({ urlKey: 'UAT', reportName: 'Sales Summary' }),
 *   filterStep,
 *   nestStep,
 *   sortStep,
 *   paginateStep,
 * ], { expandable: true });
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

// ─── Convenience factories ────────────────────────────────────────────────────

/**
 * Flat report: fetch → format → filter → sort → paginate.
 * Pass `formatters` to override/extend the default Currency→INR formatter.
 */
export function reportDataSource({ urlKey, reportName, filters = {}, formatters } = {}) {
  return buildPipeline([
    fetchStep({ urlKey, reportName, filters }),
    formatStep(formatters),
    captureAllRowsStep,
    sidebarFilterStep,
    filterStep,
    sidebarSortStep,
    sortStep,
    paginateStep,
  ]);
}

/**
 * Grouped report: fetch → format → filter → nest → sort → paginate → expandable.
 * Pass `formatters` to override/extend the default Currency→INR formatter.
 */
export function groupedReportDataSource({ urlKey, reportName, filters = {}, formatters } = {}) {
  return buildPipeline([
    fetchStep({ urlKey, reportName, filters }),
    formatStep(formatters),
    captureAllRowsStep,
    sidebarFilterStep,
    filterStep,
    sidebarSortStep,
    sortStep,
    nestStep,
    paginateStep,
  ], { expandable: true });
}

/**
 * Fetches a UniGrid-shaped report from the ERP /api/method/report endpoint.
 * Response shape: { message: { data: { title, meta, columns, rows } } }
 *
 * Pass `requestBuilder` to compute request filters dynamically from viewParams:
 *   requestBuilder: ({ viewParams, baseFilters }) => mergedFilters
 * The result is JSON-stringified as a cache key — a new fetch only happens when
 * the derived filters actually change.
 *
 * @param {{ urlKey: string, view: string, filters?: object, requestBuilder?: Function }} options
 */
export function uniGridFetchStep({ urlKey, view, filters = {}, requestBuilder, token = null, endpoint = null, formatters = {}, method = 'POST' }) {
  const step = async (state, params) => {
    const merged = requestBuilder
      ? requestBuilder({ viewParams: params?.viewParams ?? {}, baseFilters: filters })
      : filters;

    // Merge sidebar filter selections as server-side API params.
    // filterDef.key == POST body param name (1:1, sales-api.py passes frappe.form_dict straight to run_report).
    // to_list() in sales-api.py handles plain strings and JSON arrays.
    const sidebarFilters = params?.viewParams?._sidebar?.filters ?? {};
    const sidebarApiParams = Object.fromEntries(
      Object.entries(sidebarFilters)
        .filter(([, vals]) => Array.isArray(vals) && vals.length > 0)
        .map(([key, vals]) => [key, vals.length === 1 ? vals[0] : JSON.stringify(vals)])
    );

    const finalFilters = { ...merged, ...sidebarApiParams };
    const rawData = await _fetchUniGridReport(urlKey, view, finalFilters, { token, endpoint, method });
    return {
      ...state,
      ..._uniGridFetchAndShape(rawData, formatters),
      filterDefs: Array.isArray(rawData.filters) ? rawData.filters : [],
    };
  };
  step.stepName = 'uniGridFetch';
  return step;
}

/**
 * UniGrid flat report: uniGridFetch (fetch + shape + format) → filter → sort → paginate.
 * Pass `requestBuilder` to compute request filters dynamically from viewParams.
 */
export function uniGridReportDataSource({ urlKey, view, filters = {}, formatters, requestBuilder, token, endpoint, method } = {}) {
  return buildPipeline([
    uniGridFetchStep({ urlKey, view, filters, requestBuilder, token, endpoint, formatters, method }),
    captureAllRowsStep,
    filterStep,
    sidebarSortStep,
    sortStep,
    paginateStep,
  ]);
}

/**
 * UniGrid grouped report: uniGridFetch (fetch + shape + format) → filter → nest → sort → paginate → expandable.
 * Pass `requestBuilder` to compute request filters dynamically from viewParams.
 * Sidebar filter selections are sent as server-side API params inside uniGridFetchStep —
 * no client-side sidebarFilterStep needed.
 */
export function uniGridGroupedReportDataSource({ urlKey, view, filters = {}, formatters, requestBuilder, token, endpoint, method } = {}) {
  return buildPipeline([
    uniGridFetchStep({ urlKey, view, filters, requestBuilder, token, endpoint, formatters, method }),
    captureAllRowsStep,
    filterStep,
    sidebarSortStep,
    sortStep,
    nestStep,
    paginateStep,
  ], { expandable: true });
}
