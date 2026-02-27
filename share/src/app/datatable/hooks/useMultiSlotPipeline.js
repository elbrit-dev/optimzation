'use client';

import { isArray, isEmpty } from 'lodash';
import { useMemo } from 'react';
import { getDataValue } from '../utils/dataAccessUtils';
import { applyDerivedColumns } from '../utils/derivedColumnsUtils';
import { computeSearchSortSortedData, computeSlotPipeline } from '../utils/perSlotPipelineUtils';
import { useDataPipeline } from './useDataPipeline';

/**
 * Multi-slot data pipeline. When slotIds.length === 1, delegates to useDataPipeline.
 * When slotIds.length > 1, computes per-slot pipeline using computeSlotPipeline.
 *
 * @param {Object} options - Same as useDataPipeline, plus:
 * @param {Object} options.slots - { [slotId]: slotConfig }
 * @param {string[]} options.slotIds - Array of slot IDs
 * @param {Object} options.slotStateBySlot - { [slotId]: { tableFilters, tableSortMeta, tablePagination } }
 */
export function useMultiSlotPipeline(options) {
  const {
    slots = {},
    slotIds = [],
    slotStateBySlot = {},
    ...pipelineOptions
  } = options;

  const singlePipeline = useDataPipeline({
    ...pipelineOptions,
    tableFilters: slotStateBySlot[slotIds[0]]?.tableFilters ?? pipelineOptions.tableFilters ?? {},
    tableSortMeta: slotStateBySlot[slotIds[0]]?.tableSortMeta ?? pipelineOptions.tableSortMeta ?? [],
    tablePagination: slotStateBySlot[slotIds[0]]?.tablePagination ?? pipelineOptions.tablePagination ?? { first: 0, rows: 10 },
    groupFields: slots[slotIds[0]]?.groupFields ?? pipelineOptions.groupFields,
    derivedColumns: slots[slotIds[0]]?.derivedColumns ?? pipelineOptions.derivedColumns ?? [],
    percentageColumns: slots[slotIds[0]]?.percentageColumns ?? pipelineOptions.percentageColumns ?? [],
    textFilterColumns: slots[slotIds[0]]?.textFilterColumns ?? pipelineOptions.textFilterColumns ?? [],
    enableFilter: slots[slotIds[0]]?.enableFilter ?? pipelineOptions.enableFilter ?? true,
    enableSort: slots[slotIds[0]]?.enableSort ?? pipelineOptions.enableSort ?? true,
  });

  const pipelinesBySlot = useMemo(() => {
    if (!isArray(slotIds) || slotIds.length <= 1) {
      const sid = slotIds[0] ?? 'main';
      return {
        [sid]: {
          filteredData: singlePipeline.filteredData,
          groupedData: singlePipeline.groupedData,
          sortedData: singlePipeline.sortedData,
          paginatedData: singlePipeline.paginatedData,
          pipelineColumnMeta: singlePipeline.pipelineColumnMeta,
          effectiveGroupFields: singlePipeline.effectiveGroupFields,
          filteredDataWithNestedTables: singlePipeline.filteredDataWithNestedTables,
        },
      };
    }

    const {
      preFilteredData,
      currentQueryDoc,
      searchTerm,
      sortConfig,
      columnTypesOverride,
      allowedColumns,
      derivedColumnsMode,
      derivedColumnsFieldName,
      fallbackColumns,
    } = pipelineOptions;
    const { addEditingKeysToRows, mainTableEditingDataRefEarly } = singlePipeline;

    const editingData = mainTableEditingDataRefEarly?.current;
    const baseTableData =
      editingData && isArray(editingData) && !isEmpty(editingData)
        ? editingData
        : preFilteredData && isArray(preFilteredData) && !isEmpty(preFilteredData)
          ? addEditingKeysToRows(preFilteredData)
          : preFilteredData ?? [];

    const sharedSearchSortOptions = {
      currentQueryDoc,
      searchTerm: searchTerm ?? '',
      sortConfig,
      columnTypesOverride: columnTypesOverride ?? {},
    };

    const sharedPipelineOptions = {
      columnTypesOverride: columnTypesOverride ?? {},
      allowedColumns: allowedColumns ?? [],
      currentQueryDoc,
      sortConfig,
      fallbackColumns,
      derivedColumnsMode: derivedColumnsMode ?? 'main',
      derivedColumnsFieldName: derivedColumnsFieldName ?? null,
    };

    const result = {};
    for (const slotId of slotIds) {
      const slotConfig = slots[slotId] ?? {};
      const slotState = slotStateBySlot[slotId] ?? {};
      const tableData = baseTableData && !isEmpty(baseTableData)
        ? applyDerivedColumns(baseTableData, slotConfig.derivedColumns ?? [], {
            mode: derivedColumnsMode ?? 'main',
            fieldName: derivedColumnsFieldName ?? null,
            getDataValue,
          })
        : baseTableData;
      const searchSortSortedData = computeSearchSortSortedData(tableData, sharedSearchSortOptions);
      const slotResult = computeSlotPipeline(searchSortSortedData, slotConfig, slotState, sharedPipelineOptions);
      result[slotId] = slotResult;
    }
    return result;
  }, [
    slotIds,
    slots,
    slotStateBySlot,
    singlePipeline.filteredData,
    singlePipeline.groupedData,
    singlePipeline.sortedData,
    singlePipeline.paginatedData,
    singlePipeline.pipelineColumnMeta,
    singlePipeline.effectiveGroupFields,
    singlePipeline.filteredDataWithNestedTables,
    singlePipeline.addEditingKeysToRows,
    singlePipeline.mainTableEditingDataRefEarly,
    pipelineOptions.preFilteredData,
    pipelineOptions.currentQueryDoc,
    pipelineOptions.searchTerm,
    pipelineOptions.sortConfig,
    pipelineOptions.columnTypesOverride,
    pipelineOptions.allowedColumns,
    pipelineOptions.fallbackColumns,
    pipelineOptions.derivedColumnsMode,
    pipelineOptions.derivedColumnsFieldName,
  ]);

  return {
    ...singlePipeline,
    pipelinesBySlot,
  };
}
