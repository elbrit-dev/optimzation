'use client';

import React, { useState, useMemo } from 'react';
import { uniq, flatMap, keys, isEmpty } from 'lodash';
import DataTableComponent from '../repo1/DataTable';
import DataTableControls from '../repo1/DataTableControls';

const DataTableWrapper = (props) => {
  const { 
    data, 
    showControls = true,
    // State props (can be controlled or uncontrolled)
    enableSort: propsEnableSort = true,
    enableFilter: propsEnableFilter = true,
    enableSummation: propsEnableSummation = true,
    rowsPerPageOptions: propsRowsPerPageOptions = [10, 25, 50, 100],
    textFilterColumns: propsTextFilterColumns = [],
    visibleColumns: propsVisibleColumns = [],
    redFields: propsRedFields = [],
    greenFields: propsGreenFields = [],
    outerGroupField: propsOuterGroupField = null,
    innerGroupField: propsInnerGroupField = null,
    enableCellEdit: propsEnableCellEdit = false,
    nonEditableColumns: propsNonEditableColumns = [],
    enableTargetData: propsEnableTargetData = false,
    targetOuterGroupField: propsTargetOuterGroupField = null,
    targetInnerGroupField: propsTargetInnerGroupField = null,
    targetValueField: propsTargetValueField = null,
    actualValueField: propsActualValueField = null,
    
    className,
    ...rest 
  } = props;

  // Local state for controls
  const [enableSort, setEnableSort] = useState(propsEnableSort);
  const [enableFilter, setEnableFilter] = useState(propsEnableFilter);
  const [enableSummation, setEnableSummation] = useState(propsEnableSummation);
  const [rowsPerPageOptions, setRowsPerPageOptions] = useState(propsRowsPerPageOptions);
  const [textFilterColumns, setTextFilterColumns] = useState(propsTextFilterColumns);
  const [visibleColumns, setVisibleColumns] = useState(propsVisibleColumns);
  const [redFields, setRedFields] = useState(propsRedFields);
  const [greenFields, setGreenFields] = useState(propsGreenFields);
  const [outerGroupField, setOuterGroupField] = useState(propsOuterGroupField);
  const [innerGroupField, setInnerGroupField] = useState(propsInnerGroupField);
  const [enableCellEdit, setEnableCellEdit] = useState(propsEnableCellEdit);
  const [nonEditableColumns, setNonEditableColumns] = useState(propsNonEditableColumns);
  const [enableTargetData, setEnableTargetData] = useState(propsEnableTargetData);
  const [targetOuterGroupField, setTargetOuterGroupField] = useState(propsTargetOuterGroupField);
  const [targetInnerGroupField, setTargetInnerGroupField] = useState(propsTargetInnerGroupField);
  const [targetValueField, setTargetValueField] = useState(propsTargetValueField);
  const [actualValueField, setActualValueField] = useState(propsActualValueField);

  // Sync with props if they change (optional, but good for Plasmic Studio)
  React.useEffect(() => { setEnableSort(propsEnableSort); }, [propsEnableSort]);
  React.useEffect(() => { setEnableFilter(propsEnableFilter); }, [propsEnableFilter]);
  React.useEffect(() => { setEnableSummation(propsEnableSummation); }, [propsEnableSummation]);
  React.useEffect(() => { setRowsPerPageOptions(propsRowsPerPageOptions); }, [propsRowsPerPageOptions]);
  React.useEffect(() => { setTextFilterColumns(propsTextFilterColumns); }, [propsTextFilterColumns]);
  React.useEffect(() => { setVisibleColumns(propsVisibleColumns); }, [propsVisibleColumns]);
  React.useEffect(() => { setRedFields(propsRedFields); }, [propsRedFields]);
  React.useEffect(() => { setGreenFields(propsGreenFields); }, [propsGreenFields]);
  React.useEffect(() => { setOuterGroupField(propsOuterGroupField); }, [propsOuterGroupField]);
  React.useEffect(() => { setInnerGroupField(propsInnerGroupField); }, [propsInnerGroupField]);
  React.useEffect(() => { setEnableCellEdit(propsEnableCellEdit); }, [propsEnableCellEdit]);
  React.useEffect(() => { setNonEditableColumns(propsNonEditableColumns); }, [propsNonEditableColumns]);
  React.useEffect(() => { setEnableTargetData(propsEnableTargetData); }, [propsEnableTargetData]);
  React.useEffect(() => { setTargetOuterGroupField(propsTargetOuterGroupField); }, [propsTargetOuterGroupField]);
  React.useEffect(() => { setTargetInnerGroupField(propsTargetInnerGroupField); }, [propsTargetInnerGroupField]);
  React.useEffect(() => { setTargetValueField(propsTargetValueField); }, [propsTargetValueField]);
  React.useEffect(() => { setActualValueField(propsActualValueField); }, [propsActualValueField]);

  // Extract column names from data for the controls
  const columns = useMemo(() => {
    if (!Array.isArray(data) || isEmpty(data)) return [];
    return uniq(flatMap(data, (item) =>
      item && typeof item === 'object' ? keys(item) : []
    ));
  }, [data]);

  // Graceful fallback for Plasmic Studio preview
  if (!data || (Array.isArray(data) && data.length === 0)) {
    return (
      <div className={`p-8 border-2 border-dashed border-gray-300 rounded-lg bg-gray-50 text-gray-500 text-center ${className}`}>
        <i className="pi pi-table text-3xl mb-3 block"></i>
        <div className="text-lg font-medium mb-1">DataTable</div>
        <p className="text-sm">No data provided. Connect a data source in Plasmic Studio.</p>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      {showControls && (
        <DataTableControls
          enableSort={enableSort}
          enableFilter={enableFilter}
          enableSummation={enableSummation}
          enableCellEdit={enableCellEdit}
          rowsPerPageOptions={rowsPerPageOptions}
          columns={columns}
          textFilterColumns={textFilterColumns}
          visibleColumns={visibleColumns}
          redFields={redFields}
          greenFields={greenFields}
          outerGroupField={outerGroupField}
          innerGroupField={innerGroupField}
          nonEditableColumns={nonEditableColumns}
          enableTargetData={enableTargetData}
          targetOuterGroupField={targetOuterGroupField}
          targetInnerGroupField={targetInnerGroupField}
          targetValueField={targetValueField}
          actualValueField={actualValueField}
          
          onSortChange={setEnableSort}
          onFilterChange={setEnableFilter}
          onSummationChange={setEnableSummation}
          onCellEditChange={setEnableCellEdit}
          onRowsPerPageOptionsChange={setRowsPerPageOptions}
          onTextFilterColumnsChange={setTextFilterColumns}
          onVisibleColumnsChange={setVisibleColumns}
          onRedFieldsChange={setRedFields}
          onGreenFieldsChange={setGreenFields}
          onOuterGroupFieldChange={setOuterGroupField}
          onInnerGroupFieldChange={setInnerGroupField}
          onNonEditableColumnsChange={setNonEditableColumns}
          onEnableTargetDataChange={setEnableTargetData}
          onTargetOuterGroupFieldChange={setTargetOuterGroupField}
          onTargetInnerGroupFieldChange={setTargetInnerGroupField}
          onTargetValueFieldChange={setTargetValueField}
          onActualValueFieldChange={setActualValueField}
        />
      )}
      <DataTableComponent 
        data={data} 
        enableSort={enableSort}
        enableFilter={enableFilter}
        enableSummation={enableSummation}
        enableCellEdit={enableCellEdit}
        rowsPerPageOptions={rowsPerPageOptions}
        textFilterColumns={textFilterColumns}
        visibleColumns={visibleColumns}
        redFields={redFields}
        greenFields={greenFields}
        outerGroupField={outerGroupField}
        innerGroupField={innerGroupField}
        nonEditableColumns={nonEditableColumns}
        targetOuterGroupField={targetOuterGroupField}
        targetInnerGroupField={targetInnerGroupField}
        targetValueField={targetValueField}
        actualValueField={actualValueField}
        {...rest} 
      />
    </div>
  );
};

export default DataTableWrapper;
