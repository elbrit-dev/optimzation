import { resolveApiConfig } from './apiRegistry.js';
import { deepMerge, setPath, getPath } from './varUtils.js';

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

/** Converts flat indent-based rows into a parent→_children tree. Sets expandable based on result. */
export const nestStep = (state) => {
  const rows = _nestRows(state.rows);
  return { ...state, rows, expandable: rows.some(r => r._children?.length > 0) };
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
// All variables are declared explicitly in api.variableTypes.
// Controls write outputs to viewParams._controls[key] via setControlOutput.
// api.variablesMap maps 'controls.{key}.{outputKey}' / 'sort' / 'pagination.*' → variable paths.

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
 * Build a GraphQL query string dynamically from the resolved variables.
 * When variableTypes is omitted, types are inferred from the variable values.
 * 'filters' is always routed into run_report[{ filters: $filters }]; all other keys are direct args.
 */
function buildCustomReportQuery(variables, variableTypes) {
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
function resolveVariablesMap(baseVars, variablesMap, { controls, sortBy, pagination, viewParams = {} }) {
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

/**
 * @param {{ urlKey?: string, variables: object, variableTypes?: object, variablesMap?: object }} rawApiConfig
 *   variables     — base GraphQL variables (report, filters, and any custom fields)
 *   variableTypes — GQL type per variable key; omit to auto-infer from variable values
 *   variablesMap  — maps source keys (controls.*, sort, pagination.*) to variable dot-paths;
 *                   omit to use _DEFAULT_VARIABLES_MAP (dateRange, breakdown, filterSort)
 */
export function graphqlQueryReportDataSource(rawApiConfig) {
  const step = async (state, params) => {
    const { endpoint, token, variables: baseVars = {} } = await resolveApiConfig(rawApiConfig);

    const controls   = params.viewParams?._controls ?? {};
    const pagination = params.pagination ?? { first: 0, rows: 50 };

    const page     = Math.floor(pagination.first / pagination.rows) + 1;
    const limit    = pagination.rows;
    const cacheKey = `${page}:${limit}`;

    const gqlVars  = resolveVariablesMap(baseVars, rawApiConfig.variablesMap, {
      controls,
      sortBy: params.sortBy,
      pagination,
      viewParams: params.viewParams ?? {},
    });
    const pageCache = params._pageCache;

    const cached = pageCache?.get(cacheKey);
    if (cached) {
      return { ...state, columns: cached.columns, columnGroups: cached.columnGroups, rows: cached.rows, filterValues: cached.filterValues, filterDefs: cached.filterDefs, metaTotals: cached.metaTotals, metaTodayTotals: cached.metaTodayTotals, metaPagination: cached.metaPagination, metaCol: cached.metaCol };
    }

    const query = buildCustomReportQuery(gqlVars, rawApiConfig.variableTypes);

    const res = await fetch(endpoint, {
      method:  'POST',
      headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ query, variables: gqlVars }),
    });
    if (!res.ok) throw new Error(`GraphQL report fetch failed: HTTP ${res.status}`);
    const { data, errors } = await res.json();
    if (errors?.length) throw new Error(errors[0].message);

    const { report_meta, edges } = data.customReport;
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

    // Auto-derive filterDefs from _meta keys — label each key (hq → HQ, others capitalised)
    const filterDefs = Object.keys(filterValues).map(key => ({
      key,
      label: key.toUpperCase() === key || key === 'hq'
        ? key.toUpperCase()
        : key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' '),
    }));

    pageCache?.set(cacheKey, { columns, columnGroups, rows, filterValues, filterDefs, labelColDefs, metaTotals, metaTodayTotals, metaPagination, metaCol });

    return { ...state, columns, columnGroups, rows, filterValues, filterDefs, labelColDefs, metaTotals, metaTodayTotals, metaPagination, metaCol };
  };
  step.stepName = 'graphqlFetch';

  return buildPipeline([
    step,
    formatStep(),
    captureAllRowsStep,
    filterStep,
    nestStep,
    paginateStep,
  ]);
}

// ─── customFilter — dynamic sidebar filter values ─────────────────────────────

const _GQL_CUSTOM_FILTER = `
  query CustomFilter($filters: JSON!) {
    customFilter(filter: $filters) {
      values {
        value
        distinct_count
        line_count
      }
    }
  }
`;

function _filterDimension(key) {
  return key.toUpperCase() === key || key === 'hq'
    ? key.toUpperCase()
    : key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
}

/**
 * Fetches filter values for a sidebar dimension via the customFilter GraphQL API.
 * Called by SmartDataProvider.fetchFilterValues when the user types a search term.
 *
 * @param {object} rawApiConfig  — same shape as graphqlQueryReportDataSource (urlKey / endpoint / token / variables)
 * @param {string} key           — dimension key (e.g. "hq", "customer", "item_group")
 * @param {{ page?, pageLength?, search?, currentFilters? }} opts
 */
export async function graphqlFetchFilterValues(rawApiConfig, key, { page = 1, pageLength = 20, search = '', currentFilters = {} } = {}) {
  const { endpoint, token } = await resolveApiConfig(rawApiConfig);

  const cascadeFilters = Object.fromEntries(
    Object.entries(currentFilters)
      .filter(([k, v]) => k !== key && v?.length)
      .map(([k, v]) => [k, v[0]])
  );

  const filter = {
    dimension: _filterDimension(key),
    ...(search ? { search } : {}),
    limit: page * pageLength,
    ...cascadeFilters,
  };

  const res = await fetch(endpoint, {
    method:  'POST',
    headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ query: _GQL_CUSTOM_FILTER, variables: { filters: filter } }),
  });
  if (!res.ok) throw new Error(`customFilter fetch failed: HTTP ${res.status}`);
  const { data, errors } = await res.json();
  if (errors?.length) throw new Error(errors[0].message);

  const allValues = data.customFilter.values;
  const start = (page - 1) * pageLength;
  const items = allValues.slice(start, page * pageLength).map(v => ({ value: v.value, label: v.value }));
  return { items, hasMore: allValues.length >= page * pageLength };
}

