import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SecondaryEntry } from '../SecondaryEntry';

/* One stockist shared by two seats: BE4's line and another seat's. */
const ROWS = [
  {
    name: 'Emc Pharmacy-2026-09-01',
    date: '2026-09-01',
    distributor__name: 'Emc Pharmacy',
    items: [
      { item__name: 'MINE-10', custom_role_profile__name: 'BE4-X', custom_status: 'Draft', sales_qty: 1, closing_qty: 0 },
      { item__name: 'THEIRS-20', custom_role_profile__name: 'BE9-X', custom_status: 'Draft', sales_qty: 9, closing_qty: 0 },
    ],
    custom_status_tracker: [],
  },
];

const writer = (whoAmI) => ({ live: false, whoAmI: vi.fn(whoAmI), saveSeat: vi.fn() });

describe('SecondaryEntry without a seat', () => {
  it('shows an error, not the whole entry, when ERP has no seat for the user', async () => {
    render(<SecondaryEntry rows={ROWS} products={[]} writer={writer(async () => ({ user: 'x@y', seat: null }))} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No seat for this user');
    expect(screen.queryByText('Emc Pharmacy')).toBeNull();
    expect(screen.queryByText(/THEIRS-20/)).toBeNull();
  });

  it('says something went wrong when ERP fails, and tries again on request', async () => {
    const w = writer(async () => {
      throw new Error('PermissionError');
    });
    render(<SecondaryEntry rows={ROWS} products={[]} writer={w} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
    expect(screen.getByRole('alert')).toHaveTextContent('PermissionError');
    w.whoAmI.mockImplementation(async () => ({ user: 'x@y', seat: 'BE4-X' }));
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Emc Pharmacy')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('with the seat from ERP, lists the stockist', async () => {
    render(<SecondaryEntry rows={ROWS} products={[]} writer={writer(async () => ({ user: 'x@y', seat: 'BE4-X' }))} />);
    expect(await screen.findByText('Emc Pharmacy')).toBeInTheDocument();
  });
});
