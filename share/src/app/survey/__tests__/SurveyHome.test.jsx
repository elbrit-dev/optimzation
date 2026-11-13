import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SurveyHome } from '../components/SurveyHome';
import { createSurveyApi } from '../api';
import { DEFAULT_RING_NAV_ITEMS } from '@/app/ring-nav/data/defaultRingNavItems';

const home = <p>Home page content</p>;

function setup(options = {}, props = {}) {
  const api = createSurveyApi({ source: 'mock', role: 'BE', delay: 0, ...options });
  return render(<SurveyHome api={api} tiles={DEFAULT_RING_NAV_ITEMS} homeContent={home} today="2026-11-11" {...props} />);
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
    expect(screen.queryByRole('navigation', { name: 'Shortcuts' })).toBeNull();
    expect(screen.queryByText('Home page content')).toBeNull();

    /* A row opens its form, also without the strip; Back returns to the survey. */
    await user.click(screen.getByRole('button', { name: /^Dr\. Joseph Prabhu/ }));
    expect(await screen.findByRole('heading', { name: /Rx audit.*Dr\. Joseph Prabhu/ })).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Shortcuts' })).toBeNull();
    expect(screen.queryByText('Home page content')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Back to Rx audit — vascular range' }));
    expect(await screen.findByRole('heading', { name: 'Rx audit — vascular range' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Back to home' }));
    expect(screen.getByRole('navigation', { name: 'Shortcuts' })).toBeTruthy();
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
    expect(await screen.findByText('Leave this form?')).toBeTruthy();
  });

  it('"Leave this form?" → Save for later keeps the answers on the device and returns to the survey', async () => {
    window.localStorage.clear();
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByRole('link', { name: /^Rx audit/ }));
    await user.click(await screen.findByRole('button', { name: /^Dr\. Joseph Prabhu/ }));
    await user.click(await screen.findByRole('radio', { name: 'Ticagrelor' }));
    await user.click(screen.getByRole('button', { name: 'Back to Rx audit — vascular range' }));
    await user.click(await screen.findByRole('button', { name: 'Save for later' }));
    expect(await screen.findByRole('button', { name: /^Dr\. Joseph Prabhu.*Saved$/ })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /^Dr\. Joseph Prabhu/ }));
    expect(await screen.findByRole('radio', { name: 'Ticagrelor', checked: true })).toBeTruthy();
    window.localStorage.clear();
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

describe('SurveyHome — the Home content slot and the strip props', () => {
  it('shows Home content on home only — a survey opens as its own page without it', async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByRole('link', { name: /^Rx audit/ });
    expect(screen.getByText('Home page content')).toBeTruthy();
    await user.click(screen.getByRole('link', { name: /^Rx audit/ }));
    expect(await screen.findByRole('heading', { name: 'Rx audit — vascular range' })).toBeTruthy();
    expect(screen.queryByText('Home page content')).toBeNull();
    expect(screen.queryByRole('navigation')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Back to home' }));
    expect(screen.getByText('Home page content')).toBeTruthy();
  });

  it('passes stickyBar, inset and ariaLabel to the strip — sticky and inset by default', async () => {
    const { container, unmount } = setup();
    await screen.findByRole('navigation', { name: 'Shortcuts' });
    const sticky = container.querySelector('.sticky');
    expect(sticky).toBeTruthy();
    expect(sticky.contains(screen.getByRole('navigation', { name: 'Shortcuts' }))).toBe(true);
    expect(sticky.className).toContain('pt-1.5');
    unmount();

    const again = setup({}, { stickyBar: false, inset: false, ariaLabel: 'Today' });
    await screen.findByRole('navigation', { name: 'Today' });
    expect(again.container.querySelector('.sticky')).toBeNull();
    expect(again.container.querySelector('.pt-1\\.5')).toBeNull();
  });
});

describe('SurveyHome — openInPlace', () => {
  /* Whether anything cancelled the click's navigation: read after React
     has handled it, then cancelled so the test page stays put. */
  function watchClicks() {
    const seen = [];
    const listener = (e) => {
      seen.push(e.defaultPrevented);
      e.preventDefault();
    };
    document.addEventListener('click', listener);
    return { seen, stop: () => document.removeEventListener('click', listener) };
  }

  it('on (default): a circle opens the survey in place, the navigation cancelled', async () => {
    const user = userEvent.setup();
    setup();
    const clicks = watchClicks();
    await user.click(await screen.findByRole('link', { name: /^Rx audit/ }));
    clicks.stop();
    expect(clicks.seen).toEqual([true]);
    expect(await screen.findByRole('heading', { name: 'Rx audit — vascular range' })).toBeTruthy();
  });

  it('off: a circle is an ordinary link to /survey/<campaign> — nothing opens in place', async () => {
    const user = userEvent.setup();
    setup({}, { openInPlace: false });
    const link = await screen.findByRole('link', { name: /^Rx audit/ });
    expect(link.getAttribute('href')).toBe('/survey/SC-2026-0031');
    const clicks = watchClicks();
    await user.click(link);
    clicks.stop();
    expect(clicks.seen).toEqual([false]);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole('heading', { name: 'Rx audit — vascular range' })).toBeNull();
    expect(screen.getByRole('navigation', { name: 'Shortcuts' })).toBeTruthy();
    expect(screen.getByText('Home page content')).toBeTruthy();
  });
});

