'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { Toast } from 'primereact/toast';
import { extractNestedTablesFromRow, parseJsonArrayOfObjects } from '../utils/jsonArrayParser';
import { getDataKeys, getDataValue } from '../utils/dataAccessUtils';
import { isString, isArray, isNumber, isNil, trim, startCase } from 'lodash';

/**
 * Mock demo component demonstrating nested tables from JSON string arrays
 * This will be integrated into DataTableNew.jsx later
 */
export default function NestedTablesDemo() {
    const [products, setProducts] = useState([]);
    const [expandedRows, setExpandedRows] = useState(null);
    const toastRef = React.useRef(null);

    // Mock data with JSON string arrays (matching your example structure)
    useEffect(() => {
        const mockData = [
            {
                id: 1,
                name: 'FOLBRIT MB',
                price: 124.58,
                category: 'Medicine',
                brand__name: 'FOLBRIT',
                // JSON string array - will be parsed and shown as nested table
                // Pattern: [{ (with optional spaces) triggers parsing
                kly_stock_levels: JSON.stringify([
                    {
                        item_code: 'FOLBRIT MB',
                        warehouse: 'Mother Warehouse - ELPL',
                        projected_qty: -18310,
                        reserved_qty: 18310,
                        actual_qty: 0,
                        valuation_rate: 9.4,
                        stock_uom: 'STRIPS'
                    },
                    {
                        item_code: 'FOLBRIT MB',
                        warehouse: 'Stores - SW',
                        projected_qty: -765,
                        reserved_qty: 894,
                        actual_qty: 129,
                        valuation_rate: 6.18,
                        stock_uom: 'STRIPS'
                    },
                    {
                        item_code: 'FOLBRIT MB',
                        warehouse: 'CFA Coimbatore - ELPL',
                        projected_qty: -407,
                        reserved_qty: 646,
                        actual_qty: 239,
                        valuation_rate: 9.5,
                        stock_uom: 'STRIPS'
                    }
                ]),
                // Another JSON string array - will create second nested table
                kly_elbrit_sales_team: JSON.stringify([
                    {
                        elbrit_sales_team__name: 'Elbrit Punjab',
                        valid_from: null,
                        valid_to: null,
                        cn_till: null
                    },
                    {
                        elbrit_sales_team__name: 'Elbrit Delhi',
                        valid_from: null,
                        valid_to: null,
                        cn_till: null
                    },
                    {
                        elbrit_sales_team__name: 'Aura & Proxima Madurai',
                        valid_from: null,
                        valid_to: null,
                        cn_till: null
                    }
                ])
            },
            {
                id: 2,
                name: 'Product B',
                price: 89.99,
                category: 'Supplement',
                brand: 'BRAND2',
                // Single nested table
                stock_levels: JSON.stringify([
                    {
                        warehouse: 'Warehouse A',
                        quantity: 100,
                        reserved: 20
                    },
                    {
                        warehouse: 'Warehouse B',
                        quantity: 50,
                        reserved: 10
                    }
                ])
            },
            {
                id: 3,
                name: 'Product C',
                price: 199.99,
                category: 'Medicine',
                brand: 'BRAND3'
                // No nested tables
            }
        ];

        // Pre-process data to extract nested tables
        const processedData = mockData.map(row => {
            const nestedTables = extractNestedTablesFromRow(row);
            if (nestedTables.length > 0) {
                return {
                    ...row,
                    __nestedTables__: nestedTables
                };
            }
            return row;
        });

        setProducts(processedData);
    }, []);

    const onRowExpand = (event) => {
        toastRef.current?.show({
            severity: 'info',
            summary: 'Row Expanded',
            detail: event.data.name,
            life: 2000
        });
    };

    const onRowCollapse = (event) => {
        toastRef.current?.show({
            severity: 'success',
            summary: 'Row Collapsed',
            detail: event.data.name,
            life: 2000
        });
    };

    const expandAll = () => {
        const _expandedRows = {};
        products.forEach((p) => {
            if (p.__nestedTables__ && p.__nestedTables__.length > 0) {
                _expandedRows[`${p.id}`] = true;
            }
        });
        setExpandedRows(_expandedRows);
    };

    const collapseAll = () => {
        setExpandedRows(null);
    };

    const formatCurrency = (value) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(value);
    };

    const priceBodyTemplate = (rowData) => {
        return formatCurrency(rowData.price);
    };

    // Check if row has nested tables to allow expansion
    const allowExpansion = (rowData) => {
        return rowData.__nestedTables__ && rowData.__nestedTables__.length > 0;
    };

    // Get columns for a nested table based on its data
    const getNestedTableColumns = (tableData) => {
        if (!tableData || tableData.length === 0) return [];
        
        // Get all unique keys from all objects
        const allKeys = new Set();
        tableData.forEach(item => {
            if (item && typeof item === 'object') {
                Object.keys(item).forEach(key => allKeys.add(key));
            }
        });
        
        return Array.from(allKeys);
    };

    // Detect column type for formatting
    const getColumnType = (data, columnKey) => {
        const sampleValues = data
            .map(row => getDataValue(row, columnKey))
            .filter(val => !isNil(val))
            .slice(0, 10);
        
        if (sampleValues.length === 0) return 'text';
        
        // Check if all are numbers
        if (sampleValues.every(val => isNumber(val) || (isString(val) && !isNaN(Number(val))))) {
            return 'numeric';
        }
        
        // Check if all are dates
        if (sampleValues.every(val => {
            if (isString(val)) {
                const date = new Date(val);
                return !isNaN(date.getTime());
            }
            return false;
        })) {
            return 'date';
        }
        
        return 'text';
    };

    // Format cell value based on type
    const formatCellValue = (value, type) => {
        if (isNil(value)) return '-';
        
        if (type === 'numeric') {
            const num = isNumber(value) ? value : Number(value);
            if (!isNaN(num)) {
                return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            }
        }
        
        if (type === 'date' && isString(value)) {
            const date = new Date(value);
            if (!isNaN(date.getTime())) {
                return date.toLocaleDateString('en-US');
            }
        }
        
        return String(value);
    };

    // Row expansion template - renders multiple nested tables
    const rowExpansionTemplate = (rowData) => {
        if (!rowData.__nestedTables__ || rowData.__nestedTables__.length === 0) {
            return null;
        }

        return (
            <div className="p-4 bg-gray-50 space-y-4">
                {rowData.__nestedTables__.map((nestedTable, tableIndex) => {
                    const { fieldName, data, title } = nestedTable;
                    
                    if (!data || data.length === 0) {
                        return (
                            <div key={tableIndex} className="border border-gray-200 rounded-lg p-3">
                                <div className="text-sm font-semibold text-gray-700 mb-2">
                                    {title} (No data)
                                </div>
                            </div>
                        );
                    }

                    const columns = getNestedTableColumns(data);

                    return (
                        <div key={tableIndex} className="border border-gray-200 rounded-lg overflow-hidden bg-white">
                            <div className="text-sm font-semibold text-gray-700 mb-2 p-2 bg-gray-100 border-b">
                                {title} ({data.length} {data.length === 1 ? 'row' : 'rows'})
                            </div>
                            <DataTable
                                value={data}
                                showGridlines
                                stripedRows
                                className="p-datatable-sm"
                                style={{ minWidth: '100%' }}
                                sortMode="multiple"
                                removableSort
                            >
                                {columns.map((col) => {
                                    const colType = getColumnType(data, col);
                                    const isNumeric = colType === 'numeric';
                                    
                                    return (
                                        <Column
                                            key={col}
                                            field={col}
                                            header={startCase(col.replace(/_/g, ' '))}
                                            sortable
                                            align={isNumeric ? 'right' : 'left'}
                                            body={(rowData) => formatCellValue(getDataValue(rowData, col), colType)}
                                            style={{
                                                minWidth: isNumeric ? '120px' : '150px'
                                            }}
                                        />
                                    );
                                })}
                            </DataTable>
                        </div>
                    );
                })}
            </div>
        );
    };

    const header = (
        <div className="flex flex-wrap justify-content-end gap-2">
            <Button
                icon="pi pi-plus"
                label="Expand All"
                onClick={expandAll}
                text
            />
            <Button
                icon="pi pi-minus"
                label="Collapse All"
                onClick={collapseAll}
                text
            />
        </div>
    );

    return (
        <div className="card p-4">
            <Toast ref={toastRef} />
            <h2 className="text-2xl font-bold mb-4">Nested Tables Demo - JSON String Arrays</h2>
            <p className="text-gray-600 mb-4">
                This demo shows how JSON string arrays (matching pattern <code className="bg-gray-100 px-1">{'[{'}</code>) 
                are automatically parsed and displayed as nested tables when a row is expanded.
            </p>
            <DataTable
                value={products}
                expandedRows={expandedRows}
                onRowToggle={(e) => setExpandedRows(e.data)}
                onRowExpand={onRowExpand}
                onRowCollapse={onRowCollapse}
                rowExpansionTemplate={rowExpansionTemplate}
                dataKey="id"
                header={header}
                tableStyle={{ minWidth: '60rem' }}
                showGridlines
                stripedRows
            >
                <Column expander={allowExpansion} style={{ width: '5rem' }} />
                <Column field="name" header="Name" sortable />
                <Column field="price" header="Price" sortable body={priceBodyTemplate} />
                <Column field="category" header="Category" sortable />
                <Column field="brand__name" header="Brand" sortable />
            </DataTable>
        </div>
    );
}
