import { NextResponse } from 'next/server';

const MOCK_REPORT = {
  message: {
    department_hq: {
      title: 'Department / HQ',
      meta: { row_expansion: true, column_group: false },
      columns: [
        {
          id: 'default',
          label: '',
          children: [
            { field: 'invoice_count',       label: 'Invoice Count',      type: 'Int'      },
            { field: 'customer_count',      label: 'Customer Count',     type: 'Int'      },
            { field: 'qty',                 label: 'Total Qty',          type: 'Float'    },
            { field: 'rate',                label: 'Total Rate',         type: 'Currency' },
            { field: 'price_list_rate',     label: 'Total MRP',          type: 'Currency' },
            { field: 'discount_amount',     label: 'Total Discount Amt', type: 'Currency' },
            { field: 'discount_percentage', label: 'Discount %',         type: 'Float'    },
            { field: 'net_amount',          label: 'Net Amount',         type: 'Currency' },
            { field: 'tax_amount',          label: 'Tax Amount',         type: 'Currency' },
            { field: 'grand_total',         label: 'Grand Total',        type: 'Currency' },
            { field: 'amount',              label: 'Total Amount',       type: 'Currency' },
          ],
        },
      ],
      rows: [
        {
          id: 'dept_1', label: 'Aura & Proxima Karnataka - ELPL',
          values: { default: { invoice_count: 1, customer_count: 1, qty: 120.0, rate: 1302.03, price_list_rate: 1302.03, discount_amount: 0, discount_percentage: 0.0, net_amount: 16909.4, tax_amount: 35773.02, grand_total: 751233.78, amount: 17254.5 } },
          children: [
            { id: 'hq_1_1', label: 'HQ-Bangalore',  values: { default: { invoice_count: 1, customer_count: 1, qty: 120.0, rate: 1302.03, price_list_rate: 1302.03, discount_amount: 0,     discount_percentage: 0.0, net_amount: 16909.4,  tax_amount: 35773.02, grand_total: 751233.78,   amount: 17254.5 } }, children: [] },
          ],
        },
        {
          id: 'dept_2', label: 'Elbrit Bangalore - ELPL',
          values: { default: { invoice_count: 1, customer_count: 1, qty: 250.0, rate: 1589.9, price_list_rate: 1589.9, discount_amount: 0, discount_percentage: 0.0, net_amount: 22600.47, tax_amount: 67571.26, grand_total: 1418997.14, amount: 23061.7 } },
          children: [
            { id: 'hq_2_1', label: 'HQ-Bangalore',  values: { default: { invoice_count: 1, customer_count: 1, qty: 250.0, rate: 1589.9,  price_list_rate: 1589.9,  discount_amount: 0,     discount_percentage: 0.0, net_amount: 22600.47, tax_amount: 67571.26, grand_total: 1418997.14, amount: 23061.7 } }, children: [] },
          ],
        },
        {
          id: 'dept_3', label: 'Elbrit Telangana - ELPL',
          values: { default: { invoice_count: 1, customer_count: 1, qty: 400.0, rate: 1005.48, price_list_rate: 1005.48, discount_amount: 0, discount_percentage: 0.0, net_amount: 33190.27, tax_amount: 18254.72, grand_total: 383347.69, amount: 34573.2 } },
          children: [
            { id: 'hq_3_1', label: 'HQ-Hyderabad',  values: { default: { invoice_count: 1, customer_count: 1, qty: 400.0, rate: 1005.48, price_list_rate: 1005.48, discount_amount: 0,     discount_percentage: 0.0, net_amount: 33190.27, tax_amount: 18254.72, grand_total: 383347.69,  amount: 34573.2 } }, children: [] },
          ],
        },
        {
          id: 'dept_4', label: 'Elbrit Uttar Pradesh - ELPL',
          values: { default: { invoice_count: 1, customer_count: 1, qty: 160.0, rate: 422.28, price_list_rate: 498.91, discount_amount: 76.63, discount_percentage: 15.4, net_amount: 13489.9, tax_amount: 3372.5, grand_total: 70822.0, amount: 13489.9 } },
          children: [
            { id: 'hq_4_1', label: 'HQ-Gorakhpur',  values: { default: { invoice_count: 1, customer_count: 1, qty: 160.0, rate: 422.28,  price_list_rate: 498.91,  discount_amount: 76.63, discount_percentage: 15.4, net_amount: 13489.9,  tax_amount: 3372.5,   grand_total: 70822.0,    amount: 13489.9 } }, children: [] },
          ],
        },
        {
          id: 'dept_5', label: 'Vasco Karnataka - ELPL',
          values: { default: { invoice_count: 1, customer_count: 1, qty: 340.0, rate: 1412.22, price_list_rate: 1412.22, discount_amount: 0, discount_percentage: 0.0, net_amount: 30591.3, tax_amount: 55646.92, grand_total: 1168585.88, amount: 31215.6 } },
          children: [
            { id: 'hq_5_1', label: 'HQ-Bangalore',  values: { default: { invoice_count: 1, customer_count: 1, qty: 340.0, rate: 1412.22, price_list_rate: 1412.22, discount_amount: 0,     discount_percentage: 0.0, net_amount: 30591.3,  tax_amount: 55646.92, grand_total: 1168585.88, amount: 31215.6 } }, children: [] },
          ],
        },
        {
          id: 'dept_6', label: 'Micro Labs Karnataka - ELPL',
          values: { default: { invoice_count: 2, customer_count: 2, qty: 210.0, rate: 875.5, price_list_rate: 875.5, discount_amount: 0, discount_percentage: 0.0, net_amount: 18394.2, tax_amount: 22781.4, grand_total: 478410.0, amount: 18394.2 } },
          children: [
            { id: 'hq_6_1', label: 'HQ-Bangalore',  values: { default: { invoice_count: 1, customer_count: 1, qty: 110.0, rate: 875.5,   price_list_rate: 875.5,   discount_amount: 0,     discount_percentage: 0.0, net_amount: 9632.5,   tax_amount: 11943.0,  grand_total: 250710.0,   amount: 9632.5  } }, children: [] },
            { id: 'hq_6_2', label: 'HQ-Mysore',     values: { default: { invoice_count: 1, customer_count: 1, qty: 100.0, rate: 875.5,   price_list_rate: 875.5,   discount_amount: 0,     discount_percentage: 0.0, net_amount: 8761.7,   tax_amount: 10838.4,  grand_total: 227700.0,   amount: 8761.7  } }, children: [] },
          ],
        },
        {
          id: 'dept_7', label: 'Cipla Maharashtra - ELPL',
          values: { default: { invoice_count: 2, customer_count: 2, qty: 530.0, rate: 2140.0, price_list_rate: 2250.0, discount_amount: 583.0, discount_percentage: 5.0, net_amount: 47804.2, tax_amount: 91258.0, grand_total: 1914418.0, amount: 47804.2 } },
          children: [
            { id: 'hq_7_1', label: 'HQ-Mumbai',     values: { default: { invoice_count: 1, customer_count: 1, qty: 300.0, rate: 2140.0,  price_list_rate: 2250.0,  discount_amount: 330.0, discount_percentage: 5.0, net_amount: 27090.0,  tax_amount: 51732.0,  grand_total: 1085670.0,  amount: 27090.0 } }, children: [] },
            { id: 'hq_7_2', label: 'HQ-Pune',       values: { default: { invoice_count: 1, customer_count: 1, qty: 230.0, rate: 2140.0,  price_list_rate: 2250.0,  discount_amount: 253.0, discount_percentage: 5.0, net_amount: 20714.2,  tax_amount: 39526.0,  grand_total: 828748.0,   amount: 20714.2 } }, children: [] },
          ],
        },
        {
          id: 'dept_8', label: 'Sun Pharma Gujarat - ELPL',
          values: { default: { invoice_count: 1, customer_count: 1, qty: 475.0, rate: 1820.0, price_list_rate: 1820.0, discount_amount: 0, discount_percentage: 0.0, net_amount: 43415.0, tax_amount: 82905.0, grand_total: 1741005.0, amount: 43415.0 } },
          children: [
            { id: 'hq_8_1', label: 'HQ-Ahmedabad',  values: { default: { invoice_count: 1, customer_count: 1, qty: 475.0, rate: 1820.0,  price_list_rate: 1820.0,  discount_amount: 0,     discount_percentage: 0.0, net_amount: 43415.0,  tax_amount: 82905.0,  grand_total: 1741005.0,  amount: 43415.0 } }, children: [] },
          ],
        },
        {
          id: 'dept_9', label: 'Abbott Delhi - ELPL',
          values: { default: { invoice_count: 2, customer_count: 2, qty: 390.0, rate: 3105.0, price_list_rate: 3260.0, discount_amount: 604.5, discount_percentage: 4.75, net_amount: 60901.5, tax_amount: 116220.0, grand_total: 2440620.0, amount: 60901.5 } },
          children: [
            { id: 'hq_9_1', label: 'HQ-Delhi',      values: { default: { invoice_count: 1, customer_count: 1, qty: 220.0, rate: 3105.0,  price_list_rate: 3260.0,  discount_amount: 341.0, discount_percentage: 4.75, net_amount: 34387.5, tax_amount: 65604.0,  grand_total: 1378284.0,  amount: 34387.5 } }, children: [] },
            { id: 'hq_9_2', label: 'HQ-Noida',      values: { default: { invoice_count: 1, customer_count: 1, qty: 170.0, rate: 3105.0,  price_list_rate: 3260.0,  discount_amount: 263.5, discount_percentage: 4.75, net_amount: 26514.0, tax_amount: 50616.0,  grand_total: 1062336.0,  amount: 26514.0 } }, children: [] },
          ],
        },
        {
          id: 'dept_10', label: 'Lupin Rajasthan - ELPL',
          values: { default: { invoice_count: 1, customer_count: 1, qty: 290.0, rate: 980.0, price_list_rate: 980.0, discount_amount: 0, discount_percentage: 0.0, net_amount: 28423.2, tax_amount: 25596.0, grand_total: 537516.0, amount: 28423.2 } },
          children: [
            { id: 'hq_10_1', label: 'HQ-Jaipur',    values: { default: { invoice_count: 1, customer_count: 1, qty: 290.0, rate: 980.0,   price_list_rate: 980.0,   discount_amount: 0,     discount_percentage: 0.0, net_amount: 28423.2,  tax_amount: 25596.0,  grand_total: 537516.0,   amount: 28423.2 } }, children: [] },
          ],
        },
      ],
    },

    customer_item: {
      title: 'Customer / Item',
      meta: { row_expansion: false, column_group: false },
      columns: [
        {
          id: 'default',
          label: '',
          children: [
            { field: 'invoice_count',  label: 'Invoice Count',  type: 'Int'      },
            { field: 'customer_count', label: 'Customer Count', type: 'Int'      },
            { field: 'qty',            label: 'Total Qty',      type: 'Float'    },
            { field: 'amount',         label: 'Total Amount',   type: 'Currency' },
            { field: 'grand_total',    label: 'Grand Total',    type: 'Currency' },
          ],
        },
      ],
      rows: [
        { id: 'ci_1',  label: 'HQ-Bangalore',  values: { default: { invoice_count: 3, customer_count: 3, qty: 710.0, amount: 71531.8,  grand_total: 3338816.80 } }, children: [] },
        { id: 'ci_2',  label: 'HQ-Hyderabad',  values: { default: { invoice_count: 1, customer_count: 1, qty: 400.0, amount: 34573.2,  grand_total:  383347.69 } }, children: [] },
        { id: 'ci_3',  label: 'HQ-Gorakhpur',  values: { default: { invoice_count: 1, customer_count: 1, qty: 160.0, amount: 13489.9,  grand_total:   70822.00 } }, children: [] },
        { id: 'ci_4',  label: 'HQ-Mysore',     values: { default: { invoice_count: 1, customer_count: 1, qty: 100.0, amount:  8761.7,  grand_total:  227700.00 } }, children: [] },
        { id: 'ci_5',  label: 'HQ-Mumbai',     values: { default: { invoice_count: 1, customer_count: 1, qty: 300.0, amount: 27090.0,  grand_total: 1085670.00 } }, children: [] },
        { id: 'ci_6',  label: 'HQ-Pune',       values: { default: { invoice_count: 1, customer_count: 1, qty: 230.0, amount: 20714.2,  grand_total:  828748.00 } }, children: [] },
        { id: 'ci_7',  label: 'HQ-Ahmedabad',  values: { default: { invoice_count: 1, customer_count: 1, qty: 475.0, amount: 43415.0,  grand_total: 1741005.00 } }, children: [] },
        { id: 'ci_8',  label: 'HQ-Delhi',      values: { default: { invoice_count: 1, customer_count: 1, qty: 220.0, amount: 34387.5,  grand_total: 1378284.00 } }, children: [] },
        { id: 'ci_9',  label: 'HQ-Noida',      values: { default: { invoice_count: 1, customer_count: 1, qty: 170.0, amount: 26514.0,  grand_total: 1062336.00 } }, children: [] },
        { id: 'ci_10', label: 'HQ-Jaipur',     values: { default: { invoice_count: 1, customer_count: 1, qty: 290.0, amount: 28423.2,  grand_total:  537516.00 } }, children: [] },
      ],
    },

    // Scenario 2: flat rows + column breakdown (default group carries non-breakdown columns)
    customer_item_breakdown: {
      title: 'Customer / Item',
      meta: { row_expansion: false, column_group: true },
      columns: [
        { id: 'default',    label: '',           children: [{ field: 'invoice_count', label: 'Invoice Count', type: 'Int' }, { field: 'customer_count', label: 'Customer Count', type: 'Int' }] },
        { id: '2026-01',    label: 'Jan 2026',   children: [{ field: 'qty', label: 'Qty', type: 'Float' }, { field: 'amount', label: 'Amount', type: 'Currency' }] },
        { id: '2026-02',    label: 'Feb 2026',   children: [{ field: 'qty', label: 'Qty', type: 'Float' }, { field: 'amount', label: 'Amount', type: 'Currency' }] },
        { id: 'ytd',        label: 'YTD',        children: [{ field: 'qty', label: 'Qty', type: 'Float' }, { field: 'amount', label: 'Amount', type: 'Currency' }] },
        { id: 'tax_amount', label: 'Tax Amount', children: [{ field: '2026-01', label: 'Jan 2026', type: 'Currency' }, { field: '2026-02', label: 'Feb 2026', type: 'Currency' }] },
      ],
      rows: [
        { id: 'ci_1',  label: 'HQ-Bangalore',  values: { default: { invoice_count: 5, customer_count: 5 }, '2026-01': { qty: 320, amount: 34200 }, '2026-02': { qty: 390, amount: 37331 }, ytd: { qty: 710, amount: 71531 }, tax_amount: { '2026-01': 6156, '2026-02': 6720 } }, children: [] },
        { id: 'ci_2',  label: 'HQ-Hyderabad',  values: { default: { invoice_count: 2, customer_count: 2 }, '2026-01': { qty: 180, amount: 18100 }, '2026-02': { qty: 220, amount: 22450 }, ytd: { qty: 400, amount: 40550 }, tax_amount: { '2026-01': 3258, '2026-02': 4041 } }, children: [] },
        { id: 'ci_3',  label: 'HQ-Gorakhpur',  values: { default: { invoice_count: 2, customer_count: 2 }, '2026-01': { qty:  80, amount:  8050 }, '2026-02': { qty:  80, amount:  7440 }, ytd: { qty: 160, amount: 15490 }, tax_amount: { '2026-01': 1449, '2026-02': 1339 } }, children: [] },
        { id: 'ci_4',  label: 'HQ-Mysore',     values: { default: { invoice_count: 2, customer_count: 2 }, '2026-01': { qty:  45, amount:  4200 }, '2026-02': { qty:  55, amount:  4561 }, ytd: { qty: 100, amount:  8761 }, tax_amount: { '2026-01':  756, '2026-02':  821 } }, children: [] },
        { id: 'ci_5',  label: 'HQ-Mumbai',     values: { default: { invoice_count: 2, customer_count: 2 }, '2026-01': { qty: 140, amount: 13050 }, '2026-02': { qty: 160, amount: 16040 }, ytd: { qty: 300, amount: 29090 }, tax_amount: { '2026-01': 2349, '2026-02': 2887 } }, children: [] },
        { id: 'ci_6',  label: 'HQ-Pune',       values: { default: { invoice_count: 2, customer_count: 2 }, '2026-01': { qty: 110, amount:  9874 }, '2026-02': { qty: 120, amount: 10840 }, ytd: { qty: 230, amount: 20714 }, tax_amount: { '2026-01': 1777, '2026-02': 1951 } }, children: [] },
        { id: 'ci_7',  label: 'HQ-Ahmedabad',  values: { default: { invoice_count: 2, customer_count: 2 }, '2026-01': { qty: 230, amount: 21600 }, '2026-02': { qty: 245, amount: 21815 }, ytd: { qty: 475, amount: 43415 }, tax_amount: { '2026-01': 3888, '2026-02': 3927 } }, children: [] },
        { id: 'ci_8',  label: 'HQ-Delhi',      values: { default: { invoice_count: 2, customer_count: 2 }, '2026-01': { qty: 100, amount: 16250 }, '2026-02': { qty: 120, amount: 18137 }, ytd: { qty: 220, amount: 34387 }, tax_amount: { '2026-01': 2925, '2026-02': 3265 } }, children: [] },
        { id: 'ci_9',  label: 'HQ-Noida',      values: { default: { invoice_count: 2, customer_count: 2 }, '2026-01': { qty:  80, amount: 12580 }, '2026-02': { qty:  90, amount: 13934 }, ytd: { qty: 170, amount: 26514 }, tax_amount: { '2026-01': 2264, '2026-02': 2508 } }, children: [] },
        { id: 'ci_10', label: 'HQ-Jaipur',     values: { default: { invoice_count: 2, customer_count: 2 }, '2026-01': { qty: 140, amount: 14010 }, '2026-02': { qty: 150, amount: 14413 }, ytd: { qty: 290, amount: 28423 }, tax_amount: { '2026-01': 2522, '2026-02': 2594 } }, children: [] },
      ],
    },

    brand_item: {
      title: 'Brand / Item',
      meta: { row_expansion: true, column_group: false },
      columns: [
        {
          id: 'default',
          label: '',
          children: [
            { field: 'invoice_count',       label: 'Invoice Count',      type: 'Int'      },
            { field: 'customer_count',      label: 'Customer Count',     type: 'Int'      },
            { field: 'qty',                 label: 'Total Qty',          type: 'Float'    },
            { field: 'net_amount',          label: 'Net Amount',         type: 'Currency' },
            { field: 'tax_amount',          label: 'Tax Amount',         type: 'Currency' },
            { field: 'grand_total',         label: 'Grand Total',        type: 'Currency' },
            { field: 'amount',              label: 'Total Amount',       type: 'Currency' },
          ],
        },
      ],
      rows: [
        {
          id: 'brand_1', label: 'Cipla',
          values: { default: { invoice_count: 4, customer_count: 4, qty: 730, net_amount: 68190, tax_amount: 136788, grand_total: 2872218, amount: 68190 } },
          children: [
            { id: 'bi_1_1', label: 'Azithromycin 500mg', values: { default: { invoice_count: 2, customer_count: 2, qty: 430, net_amount: 39990, tax_amount:  79986, grand_total: 1679706, amount: 39990 } }, children: [] },
            { id: 'bi_1_2', label: 'Paracetamol 650mg',  values: { default: { invoice_count: 2, customer_count: 2, qty: 300, net_amount: 28200, tax_amount:  56802, grand_total: 1192512, amount: 28200 } }, children: [] },
          ],
        },
        {
          id: 'brand_2', label: 'Abbott',
          values: { default: { invoice_count: 4, customer_count: 4, qty: 610, net_amount: 95289, tax_amount: 181836, grand_total: 3818556, amount: 95289 } },
          children: [
            { id: 'bi_2_1', label: 'Thyronorm 100mcg', values: { default: { invoice_count: 2, customer_count: 2, qty: 390, net_amount: 60902, tax_amount: 116220, grand_total: 2440620, amount: 60902 } }, children: [] },
            { id: 'bi_2_2', label: 'Cremaffin Syrup',  values: { default: { invoice_count: 2, customer_count: 2, qty: 220, net_amount: 34387, tax_amount:  65616, grand_total: 1377936, amount: 34387 } }, children: [] },
          ],
        },
        {
          id: 'brand_3', label: 'Sun Pharma',
          values: { default: { invoice_count: 4, customer_count: 4, qty: 765, net_amount: 71838, tax_amount: 125838, grand_total: 2642598, amount: 71838 } },
          children: [
            { id: 'bi_3_1', label: 'Clopilet 75mg', values: { default: { invoice_count: 2, customer_count: 2, qty: 290, net_amount: 28423, tax_amount:  25596, grand_total:  537516, amount: 28423 } }, children: [] },
            { id: 'bi_3_2', label: 'Rosuvas 10mg',  values: { default: { invoice_count: 2, customer_count: 2, qty: 475, net_amount: 43415, tax_amount: 100242, grand_total: 2105082, amount: 43415 } }, children: [] },
          ],
        },
        {
          id: 'brand_4', label: 'Micro Labs',
          values: { default: { invoice_count: 2, customer_count: 2, qty: 310, net_amount: 27155, tax_amount:  45620, grand_total:  958020, amount: 27155 } },
          children: [
            { id: 'bi_4_1', label: 'Telma 40mg',     values: { default: { invoice_count: 1, customer_count: 1, qty: 210, net_amount: 18394, tax_amount:  22781, grand_total:  478410, amount: 18394 } }, children: [] },
            { id: 'bi_4_2', label: 'Dolo 650 Strip', values: { default: { invoice_count: 1, customer_count: 1, qty: 100, net_amount:  8761, tax_amount:  22839, grand_total:  479610, amount:  8761 } }, children: [] },
          ],
        },
        {
          id: 'brand_5', label: 'Lupin',
          values: { default: { invoice_count: 2, customer_count: 2, qty: 580, net_amount: 56846, tax_amount:  51192, grand_total: 1075032, amount: 56846 } },
          children: [
            { id: 'bi_5_1', label: 'Gluconorm G2', values: { default: { invoice_count: 1, customer_count: 1, qty: 290, net_amount: 28423, tax_amount: 25596, grand_total: 537516, amount: 28423 } }, children: [] },
            { id: 'bi_5_2', label: 'Tonact 10mg',  values: { default: { invoice_count: 1, customer_count: 1, qty: 290, net_amount: 28423, tax_amount: 25596, grand_total: 537516, amount: 28423 } }, children: [] },
          ],
        },
      ],
    },

    brand_item_breakdown: {
      title: 'Brand / Item',
      meta: { row_expansion: true, column_group: true },
      columns: [
        { id: 'default', label: '', children: [{ field: 'invoice_count', label: 'Invoice Count', type: 'Int' }, { field: 'customer_count', label: 'Customer Count', type: 'Int' }] },
        { id: '2026-01', label: 'Jan 2026', children: [{ field: 'qty', label: 'Qty', type: 'Float' }, { field: 'amount', label: 'Amount', type: 'Currency' }] },
        { id: '2026-02', label: 'Feb 2026', children: [{ field: 'qty', label: 'Qty', type: 'Float' }, { field: 'amount', label: 'Amount', type: 'Currency' }] },
        { id: 'ytd',     label: 'YTD',      children: [{ field: 'qty', label: 'Qty', type: 'Float' }, { field: 'amount', label: 'Amount', type: 'Currency' }] },
      ],
      rows: [
        {
          id: 'brand_1', label: 'Cipla',
          values: { default: { invoice_count: 4, customer_count: 4 }, '2026-01': { qty: 350, amount: 33010 }, '2026-02': { qty: 380, amount: 35180 }, ytd: { qty: 730, amount: 68190 } },
          children: [
            { id: 'bi_1_1', label: 'Azithromycin 500mg', values: { default: { invoice_count: 2, customer_count: 2 }, '2026-01': { qty: 210, amount: 19700 }, '2026-02': { qty: 220, amount: 20290 }, ytd: { qty: 430, amount: 39990 } }, children: [] },
            { id: 'bi_1_2', label: 'Paracetamol 650mg',  values: { default: { invoice_count: 2, customer_count: 2 }, '2026-01': { qty: 140, amount: 13310 }, '2026-02': { qty: 160, amount: 14890 }, ytd: { qty: 300, amount: 28200 } }, children: [] },
          ],
        },
        {
          id: 'brand_2', label: 'Abbott',
          values: { default: { invoice_count: 4, customer_count: 4 }, '2026-01': { qty: 290, amount: 45720 }, '2026-02': { qty: 320, amount: 49569 }, ytd: { qty: 610, amount: 95289 } },
          children: [
            { id: 'bi_2_1', label: 'Thyronorm 100mcg', values: { default: { invoice_count: 2, customer_count: 2 }, '2026-01': { qty: 190, amount: 29587 }, '2026-02': { qty: 200, amount: 31315 }, ytd: { qty: 390, amount: 60902 } }, children: [] },
            { id: 'bi_2_2', label: 'Cremaffin Syrup',  values: { default: { invoice_count: 2, customer_count: 2 }, '2026-01': { qty: 100, amount: 16133 }, '2026-02': { qty: 120, amount: 18254 }, ytd: { qty: 220, amount: 34387 } }, children: [] },
          ],
        },
        {
          id: 'brand_3', label: 'Sun Pharma',
          values: { default: { invoice_count: 4, customer_count: 4 }, '2026-01': { qty: 370, amount: 34700 }, '2026-02': { qty: 395, amount: 37138 }, ytd: { qty: 765, amount: 71838 } },
          children: [
            { id: 'bi_3_1', label: 'Clopilet 75mg', values: { default: { invoice_count: 2, customer_count: 2 }, '2026-01': { qty: 140, amount: 13700 }, '2026-02': { qty: 150, amount: 14723 }, ytd: { qty: 290, amount: 28423 } }, children: [] },
            { id: 'bi_3_2', label: 'Rosuvas 10mg',  values: { default: { invoice_count: 2, customer_count: 2 }, '2026-01': { qty: 230, amount: 21000 }, '2026-02': { qty: 245, amount: 22415 }, ytd: { qty: 475, amount: 43415 } }, children: [] },
          ],
        },
        {
          id: 'brand_4', label: 'Micro Labs',
          values: { default: { invoice_count: 2, customer_count: 2 }, '2026-01': { qty: 150, amount: 13100 }, '2026-02': { qty: 160, amount: 14055 }, ytd: { qty: 310, amount: 27155 } },
          children: [
            { id: 'bi_4_1', label: 'Telma 40mg',     values: { default: { invoice_count: 1, customer_count: 1 }, '2026-01': { qty: 100, amount:  8800 }, '2026-02': { qty: 110, amount:  9594 }, ytd: { qty: 210, amount: 18394 } }, children: [] },
            { id: 'bi_4_2', label: 'Dolo 650 Strip', values: { default: { invoice_count: 1, customer_count: 1 }, '2026-01': { qty:  50, amount:  4300 }, '2026-02': { qty:  50, amount:  4461 }, ytd: { qty: 100, amount:  8761 } }, children: [] },
          ],
        },
        {
          id: 'brand_5', label: 'Lupin',
          values: { default: { invoice_count: 2, customer_count: 2 }, '2026-01': { qty: 280, amount: 27500 }, '2026-02': { qty: 300, amount: 29346 }, ytd: { qty: 580, amount: 56846 } },
          children: [
            { id: 'bi_5_1', label: 'Gluconorm G2', values: { default: { invoice_count: 1, customer_count: 1 }, '2026-01': { qty: 140, amount: 13700 }, '2026-02': { qty: 150, amount: 14723 }, ytd: { qty: 290, amount: 28423 } }, children: [] },
            { id: 'bi_5_2', label: 'Tonact 10mg',  values: { default: { invoice_count: 1, customer_count: 1 }, '2026-01': { qty: 140, amount: 13800 }, '2026-02': { qty: 150, amount: 14623 }, ytd: { qty: 290, amount: 28423 } }, children: [] },
          ],
        },
      ],
    },

    // Scenario 4: tree rows + column breakdown (default group carries non-breakdown columns)
    department_hq_breakdown: {
      title: 'Department / HQ',
      meta: { row_expansion: true, column_group: true },
      columns: [
        { id: 'default',    label: '',           children: [{ field: 'invoice_count', label: 'Invoice Count', type: 'Int' }, { field: 'customer_count', label: 'Customer Count', type: 'Int' }] },
        { id: '2026-01',    label: 'Jan 2026',   children: [{ field: 'qty', label: 'Qty', type: 'Float' }, { field: 'amount', label: 'Amount', type: 'Currency' }] },
        { id: '2026-02',    label: 'Feb 2026',   children: [{ field: 'qty', label: 'Qty', type: 'Float' }, { field: 'amount', label: 'Amount', type: 'Currency' }] },
        { id: 'ytd',        label: 'YTD',        children: [{ field: 'qty', label: 'Qty', type: 'Float' }, { field: 'amount', label: 'Amount', type: 'Currency' }] },
        { id: 'tax_amount', label: 'Tax Amount', children: [{ field: '2026-01', label: 'Jan 2026', type: 'Currency' }, { field: '2026-02', label: 'Feb 2026', type: 'Currency' }] },
      ],
      rows: [
        {
          id: 'dept_1', label: 'Aura & Proxima Karnataka - ELPL',
          values: { default: { invoice_count: 1, customer_count: 1 }, '2026-01': { qty: 120, amount: 17254 }, '2026-02': { qty: 145, amount: 20100 }, ytd: { qty: 265, amount: 37354 }, tax_amount: { '2026-01': 3106, '2026-02': 3618 } },
          children: [
            { id: 'hq_1_1', label: 'HQ-Bangalore',  values: { default: { invoice_count: 1, customer_count: 1 }, '2026-01': { qty: 120, amount: 17254 }, '2026-02': { qty: 145, amount: 20100 }, ytd: { qty: 265, amount: 37354 }, tax_amount: { '2026-01': 3106, '2026-02': 3618 } }, children: [] },
          ],
        },
        {
          id: 'dept_2', label: 'Elbrit Bangalore - ELPL',
          values: { default: { invoice_count: 1, customer_count: 1 }, '2026-01': { qty: 250, amount: 23061 }, '2026-02': { qty: 280, amount: 25800 }, ytd: { qty: 530, amount: 48861 }, tax_amount: { '2026-01': 4151, '2026-02': 4644 } },
          children: [
            { id: 'hq_2_1', label: 'HQ-Bangalore',  values: { default: { invoice_count: 1, customer_count: 1 }, '2026-01': { qty: 250, amount: 23061 }, '2026-02': { qty: 280, amount: 25800 }, ytd: { qty: 530, amount: 48861 }, tax_amount: { '2026-01': 4151, '2026-02': 4644 } }, children: [] },
          ],
        },
        {
          id: 'dept_3', label: 'Elbrit Telangana - ELPL',
          values: { default: { invoice_count: 1, customer_count: 1 }, '2026-01': { qty: 400, amount: 34573 }, '2026-02': { qty: 420, amount: 36200 }, ytd: { qty: 820, amount: 70773 }, tax_amount: { '2026-01': 6223, '2026-02': 6516 } },
          children: [
            { id: 'hq_3_1', label: 'HQ-Hyderabad',  values: { default: { invoice_count: 1, customer_count: 1 }, '2026-01': { qty: 400, amount: 34573 }, '2026-02': { qty: 420, amount: 36200 }, ytd: { qty: 820, amount: 70773 }, tax_amount: { '2026-01': 6223, '2026-02': 6516 } }, children: [] },
          ],
        },
        {
          id: 'dept_4', label: 'Elbrit Uttar Pradesh - ELPL',
          values: { default: { invoice_count: 1, customer_count: 1 }, '2026-01': { qty: 160, amount: 13489 }, '2026-02': { qty: 170, amount: 14300 }, ytd: { qty: 330, amount: 27789 }, tax_amount: { '2026-01': 2428, '2026-02': 2574 } },
          children: [
            { id: 'hq_4_1', label: 'HQ-Gorakhpur',  values: { default: { invoice_count: 1, customer_count: 1 }, '2026-01': { qty: 160, amount: 13489 }, '2026-02': { qty: 170, amount: 14300 }, ytd: { qty: 330, amount: 27789 }, tax_amount: { '2026-01': 2428, '2026-02': 2574 } }, children: [] },
          ],
        },
        {
          id: 'dept_5', label: 'Vasco Karnataka - ELPL',
          values: { default: { invoice_count: 1, customer_count: 1 }, '2026-01': { qty: 340, amount: 31215 }, '2026-02': { qty: 360, amount: 33000 }, ytd: { qty: 700, amount: 64215 }, tax_amount: { '2026-01': 5619, '2026-02': 5940 } },
          children: [
            { id: 'hq_5_1', label: 'HQ-Bangalore',  values: { default: { invoice_count: 1, customer_count: 1 }, '2026-01': { qty: 340, amount: 31215 }, '2026-02': { qty: 360, amount: 33000 }, ytd: { qty: 700, amount: 64215 }, tax_amount: { '2026-01': 5619, '2026-02': 5940 } }, children: [] },
          ],
        },
        {
          id: 'dept_6', label: 'Micro Labs Karnataka - ELPL',
          values: { default: { invoice_count: 2, customer_count: 2 }, '2026-01': { qty: 210, amount: 18394 }, '2026-02': { qty: 225, amount: 19820 }, ytd: { qty: 435, amount: 38214 }, tax_amount: { '2026-01': 3311, '2026-02': 3568 } },
          children: [
            { id: 'hq_6_1', label: 'HQ-Bangalore',  values: { default: { invoice_count: 1, customer_count: 1 }, '2026-01': { qty: 110, amount:  9632 }, '2026-02': { qty: 120, amount: 10540 }, ytd: { qty: 230, amount: 20172 }, tax_amount: { '2026-01': 1734, '2026-02': 1897 } }, children: [] },
            { id: 'hq_6_2', label: 'HQ-Mysore',     values: { default: { invoice_count: 1, customer_count: 1 }, '2026-01': { qty: 100, amount:  8762 }, '2026-02': { qty: 105, amount:  9280 }, ytd: { qty: 205, amount: 18042 }, tax_amount: { '2026-01': 1577, '2026-02': 1670 } }, children: [] },
          ],
        },
        {
          id: 'dept_7', label: 'Cipla Maharashtra - ELPL',
          values: { default: { invoice_count: 2, customer_count: 2 }, '2026-01': { qty: 530, amount: 47804 }, '2026-02': { qty: 560, amount: 51200 }, ytd: { qty: 1090, amount: 99004 }, tax_amount: { '2026-01': 8605, '2026-02': 9216 } },
          children: [
            { id: 'hq_7_1', label: 'HQ-Mumbai',     values: { default: { invoice_count: 1, customer_count: 1 }, '2026-01': { qty: 300, amount: 27090 }, '2026-02': { qty: 315, amount: 28900 }, ytd: { qty: 615, amount: 55990 }, tax_amount: { '2026-01': 4876, '2026-02': 5202 } }, children: [] },
            { id: 'hq_7_2', label: 'HQ-Pune',       values: { default: { invoice_count: 1, customer_count: 1 }, '2026-01': { qty: 230, amount: 20714 }, '2026-02': { qty: 245, amount: 22300 }, ytd: { qty: 475, amount: 43014 }, tax_amount: { '2026-01': 3729, '2026-02': 4014 } }, children: [] },
          ],
        },
        {
          id: 'dept_8', label: 'Sun Pharma Gujarat - ELPL',
          values: { default: { invoice_count: 1, customer_count: 1 }, '2026-01': { qty: 475, amount: 43415 }, '2026-02': { qty: 500, amount: 46000 }, ytd: { qty: 975, amount: 89415 }, tax_amount: { '2026-01': 7815, '2026-02': 8280 } },
          children: [
            { id: 'hq_8_1', label: 'HQ-Ahmedabad',  values: { default: { invoice_count: 1, customer_count: 1 }, '2026-01': { qty: 475, amount: 43415 }, '2026-02': { qty: 500, amount: 46000 }, ytd: { qty: 975, amount: 89415 }, tax_amount: { '2026-01': 7815, '2026-02': 8280 } }, children: [] },
          ],
        },
        {
          id: 'dept_9', label: 'Abbott Delhi - ELPL',
          values: { default: { invoice_count: 2, customer_count: 2 }, '2026-01': { qty: 390, amount: 60901 }, '2026-02': { qty: 410, amount: 64320 }, ytd: { qty: 800, amount: 125221 }, tax_amount: { '2026-01': 10962, '2026-02': 11578 } },
          children: [
            { id: 'hq_9_1', label: 'HQ-Delhi',      values: { default: { invoice_count: 1, customer_count: 1 }, '2026-01': { qty: 220, amount: 34388 }, '2026-02': { qty: 230, amount: 36200 }, ytd: { qty: 450, amount: 70588 }, tax_amount: { '2026-01': 6190, '2026-02': 6516 } }, children: [] },
            { id: 'hq_9_2', label: 'HQ-Noida',      values: { default: { invoice_count: 1, customer_count: 1 }, '2026-01': { qty: 170, amount: 26513 }, '2026-02': { qty: 180, amount: 28120 }, ytd: { qty: 350, amount: 54633 }, tax_amount: { '2026-01': 4772, '2026-02': 5062 } }, children: [] },
          ],
        },
        {
          id: 'dept_10', label: 'Lupin Rajasthan - ELPL',
          values: { default: { invoice_count: 1, customer_count: 1 }, '2026-01': { qty: 290, amount: 28423 }, '2026-02': { qty: 310, amount: 30500 }, ytd: { qty: 600, amount: 58923 }, tax_amount: { '2026-01': 5116, '2026-02': 5490 } },
          children: [
            { id: 'hq_10_1', label: 'HQ-Jaipur',   values: { default: { invoice_count: 1, customer_count: 1 }, '2026-01': { qty: 290, amount: 28423 }, '2026-02': { qty: 310, amount: 30500 }, ytd: { qty: 600, amount: 58923 }, tax_amount: { '2026-01': 5116, '2026-02': 5490 } }, children: [] },
          ],
        },
      ],
    },
  },
};

export function GET(request) {
  const { searchParams } = new URL(request.url);
  const view = searchParams.get('view');

  if (!view || !MOCK_REPORT.message[view]) {
    return NextResponse.json(
      { error: `Unknown view "${view}". Valid views: ${Object.keys(MOCK_REPORT.message).join(', ')}` },
      { status: 400 }
    );
  }

  return NextResponse.json({ message: { data: MOCK_REPORT.message[view] } });
}
