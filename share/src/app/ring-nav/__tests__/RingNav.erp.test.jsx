import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';

vi.mock('@/app/graphql-playground/constants', () => ({
  getEndpointConfigFromUrlKeyAsync: async () => ({ endpointUrl: 'https://erp.test/api/method/graphql' }),
}));

const { default: RingNav } = await import('../components/RingNav');

/* What the Elbrit Ring Nav server script sends: the tiles, ready to draw. */
const tile = (id, caption) => ({
  id,
  label: 'Secondary',
  href: `/${id}`,
  icon: 'calendar-clock',
  caption,
  count: 3,
  segments: [{ key: 'a', value: 1, tone: 'success' }],
});

function erp(answers) {
  const calls = [];
  let n = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, init) => {
      calls.push({ url: String(url), auth: init?.headers?.Authorization });
      const a = answers[Math.min(n++, answers.length - 1)];
      if (a instanceof Error) return { ok: false, status: 500, json: async () => ({ exc_type: a.message }) };
      return { ok: true, json: async () => ({ message: { items: a } }) };
    }),
  );
  return calls;
}

const labels = () => screen.queryAllByRole('link').map((l) => l.getAttribute('aria-label'));

describe('RingNav with tiles from ERP', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('draws what the server script sends, fetched as the signed-in user', async () => {
    const calls = erp([[tile('secondary-entry', '6 left'), tile('secondary-approval', '2 to do')]]);
    render(<RingNav gqlToken="k:s" month="2026-09" />);
    expect(await screen.findByRole('link', { name: /6 left/ })).toHaveAttribute('href', '/secondary-entry');
    expect(labels()).toHaveLength(2);
    expect(calls[0]).toEqual({ url: 'https://erp.test/api/method/elbrit_ring_nav?month=2026-09', auth: 'token k:s' });
  });

  it('re-points a tile by id with hrefs', async () => {
    erp([[tile('secondary-entry', '6 left')]]);
    render(<RingNav gqlToken="k2:s" hrefs={{ 'secondary-entry': '/secondary/entry' }} />);
    expect(await screen.findByRole('link', { name: /6 left/ })).toHaveAttribute('href', '/secondary/entry');
  });

  it('refetches every refreshEvery, and keeps the last tiles when a fetch fails', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const calls = erp([[tile('secondary-entry', '6 left')], new Error('boom'), [tile('secondary-entry', '5 left')]]);
    render(<RingNav gqlToken="k3:s" refreshEvery={10000} />);
    await screen.findByRole('link', { name: /6 left/ });
    await act(async () => vi.advanceTimersByTimeAsync(10000));
    expect(calls).toHaveLength(2);
    expect(labels()[0]).toMatch(/6 left/);
    await act(async () => vi.advanceTimersByTimeAsync(10000));
    await waitFor(() => expect(labels()[0]).toMatch(/5 left/));
    err.mockRestore();
  });

  it('uses items given here instead, and does not call ERP', () => {
    const calls = erp([[tile('x', 'no')]]);
    render(<RingNav gqlToken="k4:s" items={[{ id: 'a', label: 'Alpha', href: '/alpha' }]} />);
    expect(labels()).toEqual(['Alpha']);
    expect(calls).toHaveLength(0);
  });
});

describe('RingNav previewing a day from ERP', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('asks the server as of `now` — the entry window is the ERP\'s to work out', async () => {
    const calls = erp([[tile('secondary-entry', '5 Oct')]]);
    render(<RingNav gqlToken="k5:s" now="2026-10-03" />);
    await screen.findByRole('link', { name: /5 Oct/ });
    expect(calls[0].url).toBe('https://erp.test/api/method/elbrit_ring_nav?today=2026-10-03');
  });
});
