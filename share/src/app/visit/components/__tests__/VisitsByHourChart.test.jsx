import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cloneElement } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VisitsByHourChart, hourFromClick, hourSeries } from '../VisitsByHourChart';
import { VisitsByHourSheet } from '../VisitsByHourSheet';
import { CHART_HOURS } from '../../data/selectors';

/* RECHARTS MEASURES ITS PARENT, and jsdom reports every box as 0x0 — so
   ResponsiveContainer renders nothing and every assertion below would pass or
   fail for the wrong reason. Swapping it for a fixed-size wrapper is what
   keeps the REAL chart under test: the bars, their click handler and the
   accessible name on each column are all Recharts' own output, not a stub's.
   Only the measuring step is replaced. */
vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    ResponsiveContainer: ({ children }) => cloneElement(children, { width: 480, height: 200 }),
  };
});

/* The bar is a control, and the two things that can go wrong with it are
   invisible in a screenshot: an hour that takes a tap and opens nothing, and
   a bar whose accessible name is the bare number "14". */

function bars(overrides = {}) {
  return CHART_HOURS.map((hour) => ({ hour, verified: 0, force: 0, ...(overrides[hour] ?? {}) }));
}

describe('VisitsByHourChart', () => {
  /* The click is resolved from the chart's own pointer state, which jsdom can
     never produce: every element there measures 0x0, so Recharts has no
     geometry to map a click onto a category. The mapping is therefore a pure
     function and gets tested as one. */
  it('resolves a click to the hour under the pointer', () => {
    /* THE INDEX ARRIVES AS A STRING. Recharts 3 types it `number |
       TooltipIndex | undefined` with `TooltipIndex = string | null`, and
       sends "0", "1" — an earlier version of this test passed NUMBERS, went
       green, and shipped a drill-down that did nothing at all. Both forms are
       asserted so the coercion cannot be dropped again. */
    const series = hourSeries(bars({ 9: { verified: 2 }, 14: { verified: 3, force: 1 } }));
    expect(hourFromClick(series, { activeTooltipIndex: '1' })).toBe(14);
    expect(hourFromClick(series, { activeTooltipIndex: '0' })).toBe(9);
    expect(hourFromClick(series, { activeTooltipIndex: 1 })).toBe(14);
    expect(hourFromClick(series, { activeTooltipIndex: 0 })).toBe(9);
  });

  it('resolves a click on empty chrome to nothing at all', () => {
    /* Recharts reports no active category for a click outside the plot area,
       and opening the first hour in that case would be a sheet the reader did
       not ask for. */
    const series = hourSeries(bars({ 9: { verified: 2 } }));
    expect(hourFromClick(series, {})).toBeNull();
    expect(hourFromClick(series, null)).toBeNull();
    expect(hourFromClick(series, { activeTooltipIndex: null })).toBeNull();
    expect(hourFromClick(series, { activeTooltipIndex: '' })).toBeNull();
    expect(hourFromClick(series, { activeTooltipIndex: '7' })).toBeNull();
  });

  it('names each column in full, not just by its value', () => {
    // "14" on its own is a number with no unit and no hour attached.
    render(<VisitsByHourChart data={bars({ 14: { verified: 3, force: 1 } })} onSelectHour={vi.fn()} />);
    expect(screen.getByRole('img', { name: '2PM: 4 visits, 1 force' })).toBeInTheDocument();
  });

  it('names every column exactly once', () => {
    /* The name rides on a third, invisible bar precisely so it does not
       depend on which of the two visible series happens to be non-zero. */
    render(<VisitsByHourChart data={bars({ 9: { verified: 2 }, 14: { force: 1 } })} onSelectHour={vi.fn()} />);
    expect(screen.getAllByRole('img', { name: /visits?$|force$/ })).toHaveLength(2);
  });
});

function visitRow(over = {}) {
  return {
    eventId: 'EV1',
    plannedDate: '2026-09-05',
    employeeId: 'E1',
    employeeName: 'Anil',
    doctorId: 'DR-1',
    doctorName: 'Dr One',
    hq: 'HQ-Hubballi',
    pobGiven: false,
    visitTime: '2026-09-05 14:10:00',
    distanceKm: 0.2,
    forceVisit: false,
    forceVisitReason: '',
    ...over,
  };
}

describe('VisitsByHourSheet', () => {
  it('lists the calls in the hour it was opened on', () => {
    render(
      <VisitsByHourSheet
        selection={{ hour: 14 }}
        rows={[
          visitRow({ eventId: 'A', doctorName: 'Dr Two PM' }),
          visitRow({ eventId: 'B', visitTime: '2026-09-05 15:10:00', doctorName: 'Dr Three PM' }),
        ]}
        periodLabel="Sep 2026"
        scopeLabel="All HQs"
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('Dr Two PM')).toBeInTheDocument();
    expect(screen.queryByText('Dr Three PM')).not.toBeInTheDocument();
  });

  it('titles a tone selection as a series rather than an hour', () => {
    render(
      <VisitsByHourSheet
        selection={{ tone: 'force' }}
        rows={[visitRow({ forceVisit: true, distanceKm: 8.2, forceVisitReason: 'Camp duty' })]}
        periodLabel="Sep 2026"
        scopeLabel="All HQs"
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('Force visits')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Dr One/ })).toBeInTheDocument();
  });

  it('reveals the distance and reason once the call is expanded', async () => {
    /* The card shows the doctor; the per-attendee detail lives in the table
       underneath, which is the same shape the doctor plan sheet uses. */
    render(
      <VisitsByHourSheet
        selection={{ hour: 14 }}
        rows={[visitRow({ forceVisit: true, distanceKm: 8.2, forceVisitReason: 'Camp duty' })]}
        periodLabel="Sep 2026"
        scopeLabel="All HQs"
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByText(/8.2 km away/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Dr One/ }));
    expect(screen.getByText('8.2 km away · Camp duty')).toBeInTheDocument();
  });

  it('drops the HQ from each row once the strip is filtered to one', () => {
    // The subtitle already names it; repeating it on every row is noise.
    render(
      <VisitsByHourSheet
        selection={{ hour: 14 }}
        rows={[visitRow()]}
        periodLabel="Sep 2026"
        scopeLabel="Hubballi"
        showHq={false}
        onClose={vi.fn()}
      />,
    );
    // The card's right rail carries the territory; filtered to one, it goes.
    expect(screen.queryByText('Hubballi')).not.toBeInTheDocument();
  });

  it('keeps the HQ on each row under All HQs, where rows can differ', () => {
    render(
      <VisitsByHourSheet
        selection={{ hour: 14 }}
        rows={[visitRow()]}
        periodLabel="Sep 2026"
        scopeLabel="All HQs"
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('Hubballi')).toBeInTheDocument();
  });

  it('stays closed when nothing is selected', () => {
    render(
      <VisitsByHourSheet
        selection={null}
        rows={[visitRow()]}
        periodLabel="Sep 2026"
        scopeLabel="All HQs"
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByText('Dr One')).not.toBeInTheDocument();
  });
});

describe('VisitsByHourChart which hours it draws', () => {
  /* Asserted on the series rather than the drawn SVG: which hours exist is a
     data decision, and pinning it to Recharts' markup would make these fail
     on a library upgrade that changed nothing a reader can see. */
  it('draws only the hours that had a visit', () => {
    /* The axis was the whole 9-5 day, then all 24 hours; both spent most of
       the width on columns with nothing in them. */
    expect(hourSeries(bars({ 9: { verified: 2 }, 14: { force: 1 } })).map((d) => d.hour))
      .toEqual([9, 14]);
  });

  it('keeps them in clock order however the data arrives', () => {
    expect(hourSeries(bars({ 17: { verified: 1 }, 7: { verified: 1 }, 12: { verified: 1 } })).map((d) => d.hour))
      .toEqual([7, 12, 17]);
  });

  it('draws an hour that was ALL force visits', () => {
    // Filtering on `verified` alone would have dropped it.
    expect(hourSeries(bars({ 14: { force: 2 } }))).toHaveLength(1);
  });

  it('carries the stack total, so the label above a bar is not a part of it', () => {
    const [two] = hourSeries(bars({ 14: { verified: 3, force: 1 } }));
    expect(two).toMatchObject({ label: '2PM', verified: 3, force: 1, total: 4 });
  });

  it('says so in words when the day is empty, rather than drawing a bare axis', () => {
    render(<VisitsByHourChart data={bars()} />);
    expect(screen.getByText(/No visits in this period/)).toBeInTheDocument();
  });

  it('shows no empty-state message as soon as one visit lands', () => {
    render(<VisitsByHourChart data={bars({ 9: { verified: 1 } })} />);
    expect(screen.queryByText(/No visits in this period/)).not.toBeInTheDocument();
  });
});

/* A bar chart is a comparison of LENGTHS. Both of these are about keeping a
   column looking like a column when the day does not fill the card. */
describe('VisitsByHourChart column width', () => {
  const widthClasses = (container) =>
    [...container.querySelectorAll('[data-hour]')].map((el) => el.className);

  it('caps a column, so two busy hours are not two slabs', () => {
    /* `flex-1` divides the whole width among however many columns there are.
       With two, that drew a pair of 350px blocks with nothing left to
       compare — each was already as wide as the card. */
    const { container } = render(
      <VisitsByHourChart data={bars({ 10: { verified: 2 }, 11: { verified: 3, force: 2 } })} />,
    );
    for (const cls of widthClasses(container)) expect(cls).toContain('max-w-14');
  });

  it('floors a column at the LABEL width, so the axis never runs together', () => {
    /* "12PM" is 28px at the 10px step. Below ~36px the hours read as one
       word; past the floor the track scrolls instead, which is the better
       of the two — a legible axis you scroll beats an illegible one that
       fits. */
    const { container } = render(<VisitsByHourChart data={bars({ 7: { verified: 1 } })} />);
    for (const cls of widthClasses(container)) expect(cls).toContain('min-w-9');
  });
});

describe('VisitsByHourChart column widths', () => {
  /* A hand-rolled version of this chart needed a min-width, a max-width, a
     scroll container and three rounds of measuring in a real browser to stop
     a two-hour day drawing two 350px slabs and a fifteen-hour day drawing
     12px slivers. Recharts does that arithmetic itself — these pin that the
     inputs it needs are still set, since the failure mode is a chart that
     looks plausible and is unreadable. */
  const chart = (data) => render(<VisitsByHourChart data={data} />).container.querySelector('.recharts-wrapper');

  it('keeps a two-hour day from drawing slabs', () => {
    const svg = chart(bars({ 10: { verified: 2 }, 11: { verified: 3 } }));
    const widths = [...svg.querySelectorAll('.recharts-bar-rectangle path')]
      .map((p) => Number(p.getAttribute('width')));
    expect(widths.length).toBeGreaterThan(0);
    for (const w of widths) expect(w).toBeLessThanOrEqual(56);
  });

  it('still draws every hour when the day is long', () => {
    // Fifteen columns: narrow is fine, missing is not.
    const long = Object.fromEntries(
      Array.from({ length: 15 }, (_, i) => [i + 7, { verified: 1 + (i % 4) }]),
    );
    expect(hourSeries(bars(long))).toHaveLength(15);
  });
});

/* The name has to survive whichever segments happen to exist — Recharts draws
   no rectangle for a zero value, so a label hung on one series alone goes
   missing on half the columns. */
describe('VisitsByHourChart accessible names', () => {
  const name = (n) => screen.getByRole('img', { name: n });

  it('names an hour that was entirely geo verified', () => {
    render(<VisitsByHourChart data={bars({ 9: { verified: 2 } })} onSelectHour={vi.fn()} />);
    expect(name('9AM: 2 visits')).toBeInTheDocument();
  });

  it('names an hour that was entirely forced', () => {
    render(<VisitsByHourChart data={bars({ 9: { force: 2 } })} onSelectHour={vi.fn()} />);
    expect(name('9AM: 2 visits, 2 force')).toBeInTheDocument();
  });

  it('names a mixed hour once, not twice', () => {
    // One name per column: two would have the reader hear every hour double.
    render(<VisitsByHourChart data={bars({ 9: { verified: 2, force: 1 } })} onSelectHour={vi.fn()} />);
    expect(screen.getAllByRole('img', { name: /^9AM:/ })).toHaveLength(1);
  });

  it('says "1 visit", not "1 visits"', () => {
    render(<VisitsByHourChart data={bars({ 9: { verified: 1 } })} onSelectHour={vi.fn()} />);
    expect(name('9AM: 1 visit')).toBeInTheDocument();
  });
});

/* The hand-rolled chart made the whole column a target, because a 9am bar
   three pixels tall is a three-pixel tap target — a control that does not
   exist on a phone. Recharts hit-tests only what it painted, so the press is
   handled at the CHART, over the whole plot area: above a bar, beside it, and
   in the gaps. These pin the mapping that makes that safe. */
describe('VisitsByHourChart hit area', () => {
  const series = hourSeries(bars({ 9: { verified: 1 }, 14: { verified: 8 } }));

  it('opens the same hour from anywhere in a column, tall or short', () => {
    /* The 9am column is an eighth of 2pm's height. Both resolve by CATEGORY,
       so the press area is the full column either way. */
    expect(hourFromClick(series, { activeTooltipIndex: '0' })).toBe(9);
    expect(hourFromClick(series, { activeTooltipIndex: '1' })).toBe(14);
  });

  it('never opens an hour that is not on the chart', () => {
    // Empty hours are absent from the series, so there is no index for them.
    expect(series.map((d) => d.hour)).not.toContain(10);
    expect(hourFromClick(series, { activeTooltipIndex: '2' })).toBeNull();
  });
});

/* The empty half of a short column has to be pressable: a 9am bar three
   pixels tall is a three-pixel tap target, which on a phone is no control at
   all. The chart-level handler is supposed to cover it, but only resolves a
   category where Recharts has one to report — so the space is filled with a
   transparent rectangle that is nonetheless a real shape. */
describe('VisitsByHourChart pressable column', () => {
  const columns = (container) => {
    const byX = new Map();
    for (const p of container.querySelectorAll('.recharts-bar-rectangle path')) {
      const x = p.getAttribute('x');
      byX.set(x, [...(byX.get(x) ?? []), p]);
    }
    return [...byX.values()];
  };

  it('opens the hour from the empty space above a short bar', () => {
    const onSelectHour = vi.fn();
    const { container } = render(
      <VisitsByHourChart data={bars({ 9: { verified: 1 }, 14: { verified: 8 } })} onSelectHour={onSelectHour} />,
    );

    /* The 9am column's tallest rect is its pad — the drawn bar is an eighth
       of the height of 2pm's. Clicking the pad has to open 9AM, not 2PM. */
    const [nine] = columns(container);
    const pad = nine.reduce((a, b) => (Number(a.getAttribute('height')) > Number(b.getAttribute('height')) ? a : b));
    expect(Number(pad.getAttribute('height'))).toBeGreaterThan(50);

    fireEvent.click(pad);
    expect(onSelectHour).toHaveBeenCalledWith(9);
  });

  it('every column reaches the same ceiling to be pressed at', () => {
    const { container } = render(
      <VisitsByHourChart data={bars({ 9: { verified: 1 }, 14: { verified: 8 } })} onSelectHour={vi.fn()} />,
    );
    const heights = columns(container).map((rects) =>
      rects.reduce((sum, p) => sum + Number(p.getAttribute('height')), 0),
    );
    expect(Math.abs(heights[0] - heights[1])).toBeLessThan(1);
  });

  it('adds no pad when nothing is wired to it', () => {
    // A press target that does nothing is worse than none.
    const { container } = render(<VisitsByHourChart data={bars({ 9: { verified: 1 }, 14: { verified: 8 } })} />);
    const heights = columns(container).map((rects) =>
      rects.reduce((sum, p) => sum + Number(p.getAttribute('height')), 0),
    );
    expect(Math.abs(heights[0] - heights[1])).toBeGreaterThan(1);
  });
});

/* The same toolbar the doctor plan sheet has. This list is the wider of the
   two — one bar at company scope is every rep's afternoon — so it is the one
   that most needs a way to narrow. */
describe('VisitsByHourSheet controls', () => {
  const many = (n) => Array.from({ length: n }, (_, i) => visitRow({
    eventId: `EV${i}`,
    doctorId: `DR-${i}`,
    doctorName: i === 0 ? 'Dr Zebedee Last' : `Dr Number ${i}`,
    employeeId: i % 2 ? 'A' : 'B',
    employeeName: i % 2 ? 'Anil' : 'Bala',
  }));

  const search = () => screen.getByLabelText(/Search by doctor name or code/);

  function openSheet(rows, selection = { hour: 14 }) {
    return render(
      <VisitsByHourSheet
        selection={selection}
        rows={rows}
        periodLabel="Sep 2026"
        scopeLabel="All HQs"
        onClose={vi.fn()}
      />,
    );
  }

  it('searches the whole hour, not the page on screen', async () => {
    const user = userEvent.setup();
    openSheet(many(40));

    expect(screen.getByText('Dr Number 1')).toBeInTheDocument();
    await user.type(search(), 'zebedee');
    expect(screen.getByText('Dr Zebedee Last')).toBeInTheDocument();
    expect(screen.queryByText('Dr Number 1')).not.toBeInTheDocument();
  });

  it('says the controls emptied the hour, not that the hour is empty', async () => {
    const user = userEvent.setup();
    openSheet(many(5));

    await user.type(search(), 'nobody');
    expect(screen.getByText(/No calls match these filters/)).toBeInTheDocument();
    expect(screen.queryByText(/No visits in this hour/)).not.toBeInTheDocument();
  });

  it('offers a Rep tab, which one person’s plan would not', async () => {
    /* Two reps in this hour, so the tab earns its place. On a single rep's
       doctor plan the same def culls itself out. */
    const user = userEvent.setup();
    openSheet(many(6));

    await user.click(screen.getByRole('button', { name: 'Sort & filter' }));
    const tabs = (await screen.findAllByTestId('filter-sidebar-tab')).map((t) => t.textContent);
    expect(tabs.some((t) => t.includes('Rep'))).toBe(true);
  });

  it('forgets the search when another bar is tapped', async () => {
    /* The sheet stays mounted between opens, so a search left applied would
       make the next hour look empty rather than filtered. */
    const user = userEvent.setup();
    const { rerender } = openSheet(many(5));

    await user.type(search(), 'nobody');
    expect(screen.getByText(/No calls match these filters/)).toBeInTheDocument();

    rerender(
      <VisitsByHourSheet
        selection={{ hour: 15 }}
        rows={many(5).map((r) => ({ ...r, visitTime: '2026-09-05 15:10:00' }))}
        periodLabel="Sep 2026"
        scopeLabel="All HQs"
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByText(/No calls match these filters/)).not.toBeInTheDocument();
    expect(search()).toHaveValue('');
  });
});
