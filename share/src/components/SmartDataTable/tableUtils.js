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

export function localFilter(rows, filters) {
  if (!filters || Object.keys(filters).length === 0) return rows;
  return rows.filter(row => {
    for (const [field, filterValue] of Object.entries(filters)) {
      if (filterValue === null || filterValue === undefined || filterValue === '') continue;
      const cellValue = row[field]?.value;
      const { type, value } = filterValue;
      if (value === null || value === undefined || value === '') continue;
      switch (type) {
        case 'text': {
          const cell = String(cellValue ?? '').toLowerCase();
          if (!cell.includes(String(value).toLowerCase())) return false;
          break;
        }
        case 'numeric': {
          if (!_matchesNumeric(cellValue, value)) return false;
          break;
        }
        case 'multiselect': {
          if (!Array.isArray(value) || value.length === 0) break;
          if (!new Set(value).has(cellValue)) return false;
          break;
        }
        case 'date': {
          const { start, end } = value;
          const d = cellValue instanceof Date ? cellValue : new Date(cellValue);
          if (isNaN(d)) return false;
          if (start && d < new Date(start)) return false;
          if (end   && d > new Date(end))   return false;
          break;
        }
        case 'boolean': {
          if (value !== null && Boolean(cellValue) !== value) return false;
          break;
        }
        default:
          break;
      }
    }
    return true;
  });
}

function _buildComparator(sortMeta) {
  return (a, b) => {
    for (const { field, order } of sortMeta) {
      const av = a[field]?.value;
      const bv = b[field]?.value;
      let cmp = 0;
      if (av === null || av === undefined)                                            cmp = bv === null || bv === undefined ? 0 : -1;
      else if (bv === null || bv === undefined)                                       cmp = 1;
      else if (typeof av === 'number' && typeof bv === 'number')                     cmp = av - bv;
      else if (av instanceof Date || (typeof av === 'string' && !isNaN(Date.parse(av)))) cmp = new Date(av).getTime() - new Date(bv).getTime();
      else if (typeof av === 'boolean')                                               cmp = av === bv ? 0 : av ? 1 : -1;
      else cmp = String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' });
      if (cmp !== 0) return cmp * order;
    }
    return 0;
  };
}

export function localSort(rows, sortMeta) {
  if (!sortMeta || sortMeta.length === 0) return rows;
  return [...rows].sort(_buildComparator(sortMeta));
}
