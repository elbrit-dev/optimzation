import { describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { repsInAttendanceState } from '../../data/selectors';
import { AttendanceSheet } from '../AttendanceSheet';

/* "46 not reporting" is a number a manager can do nothing with; the forty-six
   NAMES are the morning's work. These pin what each card has to carry for
   that to be true. */

const be = (id, name, mgr) => ({ id, name, short: 'BE', reportsTo: mgr, hq: 'HQ-Hubballi' });
const team = [
  { id: 'M', name: 'Mohammed Tousif', short: 'ABM', reportsTo: null, hq: 'HQ-Hubballi' },
  be('A', 'Shankrappa Mannur', 'M'),
  be('Z', 'Idle Rep', 'M'),
];
const v = (id, i, done) => ({
  eventId: `EV${id}${i}`, plannedDate: '2026-09-23', employeeId: id, employeeName: id,
  doctorId: 'DR-1', doctorName: 'Dr One', hq: 'HQ-Hubballi', pobGiven: false,
  visitTime: done ? '2026-09-23 10:00:00' : null, distanceKm: null, forceVisit: false, forceVisitReason: '',
});
/* `calendar` is every working day in the window, Mon–Sat, which the report
   computes and hands down. It is what the day-based states are measured over
   AND the denominator of each card's "N/M days" — one list, so the two can
   never disagree. A single day unless a test says otherwise. */
const sheet = (state, rows, overRange = false, calendar = ['2026-09-23']) =>
  render(
    <AttendanceSheet
      state={state}
      team={team}
      rows={rows}
      overRange={overRange}
      calendar={calendar}
      onClose={vi.fn()}
    />,
  );

describe('AttendanceSheet cards', () => {
  it('names the rep and their territory', () => {
    sheet('working', [v('A', 0, true)]);
    expect(screen.getByText('Shankrappa Mannur')).toBeInTheDocument();
    expect(screen.getByText('Hubballi')).toBeInTheDocument();
  });

  it('badges the role, and says nothing about who they report to', () => {
    /* "reports to X" is a fact about the ORG on a card about a DAY, and the
       reader has usually arrived from that manager's own row. */
    sheet('working', [v('A', 0, true)]);
    expect(screen.getAllByText('BE').length).toBeGreaterThan(0);
    expect(screen.queryByText(/reports to/)).not.toBeInTheDocument();
  });

  it('heads the card with DAYS reported over working days', () => {
    /* Not visits done over planned: the bar underneath already decomposes
       that, and it cannot tell a rep who logged forty visits on two days from
       one who logged twenty across ten. Days is what the chip counts.

       document.body, not the render container: Sheet PORTALS, so anything
       scoped to the container finds nothing and an absence assertion there
       passes for the wrong reason. Scoped to the figure's own box because the
       legend counts are bare digits too. */
    const rows = [
      { ...v('A', 0, true), plannedDate: '2026-09-04' },
      { ...v('A', 1, false), plannedDate: '2026-09-04' },
      { ...v('A', 2, false), plannedDate: '2026-09-11' },
    ];
    sheet('working', rows, true, ['2026-09-04', '2026-09-05', '2026-09-11']);

    /* Reported on one of the window's three working days — and the figure
       says WHICH days it counts, because the same shape of number means days
       made on one list and days lost on the next. */
    expect(screen.getAllByText('Reported').length).toBeGreaterThan(0);
    expect(document.querySelector('.tabular-nums').textContent).toBe('1/3 days');
    expect(screen.getByLabelText('1 geo verified, 0 force visit, 2 pending')).toBeInTheDocument();
    expect(screen.queryByText(/visits done/)).not.toBeInTheDocument();
  });

  it('shows no days figure on a single day', () => {
    /* "1/1 days" is a ratio with nothing to vary, and the sheet's title
       already says which day it is. The bar still draws — that one says
       something on any window. */
    sheet('working', [v('A', 0, true)], false);
    expect(document.querySelector('.ds-bar--stacked')).not.toBeNull();
    expect(document.querySelector('.tabular-nums')).toBeNull();
  });

  it('shows neither figure nor bar when there is nothing to divide or draw', () => {
    /* An empty track under three zeros is furniture, and a rep with no plan
       has no bar to draw.

       Both queries go through document, for the portal reason above — and
       the first assertion here is what proves this test can fail at all. */
    sheet('working', [v('A', 0, true)]);
    expect(document.querySelector('.ds-bar--stacked')).not.toBeNull();

    cleanup();
    sheet('notReporting', [], false, []);
    expect(document.querySelector('.ds-bar--stacked')).toBeNull();
    expect(document.querySelector('.tabular-nums')).toBeNull();
  });

  it('still says when nobody is in the state', () => {
    sheet('onLeave', [v('A', 0, true)]);
    expect(screen.getByText(/No one in this scope/)).toBeInTheDocument();
  });
});

/* "Not reported" over a month is a rep who was silent on some of its days.
   The next question is always WHICH DAYS. */
describe('AttendanceSheet day drill-down', () => {
  const on = (day) => ({ ...v('Z', day, false), plannedDate: `2026-09-${day}` });
  const week = ['2026-09-04', '2026-09-11'];

  /* EVERY ROW IS OPENABLE NOW, because every person in scope has the window's
     working days and a silent one puts them on this list. So the button has
     to be found by WHOSE card it is rather than by being the only one. */
  const openCard = async (user, name) => {
    const card = screen
      .getAllByRole('button', { expanded: false })
      .find((b) => b.textContent.includes(name));
    await user.click(card);
  };

  it('opens a row onto the days behind it', async () => {
    const user = userEvent.setup();
    sheet('notReporting', [on('04'), on('04'), on('11')], true, week);

    // Closed to begin with: the card is the summary, the days are the detail.
    expect(screen.queryByText(/Fri, 4 Sep/)).not.toBeInTheDocument();

    await openCard(user, 'Idle Rep');
    expect(screen.getByText(/Fri, 4 Sep 2026/)).toBeInTheDocument();
    expect(screen.getByText(/Fri, 11 Sep 2026/)).toBeInTheDocument();
  });

  it('counts a day once, however many calls were planned on it', () => {
    /* The question is "which days", and a day with two planned calls is
       still one day — it just lost two calls instead of one. */
    const people = repsInAttendanceState(team, [on('04'), on('04'), on('11')], 'notReporting', true, week);
    const [rep] = people.filter((p) => p.id === 'Z');
    expect(rep.days).toEqual([
      { date: '2026-09-04', planned: 2, happened: 0, verified: 0, force: 0 },
      { date: '2026-09-11', planned: 1, happened: 0, verified: 0, force: 0 },
    ]);
  });

  it('lists a working day nobody planned, not just the ones they were given', async () => {
    /* A day with no plan is still a day they did not report — which is the
       whole reason the days come off the calendar rather than off the plan.
       The wording separates the two: one is a rep who did not do the work,
       the other is nobody having scheduled any. */
    const user = userEvent.setup();
    sheet('notReporting', [on('04')], true, week);

    await openCard(user, 'Idle Rep');
    expect(screen.getByText('1 planned, none done')).toBeInTheDocument();
    expect(screen.getByText('No plan')).toBeInTheDocument();
  });

  it('stays flat on a single day, where the title already says when', () => {
    // An expander that answers the question in the heading is a wasted tap.
    sheet('notReporting', [on('04')], false);
    expect(screen.queryByRole('button', { expanded: false })).not.toBeInTheDocument();
  });

  it('never offers an expander when the window holds no working days', () => {
    sheet('notReporting', [], true, []);
    expect(screen.queryByRole('button', { expanded: false })).not.toBeInTheDocument();
  });
});

/* The expander belongs to ONE list. A reported rep's days are already in the
   bar — split and ratio between them say what happened — so opening a row
   there offers a second reading of a fact just read. */
describe('AttendanceSheet: what each list opens onto', () => {
  const day = (id, date, done) => ({
    ...v(id, date, done), plannedDate: `2026-09-${date}`,
  });

  it('lists the SILENT days on Not reported, and only those', async () => {
    /* The buckets overlap now, so this person also appears under Reported.
       Listing the day they DID work under a "Not reported" heading answers a
       question nobody asked. */
    const user = userEvent.setup();
    sheet('notReporting', [day('A', '04', true), day('A', '11', false)], true, [
      '2026-09-04',
      '2026-09-11',
    ]);

    const card = screen
      .getAllByRole('button', { expanded: false })
      .find((b) => b.textContent.includes('Shankrappa Mannur'));
    await user.click(card);
    expect(screen.getByText(/Fri, 11 Sep 2026/)).toBeInTheDocument();
    expect(screen.queryByText(/Fri, 4 Sep 2026/)).not.toBeInTheDocument();
  });

  it('counts the days MISSED on Not reported, and the days made on Reported', () => {
    /* One denominator, two numerators: the figure answers the list it is on
       and names which days it counted, so a rep on both lists shows two
       labelled figures that add up to the window. */
    const rows = [day('A', '04', true), day('A', '11', false)];
    const week = ['2026-09-04', '2026-09-11'];

    sheet('working', rows, true, week);
    expect(screen.getAllByText('Reported').length).toBeGreaterThan(0);
    expect(screen.queryByText('Not reported')).not.toBeInTheDocument();
    expect(document.querySelector('.tabular-nums').textContent).toBe('1/2 days');

    cleanup();
    sheet('notReporting', rows, true, week);
    expect(screen.getAllByText('Not reported').length).toBeGreaterThan(0);
    /* Same rep, same window, the other half of it — one day made, one lost. */
    const figures = [...document.querySelectorAll('.tabular-nums')].map((n) => n.textContent);
    expect(figures).toContain('1/2 days');
  });

  it('charts the run of days on Reported rather than listing them', async () => {
    /* Asserted at the CONTAINER, not at the drawn line: Recharts measures its
       parent and jsdom reports every element as 0x0, so the SVG inside is
       never rendered here. What the chart draws is covered by trendSeries's
       own tests, which are pure; what this pins is that the Reported sheet
       reaches for the chart and not the list. */
    const user = userEvent.setup();
    sheet('working', [day('A', '04', true), day('A', '11', false), day('A', '18', true)], true);

    await user.click(screen.getByRole('button', { expanded: false }));
    expect(document.querySelector('.recharts-responsive-container')).toBeInTheDocument();
    expect(screen.queryByText(/planned, none done/)).not.toBeInTheDocument();
  });

  it('lists rather than charts on Not reported', () => {
    // The mirror of the above: one question each, one view each.
    sheet('notReporting', [day('Z', '04', false)], true);
    expect(document.querySelector('.recharts-responsive-container')).not.toBeInTheDocument();
  });

  it('opens neither list on a single day', () => {
    for (const state of ['working', 'notReporting']) {
      cleanup();
      sheet(state, [day('A', '04', true)], false);
      expect(screen.queryByRole('button', { expanded: false })).not.toBeInTheDocument();
    }
  });
});

/* The call average sits beside the role because it is the other thing that
   describes the REP rather than the period. */
describe('AttendanceSheet call average', () => {
  const day = (id, date, done) => ({ ...v(id, date, done), plannedDate: `2026-09-${date}` });
  const week = ['2026-09-04', '2026-09-05', '2026-09-07', '2026-09-08'];

  it('divides by the window, not by the days they turned up', () => {
    /* Two visits in a four-day window is 0.5 a day. On the other denominator
       it would be 2.0 — a rep who worked once and did two calls would read as
       the best on the screen for having worked once, and would not match the
       Call average KPI above the sheet, which divides by working days. */
    sheet('working', [day('A', '04', true), day('A', '04', true)], true, week);
    expect(screen.getByText('0.5 calls/day')).toBeInTheDocument();
  });

  it('says nothing when there is no window to divide by', () => {
    /* "0.0 calls/day" is a claim about a rep nobody gave a window to. Rows
       still make days of their own even outside the calendar — that fallback
       is deliberate, so a visit is never dropped — which is why this needs a
       person with no rows AND no calendar to have no days at all. */
    sheet('notReporting', [], true, []);
    expect(screen.getAllByText('Idle Rep').length).toBeGreaterThan(0);
    expect(screen.queryByText(/calls\/day/)).not.toBeInTheDocument();
  });

  it('shows no average on a vacant seat', () => {
    // There is no rep there to have one.
    sheet('vacant', [], true, ['2026-09-04', '2026-09-05']);
    expect(screen.queryByText(/calls\/day/)).not.toBeInTheDocument();
  });
});
