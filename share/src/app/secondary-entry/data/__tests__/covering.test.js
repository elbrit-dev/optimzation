import { describe, expect, it } from 'vitest';
import { mergeCovered } from '../useServerEntries';
import { coveringLabel, normalizeEntry, ownLines } from '../shape';
import { normalizeSlice } from '@/app/secondary-approval/data/shape';

/* A vacant seat's stockists in its covering manager's own list. */
const line = (seat, item, qty = 0) => ({ name: `${item}-${seat}`, item__name: item, sales_qty: qty, closing_qty: 0, custom_status: 'Draft', custom_role_profile__name: seat });
const own = { seat: 'ABM2-X', covers: [{ seat: 'BE8-X', holder: 'Vacant_Cheyesu (E01179)' }], entries: [], products: [{ name: 'A' }] };
const covered = [{ cover: own.covers[0], data: { seat: 'BE8-X', entries: [{ name: 'Acme-2026-09-01', distributor__name: 'Acme', date: '2026-09-01', items: [line('BE8-X', 'A', 3)], custom_status_tracker: [] }], products: [{ name: 'A' }, { name: 'B' }] } }];

describe('mergeCovered', () => {
  it("adds a covered seat's rows, marked, with a unique name and the real one kept", () => {
    const m = mergeCovered(own, covered);
    expect(m.entries).toHaveLength(1);
    expect(m.entries[0]).toMatchObject({ name: 'Acme-2026-09-01::BE8-X', docName: 'Acme-2026-09-01', covering: { seat: 'BE8-X', holder: 'Vacant_Cheyesu (E01179)' } });
    expect(m.products.map((p) => p.name)).toEqual(['A', 'B']);
    expect(m.seat).toBe('ABM2-X');
  });
  it('leaves the data alone when nothing is covered', () => {
    expect(mergeCovered(own, [])).toBe(own);
  });
  it("adds an extra user's team member's rows as theirs, labelled For, and their parties to Add", () => {
    const team = [{ cover: { seat: 'BE9-X', holder: 'Saravanan M', hq: 'HQ-Chennai', team: true }, data: { seat: 'BE9-X', entries: [{ name: 'Zed-2026-09-01', distributor__name: 'Zed', date: '2026-09-01', items: [line('BE9-X', 'A', 1)], custom_status_tracker: [] }], products: [{ name: 'A' }], addable: [{ name: 'New Co', customer_name: 'New Co' }] } }];
    const m = mergeCovered({ ...own, addable: [] }, team);
    expect(m.entries[0]).toMatchObject({ name: 'Zed-2026-09-01::BE9-X', covering: { seat: 'BE9-X', team: true } });
    expect(coveringLabel(m.entries[0].covering)).toBe('For Saravanan M · HQ-Chennai');
    expect(m.addable).toEqual([{ name: 'New Co::BE9-X', customer_name: 'New Co', code: 'New Co', seat: 'BE9-X', note: 'For Saravanan M · HQ-Chennai' }]);
    expect(normalizeEntry(m.entries[0], 'RBM-X').seat).toBe('BE9-X');
  });
});

describe('normalizeEntry on a covered row', () => {
  it("shows the covered seat's lines, and saves to the real record as that seat", () => {
    const [row] = mergeCovered(own, covered).entries;
    const e = normalizeEntry(row, 'ABM2-X');
    expect(e).toMatchObject({ name: 'Acme-2026-09-01::BE8-X', docName: 'Acme-2026-09-01', seat: 'BE8-X', status: 'draft' });
    expect(e.lines.map((l) => l.item)).toEqual(['A']);
    expect(e.covering.seat).toBe('BE8-X');
  });
  it("keeps an own row as the screen's seat", () => {
    const e = normalizeEntry({ name: 'Own-2026-09-01', distributor__name: 'Own', items: [line('ABM2-X', 'A')], custom_status_tracker: [] }, 'ABM2-X');
    expect(e).toMatchObject({ docName: 'Own-2026-09-01', seat: 'ABM2-X', covering: null });
  });
  it("reads a submitted covered seat's status off the approval the server sends as that seat's", () => {
    /* The ERP raises the vacant seat's approval on its covering manager's
       seat; the entry script sends that row relabelled as the covered seat. */
    const [row] = mergeCovered(own, [{ ...covered[0], data: { ...covered[0].data, entries: [{
      ...covered[0].data.entries[0],
      items: [{ ...line('BE8-X', 'A', 3), custom_status: 'Submitted' }],
      custom_status_tracker: [{ role_profile__name: 'BE8-X', status__name: 'RBM Approval Waiting', tracker: { workflow_state__name: 'RBM Approval Waiting' } }],
    }] } }]).entries;
    expect(normalizeEntry(row, 'ABM2-X').status).toBe('pending');
  });
});

describe('ownLines — a whole record as the server script sends it', () => {
  const doc = { name: 'S-1', items: [line('BE1', 'A', 1), line('BE2', 'B', 2), line('BE2', 'C', 3)] };
  it("keeps the seat's lines and names the others' products", () => {
    const [r] = ownLines([doc], 'BE1');
    expect(r.items.map((l) => l.item__name)).toEqual(['A']);
    expect(r.other_items).toEqual(['B', 'C']);
  });
  it("trims a covered row to the seat it covers", () => {
    const [r] = ownLines([{ ...doc, covering: { seat: 'BE2' } }], 'ABM-X');
    expect(r.items.map((l) => l.item__name)).toEqual(['B', 'C']);
  });
});

describe('coveringLabel', () => {
  it('names the placeholder without its prefix, else the seat', () => {
    expect(coveringLabel({ seat: 'BE8-X', holder: 'Vacant_Cheyesu (E01179)' })).toBe('Covering Vacant - Cheyesu (E01179)');
    expect(coveringLabel({ seat: 'BE8-X', holder: 'Vacant Cheyesu' })).toBe('Covering Vacant - Cheyesu');
    expect(coveringLabel({ seat: 'BE2-CND', holder: null })).toBe('Covering Vacant - BE2-CND');
  });
});

describe("an approval carrying a covered seat's lines", () => {
  it("shows the manager's own lines and the vacant seat's, the latter marked", () => {
    const s = normalizeSlice({
      name: 'Secondary Data Entry-Acme-2026-09-01-ABM2-X',
      role_profile__name: 'ABM2-X',
      workflow_state__name: 'RBM Approval Waiting',
      custom_ref_secondary_data_entry: {
        name: 'Acme-2026-09-01',
        date: '2026-09-01',
        items: [
          { item__name: 'A', sales_qty: 2, custom_role_profile__name: 'ABM2-X' },
          { item__name: 'B', sales_qty: 3, custom_role_profile__name: 'BE8-X', covering: { seat: 'BE8-X', holder: 'Vacant_Cheyesu' } },
          { item__name: 'C', sales_qty: 9, custom_role_profile__name: 'BE1-Y' },
        ],
      },
    });
    expect(s.lines.map((l) => [l.item, l.covering?.seat ?? null])).toEqual([['A', null], ['B', 'BE8-X']]);
    expect(s.salesQty).toBe(5);
  });
});

describe('fetchServerEntries checks the answer against the question', () => {
  const answer = (seat) => ({ ok: true, json: async () => ({ message: { seat, month: '2026-09', entries: [] } }) });
  it("asks again when the ERP hands back another seat's answer", async () => {
    const { fetchServerEntries } = await import('../useServerEntries');
    const replies = [answer('BE9-X'), answer('BE11-X')];
    const fetchImpl = async () => replies.shift();
    const m = await fetchServerEntries({ endpointUrl: 'https://erp.test/api/method/graphql', token: 'k:s', month: '2026-09', seat: 'BE11-X', fetchImpl, wait: async () => {} });
    expect(m.seat).toBe('BE11-X');
  });
  it('gives up with an error, never a wrong list', async () => {
    const { fetchServerEntries } = await import('../useServerEntries');
    const fetchImpl = async () => answer('BE9-X');
    await expect(fetchServerEntries({ endpointUrl: 'https://erp.test/api/method/graphql', token: 'k:s', month: '2026-09', seat: 'BE11-X', fetchImpl, wait: async () => {} })).rejects.toThrow(/BE9-X/);
  });
});

describe('an extra user\'s team seat whose holder left', () => {
  it('is named by the seat, vacant', () => {
    expect(coveringLabel({ seat: 'BE11-X', holder: null, hq: 'HQ-Chennai', team: true })).toBe('For BE11-X · vacant · HQ-Chennai');
  });
});
