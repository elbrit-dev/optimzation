'use client';

import { useState, useMemo, useEffect } from 'react';
import ReportLineChart from '../components/ReportLineChart';
import testData from '@/resource/test';
import { defaultDataTableConfig } from '../config/defaultConfig';
import { transformToReportData } from '../utils/reportUtils';
import { startCase } from 'lodash';

export default function ReportChartPage() {
  // State for report mode
  const [dateColumn, setDateColumn] = useState(defaultDataTableConfig.dateColumn || null);
  const [breakdownType, setBreakdownType] = useState(defaultDataTableConfig.breakdownType || 'week');
  const [outerGroupField, setOuterGroupField] = useState(defaultDataTableConfig.outerGroupField || null);
  const [innerGroupField, setInnerGroupField] = useState(defaultDataTableConfig.innerGroupField || null);

  // Auto-detect date column from test data
  const detectedDateColumn = useMemo(() => {
    if (!testData || testData.length === 0) return null;
    
    const firstRow = testData[0];
    if (!firstRow) return null;

    // Look for common date column names
    const dateColumnNames = ['date', 'createdAt', 'created_at', 'timestamp', 'time', 'Date', 'DATE', 'posting_date'];
    for (const colName of dateColumnNames) {
      if (firstRow.hasOwnProperty(colName)) {
        return colName;
      }
    }

    // If no common name found, check all columns for date-like values
    for (const key in firstRow) {
      const value = firstRow[key];
      if (value && (value instanceof Date || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)))) {
        return key;
      }
    }

    return null;
  }, []);

  // Set date column if detected
  useEffect(() => {
    if (detectedDateColumn && !dateColumn) {
      setDateColumn(detectedDateColumn);
    }
  }, [detectedDateColumn, dateColumn]);

  // Detect column types (simple detection)
  const columnTypes = useMemo(() => {
    if (!testData || testData.length === 0) return {};
    
    const firstRow = testData[0];
    if (!firstRow) return {};

    const types = {};
    for (const key in firstRow) {
      const value = firstRow[key];
      if (value === null || value === undefined) {
        types[key] = 'string';
      } else if (typeof value === 'number') {
        types[key] = 'number';
      } else if (value instanceof Date || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value))) {
        types[key] = 'date';
      } else if (typeof value === 'boolean') {
        types[key] = 'boolean';
      } else {
        types[key] = 'string';
      }
    }
    return types;
  }, []);

  // Transform data to report format
  const reportData = useMemo(() => {
    if (!testData || testData.length === 0 || !dateColumn || !outerGroupField) {
      return null;
    }

    return transformToReportData(
      testData,
      outerGroupField,
      innerGroupField,
      dateColumn,
      breakdownType,
      columnTypes
    );
  }, [testData, outerGroupField, innerGroupField, dateColumn, breakdownType, columnTypes]);

  // Format header name function
  const formatHeaderName = (name) => {
    return startCase(name.split('__').join(' ').split('_').join(' '));
  };

  // Get chart columns (all metrics from report data)
  const chartColumns = useMemo(() => {
    if (!reportData || !reportData.metrics || reportData.metrics.length === 0) {
      return [];
    }
    return reportData.metrics;
  }, [reportData]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <main className="flex-1 flex flex-col min-h-0 p-4 md:p-6">
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Report Chart Demo</h1>
          <p className="text-sm text-gray-600">
            This page demonstrates the report line chart using test data.
          </p>
          {!dateColumn && (
            <p className="text-sm text-yellow-600 mt-2">
              ⚠️ No date column detected. Please ensure test data has a date field.
            </p>
          )}
          {!outerGroupField && (
            <p className="text-sm text-yellow-600 mt-2">
              ⚠️ No outer group field set. Using default: {defaultDataTableConfig.outerGroupField}
            </p>
          )}
        </div>

        {/* Chart Section */}
        {reportData && chartColumns.length > 0 ? (
          <div className="w-full bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
            <div className="mb-2">
              <h2 className="text-lg font-semibold text-gray-800">Report Chart</h2>
              <p className="text-xs text-gray-500">
                Line chart showing metrics over time periods ({breakdownType} breakdown)
              </p>
            </div>
            <ReportLineChart
              reportData={reportData}
              chartColumns={chartColumns}
              formatHeaderName={formatHeaderName}
              breakdownType={reportData.breakdownType}
              height={400}
              defaultSaturation={81.11}
              defaultValue={85.79}
            />
          </div>
        ) : (
          <div className="w-full bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
            <div className="text-center py-8">
              <p className="text-gray-500">
                {!dateColumn ? 'Please set a date column to generate the report chart.' :
                 !outerGroupField ? 'Please set an outer group field to generate the report chart.' :
                 'No data available for chart.'}
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
