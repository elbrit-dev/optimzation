'use client';

import React, { useMemo } from 'react';
import { useTableOperations } from '../contexts/TableOperationsContext';
import ReportLineChart from './ReportLineChart';
import { isEmpty } from 'lodash';

/**
 * Wrapper component that gets reportData from context and renders the chart
 */
export default function ReportLineChartWrapper() {
  const {
    enableBreakdown,
    reportData,
    formatHeaderName,
    chartColumns,
    chartHeight
  } = useTableOperations();

  // Use selected chartColumns if provided, otherwise use all available metrics
  const finalChartColumns = useMemo(() => {
    if (!enableBreakdown || !reportData || !reportData.metrics || isEmpty(reportData.metrics)) {
      return [];
    }
    
    // If chartColumns is provided and not empty, use it
    if (chartColumns && chartColumns.length > 0) {
      // Filter to only include metrics that exist in reportData
      return chartColumns.filter(col => reportData.metrics.includes(col));
    }
    
    // Otherwise, use all available metrics from reportData
    return reportData.metrics;
  }, [enableBreakdown, reportData, chartColumns]);

  if (!enableBreakdown || !reportData || finalChartColumns.length === 0) {
    return null;
  }

  return (
    <ReportLineChart
      reportData={reportData}
      chartColumns={finalChartColumns}
      formatHeaderName={formatHeaderName}
      breakdownType={reportData.breakdownType}
      height={chartHeight || 400}
      defaultSaturation={81.11}
      defaultValue={85.79}
    />
  );
}
