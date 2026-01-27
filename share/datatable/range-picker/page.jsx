'use client';

import { useState } from 'react';
import RangePicker from '@/components/RangePicker';
import { Dropdown } from 'primereact/dropdown';
import { Card } from 'primereact/card';

export default function RangePickerDebugPage() {
  const [mode, setMode] = useState('month');
  const [monthRange, setMonthRange] = useState(null);
  const [weekRange, setWeekRange] = useState(null);
  const [dateRange, setDateRange] = useState(null);
  const [quarterRange, setQuarterRange] = useState(null);
  const [yearRange, setYearRange] = useState(null);

  const modeOptions = [
    { label: 'Month', value: 'month' },
    { label: 'Week', value: 'week' },
    { label: 'Date', value: 'date' },
    { label: 'Quarter', value: 'quarter' },
    { label: 'Year', value: 'year' }
  ];

  const getCurrentRange = () => {
    switch (mode) {
      case 'month': return monthRange;
      case 'week': return weekRange;
      case 'date': return dateRange;
      case 'quarter': return quarterRange;
      case 'year': return yearRange;
      default: return null;
    }
  };

  const handleRangeChange = (dates) => {
    switch (mode) {
      case 'month':
        setMonthRange(dates);
        break;
      case 'week':
        setWeekRange(dates);
        break;
      case 'date':
        setDateRange(dates);
        break;
      case 'quarter':
        setQuarterRange(dates);
        break;
      case 'year':
        setYearRange(dates);
        break;
    }
  };

  const getPlaceholder = () => {
    switch (mode) {
      case 'month': return ['Start month', 'End month'];
      case 'week': return ['Start week', 'End week'];
      case 'date': return ['Start date', 'End date'];
      case 'quarter': return ['Start quarter', 'End quarter'];
      case 'year': return ['Start year', 'End year'];
      default: return ['Start', 'End'];
    }
  };

  const currentRange = getCurrentRange();

  return (
    <div className="container mx-auto p-4 md:p-8 max-w-6xl">
      <h1 className="text-2xl md:text-3xl font-bold mb-6">Range Picker Debug Page</h1>
      
      <Card className="mb-6">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Mode
            </label>
            <Dropdown
              value={mode}
              onChange={(e) => setMode(e.value)}
              options={modeOptions}
              optionLabel="label"
              optionValue="value"
              className="w-full md:w-64"
              placeholder="Select mode"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Range Picker ({mode} mode)
            </label>
            <RangePicker
              value={currentRange}
              onChange={handleRangeChange}
              placeholder={getPlaceholder()}
              mode={mode}
              className="w-full md:w-96"
            />
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="text-xl font-semibold mb-4">Debug Information</h2>
        
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">Current Mode</h3>
            <div className="bg-gray-100 p-3 rounded">
              <code className="text-sm">{mode}</code>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">Selected Range</h3>
            <div className="bg-gray-100 p-3 rounded">
              {currentRange && currentRange[0] && currentRange[1] ? (
                <div className="space-y-2">
                  <div>
                    <strong>Start:</strong>{' '}
                    <code className="text-sm">
                      {currentRange[0].toISOString()}
                    </code>
                    <br />
                    <span className="text-sm text-gray-600">
                      {currentRange[0].toLocaleDateString('en-US', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </span>
                  </div>
                  <div>
                    <strong>End:</strong>{' '}
                    <code className="text-sm">
                      {currentRange[1].toISOString()}
                    </code>
                    <br />
                    <span className="text-sm text-gray-600">
                      {currentRange[1].toLocaleDateString('en-US', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </span>
                  </div>
                  <div className="mt-3 pt-3 border-t border-gray-300">
                    <strong>Duration:</strong>{' '}
                    <span className="text-sm">
                      {Math.ceil((currentRange[1] - currentRange[0]) / (1000 * 60 * 60 * 24))} days
                    </span>
                  </div>
                </div>
              ) : (
                <span className="text-sm text-gray-500">No range selected</span>
              )}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">Raw Value (JSON)</h3>
            <div className="bg-gray-100 p-3 rounded">
              <pre className="text-xs overflow-auto">
                {currentRange && currentRange[0] && currentRange[1]
                  ? JSON.stringify(
                      {
                        start: currentRange[0].toISOString(),
                        end: currentRange[1].toISOString()
                      },
                      null,
                      2
                    )
                  : 'null'}
              </pre>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">All Mode States</h3>
            <div className="bg-gray-100 p-3 rounded">
              <div className="space-y-2 text-sm">
                <div>
                  <strong>Month:</strong>{' '}
                  {monthRange && monthRange[0] && monthRange[1]
                    ? `${monthRange[0].toLocaleDateString()} - ${monthRange[1].toLocaleDateString()}`
                    : 'Not set'}
                </div>
                <div>
                  <strong>Week:</strong>{' '}
                  {weekRange && weekRange[0] && weekRange[1]
                    ? `${weekRange[0].toLocaleDateString()} - ${weekRange[1].toLocaleDateString()}`
                    : 'Not set'}
                </div>
                <div>
                  <strong>Date:</strong>{' '}
                  {dateRange && dateRange[0] && dateRange[1]
                    ? `${dateRange[0].toLocaleDateString()} - ${dateRange[1].toLocaleDateString()}`
                    : 'Not set'}
                </div>
                <div>
                  <strong>Quarter:</strong>{' '}
                  {quarterRange && quarterRange[0] && quarterRange[1]
                    ? `${quarterRange[0].toLocaleDateString()} - ${quarterRange[1].toLocaleDateString()}`
                    : 'Not set'}
                </div>
                <div>
                  <strong>Year:</strong>{' '}
                  {yearRange && yearRange[0] && yearRange[1]
                    ? `${yearRange[0].toLocaleDateString()} - ${yearRange[1].toLocaleDateString()}`
                    : 'Not set'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
