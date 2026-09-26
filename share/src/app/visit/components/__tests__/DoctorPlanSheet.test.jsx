import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DoctorPlanSheet } from '../DoctorPlanSheet';

/* Two things here are invisible in a screenshot and were wrong before: the
   force-visit detail only exists once a group is opened, and a manager's
   plan must no longer be their reports' plan. */

const TEAM = [
  { id: 'M', name: 'Manager', short: 'ABM', reportsTo: null, hq: 'HQ-Hubballi' },
  { id: 'A', name: 'Anil', short: 'BE', reportsTo: 'M', hq: 'HQ-Hubballi' },
];

function visit(over = {}) {
  return {
    eventId: 'EV1',
    subject: 'Visit',
    plannedDate: '2026-09-05',
    employeeId: 'A',
    employeeName: 'Anil',
    participantId: 'A',
    participantName: 'Anil',
    doctorId: 'DR-1',
    doctorName: 'Dr One',
    hq: 'HQ-Hubballi',
    department: 'Elbrit',
    pobGiven: false,
    visitTime: '2026-09-05 10:00:00',
    distanceKm: 0.2,
    forceVisit: false,
    forceVisitReason: '',
    ...over,
  };
}

function renderSheet(rows, member = TEAM[1]) {
  render(
    <DoctorPlanSheet
      member={member}
      team={TEAM}
      rows={rows}
      pob={[]}
      periodLabel="Sep 2026"
      onClose={vi.fn()}
    />,
  );
}

describe('DoctorPlanSheet', () => {
  it('lists one row per call, headed by the doctor', () => {
    renderSheet([visit()]);
    // By accessible name: the avatar beside it is aria-hidden, so the
    // button is named by the doctor once, not twice.
    expect(screen.getByRole('button', { name: /Dr One/ })).toBeInTheDocument();
  });

  it('does not show a report’s calls on their manager’s plan', () => {
    // The whole point of the change: an ABM used to see the entire branch.
    renderSheet([visit()], TEAM[0]);
    expect(screen.queryByText('Dr One')).not.toBeInTheDocument();
    expect(screen.getByText(/No visits attended in this period/)).toBeInTheDocument();
  });

  it('shows a joint call on both attendees’ plans', () => {
    const joint = [visit(), visit({ participantId: 'M', participantName: 'Manager' })];
    renderSheet(joint, TEAM[0]);
    expect(screen.getByRole('button', { name: /Dr One/ })).toBeInTheDocument();
  });

  it('reveals each attendee with their own status when expanded', async () => {
    const joint = [
      visit(),
      visit({
        participantId: 'M', participantName: 'Manager',
        forceVisit: true, distanceKm: 8.2, forceVisitReason: 'Met at the hospital',
      }),
    ];
    renderSheet(joint, TEAM[0]);

    // Collapsed: the attendees are not on screen yet.
    expect(screen.queryByText('Manager')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Dr One/ }));

    expect(screen.getByText('Anil')).toBeInTheDocument();
    expect(screen.getByText('Manager')).toBeInTheDocument();
    expect(screen.getByText('8.2 km away · Met at the hospital')).toBeInTheDocument();
  });

  it('does not colour a mixed call red, and says why', () => {
    // One attendee forced, one not: the call happened where it was meant to.
    const joint = [visit(), visit({ participantId: 'M', participantName: 'Manager', forceVisit: true })];
    renderSheet(joint, TEAM[0]);
    expect(screen.getAllByText('Geo').length).toBeGreaterThan(0);
    /* The role pill replaced the "1 forced" count: it names WHICH attendee
       was the forced one, which the count never did. */
    expect(screen.getByText(/ABM Force/)).toBeInTheDocument();
    expect(screen.getByText(/BE Geo/)).toBeInTheDocument();
  });

  it('marks a call forced when every attendee forced it', () => {
    renderSheet([visit({ forceVisit: true, distanceKm: 8.2 })]);
    expect(screen.getByText('Force')).toBeInTheDocument();
  });

  it('keeps a pending call pending', () => {
    renderSheet([visit({ visitTime: null, distanceKm: null })]);
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('closes one group when another opens', async () => {
    renderSheet([
      visit({ eventId: 'EV1', doctorName: 'Dr One' }),
      visit({ eventId: 'EV2', doctorName: 'Dr Two' }),
    ]);
    await userEvent.click(screen.getByRole('button', { name: /Dr One/ }));
    expect(screen.getAllByText('Anil').length).toBe(1);

    await userEvent.click(screen.getByRole('button', { name: /Dr Two/ }));
    expect(screen.getAllByText('Anil').length).toBe(1);
  });
});

describe('DoctorPlanSheet pending calls', () => {
  it('lists calls that have not happened yet', () => {
    renderSheet([visit({ visitTime: null, distanceKm: null })]);
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('falls back to the planned DAY when there is no visit time', () => {
    /* Without this the whole fact line was blank on a pending card — no
       time, no money — and a row showing only a doctor's name reads as a
       rendering fault rather than as work still to do. */
    renderSheet([visit({ visitTime: null, distanceKm: null, plannedDate: '2026-09-24' })]);
    expect(screen.getByText(/Planned 24 Sep/)).toBeInTheDocument();
  });

  it('counts pending calls in planned but not in done', () => {
    renderSheet([
      visit({ eventId: 'EV1', visitTime: '2026-09-05 10:00:00' }),
      visit({ eventId: 'EV2', visitTime: null, distanceKm: null }),
    ]);
    expect(screen.getByText(/2 visits planned · 1 done/)).toBeInTheDocument();
  });

  it('greys the rung of somebody who has not been yet', () => {
    renderSheet([visit({ visitTime: null, distanceKm: null })]);
    expect(screen.getByText(/BE Pending/)).toBeInTheDocument();
  });
});

/* The controls run over the whole plan, not the page on screen — which is
   the difference between a search box and a search box that lies. */
describe('DoctorPlanSheet controls', () => {
  /* Eighty calls: more than the first rendered page, which is the whole point
     of the controls running over the data rather than over the DOM. */
  const many = Array.from({ length: 80 }, (_, i) => ({
    ...visit(),
    eventId: `EV${i}`,
    doctorId: `DR-${1000 + i}`,
    /* The special one sorts LAST — earliest hour, and the default order is
       latest first — so it is genuinely off the first rendered page. */
    doctorName: i === 0 ? 'Dr Zebedee Last' : `Dr Number ${i}`,
    hq: i % 2 ? 'HQ-Hubballi' : 'HQ-Dharwad',
    visitTime: `2026-09-05 ${String(8 + (i % 9)).padStart(2, '0')}:00:00`,
  }));

  const search = () => screen.getByLabelText(/Search by doctor name or code/);
  const paneLabels = async () =>
    (await screen.findAllByTestId('filter-sidebar-tab')).map((t) => t.textContent);

  it('searches the whole plan and narrows to the one call', async () => {
    /* Jsdom has no IntersectionObserver, so the sheet renders every page here
       and the 80th row is already present — the paging itself is covered in
       useIncrementalList's own tests. What this holds is the half that
       matters either way: after a search the list IS the answer, not the
       answer plus the seventy-nine rows the reader was already looking at. */
    const user = userEvent.setup();
    renderSheet(many, TEAM[1]);

    expect(screen.queryByText('Dr Zebedee Last')).not.toBeInTheDocument();
    await user.type(search(), 'zebedee');
    expect(screen.getByText('Dr Zebedee Last')).toBeInTheDocument();
    expect(screen.queryByText('Dr Number 0')).not.toBeInTheDocument();
  });

  it('searches by doctor code as well as by name', async () => {
    // One is what the reader remembers, the other what the printout hands them.
    const user = userEvent.setup();
    renderSheet(many, TEAM[1]);

    await user.type(search(), 'dr-1000');
    expect(screen.getByText('Dr Zebedee Last')).toBeInTheDocument();
  });

  it('says the controls emptied the list, not that the plan is empty', async () => {
    /* "No visits planned in this period" would be a lie about the data rather
       than a report on the control. */
    const user = userEvent.setup();
    renderSheet(many, TEAM[1]);

    await user.type(search(), 'nobody');
    expect(screen.getByText(/No calls match these filters/)).toBeInTheDocument();
    expect(screen.queryByText(/No visits planned/)).not.toBeInTheDocument();
  });

  it('reports what the controls left, beside them', async () => {
    // Without the receipt a filtered list reads as a short plan.
    const user = userEvent.setup();
    renderSheet(many, TEAM[1]);

    expect(screen.queryByText('1/80')).not.toBeInTheDocument();
    await user.type(search(), 'zebedee');
    expect(screen.getByText('1/80')).toBeInTheDocument();
  });

  it('stays put while the list scrolls', () => {
    /* In the sheet's fixed toolbar, not in its body: a search box that
       scrolls away is one the reader scrolls back up to change, losing their
       place in the answer on the way. */
    renderSheet(many, TEAM[1]);
    expect(search().closest('.ds-sheet__toolbar')).not.toBeNull();
    expect(search().closest('.ds-sheet__body')).toBeNull();
  });

  it('puts sort and filter behind one trigger', async () => {
    const user = userEvent.setup();
    renderSheet(many, TEAM[1]);

    await user.click(screen.getByRole('button', { name: 'Sort & filter' }));
    const panes = await paneLabels();
    expect(panes[0]).toMatch(/Sort by/);
    expect(panes.some((t) => t.includes('Doctor'))).toBe(true);
  });

  it('offers only the fields this plan can tell apart', async () => {
    /* A tab listing one HQ is a tab whose every state is the same list, and
       on a single rep's plan that is most of them. */
    const user = userEvent.setup();
    renderSheet(many.map((v) => ({ ...v, hq: 'HQ-Hubballi' })), TEAM[1]);

    await user.click(screen.getByRole('button', { name: 'Sort & filter' }));
    const panes = await paneLabels();
    expect(panes.some((t) => t.includes('Doctor'))).toBe(true);
    expect(panes.some((t) => t.includes('HQ'))).toBe(false);
  });

  it('shows what is applied as chips, and drops one when it is tapped', async () => {
    /* The badge on the trigger says how many; only a chip says WHICH, and
       only a chip can be undone without opening the panel again. */
    const user = userEvent.setup();
    renderSheet(many, TEAM[1]);

    await user.click(screen.getByRole('button', { name: 'Sort & filter' }));
    await user.click(await screen.findAllByTestId('filter-sidebar-tab').then((t) => t[0]));
    await user.click((await screen.findAllByTestId('sort-option'))[0]);
    await user.click(screen.getByTestId('filter-apply'));

    const chip = await screen.findByRole('button', { name: /^Remove / });
    expect(chip).toBeInTheDocument();

    await user.click(chip);
    expect(screen.queryByRole('button', { name: /^Remove / })).not.toBeInTheDocument();
  });

  it('has no chip row over an untouched plan', () => {
    renderSheet(many, TEAM[1]);
    expect(screen.queryByRole('button', { name: /^Remove / })).not.toBeInTheDocument();
  });

  it('hides the controls when there is nothing to sift', () => {
    // A toolbar over an empty plan is a row of ways to keep it empty.
    renderSheet([], TEAM[1]);
    expect(screen.queryByLabelText(/Search by doctor name or code/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sort & filter' })).not.toBeInTheDocument();
  });
});

describe('DoctorPlanSheet filter reset', () => {
  const rowsFor = (id, name) => [{
    eventId: `EV-${id}`, plannedDate: '2026-09-05', employeeId: id, employeeName: name,
    participantId: id, participantName: name, doctorId: `DR-${id}`, doctorName: `Dr ${name}`,
    hq: 'HQ-Hubballi', department: 'Elbrit', pobGiven: false,
    visitTime: '2026-09-05 10:00:00', distanceKm: 0.2, forceVisit: false, forceVisitReason: '',
  }];

  it('forgets the search when another person’s plan opens', async () => {
    /* The sheet stays mounted between opens — `open` only decides whether it
       renders — so a search left applied made the next person's plan read as
       empty rather than as filtered. */
    const user = userEvent.setup();
    const { rerender } = render(
      <DoctorPlanSheet
        member={TEAM[1]} team={TEAM} rows={rowsFor('A', 'Anil')} pob={[]}
        periodLabel="Sep 2026" onClose={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText(/Search by doctor name or code/), 'nobody');
    expect(screen.getByText(/No calls match these filters/)).toBeInTheDocument();

    const other = { id: 'B', name: 'Bala', short: 'BE', reportsTo: 'M', hq: 'HQ-Hubballi' };
    rerender(
      <DoctorPlanSheet
        member={other} team={[...TEAM, other]} rows={rowsFor('B', 'Bala')} pob={[]}
        periodLabel="Sep 2026" onClose={vi.fn()}
      />,
    );

    expect(screen.queryByText(/No calls match these filters/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Search by doctor name or code/)).toHaveValue('');
    expect(screen.getByText('Dr Bala')).toBeInTheDocument();
  });

  it('forgets it when the sheet is closed and reopened on the same person', async () => {
    // Closing is `member = null`, which is a subject change like any other.
    const user = userEvent.setup();
    const { rerender } = render(
      <DoctorPlanSheet
        member={TEAM[1]} team={TEAM} rows={rowsFor('A', 'Anil')} pob={[]}
        periodLabel="Sep 2026" onClose={vi.fn()}
      />,
    );
    await user.type(screen.getByLabelText(/Search by doctor name or code/), 'nobody');

    const props = { team: TEAM, rows: rowsFor('A', 'Anil'), pob: [], periodLabel: 'Sep 2026', onClose: vi.fn() };
    rerender(<DoctorPlanSheet member={null} {...props} />);
    rerender(<DoctorPlanSheet member={TEAM[1]} {...props} />);

    expect(screen.getByLabelText(/Search by doctor name or code/)).toHaveValue('');
    expect(screen.getByText('Dr Anil')).toBeInTheDocument();
  });
});

/* Over a month the sheet merges a doctor's visits into one card. These pin
   what that card says that three separate cards did not. */
describe('DoctorPlanSheet over a month', () => {
  const twice = [
    visit({ eventId: 'EV1', plannedDate: '2026-09-05', visitTime: '2026-09-05 10:00:00' }),
    visit({ eventId: 'EV2', plannedDate: '2026-09-11', visitTime: '2026-09-11 15:30:00' }),
  ];

  function monthSheet(rows, showDate = true) {
    render(
      <DoctorPlanSheet
        member={TEAM[1]} team={TEAM} rows={rows} pob={[]}
        periodLabel="Sep 2026" showDate={showDate} onClose={vi.fn()}
      />,
    );
  }

  it('shows one card for a doctor seen twice, and says how many days', () => {
    monthSheet(twice);
    expect(screen.getAllByRole('button', { name: /Dr One/ })).toHaveLength(1);
    expect(screen.getByText(/2 day visits/)).toBeInTheDocument();
  });

  it('still counts the VISITS in the subtitle, not the cards', () => {
    // One card, two visits: the plan is what the subtitle reports.
    monthSheet(twice);
    expect(screen.getByText(/2 visits planned · 2 done/)).toBeInTheDocument();
  });

  it('names each rung once, however many times they went', () => {
    /* "BE BE" said nothing the day count does not say better. */
    monthSheet(twice);
    expect(screen.getAllByText(/BE Geo/)).toHaveLength(1);
  });

  it('gives every visit its own date and time once opened', async () => {
    const user = userEvent.setup();
    monthSheet(twice);
    await user.click(screen.getByRole('button', { name: /Dr One/ }));

    expect(screen.getByText('5 Sep')).toBeInTheDocument();
    expect(screen.getByText('11 Sep')).toBeInTheDocument();
    expect(screen.getByText('10:00 AM')).toBeInTheDocument();
    expect(screen.getByText('3:30 PM')).toBeInTheDocument();
  });

  it('does not merge in the day view, where every row is the same date', () => {
    // A doctor seen twice before lunch is two calls, and the day says so.
    monthSheet(twice, false);
    expect(screen.getAllByRole('button', { name: /Dr One/ })).toHaveLength(2);
    expect(screen.queryByText(/day visits/)).not.toBeInTheDocument();
  });
});

describe('DoctorPlanSheet merged card detail', () => {
  const sameDay = [
    visit({ eventId: 'EV1', plannedDate: '2026-09-05', visitTime: '2026-09-05 10:00:00' }),
    visit({ eventId: 'EV2', plannedDate: '2026-09-05', visitTime: '2026-09-05 16:30:00' }),
  ];
  const spread = [
    visit({ eventId: 'EV1', plannedDate: '2026-09-05', visitTime: '2026-09-05 10:00:00' }),
    visit({ eventId: 'EV2', plannedDate: '2026-09-11', visitTime: '2026-09-11 15:30:00' }),
  ];

  function monthSheet(rows) {
    render(
      <DoctorPlanSheet
        member={TEAM[1]} team={TEAM} rows={rows} pob={[]}
        periodLabel="Sep 2026" showDate onClose={vi.fn()}
      />,
    );
  }

  it('heads each day in the table, so the rows below need no date', async () => {
    const user = userEvent.setup();
    monthSheet(spread);
    await user.click(screen.getByRole('button', { name: /Dr One/ }));

    const headings = screen.getAllByRole('columnheader');
    expect(headings.map((h) => h.textContent)).toEqual(['5 Sep', '11 Sep']);
  });

  it('says how many visits when they all fall on ONE day', () => {
    /* "1 day visit" is what every other card would read, so the day count
       cannot tell a doctor seen twice before dinner from one seen once. */
    monthSheet(sameDay);
    expect(screen.getByText(/2 visits · 5 Sep/)).toBeInTheDocument();
    expect(screen.queryByText(/day visits/)).not.toBeInTheDocument();
  });

  it('drops the single clock time once a card holds more than one', async () => {
    // The earliest of two arrivals is a fact about one of them.
    monthSheet(sameDay);
    expect(screen.queryByText(/10:00 AM/)).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Dr One/ }));
    expect(screen.getByText('10:00 AM')).toBeInTheDocument();
    expect(screen.getByText('4:30 PM')).toBeInTheDocument();
  });

  it('leaves a single visit with its date and time, and no heading', async () => {
    const user = userEvent.setup();
    monthSheet([spread[0]]);
    expect(screen.getByText(/5 Sep · 10:00 AM/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Dr One/ }));
    expect(screen.queryAllByRole('columnheader')).toHaveLength(0);
  });
});
