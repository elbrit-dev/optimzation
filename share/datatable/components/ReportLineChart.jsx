'use client';

import React, { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import { isEmpty, isNil, isNumber, sumBy } from 'lodash';
import { getTimePeriodLabelShort } from '../utils/timeBreakdownUtils';
import { getDataValue } from '../utils/dataAccessUtils';

/**
 * Converts HSV to hex color
 */
function hsvToHex(h, s, v) {
  s /= 100;
  v /= 100;

  const c = v * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = v - c;

  let r = 0, g = 0, b = 0;

  if (h >= 0 && h < 60) {
    r = c; g = x; b = 0;
  } else if (h >= 60 && h < 120) {
    r = x; g = c; b = 0;
  } else if (h >= 120 && h < 180) {
    r = 0; g = c; b = x;
  } else if (h >= 180 && h < 240) {
    r = 0; g = x; b = c;
  } else if (h >= 240 && h < 300) {
    r = x; g = 0; b = c;
  } else if (h >= 300 && h < 360) {
    r = c; g = 0; b = x;
  }

  r = Math.round((r + m) * 255);
  g = Math.round((g + m) * 255);
  b = Math.round((b + m) * 255);

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * Report Line Chart Component
 * Displays numeric metrics over time periods in report mode
 */
export default function ReportLineChart({
  reportData,
  chartColumns = [],
  columnHues = {},
  defaultSaturation = 81.11,
  defaultValue = 85.79,
  height = 400,
  formatHeaderName = (name) => name,
  breakdownType
}) {
  // Transform report data to chart format
  const chartData = useMemo(() => {
    if (!reportData || !reportData.tableData || isEmpty(reportData.tableData) ||
      !reportData.timePeriods || isEmpty(reportData.timePeriods) ||
      isEmpty(chartColumns)) {
      return [];
    }

    const { tableData, timePeriods } = reportData;

    // First, find which periods actually have data
    const periodsWithData = new Set();
    tableData.forEach((row) => {
      chartColumns.forEach((metric) => {
        timePeriods.forEach((period) => {
          const columnName = `${period}_${metric}`;
          const value = getDataValue(row, columnName);
          if (!isNil(value) && isNumber(value)) {
            periodsWithData.add(period);
          }
        });
      });
    });

    // Only use periods that have data
    const sortedPeriods = Array.from(periodsWithData).sort();

    // Create data array: one object per time period (only periods with data)
    const data = sortedPeriods.map((period) => {
      const periodData = { period };

      // For each metric, extract value from tableData
      chartColumns.forEach((metric) => {
        const columnName = `${period}_${metric}`;

        // Sum values across all rows (in case of grouping by outerGroupField)
        let totalValue = null;
        let hasValue = false;

        tableData.forEach((row) => {
          const value = getDataValue(row, columnName);
          if (!isNil(value) && isNumber(value)) {
            if (totalValue === null) {
              totalValue = value;
            } else {
              totalValue += value;
            }
            hasValue = true;
          }
        });

        // Use null for missing data (creates gaps in line), 0 for actual zero values
        periodData[metric] = hasValue ? totalValue : null;
      });

      return periodData;
    });

    return data;
  }, [reportData, chartColumns]);

  // Generate colors for each metric
  const metricColors = useMemo(() => {
    const colors = {};
    // Use a better hue distribution starting from red (0) and going through the spectrum
    const predefinedHues = [0, 30, 60, 120, 180, 210, 240, 270, 300, 330];

    chartColumns.forEach((metric, index) => {
      let hue;

      if (columnHues[metric] !== undefined) {
        // Use provided hue
        hue = columnHues[metric];
      } else {
        // Distribute hues evenly or use predefined palette
        if (chartColumns.length <= predefinedHues.length) {
          hue = predefinedHues[index % predefinedHues.length];
        } else {
          // Evenly distribute across 360 degrees, starting from 0
          hue = (index * 360) / chartColumns.length;
        }
      }

      // Convert HSV to hex for Recharts
      colors[metric] = hsvToHex(hue, defaultSaturation, defaultValue);
    });

    return colors;
  }, [chartColumns, columnHues, defaultSaturation, defaultValue]);

  // Format X-axis labels
  const formatXAxisLabel = (period) => {
    if (!period || !breakdownType) return period;
    return getTimePeriodLabelShort(period, breakdownType);
  };

  // Custom tooltip formatter
  const customTooltip = ({ active, payload, label }) => {
    if (!active || !payload || payload.length === 0) {
      return null;
    }

    return (
      <div className="bg-white border border-gray-300 rounded-lg shadow-lg p-3">
        <p className="font-semibold mb-2">{formatXAxisLabel(label)}</p>
        {payload.map((entry, index) => (
          <p key={index} style={{ color: entry.color }} className="text-sm">
            {`${formatHeaderName(entry.dataKey)}: ${entry.value !== null && entry.value !== undefined
              ? typeof entry.value === 'number'
                ? entry.value.toLocaleString()
                : entry.value
              : 'N/A'}`}
          </p>
        ))}
      </div>
    );
  };

  // Don't render if no data
  if (isEmpty(chartData) || isEmpty(chartColumns)) {
    return null;
  }

  return (
    <div className="w-full" style={{ height: `${height}px` }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{ top: 30, right: 30, left: 30, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
          <XAxis
            dataKey="period"
            tickFormatter={formatXAxisLabel}
            angle={-45}
            tickMargin={20}
            textAnchor="end"
            height={80}
            stroke="#666"
            fontSize={12}
          />
          <YAxis
            stroke="#666"
            fontSize={12}
            tickFormatter={(value) => {
              if (value >= 1000000) {
                return `${(value / 1000000).toFixed(1)}M`;
              } else if (value >= 1000) {
                return `${(value / 1000).toFixed(1)}K`;
              }
              return value.toLocaleString();
            }}
          />
          <Tooltip
            wrapperStyle={{ zIndex: 1000 }}
            content={customTooltip} />
          <Legend
            wrapperStyle={{
              position: 'absolute',
              bottom: 0,
              lineHeight: '24px'
            }}
            formatter={(value) => formatHeaderName(value)}
          />
          {chartColumns.map((metric) => (
            <Line
              key={metric}
              type="monotone"
              dataKey={metric}
              stroke={metricColors[metric]}
              strokeWidth={2}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
              connectNulls={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
