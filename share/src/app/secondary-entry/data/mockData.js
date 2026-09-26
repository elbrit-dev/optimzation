/* Deterministic fixture for the dev harness and tests. Shaped like the live
 * `SecondaryEntry` GraphQL nodes (link fields as `__name` scalars), so the
 * mock path exercises the same normaliser as the live one.
 *
 * 20 stockists for July 2026, keyed in during August: 6 submitted and
 * approved, 14 still in Draft with closing stock only. Two stockists also
 * carry another seat's lines — the screen must ignore them for "my" totals
 * and must hand them back untouched on save. */

export const MOCK_ROLE_PROFILE = 'BE7-VASC-CO-NAG';
const OTHER_SEAT = 'BE8-ELBR-RA-JOD';
const DATE = '2026-07-01';

/* Shaped like the `Items` query: brand__name + MRP / PTR / PTS, several
   variants per brand so the picker's product cards have pills to show. */
export const MOCK_PRODUCTS = [
  { item_code: 'Elbrit-CV', item_name: 'Elbrit-CV', brand__name: 'Elbrit', custom_pack: '10×10', custom_last_mrp: 640, custom_last_ptr: 540, custom_last_pts: 485 },
  { item_code: 'Elbrit-D3', item_name: 'Elbrit-D3', brand__name: 'Elbrit', custom_pack: '60K sachet', custom_last_mrp: 156, custom_last_ptr: 131, custom_last_pts: 118 },
  { item_code: 'Elbrit-CV Forte', item_name: 'Elbrit-CV Forte', brand__name: 'Elbrit', custom_pack: '10×10', custom_last_mrp: 790, custom_last_ptr: 668, custom_last_pts: 601 },
  { item_code: 'Rabelbrit', item_name: 'Rabelbrit', brand__name: 'Rabelbrit', custom_pack: '10×15', custom_last_mrp: 425, custom_last_ptr: 358, custom_last_pts: 322 },
  { item_code: 'Rabelbrit DSR', item_name: 'Rabelbrit DSR', brand__name: 'Rabelbrit', custom_pack: '10×10', custom_last_mrp: 512, custom_last_ptr: 432, custom_last_pts: 389 },
  { item_code: 'Telbrit 40', item_name: 'Telbrit 40', brand__name: 'Telbrit', custom_pack: '10×10', custom_last_mrp: 126, custom_last_ptr: 107, custom_last_pts: 96 },
  { item_code: 'Telbrit 80', item_name: 'Telbrit 80', brand__name: 'Telbrit', custom_pack: '10×10', custom_last_mrp: 218, custom_last_ptr: 184, custom_last_pts: 166 },
  { item_code: 'Telbrit 20', item_name: 'Telbrit 20', brand__name: 'Telbrit', custom_pack: '10×10', custom_last_mrp: 74, custom_last_ptr: 63, custom_last_pts: 57 },
  { item_code: 'Rozula 10', item_name: 'Rozula 10', brand__name: 'Rozula', custom_pack: '10×10', custom_last_mrp: 77, custom_last_ptr: 65, custom_last_pts: 58 },
  { item_code: 'Rozula 20', item_name: 'Rozula 20', brand__name: 'Rozula', custom_pack: '10×10', custom_last_mrp: 138, custom_last_ptr: 117, custom_last_pts: 105 },
  { item_code: 'Rozula CV 10', item_name: 'Rozula CV 10', brand__name: 'Rozula', custom_pack: '10×10', custom_last_mrp: 152, custom_last_ptr: 128, custom_last_pts: 115 },
];

const STOCKISTS = [
  'Lotus Pharma Agencies',
  'Sri Medical Distributors',
  'Karpagam Agencies',
  'PSG Distributors',
  'Annai Medicals',
  'Velan Distributors',
  'Kaveri Pharma',
  'Meenakshi Agencies',
  'Sakthi Medical Stores',
  'Thirumala Distributors',
  'Vetri Pharma',
  'Guru Medical Agencies',
  'Bharani Distributors',
  'Selvam Pharma',
  'Arun Medicals',
  'Nila Agencies',
  'Kumaran Pharma',
  'Senthil Distributors',
  'Ganga Medical Agencies',
  'Palepu Pharma Distributors Private Limited Tambaram',
];

const HQS = ['HQ-Nagercoil', 'HQ-Tirunelveli', 'HQ-Madurai', 'HQ-Thoothukudi'];

/* The first six (A–P in the design) are approved. */
const APPROVED = new Set(STOCKISTS.slice(0, 4).concat(['Kaveri Pharma', 'Guru Medical Agencies']));

/* Seeded LCG — two builds produce identical rows, so screenshots compare. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function line(rand, product, seat, idx, { withSales, status }) {
  const pts = product.custom_last_pts;
  const salesQty = withSales ? 40 + Math.floor(rand() * 260) : 0;
  const closingQty = 5 + Math.floor(rand() * 60);
  return {
    name: `row-${seat}-${idx}`,
    item__name: product.item_code,
    custom_pack: product.custom_pack,
    custom_last_pts: pts,
    rate: pts,
    sales_qty: salesQty,
    sales_value: salesQty * pts,
    closing_qty: closingQty,
    closing_balance: closingQty * pts,
    custom_status: status,
    custom_role_profile__name: seat,
    custom_hq__name: seat === MOCK_ROLE_PROFILE ? 'HQ-Nagercoil' : 'HQ-Jodhpur',
  };
}

export function buildMockRows() {
  const rand = rng(20260701);
  return STOCKISTS.map((stockist, i) => {
    const approved = APPROVED.has(stockist);
    const name = `${stockist}-${DATE}`;
    const count = 1 + (i % 3);
    const items = MOCK_PRODUCTS.slice(0, count).map((p, j) =>
      line(rand, p, MOCK_ROLE_PROFILE, `${i}-${j}`, {
        withSales: approved,
        status: approved ? 'Submitted' : 'Draft',
      }),
    );
    const trackers = approved
      ? [{ role_profile__name: MOCK_ROLE_PROFILE, status__name: 'Approved and Verified', tracker__name: `Secondary Data Entry-${name}-${MOCK_ROLE_PROFILE}` }]
      : [];
    if (i === 1 || i === 7) {
      items.push(line(rand, MOCK_PRODUCTS[3], OTHER_SEAT, `${i}-x`, { withSales: true, status: 'Submitted' }));
      trackers.push({ role_profile__name: OTHER_SEAT, status__name: 'ABM Approval Waiting', tracker__name: `Secondary Data Entry-${name}-${OTHER_SEAT}` });
    }
    return {
      name,
      /* GraphQL object form, as the live query returns it when it selects
         distributor { customer_name whg_ebs_code territory__name }. */
      distributor: {
        name: stockist,
        customer_name: stockist,
        whg_ebs_code: `EBS${String(501 + i * 7).padStart(3, '0')}`,
        /* The three shapes live ERP has: empty, a repeat of the primary, and
           a real comma-separated list. */
        whg_other_ebs_codes: i % 5 === 0 ? `EBS${String(101 + i).padStart(3, '0')}, EBS0${20 + i}` : i % 5 === 1 ? `EBS${String(501 + i * 7).padStart(3, '0')}` : null,
        territory__name: HQS[i % HQS.length],
      },
      distributor__name: stockist,
      date: DATE,
      workflow_state: approved ? 'Approved and Verified' : 'Draft',
      items,
      custom_status_tracker: trackers,
    };
  });
}
