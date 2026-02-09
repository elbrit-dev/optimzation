/**
 * Default configuration for DataTable
 * This object contains all default settings for the datatable page
 */
export const defaultDataTableConfig = {
    // Feature flags
    useOrchestrationLayer: true,

    // Table features
    enableSort: true,
    enableFilter: true,
    enableSummation: true,
    enableCellEdit: false,
    enableDivideBy1Lakh: false,

    // Pagination
    rowsPerPageOptions: [5, 10, 25, 50, 100, 200],
    defaultRows: 10,
    tableHeight: "90dvh",

    // Column configuration
    textFilterColumns: [],
    // allowedColumns: ["sales_team", "hq", "customer_name", "item_name", "target", "posting_date"],
    allowedColumns: [],
    nonEditableColumns: [],
    percentageColumns: [],
    derivedColumns: [
        {
            columnName: "derived",
            compute: (row) => 12345,
            columnType: "number",
            position: 2, // 3rd column (0-based)
            scope: { main: true, report: true, nested: false },
        },
        {
            columnName: "twice of sales_qty",
            compute: (row) => 2 * row.sales_qty,
            columnType: "number",
            position: 2, // 3rd column (0-based)
            scope: { main: false, report: false, nested: true },
        },
    ],

    // Styling
    redFields: [],
    greenFields: [],

    // Grouping
    // groupFields: ["sales_team", "hq", "customer_name"],
    // groupFields: ["sales_team"],
    groupFields: [],

    // Column types override
    columnTypesOverride: {},

    // Drawer tabs
    drawerTabs: [
        // {
        //     name: "Custom Tab",
        //     outerGroup: "customer_name",
        //     innerGroup: "item_name",
        // },
    ],

    // Report settings
    enableReport: true,
    breakdownType: "month",
    dateColumn: "posting_date",
    columnGroupBy: "values",

    // Auth Control
    isAdminMode: false,
    salesTeamColumn: "sales_team",
    salesTeamValues: [],
    hqColumn: "hq",
    hqValues: [],

    // Data source
    dataSource: "WriteQuery",
    selectedQueryKey: "secondary",
};

/**
 * Merge user config with default config
 * @param {Object} userConfig - User-provided configuration
 * @returns {Object} Merged configuration
 */
export function mergeConfig(userConfig = {}) {
    return {
        ...defaultDataTableConfig,
        ...userConfig,
        // Deep merge for nested objects
        columnTypesOverride: {
            ...defaultDataTableConfig.columnTypesOverride,
            ...(userConfig.columnTypesOverride || {}),
        },
        drawerTabs: userConfig.drawerTabs || defaultDataTableConfig.drawerTabs,
        percentageColumns: userConfig.percentageColumns || defaultDataTableConfig.percentageColumns,
        derivedColumns: userConfig.derivedColumns || defaultDataTableConfig.derivedColumns,
    };
}

/**
 * Create state setters object from config
 * @param {Object} config - Configuration object
 * @param {Object} setters - Object with setter functions
 * @returns {Object} Object with state values extracted from config
 */
export function extractStateFromConfig(config, setters = {}) {
    return {
        // Feature flags
        useOrchestrationLayer: config.useOrchestrationLayer ?? defaultDataTableConfig.useOrchestrationLayer,

        // Table features
        enableSort: config.enableSort ?? defaultDataTableConfig.enableSort,
        enableFilter: config.enableFilter ?? defaultDataTableConfig.enableFilter,
        enableSummation: config.enableSummation ?? defaultDataTableConfig.enableSummation,
        enableCellEdit: config.enableCellEdit ?? defaultDataTableConfig.enableCellEdit,
        enableDivideBy1Lakh: config.enableDivideBy1Lakh ?? defaultDataTableConfig.enableDivideBy1Lakh,

        // Pagination
        rowsPerPageOptions: config.rowsPerPageOptions ?? defaultDataTableConfig.rowsPerPageOptions,
        defaultRows: config.defaultRows ?? defaultDataTableConfig.defaultRows,
        tableHeight: config.tableHeight ?? defaultDataTableConfig.tableHeight,

        // Column configuration
        textFilterColumns: config.textFilterColumns ?? defaultDataTableConfig.textFilterColumns,
        allowedColumns: config.allowedColumns ?? defaultDataTableConfig.allowedColumns,
        nonEditableColumns: config.nonEditableColumns ?? defaultDataTableConfig.nonEditableColumns,
        percentageColumns: config.percentageColumns ?? defaultDataTableConfig.percentageColumns,
        derivedColumns: config.derivedColumns ?? defaultDataTableConfig.derivedColumns,

        // Styling
        redFields: config.redFields ?? defaultDataTableConfig.redFields,
        greenFields: config.greenFields ?? defaultDataTableConfig.greenFields,

        // Grouping
        outerGroupField: config.outerGroupField ?? defaultDataTableConfig.outerGroupField,
        innerGroupField: config.innerGroupField ?? defaultDataTableConfig.innerGroupField,
        // Group fields array for multi-level nesting
        groupFields: config.groupFields ?? defaultDataTableConfig.groupFields ?? [],

        // Column types override
        columnTypesOverride: config.columnTypesOverride ?? defaultDataTableConfig.columnTypesOverride,

        // Drawer tabs
        drawerTabs: config.drawerTabs ?? defaultDataTableConfig.drawerTabs,

        // Report settings
        enableReport: config.enableReport ?? defaultDataTableConfig.enableReport,
        breakdownType: config.breakdownType ?? defaultDataTableConfig.breakdownType,
        dateColumn: config.dateColumn ?? defaultDataTableConfig.dateColumn,
        columnGroupBy: config.columnGroupBy ?? defaultDataTableConfig.columnGroupBy,

        // Auth Control
        isAdminMode: config.isAdminMode ?? defaultDataTableConfig.isAdminMode,
        salesTeamColumn: config.salesTeamColumn ?? defaultDataTableConfig.salesTeamColumn,
        salesTeamValues: config.salesTeamValues ?? defaultDataTableConfig.salesTeamValues,
        hqColumn: config.hqColumn ?? defaultDataTableConfig.hqColumn,
        hqValues: config.hqValues ?? defaultDataTableConfig.hqValues,

        // Data source
        dataSource: config.dataSource ?? defaultDataTableConfig.dataSource,
        selectedQueryKey: config.selectedQueryKey ?? defaultDataTableConfig.selectedQueryKey,
    };
}
