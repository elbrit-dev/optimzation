import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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

  it('loads one month, lists the months with work, and fetches another on switch', async () => {
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
    await userEvent.click(screen.getByRole('tab', { name: /Aug/ }));
    expect(await screen.findByRole('tab', { name: /Ravikumar/ })).toBeInTheDocument();
    expect(calls.filter((c) => c.startsWith('elbrit'))).toEqual(['elbrit_secondary_approval', 'elbrit_secondary_approval?month=2026-08']);
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

  it('says what went wrong when the script fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ exc_type: 'PermissionError' }) })));
    render(<SecondaryApproval gqlToken="k:s" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('PermissionError');
  });
});
