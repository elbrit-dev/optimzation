import { parse, valueFromASTUntyped } from 'graphql';

/**
 * Helpers for pushing search and sort down to the server, so both cover the
 * WHOLE dataset instead of the page that happens to be loaded.
 *
 * Everything here is pure: read the query body, work out which variables it
 * exposes, and build the filter clauses / probe query that go on the wire. The
 * React side lives in hooks/useServerQueryOps.js.
 *
 * What the ERP actually supports (probed against erp.elbrit.org, Sep 2026):
 *
 *   filter:  [DBFilterInput]  -> { fieldname, value | values, operator }
 *            AND-only. There is no orFilter/or_filters argument and
 *            DBFilterInput has no `logical` field, so a search across several
 *            fields cannot be expressed as one filter. See useServerQueryOps
 *            for the two-step union that works around it.
 *   sortBy:  { field: <Doctype>SortField, direction: SortDirection }
 *            `field` is an ENUM: the fieldname in UPPER_SNAKE (LEAD_NAME).
 *   paging:  first / after only. `after` together with `filter` throws
 *            "Filter must be a tuple or list", so a filtered list can only
 *            grow `first` — which is what the Load more control already does.
 *   counts:  totalCount is exact and respects the filter, so the real match
 *            count across the full dataset is one cheap request away.
 */

/** The generic filter input type in this frappe_graphql schema (not per-doctype). */
export const FILTER_INPUT_TYPE = 'DBFilterInput';

/** Doc id field every Frappe doctype has; the union step filters on it. */
export const DEFAULT_ID_FIELD = 'name';

/**
 * Turn a response field path into a fieldname the ERP can filter on.
 *
 * `custom_specialty__name` is the flattened form of `custom_specialty { name }`,
 * and because Frappe stores a Link's target id (which IS the name) in the
 * column itself, the filterable column is `custom_specialty`. Anything still
 * carrying a `__` or a `.` after that strip is a genuinely nested selection
 * that SQL cannot reach from this table, so it is dropped rather than guessed
 * at — a wrong guess is an "Unknown column" error, not a missed row.
 */
export function toFilterFieldname(path) {
  const raw = String(path ?? '').trim();
  if (!raw || raw.includes('.')) return null;
  const stripped = raw.endsWith('__name') ? raw.slice(0, -'__name'.length) : raw;
  if (!stripped || stripped.includes('__')) return null;
  return stripped;
}

/**
 * The fields a server-side search should look in, derived from the query doc's
 * own `searchFields` so the two can never drift apart.
 *
 * Deriving rather than re-declaring matters for a second reason: the rows that
 * come back are still handed to whatever client-side filtering is active, so a
 * server field with no client counterpart would match a row that is then
 * dropped again on screen.
 *
 * @param {Object} searchFields - query doc's searchFields, { Leads: ['lead_name', ...] }
 * @param {string} [rootKey] - restrict to this top-level key when present
 * @returns {{ fields: string[], dropped: string[] }}
 */
export function deriveFilterFieldnames(searchFields, rootKey) {
  const groups = (searchFields && typeof searchFields === 'object') ? searchFields : {};
  const keys = rootKey && Array.isArray(groups[rootKey]) ? [rootKey] : Object.keys(groups);
  const fields = [];
  const dropped = [];
  keys.forEach((key) => {
    const paths = Array.isArray(groups[key]) ? groups[key] : [];
    paths.forEach((path) => {
      const fieldname = toFilterFieldname(path);
      if (fieldname == null) dropped.push(String(path));
      else if (!fields.includes(fieldname)) fields.push(fieldname);
    });
  });
  return { fields, dropped };
}

/** `Leads.lead_name` / `lead_name` -> `LEAD_NAME`, the <Doctype>SortField enum value. */
export function toSortEnumValue(fieldPath) {
  const leaf = String(fieldPath ?? '').split('.').pop();
  return leaf ? leaf.toUpperCase() : null;
}

/** ASC / DESC, whatever case the table's sort state arrived in. */
export function toSortDirectionValue(direction) {
  return String(direction ?? 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';
}

function findArgument(field, name) {
  return (field?.arguments ?? []).find((arg) => arg.name.value === name) ?? null;
}

/** Variable name if this argument value is `$x`, else null. */
function variableName(valueNode) {
  return valueNode?.kind === 'Variable' ? valueNode.name.value : null;
}

/**
 * Read what a query body exposes: its root list field and which variables carry
 * the filter, the sort and the page size.
 *
 * The base filter is read from the `$filter` variable's DEFAULT VALUE in the
 * body, so the body stays the single source of truth for "which rows does this
 * query mean" (for Doctors: status = ACTIVE). The client sends base + search
 * clauses together, because GraphQL cannot concatenate two lists and the ERP
 * takes exactly one `filter` argument.
 *
 * @param {string} body - the GraphQL document text from the query doc
 * @param {Object} [options]
 * @param {string} [options.rootField] - disambiguates a body with several root selections
 * @returns {{
 *   ok: boolean, reason?: string, rootField?: string, rootAlias?: string,
 *   filterVariable?: string|null, baseFilter?: Array, filterIsLiteral?: boolean,
 *   sortByVariable?: string|null, sortFieldVariable?: string|null,
 *   sortDirectionVariable?: string|null, pagingVariable?: string|null,
 * }}
 */
export function readQueryShape(body, { rootField } = {}) {
  if (!body || typeof body !== 'string' || !body.trim()) {
    return { ok: false, reason: 'no-body' };
  }

  let doc;
  try {
    doc = parse(body);
  } catch (error) {
    return { ok: false, reason: `unparseable-body: ${error.message}` };
  }

  const operation = doc.definitions.find((def) => def.kind === 'OperationDefinition');
  if (!operation) return { ok: false, reason: 'no-operation' };

  const variableDefaults = new Map();
  (operation.variableDefinitions ?? []).forEach((def) => {
    variableDefaults.set(def.variable.name.value, def.defaultValue ?? null);
  });

  const selections = (operation.selectionSet?.selections ?? []).filter((sel) => sel.kind === 'Field');
  if (selections.length === 0) return { ok: false, reason: 'no-root-selection' };

  // A body with several root selections (Primary fetches targets + invoices) has
  // no single list to search, so the caller has to name the one it means.
  let root;
  if (rootField) {
    root = selections.find((sel) => sel.name.value === rootField || sel.alias?.value === rootField);
    if (!root) return { ok: false, reason: `root-field-not-found: ${rootField}` };
  } else if (selections.length === 1) {
    [root] = selections;
  } else {
    return {
      ok: false,
      reason: `ambiguous-root: ${selections.map((sel) => sel.name.value).join(', ')}`,
    };
  }

  const filterArg = findArgument(root, 'filter');
  const filterVariable = variableName(filterArg?.value);
  const filterIsLiteral = filterArg != null && filterVariable == null;

  // The base clauses: the variable's default when the body parameterizes filter,
  // otherwise the literal that is hardcoded in the body (which server ops cannot
  // extend — reported so the caller can say why).
  const baseSource = filterVariable
    ? variableDefaults.get(filterVariable)
    : filterArg?.value ?? null;
  const baseValue = baseSource ? valueFromASTUntyped(baseSource) : null;
  const baseFilter = baseValue == null
    ? []
    : (Array.isArray(baseValue) ? baseValue : [baseValue]);

  const sortByArg = findArgument(root, 'sortBy');
  let sortByVariable = variableName(sortByArg?.value);
  let sortFieldVariable = null;
  let sortDirectionVariable = null;
  if (sortByArg?.value?.kind === 'ObjectValue') {
    sortByArg.value.fields.forEach((field) => {
      if (field.name.value === 'field') sortFieldVariable = variableName(field.value);
      if (field.name.value === 'direction') sortDirectionVariable = variableName(field.value);
    });
    sortByVariable = null;
  }

  // The body's own defaults, so "sort cleared" can be sent as an explicit
  // return to them. Leaving the variables out instead would not re-run the
  // query — the engine watches the overrides object, and an absent key looks
  // like nothing happened — so the last server-side order would stay on screen.
  const defaultOf = (name) => {
    if (!name || !variableDefaults.has(name)) return null;
    const node = variableDefaults.get(name);
    return node ? valueFromASTUntyped(node) : null;
  };

  return {
    ok: true,
    rootField: root.name.value,
    rootAlias: root.alias?.value ?? root.name.value,
    filterVariable,
    filterIsLiteral,
    baseFilter,
    sortByVariable,
    sortFieldVariable,
    sortDirectionVariable,
    sortFieldDefault: defaultOf(sortFieldVariable),
    sortDirectionDefault: defaultOf(sortDirectionVariable),
    sortByDefault: defaultOf(sortByVariable),
    pagingVariable: variableName(findArgument(root, 'first')?.value),
  };
}

/**
 * One-field probe: ids and an exact count for a single LIKE clause.
 *
 * Deliberately one request per field rather than one request with an alias per
 * field. An aliased document is a single operation, so one bad fieldname
 * ("Unknown column") fails the whole thing and the search returns nothing;
 * separate requests let a bad field drop out on its own. Selecting only the id
 * keeps each one small.
 */
export function buildProbeQuery(rootField, idField = DEFAULT_ID_FIELD) {
  return `query DataProviderViewsProbe($filter: [${FILTER_INPUT_TYPE}], $first: Int!) {
  ${rootField}(first: $first, filter: $filter) {
    totalCount
    edges { node { ${idField} } }
  }
}`;
}

/** Count only — used for the unfiltered baseline total ("25 of 31,306"). */
export function buildCountQuery(rootField) {
  return `query DataProviderViewsCount($filter: [${FILTER_INPUT_TYPE}]) {
  ${rootField}(first: 1, filter: $filter) { totalCount }
}`;
}

export function likeClause(fieldname, term) {
  return { fieldname, value: `%${String(term).trim()}%`, operator: 'LIKE' };
}

/**
 * One AND-ed clause per filtered field: `fieldname IN [selected values]`.
 *
 * Unlike search, this needs no probe and no id union. Search means "the term
 * in ANY field", which the ERP's AND-only filter list cannot express; a filter
 * means "this field is one of these values", which is exactly one clause, and
 * several filtered fields AND together — the same semantics the client-side
 * worker already applies.
 *
 * A single value is sent as EQ rather than IN: both work, but EQ is what the
 * body's own default clauses look like, so a one-value filter reads the same
 * on the wire as a hand-written one.
 */
export function valueInClause(fieldname, values) {
  const list = (Array.isArray(values) ? values : [values])
    .filter((v) => v !== null && v !== undefined && String(v).length > 0);
  if (!fieldname || list.length === 0) return null;
  if (list.length === 1) return { fieldname, value: list[0], operator: 'EQ' };
  return { fieldname, operator: 'IN', values: list };
}

export function idInClause(ids, idField = DEFAULT_ID_FIELD) {
  return { fieldname: idField, operator: 'IN', values: ids };
}

/**
 * A clause that matches nothing, for "the search found no rows".
 *
 * An empty `IN []` is not used: Frappe rejects an empty value list, which would
 * surface as a query error instead of an empty result.
 */
export function noMatchClause(idField = DEFAULT_ID_FIELD) {
  return { fieldname: idField, operator: 'EQ', value: '__dataprovider_views_no_match__' };
}

/** Read the edges of whichever root field the response came back under. */
export function readProbeResult(payload, rootField) {
  const node = payload?.data?.[rootField];
  if (!node) return { totalCount: 0, ids: [] };
  const ids = (node.edges ?? [])
    .map((edge) => edge?.node?.[DEFAULT_ID_FIELD] ?? Object.values(edge?.node ?? {})[0])
    .filter((id) => typeof id === 'string' && id.length > 0);
  return { totalCount: Number(node.totalCount ?? ids.length) || 0, ids };
}
