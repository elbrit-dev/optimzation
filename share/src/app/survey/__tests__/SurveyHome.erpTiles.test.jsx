import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { SurveyHome } from '../components/SurveyHome';
import { createSurveyApi } from '../api';
import { DEFAULT_RING_NAV_ITEMS } from '@/app/ring-nav/data/defaultRingNavItems';
import { getEndpointConfigFromUrlKeyAsync } from '@/app/graphql-playground/constants';

/* On the app's page SurveyHome gets no `tiles`: it loads the usual Ring Nav
   tiles from ERP itself (elbrit_ring_nav, as the signed-in person) and puts
   the survey circles right after the entry tiles. */

const UAT = 'https://erp-uat.example.org/api/method/graphql';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SurveyHome without tiles — the usual ERP tiles plus the survey circles', () => {
  it('loads the Ring Nav tiles as the person and adds a circle per survey after the entry tiles', async () => {
    getEndpointConfigFromUrlKeyAsync.mockResolvedValue({ endpointUrl: UAT, authToken: '', name: 'UAT' });
    const myList = await createSurveyApi({ source: 'mock', role: 'BE', delay: 0 }).getMyList();
    const erpTiles = DEFAULT_RING_NAV_ITEMS.filter((t) => t.id !== 'survey');
    const fetchMock = vi.fn(async (url) => {
      const message = String(url).includes('/api/method/elbrit_ring_nav') ? { items: erpTiles } : myList;
      return { ok: true, status: 200, json: async () => ({ message }) };
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<SurveyHome gqlToken="k:s" gqlEnvironment="UAT" homeContent={<p>Home</p>} today="2026-11-11" />);

    await screen.findByRole('link', { name: /^Secondary statement/ });
    const labels = screen.getAllByRole('link').map((a) => a.getAttribute('aria-label'));
    const lastEntry = erpTiles.reduce((at, t, i) => (/-entry$/.test(t.id) ? i : at), -1);
    expect(labels.findIndex((l) => l.startsWith('Secondary statement'))).toBe(lastEntry + 1);
    expect(labels.length).toBeGreaterThan(erpTiles.length);

    await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => String(u).includes('elbrit_ring_nav'))).toBe(true));
    for (const [url, init] of fetchMock.mock.calls) {
      expect(new URL(url).origin).toBe('https://erp-uat.example.org');
      expect(init.headers.Authorization).toBe('token k:s');
    }
  });
});
