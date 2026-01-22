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
    visibleColumns: [],
    nonEditableColumns: [],
    percentageColumns: [],

    // Styling
    redFields: [],
    greenFields: [],

    // Grouping
    outerGroupField: 'team',
    innerGroupField: 'hq',

    // Column types override
    columnTypesOverride: {},

    // Drawer tabs
    drawerTabs: [],

    // Report settings
    enableReport: true,
    breakdownType: "month",
    dateColumn: 'posting_date',
    columnGroupBy: 'values',

    // Auth Control
    isAdminMode: false,
    salesTeamColumn: 'team',
    salesTeamValues: [],
    hqColumn: 'hq',
    hqValues: [],

    // Data source
    dataSource: "test",
    selectedQueryKey: 'primary',
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
        visibleColumns: config.visibleColumns ?? defaultDataTableConfig.visibleColumns,
        nonEditableColumns: config.nonEditableColumns ?? defaultDataTableConfig.nonEditableColumns,
        percentageColumns: config.percentageColumns ?? defaultDataTableConfig.percentageColumns,

        // Styling
        redFields: config.redFields ?? defaultDataTableConfig.redFields,
        greenFields: config.greenFields ?? defaultDataTableConfig.greenFields,

        // Grouping
        outerGroupField: config.outerGroupField ?? defaultDataTableConfig.outerGroupField,
        innerGroupField: config.innerGroupField ?? defaultDataTableConfig.innerGroupField,

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
