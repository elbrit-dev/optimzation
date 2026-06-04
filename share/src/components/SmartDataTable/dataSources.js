import { localFilter, localSort } from './tableUtils';

function _paginate(rows, { first, rows: perPage }) {
  return {
    rows: rows.slice(first, first + perPage),
    totalRecords: rows.length,
  };
}

function _wrapData(data) {
  return (data ?? []).map(row => {
    const out = {};
    for (const [k, v] of Object.entries(row)) {
      out[k] = { value: v, repr: v };
    }
    return out;
  });
}

/**
 * DataSource for flat/normal table data.
 * Wraps every cell as { value, repr } on creation so filter/sort
 * always operate on .value, matching the report pipeline contract.
 *
 * @param {Object[]} data - Static array of row objects
 * @returns {import('./SmartDataProvider').DataSourceFn}
 */
export function normalDataSource(data) {
  const wrapped = _wrapData(data);
  return ({ filters, sortBy, pagination }) => {
    const filtered  = localFilter(wrapped, filters);
    const sortMeta  = Object.entries(sortBy ?? {}).map(([field, dir]) => ({ field, order: dir === 'asc' ? 1 : -1 }));
    const sorted    = localSort(filtered, sortMeta);
    return _paginate(sorted, pagination);
  };
}
