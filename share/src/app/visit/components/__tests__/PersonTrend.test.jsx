import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { PersonTrend, trendSeries } from '../PersonTrend';

/* The chart itself cannot be asserted in jsdom — Recharts sizes itself from
   its parent and jsdom reports every box as 0x0, so nothing is drawn. The
   series is where the decisions live, so it is pure and tested directly. */

/* A day with a visit on it by default: the chart only draws those, so a
   fixture of zeros would be filtered away before any assertion saw it. */
const d = (date, over = { planned: 1, happened: 1, verified: 1 }) =>
  ({ date, planned: 0, happened: 0, verified: 0, force: 0, ...over });

describe('trendSeries', () => {
  it('splits each day into geo verified and force, like the hourly chart', () => {
    /* It was an area of done-against-planned, which could not tell a rep with
       twenty solid days from one with twenty forced ones — the single
       distinction this whole screen is built around. */
    const out = trendSeries([
      d('2026-09-04', { planned: 4, happened: 4, verified: 3, force: 1 }),
      d('2026-09-05', { planned: 2, happened: 2, verified: 0, force: 2 }),
    ]);
    expect(out.map((p) => p.verified)).toEqual([3, 0]);
    expect(out.map((p) => p.force)).toEqual([1, 2]);
    expect(out.map((p) => p.total)).toEqual([4, 2]);
  });

  it('drops the days with nothing in them', () => {
    /* A silent day drew a labelled column of nothing, and on a rep who works
       alternate days that was half the chart saying nothing — pushing the
       days that DID happen off the end of the scroll. They are not lost: the
       Not reported sheet lists them, and says why each was silent. */
    const out = trendSeries([
      d('2026-09-04', { planned: 4, happened: 4, verified: 4 }),
      d('2026-09-05', { planned: 3 }),
      d('2026-09-07', { planned: 5, happened: 2, verified: 2 }),
    ]);
    expect(out.map((p) => p.key)).toEqual(['2026-09-04', '2026-09-07']);
  });

  it('keeps a day that was entirely force visits', () => {
    // Filtering on `verified` alone would have dropped it.
    const out = trendSeries([d('2026-09-04', { planned: 2, happened: 2, force: 2 })]);
    expect(out).toHaveLength(1);
  });

  it('formats the label once, here, rather than per resize', () => {
    expect(trendSeries([d('2026-09-04')])[0].label).toBe('4 Sep');
  });

  it('keeps the ISO date as the key, so the label can change freely', () => {
    expect(trendSeries([d('2026-09-04')])[0].key).toBe('2026-09-04');
  });

});

/* Twenty-six days across a phone is 10px a column: unreadable, untappable,
   and an axis that has to drop most of its labels. The track scrolls instead,
   which is why every date can keep its own tick. */
describe('PersonTrend width', () => {
  it('asks for a floor per column rather than fitting the month in', () => {
    const { container } = render(<PersonTrend days={[d('2026-09-04'), d('2026-09-05')]} />);
    const box = container.querySelector('.ds-chart');
    expect(box.className).toContain('overflow-x-auto');
    expect(box.className).toContain('ds-scrollbar');
  });

  it('scales the floor with the number of days', () => {
    /* ResponsiveContainer writes the floor as a min-width, so a longer run
       asks for a wider track and the parent scrolls to reach it. */
    const width = (n) => {
      const days = Array.from({ length: n }, (_, i) => d(`2026-09-${String(i + 1).padStart(2, '0')}`));
      const { container, unmount } = render(<PersonTrend days={days} />);
      const el = container.querySelector('.recharts-responsive-container');
      const min = el?.style.minWidth ?? '0px';
      unmount();
      return Number.parseInt(min, 10);
    };
    expect(width(20)).toBeGreaterThan(width(5));
    expect(width(20)).toBeGreaterThanOrEqual(20 * 44);
  });
});

/* Recharts' hover card cannot survive a scrolling chart — it flips away from
   the edge of the CHART, which it knows, not the edge of the WINDOW, which it
   does not. The readout under the chart carries the same information from
   outside the box that clips. */
describe('PersonTrend readout', () => {
  const days = [
    d('2026-09-04', { planned: 4, happened: 4, verified: 3, force: 1 }),
    d('2026-09-07', { planned: 2, happened: 2, verified: 2 }),
  ];

  it('reserves its line whether or not anything is hovered', () => {
    /* Letting it appear and vanish would jog every card below it each time
       the pointer crossed a column. */
    const { container } = render(<PersonTrend days={days} />);
    const line = container.querySelector('p');
    expect(line).toBeInTheDocument();
    expect(line.textContent).toBe('');
    expect(line.className).toContain('h-4');
  });

  it('has no Recharts hover card to be clipped', () => {
    // The scrolling variant opts out of it entirely; see VisitBars.
    const { container } = render(<PersonTrend days={days} />);
    expect(container.querySelector('.recharts-tooltip-wrapper')).toBeNull();
  });
});
