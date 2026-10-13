import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/app/graphql-playground/constants', () => ({
  getEndpointConfigFromUrlKeyAsync: async () => ({ endpointUrl: 'https://erp.test/api/method/graphql' }),
}));

const { SecondaryApproval } = await import('../SecondaryApproval');

const tracker = (name, raiser, fullName, date) => ({
  name: `Secondary Data Entry-${name}-${date}-BE4-X`,
  role_profile__name: 'BE4-X',
  workflow_state__name: 'ABM Approval Waiting',
  next_approver__name: 'abm@x.org',
  user: { name: raiser, full_name: fullName },
  data: 100,
  custom_ref_secondary_data_entry: {
    name: `${name}-${date}`,
    date,
    distributor__name: name,
    items: [{ item__name: 'BRITORVA 10', sales_qty: 2, sales_value: 100, custom_role_profile__name: 'BE4-X' }],
  },
});

const ANSWERS = {
  '': { month: '2026-09', months: [{ month: '2026-08', waiting: 1 }, { month: '2026-09', waiting: 1 }], trackers: [tracker('Emc Pharmacy', 'v@x.org', 'Vignesh K', '2026-09-01')] },
  '2026-08': { month: '2026-08', months: [{ month: '2026-08', waiting: 1 }, { month: '2026-09', waiting: 1 }], trackers: [tracker('New Pharma', 'r@x.org', 'Ravikumar V', '2026-08-01')] },
};

describe('SecondaryApproval from the server script', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('loads last month only, with no month switcher', async () => {
    const calls = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        const u = new URL(String(url));
        calls.push(u.pathname.split('/api/method/')[1] + u.search);
        if (u.pathname.endsWith('elbrit_secondary_approval')) {
          return { ok: true, json: async () => ({ message: ANSWERS[u.searchParams.get('month') ?? ''] }) };
        }
        /* The action check for the card on screen: nothing offered. */
        return { ok: true, json: async () => ({ message: u.pathname.endsWith('get_transitions') ? [] : { name: 'x' } }) };
      }),
    );
    render(<SecondaryApproval gqlToken="k:s" />);
    expect(await screen.findByRole('tab', { name: /Vignesh/ })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Aug/ })).toBeNull();
    /* (elbrit_approval_actions, the buttons' one call, carries no month.) */
    expect(calls.filter((c) => c.startsWith('elbrit') && !c.startsWith('elbrit_approval_actions'))).toEqual(['elbrit_secondary_approval', 'elbrit_entry_team?task=secondary&month=2026-09']);
  });

  it('knows who is looking from the token (the script user), with no viewer prop', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        const u = new URL(String(url));
        if (u.pathname.endsWith('elbrit_secondary_approval')) {
          return { ok: true, json: async () => ({ message: { ...ANSWERS[''], user: 'v@x.org' } }) };
        }
        return { ok: true, json: async () => ({ message: u.pathname.endsWith('get_transitions') ? [] : { name: 'x' } }) };
      }),
    );
    render(<SecondaryApproval gqlToken="k:s" />);
    expect(await screen.findByRole('tab', { name: /Self/ })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Vignesh/ })).toBeNull();
  });

  it('opens a line in a bottom sheet with its products, Rework and Approve', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        const u = new URL(String(url));
        if (u.pathname.endsWith('elbrit_secondary_approval')) return { ok: true, json: async () => ({ message: ANSWERS[''] }) };
        if (u.pathname.endsWith('get_transitions')) {
          return { ok: true, json: async () => ({ message: [{ action: 'Approve to Verification' }, { action: 'Revisit' }] }) };
        }
        return { ok: true, json: async () => ({ message: { name: 'x', workflow_state: 'ABM Approval Waiting' } }) };
      }),
    );
    render(<SecondaryApproval gqlToken="k:s" />);
    await userEvent.click(await screen.findByRole('button', { name: /Emc Pharmacy/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Emc Pharmacy' });
    expect(within(sheet).getByText('BRITORVA 10')).toBeInTheDocument();
    await userEvent.click(await within(sheet).findByRole('button', { name: 'Rework' }));
    expect(within(sheet).getByRole('button', { name: 'Approve' })).toBeInTheDocument();
    expect(within(sheet).getByLabelText('Reason for rework')).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole('button', { name: 'Done' }));
    expect(await screen.findByText('Rework — add a reason')).toBeInTheDocument();
  });

  /* Two of one BE's stockists, approved and waiting for verification, that
     the viewer (an RBM) may send back: the approval-actions script says so. */
  function approvedErp() {
    const approved = (name) => ({ ...tracker(name, 'v@x.org', 'Vignesh K', '2026-09-01'), workflow_state__name: 'ABM Approved and Waiting for Verification' });
    const trackers = [approved('Emc Pharmacy'), approved('Sri Medicals')];
    const writes = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url, init) => {
        const u = new URL(String(url));
        const body = init?.body ? JSON.parse(init.body) : null;
        const ok = (message) => ({ ok: true, json: async () => ({ message }) });
        if (u.pathname.endsWith('elbrit_secondary_approval')) return ok({ month: '2026-09', months: [], trackers, user: 'rbm@x.org' });
        if (u.pathname.endsWith('elbrit_approval_actions')) {
          return ok({ actions: Object.fromEntries(body.trackers.map((n) => [n, { approve: false, revisit: true, understood: true }])) });
        }
        if (u.pathname.endsWith('frappe.client.get')) return ok({ name: u.searchParams.get('name'), workflow_state: 'ABM Approved and Waiting for Verification' });
        if (u.pathname.endsWith('apply_workflow')) {
          writes.push(['workflow', body.doc.name, body.action]);
          return ok({ name: body.doc.name, workflow_state: 'Rework' });
        }
        if (u.pathname.endsWith('set_value')) {
          writes.push(['note', body.name, body.value]);
          return ok({ name: body.name });
        }
        return ok({ name: 'x' });
      }),
    );
    return { trackers, writes };
  }

  it('ticks approved stockists and sends them back together, with one reason', async () => {
    const { trackers, writes } = approvedErp();
    render(<SecondaryApproval gqlToken="k:s" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Select all' }));
    expect(await screen.findByText('selected')).toBeInTheDocument();
    /* Already approved: they can be sent back, not approved. */
    expect(screen.getByRole('button', { name: 'Approve 0' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Rework 2' }));
    const sheet = await screen.findByRole('dialog', { name: /Send 2 stockists back for rework/ });
    await userEvent.type(within(sheet).getByLabelText('Reason for rework'), 'Closing qty off');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Send back' }));
    expect(await screen.findByText(/2 sent back for rework/)).toBeInTheDocument();
    for (const t of trackers) {
      expect(writes).toContainEqual(['workflow', t.name, 'Revisit']);
      expect(writes).toContainEqual(['note', t.name, 'Revisit (from ABM Approved and Waiting for Verification): Closing qty off']);
    }
  });

  it('moves the pinned bar out of the way while a stockist sheet is open', async () => {
    approvedErp();
    render(<SecondaryApproval gqlToken="k:s" />);
    await userEvent.click(await screen.findByRole('checkbox', { name: /Select Emc Pharmacy/ }));
    expect(await screen.findByRole('region', { name: 'Decide this submission' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Sri Medicals/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Sri Medicals' });
    expect(screen.queryByRole('region', { name: 'Decide this submission' })).toBeNull();
    await userEvent.click(within(sheet).getByRole('button', { name: 'Rework' }));
    expect(within(sheet).getByLabelText('Reason for rework')).toBeVisible();
    await userEvent.click(within(sheet).getByRole('button', { name: 'Done' }));
    expect(await screen.findByRole('region', { name: 'Decide this submission' })).toBeInTheDocument();
  });

  it('says what went wrong when the script fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ exc_type: 'PermissionError' }) })));
    render(<SecondaryApproval gqlToken="k:s" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('PermissionError');
  });
});
