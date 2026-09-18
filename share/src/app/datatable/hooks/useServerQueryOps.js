'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { queryRegistry } from '@/app/graphql-playground/services/queryRegistry';
import { fetchGraphQLRequest } from '@/app/graphql-playground/utils/query-pipeline';
import { getEndpointAndAuth } from '../utils/queryEndpointUtils';
import {
  DEFAULT_ID_FIELD,
  buildCountQuery,
  buildProbeQuery,
  deriveFilterFieldnames,
  idInClause,
  likeClause,
  noMatchClause,
  readProbeResult,
  readQueryShape,
  toSortDirectionValue,
  toSortEnumValue,
} from '../utils/serverQueryOps';

/**
 * Search and sort the WHOLE dataset instead of the loaded page.
 *
 * The engine fetches one page (`first: N`) and then searches and sorts what it
 * has in memory, so on a 45,000-row doctor list a search saw whichever 25 rows
 * were on screen. This hook turns both into query variables, so the ERP does
 * the work over every row and sends back the matches.
 *
 * Sort is direct: `sortBy: {field: <ENUM>, direction: ASC|DESC}`.
 *
 * Search needs a detour. The ERP's `filter` is a list of AND-ed clauses — there
 * is no OR argument and no `logical` field on DBFilterInput — so "match the
 * term in ANY of these fields" is not expressible as one filter. Instead:
 *
 *   1. probe each searchable field in parallel with an id-only LIKE query,
 *      which also returns an exact totalCount for that field;
 *   2. if exactly one field matched, filter the real query with that field's
 *      LIKE clause — uncapped, exact count, and Load more still works;
 *   3. if several matched, union their ids (capped) and filter the real query
 *      with `name IN [...]`.
 *
 * Probes are separate requests on purpose: one document with an alias per field
 * is a single operation, so one unfilterable fieldname fails the whole search.
 * Separately, a bad field drops out alone and is remembered so it is not tried
 * again.
 *
 * Returns variables to merge into `overrides.variables` — nothing here touches
 * the engine, which simply re-runs the query when its variables change.
 */

const EMPTY_VARIABLES = {};

const IDLE_STATUS = {
  available: false,
  reason: 'disabled',
  searching: false,
  term: '',
  matchCount: null,
  matchCapped: false,
  matchedFields: [],
  totalCount: null,
  sortField: null,
  sortDirection: null,
  error: null,
};

/** JSON signature, for effects that must key on contents rather than identity. */
function signature(value) {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return String(value);
  }
}

export default function useServerQueryOps({
  enabled = false,
  queryId,
  term = '',
  sortConfig = null,
  rootField: rootFieldProp = '',
  searchFields: searchFieldsProp = null,
  idField = DEFAULT_ID_FIELD,
  matchLimit = 500,
  debounceMs = 400,
  serverSearch = true,
  serverSort = true,
} = {}) {
  const [queryDoc, setQueryDoc] = useState(null);
  const [docError, setDocError] = useState(null);
  const [endpoint, setEndpoint] = useState(null);

  // { term, clauses, matchCount, matchCapped, matchedFields, error }
  const [search, setSearch] = useState(null);
  const [searching, setSearching] = useState(false);
  const [totalCount, setTotalCount] = useState(null);

  // Latches: once a search or a sort has gone to the server, clearing it has to
  // be sent explicitly rather than by omission (see the `variables` memo).
  const [everSearched, setEverSearched] = useState(false);
  const [everSorted, setEverSorted] = useState(false);

  // Fields the ERP refused to filter on (a flattened path that is not a real
  // column). Remembered so a failing field costs one request per session, not
  // one per search.
  const unfilterableRef = useRef(new Set());
  // Monotonic token: a probe round that finishes after a newer one started is
  // discarded rather than overwriting fresher results.
  const roundRef = useRef(0);

  useEffect(() => {
    if (!enabled || !queryId) {
      setQueryDoc(null);
      setEndpoint(null);
      setDocError(null);
      return undefined;
    }
    let cancelled = false;
    setDocError(null);
    (async () => {
      try {
        const doc = await queryRegistry.loadQuery(queryId);
        if (cancelled) return;
        setQueryDoc(doc ?? null);
        const resolved = await getEndpointAndAuth(doc);
        if (!cancelled) setEndpoint(resolved ?? null);
      } catch (error) {
        if (!cancelled) {
          setQueryDoc(null);
          setDocError(error);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [enabled, queryId]);

  const shape = useMemo(
    () => (queryDoc?.body ? readQueryShape(queryDoc.body, { rootField: rootFieldProp || undefined }) : null),
    [queryDoc?.body, rootFieldProp],
  );

  // Derived from the query doc's own searchFields unless the caller names the
  // ERP fieldnames outright (a query whose flattened names don't map cleanly).
  const searchable = useMemo(() => {
    if (Array.isArray(searchFieldsProp) && searchFieldsProp.length > 0) {
      return { fields: searchFieldsProp.map((f) => String(f).trim()).filter(Boolean), dropped: [] };
    }
    return deriveFilterFieldnames(queryDoc?.searchFields, shape?.rootAlias);
  }, [searchFieldsProp, queryDoc?.searchFields, shape?.rootAlias]);

  // Why server ops can't run, in the caller's words. `filterIsLiteral` is the
  // one a Studio user can act on: the body hardcodes its filter, so add a
  // `$filter` variable whose default is that literal.
  const unavailableReason = useMemo(() => {
    if (!enabled) return 'disabled';
    if (!queryId) return 'no-query';
    if (docError) return `query-doc-failed: ${docError.message}`;
    if (!queryDoc) return 'loading';
    if (!shape) return 'loading';
    if (!shape.ok) return shape.reason;
    if (!shape.filterVariable) {
      return shape.filterIsLiteral
        ? 'body-filter-is-literal: declare `$filter: [DBFilterInput] = [<the current literal>]` and pass `filter: $filter`'
        : 'body-has-no-filter-argument';
    }
    return null;
  }, [enabled, queryId, docError, queryDoc, shape]);

  const fieldsSignature = signature(searchable.fields);
  const available = unavailableReason == null;
  const baseFilter = shape?.ok ? shape.baseFilter : [];
  const baseSignature = signature(baseFilter);
  const rootField = shape?.ok ? shape.rootField : null;

  const request = useCallback(async (query, variables) => {
    const response = await fetchGraphQLRequest(query, variables, {
      endpointUrl: endpoint?.endpointUrl,
      authToken: endpoint?.authToken,
    });
    const payload = await response.json();
    if (payload?.errors?.length) {
      throw new Error(payload.errors[0]?.message || 'GraphQL error');
    }
    return payload;
  }, [endpoint?.endpointUrl, endpoint?.authToken]);

  // Baseline total: how many rows the query means in full, so the paginator can
  // say "25 of 31,306" and know when there is genuinely nothing more to load.
  useEffect(() => {
    if (!available || !rootField || !endpoint?.endpointUrl) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const payload = await request(buildCountQuery(rootField), { filter: baseFilter });
        if (cancelled) return;
        const count = Number(payload?.data?.[rootField]?.totalCount);
        setTotalCount(Number.isFinite(count) ? count : null);
      } catch {
        // A missing total only costs the count label; paging still works.
        if (!cancelled) setTotalCount(null);
      }
    })();
    return () => { cancelled = true; };
    // baseSignature stands in for baseFilter so a fresh array each render can't loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available, rootField, endpoint?.endpointUrl, baseSignature, request]);

  const runProbes = useCallback(async (searchTerm, round) => {
    const fields = searchable.fields.filter((field) => !unfilterableRef.current.has(field));
    if (fields.length === 0) {
      return { term: searchTerm, clauses: [noMatchClause(idField)], matchCount: 0, matchCapped: false, matchedFields: [], error: 'no-searchable-fields' };
    }

    const probeQuery = buildProbeQuery(rootField, idField);

    const probeOnce = async (field) => {
      const payload = await request(probeQuery, {
        filter: [...baseFilter, likeClause(field, searchTerm)],
        first: matchLimit,
      });
      return readProbeResult(payload, rootField);
    };

    const results = await Promise.all(fields.map(async (field) => {
      try {
        let result = await probeOnce(field);
        // This ERP intermittently answers with a correct totalCount and an EMPTY
        // edge list — seen on repeat runs of the same request, with no GraphQL
        // error to go on. Taking that at face value would silently drop a
        // field's matches from the union, so retry once before believing it.
        if (result.totalCount > 0 && result.ids.length === 0) {
          result = await probeOnce(field);
        }
        return { field, ...result };
      } catch (error) {
        // "Unknown column" means this flattened path is not filterable here.
        // Drop it for the session; every other field still contributes.
        if (/unknown column/i.test(error?.message ?? '')) {
          unfilterableRef.current.add(field);
        }
        return { field, totalCount: 0, ids: [], failed: true };
      }
    }));

    if (round !== roundRef.current) return null;

    const hits = results.filter((result) => !result.failed && result.totalCount > 0);
    const allFailed = results.every((result) => result.failed);

    if (allFailed) {
      return { term: searchTerm, clauses: null, matchCount: null, matchCapped: false, matchedFields: [], error: 'all-probes-failed' };
    }
    if (hits.length === 0) {
      return { term: searchTerm, clauses: [noMatchClause(idField)], matchCount: 0, matchCapped: false, matchedFields: [], error: null };
    }
    if (hits.length === 1) {
      // One field matched: filter on it directly. No id cap, exact count, and
      // Load more can still walk the whole match set.
      const [hit] = hits;
      return {
        term: searchTerm,
        clauses: [likeClause(hit.field, searchTerm)],
        matchCount: hit.totalCount,
        matchCapped: false,
        matchedFields: [hit.field],
        error: null,
      };
    }

    // Several fields matched, and the ERP cannot OR them — union the ids.
    const union = [];
    const seen = new Set();
    hits.forEach((hit) => {
      hit.ids.forEach((id) => {
        if (union.length >= matchLimit || seen.has(id)) return;
        seen.add(id);
        union.push(id);
      });
    });

    // Nothing usable came back despite non-zero counts (the empty-edges answer
    // above, twice over). Fall back to the widest single field so the search
    // returns its rows rather than none.
    if (union.length === 0) {
      const widest = hits.reduce((a, b) => (b.totalCount > a.totalCount ? b : a));
      return {
        term: searchTerm,
        clauses: [likeClause(widest.field, searchTerm)],
        matchCount: widest.totalCount,
        matchCapped: true,
        matchedFields: [widest.field],
        error: null,
      };
    }

    return {
      term: searchTerm,
      clauses: [idInClause(union, idField)],
      matchCount: union.length,
      // True when at least one field had more matches than it returned ids for,
      // so the union is the first `matchLimit` rather than the whole answer.
      matchCapped: hits.some((hit) => hit.totalCount > hit.ids.length) || union.length >= matchLimit,
      matchedFields: hits.map((hit) => hit.field),
      error: null,
    };
    // Keyed on the field list's CONTENTS, not its identity: this callback is a
    // dependency of the search effect, so a new array each render would re-arm
    // the debounce and keep firing probe rounds. Equal contents means the
    // closure over the old array is equally correct.
  }, [fieldsSignature, rootField, idField, matchLimit, request, baseSignature]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeTerm = serverSearch ? String(term ?? '').trim() : '';

  useEffect(() => {
    if (!available || !serverSearch || !rootField || !endpoint?.endpointUrl) {
      setSearch(null);
      setSearching(false);
      return undefined;
    }
    if (!activeTerm) {
      roundRef.current += 1;
      setSearch(null);
      setSearching(false);
      return undefined;
    }

    const round = roundRef.current + 1;
    roundRef.current = round;
    setSearching(true);

    // Debounced because each change is a round of real requests. The engine then
    // re-runs the main query on the new variables, so an undebounced keystroke
    // would cost a probe round plus a full page fetch.
    const timer = setTimeout(async () => {
      try {
        const next = await runProbes(activeTerm, round);
        if (next == null || round !== roundRef.current) return;
        setSearch(next);
      } catch (error) {
        if (round !== roundRef.current) return;
        setSearch({ term: activeTerm, clauses: null, matchCount: null, matchCapped: false, matchedFields: [], error: error?.message ?? 'probe-failed' });
      } finally {
        if (round === roundRef.current) setSearching(false);
      }
    }, Math.max(0, Number(debounceMs) || 0));

    return () => clearTimeout(timer);
  }, [available, serverSearch, rootField, endpoint?.endpointUrl, activeTerm, debounceMs, runProbes]);

  const sort = useMemo(() => {
    if (!available || !serverSort || !shape?.ok) return null;
    if (!shape.sortFieldVariable && !shape.sortDirectionVariable) return null;
    const field = sortConfig?.field;
    if (!field) return null;
    const [topLevelKey, ...nestedParts] = String(field).split('.');
    const nestedPath = nestedParts.join('.');
    // Respect the query doc's sortFields allow-list, the same check the engine
    // makes before it sorts client-side.
    const allowed = queryDoc?.sortFields?.[topLevelKey];
    if (Array.isArray(allowed) && nestedPath && !allowed.includes(nestedPath)) return null;
    const enumValue = toSortEnumValue(nestedPath || topLevelKey);
    if (!enumValue) return null;
    return { field: enumValue, direction: toSortDirectionValue(sortConfig?.direction) };
  }, [available, serverSort, shape, sortConfig?.field, sortConfig?.direction, queryDoc?.sortFields]);

  useEffect(() => { if (search?.clauses) setEverSearched(true); }, [search]);
  useEffect(() => { if (sort) setEverSorted(true); }, [sort]);

  const variables = useMemo(() => {
    if (!available || !shape?.ok) return EMPTY_VARIABLES;
    const out = {};

    // Until the first search, the filter variable is left out entirely: the
    // body's default applies, the request is byte-identical to today's, and the
    // mount still reads the IndexedDB cache first.
    //
    // Once a search HAS run, clearing it sends the base filter back explicitly
    // rather than dropping the variable. Dropping it would empty the overrides
    // object, and the engine re-runs on a CHANGE to overrides — an absent key
    // reads as "nothing to do", so the search results would stay on screen.
    if (shape.filterVariable) {
      if (search?.clauses) out[shape.filterVariable] = [...baseFilter, ...search.clauses];
      else if (everSearched) out[shape.filterVariable] = [...baseFilter];
    }

    // Same reasoning for sort: a cleared sort is sent as an explicit return to
    // the body's own default, so the list actually goes back to that order.
    if (sort) {
      if (shape.sortFieldVariable) out[shape.sortFieldVariable] = sort.field;
      if (shape.sortDirectionVariable) out[shape.sortDirectionVariable] = sort.direction;
      if (shape.sortByVariable) out[shape.sortByVariable] = { field: sort.field, direction: sort.direction };
    } else if (everSorted) {
      if (shape.sortFieldVariable && shape.sortFieldDefault != null) {
        out[shape.sortFieldVariable] = shape.sortFieldDefault;
      }
      if (shape.sortDirectionVariable && shape.sortDirectionDefault != null) {
        out[shape.sortDirectionVariable] = shape.sortDirectionDefault;
      }
      if (shape.sortByVariable && shape.sortByDefault != null) {
        out[shape.sortByVariable] = shape.sortByDefault;
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available, shape, search, sort, everSearched, everSorted, baseSignature]);

  const status = useMemo(() => {
    if (!available) {
      return { ...IDLE_STATUS, reason: unavailableReason, totalCount };
    }
    return {
      available: true,
      reason: null,
      searching,
      term: activeTerm,
      matchCount: search?.matchCount ?? null,
      matchCapped: search?.matchCapped ?? false,
      matchedFields: search?.matchedFields ?? [],
      totalCount,
      sortField: sort?.field ?? null,
      sortDirection: sort?.direction ?? null,
      searchableFields: searchable.fields,
      unsearchableFields: searchable.dropped,
      error: search?.error ?? null,
    };
  }, [available, unavailableReason, searching, activeTerm, search, totalCount, sort, searchable]);

  // True while any variable is narrowing or reordering the query, i.e. the
  // result is NOT the query's full baseline. The caller uses this to keep such
  // a result out of the shared IndexedDB cache.
  const isNarrowed = Boolean(search?.clauses);

  return { variables, status, isNarrowed };
}
