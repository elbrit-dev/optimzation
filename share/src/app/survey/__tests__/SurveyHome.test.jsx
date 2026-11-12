import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SurveyHome } from '../components/SurveyHome';
import { createSurveyApi } from '../api';
import { DEFAULT_RING_NAV_ITEMS } from '@/app/ring-nav/data/defaultRingNavItems';

const home = <p>Home page content</p>;

function setup(options = {}) {
  const api = createSurveyApi({ source: 'mock', role: 'BE', delay: 0, ...options });
  return render(<SurveyHome api={api} tiles={DEFAULT_RING_NAV_ITEMS} homeContent={home} today="2026-11-11" />);
}

describe('SurveyHome — a circle per survey, home first', () => {
  it('opens on home: the strip with a circle per survey after the entry tiles, no survey list', async () => {
    setup();
    await screen.findByRole('link', { name: /^Secondary statement/ });
    const labels = screen.getAllByRole('link').map((a) => a.getAttribute('aria-label'));
    const first = labels.findIndex((l) => l.startsWith('Secondary statement'));
    expect(labels.slice(first, first + 4).map((l) => l.split(',')[0])).toEqual([
      'Secondary statement — October',
      'Rx audit — vascular range',
      'Clinic footfall check',
      'Diwali CME invitation',
    ]);
    expect(first).toBe(3);
    expect(screen.getByText('Home page content')).toBeTruthy();
    expect(screen.queryByRole('tab', { name: /To do/ })).toBeNull();
  });

  it('a circle opens its survey as its own page — no strip — and Back brings the strip back', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByRole('link', { name: /^Rx audit/ }));
    expect(await screen.findByRole('heading', { name: 'Rx audit — vascular range' })).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Daily tasks' })).toBeNull();
    expect(screen.queryByText('Home page content')).toBeNull();

    /* A row opens its form, also without the strip; Back returns to the survey. */
    await user.click(screen.getByRole('button', { name: /^Dr\. Joseph Prabhu/ }));
    expect(await screen.findByRole('heading', { name: /Rx audit.*Dr\. Joseph Prabhu/ })).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Daily tasks' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Back to Rx audit — vascular range' }));
    expect(await screen.findByRole('heading', { name: 'Rx audit — vascular range' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Back to home' }));
    expect(screen.getByRole('navigation', { name: 'Daily tasks' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /^Rx audit/ })).toBeTruthy();
    expect(screen.getByText('Home page content')).toBeTruthy();
  });

  it('asks before leaving a form with unsent answers', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByRole('link', { name: /^Rx audit/ }));
    await user.click(await screen.findByRole('button', { name: /^Dr\. Joseph Prabhu/ }));
    await user.click(await screen.findByRole('radio', { name: 'Ticagrelor' }));
    await user.click(screen.getByRole('button', { name: 'Back to Rx audit — vascular range' }));
    expect(await screen.findByText('Discard changes?')).toBeTruthy();
  });

  it('shows no survey circle to someone with no survey', async () => {
    setup({ scenario: 'empty' });
    await waitFor(() => expect(screen.getAllByRole('link').length).toBeGreaterThan(0));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole('link', { name: /survey/i })).toBeNull();
  });

  it('says so at the top of home when surveys cannot load', async () => {
    setup({ scenario: 'error' });
    expect(await screen.findByText('Couldn’t load your surveys')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(screen.getByText('Home page content')).toBeTruthy();
  });
});
