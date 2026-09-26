import { describe, expect, it, vi } from 'vitest';
import { bucketFromText, missingFields, normalizeEntries, normalizeEntry, normalizeProducts, parseEbsCodes, revisitReason } from '../shape';
import { canSubmit, countByStatus, productGroups, progress, statusMatrix, submitBlocker } from '../selectors';
import { applySeatLines, createErpWriter, erpErrorMessage } from '../writes';
import { buildSheet, buildSheetRows, parseSheet } from '../csv';
import { MOCK_PRODUCTS, MOCK_ROLE_PROFILE, buildMockRows } from '../mockData';

const ME = 'BE7-VASC-CO-NAG';
const OTHER = 'BE8-ELBR-RA-JOD';

/* The live REST shape (frappe.client.get): links as bare names. */
function restDoc() {
  return {
    name: 'Bindal Medicals-2026-07-01',
    modified: '2026-08-22 14:35:30.807968',
    distributor: 'Bindal Medicals',
    date: '2026-07-01',
    workflow_state: 'ABM Approval Waiting',
    items: [
      { name: 'a1', item: 'Elbrit-CV', custom_role_profile: ME, custom_hq: 'HQ-Nagercoil', custom_department: 'Vasco', custom_status: 'Draft', rate: 0, sales_qty: 0, closing_qty: 4, sales_value: 0, closing_balance: 1940 },
      { name: 'b1', item: 'Telbrit 40', custom_role_profile: OTHER, custom_status: 'Submitted', rate: 96, sales_qty: 10, closing_qty: 2, sales_value: 960, closing_balance: 192 },
    ],
    custom_status_tracker: [{ name: 't1', role_profile: OTHER, status: 'ABM Approval Waiting', tracker: `Secondary Data Entry-Bindal Medicals-2026-07-01-${OTHER}` }],
    custom_item_log: [{ name: 'log1', note: 'kept' }],
  };
}

describe('status is per seat, never the document workflow_state', () => {
  it('a seat with Draft lines is draft even when the document says Approval Waiting', () => {
    expect(normalizeEntry(restDoc(), ME).status).toBe('draft');
  });

  it("another seat's tracker row gives that seat its own status", () => {
    const e = normalizeEntry(restDoc(), OTHER);
    expect(e.status).toBe('pending');
    expect(e.salesQty).toBe(10);
  });

  it('only counts the seat’s own lines', () => {
    const e = normalizeEntry(restDoc(), ME);
    expect(e.lines).toHaveLength(1);
    expect(e.closingValue).toBe(1940);
    /* rate 0 on the line, so price comes from value ÷ qty */
    expect(e.lines[0].price).toBe(485);
  });

  it('reads line status case-blind: GraphQL says DRAFT, REST says Draft', () => {
    const gql = {
      ...restDoc(),
      items: [{ name: 'a1', item__name: 'Elbrit-CV', custom_role_profile__name: ME, custom_status: 'DRAFT', closing_qty: 4 }],
      custom_status_tracker: [{ role_profile__name: ME, status__name: 'ABM Approval Waiting' }],
    };
    /* a Draft line means not sent, even though a tracker row exists */
    expect(normalizeEntry(gql, ME).status).toBe('draft');
    gql.items[0].custom_status = 'SUBMITTED';
    expect(normalizeEntry(gql, ME).status).toBe('pending');
  });

  it('"Approval Waiting" is pending, not approved', () => {
    expect(bucketFromText('ABM Approval Waiting')).toBe('pending');
    expect(bucketFromText('Approved and Verified')).toBe('approved');
    expect(bucketFromText('ABM Approved and Waiting for Verification')).toBe('approved');
    expect(bucketFromText('Partially Rejected')).toBe('rejected');
    expect(bucketFromText('Draft')).toBe('draft');
  });
});

describe('stockist identity', () => {
  it('reads EBS code and HQ off the Customer object when the query selects it', () => {
    const row = { ...restDoc(), distributor: { customer_name: 'Bindal Medicals', whg_ebs_code: 'EBS501', territory__name: 'HQ-Jaipur' } };
    expect(normalizeEntry(row, ME)).toMatchObject({ stockist: 'Bindal Medicals', ebsCode: 'EBS501', hq: 'HQ-Jaipur' });
  });

  it('parses other EBS codes the way live Customer data has them', () => {
    expect(parseEbsCodes('EBS220', 'EBS101, EBS020')).toEqual({ primary: 'EBS220', others: ['EBS101', 'EBS020'] });
    /* the common case: "others" is just the primary again */
    expect(parseEbsCodes('EBS756', 'EBS756')).toEqual({ primary: 'EBS756', others: [] });
    /* a dirty primary keeps only its code */
    expect(parseEbsCodes('E01156-Aravind Cheemalapenta', 'E01156')).toEqual({ primary: 'E01156', others: [] });
    expect(parseEbsCodes(null, 'EBS1, EBS2')).toEqual({ primary: 'EBS1', others: ['EBS2'] });
    expect(parseEbsCodes('', '')).toEqual({ primary: null, others: [] });
  });

  it("falls back to the seat's own line for the HQ, and to no code", () => {
    expect(normalizeEntry(restDoc(), ME)).toMatchObject({ stockist: 'Bindal Medicals', ebsCode: null, hq: 'HQ-Nagercoil' });
  });
});

describe('the mock fixture', () => {
  const entries = normalizeEntries(buildMockRows(), MOCK_ROLE_PROFILE);

  it('matches the design: 20 stockists, 6 approved, 14 draft', () => {
    expect(countByStatus(entries)).toMatchObject({ all: 20, approved: 6, draft: 14, pending: 0 });
    expect(progress(entries)).toEqual({ entered: 6, total: 20, remaining: 14 });
  });

  it('keeps drafts at zero sales in the status grid', () => {
    expect(statusMatrix(entries).draft.sales.qty).toBe(0);
    expect(statusMatrix(entries).draft.closing.qty).toBeGreaterThan(0);
  });

  it('has every field the live query must select', () => {
    expect(missingFields(buildMockRows())).toEqual([]);
  });
});

describe('applySeatLines — the save payload', () => {
  it("never touches another seat's lines, the tracker or other tables", () => {
    const doc = restDoc();
    const next = applySeatLines(doc, { roleProfile: ME, lines: [{ item: 'Elbrit-CV', price: 485, salesQty: 12, closingQty: 3 }], submit: false });
    expect(next.items[1]).toBe(doc.items[1]);
    expect(next.custom_status_tracker).toBe(doc.custom_status_tracker);
    expect(next.custom_item_log).toBe(doc.custom_item_log);
    expect(next.modified).toBe(doc.modified);
  });

  it('computes values as qty × PTS, which the server sums into the totals', () => {
    const next = applySeatLines(restDoc(), { roleProfile: ME, lines: [{ item: 'Elbrit-CV', price: 485, salesQty: 12, closingQty: 3 }], submit: false });
    expect(next.items[0]).toMatchObject({ sales_qty: 12, sales_value: 5820, closing_qty: 3, closing_balance: 1455, custom_status: 'Draft', name: 'a1' });
  });

  it('submit moves every one of the seat’s lines out of Draft', () => {
    const next = applySeatLines(restDoc(), { roleProfile: ME, lines: [], submit: true });
    expect(next.items[0].custom_status).toBe('Submitted');
  });

  it('appends a new product as this seat’s line, copying its HQ and department', () => {
    const next = applySeatLines(restDoc(), { roleProfile: ME, lines: [{ item: 'Rabelbrit', price: 322, salesQty: 5, closingQty: 1 }], submit: false });
    const added = next.items.at(-1);
    expect(added).toMatchObject({ item: 'Rabelbrit', custom_role_profile: ME, custom_hq: 'HQ-Nagercoil', custom_department: 'Vasco', sales_value: 1610, doctype: 'Secondary Data Table' });
    expect(added.name).toBeUndefined();
  });

  it('refuses to write without a seat', () => {
    expect(() => applySeatLines(restDoc(), { roleProfile: null, lines: [], submit: false })).toThrow();
  });
});

describe('ERP error text', () => {
  it('turns a timestamp clash into a reload instruction', () => {
    expect(erpErrorMessage({ exc_type: 'TimestampMismatchError' }, 417)).toMatch(/Reload/);
  });

  it('digs the sentence out of _server_messages', () => {
    const json = { _server_messages: JSON.stringify([JSON.stringify({ message: 'Not permitted <b>here</b>' })]) };
    expect(erpErrorMessage(json, 403)).toBe('Not permitted here');
  });
});

describe('bulk sheet', () => {
  it('round-trips the Entry key and quantities, including commas in names', () => {
    const entries = [{ name: 'Sri, Medical-2026-07-01', stockist: 'Sri, Medical', lines: [{ item: 'Elbrit-CV', salesQty: 0, closingQty: 0 }] }];
    const csv = buildSheet(entries).replace('Elbrit-CV,,', 'Elbrit-CV,40,7');
    const { byEntry, errors } = parseSheet(csv);
    expect(errors).toEqual([]);
    expect(byEntry.get('Sri, Medical-2026-07-01')).toEqual([{ item: 'Elbrit-CV', salesQty: 40, closingQty: 7 }]);
  });

  it('skips blank rows and rejects bad numbers', () => {
    const csv = 'Entry,Stockist,Product,Sales Qty,Closing Qty\r\nE1,S,P,,\r\nE2,S,P,-3,1';
    const { byEntry, errors } = parseSheet(csv);
    expect(byEntry.size).toBe(0);
    expect(errors).toHaveLength(1);
  });

  it('reports missing columns', () => {
    expect(parseSheet('a,b\r\n1,2').errors[0]).toMatch(/Missing columns/);
  });
});


describe('bulk send eligibility', () => {
  const base = { lines: [{ salesQty: 0, closingQty: 4 }] };
  it('sends drafts and rejections that have something filled', () => {
    expect(canSubmit({ ...base, status: 'draft' })).toBe(true);
    expect(canSubmit({ ...base, status: 'rejected' })).toBe(true);
    expect(submitBlocker({ ...base, status: 'draft' })).toBeNull();
  });

  it('refuses what is already sent, and blank entries', () => {
    expect(submitBlocker({ ...base, status: 'pending' })).toBe('Already with approvers');
    expect(submitBlocker({ ...base, status: 'approved' })).toBe('Already approved');
    expect(submitBlocker({ status: 'draft', lines: [{ salesQty: 0, closingQty: 0 }] })).toBe('Nothing filled yet');
    expect(canSubmit({ status: 'draft', lines: [] })).toBe(false);
  });

  it('the mock month has 14 sendable drafts', () => {
    expect(normalizeEntries(buildMockRows(), MOCK_ROLE_PROFILE).filter(canSubmit)).toHaveLength(14);
  });
});

describe('product picker groups', () => {
  const products = normalizeProducts(MOCK_PRODUCTS);

  it('groups variants under their brand, brands sorted', () => {
    const groups = productGroups(products);
    expect(groups.map((g) => g.brand)).toEqual(['Elbrit', 'Rabelbrit', 'Rozula', 'Telbrit']);
    expect(groups.find((g) => g.brand === 'Telbrit').items).toHaveLength(3);
  });

  it('searches brand and item, and filters added / not added', () => {
    expect(productGroups(products, { query: 'dsr' }).map((g) => g.brand)).toEqual(['Rabelbrit']);
    const added = new Set(['Elbrit-CV', 'Elbrit-D3']);
    expect(productGroups(products, { filter: 'added', added }).flatMap((g) => g.items.map((i) => i.item))).toEqual(['Elbrit-CV', 'Elbrit-D3']);
    expect(productGroups(products, { filter: 'notAdded', added }).find((g) => g.brand === 'Elbrit').items.map((i) => i.item)).toEqual(['Elbrit-CV Forte']);
  });

  it('keeps the Items row for the card’s price row', () => {
    expect(products.find((p) => p.item === 'Rozula 20').row.custom_last_mrp).toBe(138);
  });
});

describe('Items query', () => {
  it('accepts a keyed pipeline result and de-duplicates', () => {
    const out = normalizeProducts({ items: [{ item_code: 'B', item_name: 'B', custom_last_pts: 2 }, { item_code: 'A', item_name: 'A' }, { item_code: 'A' }] });
    expect(out.map((p) => p.item)).toEqual(['A', 'B']);
    expect(out[1].price).toBe(2);
  });
});

describe('entries are the ERP\'s; totals are the seat\'s', () => {
  const row = (name, seats) => ({
    name: `${name}-2026-09-01`,
    date: '2026-09-01',
    distributor__name: name,
    items: seats.map((rp) => ({ item__name: 'BRITORVA 10', sales_qty: 0, closing_qty: 0, custom_status: 'Draft', custom_role_profile__name: rp })),
    custom_status_tracker: [],
  });
  const rows = [row('Mine', ['BE7-A']), row('Shared', ['BE4-B', 'BE7-A']), row('Someone else', ['BE4-B']), row('Empty', [])];

  it('keeps every entry the ERP sent, with only the seat\'s lines in each', () => {
    const entries = normalizeEntries(rows, 'BE7-A');
    expect(entries.map((e) => e.stockist)).toEqual(['Empty', 'Mine', 'Shared', 'Someone else']);
    expect(entries.map((e) => e.lines.length)).toEqual([0, 1, 1, 0]);
  });

  it('keeps an entry whose only link to the seat is its tracker row', () => {
    const tracked = { ...row('Tracked', ['BE4-B']), custom_status_tracker: [{ role_profile__name: 'BE7-A', status__name: 'ABM Approval Waiting' }] };
    expect(normalizeEntries([tracked], 'BE7-A').map((e) => e.stockist)).toEqual(['Tracked']);
  });

  it('keeps everything when no seat is set', () => {
    expect(normalizeEntries(rows, null)).toHaveLength(4);
  });
});

describe('saving when another seat saved first', () => {
  const clash = { ok: false, status: 417, json: async () => ({ exc_type: 'TimestampMismatchError' }) };
  const docJson = (modified) => ({ ok: true, status: 200, json: async () => ({ message: { name: 'E', modified, items: [{ item: 'X', custom_role_profile: 'BE4', sales_qty: 0 }, { item: 'Y', custom_role_profile: 'BE7', sales_qty: 9 }] } }) });
  const saved = { ok: true, status: 200, json: async () => ({ message: { name: 'E' } }) };
  const opts = { roleProfile: 'BE4', lines: [{ item: 'X', price: 10, salesQty: 3, closingQty: 1 }], submit: true };

  it('re-reads and retries once on a timestamp clash', async () => {
    const calls = [];
    global.fetch = vi.fn(async (url, init) => {
      calls.push(init?.method ?? 'GET');
      const n = calls.length;
      if (n === 1) return docJson('t1');
      if (n === 2) return clash;
      if (n === 3) return docJson('t2');
      return saved;
    });
    const w = createErpWriter({ endpointUrl: 'https://erp.example.com/api/method/graphql', gqlToken: 'k:s' });
    await expect(w.saveSeat('E', opts)).resolves.toEqual({ name: 'E' });
    expect(calls).toEqual(['GET', 'POST', 'GET', 'POST']);
    const body = JSON.parse(JSON.parse(global.fetch.mock.calls[3][1].body).doc);
    expect(body.modified).toBe('t2');
    expect(body.items.find((l) => l.item === 'Y').sales_qty).toBe(9);
  });

  it('gives up after a second clash in a row', async () => {
    let n = 0;
    global.fetch = vi.fn(async () => ((n += 1) % 2 ? docJson('t') : clash));
    const w = createErpWriter({ endpointUrl: 'https://erp.example.com/api/method/graphql', gqlToken: 'k:s' });
    await expect(w.saveSeat('E', opts)).rejects.toThrow(/Someone else saved/);
    expect(n).toBe(4);
  });
});

describe('sent back for revisit', () => {
  const row = (trackerState, note, lineStatus = 'SUBMITTED') => ({
    name: 'S-2026-09-01',
    date: '2026-09-01',
    distributor__name: 'S',
    items: [{ item__name: 'BRITORVA 10', sales_qty: 4, closing_qty: 2, custom_status: lineStatus, custom_role_profile__name: 'BE7-A' }],
    custom_status_tracker: [{ role_profile__name: 'BE7-A', status__name: trackerState, tracker: { workflow_state__name: trackerState, reason_for_rejection: note } }],
  });

  it('a waiting approval with a revisit note is the seat\'s to correct', () => {
    const e = normalizeEntry(row('ABM Approval Waiting', 'Revisit (from ABM Approval Waiting): Recheck closing.'), 'BE7-A');
    expect(e.status).toBe('revisit');
    expect(e.statusText).toBe('Recheck closing.');
    expect(canSubmit(e)).toBe(true);
  });

  it('the note is ignored once approved again, and without it it is plain pending', () => {
    expect(normalizeEntry(row('ABM Approved and Waiting for Verification', 'Revisit (from ABM Approval Waiting): x'), 'BE7-A').status).toBe('approved');
    expect(normalizeEntry(row('ABM Approval Waiting', null), 'BE7-A').status).toBe('pending');
  });

  it('parses the ERP note', () => {
    expect(revisitReason('Revisit (from ABM Approved and Waiting for Verification): Second look', 'ABM Approval Waiting')).toBe('Second look');
    expect(revisitReason('Wrong figures', 'ABM Approval Waiting')).toBeNull();
  });
});

describe('two BEs on one stockist carry different products', () => {
  const row = {
    name: 'S-2026-09-01',
    date: '2026-09-01',
    distributor__name: 'S',
    items: [
      { item__name: 'BRITORVA 10', custom_status: 'Draft', custom_role_profile__name: 'BE4' },
      { item__name: 'GLIMIBRIT M1', custom_status: 'Draft', custom_role_profile__name: 'BE7' },
      { item__name: 'GLIMIBRIT M2', custom_status: 'Draft', custom_role_profile__name: 'BE7' },
    ],
    custom_status_tracker: [],
  };

  it('knows which products the other seats carry', () => {
    const e = normalizeEntry(row, 'BE4');
    expect(e.lines.map((l) => l.item)).toEqual(['BRITORVA 10']);
    expect(e.otherItems).toEqual(['GLIMIBRIT M1', 'GLIMIBRIT M2']);
  });

  it('a seat with no lines yet is not offered them in the sheet', () => {
    const e = { ...normalizeEntry(row, 'BE9'), lines: [] };
    const rows = buildSheetRows([e], [{ item: 'BRITORVA 10' }, { item: 'GLIMIBRIT M1' }, { item: 'TENLITAB 20' }]);
    expect(rows.slice(1).map((r) => r[2])).toEqual(['TENLITAB 20']);
  });
});

describe('documents are the ERP\'s, lines are ours', () => {
  const mine = { name: 'E1', date: '2026-09-01', distributor__name: 'A', items: [{ item__name: 'X', custom_role_profile__name: 'BE4', custom_status: 'Draft' }] };
  const others = { name: 'E2', date: '2026-09-01', distributor__name: 'B', items: [{ item__name: 'Y', custom_role_profile__name: 'BE9', custom_status: 'Draft' }] };

  it('lists every entry the ERP sent — a permitted stockist with none of my lines yet too', () => {
    const entries = normalizeEntries([mine, others], 'BE4');
    expect(entries.map((e) => e.name)).toEqual(['E1', 'E2']);
    expect(entries[1].lines).toEqual([]);
    expect(entries[1].otherItems).toEqual(['Y']);
  });

  it('asks the ERP for the seat: the token user\'s active Employee role_id', async () => {
    const calls = [];
    const real = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url, init) => {
      calls.push([String(url).split('/api/method/')[1], init?.body ? JSON.parse(init.body) : null]);
      const message = String(url).includes('get_logged_user') ? 'be@x.org' : [{ role_id: 'BE4-ELBR-CO-ERO' }];
      return { ok: true, json: async () => ({ message }) };
    });
    try {
      const w = createErpWriter({ endpointUrl: 'https://erp.test/api/method/graphql', gqlToken: 'k:s' });
      expect(await w.whoAmI()).toEqual({ user: 'be@x.org', seat: 'BE4-ELBR-CO-ERO' });
      expect(calls[1][1]).toMatchObject({ doctype: 'Employee', filters: { user_id: 'be@x.org', status: 'Active' } });
    } finally {
      globalThis.fetch = real;
    }
  });
});
