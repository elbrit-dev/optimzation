import { describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RingNav from '../components/RingNav';
import { normalizeRingNavItems } from '../utils/normalizeRingNavItems';
import { evaluateRingNavSource } from '../utils/evaluateRingNavSource';
import { resolveTiles, tileContext } from '../utils/resolveTiles';

const ITEMS = [
  { id: 'a', label: 'Alpha', href: '/alpha' },
  { id: 'b', label: 'Beta', href: '/beta' },
];

describe('RingNav', () => {
  it('renders a link per item, pointing at its href', () => {
    render(<RingNav items={ITEMS} />);
    expect(screen.getByRole('link', { name: 'Alpha' })).toHaveAttribute('href', '/alpha');
    expect(screen.getByRole('link', { name: 'Beta' })).toHaveAttribute('href', '/beta');
  });

  it('fires onItemClick with the id and href', async () => {
    const user = userEvent.setup();
    const onItemClick = vi.fn((id, href, event) => event.preventDefault());
    render(<RingNav items={ITEMS} onItemClick={onItemClick} />);
    await user.click(screen.getByRole('link', { name: 'Beta' }));
    expect(onItemClick).toHaveBeenCalledWith('b', '/beta', expect.anything());
  });

  it('renders nothing for an empty or missing items list', () => {
    const { container } = render(<RingNav items={[]} inset={false} />);
    expect(container.querySelector('nav')).toBeNull();
  });
});

describe('normalizeRingNavItems', () => {
  it('accepts strings, fills id/label from each other and drops repeats', () => {
    expect(
      normalizeRingNavItems(['Leave', { label: 'Daily Plan' }, { id: 'leave' }, null]).map((t) => [t.id, t.label]),
    ).toEqual([['leave', 'Leave'], ['daily-plan', 'Daily Plan']]);
  });

  it('trims href and treats an empty one as none', () => {
    const [a, b] = normalizeRingNavItems([
      { id: 'a', href: '  /alpha ' },
      { id: 'b', href: '   ' },
    ]);
    expect(a.href).toBe('/alpha');
    expect(b.href).toBeUndefined();
  });

  it('reads progress as a percentage: green done, red owed, clamped to 0-100', () => {
    const [a, b, c] = normalizeRingNavItems([
      { id: 'a', progress: 30 },
      { id: 'b', progress: 140 },
      { id: 'c', progress: '-5' },
    ]);
    expect(a.segments.map((s) => [s.tone, s.value])).toEqual([['success', 30], ['danger', 70]]);
    expect(b.segments.map((s) => s.value)).toEqual([100, 0]);
    expect(c.segments.map((s) => s.value)).toEqual([0, 100]);
  });

  it('draws no ring data for a non-numeric progress', () => {
    const [item] = normalizeRingNavItems([{ id: 'x', progress: { value: 6, max: 20 } }]);
    expect(item.segments).toBeUndefined();
  });

  it('prefers explicit segments over progress', () => {
    const segments = [{ value: 1, tone: 'danger' }];
    const [item] = normalizeRingNavItems([{ id: 'x', segments, progress: 50 }]);
    expect(item.segments).toBe(segments);
  });
});

describe('evaluateRingNavSource', () => {
  it('takes a bare array as the items', () => {
    const r = evaluateRingNavSource('["Leave"]');
    expect(r).toMatchObject({ ok: true, props: { items: ['Leave'] }, onItemClick: null });
  });

  it('reads props and a function onItemClick from JS', () => {
    const r = evaluateRingNavSource('({ stickyBar: true, inset: false, onItemClick: (id) => id, items: [] })');
    expect(r.ok).toBe(true);
    expect(r.props).toEqual({ items: [], stickyBar: true, inset: false });
    expect(typeof r.onItemClick).toBe('function');
  });

  it('rejects a non-function onItemClick, a mistyped prop, and a missing items list', () => {
    expect(evaluateRingNavSource('({ items: [], onItemClick: "x" })').ok).toBe(false);
    expect(evaluateRingNavSource('({ items: [], stickyBar: "yes" })').ok).toBe(false);
    expect(evaluateRingNavSource('({ tabs: [] })').ok).toBe(false);
  });
});

describe('RingNav dynamic tiles', () => {
  const labels = () => screen.queryAllByRole('link').map((l) => l.getAttribute('aria-label'));
  const DEFS = [
    { id: 'a', label: 'Alpha', href: '/alpha' },
    {
      id: 'b',
      label: 'Beta',
      href: '/beta',
      show: ({ day }) => day <= 5,
      caption: ({ data }) => `${data.draft} to enter`,
      segments: ({ data }) => [
        { value: data.approved, tone: 'success' },
        { value: data.draft, tone: 'danger' },
      ],
    },
  ];

  it('shows a tile only while its show holds — 1st-5th of the month', () => {
    const { rerender } = render(<RingNav items={DEFS} data={{ draft: 3, approved: 1 }} now="2026-10-03" />);
    expect(labels()).toEqual(['Alpha', 'Beta, 3 to enter']);
    rerender(<RingNav items={DEFS} data={{ draft: 3, approved: 1 }} now="2026-10-06" />);
    expect(labels()).toEqual(['Alpha']);
  });

  it('resolves caption and segments from data', () => {
    const tiles = resolveTiles(DEFS, tileContext(new Date(2026, 9, 2), { draft: 14, approved: 4 }));
    expect(tiles[1].caption).toBe('14 to enter');
    expect(tiles[1].segments.map((s) => s.value)).toEqual([4, 14]);
    expect('show' in tiles[1]).toBe(false);
  });

  it('re-resolves at midnight, and runs no timer for static tiles', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 5, 23, 59, 0));
    const { unmount } = render(<RingNav items={DEFS} data={{ draft: 1, approved: 0 }} />);
    expect(labels()).toEqual(['Alpha', 'Beta, 1 to enter']);
    act(() => vi.advanceTimersByTime(61 * 1000));
    expect(labels()).toEqual(['Alpha']);
    unmount();
    render(<RingNav items={ITEMS} />);
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });

  it('keeps the strip when a rule throws: a field is left out, a show keeps the tile', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const boom = () => {
      throw new Error('boom');
    };
    const tiles = resolveTiles([{ id: 'x', label: 'X', show: boom, caption: boom }], tileContext(Date.now(), {}));
    expect(tiles).toHaveLength(1);
    expect('caption' in tiles[0]).toBe(false);
    err.mockRestore();
  });

  it('takes the definitions as JavaScript text too', () => {
    const text = `[{ id: 'a', label: 'Alpha', href: '/alpha', show: ({ data }) => data.on }]`;
    const { rerender } = render(<RingNav items={text} data={{ on: false }} />);
    expect(labels()).toEqual([]);
    rerender(<RingNav items={text} data={{ on: true }} />);
    expect(labels()).toEqual(['Alpha']);
  });
});
