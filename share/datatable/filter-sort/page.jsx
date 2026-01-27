'use client';

import { useState, useEffect } from 'react';
import FilterSortSidebar from './components/FilterSortSidebar';
import { Button } from 'primereact/button';
import { Badge } from 'primereact/badge';
import { startCase } from 'lodash';

export default function FilterSortPage() {
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [hasActiveFilters, setHasActiveFilters] = useState(false);
  const [currentSortConfig, setCurrentSortConfig] = useState(null);
  const [appliedFilterValues, setAppliedFilterValues] = useState({});

  // Mock data structure - searchFields contains field paths, not values
  // The structure is: { topLevelKey: [nestedPath1, nestedPath2, ...] }
  // For flat data, nestedPath can be empty string or the field name itself
  const mockSearchFields = {
    'data': ['busType', 'boardingPoint', 'droppingPoint', 'operator'],
    'amenities': ['wifi', 'charging'],
  };

  const mockSortFields = {
    'data': ['price', 'departureTime', 'arrivalTime'],
  };

  // Mock table data to extract unique values
  // This matches the searchFields structure
  const mockTableData = [
    { 
      data: { 
        busType: 'Single Window', 
        boardingPoint: 'City A', 
        droppingPoint: 'City B',
        operator: 'Operator 1',
        price: 500,
        departureTime: '08:00',
        arrivalTime: '12:00'
      },
      amenities: { wifi: 'Yes', charging: 'No' }
    },
    { 
      data: { 
        busType: 'Sleeper/Seater', 
        boardingPoint: 'City B', 
        droppingPoint: 'City C',
        operator: 'Operator 2',
        price: 600,
        departureTime: '09:00',
        arrivalTime: '13:00'
      },
      amenities: { wifi: 'Yes', charging: 'Yes' }
    },
    { 
      data: { 
        busType: 'Single Window', 
        boardingPoint: 'City A', 
        droppingPoint: 'City D',
        operator: 'Operator 1',
        price: 550,
        departureTime: '10:00',
        arrivalTime: '14:00'
      },
      amenities: { wifi: 'No', charging: 'Yes' }
    },
    { 
      data: { 
        busType: 'Sleeper/Seater', 
        boardingPoint: 'City C', 
        droppingPoint: 'City B',
        operator: 'Operator 3',
        price: 700,
        departureTime: '11:00',
        arrivalTime: '15:00'
      },
      amenities: { wifi: 'Yes', charging: 'Yes' }
    },
  ];

  const handleApply = (sortConfig, filterValues) => {
    console.log('Applied:', { sortConfig, filterValues });
    setCurrentSortConfig(sortConfig);
    setAppliedFilterValues(filterValues || {});
    // Check if any filters or sort are active
    const hasSort = sortConfig && sortConfig.field;
    const hasFilters = Object.values(filterValues || {}).some(vals => Array.isArray(vals) && vals.length > 0);
    setHasActiveFilters(hasSort || hasFilters);
  };

  const handleClear = () => {
    setCurrentSortConfig(null);
    setAppliedFilterValues({});
    setHasActiveFilters(false);
  };

  const mockColumnTypes = {
    price: 'number',
    departureTime: 'date',
    arrivalTime: 'date',
    busType: 'string',
    operator: 'string',
  };

  // Sync hasActiveFilters with current state
  useEffect(() => {
    const hasSort = currentSortConfig && currentSortConfig.field;
    const hasFilters = Object.values(appliedFilterValues).some(vals => Array.isArray(vals) && vals.length > 0);
    setHasActiveFilters(hasSort || hasFilters);
  }, [currentSortConfig, appliedFilterValues]);

  // Helper to get display name for sort
  const getSortDisplayName = () => {
    if (!currentSortConfig || !currentSortConfig.field) return '';
    const fieldName = currentSortConfig.field.split('.').pop();
    const displayName = startCase(fieldName);
    const direction = currentSortConfig.direction === 'asc' ? 'Low to High' : 'High to Low';
    
    // Determine field type
    const fieldType = mockColumnTypes[fieldName] || 'string';
    if (fieldType === 'date') {
      return `${displayName} - ${currentSortConfig.direction === 'asc' ? 'Oldest to Latest' : 'Latest to Oldest'}`;
    } else if (fieldType === 'number') {
      return `${displayName} - ${direction}`;
    } else {
      return `${displayName} - ${currentSortConfig.direction === 'asc' ? 'A to Z' : 'Z to A'}`;
    }
  };

  // Helper to get display name for filter field
  const getFilterFieldDisplayName = (fieldKey) => {
    // Find the field in searchFields to get its proper display name
    for (const topLevelKey of Object.keys(mockSearchFields)) {
      const nestedPaths = mockSearchFields[topLevelKey];
      if (Array.isArray(nestedPaths)) {
        for (const nestedPath of nestedPaths) {
          const key = nestedPath || topLevelKey;
          if (key === fieldKey) {
            return startCase(nestedPath || topLevelKey);
          }
        }
      }
    }
    return startCase(fieldKey);
  };

  // Calculate active filter count for badge
  const getActiveFilterCount = () => {
    let count = 0;
    // Count sort (1 if active)
    if (currentSortConfig && currentSortConfig.field) {
      count += 1;
    }
    // Count all filter values
    Object.values(appliedFilterValues).forEach(vals => {
      if (Array.isArray(vals) && vals.length > 0) {
        count += vals.length;
      }
    });
    return count;
  };

  const activeFilterCount = getActiveFilterCount();

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">Filter and Sort Demo</h1>
        
        <div className="mb-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              icon="pi pi-sliders-h"
              label="Filter and Sort"
              onClick={() => setSidebarVisible(true)}
              className="p-button-outlined"
              severity="secondary"
              style={{ height: '2rem' }}
            >
              {activeFilterCount > 0 && <Badge value={activeFilterCount}></Badge>}
            </Button>

            {/* Sort Button */}
            {currentSortConfig && currentSortConfig.field && (
              <button
                type="button"
                onClick={() => {
                  setCurrentSortConfig(null);
                }}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded-md hover:opacity-80 transition-opacity border"
                style={{ 
                  height: '2rem',
                  backgroundColor: '#db2d27',
                  color: 'white',
                  borderColor: '#db2d27'
                }}
                title="Remove sort"
              >
                <i className="pi pi-sort text-xs"></i>
                <span>{getSortDisplayName()}</span>
                <i className="pi pi-times text-xs"></i>
              </button>
            )}

            {/* Filter Value Buttons */}
            {Object.entries(appliedFilterValues).map(([fieldKey, values]) => {
              if (!Array.isArray(values) || values.length === 0) return null;
              const fieldDisplayName = getFilterFieldDisplayName(fieldKey);

              return values.map((value, idx) => (
                <button
                  key={`${fieldKey}-${value}-${idx}`}
                  type="button"
                  onClick={() => {
                    setAppliedFilterValues(prev => {
                      const newValues = { ...prev };
                      if (newValues[fieldKey]) {
                        newValues[fieldKey] = newValues[fieldKey].filter(v => v !== value);
                        if (newValues[fieldKey].length === 0) {
                          delete newValues[fieldKey];
                        }
                      }
                      return newValues;
                    });
                  }}
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded-md hover:opacity-80 transition-opacity border"
                  style={{ 
                    height: '2rem',
                    backgroundColor: '#db2d27',
                    color: 'white',
                    borderColor: '#db2d27'
                  }}
                  title="Remove filter"
                >
                  <i className="pi pi-filter text-xs"></i>
                  <span>{fieldDisplayName}: {value}</span>
                  <i className="pi pi-times text-xs"></i>
                </button>
              ));
            })}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-gray-600">
            This is a demo page for the Filter and Sort sidebar component.
            Click the button above to open the sidebar.
          </p>
        </div>

        <FilterSortSidebar
          visible={sidebarVisible}
          onHide={() => setSidebarVisible(false)}
          searchFields={mockSearchFields}
          sortFields={mockSortFields}
          tableData={mockTableData}
          columnTypes={mockColumnTypes}
          currentSortConfig={currentSortConfig}
          currentFilterValues={appliedFilterValues}
          onApply={handleApply}
          onClear={handleClear}
        />
      </div>
    </div>
  );
}
