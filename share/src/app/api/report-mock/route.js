import { NextResponse } from 'next/server';

// ─── Column definitions ───────────────────────────────────────────────────────

const META_HQ = {
  fieldname: '_meta', label: '', fieldtype: 'Data',
  meta_filter_values: {
    hq: [
      { value: 'HQ-Bangalore',  label: 'HQ-Bangalore'  },
      { value: 'HQ-Hyderabad',  label: 'HQ-Hyderabad'  },
      { value: 'HQ-Gorakhpur',  label: 'HQ-Gorakhpur'  },
      { value: 'HQ-Ahmedabad',  label: 'HQ-Ahmedabad'  },
      { value: 'HQ-Mumbai',     label: 'HQ-Mumbai'     },
      { value: 'HQ-Pune',       label: 'HQ-Pune'       },
      { value: 'HQ-Delhi',      label: 'HQ-Delhi'      },
      { value: 'HQ-Noida',      label: 'HQ-Noida'      },
      { value: 'HQ-Jaipur',     label: 'HQ-Jaipur'     },
      { value: 'HQ-Mysore',     label: 'HQ-Mysore'     },
    ],
  },
};

const META_BRAND = {
  fieldname: '_meta', label: '', fieldtype: 'Data',
  meta_filter_values: {
    brand: [
      { value: 'Cipla',      label: 'Cipla'      },
      { value: 'Abbott',     label: 'Abbott'     },
      { value: 'Sun Pharma', label: 'Sun Pharma' },
      { value: 'Micro Labs', label: 'Micro Labs' },
      { value: 'Lupin',      label: 'Lupin'      },
    ],
    item: [
      { value: 'Azithromycin 500mg', label: 'Azithromycin 500mg' },
      { value: 'Paracetamol 650mg',  label: 'Paracetamol 650mg'  },
      { value: 'Thyronorm 100mcg',   label: 'Thyronorm 100mcg'   },
      { value: 'Cremaffin Syrup',    label: 'Cremaffin Syrup'    },
      { value: 'Clopilet 75mg',      label: 'Clopilet 75mg'      },
      { value: 'Rosuvas 10mg',       label: 'Rosuvas 10mg'       },
      { value: 'Telma 40mg',         label: 'Telma 40mg'         },
      { value: 'Dolo 650 Strip',     label: 'Dolo 650 Strip'     },
      { value: 'Gluconorm G2',       label: 'Gluconorm G2'       },
      { value: 'Tonact 10mg',        label: 'Tonact 10mg'        },
    ],
  },
};

// Shared base columns (non-pivot, no tree)
const COL_LABEL_DEPT   = { fieldname: 'label',          label: 'Department / HQ',  fieldtype: 'Data',     width: 250 };
const COL_LABEL_CUST   = { fieldname: 'label',          label: 'Customer / HQ',    fieldtype: 'Data',     width: 200 };
const COL_LABEL_BRAND  = { fieldname: 'label',          label: 'Brand / Item',     fieldtype: 'Data',     width: 220 };
const COL_INV_COUNT    = { fieldname: 'invoice_count',  label: 'Invoice Count',    fieldtype: 'Int'      };
const COL_CUST_COUNT   = { fieldname: 'customer_count', label: 'Customer Count',   fieldtype: 'Int'      };
const COL_QTY          = { fieldname: 'qty',            label: 'Total Qty',        fieldtype: 'Float'    };
const COL_RATE         = { fieldname: 'rate',           label: 'Total Rate',       fieldtype: 'Currency' };
const COL_MRP          = { fieldname: 'price_list_rate',label: 'Total MRP',        fieldtype: 'Currency' };
const COL_DISC_AMT     = { fieldname: 'discount_amount',label: 'Total Discount Amt',fieldtype: 'Currency' };
const COL_DISC_PCT     = { fieldname: 'discount_percentage', label: 'Discount %', fieldtype: 'Float'    };
const COL_NET          = { fieldname: 'net_amount',     label: 'Net Amount',       fieldtype: 'Currency' };
const COL_TAX          = { fieldname: 'tax_amount',     label: 'Tax Amount',       fieldtype: 'Currency' };
const COL_GRAND        = { fieldname: 'grand_total',    label: 'Grand Total',      fieldtype: 'Currency' };
const COL_AMOUNT       = { fieldname: 'amount',         label: 'Total Amount',     fieldtype: 'Currency' };

// Pivot columns
const COL_QTY_01    = { fieldname: 'qty_2026_01',          label: '2026 01 Qty',        fieldtype: 'Float'    };
const COL_AMT_01    = { fieldname: 'amount_2026_01',       label: '2026 01 Amount',     fieldtype: 'Currency' };
const COL_QTY_02    = { fieldname: 'qty_2026_02',          label: '2026 02 Qty',        fieldtype: 'Float'    };
const COL_AMT_02    = { fieldname: 'amount_2026_02',       label: '2026 02 Amount',     fieldtype: 'Currency' };
const COL_TAX_01    = { fieldname: 'tax_amount_2026_01',   label: '2026 01 Tax Amount', fieldtype: 'Currency' };
const COL_TAX_02    = { fieldname: 'tax_amount_2026_02',   label: '2026 02 Tax Amount', fieldtype: 'Currency' };
const COL_TOTAL_QTY = { fieldname: 'total_qty',            label: 'Total Qty',          fieldtype: 'Float'    };
const COL_TOTAL_AMT = { fieldname: 'total_amount',         label: 'Total Amount',       fieldtype: 'Currency' };

// ─── View definitions ─────────────────────────────────────────────────────────

const VIEWS = {

  // ── department_hq: tree, no pivot ────────────────────────────────────────────
  department_hq: {
    columns: [
      COL_LABEL_DEPT, COL_INV_COUNT, COL_CUST_COUNT, COL_QTY,
      COL_RATE, COL_MRP, COL_DISC_AMT, COL_DISC_PCT,
      COL_NET, COL_TAX, COL_GRAND, COL_AMOUNT, META_HQ,
    ],
    result: [
      { label: 'Aura & Proxima Karnataka - ELPL', invoice_count: 1, customer_count: 1, qty: 120.0, rate: 1302.03, price_list_rate: 1302.03, discount_amount: 0,     discount_percentage: 0.0,  net_amount: 16909.4,  tax_amount: 35773.02, grand_total:  751233.78, amount: 17254.5,  indent: 0, is_group: true  },
      { label: 'HQ-Bangalore',                    invoice_count: 1, customer_count: 1, qty: 120.0, rate: 1302.03, price_list_rate: 1302.03, discount_amount: 0,     discount_percentage: 0.0,  net_amount: 16909.4,  tax_amount: 35773.02, grand_total:  751233.78, amount: 17254.5,  indent: 1, is_group: false },
      { label: 'Elbrit Bangalore - ELPL',          invoice_count: 1, customer_count: 1, qty: 250.0, rate: 1589.9,  price_list_rate: 1589.9,  discount_amount: 0,     discount_percentage: 0.0,  net_amount: 22600.47, tax_amount: 67571.26, grand_total: 1418997.14, amount: 23061.7,  indent: 0, is_group: true  },
      { label: 'HQ-Bangalore',                    invoice_count: 1, customer_count: 1, qty: 250.0, rate: 1589.9,  price_list_rate: 1589.9,  discount_amount: 0,     discount_percentage: 0.0,  net_amount: 22600.47, tax_amount: 67571.26, grand_total: 1418997.14, amount: 23061.7,  indent: 1, is_group: false },
      { label: 'Elbrit Telangana - ELPL',          invoice_count: 1, customer_count: 1, qty: 400.0, rate: 1005.48, price_list_rate: 1005.48, discount_amount: 0,     discount_percentage: 0.0,  net_amount: 33190.27, tax_amount: 18254.72, grand_total:  383347.69, amount: 34573.2,  indent: 0, is_group: true  },
      { label: 'HQ-Hyderabad',                    invoice_count: 1, customer_count: 1, qty: 400.0, rate: 1005.48, price_list_rate: 1005.48, discount_amount: 0,     discount_percentage: 0.0,  net_amount: 33190.27, tax_amount: 18254.72, grand_total:  383347.69, amount: 34573.2,  indent: 1, is_group: false },
      { label: 'Elbrit Uttar Pradesh - ELPL',      invoice_count: 1, customer_count: 1, qty: 160.0, rate: 422.28,  price_list_rate: 498.91,  discount_amount: 76.63, discount_percentage: 15.4, net_amount: 13489.9,  tax_amount:  3372.5,  grand_total:   70822.0,  amount: 13489.9,  indent: 0, is_group: true  },
      { label: 'HQ-Gorakhpur',                    invoice_count: 1, customer_count: 1, qty: 160.0, rate: 422.28,  price_list_rate: 498.91,  discount_amount: 76.63, discount_percentage: 15.4, net_amount: 13489.9,  tax_amount:  3372.5,  grand_total:   70822.0,  amount: 13489.9,  indent: 1, is_group: false },
      { label: 'Vasco Karnataka - ELPL',           invoice_count: 1, customer_count: 1, qty: 340.0, rate: 1412.22, price_list_rate: 1412.22, discount_amount: 0,     discount_percentage: 0.0,  net_amount: 30591.3,  tax_amount: 55646.92, grand_total: 1168585.88, amount: 31215.6,  indent: 0, is_group: true  },
      { label: 'HQ-Bangalore',                    invoice_count: 1, customer_count: 1, qty: 340.0, rate: 1412.22, price_list_rate: 1412.22, discount_amount: 0,     discount_percentage: 0.0,  net_amount: 30591.3,  tax_amount: 55646.92, grand_total: 1168585.88, amount: 31215.6,  indent: 1, is_group: false },
      { label: 'Micro Labs Karnataka - ELPL',      invoice_count: 2, customer_count: 2, qty: 210.0, rate: 875.5,   price_list_rate: 875.5,   discount_amount: 0,     discount_percentage: 0.0,  net_amount: 18394.2,  tax_amount: 22781.4,  grand_total:  478410.0,  amount: 18394.2,  indent: 0, is_group: true  },
      { label: 'HQ-Bangalore',                    invoice_count: 1, customer_count: 1, qty: 110.0, rate: 875.5,   price_list_rate: 875.5,   discount_amount: 0,     discount_percentage: 0.0,  net_amount:  9632.5,  tax_amount: 11943.0,  grand_total:  250710.0,  amount:  9632.5,  indent: 1, is_group: false },
      { label: 'HQ-Mysore',                       invoice_count: 1, customer_count: 1, qty: 100.0, rate: 875.5,   price_list_rate: 875.5,   discount_amount: 0,     discount_percentage: 0.0,  net_amount:  8761.7,  tax_amount: 10838.4,  grand_total:  227700.0,  amount:  8761.7,  indent: 1, is_group: false },
      { label: 'Cipla Maharashtra - ELPL',         invoice_count: 2, customer_count: 2, qty: 530.0, rate: 2140.0,  price_list_rate: 2250.0,  discount_amount: 583.0, discount_percentage: 5.0,  net_amount: 47804.2,  tax_amount: 91258.0,  grand_total: 1914418.0,  amount: 47804.2,  indent: 0, is_group: true  },
      { label: 'HQ-Mumbai',                       invoice_count: 1, customer_count: 1, qty: 300.0, rate: 2140.0,  price_list_rate: 2250.0,  discount_amount: 330.0, discount_percentage: 5.0,  net_amount: 27090.0,  tax_amount: 51732.0,  grand_total: 1085670.0,  amount: 27090.0,  indent: 1, is_group: false },
      { label: 'HQ-Pune',                         invoice_count: 1, customer_count: 1, qty: 230.0, rate: 2140.0,  price_list_rate: 2250.0,  discount_amount: 253.0, discount_percentage: 5.0,  net_amount: 20714.2,  tax_amount: 39526.0,  grand_total:  828748.0,  amount: 20714.2,  indent: 1, is_group: false },
      { label: 'Sun Pharma Gujarat - ELPL',        invoice_count: 1, customer_count: 1, qty: 475.0, rate: 1820.0,  price_list_rate: 1820.0,  discount_amount: 0,     discount_percentage: 0.0,  net_amount: 43415.0,  tax_amount: 82905.0,  grand_total: 1741005.0,  amount: 43415.0,  indent: 0, is_group: true  },
      { label: 'HQ-Ahmedabad',                    invoice_count: 1, customer_count: 1, qty: 475.0, rate: 1820.0,  price_list_rate: 1820.0,  discount_amount: 0,     discount_percentage: 0.0,  net_amount: 43415.0,  tax_amount: 82905.0,  grand_total: 1741005.0,  amount: 43415.0,  indent: 1, is_group: false },
      { label: 'Abbott Delhi - ELPL',              invoice_count: 2, customer_count: 2, qty: 390.0, rate: 3105.0,  price_list_rate: 3260.0,  discount_amount: 604.5, discount_percentage: 4.75, net_amount: 60901.5,  tax_amount: 116220.0, grand_total: 2440620.0,  amount: 60901.5,  indent: 0, is_group: true  },
      { label: 'HQ-Delhi',                        invoice_count: 1, customer_count: 1, qty: 220.0, rate: 3105.0,  price_list_rate: 3260.0,  discount_amount: 341.0, discount_percentage: 4.75, net_amount: 34387.5,  tax_amount: 65604.0,  grand_total: 1378284.0,  amount: 34387.5,  indent: 1, is_group: false },
      { label: 'HQ-Noida',                        invoice_count: 1, customer_count: 1, qty: 170.0, rate: 3105.0,  price_list_rate: 3260.0,  discount_amount: 263.5, discount_percentage: 4.75, net_amount: 26514.0,  tax_amount: 50616.0,  grand_total: 1062336.0,  amount: 26514.0,  indent: 1, is_group: false },
      { label: 'Lupin Rajasthan - ELPL',           invoice_count: 1, customer_count: 1, qty: 290.0, rate: 980.0,   price_list_rate: 980.0,   discount_amount: 0,     discount_percentage: 0.0,  net_amount: 28423.2,  tax_amount: 25596.0,  grand_total:  537516.0,  amount: 28423.2,  indent: 0, is_group: true  },
      { label: 'HQ-Jaipur',                       invoice_count: 1, customer_count: 1, qty: 290.0, rate: 980.0,   price_list_rate: 980.0,   discount_amount: 0,     discount_percentage: 0.0,  net_amount: 28423.2,  tax_amount: 25596.0,  grand_total:  537516.0,  amount: 28423.2,  indent: 1, is_group: false },
    ],
  },

  // ── customer_item: flat, no pivot ─────────────────────────────────────────────
  customer_item: {
    columns: [COL_LABEL_CUST, COL_INV_COUNT, COL_CUST_COUNT, COL_QTY, COL_AMOUNT, COL_GRAND],
    result: [
      { label: 'HQ-Bangalore',  invoice_count: 3, customer_count: 3, qty: 710.0, amount: 71531.8,  grand_total: 3338816.80 },
      { label: 'HQ-Hyderabad',  invoice_count: 1, customer_count: 1, qty: 400.0, amount: 34573.2,  grand_total:  383347.69 },
      { label: 'HQ-Gorakhpur',  invoice_count: 1, customer_count: 1, qty: 160.0, amount: 13489.9,  grand_total:   70822.00 },
      { label: 'HQ-Mysore',     invoice_count: 1, customer_count: 1, qty: 100.0, amount:  8761.7,  grand_total:  227700.00 },
      { label: 'HQ-Mumbai',     invoice_count: 1, customer_count: 1, qty: 300.0, amount: 27090.0,  grand_total: 1085670.00 },
      { label: 'HQ-Pune',       invoice_count: 1, customer_count: 1, qty: 230.0, amount: 20714.2,  grand_total:  828748.00 },
      { label: 'HQ-Ahmedabad',  invoice_count: 1, customer_count: 1, qty: 475.0, amount: 43415.0,  grand_total: 1741005.00 },
      { label: 'HQ-Delhi',      invoice_count: 1, customer_count: 1, qty: 220.0, amount: 34387.5,  grand_total: 1378284.00 },
      { label: 'HQ-Noida',      invoice_count: 1, customer_count: 1, qty: 170.0, amount: 26514.0,  grand_total: 1062336.00 },
      { label: 'HQ-Jaipur',     invoice_count: 1, customer_count: 1, qty: 290.0, amount: 28423.2,  grand_total:  537516.00 },
    ],
  },

  // ── customer_item_breakdown: flat, pivot ───────────────────────────────────────
  customer_item_breakdown: {
    columns: [
      COL_LABEL_CUST, COL_INV_COUNT, COL_CUST_COUNT,
      COL_QTY_01, COL_AMT_01, COL_QTY_02, COL_AMT_02,
      COL_TAX_01, COL_TAX_02,
      COL_TOTAL_QTY, COL_TOTAL_AMT,
    ],
    result: [
      { label: 'HQ-Bangalore',  invoice_count: 5, customer_count: 5, qty_2026_01: 320, amount_2026_01: 34200, qty_2026_02: 390, amount_2026_02: 37331, tax_amount_2026_01: 6156, tax_amount_2026_02: 6720, total_qty: 710, total_amount: 71531 },
      { label: 'HQ-Hyderabad',  invoice_count: 2, customer_count: 2, qty_2026_01: 180, amount_2026_01: 18100, qty_2026_02: 220, amount_2026_02: 22450, tax_amount_2026_01: 3258, tax_amount_2026_02: 4041, total_qty: 400, total_amount: 40550 },
      { label: 'HQ-Gorakhpur',  invoice_count: 2, customer_count: 2, qty_2026_01:  80, amount_2026_01:  8050, qty_2026_02:  80, amount_2026_02:  7440, tax_amount_2026_01: 1449, tax_amount_2026_02: 1339, total_qty: 160, total_amount: 15490 },
      { label: 'HQ-Mysore',     invoice_count: 2, customer_count: 2, qty_2026_01:  45, amount_2026_01:  4200, qty_2026_02:  55, amount_2026_02:  4561, tax_amount_2026_01:  756, tax_amount_2026_02:  821, total_qty: 100, total_amount:  8761 },
      { label: 'HQ-Mumbai',     invoice_count: 2, customer_count: 2, qty_2026_01: 140, amount_2026_01: 13050, qty_2026_02: 160, amount_2026_02: 16040, tax_amount_2026_01: 2349, tax_amount_2026_02: 2887, total_qty: 300, total_amount: 29090 },
      { label: 'HQ-Pune',       invoice_count: 2, customer_count: 2, qty_2026_01: 110, amount_2026_01:  9874, qty_2026_02: 120, amount_2026_02: 10840, tax_amount_2026_01: 1777, tax_amount_2026_02: 1951, total_qty: 230, total_amount: 20714 },
      { label: 'HQ-Ahmedabad',  invoice_count: 2, customer_count: 2, qty_2026_01: 230, amount_2026_01: 21600, qty_2026_02: 245, amount_2026_02: 21815, tax_amount_2026_01: 3888, tax_amount_2026_02: 3927, total_qty: 475, total_amount: 43415 },
      { label: 'HQ-Delhi',      invoice_count: 2, customer_count: 2, qty_2026_01: 100, amount_2026_01: 16250, qty_2026_02: 120, amount_2026_02: 18137, tax_amount_2026_01: 2925, tax_amount_2026_02: 3265, total_qty: 220, total_amount: 34387 },
      { label: 'HQ-Noida',      invoice_count: 2, customer_count: 2, qty_2026_01:  80, amount_2026_01: 12580, qty_2026_02:  90, amount_2026_02: 13934, tax_amount_2026_01: 2264, tax_amount_2026_02: 2508, total_qty: 170, total_amount: 26514 },
      { label: 'HQ-Jaipur',     invoice_count: 2, customer_count: 2, qty_2026_01: 140, amount_2026_01: 14010, qty_2026_02: 150, amount_2026_02: 14413, tax_amount_2026_01: 2522, tax_amount_2026_02: 2594, total_qty: 290, total_amount: 28423 },
    ],
  },

  // ── brand_item: tree, no pivot ───────────────────────────────────────────────
  brand_item: {
    columns: [COL_LABEL_BRAND, COL_INV_COUNT, COL_CUST_COUNT, COL_QTY, COL_NET, COL_TAX, COL_GRAND, COL_AMOUNT, META_BRAND],
    result: [
      { label: 'Cipla',              invoice_count: 4, customer_count: 4, qty: 730, net_amount: 68190, tax_amount: 136788, grand_total: 2872218, amount: 68190, indent: 0, is_group: true  },
      { label: 'Azithromycin 500mg', invoice_count: 2, customer_count: 2, qty: 430, net_amount: 39990, tax_amount:  79986, grand_total: 1679706, amount: 39990, indent: 1, is_group: false },
      { label: 'Paracetamol 650mg',  invoice_count: 2, customer_count: 2, qty: 300, net_amount: 28200, tax_amount:  56802, grand_total: 1192512, amount: 28200, indent: 1, is_group: false },
      { label: 'Abbott',             invoice_count: 4, customer_count: 4, qty: 610, net_amount: 95289, tax_amount: 181836, grand_total: 3818556, amount: 95289, indent: 0, is_group: true  },
      { label: 'Thyronorm 100mcg',   invoice_count: 2, customer_count: 2, qty: 390, net_amount: 60902, tax_amount: 116220, grand_total: 2440620, amount: 60902, indent: 1, is_group: false },
      { label: 'Cremaffin Syrup',    invoice_count: 2, customer_count: 2, qty: 220, net_amount: 34387, tax_amount:  65616, grand_total: 1377936, amount: 34387, indent: 1, is_group: false },
      { label: 'Sun Pharma',         invoice_count: 4, customer_count: 4, qty: 765, net_amount: 71838, tax_amount: 125838, grand_total: 2642598, amount: 71838, indent: 0, is_group: true  },
      { label: 'Clopilet 75mg',      invoice_count: 2, customer_count: 2, qty: 290, net_amount: 28423, tax_amount:  25596, grand_total:  537516, amount: 28423, indent: 1, is_group: false },
      { label: 'Rosuvas 10mg',       invoice_count: 2, customer_count: 2, qty: 475, net_amount: 43415, tax_amount: 100242, grand_total: 2105082, amount: 43415, indent: 1, is_group: false },
      { label: 'Micro Labs',         invoice_count: 2, customer_count: 2, qty: 310, net_amount: 27155, tax_amount:  45620, grand_total:  958020, amount: 27155, indent: 0, is_group: true  },
      { label: 'Telma 40mg',         invoice_count: 1, customer_count: 1, qty: 210, net_amount: 18394, tax_amount:  22781, grand_total:  478410, amount: 18394, indent: 1, is_group: false },
      { label: 'Dolo 650 Strip',     invoice_count: 1, customer_count: 1, qty: 100, net_amount:  8761, tax_amount:  22839, grand_total:  479610, amount:  8761, indent: 1, is_group: false },
      { label: 'Lupin',              invoice_count: 2, customer_count: 2, qty: 580, net_amount: 56846, tax_amount:  51192, grand_total: 1075032, amount: 56846, indent: 0, is_group: true  },
      { label: 'Gluconorm G2',       invoice_count: 1, customer_count: 1, qty: 290, net_amount: 28423, tax_amount:  25596, grand_total:  537516, amount: 28423, indent: 1, is_group: false },
      { label: 'Tonact 10mg',        invoice_count: 1, customer_count: 1, qty: 290, net_amount: 28423, tax_amount:  25596, grand_total:  537516, amount: 28423, indent: 1, is_group: false },
    ],
  },

  // ── brand_item_breakdown: tree, pivot ─────────────────────────────────────────
  brand_item_breakdown: {
    columns: [
      COL_LABEL_BRAND, COL_INV_COUNT, COL_CUST_COUNT,
      COL_QTY_01, COL_AMT_01, COL_QTY_02, COL_AMT_02,
      COL_TOTAL_QTY, COL_TOTAL_AMT,
    ],
    result: [
      { label: 'Cipla',              invoice_count: 4, customer_count: 4, qty_2026_01: 350, amount_2026_01: 33010, qty_2026_02: 380, amount_2026_02: 35180, total_qty: 730, total_amount: 68190, indent: 0, is_group: true  },
      { label: 'Azithromycin 500mg', invoice_count: 2, customer_count: 2, qty_2026_01: 210, amount_2026_01: 19700, qty_2026_02: 220, amount_2026_02: 20290, total_qty: 430, total_amount: 39990, indent: 1, is_group: false },
      { label: 'Paracetamol 650mg',  invoice_count: 2, customer_count: 2, qty_2026_01: 140, amount_2026_01: 13310, qty_2026_02: 160, amount_2026_02: 14890, total_qty: 300, total_amount: 28200, indent: 1, is_group: false },
      { label: 'Abbott',             invoice_count: 4, customer_count: 4, qty_2026_01: 290, amount_2026_01: 45720, qty_2026_02: 320, amount_2026_02: 49569, total_qty: 610, total_amount: 95289, indent: 0, is_group: true  },
      { label: 'Thyronorm 100mcg',   invoice_count: 2, customer_count: 2, qty_2026_01: 190, amount_2026_01: 29587, qty_2026_02: 200, amount_2026_02: 31315, total_qty: 390, total_amount: 60902, indent: 1, is_group: false },
      { label: 'Cremaffin Syrup',    invoice_count: 2, customer_count: 2, qty_2026_01: 100, amount_2026_01: 16133, qty_2026_02: 120, amount_2026_02: 18254, total_qty: 220, total_amount: 34387, indent: 1, is_group: false },
      { label: 'Sun Pharma',         invoice_count: 4, customer_count: 4, qty_2026_01: 370, amount_2026_01: 34700, qty_2026_02: 395, amount_2026_02: 37138, total_qty: 765, total_amount: 71838, indent: 0, is_group: true  },
      { label: 'Clopilet 75mg',      invoice_count: 2, customer_count: 2, qty_2026_01: 140, amount_2026_01: 13700, qty_2026_02: 150, amount_2026_02: 14723, total_qty: 290, total_amount: 28423, indent: 1, is_group: false },
      { label: 'Rosuvas 10mg',       invoice_count: 2, customer_count: 2, qty_2026_01: 230, amount_2026_01: 21000, qty_2026_02: 245, amount_2026_02: 22415, total_qty: 475, total_amount: 43415, indent: 1, is_group: false },
      { label: 'Micro Labs',         invoice_count: 2, customer_count: 2, qty_2026_01: 150, amount_2026_01: 13100, qty_2026_02: 160, amount_2026_02: 14055, total_qty: 310, total_amount: 27155, indent: 0, is_group: true  },
      { label: 'Telma 40mg',         invoice_count: 1, customer_count: 1, qty_2026_01: 100, amount_2026_01:  8800, qty_2026_02: 110, amount_2026_02:  9594, total_qty: 210, total_amount: 18394, indent: 1, is_group: false },
      { label: 'Dolo 650 Strip',     invoice_count: 1, customer_count: 1, qty_2026_01:  50, amount_2026_01:  4300, qty_2026_02:  50, amount_2026_02:  4461, total_qty: 100, total_amount:  8761, indent: 1, is_group: false },
      { label: 'Lupin',              invoice_count: 2, customer_count: 2, qty_2026_01: 280, amount_2026_01: 27500, qty_2026_02: 300, amount_2026_02: 29346, total_qty: 580, total_amount: 56846, indent: 0, is_group: true  },
      { label: 'Gluconorm G2',       invoice_count: 1, customer_count: 1, qty_2026_01: 140, amount_2026_01: 13700, qty_2026_02: 150, amount_2026_02: 14723, total_qty: 290, total_amount: 28423, indent: 1, is_group: false },
      { label: 'Tonact 10mg',        invoice_count: 1, customer_count: 1, qty_2026_01: 140, amount_2026_01: 13800, qty_2026_02: 150, amount_2026_02: 14623, total_qty: 290, total_amount: 28423, indent: 1, is_group: false },
    ],
  },

  // ── department_hq_breakdown: tree, pivot, tax_amount breakdown ────────────────
  department_hq_breakdown: {
    columns: [
      COL_LABEL_DEPT, COL_INV_COUNT, COL_CUST_COUNT,
      COL_QTY_01, COL_AMT_01, COL_QTY_02, COL_AMT_02,
      COL_TAX_01, COL_TAX_02,
      COL_TOTAL_QTY, COL_TOTAL_AMT,
    ],
    result: [
      { label: 'Aura & Proxima Karnataka - ELPL', invoice_count: 1, customer_count: 1, qty_2026_01: 120, amount_2026_01: 17254, qty_2026_02: 145, amount_2026_02: 20100, tax_amount_2026_01: 3106, tax_amount_2026_02: 3618, total_qty: 265, total_amount: 37354, indent: 0, is_group: true  },
      { label: 'HQ-Bangalore',                    invoice_count: 1, customer_count: 1, qty_2026_01: 120, amount_2026_01: 17254, qty_2026_02: 145, amount_2026_02: 20100, tax_amount_2026_01: 3106, tax_amount_2026_02: 3618, total_qty: 265, total_amount: 37354, indent: 1, is_group: false },
      { label: 'Elbrit Bangalore - ELPL',          invoice_count: 1, customer_count: 1, qty_2026_01: 250, amount_2026_01: 23061, qty_2026_02: 280, amount_2026_02: 25800, tax_amount_2026_01: 4151, tax_amount_2026_02: 4644, total_qty: 530, total_amount: 48861, indent: 0, is_group: true  },
      { label: 'HQ-Bangalore',                    invoice_count: 1, customer_count: 1, qty_2026_01: 250, amount_2026_01: 23061, qty_2026_02: 280, amount_2026_02: 25800, tax_amount_2026_01: 4151, tax_amount_2026_02: 4644, total_qty: 530, total_amount: 48861, indent: 1, is_group: false },
      { label: 'Elbrit Telangana - ELPL',          invoice_count: 1, customer_count: 1, qty_2026_01: 400, amount_2026_01: 34573, qty_2026_02: 420, amount_2026_02: 36200, tax_amount_2026_01: 6223, tax_amount_2026_02: 6516, total_qty: 820, total_amount: 70773, indent: 0, is_group: true  },
      { label: 'HQ-Hyderabad',                    invoice_count: 1, customer_count: 1, qty_2026_01: 400, amount_2026_01: 34573, qty_2026_02: 420, amount_2026_02: 36200, tax_amount_2026_01: 6223, tax_amount_2026_02: 6516, total_qty: 820, total_amount: 70773, indent: 1, is_group: false },
      { label: 'Elbrit Uttar Pradesh - ELPL',      invoice_count: 1, customer_count: 1, qty_2026_01: 160, amount_2026_01: 13489, qty_2026_02: 170, amount_2026_02: 14300, tax_amount_2026_01: 2428, tax_amount_2026_02: 2574, total_qty: 330, total_amount: 27789, indent: 0, is_group: true  },
      { label: 'HQ-Gorakhpur',                    invoice_count: 1, customer_count: 1, qty_2026_01: 160, amount_2026_01: 13489, qty_2026_02: 170, amount_2026_02: 14300, tax_amount_2026_01: 2428, tax_amount_2026_02: 2574, total_qty: 330, total_amount: 27789, indent: 1, is_group: false },
      { label: 'Cipla Maharashtra - ELPL',         invoice_count: 2, customer_count: 2, qty_2026_01: 530, amount_2026_01: 47804, qty_2026_02: 560, amount_2026_02: 51200, tax_amount_2026_01: 8605, tax_amount_2026_02: 9216, total_qty: 1090, total_amount: 99004, indent: 0, is_group: true  },
      { label: 'HQ-Mumbai',                       invoice_count: 1, customer_count: 1, qty_2026_01: 300, amount_2026_01: 27090, qty_2026_02: 315, amount_2026_02: 28900, tax_amount_2026_01: 4876, tax_amount_2026_02: 5202, total_qty:  615, total_amount: 55990, indent: 1, is_group: false },
      { label: 'HQ-Pune',                         invoice_count: 1, customer_count: 1, qty_2026_01: 230, amount_2026_01: 20714, qty_2026_02: 245, amount_2026_02: 22300, tax_amount_2026_01: 3729, tax_amount_2026_02: 4014, total_qty:  475, total_amount: 43014, indent: 1, is_group: false },
      { label: 'Sun Pharma Gujarat - ELPL',        invoice_count: 1, customer_count: 1, qty_2026_01: 475, amount_2026_01: 43415, qty_2026_02: 500, amount_2026_02: 46000, tax_amount_2026_01: 7815, tax_amount_2026_02: 8280, total_qty:  975, total_amount: 89415, indent: 0, is_group: true  },
      { label: 'HQ-Ahmedabad',                    invoice_count: 1, customer_count: 1, qty_2026_01: 475, amount_2026_01: 43415, qty_2026_02: 500, amount_2026_02: 46000, tax_amount_2026_01: 7815, tax_amount_2026_02: 8280, total_qty:  975, total_amount: 89415, indent: 1, is_group: false },
      { label: 'Abbott Delhi - ELPL',              invoice_count: 2, customer_count: 2, qty_2026_01: 390, amount_2026_01: 60901, qty_2026_02: 410, amount_2026_02: 64320, tax_amount_2026_01: 10962, tax_amount_2026_02: 11578, total_qty: 800, total_amount: 125221, indent: 0, is_group: true  },
      { label: 'HQ-Delhi',                        invoice_count: 1, customer_count: 1, qty_2026_01: 220, amount_2026_01: 34388, qty_2026_02: 230, amount_2026_02: 36200, tax_amount_2026_01:  6190, tax_amount_2026_02:  6516, total_qty:  450, total_amount:  70588, indent: 1, is_group: false },
      { label: 'HQ-Noida',                        invoice_count: 1, customer_count: 1, qty_2026_01: 170, amount_2026_01: 26513, qty_2026_02: 180, amount_2026_02: 28120, tax_amount_2026_01:  4772, tax_amount_2026_02:  5062, total_qty:  350, total_amount:  54633, indent: 1, is_group: false },
      { label: 'Lupin Rajasthan - ELPL',           invoice_count: 1, customer_count: 1, qty_2026_01: 290, amount_2026_01: 28423, qty_2026_02: 310, amount_2026_02: 30500, tax_amount_2026_01:  5116, tax_amount_2026_02:  5490, total_qty:  600, total_amount:  58923, indent: 0, is_group: true  },
      { label: 'HQ-Jaipur',                       invoice_count: 1, customer_count: 1, qty_2026_01: 290, amount_2026_01: 28423, qty_2026_02: 310, amount_2026_02: 30500, tax_amount_2026_01:  5116, tax_amount_2026_02:  5490, total_qty:  600, total_amount:  58923, indent: 1, is_group: false },
    ],
  },
};

const VALID_VIEWS = Object.keys(VIEWS);

export function GET(request) {
  const { searchParams } = new URL(request.url);
  const view = searchParams.get('view');

  if (!view || !VIEWS[view]) {
    return NextResponse.json(
      { error: `Unknown view "${view ?? ''}". Valid views: ${VALID_VIEWS.join(', ')}` },
      { status: 400 }
    );
  }

  const { columns, result } = VIEWS[view];
  return NextResponse.json({
    data: {
      customReport: {
        report_meta: [{ columns }],
        totalCount:  result.length,
        edges:       result.map(node => ({ node })),
        pageInfo:    { hasNextPage: false, hasPreviousPage: false, startCursor: null, endCursor: null },
      },
    },
  });
}
