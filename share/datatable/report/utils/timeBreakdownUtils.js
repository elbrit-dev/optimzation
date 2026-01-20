import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import quarterOfYear from 'dayjs/plugin/quarterOfYear';

dayjs.extend(isoWeek);
dayjs.extend(quarterOfYear);

/**
 * Get time period key based on breakdown type
 */
export function getTimePeriodKey(date, breakdownType) {
  const d = dayjs(date);
  
  switch (breakdownType) {
    case 'month':
      return d.format('YYYY-MM');
    case 'week':
      // Use ISO week format: YYYY-Www (e.g., 2026-W01)
      // dayjs format 'YYYY-[W]WW' doesn't work correctly, so use isoWeek methods directly
      const year = d.isoWeekYear();
      const week = d.isoWeek();
      return `${year}-W${String(week).padStart(2, '0')}`;
    case 'day':
      return d.format('YYYY-MM-DD');
    case 'quarter':
      return `${d.year()}-Q${d.quarter()}`;
    case 'annual':
      return d.format('YYYY');
    default:
      return d.format('YYYY-MM');
  }
}

/**
 * Get display label for time period
 */
export function getTimePeriodLabel(periodKey, breakdownType) {
  switch (breakdownType) {
    case 'month':
      return dayjs(periodKey + '-01').format('MMM');
    case 'week':
      // periodKey format is YYYY-W01, YYYY-W02, etc.
      // Extract the week number and format as "Week 01", "Week 02", etc.
      let weekMatch = periodKey.match(/W(\d+)$/);
      if (!weekMatch) {
        weekMatch = periodKey.match(/W(\d+)/);
      }
      if (weekMatch && weekMatch[1]) {
        return `Week ${weekMatch[1]}`;
      }
      // Fallback - try to parse as ISO week format YYYY-Www
      try {
        const isoWeekMatch = periodKey.match(/(\d{4})-W(\d{1,2})/);
        if (isoWeekMatch) {
          const weekNum = parseInt(isoWeekMatch[2], 10);
          return `Week ${String(weekNum).padStart(2, '0')}`;
        }
      } catch (e) {
        // Ignore
      }
      return periodKey.replace(/^.*?-W/, 'Week ');
    case 'day':
      return dayjs(periodKey).format('MMM DD');
    case 'quarter':
      return periodKey.replace('YYYY-', '');
    case 'annual':
      return periodKey;
    default:
      return periodKey;
  }
}

/**
 * Get all time periods in a range
 */
export function getTimePeriods(startDate, endDate, breakdownType) {
  const periods = [];
  let current = dayjs(startDate);
  const end = dayjs(endDate);
  
  while (current.isBefore(end) || current.isSame(end, breakdownType === 'day' ? 'day' : breakdownType === 'month' ? 'month' : breakdownType === 'quarter' ? 'quarter' : 'year')) {
    const periodKey = getTimePeriodKey(current, breakdownType);
    if (!periods.includes(periodKey)) {
      periods.push(periodKey);
    }
    
    // Increment based on breakdown type
    switch (breakdownType) {
      case 'month':
        current = current.add(1, 'month');
        break;
      case 'week':
        current = current.add(1, 'week');
        break;
      case 'day':
        current = current.add(1, 'day');
        break;
      case 'quarter':
        current = current.add(1, 'quarter');
        break;
      case 'annual':
        current = current.add(1, 'year');
        break;
      default:
        current = current.add(1, 'month');
    }
  }
  
  return periods.sort();
}

/**
 * Group data by time period
 */
export function groupDataByTimePeriod(data, dateField, breakdownType, metrics = ['sales', 'profits', 'count']) {
  const grouped = {};
  
  data.forEach(item => {
    const dateValue = item[dateField];
    if (!dateValue) return;
    
    const periodKey = getTimePeriodKey(dateValue, breakdownType);
    
    if (!grouped[periodKey]) {
      grouped[periodKey] = {
        period: periodKey,
        data: []
      };
      
      // Initialize metrics
      metrics.forEach(metric => {
        grouped[periodKey][metric] = 0;
      });
    }
    
    grouped[periodKey].data.push(item);
    
    // Aggregate metrics
    metrics.forEach(metric => {
      if (item[metric] !== undefined && item[metric] !== null) {
        if (typeof item[metric] === 'number') {
          grouped[periodKey][metric] += item[metric];
        }
      }
    });
  });
  
  return grouped;
}

/**
 * Transform grouped data into table format
 */
export function transformToTableData(groupedData, productField, breakdownType, includeDetails = false) {
  const products = {};
  
  Object.values(groupedData).forEach(periodData => {
    periodData.data.forEach(item => {
      const product = item[productField] || 'Unknown';
      
      if (!products[product]) {
        products[product] = {
          product,
          periods: {},
          details: [] // Store detailed records for nested table
        };
      }
      
      const periodKey = periodData.period;
      if (!products[product].periods[periodKey]) {
        products[product].periods[periodKey] = {
          sales: 0,
          profits: 0,
          count: 0
        };
      }
      
      if (item.sales !== undefined) products[product].periods[periodKey].sales += item.sales || 0;
      if (item.profits !== undefined) products[product].periods[periodKey].profits += item.profits || 0;
      if (item.count !== undefined) products[product].periods[periodKey].count += item.count || 0;
      
      // Store detailed record for nested table
      if (includeDetails) {
        products[product].details.push({
          ...item,
          period: periodKey,
          periodLabel: getTimePeriodLabel(periodKey, breakdownType)
        });
      }
    });
  });
  
  // Get all unique periods
  const allPeriods = Object.keys(groupedData).sort();
  
  // Transform to flat structure
  return Object.values(products).map((product, index) => {
    const row = { 
      id: index + 1, // Add ID for row expansion
      product: product.product 
    };
    
    allPeriods.forEach(period => {
      const periodData = product.periods[period] || { sales: 0, profits: 0, count: 0 };
      row[`${period}_sales`] = periodData.sales;
      row[`${period}_profits`] = periodData.profits;
      row[`${period}_count`] = periodData.count;
    });
    
    // Include details for nested table
    if (includeDetails) {
      row.details = product.details;
    }
    
    return row;
  });
}

/**
 * Generate mock time-series data with secondary dimension (category/region)
 */
export function generateMockTimeSeriesData(productCount = 10, daysBack = 90) {
  const products = [
    'Bamboo Watch', 'Black Watch', 'Blue Band', 'Blue T-Shirt', 'Brown Purse',
    'Chakra Bracelet', 'Galaxy Earrings', 'Game Controller', 'Gaming Set', 'Gold Phone Case',
    'Green T-Shirt', 'Grey T-Shirt', 'Headphones', 'Laptop', 'Mobile Phone'
  ];
  
  // Secondary dimension (e.g., category, region, channel)
  const categories = ['X', 'Y', 'Z'];
  
  const data = [];
  const startDate = dayjs().subtract(daysBack, 'day');
  
  for (let i = 0; i < productCount; i++) {
    const product = products[i % products.length];
    
    // Generate data for each day
    for (let day = 0; day < daysBack; day++) {
      const date = startDate.add(day, 'day');
      
      // Assign random category
      const category = categories[Math.floor(Math.random() * categories.length)];
      
      // Random sales between 10-100
      const sales = Math.floor(Math.random() * 90) + 10;
      // Random profits between 1000-10000
      const profits = Math.floor(Math.random() * 9000) + 1000;
      // Random count between 1-50
      const count = Math.floor(Math.random() * 49) + 1;
      
      data.push({
        product,
        category, // Secondary dimension for nested grouping
        date: date.format('YYYY-MM-DD'),
        sales,
        profits,
        count
      });
    }
  }
  
  return data;
}

/**
 * Transform grouped data into nested table format (grouped by secondary dimension)
 */
export function transformToNestedTableData(groupedData, productField, categoryField, breakdownType, allPeriods) {
  const nestedData = [];
  
  Object.values(groupedData).forEach(periodData => {
    periodData.data.forEach(item => {
      const product = item[productField] || 'Unknown';
      const category = item[categoryField] || 'Unknown';
      const periodKey = periodData.period;
      
      // Find or create product entry
      let productEntry = nestedData.find(p => p.product === product);
      if (!productEntry) {
        productEntry = {
          product,
          categories: {}
        };
        nestedData.push(productEntry);
      }
      
      // Find or create category entry for this product
      if (!productEntry.categories[category]) {
        productEntry.categories[category] = {
          category,
          periods: {}
        };
      }
      
      const categoryEntry = productEntry.categories[category];
      
      // Initialize period if not exists
      if (!categoryEntry.periods[periodKey]) {
        categoryEntry.periods[periodKey] = {
          sales: 0,
          profits: 0,
          count: 0
        };
      }
      
      // Aggregate metrics
      if (item.sales !== undefined) categoryEntry.periods[periodKey].sales += item.sales || 0;
      if (item.profits !== undefined) categoryEntry.periods[periodKey].profits += item.profits || 0;
      if (item.count !== undefined) categoryEntry.periods[periodKey].count += item.count || 0;
    });
  });
  
  // Transform to flat structure for nested table
  return nestedData.map((productEntry, productIndex) => {
    const categoryRows = Object.values(productEntry.categories).map((categoryEntry, categoryIndex) => {
      const row = {
        id: `${productIndex + 1}-${categoryIndex + 1}`,
        product: productEntry.product,
        category: categoryEntry.category,
        isNestedRow: true
      };
      
      // Add period columns
      allPeriods.forEach(period => {
        const periodData = categoryEntry.periods[period] || { sales: 0, profits: 0, count: 0 };
        row[`${period}_sales`] = periodData.sales;
        row[`${period}_profits`] = periodData.profits;
        row[`${period}_count`] = periodData.count;
      });
      
      return row;
    });
    
    return categoryRows;
  }).flat();
}
