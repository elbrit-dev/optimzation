import { isEmpty, isArray, includes } from 'lodash';
import { getAllowedForGroupField, getAllowedForScope } from './allowedColumnsUtils';

/**
 * Mirrors DataTableNew `orderedColumns`: same filters, group-field rules, visibleColumns,
 * and percentage column insertion (beforeColumn, after outer group, remainder).
 *
 * @param {Object} opts
 * @param {string[]} opts.columns — e.g. pipeline filteredColumns / context columns
 * @param {string[]|null|undefined} opts.visibleColumns — table visibility (empty = no filter)
 * @param {string[]} opts.effectiveGroupFields
 * @param {boolean} opts.hasPercentageColumns
 * @param {Array<{ columnName?: string, beforeColumn?: string }>} [opts.percentageColumns]
 * @param {string[]} [opts.percentageColumnNames] — if omitted, derived from percentageColumns
 * @param {import('./allowedColumnsUtils').AllowedColumnsInput} [opts.allowedColumns]
 * @returns {string[]}
 */
export function getOrderedDisplayColumns({
  columns,
  visibleColumns,
  effectiveGroupFields,
  hasPercentageColumns,
  percentageColumns = [],
  percentageColumnNames,
  allowedColumns,
}) {
  if (isEmpty(columns)) {
    return [];
  }

  const outerGroupField = effectiveGroupFields?.[0] || null;
  const innerGroupField = effectiveGroupFields?.[1] || null;

  let filteredColumns = columns;

  if (outerGroupField) {
    filteredColumns = columns.filter((col) => {
      if (col === outerGroupField) {
        return true;
      }
      if (col === innerGroupField) {
        return false;
      }
      if (effectiveGroupFields && effectiveGroupFields.length > 1 && effectiveGroupFields.indexOf(col) > 0) {
        return false;
      }
      return true;
    });
    const allowedForLevel = getAllowedForGroupField(allowedColumns, outerGroupField) ?? getAllowedForScope(allowedColumns, 'main');
    if (allowedForLevel && allowedForLevel.length > 0) {
      const allowedSet = new Set(allowedForLevel);
      filteredColumns = filteredColumns.filter((col) => allowedSet.has(col));
    }
  }

  filteredColumns = filteredColumns.filter((col) => !col || typeof col !== 'string' || !col.startsWith('__'));

  if (!isEmpty(visibleColumns) && isArray(visibleColumns)) {
    const visibleSet = new Set(visibleColumns);
    filteredColumns = filteredColumns.filter((col) => {
      if (col === outerGroupField) {
        return true;
      }
      if (col === innerGroupField) {
        return false;
      }
      return visibleSet.has(col);
    });
  }

  const percentageColumnNamesLocal =
    percentageColumnNames?.length && isArray(percentageColumnNames)
      ? percentageColumnNames
      : (percentageColumns || []).map((pc) => pc.columnName).filter(Boolean);

  const nonPercentageColumns = filteredColumns.filter((col) => !includes(percentageColumnNamesLocal, col));

  const ordered = [];

  const allowedForOuter = getAllowedForGroupField(allowedColumns, outerGroupField) ?? getAllowedForScope(allowedColumns, 'main');
  const outerGroupAllowed = !allowedForOuter || allowedForOuter.length === 0 || includes(allowedForOuter, outerGroupField);
  if (outerGroupField && (includes(filteredColumns, outerGroupField) || (effectiveGroupFields?.length > 0 && outerGroupAllowed))) {
    ordered.push(outerGroupField);
  }

  const nonPercentageExcludingOuter = nonPercentageColumns.filter((col) => col !== outerGroupField);
  let workingArray = [...nonPercentageExcludingOuter];

  const percentageColumnsWithBeforeColumn = hasPercentageColumns
    ? percentageColumns.filter((pc) => pc.columnName && pc.beforeColumn && pc.beforeColumn !== pc.columnName)
    : [];

  const insertedPercentageColumns = new Set();

  percentageColumnsWithBeforeColumn.forEach((pc) => {
    const beforeCol = pc.beforeColumn;
    const pctColName = pc.columnName;
    if (beforeCol === outerGroupField) {
      return;
    }
    if (!includes(filteredColumns, beforeCol)) {
      return;
    }
    const beforeIndex = workingArray.indexOf(beforeCol);
    if (beforeIndex !== -1) {
      workingArray.splice(beforeIndex, 0, pctColName);
      insertedPercentageColumns.add(pctColName);
    }
  });

  const percentageColumnsBeforeOuterGroup = percentageColumnsWithBeforeColumn.filter(
    (pc) => pc.beforeColumn === outerGroupField && outerGroupField && includes(filteredColumns, outerGroupField)
  );

  const pctColsAfterOuter = percentageColumnsBeforeOuterGroup
    .map((pc) => pc.columnName)
    .filter((name) => name && !insertedPercentageColumns.has(name));

  if (pctColsAfterOuter.length > 0 && outerGroupField && includes(filteredColumns, outerGroupField)) {
    ordered.push(...pctColsAfterOuter);
    pctColsAfterOuter.forEach((col) => insertedPercentageColumns.add(col));
  }

  ordered.push(...workingArray);

  if (hasPercentageColumns) {
    const remainingPercentageColumns = percentageColumns
      .filter((pc) => pc.columnName && !insertedPercentageColumns.has(pc.columnName))
      .map((pc) => pc.columnName);

    if (remainingPercentageColumns.length > 0) {
      if (outerGroupField && includes(filteredColumns, outerGroupField)) {
        const insertIndex = 1 + pctColsAfterOuter.length;
        ordered.splice(insertIndex, 0, ...remainingPercentageColumns);
      } else {
        ordered.unshift(...remainingPercentageColumns);
      }
    }
  }

  const finalResult = [];
  const seen = new Set();
  ordered.forEach((col) => {
    if (!seen.has(col)) {
      seen.add(col);
      finalResult.push(col);
    }
  });
  return finalResult;
}

/**
 * @param {string[]} uiOrder — from getOrderedDisplayColumns
 * @param {Set<string>|string[]} exportable — columns that appear in export rows
 * @returns {string[]} uiOrder ∩ exportable, then any remaining exportable (sorted) for stability
 */
export function alignExportColumnsToUiOrder(uiOrder, exportable) {
  const set = exportable instanceof Set ? exportable : new Set(exportable);
  const ordered = (uiOrder || []).filter(
    (c) => c && typeof c === 'string' && !c.startsWith('__') && set.has(c)
  );
  const picked = new Set(ordered);
  const extra = [...set].filter(
    (c) => typeof c === 'string' && !c.startsWith('__') && !picked.has(c)
  );
  extra.sort((a, b) => String(a).localeCompare(String(b)));
  return [...ordered, ...extra];
}
