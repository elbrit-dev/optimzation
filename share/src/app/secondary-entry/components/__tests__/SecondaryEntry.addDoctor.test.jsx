import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('@/app/graphql-playground/constants', () => ({
  getEndpointConfigFromUrlKeyAsync: async () => ({ endpointUrl: 'https://erp.test/api/method/graphql' }),
}));

const { SecondaryEntry } = await import('../SecondaryEntry');
const { DOCTOR_SUPPORT } = await import('../../data/task');

/* What elbrit_doctor_support_entry sends a BE with nothing on their list
   yet: no entries, their doctors to add. */
const ANSWER = {
  user: 'be@x.org',
  seat: 'BE2-X',
  month: '2026-09',
  entries: [],
  products: [{ name: 'VEINEX', item_name: 'VEINEX', brand__name: 'VEINEX', custom_last_pts: 122.04 }],
  addable: [
    { name: 'DR-1', customer_name: 'Dr Asha', note: 'Cardiology · Coimbatore' },
    { name: 'DR-2', customer_name: 'Dr Bala', note: null },
    { name: 'DR-3', customer_name: 'Dr Chitra', note: null },
  ],
};

function stubErp(addAnswer) {
  const calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, init) => {
      const u = String(url);
      calls.push({ url: u, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(init.body) : null });
      if (u.includes('elbrit_doctor_support_add')) return { ok: true, json: async () => ({ message: addAnswer }) };
      if (u.includes('elbrit_entry_team')) return { ok: true, json: async () => ({ message: { members: [] } }) };
      return { ok: true, json: async () => ({ message: ANSWER }) };
    }),
  );
  return calls;
}

describe('Doctor Support: Add doctor', () => {
  afterEach(() => vi.unstubAllGlobals());

  it("lists the BE's doctors to add, creates the chosen ones and re-reads the month", async () => {
    const calls = stubErp({ created: ['DR-1-2026-September'], added: ['DR-3-2026-September'], skipped: [] });
    render(<SecondaryEntry gqlToken="k:s" month="2026-09" task={DOCTOR_SUPPORT} />);

    fireEvent.click(await screen.findByRole('button', { name: /Add doctor \(3 not on your list\)/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Dr Asha/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Dr Chitra/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Create 2' }));

    await waitFor(() => expect(calls.some((c) => c.url.includes('elbrit_doctor_support_add'))).toBe(true));
    const add = calls.find((c) => c.url.includes('elbrit_doctor_support_add'));
    expect(add).toMatchObject({ url: 'https://erp.test/api/method/elbrit_doctor_support_add', method: 'POST', body: { doctors: ['DR-1', 'DR-3'] } });
    /* Re-read, so the new doctors show (and go into the sheet). */
    await waitFor(() => expect(calls.filter((c) => c.url.includes('elbrit_doctor_support_entry')).length).toBe(2));
  });

  it('stops at the limit per go', async () => {
    stubErp({ created: [], added: [], skipped: [] });
    render(<SecondaryEntry gqlToken="k:s" month="2026-09" task={{ ...DOCTOR_SUPPORT, addLimit: 2 }} />);

    fireEvent.click(await screen.findByRole('button', { name: /Add doctor/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Dr Asha/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Dr Bala/ }));
    expect(screen.getByRole('checkbox', { name: /Dr Chitra/ })).toBeDisabled();
    expect(screen.getByText(/2 chosen — the most per go/)).toBeInTheDocument();
  });

  it('keeps the sheet open and says why when nothing was added', async () => {
    stubErp({ created: [], added: [], skipped: [{ doctor: 'DR-2', reason: 'not your doctor' }] });
    render(<SecondaryEntry gqlToken="k:s" month="2026-09" task={DOCTOR_SUPPORT} />);

    fireEvent.click(await screen.findByRole('button', { name: /Add doctor/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Dr Bala/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Create 1' }));
    expect(await screen.findByText(/Nothing added: DR-2 \(not your doctor\)/)).toBeInTheDocument();
  });

  it('is not offered for any other month (the server sends addable: null)', async () => {
    stubErp({});
    const old = { ...ANSWER, month: '2026-08', addable: null };
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ message: old }) })));
    render(<SecondaryEntry gqlToken="k:s" month="2026-08" task={DOCTOR_SUPPORT} />);
    expect(await screen.findByText(/No doctor entries/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add doctor/ })).not.toBeInTheDocument();
  });

  it('is not offered for Secondary, which has no add', async () => {
    stubErp({});
    render(<SecondaryEntry gqlToken="k:s" month="2026-09" />);
    expect(await screen.findByText(/No stockist entries/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add / })).not.toBeInTheDocument();
  });
});
