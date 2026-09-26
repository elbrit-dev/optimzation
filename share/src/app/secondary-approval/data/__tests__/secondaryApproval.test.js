import { describe, expect, it, vi } from 'vitest';
import { bucketOfState, groupSubmissions, normalizeSlices, previousMonth, tierOf } from '../shape';
import {
  doneCount,
  scopeSubmissions,
} from '../selectors';
import { createDecisionWriter, createMockWriter, revisitNote } from '../writes';
import { MOCK_VIEWER, buildMockRows } from '../mockData';

describe('bucketOfState', () => {
  it.each([
    ['ABM Approval Waiting', 'pending'],
    ['RBM Approval Waiting', 'pending'],
    ['ABM Approved and Waiting for Verification', 'approved'],
    ['Approved and Verified', 'approved'],
    ['ABM Rejected', 'rejected'],
    ['RBM Approved and Verification Rejected', 'rejected'],
    ['', 'pending'],
  ])('%s → %s', (state, bucket) => expect(bucketOfState(state)).toBe(bucket));
});

describe('normalizeSlices', () => {
  const slices = normalizeSlices({ edges: buildMockRows().map((node) => ({ node })) });

  it('keeps only the seat’s own lines of a shared entry', () => {
    const s = slices[0];
    expect(s.lines.every((l) => l.item !== 'CILACAR 10' || l.salesQty !== 999)).toBe(true);
    expect(s.salesQty).toBe(s.lines.reduce((n, l) => n + l.salesQty, 0));
  });

  it('reads who, where and which month', () => {
    const s = slices[0];
    expect(s.stockist).toBe('Lotus Pharma Agencies');
    expect(s.month).toBe('2026-07');
    expect(s.tier).toBe('BE');
    expect(s.atRole).toBe('ABM');
    expect(s.nextApprover).toBe(MOCK_VIEWER);
    expect(s.raiserName).toBe('Ravikumar Vaithiyagoundar');
  });

  it('falls back to the tracker name when the entry link is missing', () => {
    const [s] = normalizeSlices([
      { name: 'Secondary Data Entry-Parm House-2026-07-01-BE3-AURA-CH-PON', role_profile__name: 'BE3-AURA-CH-PON', workflow_state__name: 'ABM Approval Waiting', data: 10 },
    ]);
    expect(s.stockist).toBe('Parm House');
    expect(s.month).toBe('2026-07');
    expect(s.value).toBe(10);
  });
});

describe('who decides — the ERP', () => {
  const rows = buildMockRows();
  const slices = normalizeSlices(rows);

  it('buttons are exactly what the writer says the ERP allows', () => {
    const [a, b] = slices.filter((s) => s.status === 'pending');
    const allowed = new Map([
      [a.name, { approve: true, revisit: true }],
      [b.name, { approve: false, revisit: false }],
    ]);
    const mine = groupSubmissions([a, b], { allowed }).flatMap((g) => g.mine);
    expect(mine).toContain(a.name);
    expect(mine).not.toContain(b.name);
    /* Not asked yet: nothing. */
    expect(groupSubmissions([a, b]).flatMap((g) => g.mine)).toEqual([]);
  });

  it('the mock writer plays the ERP: routed to me while waiting; approved by me until verified', async () => {
    const w = createMockWriter({ getRows: () => rows, setRows: () => {}, viewer: MOCK_VIEWER });
    const other = createMockWriter({ getRows: () => rows, setRows: () => {}, viewer: 'someone@elbrit.org' });
    const waiting = slices.find((s) => s.status === 'pending' && s.nextApprover === MOCK_VIEWER);
    const approvedByMe = slices.find((s) => s.raiser === 'kamal978.be@elbrit.org');
    const verified = slices.find((s) => s.state === 'Approved and Verified');
    const got = await w.actions([waiting.name, approvedByMe.name, verified.name]);
    expect(got.get(waiting.name)).toEqual({ approve: true, revisit: true });
    expect(got.get(approvedByMe.name)).toEqual({ approve: false, revisit: true });
    expect(got.get(verified.name)).toEqual({ approve: false, revisit: false });
    expect((await other.actions([waiting.name])).get(waiting.name)).toEqual({ approve: false, revisit: false });
  });
});

describe('scopeSubmissions', () => {
  const slices = normalizeSlices(buildMockRows());

  it('lists everything the ERP sent for the open month, waiting first, own last', () => {
    const { period, submissions } = scopeSubmissions(slices, MOCK_VIEWER);
    expect(period).toBe('2026-07');
    expect(submissions.map((g) => [g.raiserName.split(' ')[0], g.status, g.isSelf])).toEqual([
      ['Ravikumar', 'pending', false],
      ['Vignesh', 'pending', false],
      ['Kamala', 'approved', false],
      ['Nandhakumar', 'pending', true],
    ]);
    /* No actions until the ERP has been asked. */
    expect(submissions.every((g) => g.mine.length === 0)).toBe(true);
  });

  it('does not narrow what the ERP sent — what a user sees is the ERP permission answer', () => {
    const { submissions } = scopeSubmissions(slices, 'ravikumar1182.be@elbrit.org');
    expect(submissions).toHaveLength(4);
    expect(submissions.filter((g) => g.isSelf).map((g) => g.raiserName.split(' ')[0])).toEqual(['Ravikumar']);
  });

  it('done counts decided submissions', () => {
    const { submissions } = scopeSubmissions(slices, MOCK_VIEWER);
    expect(doneCount(submissions)).toEqual({ done: 1, total: 4, percent: 25 });
  });


  it('never picks a future-dated month on its own, but lists it', () => {
    const future = slices
      .filter((s) => s.raiser === 'vignesh869.be@elbrit.org')
      .slice(0, 1)
      .map((s) => ({ ...s, name: `${s.name}-future`, month: '2027-09', date: '2027-09-01' }));
    const all = [...slices, ...future];
    const picked = scopeSubmissions(all, MOCK_VIEWER, { today: '2026-08-07' });
    expect(picked.period).toBe('2026-07');
    expect(picked.workMonths.map((w) => w.month)).toEqual(['2026-07', '2027-09']);
    expect(scopeSubmissions(all, MOCK_VIEWER, { today: '2026-08-07', month: '2027-09' }).submissions).toHaveLength(1);
  });

  it('a split submission reads as partial', () => {
    const [a, b] = slices.filter((s) => s.raiser === 'kamal978.be@elbrit.org');
    const [g] = groupSubmissions([a, { ...b, status: 'rejected' }]);
    expect(g.status).toBe('partial');
  });
});

describe('writes', () => {
  /* A fake ERP keyed by URL: trackers by name, and a log of the calls. */
  function fakeErp(trackers, { approveTo = 'ABM Approved and Waiting for Verification' } = {}) {
    const calls = [];
    const fetchImpl = vi.fn(async (url, init) => {
      const u = new URL(url);
      const body = init?.body ? JSON.parse(init.body) : null;
      const ok = (message) => ({ ok: true, status: 200, json: async () => ({ message }) });
      if (u.pathname.endsWith('frappe.client.get')) {
        const name = u.searchParams.get('name');
        calls.push(['get', name]);
        return ok({ name, workflow_state: trackers[name] });
      }
      if (u.pathname.endsWith('apply_workflow')) {
        calls.push(['workflow', body.doc.name, body.action]);
        const from = trackers[body.doc.name];
        trackers[body.doc.name] = body.action === 'Revisit' ? 'ABM Approval Waiting' : approveTo ?? from;
        return ok({ name: body.doc.name, workflow_state: trackers[body.doc.name] });
      }
      if (u.pathname.endsWith('set_value')) {
        calls.push(['note', body.name, body.value]);
        return ok({ name: body.name });
      }
      throw new Error(`unexpected ${url}`);
    });
    const w = createDecisionWriter({ endpointUrl: 'https://erp.example.com/api/method/graphql', gqlToken: 'k:s', fetchImpl });
    return { w, calls, fetchImpl };
  }

  it('approves through the workflow\'s "Approve to Verification"', async () => {
    const { w, calls, fetchImpl } = fakeErp({ T1: 'ABM Approval Waiting' });
    expect(await w.decide([{ name: 'T1', action: 'approve' }])).toEqual([{ name: 'T1', ok: true, state: 'ABM Approved and Waiting for Verification', error: null }]);
    expect(calls).toEqual([['get', 'T1'], ['workflow', 'T1', 'Approve to Verification']]);
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe('token k:s');
  });

  it('revisits a WAITING item by storing the note, in the ERP\'s format', async () => {
    const { w, calls } = fakeErp({ T1: 'ABM Approval Waiting' });
    const [res] = await w.decide([{ name: 'T1', action: 'revisit', reason: ' Qty off ' }]);
    expect(res).toEqual({ name: 'T1', ok: true, state: 'ABM Approval Waiting', error: null });
    expect(calls).toEqual([['get', 'T1'], ['note', 'T1', 'Revisit (from ABM Approval Waiting): Qty off']]);
  });

  it('revisits an APPROVED item through the workflow\'s "Revisit", then the note', async () => {
    const { w, calls } = fakeErp({ T1: 'ABM Approved and Waiting for Verification' });
    const [res] = await w.decide([{ name: 'T1', action: 'revisit', reason: 'Second look' }]);
    expect(res.ok).toBe(true);
    expect(res.state).toBe('ABM Approval Waiting');
    expect(calls).toEqual([
      ['get', 'T1'],
      ['workflow', 'T1', 'Revisit'],
      ['note', 'T1', 'Revisit (from ABM Approved and Waiting for Verification): Second look'],
    ]);
  });

  it('checks the answer the ERP gives after a write', async () => {
    /* the RBM "Approve" step: accepted, state unchanged */
    const silent = fakeErp({ W: 'ABM Approval Waiting' }, { approveTo: 'ABM Approval Waiting' });
    const [noop] = await silent.w.decide([{ name: 'W', action: 'approve' }]);
    expect(noop.ok).toBe(false);
    expect(noop.error).toMatch(/did not approve/);

    /* Approve is left to the workflow; here it answers without reaching
       verification, and that answer is what is checked. */
    const { w, calls } = fakeErp({ A: 'ABM Approval Waiting', V: 'Approved and Verified', R: 'ABM Approval Waiting' }, { approveTo: null });
    const res = await w.decide([
      { name: 'A', action: 'approve' },
      { name: 'V', action: 'revisit', reason: 'x' },
      { name: 'R', action: 'revisit', reason: '  ' },
    ]);
    expect(res.map((x) => [x.name, x.ok])).toEqual([['A', false], ['V', false], ['R', false]]);
    expect(res[0].error).toMatch(/did not approve/);
    expect(res[1].error).toMatch(/Cannot revisit from state: Approved and Verified/);
    expect(res[2].error).toMatch(/reason is required/);
    expect(calls.filter((c) => c[0] === 'note')).toEqual([]);
  });

  it('one failure is reported against its stockist, the rest go through', async () => {
    const { w, fetchImpl } = fakeErp({ OK: 'ABM Approval Waiting', BAD: 'ABM Approval Waiting' });
    const real = fetchImpl.getMockImplementation();
    fetchImpl.mockImplementation(async (url, init) => {
      if (String(url).includes('apply_workflow') && JSON.parse(init.body).doc.name === 'BAD') {
        return { ok: false, status: 417, json: async () => ({ exc_type: 'WorkflowTransitionError', _server_messages: JSON.stringify([JSON.stringify({ message: 'Not a valid Workflow Action' })]) }) };
      }
      return real(url, init);
    });
    const res = await w.decide([{ name: 'OK', action: 'approve' }, { name: 'BAD', action: 'approve' }]);
    expect(res).toEqual([
      { name: 'OK', ok: true, state: 'ABM Approved and Waiting for Verification', error: null },
      { name: 'BAD', ok: false, state: null, error: 'Not a valid Workflow Action' },
    ]);
  });

  it('asks the ERP what may be done: Approve = "Approve to Verification", Revisit = "Revisit"', async () => {
    const offered = { W: ['Approve', 'Approve to Verification', 'Reject', 'Revisit'], U: ['Revisit'], R: ['Approve', 'Reject'] };
    const fetchImpl = vi.fn(async (url, init) => {
      const u = new URL(url);
      if (u.pathname.endsWith('frappe.client.get')) return { ok: true, json: async () => ({ message: { name: u.searchParams.get('name') } }) };
      if (u.pathname.endsWith('get_transitions')) {
        const { doc } = JSON.parse(init.body);
        return { ok: true, json: async () => ({ message: offered[doc.name].map((action) => ({ action })) }) };
      }
      throw new Error(url);
    });
    const w = createDecisionWriter({ endpointUrl: 'https://erp.example.com/api/method/graphql', gqlToken: 'k:s', fetchImpl });
    const got = await w.actions(['W', 'U', 'R']);
    expect(got.get('W')).toEqual({ approve: true, revisit: true });
    expect(got.get('U')).toEqual({ approve: false, revisit: true });
    /* An RBM on a tracker waiting on his ABM is offered only the step that
       changes nothing: no buttons. */
    expect(got.get('R')).toEqual({ approve: false, revisit: false });
  });

  it('writes the note the screens read back', () => {
    expect(revisitNote('ABM Approval Waiting', ' Recheck ')).toBe('Revisit (from ABM Approval Waiting): Recheck');
  });

  it('refuses without a token', async () => {
    const w = createDecisionWriter({ endpointUrl: 'https://erp.example.com/x', gqlToken: '' });
    await expect(w.decide([{ name: 'T', action: 'approve' }])).rejects.toThrow(/gqlToken/);
  });

  it('mock writer plays the method, refusals included', async () => {
    let rows = buildMockRows();
    const w = createMockWriter({ getRows: () => rows, setRows: (r) => (rows = r), viewer: MOCK_VIEWER });
    const waiting = rows.find((r) => r.workflow_state__name === 'ABM Approval Waiting');
    const done = rows.find((r) => r.workflow_state__name === 'Approved and Verified');
    const res = await w.decide([
      { name: waiting.name, action: 'approve' },
      { name: done.name, action: 'approve' },
    ]);
    expect(res.map((r) => r.ok)).toEqual([true, false]);
    const after = rows.find((r) => r.name === waiting.name);
    expect(after.workflow_state__name).toBe('ABM Approved and Waiting for Verification');
    expect(after.next_approver__name).toBeNull();
    expect(after.modified_by__name).toBe(MOCK_VIEWER);
  });
});


describe('revisit', () => {
  const slices = normalizeSlices(buildMockRows());

  it('reads a waiting revisit note, and ignores it once decided again', () => {
    const [waiting] = normalizeSlices([{ name: 'T', workflow_state__name: 'ABM Approval Waiting', reason_for_rejection: 'Revisit (from ABM Approval Waiting): Recheck closing.' }]);
    expect(waiting.revisitNote).toBe('Recheck closing.');
    const [approved] = normalizeSlices([{ name: 'T', workflow_state__name: 'ABM Approved and Waiting for Verification', reason_for_rejection: 'Revisit (from ABM Approval Waiting): Recheck closing.' }]);
    expect(approved.revisitNote).toBeNull();
    const [plain] = normalizeSlices([{ name: 'T', workflow_state__name: 'ABM Rejected', reason_for_rejection: 'Wrong figures' }]);
    expect(plain.revisitNote).toBeNull();
  });

  it('mock writer revisits waiting and approved-unverified, refuses the rest', async () => {
    let rows = buildMockRows();
    const w = createMockWriter({ getRows: () => rows, setRows: (r) => (rows = r), viewer: MOCK_VIEWER });
    const waiting = rows.find((r) => r.workflow_state__name === 'ABM Approval Waiting');
    const unverified = rows.find((r) => r.workflow_state__name === 'ABM Approved and Waiting for Verification');
    const verified = rows.find((r) => r.workflow_state__name === 'Approved and Verified');
    const noReason = await w.decide([{ name: waiting.name, action: 'revisit' }]);
    expect(noReason[0].ok).toBe(false);
    const res = await w.decide([
      { name: waiting.name, action: 'revisit', reason: 'Fix A' },
      { name: unverified.name, action: 'revisit', reason: 'Fix B' },
      { name: verified.name, action: 'revisit', reason: 'Fix C' },
    ]);
    const ok = Object.fromEntries(res.map((r) => [r.name, r.ok]));
    expect([ok[waiting.name], ok[unverified.name], ok[verified.name]]).toEqual([true, true, false]);
    const back = normalizeSlices(rows).find((s) => s.name === unverified.name);
    expect(back.status).toBe('pending');
    expect(back.revisitNote).toBe('Fix B');
    expect(back.nextApprover).toBe(MOCK_VIEWER);
  });
});

describe('items inside a stockist', () => {
  it('are only the lines with the tracker\'s role profile', () => {
    const [s] = normalizeSlices([
      {
        name: 'Secondary Data Entry-A-2026-09-01-BE4-X',
        role_profile__name: 'BE4-X',
        workflow_state__name: 'ABM Approval Waiting',
        custom_ref_secondary_data_entry: {
          name: 'A-2026-09-01',
          date: '2026-09-01',
          items: [
            { item__name: 'MINE', custom_role_profile__name: 'BE4-X', sales_qty: 2, sales_value: 20 },
            { item__name: 'OTHER SEAT', custom_role_profile__name: 'BE9-X', sales_qty: 5, sales_value: 50 },
            { item__name: 'NO SEAT', sales_qty: 7, sales_value: 70 },
          ],
        },
      },
    ]);
    expect(s.lines.map((l) => l.item)).toEqual(['MINE']);
    expect(s.salesQty).toBe(2);
  });
});
