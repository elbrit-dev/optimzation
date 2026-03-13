/**
 * Default configuration for DataTable
 * This object contains all default settings for the datatable page
 */
export const defaultDataTableConfig = {
    allowedColumns: {
        "main": [
            "item",
            "qty",
            "batch_qty",
            "lead_time",
            "standard_moq"
        ],
        "report": [
            "item",
            "qty",
            "batch_qty",
            "lead_time",
            "standard_moq",
            "batch_id",
            "batch stock in days",
            "avg per day qty",
            "max of qty"
        ],
        "group": {
            "warehouse": [
                "warehouse",
                "batch_qty",
                "qty"
            ],
            "batch_id": [
                "batch_id",
                "batch_qty"
            ]
        },
        "reportGroup": {
            "warehouse": [
                "warehouse",
                "batch_qty",
                "qty",
                "standard_moq",
                "lead_time",
                "max of qty",
                "avg per day qty",
                "batch stock in days"
            ],
            "batch_id": [
                "batch_id",
                "batch_qty",
                "max of qty",
                "standard_moq",
                "avg per day qty",
                "lead_time",
                "batch stock in days",
                "qty"
            ]
        }
    },
    derivedColumns: [
        {
            columnName: "max of qty",
            save: false,
            compute: (row, ctx) => {
                if (ctx.isReportRow) {
                    return Math.max(...Object.values(row.qty))
                }
                return 123
            },
            columnType: "number",
            position: 2,
            aggregate: false,
            scope: {
                main: true,
                report: {
                    enabled: true,
                    exemptFromBreakdown: true,
                    getRowAsBreakdown: true
                },
                nested: true
            }
        },
        {
            columnName: "avg per day qty",
            save: false,
            compute: (row, ctx) => {
                if (!ctx.isReportRow || !row.qty)
                    return 0;
                const totalQty = Object.values(row.qty).map(v => Number(v) || 0).reduce((sum, val) => sum + val, 0);
                if (!ctx.monthRange?.start || !ctx.monthRange?.end)
                    return 0;
                const start = new Date(ctx.monthRange.start);
                const end = new Date(ctx.monthRange.end);
                const diffTime = end.getTime() - start.getTime();
                const totalDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
                if (totalDays <= 0)
                    return 0;
                return totalQty / totalDays
            },
            columnType: "number",
            position: 3,
            aggregate: false,
            scope: {
                main: true,
                report: {
                    enabled: true,
                    exemptFromBreakdown: true,
                    getRowAsBreakdown: true
                },
                nested: true
            }
        },
        {
            columnName: "batch stock in days",
            save: false,
            compute: (row, ctx) => {
                if (!ctx.isReportRow)
                    return 0;
                const batchQty = Number(row.batch_qty) || 0;
                if (!batchQty)
                    return 0;
                const totalQty = Object.values(row.qty || {}).map(v => Number(v) || 0).reduce((sum, val) => sum + val, 0);
                if (!ctx.monthRange?.start || !ctx.monthRange?.end)
                    return 0;
                const start = new Date(ctx.monthRange.start);
                const end = new Date(ctx.monthRange.end);
                const totalDays = Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;
                if (totalDays <= 0)
                    return 0;
                const avgPerDay = totalQty / totalDays;
                const cleanedAvg = avgPerDay <= 0 ? 1 : avgPerDay;
                return batchQty / cleanedAvg
            },
            columnType: "number",
            position: 4,
            aggregate: false,
            scope: {
                main: true,
                report: {
                    enabled: true,
                    exemptFromBreakdown: true,
                    getRowAsBreakdown: true
                },
                nested: true
            }
        }
    ],

    groupFields: [
        "item",
        "warehouse",
        "batch_id"
    ],
    "enableSort": true,
    "enableFilter": true,
    "enableGrouping": false,
    drawerTabs: [{
        id: "Itemdata-tab-1",
        name: "Batch",
        outerGroup: "batch_id",
        innerGroup: "item"
    }],

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
    showChart: false,
    breakdownType: "month",
    dateColumn: "posting_date",
    columnGroupBy: "values",
    columnsExemptFromBreakdown: ["batch_qty"],

    // Auth Control
    isAdminMode: true,
    // salesTeamColumn: "sales_team",
    // salesTeamValues: [],
    // hqColumn: "hq",
    // hqValues: [],

    // Data source
    // dataSource: "Primary",
    // selectedQueryKey: "primary",
    dataSource: "PrimaryStock",
    selectedQueryKey: "primary",
    // dataSource: "Issues",
    // selectedQueryKey: "issues",
    // dataSource: "PrimaryStock",
    // selectedQueryKey: "primary",
};
