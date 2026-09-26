/* A seeded approver's queue, shaped exactly like the SecondaryApproval
 * query's nodes (see ../README.md), so the mock path runs the same
 * normalisation as live.
 *
 * The viewer is an ABM with three BEs under them for July: two waiting on
 * them, one already approved — and June's approved figures for the first, an
 * earlier month for the month switcher to leave alone. Plus the ABM's own seat,
 * waiting on their RBM: the Self card. */

export const MOCK_VIEWER = 'nandhakumar.abm@elbrit.org';
export const MOCK_TODAY = '2026-08-07';

const RBM = 'senthil.rbm@elbrit.org';

const PRODUCTS = [
  ['BRITORVA 10', 47.3],
  ['BRITORVA 20', 78.1],
  ['CILACAR 10', 61.2],
  ['CILACAR T', 89.4],
  ['DOLOKIND PLUS', 32.5],
  ['GLIMY M2', 54.8],
  ['METOCARD XL 50', 71.6],
  ['PANTOCID DSR', 96.2],
];

const STOCKISTS = [
  ['Lotus Pharma Agencies', 'EBS207', 'HQ-Erode'],
  ['Sri Medical Distributors', 'EBS002', 'HQ-Erode'],
  ['Karpagam Agencies', 'EBS001', 'HQ-Erode'],
  ['PSG Distributors', 'EBS118', 'HQ-Erode'],
  ['Annai Pharma', 'EBS301', 'HQ-Erode'],
  ['Shalimar Agencies', 'EBS045', 'HQ-Salem'],
  ['Srree Senthil Agencies', 'EBS046', 'HQ-Salem'],
  ['Purani Hospital Supplies', 'EBS077', 'HQ-Salem'],
  ['Vel Medicals', 'EBS090', 'HQ-Salem'],
];

/* Deterministic "random" so every reset is the same fixture. */
function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function trackerRow({ stockist, seat, user, userName, month, state, nextApprover, modifiedBy, rand, scale = 1 }) {
  const [name, ebs, hq] = stockist;
  const date = `${month}-01`;
  const entryName = `${name}-${date}`;
  const items = PRODUCTS.slice(0, 4 + Math.floor(rand() * 4)).map(([item, rate]) => {
    const salesQty = Math.round((20 + rand() * 180) * scale);
    const closingQty = Math.round(salesQty * (0.4 + rand()));
    return {
      item__name: item,
      item: { brand__name: item.split(' ')[0], item_name: item },
      sales_qty: salesQty,
      sales_value: Math.round(salesQty * rate * 100) / 100,
      closing_qty: closingQty,
      closing_balance: Math.round(closingQty * rate * 100) / 100,
      rate: 0,
      custom_role_profile__name: seat,
    };
  });
  /* Another seat's lines on the same entry — must not count here. */
  items.push({ item__name: 'CILACAR 10', sales_qty: 999, sales_value: 61138.8, closing_qty: 0, closing_balance: 0, rate: 0, custom_role_profile__name: 'BE9-OTHER-CO-XXX' });
  const own = items.filter((i) => i.custom_role_profile__name === seat);
  return {
    name: `Secondary Data Entry-${entryName}-${seat}`,
    role_profile__name: seat,
    workflow_state__name: state,
    next_role__name: state.endsWith('Approval Waiting') ? state.split(' ')[0] : null,
    next_approver__name: nextApprover,
    custom_fallback_approver__name: null,
    user: { name: user, full_name: userName },
    modified_by__name: modifiedBy ?? 'baranidharan@elbrit.org',
    modified: `2026-08-0${1 + Math.floor(rand() * 5)} 10:00:00`,
    hq__name: hq,
    data: Math.round(own.reduce((n, i) => n + i.sales_value, 0) * 100) / 100,
    reason_for_rejection: null,
    custom_ref_secondary_data_entry: {
      name: entryName,
      date,
      distributor__name: name,
      distributor: { whg_ebs_code: ebs, territory__name: hq },
      items,
    },
  };
}

export function buildMockRows() {
  const rand = seeded(7);
  const rows = [];
  const push = (list, opts) => list.forEach((s) => rows.push(trackerRow({ ...opts, stockist: s, rand })));

  const ravi = { seat: 'BE7-ELBR-CO-ERO', user: 'ravikumar1182.be@elbrit.org', userName: 'Ravikumar Vaithiyagoundar' };
  const vignesh = { seat: 'BE4-ELBR-CO-ERO', user: 'vignesh869.be@elbrit.org', userName: 'Vignesh Somasundaram' };
  const kamal = { seat: 'BE5-ELBR-CO-SAL', user: 'kamal978.be@elbrit.org', userName: 'Kamala Kannan' };
  const self = { seat: 'ABM2-ELBR-CO-ERO', user: MOCK_VIEWER, userName: 'Nandhakumar V' };

  push(STOCKISTS.slice(0, 5), { ...ravi, month: '2026-07', state: 'ABM Approval Waiting', nextApprover: MOCK_VIEWER });
  push(STOCKISTS.slice(0, 5), { ...ravi, month: '2026-06', state: 'Approved and Verified', nextApprover: null, modifiedBy: 'mis@elbrit.org', scale: 0.92 });
  push(STOCKISTS.slice(5, 8), { ...vignesh, month: '2026-07', state: 'ABM Approval Waiting', nextApprover: MOCK_VIEWER });
  push(STOCKISTS.slice(5, 9), { ...kamal, month: '2026-07', state: 'ABM Approved and Waiting for Verification', nextApprover: null, modifiedBy: MOCK_VIEWER });
  push(STOCKISTS.slice(0, 2), { ...self, month: '2026-07', state: 'RBM Approval Waiting', nextApprover: RBM });
  return rows;
}
