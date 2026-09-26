import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/app/graphql-playground/constants', () => ({
  getEndpointConfigFromUrlKeyAsync: async () => ({ endpointUrl: 'https://erp.test/api/method/graphql' }),
}));

const { SecondaryEntry } = await import('../SecondaryEntry');

/* What elbrit_secondary_entry sends: the seat's own lines only, the other
   seats' products as names. */
const ANSWER = {
  user: 'be@x.org',
  seat: 'BE4-X',
  month: '2026-09',
  entries: [
    {
      name: 'Emc Pharmacy-2026-09-01',
      date: '2026-09-01',
      distributor__name: 'Emc Pharmacy',
      distributor: { name: 'Emc Pharmacy', customer_name: 'Emc Pharmacy', whg_ebs_code: 'EBS220', territory__name: 'HQ-Erode' },
      items: [
        { name: 'l1', item__name: 'BRITORVA 10', custom_status: 'Draft', sales_qty: 2, closing_qty: 1, sales_value: 94.6, closing_balance: 47.3, custom_last_pts: 47.3, custom_role_profile__name: 'BE4-X' },
      ],
      other_items: ['TENLITAB 20'],
      custom_status_tracker: [],
    },
  ],
  products: [{ name: 'BRITORVA 10', item_name: 'BRITORVA 10', brand__name: 'BRITORVA', custom_last_pts: 47.3 }],
};

describe('SecondaryEntry from the server script', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('with no rows and no provider, loads once from elbrit_secondary_entry as the user', async () => {
    const calls = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url, init) => {
        calls.push({ url: String(url), auth: init?.headers?.Authorization });
        return { ok: true, json: async () => ({ message: ANSWER }) };
      }),
    );
    render(<SecondaryEntry gqlToken="k:s" month="2026-09" />);
    expect(await screen.findByText('Emc Pharmacy')).toBeInTheDocument();
    expect(calls).toEqual([{ url: 'https://erp.test/api/method/elbrit_secondary_entry?month=2026-09', auth: 'token k:s' }]);
  });

  it('says what went wrong when the script fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ exc_type: 'PermissionError' }) })));
    render(<SecondaryEntry gqlToken="k:s" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('PermissionError');
  });
});
