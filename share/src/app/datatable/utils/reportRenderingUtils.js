import React from 'react';
import { ColumnGroup } from 'primereact/columngroup';
import { Row } from 'primereact/row';
import { Column } from 'primereact/column';
import { reorganizePeriodsForPeriodOverPeriod, getTimePeriodLabelShort } from './timeBreakdownUtils';

/**
 * Formats metric labels - converts snake_case or camelCase to Title Case
 * @param {string} metricKey - The metric key to format
 * @returns {string} Formatted metric label
 */
export function getMetricLabel(metricKey) {
  // Convert snake_case or camelCase to Title Case
  return metricKey
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
    .trim();
}

/**
 * Computes report column structure based on report data and column grouping mode.
 * When reportData.orderedNonGroupColumns is provided, preserves original column order
 * (derived columns and exempt columns from breakdown) by interleaving exempt and breakdown segments.
 * @param {Object} reportData - Report data object with timePeriods, metrics, tableData, breakdownType, exemptColumns, orderedNonGroupColumns?
 * @param {string} columnGroupBy - Column grouping mode: 'values', 'sub-columns', 'period-over-period'
 * @param {Array} exemptColumns - Column names exempt from breakdown (from reportData.exemptColumns or override)
 * @returns {Object|null} Column structure object or null if invalid
 */
export function computeReportColumnsStructure(reportData, columnGroupBy, exemptColumns = null) {
  if (!reportData || !reportData.timePeriods || !reportData.metrics) {
    return null;
  }

  const { timePeriods: rawTimePeriods, metrics, tableData, breakdownType, orderedNonGroupColumns } = reportData;
  const exemptCols = exemptColumns ?? reportData.exemptColumns ?? [];
  const exemptColsArray = Array.isArray(exemptCols) ? exemptCols : [];

  // Reorganize periods for Period-over-Period mode
  let timePeriods = rawTimePeriods;
  if (columnGroupBy === 'period-over-period') {
    // Get periods that actually have data
    const periodsWithData = new Set();
    if (tableData && tableData.length > 0) {
      tableData.forEach(row => {
        rawTimePeriods.forEach(period => {
          metrics.forEach(metric => {
            const columnName = `${period}_${metric}`;
            const value = row[columnName];
            if (value !== null && value !== undefined) {
              periodsWithData.add(period);
            }
          });
        });
      });
    }
    const periodsArray = Array.from(periodsWithData).sort();
    timePeriods = reorganizePeriodsForPeriodOverPeriod(periodsArray, breakdownType);
  }
  
  // Pre-compute which columns have data (single pass through tableData)
  const columnHasData = new Set();
  if (tableData && tableData.length > 0) {
    tableData.forEach(row => {
      timePeriods.forEach(period => {
        metrics.forEach(metric => {
          const columnName = `${period}_${metric}`;
          const value = row[columnName];
          if (value !== null && value !== undefined) {
            columnHasData.add(columnName);
          }
        });
      });
    });
  }
  
  // Determine order based on columnGroupBy mode
  const isMergedMode = columnGroupBy === 'values' || columnGroupBy === 'period-over-period';
  const exemptSet = new Set(exemptColsArray);
  const metricsSet = new Set(metrics);

  // Build metric->periods and period->metrics maps for breakdown columns
  const metricToPeriods = {};
  const periodToMetrics = {};
  metrics.forEach(metric => {
    timePeriods.forEach(period => {
      const columnName = `${period}_${metric}`;
      if (columnHasData.has(columnName)) {
        if (!metricToPeriods[metric]) metricToPeriods[metric] = [];
        metricToPeriods[metric].push(period);
        if (!periodToMetrics[period]) periodToMetrics[period] = [];
        periodToMetrics[period].push(metric);
      }
    });
  });

  // Build ordered segments when orderedNonGroupColumns is provided (preserve original position)
  let orderedSegments = null;
  if (Array.isArray(orderedNonGroupColumns) && orderedNonGroupColumns.length > 0) {
    orderedSegments = [];
    for (const col of orderedNonGroupColumns) {
      if (exemptSet.has(col)) {
        orderedSegments.push({ type: 'exempt', name: col });
      } else if (metricsSet.has(col) && (metricToPeriods[col]?.length ?? 0) > 0) {
        orderedSegments.push({
          type: 'breakdown',
          metric: col,
          periods: metricToPeriods[col],
          columnNames: metricToPeriods[col].map((p) => `${p}_${col}`)
        });
      }
    }
  }

  // Legacy: build flat columnsWithData for backward compatibility
  const columnsWithData = [];
  if (isMergedMode) {
    metrics.forEach(metric => {
      timePeriods.forEach(period => {
        const columnName = `${period}_${metric}`;
        if (columnHasData.has(columnName)) {
          columnsWithData.push({ period, metric, columnName });
        }
      });
    });
  } else {
    timePeriods.forEach(period => {
      metrics.forEach(metric => {
        const columnName = `${period}_${metric}`;
        if (columnHasData.has(columnName)) {
          columnsWithData.push({ period, metric, columnName });
        }
      });
    });
  }
  
  const metricGroups = {};
  columnsWithData.forEach(({ metric, period }) => {
    if (!metricGroups[metric]) metricGroups[metric] = [];
    metricGroups[metric].push(period);
  });
  
  const periodGroups = {};
  columnsWithData.forEach(({ period, metric }) => {
    if (!periodGroups[period]) periodGroups[period] = [];
    periodGroups[period].push(metric);
  });
  
  return {
    columnsWithData,
    metricGroups,
    periodGroups,
    metricsWithData: Object.keys(metricGroups),
    timePeriodsWithData: Object.keys(periodGroups).sort(),
    columnNames: columnsWithData.map(c => c.columnName),
    exemptColumns: exemptColsArray,
    orderedSegments,
    isMergedMode,
    isPeriodOverPeriod: columnGroupBy === 'period-over-period'
  };
}

/**
 * Generates report header group JSX for the DataTable
 * @param {Object} reportColumnsStructure - Column structure from computeReportColumnsStructure
 * @param {Object} reportData - Report data object with breakdownType
 * @param {string} outerGroupField - Outer group field name
 * @param {Function} formatHeaderName - Function to format header names
 * @param {boolean} [enableSort=true] - Whether to show sort option on columns
 * @param {boolean} [includeGroupColumn=true] - When false, omit group column (e.g. when not in allowedColumns)
 * @param {((fieldName: string) => React.ReactNode) | null} [getPivotHeaderAddon] - Renders pivot metric filter(s). When metricFiltersSeparateRow is true they appear on a dedicated header row below leaf titles instead of stacked in the leaf cell.
 * @param {{ metricFiltersSeparateRow?: boolean }} [reportHeaderOpts] When metricFiltersSeparateRow, adds a fourth header row for addon cells and bumps rowSpan on pinned/exempt columns to 4.
 * @returns {JSX.Element|null} ColumnGroup element or null
 */
export function generateReportHeaderGroup(
  reportColumnsStructure,
  reportData,
  outerGroupField,
  formatHeaderName,
  enableSort = true,
  includeGroupColumn = true,
  getPivotHeaderAddon = null,
  reportHeaderOpts = {}
) {
  if (!reportColumnsStructure || !reportData) {
    return null;
  }

  const { metricFiltersSeparateRow = false } = reportHeaderOpts;

  const { breakdownType } = reportData;
  const {
    metricGroups,
    periodGroups,
    metricsWithData,
    timePeriodsWithData,
    columnsWithData,
    exemptColumns = [],
    orderedSegments,
    isMergedMode
  } = reportColumnsStructure;

  const hdrSpan = metricFiltersSeparateRow ? 4 : 3;
  const hasPivotAddonFn = typeof getPivotHeaderAddon === 'function';
  /** Breakdown exempt columns reserve the bottom header row for filters (match metric columns) */
  const exemptPrimaryRowSpan =
    metricFiltersSeparateRow && hasPivotAddonFn ? Math.max(1, hdrSpan - 1) : hdrSpan;

  const leafCombined = (fieldName, labelText) => {
    const addon = hasPivotAddonFn ? getPivotHeaderAddon(fieldName) : null;
    if (!addon) return labelText;
    return (
      <div className="flex flex-col items-stretch gap-1.5 min-w-0 w-full text-left">
        <span className="block text-xs leading-tight text-gray-800 truncate">{labelText}</span>
        <div className="w-full min-w-0">{addon}</div>
      </div>
    );
  };

  const leafTitleOnly = (labelText) => (
    <span className="block text-xs leading-tight text-gray-800 truncate">{labelText}</span>
  );

  /** Leaf header content: stacked label + filter, or title-only row when metric filters occupy the row below */
  const leafHeaderCell = (fieldName, labelText) =>
    metricFiltersSeparateRow && hasPivotAddonFn ? leafTitleOnly(labelText) : leafCombined(fieldName, labelText);

  /** Fourth row cells for breakdown metric columns — empty string when addon missing */
  const pivotFilterOnlyHeader = (fieldName) => {
    if (!(metricFiltersSeparateRow && hasPivotAddonFn)) return null;
    const addon = getPivotHeaderAddon(fieldName);
    return addon ? <div className="w-full min-w-0">{addon}</div> : '';
  };

  /** Filter row cells in same order as `getReportColumns` / body `Column` fields (single orderedSegments pass). */
  const orderedSegmentFilterRowColumns = () =>
    orderedSegments.flatMap((seg) => {
      if (seg.type === 'exempt') {
        return [
          <Column
            key={`filter-exempt-${seg.name}`}
            sortable={false}
            header={pivotFilterOnlyHeader(seg.name) ?? ''}
            field={seg.name}
          />,
        ];
      }
      return seg.periods.map((period) => {
        const f = `${period}_${seg.metric}`;
        return (
          <Column
            key={`filter-${f}`}
            sortable={false}
            header={pivotFilterOnlyHeader(f) ?? ''}
            field={f}
          />
        );
      });
    });

  const totalDataCols = columnsWithData.length;
  const exemptColsArray = Array.isArray(exemptColumns) ? exemptColumns : [];

  // When orderedSegments is present, render interleaved structure (preserves original column position)
  if (orderedSegments && orderedSegments.length > 0) {
    if (isMergedMode) {
      // Merged: metric header, then period headers under each metric
      return (
        <ColumnGroup>
          <Row>
            <Column header="" rowSpan={hdrSpan} style={{ width: '3rem' }} />
            {includeGroupColumn && <Column header={formatHeaderName(outerGroupField)} rowSpan={hdrSpan} />}
            {orderedSegments.map((seg, idx) =>
              seg.type === 'exempt' ? (
                <Column key={`exempt-${seg.name}`} header={formatHeaderName(seg.name)} rowSpan={exemptPrimaryRowSpan} sortable={enableSort} field={seg.name} />
              ) : (
                <Column key={`breakdown-${seg.metric}-${idx}`} header="" colSpan={seg.periods.length} />
              )
            )}
          </Row>
          <Row>
            {orderedSegments.map((seg, idx) =>
              seg.type === 'exempt' ? null : (
                <Column key={`metric-${seg.metric}-${idx}`} header={getMetricLabel(seg.metric)} colSpan={seg.periods.length} />
              )
            )}
          </Row>
          <Row>
            {orderedSegments.map((seg) =>
              seg.type === 'exempt'
                ? null
                : seg.periods.map((period) => (
                    <Column
                      key={`${period}_${seg.metric}`}
                      header={leafHeaderCell(
                        `${period}_${seg.metric}`,
                        getTimePeriodLabelShort(period, breakdownType)
                      )}
                      sortable={enableSort}
                      field={`${period}_${seg.metric}`}
                    />
                  ))
            )}
          </Row>
          {metricFiltersSeparateRow && hasPivotAddonFn ? (
            <Row>{orderedSegmentFilterRowColumns()}</Row>
          ) : null}
        </ColumnGroup>
      );
    }
    // Sub-columns: period header, then metric headers under each period
    return (
      <ColumnGroup>
        <Row>
          <Column header="" rowSpan={hdrSpan} style={{ width: '3rem' }} />
          {includeGroupColumn && <Column header={formatHeaderName(outerGroupField)} rowSpan={hdrSpan} />}
          {orderedSegments.map((seg, idx) =>
            seg.type === 'exempt' ? (
              <Column key={`exempt-${seg.name}`} header={formatHeaderName(seg.name)} rowSpan={exemptPrimaryRowSpan} sortable={enableSort} field={seg.name} />
            ) : (
              <Column key={`breakdown-${seg.metric}-${idx}`} header="" colSpan={seg.periods.length} />
            )
          )}
        </Row>
        <Row>
          {orderedSegments.map((seg) =>
            seg.type === 'exempt'
              ? null
              : seg.periods.map((period) => (
                  <Column key={`period-${period}-${seg.metric}`} header={getTimePeriodLabelShort(period, breakdownType)} colSpan={1} />
                ))
          )}
        </Row>
        <Row>
          {orderedSegments.map((seg) =>
            seg.type === 'exempt'
              ? null
              : seg.periods.map((period) => (
                  <Column
                    key={`${period}_${seg.metric}`}
                    header={leafHeaderCell(`${period}_${seg.metric}`, getMetricLabel(seg.metric))}
                    sortable={enableSort}
                    field={`${period}_${seg.metric}`}
                  />
                ))
          )}
        </Row>
        {metricFiltersSeparateRow && hasPivotAddonFn ? (
          <Row>{orderedSegmentFilterRowColumns()}</Row>
        ) : null}
      </ColumnGroup>
    );
  }

  // Legacy: exempt block, then breakdown block
  if (isMergedMode) {
    return (
      <ColumnGroup>
        <Row>
          <Column header="" rowSpan={hdrSpan} style={{ width: '3rem' }} />
          {includeGroupColumn && <Column header={formatHeaderName(outerGroupField)} rowSpan={hdrSpan} />}
          {exemptColsArray.map((col) => (
            <Column key={col} header={formatHeaderName(col)} rowSpan={exemptPrimaryRowSpan} sortable={enableSort} field={col} />
          ))}
          {totalDataCols > 0 && (
            <Column header="" colSpan={totalDataCols} />
          )}
        </Row>
        <Row>
          {metricsWithData.map((metric) => {
            const periodCount = metricGroups[metric].length;
            return <Column key={metric} header={getMetricLabel(metric)} colSpan={periodCount} />;
          })}
        </Row>
        <Row>
          {metricsWithData.map((metric) =>
            metricGroups[metric].map((period) => (
              <Column
                key={`${period}_${metric}`}
                header={leafHeaderCell(
                  `${period}_${metric}`,
                  getTimePeriodLabelShort(period, breakdownType)
                )}
                sortable={enableSort}
                field={`${period}_${metric}`}
              />
            ))
          )}
        </Row>
        {metricFiltersSeparateRow && hasPivotAddonFn ? (
          <Row>
            {exemptColsArray.map((col) => (
              <Column
                key={`filter-exempt-${col}`}
                sortable={false}
                header={pivotFilterOnlyHeader(col) ?? ''}
                field={col}
              />
            ))}
            {metricsWithData.map((metric) =>
              metricGroups[metric].map((period) => {
                const f = `${period}_${metric}`;
                return <Column key={`filter-${f}`} sortable={false} header={pivotFilterOnlyHeader(f) ?? ''} field={f} />;
              })
            )}
          </Row>
        ) : null}
      </ColumnGroup>
    );
  }
// Sub-columns mode
  return (
    <ColumnGroup>
      <Row>
        <Column key="report-expander" header="" rowSpan={hdrSpan} style={{ width: '3rem' }} />
        {includeGroupColumn && <Column key={`report-group-${outerGroupField}`} header={formatHeaderName(outerGroupField)} rowSpan={hdrSpan} />}
        {exemptColsArray.map((col) => (
          <Column key={col} header={formatHeaderName(col)} rowSpan={exemptPrimaryRowSpan} sortable={enableSort} field={col} />
        ))}
        {totalDataCols > 0 && <Column header="" colSpan={totalDataCols} />}
      </Row>
      <Row>
        {timePeriodsWithData.map((period) => {
          const metricCount = periodGroups[period].length;
          return (
            <Column key={period} header={getTimePeriodLabelShort(period, breakdownType)} colSpan={metricCount} />
          );
        })}
      </Row>
      <Row>
        {timePeriodsWithData.map((period) =>
          periodGroups[period].map((metric) => (
            <Column
              key={`${period}_${metric}`}
              header={leafHeaderCell(`${period}_${metric}`, getMetricLabel(metric))}
              sortable={enableSort}
              field={`${period}_${metric}`}
            />
          ))
        )}
      </Row>
      {metricFiltersSeparateRow && hasPivotAddonFn ? (
        <Row>
          {exemptColsArray.map((col) => (
            <Column
              key={`filter-exempt-${col}`}
              sortable={false}
              header={pivotFilterOnlyHeader(col) ?? ''}
              field={col}
            />
          ))}
          {timePeriodsWithData.map((period) =>
            periodGroups[period].map((metric) => {
              const f = `${period}_${metric}`;
              return <Column key={`filter-${f}`} sortable={false} header={pivotFilterOnlyHeader(f) ?? ''} field={f} />;
            })
          )}
        </Row>
      ) : null}
    </ColumnGroup>
  );
}

/**
 * Generates report column list from column structure
 * @param {Object} reportColumnsStructure - Column structure from computeReportColumnsStructure
 * @param {string} outerGroupField - Outer group field name
 * @param {boolean} [includeGroupColumn=true] - When false, omit group column (e.g. when not in allowedColumns)
 * @returns {Array} Array of column names
 */
export function getReportColumns(reportColumnsStructure, outerGroupField, includeGroupColumn = true) {
  if (!reportColumnsStructure) {
    return [];
  }

  const cols = includeGroupColumn ? [outerGroupField] : [];
  const { orderedSegments, exemptColumns = [], columnNames } = reportColumnsStructure;

  if (orderedSegments && orderedSegments.length > 0) {
    for (const seg of orderedSegments) {
      if (seg.type === 'exempt') {
        cols.push(seg.name);
      } else if (seg.columnNames) {
        cols.push(...seg.columnNames);
      }
    }
    return cols;
  }

  const exemptCols = Array.isArray(exemptColumns) ? exemptColumns : [];
  if (exemptCols.length > 0) {
    cols.push(...exemptCols);
  }
  cols.push(...(columnNames ?? []));
  return cols;
}
