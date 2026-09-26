import { describe, expect, it } from 'vitest';
import {
  activeReps,
  asOfFrom,
  attainment,
  attendance,
  attendanceOf,
  attendanceStatesOf,
  byHq,
  callAverage,
  CHART_HOURS,
  doctorPlan,
  forEmployees,
  geoSplit,
  happened,
  planned,
  inPeriod,
  leaveDaysOf,
  monthEnd,
  periodWindow,
  pobGiven,
  pobTotal,
  repsInAttendanceState,
  resolveSelection,
  rollupFor,
  subtreeOf,
  visitsByHour,
  visitsIn,
  groupByEvent,
} from '../selectors';
import {
  countWorkingDays,
  formatClock,
  formatCurrency,
  formatDayHeading,
  formatHour,
  formatMonthName,
  formatPercent,
  hqLabel,
  periodSuffix,
} from '../format';
import { buildMockDataset } from '../mockData';

/* These are the functions every number on the screen comes from, and they are
   pure — so they get tested directly rather than through a render. The cases
   below are the ones that were wrong at some point, not a checklist. */

function row(over = {}) {
  return {
    eventId: 'EV1',
    plannedDate: '2026-09-05',
    employeeId: 'E1',
    hq: 'HQ-Hubballi',
    pobGiven: false,
    visitTime: null,
    distanceKm: null,
    forceVisit: false,
    ...over,
  };
}

describe('attainment', () => {
  it('is null for an empty plan, not zero', () => {
    // 0% reads as failure; a vacant seat has no plan to fail at.
    expect(attainment([])).toBeNull();
  });

  it('is the completed fraction', () => {
    const rows = [row({ visitTime: '2026-09-05 10:00:00' }), row(), row(), row()];
    expect(attainment(rows)).toBe(0.25);
  });
});

describe('happened / pobGiven', () => {
  it('counts only rows with a visit time', () => {
    const rows = [row({ visitTime: '2026-09-05 10:00:00' }), row()];
    expect(happened(rows)).toBe(1);
  });

  it('measures POB against completed visits, not against the plan', () => {
    const rows = [
      row({ visitTime: '2026-09-05 10:00:00', pobGiven: true }),
      row({ visitTime: '2026-09-05 11:00:00', pobGiven: false }),
      row({ pobGiven: true }), // planned, never happened — must not count either way
    ];
    expect(pobGiven(rows)).toEqual({ given: 1, of: 2 });
  });
});

describe('pobTotal', () => {
  it('sums the real ₹ amount, not a count', () => {
    const pobRows = [{ employeeId: 'E1', amount: 1000 }, { employeeId: 'E1', amount: 500.5 }];
    expect(pobTotal(pobRows)).toBe(1500.5);
  });

  it('is 0 for no entries, not null -- there is nothing to divide by yet, but the total itself is a real zero', () => {
    expect(pobTotal([])).toBe(0);
  });

  it('treats a missing amount as 0 rather than poisoning the sum with NaN', () => {
    expect(pobTotal([{ employeeId: 'E1', amount: undefined }, { employeeId: 'E1', amount: 200 }])).toBe(200);
  });
});

describe('callAverage', () => {
  it('divides by working days so a month is comparable to the daily standard', () => {
    const rows = Array.from({ length: 100 }, () => row({ visitTime: '2026-09-05 10:00:00' }));
    expect(callAverage(rows, 10, 1)).toBe(10);
    expect(callAverage(rows, 10, 5)).toBe(2);
  });

  it('is null with no working reps rather than dividing by zero', () => {
    expect(callAverage([row()], 0, 1)).toBeNull();
  });
});

describe('visitsByHour', () => {
  it('always returns the full fixed axis, in order', () => {
    const out = visitsByHour([]);
    expect(out.map((b) => b.hour)).toEqual(CHART_HOURS);
  });

  it('splits verified from force', () => {
    const out = visitsByHour([
      row({ visitTime: '2026-09-05 11:30:00' }),
      row({ visitTime: '2026-09-05 11:45:00', forceVisit: true }),
    ]);
    const eleven = out.find((b) => b.hour === 11);
    expect(eleven).toEqual({ hour: 11, verified: 1, force: 1 });
  });

  it('puts an early start and a late finish in their OWN hours', () => {
    /* This used to FOLD a 7:15am call into the 9am bar and a 9pm one into
       5pm, so the two shapes anybody actually opens this chart to find --
       the early start and the long evening -- were the only two it could
       not draw. */
    const out = visitsByHour([
      row({ visitTime: '2026-09-05 07:15:00' }),
      row({ visitTime: '2026-09-05 21:00:00' }),
    ]);
    expect(out.find((b) => b.hour === 7).verified).toBe(1);
    expect(out.find((b) => b.hour === 21).verified).toBe(1);
    expect(out.find((b) => b.hour === 9).verified).toBe(0);
    expect(out.find((b) => b.hour === 17).verified).toBe(0);
  });

  it('is the whole day, midnight to 11pm, whatever the data does', () => {
    // A fixed axis is what lets two HQ chips be compared: the 2pm column is
    // in the same place on both.
    for (const rows of [[], [row({ visitTime: '2026-09-05 07:15:00' })]]) {
      const out = visitsByHour(rows);
      expect(out).toHaveLength(24);
      expect(out[0].hour).toBe(0);
      expect(out[23].hour).toBe(23);
    }
  });

  it('keeps the empty hours rather than closing the gap', () => {
    // A chart that omits its empty hours is a chart whose spacing lies.
    const out = visitsByHour([
      row({ visitTime: '2026-09-05 07:00:00' }),
      row({ visitTime: '2026-09-05 09:00:00' }),
    ]);
    expect(out.map((b) => b.hour).slice(7, 10)).toEqual([7, 8, 9]);
    expect(out.find((b) => b.hour === 8).verified).toBe(0);
  });

  it('ignores an unparseable hour rather than bucketing it at midnight', () => {
    expect(visitsByHour([row({ visitTime: 'not-a-timestamp' })]).every((b) => b.verified === 0)).toBe(true);
  });

  it('ignores rows that never happened', () => {
    const out = visitsByHour([row()]);
    expect(out.every((b) => b.verified === 0 && b.force === 0)).toBe(true);
  });
});

describe('visitsIn', () => {
  it('returns the rows behind one bar, in clock order', () => {
    const rows = [
      row({ eventId: 'B', visitTime: '2026-09-05 14:40:00', doctorName: 'Dr Late' }),
      row({ eventId: 'A', visitTime: '2026-09-05 14:05:00', doctorName: 'Dr Early' }),
      row({ eventId: 'C', visitTime: '2026-09-05 15:05:00', doctorName: 'Dr Other' }),
    ];
    expect(visitsIn(rows, { hour: 14 }).map((v) => v.doctorName)).toEqual(['Dr Early', 'Dr Late']);
  });

  it('agrees with the bar it was opened from, at the widened edges too', () => {
    // The sheet reads the same chartHourOf the bar does, so a 7am call is in
    // the 7am bar AND the 7am list — or the list contradicts the number that
    // opened it.
    const rows = [
      row({ eventId: 'A', visitTime: '2026-09-05 07:15:00' }),
      row({ eventId: 'B', visitTime: '2026-09-05 09:30:00' }),
      row({ eventId: 'C', visitTime: '2026-09-05 21:00:00' }),
    ];
    const bars = visitsByHour(rows);
    for (const bar of bars) {
      const behind = visitsIn(rows, { hour: bar.hour });
      expect(behind).toHaveLength(bar.verified + bar.force);
    }
  });

  it('filters to a series when given a tone', () => {
    const rows = [
      row({ eventId: 'A', visitTime: '2026-09-05 10:00:00' }),
      row({ eventId: 'B', visitTime: '2026-09-05 11:00:00', forceVisit: true }),
    ];
    expect(visitsIn(rows, { tone: 'force' }).map((v) => v.eventId ?? v.id)).toHaveLength(1);
    expect(visitsIn(rows, { tone: 'force' })[0].forceVisit).toBe(true);
    expect(visitsIn(rows, { tone: 'verified' })[0].forceVisit).toBe(false);
  });

  it('intersects hour and tone rather than picking one', () => {
    const rows = [
      row({ eventId: 'A', visitTime: '2026-09-05 10:00:00', forceVisit: true }),
      row({ eventId: 'B', visitTime: '2026-09-05 11:00:00', forceVisit: true }),
    ];
    expect(visitsIn(rows, { hour: 11, tone: 'force' })).toHaveLength(1);
  });

  it('never returns a pending call — a plan has no hour to be plotted at', () => {
    expect(visitsIn([row(), row({ visitTime: null })], {})).toEqual([]);
  });

  it('keys rows uniquely when one Event carries two participants', () => {
    const shared = [
      row({ eventId: 'SAME', employeeId: 'A', visitTime: '2026-09-05 10:00:00' }),
      row({ eventId: 'SAME', employeeId: 'B', visitTime: '2026-09-05 10:30:00' }),
    ];
    const out = visitsIn(shared, { hour: 10 });
    expect(new Set(out.map((v) => v.id)).size).toBe(2);
  });

  it('drops a reason left on a row whose force flag is off', () => {
    const rows = [
      row({ visitTime: '2026-09-05 10:00:00', forceVisit: false, forceVisitReason: 'Clinic closed' }),
    ];
    expect(visitsIn(rows, {})[0].forceVisitReason).toBe('');
  });
});

describe('joint call attribution', () => {
  /* EV288782, read live from erp.elbrit.org: one doctor, one plan owned by
     E00869, attended by E00869 and E00102. Before the fix this scored two
     planned visits against E00869 and none against E00102 -- one doctor
     counted twice, and the person who went credited nowhere. */
  const joint = [
    row({
      eventId: 'EV288782', planOwnerId: 'E00869', employeeId: 'E00869', participantId: 'E00869',
      doctorId: 'DR-55992', doctorName: 'Dr G.Narayanan', hq: 'HQ-Erode',
      visitTime: '2026-09-22 15:27:06',
    }),
    row({
      eventId: 'EV288782', planOwnerId: 'E00869', employeeId: 'E00102', participantId: 'E00102',
      doctorId: 'DR-55992', doctorName: 'Dr G.Narayanan', hq: 'HQ-Erode',
      visitTime: '2026-09-22 15:25:36',
    }),
  ];

  it('counts one planned visit for each person, not two for one of them', () => {
    expect(planned(forEmployees(joint, new Set(['E00869'])))).toBe(1);
    expect(happened(forEmployees(joint, new Set(['E00869'])))).toBe(1);
  });

  it('credits the colleague who actually attended', () => {
    // Previously 0: their row carried the plan owner's id.
    expect(planned(forEmployees(joint, new Set(['E00102'])))).toBe(1);
    expect(happened(forEmployees(joint, new Set(['E00102'])))).toBe(1);
  });

  it('still counts the call once per attendee at HQ level, not four times', () => {
    const team = [
      { id: 'E00869', name: 'Rep', short: 'BE', reportsTo: 'E00102', hq: 'HQ-Erode' },
      { id: 'E00102', name: 'Mgr', short: 'ABM', reportsTo: null, hq: 'HQ-Erode' },
    ];
    const [hq] = byHq(joint, team);
    /* TWO visits and TWO people, which is the point: a joint call is one
       call and two attendances, and both sides of the ratio have to agree
       about that. The headcount used to be BEs only, so this same call
       credited two visits against one head. */
    expect(hq.planned).toBe(2);
    expect(hq.totalReps).toBe(2);
    expect(hq.activeReps).toBe(2);
  });

  it('keeps the money on the plan owner rather than duplicating it', () => {
    const pob = [{ employeeId: 'E00869', doctorId: 'DR-55992', plannedDate: '2026-09-05', amount: 900 }];
    const team = [{ id: 'E00869', name: 'Rep', short: 'BE', reportsTo: null, hq: 'HQ-Erode' }];
    const [call] = groupByEvent(doctorPlan(team[0], team, joint, pob));
    expect(call.participants).toHaveLength(2);
    expect(call.pob).toBe(900);
  });
});

describe('resolveSelection', () => {
  const team = [{ id: 'A' }, { id: 'B' }];
  const fallback = [{ id: 'A', includeSubtree: true }];

  it('falls back when nobody has chosen yet', () => {
    expect(resolveSelection(null, team, fallback)).toEqual(fallback);
    expect(resolveSelection(undefined, team, fallback)).toEqual(fallback);
  });

  it('honours an explicitly empty selection', () => {
    /* THE POINT OF THIS FUNCTION. Unticking the last node used to snap
       straight back to the default, so the top could never be cleared and
       the control fought the reader. */
    expect(resolveSelection([], team, fallback)).toEqual([]);
  });

  it('keeps the picks that still exist', () => {
    const picks = [{ id: 'B', includeSubtree: false }];
    expect(resolveSelection(picks, team, fallback)).toEqual(picks);
  });

  it('drops picks the roster no longer contains', () => {
    const picks = [{ id: 'B' }, { id: 'GONE' }];
    expect(resolveSelection(picks, team, fallback)).toEqual([{ id: 'B' }]);
  });

  it('falls back when every pick has gone stale', () => {
    // A roster change under a saved scope is NOT the same as asking for
    // nobody, so this one still falls back rather than clearing.
    expect(resolveSelection([{ id: 'GONE' }], team, fallback)).toEqual(fallback);
  });

  it('can still be cleared when the fallback is itself empty', () => {
    expect(resolveSelection([], team, [])).toEqual([]);
    expect(resolveSelection(null, team, [])).toEqual([]);
  });
});

describe('groupByEvent', () => {
  function visit(over = {}) {
    return {
      id: 'EV1#0', eventId: 'EV1', doctorName: 'Dr One', hq: 'HQ-Hubballi',
      participantName: 'Anil', visitTime: '2026-09-05 10:00:00', forceVisit: false, ...over,
    };
  }

  it('puts the two halves of a joint call back into one row', () => {
    const groups = groupByEvent([
      visit({ id: 'EV1#0', participantName: 'Anil' }),
      visit({ id: 'EV1#1', participantName: 'Manager', visitTime: '2026-09-05 10:20:00' }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].participants.map((p) => p.participantName)).toEqual(['Anil', 'Manager']);
    expect(groups[0].attended).toBe(2);
  });

  it('keeps separate events separate', () => {
    expect(groupByEvent([visit({ eventId: 'A' }), visit({ eventId: 'B' })])).toHaveLength(2);
  });

  it('takes the earliest arrival as the call time', () => {
    // A group headed by the LAST arrival sorts a joint call after solo calls
    // that finished before it even started.
    const [g] = groupByEvent([
      visit({ id: 'a', visitTime: '2026-09-05 10:40:00' }),
      visit({ id: 'b', visitTime: '2026-09-05 10:05:00' }),
    ]);
    expect(g.visitTime).toBe('2026-09-05 10:05:00');
  });

  it('is forced only when every attendee forced it', () => {
    // One rep at the clinic and their manager in the car park is a call that
    // happened where it was meant to; red would accuse the rep.
    const [mixed] = groupByEvent([
      visit({ id: 'a', forceVisit: false }),
      visit({ id: 'b', forceVisit: true }),
    ]);
    expect(mixed.forceVisit).toBe(false);
    expect(mixed.mixed).toBe(true);

    const [all] = groupByEvent([
      visit({ id: 'a', forceVisit: true }),
      visit({ id: 'b', forceVisit: true }),
    ]);
    expect(all.forceVisit).toBe(true);
    expect(all.mixed).toBe(false);
  });

  it('is pending when nobody has been yet, and not forced', () => {
    const [g] = groupByEvent([visit({ visitTime: null, forceVisit: false })]);
    expect(g.visitTime).toBeNull();
    expect(g.forceVisit).toBe(false);
    expect(g.attended).toBe(0);
  });

  it('does not merge rows that have no event id', () => {
    const groups = groupByEvent([
      { id: 'x', eventId: undefined, doctorName: 'Dr A', participants: [] },
      { id: 'y', eventId: undefined, doctorName: 'Dr B', participants: [] },
    ]);
    expect(groups).toHaveLength(2);
  });
});

describe('geoSplit', () => {
  it('counts completed visits only', () => {
    expect(
      geoSplit([
        row({ visitTime: '2026-09-05 10:00:00' }),
        row({ visitTime: '2026-09-05 10:00:00', forceVisit: true }),
        row({ forceVisit: true }), // planned but not done
      ]),
    ).toMatchObject({ verified: 1, force: 1 });
  });

  it('counts the joint half of each state as a SUBSET, not a fourth state', () => {
    /* `jointVerified` is part of `verified`, not a peer of it. A caller that
       adds all six together gets double the visits, which is why the second
       bar is drawn against `planned` rather than against its own sum. */
    const split = geoSplit([
      row({ visitTime: '2026-09-05 10:00:00', participantCount: 2 }),
      row({ visitTime: '2026-09-05 10:00:00' }),
      row({ visitTime: '2026-09-05 11:00:00', forceVisit: true, participantCount: 3 }),
      row({ participantCount: 2 }), // joint and still pending
    ]);
    expect(split).toEqual({
      verified: 2, force: 1, jointVerified: 1, jointForce: 1, jointPending: 1,
    });
  });

  it('treats a row with no participant count as solo rather than as joint', () => {
    // The mock and any older cached payload predate the field.
    expect(geoSplit([row({ visitTime: '2026-09-05 10:00:00' })]).jointVerified).toBe(0);
  });
});

describe('attendance', () => {
  const team = [
    { id: 'A', short: 'BE', vacant: false, onLeave: false, hq: 'HQ-Hubballi' },
    { id: 'B', short: 'BE', vacant: false, onLeave: false, hq: 'HQ-Hubballi' },
    { id: 'C', short: 'BE', vacant: false, onLeave: true, hq: 'HQ-Hubballi' },
    { id: 'D', short: 'BE', vacant: true, onLeave: false, hq: 'HQ-Hubballi' },
    { id: 'M', short: 'ABM', vacant: false, onLeave: false, hq: 'HQ-Hubballi' },
  ];

  it('resolves one state per rep in priority order', () => {
    const worked = new Set(['A']);
    expect(attendanceOf(team[0], worked)).toBe('working');
    expect(attendanceOf(team[1], worked)).toBe('notReporting');
    expect(attendanceOf(team[2], worked)).toBe('onLeave');
    expect(attendanceOf(team[3], worked)).toBe('vacant');
  });

  it('counts everyone in scope, managers included', () => {
    /* It was BEs only. Managers make calls too — a fifth of the plan is
       joint — and a card counting fewer people than the tree below it lists
       invites the reader to go looking for the difference. */
    const { counts } = attendance([row({ employeeId: 'A', visitTime: '2026-09-05 10:00:00' })], team);
    expect(counts.working + counts.notReporting + counts.onLeave + counts.vacant).toBe(team.length);
  });

  it('excludes vacancies from the in-field denominator', () => {
    // "17 of 19 reported" must not count seats nobody sits in as absentees.
    const { working, inScope } = attendance(
      [row({ employeeId: 'A', visitTime: '2026-09-05 10:00:00' })],
      team,
    );
    expect(working).toBe(1);
    // Four people, one of them a vacant seat: the manager is in scope now.
    expect(inScope).toBe(4);
  });

  it('does not count a planned-but-unvisited row as working', () => {
    const { counts } = attendance([row({ employeeId: 'A' })], team);
    expect(counts.working).toBe(0);
  });
});

describe('activeReps', () => {
  const team = [
    { id: 'A', short: 'BE' },
    { id: 'B', short: 'BE' },
    { id: 'M', short: 'ABM' },
  ];

  it('counts distinct reps who logged at least one visit', () => {
    expect(
      activeReps([
        row({ employeeId: 'A', visitTime: '2026-09-05 10:00:00' }),
        row({ employeeId: 'A', visitTime: '2026-09-05 11:00:00' }),
        row({ employeeId: 'B' }),
      ], team),
    ).toBe(1);
  });

  it('counts a manager who logged a call of their own', () => {
    /* It used to exclude them, on the reading that a visit against a manager
       was an Event mis-tagged to one. Since the attribution moved to the
       PARTICIPANT that is no longer what such a row means: it is a joint call
       the manager actually attended, and on live September data those are 29%
       of all completed visits. Counting the visit on top while leaving the
       person out of the bottom made the call average a ratio between two
       different populations. */
    expect(
      activeReps([
        row({ employeeId: 'A', visitTime: '2026-09-05 10:00:00' }),
        row({ employeeId: 'M', visitTime: '2026-09-05 10:00:00' }),
      ], team),
    ).toBe(2);
  });

  it('never counts a vacant seat, whatever is logged against it', () => {
    // Nobody sits in it to have reported; dividing by it understates the team.
    const withVacancy = [...team, { id: 'V', short: 'BE', vacant: true }];
    expect(
      activeReps([
        row({ employeeId: 'A', visitTime: '2026-09-05 10:00:00' }),
        row({ employeeId: 'V', visitTime: '2026-09-05 10:00:00' }),
      ], withVacancy),
    ).toBe(1);
  });
});

describe('subtreeOf', () => {
  const team = [
    { id: 'SM', reportsTo: null, short: 'SM' },
    { id: 'RBM', reportsTo: 'SM', short: 'RBM' },
    { id: 'ABM', reportsTo: 'RBM', short: 'ABM' },
    { id: 'BE', reportsTo: 'ABM', short: 'BE' },
    { id: 'OTHER', reportsTo: null, short: 'SM' },
  ];

  it('includes the root and everything under it', () => {
    expect(subtreeOf(team, 'RBM').map((m) => m.id).sort()).toEqual(['ABM', 'BE', 'RBM']);
  });

  it('returns empty for an unknown root rather than throwing', () => {
    expect(subtreeOf(team, 'nobody')).toEqual([]);
  });

  it('terminates on a reports_to cycle', () => {
    // ERPNext does not prevent one, and a recursive walk would blow the stack.
    const cyclic = [
      { id: 'X', reportsTo: 'Y' },
      { id: 'Y', reportsTo: 'X' },
    ];
    expect(subtreeOf(cyclic, 'X').map((m) => m.id).sort()).toEqual(['X', 'Y']);
  });
});

describe('byHq', () => {
  const team = [
    { id: 'A', short: 'BE', hq: 'HQ-Hubballi', vacant: false },
    { id: 'B', short: 'BE', hq: 'HQ-Hubballi', vacant: false },
    { id: 'V', short: 'BE', hq: 'HQ-Hubballi', vacant: true },
    { id: 'M', short: 'ABM', hq: 'HQ-Hubballi', vacant: false },
  ];

  it('counts every non-vacant person in the territory, managers included', () => {
    /* Three people here — two BEs and their ABM — because the ABM's own
       joint calls already count toward this card's visits. Counting them on
       top while leaving them out of the headcount is what made a territory
       look busier per head than it was. The vacant seat stays out: nobody
       sits in it to have reported. */
    const [hub] = byHq([row({ employeeId: 'A', visitTime: '2026-09-05 10:00:00' }), row({ employeeId: 'B' })], team);
    expect(hub.totalReps).toBe(3);
    expect(hub.activeReps).toBe(1);
    expect(hub.planned).toBe(2);
    expect(hub.happened).toBe(1);
  });

  it('counts a manager as active when they logged a call', () => {
    const [hub] = byHq([row({ employeeId: 'M', visitTime: '2026-09-05 10:00:00' })], team);
    expect(hub.activeReps).toBe(1);
  });

  it('splits completed visits into verified and force', () => {
    const [hub] = byHq(
      [
        row({ employeeId: 'A', visitTime: '2026-09-05 10:00:00' }),
        row({ employeeId: 'A', visitTime: '2026-09-05 11:00:00', forceVisit: true }),
        // A force flag on a row that never happened must not subtract from
        // verified, which deriving it as `happened - force` would do.
        row({ employeeId: 'B', forceVisit: true }),
      ],
      team,
    );
    expect(hub.happened).toBe(2);
    expect(hub.verified).toBe(1);
    expect(hub.force).toBe(1);
    expect(hub.verified + hub.force).toBe(hub.happened);
  });

  it('sorts by completed visits, descending', () => {
    const t = [...team, { id: 'C', short: 'BE', hq: 'HQ-Erode', vacant: false }];
    const rows = [
      row({ employeeId: 'C', hq: 'HQ-Erode', visitTime: '2026-09-05 10:00:00' }),
      row({ employeeId: 'C', hq: 'HQ-Erode', visitTime: '2026-09-05 11:00:00' }),
      row({ employeeId: 'A', visitTime: '2026-09-05 10:00:00' }),
    ];
    expect(byHq(rows, t).map((h) => h.hq)).toEqual(['HQ-Erode', 'HQ-Hubballi']);
  });
});

describe('periodWindow', () => {
  it('today is a single day', () => {
    expect(periodWindow('today', '2026-09-05')).toEqual({ from: '2026-09-05', to: '2026-09-05' });
  });

  it('the month still running stops at today, not at the 30th', () => {
    // Month-till-date is not a mode; it is this clamp. Without it,
    // callAverage divides five days of visits by a full month of days.
    expect(periodWindow('month', '2026-09-05')).toEqual({ from: '2026-09-01', to: '2026-09-05' });
  });

  it('defaults to the month today falls in', () => {
    expect(periodWindow('month', '2026-09-05')).toEqual(
      periodWindow('month', '2026-09-05', '2026-09'),
    );
  });

  it('treats one month as a one-month range', () => {
    expect(periodWindow('month', '2026-09-05', '2026-08')).toEqual(
      periodWindow('month', '2026-09-05', '2026-08', '2026-08'),
    );
  });

  it('spans a range, and still stops at today when it ends this month', () => {
    expect(periodWindow('month', '2026-09-05', '2026-07', '2026-09')).toEqual({
      from: '2026-07-01',
      to: '2026-09-05',
    });
  });

  it('runs a range that is entirely over to its last month end', () => {
    expect(periodWindow('month', '2026-09-05', '2026-06', '2026-07')).toEqual({
      from: '2026-06-01',
      to: '2026-07-31',
    });
  });

  it('runs a past month to its own last day', () => {
    expect(periodWindow('month', '2026-09-05', '2026-08')).toEqual({
      from: '2026-08-01',
      to: '2026-08-31',
    });
  });

  it('spans a range, and still stops at today when it ends this month', () => {
    expect(periodWindow('month', '2026-09-05', '2026-07', '2026-09')).toEqual({
      from: '2026-07-01',
      to: '2026-09-05',
    });
  });

  it('runs a range that is entirely over to its last month end', () => {
    expect(periodWindow('month', '2026-09-05', '2026-06', '2026-07')).toEqual({
      from: '2026-06-01',
      to: '2026-07-31',
    });
  });

  it('gets February right, leap year and not', () => {
    expect(periodWindow('month', '2026-09-05', '2024-02').to).toBe('2024-02-29');
    expect(periodWindow('month', '2026-09-05', '2026-02').to).toBe('2026-02-28');
  });

  it('filters inclusively at both ends', () => {
    const rows = [
      row({ plannedDate: '2026-08-31' }),
      row({ plannedDate: '2026-09-01' }),
      row({ plannedDate: '2026-09-05' }),
      row({ plannedDate: '2026-09-06' }),
    ];
    expect(inPeriod(rows, periodWindow('month', '2026-09-05'))).toHaveLength(2);
  });
});

describe('asOfFrom', () => {
  it('is the latest visit we actually have, not the wall clock', () => {
    expect(
      asOfFrom([
        row({ visitTime: '2026-09-05 09:10:00' }),
        row({ visitTime: '2026-09-05 15:59:00' }),
        row(),
      ]),
    ).toBe('2026-09-05 15:59:00');
  });

  it('is null when nothing has happened yet', () => {
    expect(asOfFrom([row(), row()])).toBeNull();
  });
});

describe('rollupFor', () => {
  const team = [
    { id: 'ABM', reportsTo: null, short: 'ABM', vacant: false, onLeave: false },
    { id: 'A', reportsTo: 'ABM', short: 'BE', vacant: false, onLeave: false },
    { id: 'V', reportsTo: 'ABM', short: 'BE', vacant: true, onLeave: false },
  ];

  it('counts the PERSON’s own visits, not their branch’s', () => {
    /* A manager's row used to stack every call under them, so the same visit
       was counted again at every level above the rep who made it — and no row
       anywhere said what the manager themselves did. */
    const roll = rollupFor(team[0], team, [
      row({ employeeId: 'A', visitTime: '2026-09-05 10:00:00' }),
      row({ employeeId: 'A' }),
      row({ employeeId: 'ABM', visitTime: '2026-09-05 11:00:00' }),
    ]);
    expect(roll).toMatchObject({ planned: 1, happened: 1, isLeaf: false });
    expect(roll.attainment).toBe(1);
  });

  it('counts the people BELOW them in the headcount', () => {
    /* The two numbers on a manager's row answer two different questions:
       what they did, and how their people are doing. Asked of one person a
       headcount can only ever be 0/1 or 1/1, which is not a statistic. */
    const roll = rollupFor(team[0], team, [
      row({ employeeId: 'A', visitTime: '2026-09-05 10:00:00' }),
      row({ employeeId: 'A' }),
    ]);
    /* totalReps is 1 — the one BE under them. Not the ABM themselves, whose
       own work is the bar beside this; not the vacant seat, since nobody sits
       in it to have reported. */
    expect(roll).toMatchObject({ workingReps: 1, totalReps: 1 });
    // ...and the manager's own bar stays empty while their rep's is not.
    expect(roll.planned).toBe(0);
  });

  it('counts the person’s own money, not their branch’s', () => {
    // Same rule as the visit counts: a manager's row is about the manager.
    const roll = rollupFor(team[0], team, [row({ employeeId: 'ABM' })], [
      { employeeId: 'ABM', doctorId: 'DR-1', amount: 1000, plannedDate: '2026-09-05' },
      { employeeId: 'A', doctorId: 'DR-2', amount: 500, plannedDate: '2026-09-05' },
    ]);
    expect(roll.pobAmount).toBe(1000);
  });

  it('keeps a rep’s own POB and ignores money earned outside it', () => {
    const roll = rollupFor(team[1], team, [row({ employeeId: 'A' })], [
      { employeeId: 'A', doctorId: 'DR-1', amount: 1000, plannedDate: '2026-09-05' },
      { employeeId: 'A', doctorId: 'DR-2', amount: 500, plannedDate: '2026-09-05' },
      { employeeId: 'OUTSIDE', doctorId: 'DR-3', amount: 9999, plannedDate: '2026-09-05' },
    ]);
    expect(roll.pobAmount).toBe(1500);
  });

  it('is 0, not NaN, when the dataset carries no POB at all', () => {
    // The mock fixture has none, and a token that cannot read Quotation
    // returns none -- the tree row still has to render a subtitle.
    expect(rollupFor(team[0], team, [row({ employeeId: 'A' })]).pobAmount).toBe(0);
  });
});

describe('format', () => {
  it('does not shift the date by a timezone', () => {
    // `new Date('2026-09-05')` is UTC midnight, which is the 4th in IST.
    expect(formatDayHeading('2026-09-05')).toBe('Sat, 5 Sep 2026');
  });

  it('reads the clock off the string', () => {
    expect(formatClock('2026-09-05 15:59:00')).toBe('3:59 PM');
    expect(formatClock('2026-09-05 12:05:00')).toBe('12:05 PM');
    expect(formatClock('2026-09-05 00:30:00')).toBe('12:30 AM');
    expect(formatClock(null)).toBeNull();
  });

  it('names chart hours in full, including both noons', () => {
    // Midnight and noon are the two that a naive `hour % 12` gets wrong.
    expect([0, 9, 12, 17].map(formatHour)).toEqual(['12AM', '9AM', '12PM', '5PM']);
  });

  it('renders a missing ratio as an em dash, never 0%', () => {
    expect(formatPercent(null)).toBe('—');
    expect(formatPercent(0.714)).toBe('71%');
  });

  it('strips the HQ- naming prefix', () => {
    expect(hqLabel('HQ-Hubballi')).toBe('Hubballi');
  });

  it('counts a six-day working week', () => {
    // Mon 2026-08-31 .. Sat 2026-09-05 is six days, Sunday excluded.
    expect(countWorkingDays('2026-08-31', '2026-09-06')).toBe(6);
  });

  it('formats rupees in Indian lakh/crore grouping, matching the reference design', () => {
    expect(formatCurrency(1800)).toBe('₹1,800');
    expect(formatCurrency(180000)).toBe('₹1.8 L');
    expect(formatCurrency(12000000)).toBe('₹1.20 Cr');
  });

  it('renders a missing amount as an em dash, never ₹0', () => {
    expect(formatCurrency(null)).toBe('—');
    expect(formatCurrency(0)).toBe('₹0');
  });
});

describe('mock dataset', () => {
  const opts = { anchorDate: new Date(2026, 8, 5), cutoffHour: 16 };

  it('is deterministic', () => {
    // Without this a screenshot baseline is impossible.
    const a = buildMockDataset(opts);
    const b = buildMockDataset(opts);
    expect(a.rows).toEqual(b.rows);
  });

  it('honours the as-of cutoff on the anchor day', () => {
    const { rows, today } = buildMockDataset(opts);
    const late = rows.filter(
      (r) => r.plannedDate === today && r.visitTime && Number(r.visitTime.slice(11, 13)) >= 16,
    );
    expect(late).toHaveLength(0);
  });

  it('leaves past days complete', () => {
    const { rows, today } = buildMockDataset(opts);
    const past = rows.filter((r) => r.plannedDate < today && r.visitTime);
    expect(past.length).toBeGreaterThan(0);
  });

  it('carries joint calls, because the live plan does', () => {
    /* ~21% of live September events had more than one participant. A fixture
       of solo calls never exercises the grouping the doctor plan sheet is
       built on -- which is exactly how it shipped mis-specified once. */
    const { rows } = buildMockDataset(opts);
    const perEvent = new Map();
    for (const r of rows) {
      const key = `${r.eventId}|${r.plannedDate}`;
      perEvent.set(key, (perEvent.get(key) ?? 0) + 1);
    }
    const joint = [...perEvent.values()].filter((n) => n > 1);
    expect(joint.length).toBeGreaterThan(0);
  });

  it('names a participant on every row', () => {
    // The sheet renders participantName; an undefined is a blank row.
    const { rows } = buildMockDataset(opts);
    expect(rows.every((r) => r.participantName && r.participantId)).toBe(true);
  });

  it('gives a joint call two DIFFERENT attendees on one plan', () => {
    const { rows } = buildMockDataset(opts);
    const byEvent = new Map();
    for (const r of rows) {
      const key = `${r.eventId}|${r.plannedDate}`;
      byEvent.set(key, [...(byEvent.get(key) ?? []), r]);
    }
    const joint = [...byEvent.values()].find((rs) => rs.length > 1);
    expect(new Set(joint.map((r) => r.participantId)).size).toBe(joint.length);
    /* Each attendee is credited to THEMSELVES -- one planned visit each,
       rather than two against the rep and none against the manager. */
    expect(new Set(joint.map((r) => r.employeeId)).size).toBe(joint.length);
    // But the PLAN is still one rep's, which is what makes it one call.
    expect(new Set(joint.map((r) => r.planOwnerId)).size).toBe(1);
  });

  it('gives vacant seats no plan at all', () => {
    const { rows, team } = buildMockDataset(opts);
    const vacantIds = new Set(team.filter((m) => m.vacant).map((m) => m.id));
    expect(vacantIds.size).toBeGreaterThan(0);
    expect(rows.some((r) => vacantIds.has(r.employeeId))).toBe(false);
  });

  it('keeps force visits and distance consistent', () => {
    // A force visit is force BECAUSE the rep was far from the planned point.
    const { rows } = buildMockDataset(opts);
    const done = rows.filter((r) => r.visitTime);
    expect(done.every((r) => (r.forceVisit ? r.distanceKm > 1 : r.distanceKm <= 1))).toBe(true);
  });

  it('never marks POB on a visit that did not happen', () => {
    const { rows } = buildMockDataset(opts);
    expect(rows.every((r) => !r.pobGiven || r.visitTime)).toBe(true);
  });
});

describe('repsInAttendanceState', () => {
  const team = [
    { id: 'M', name: 'Manager', short: 'ABM', reportsTo: null, hq: 'HQ-Hubballi' },
    { id: 'A', name: 'Anil', short: 'BE', reportsTo: 'M', hq: 'HQ-Hubballi' },
    { id: 'B', name: 'Bala', short: 'BE', reportsTo: 'M', hq: 'HQ-Hubballi' },
    { id: 'C', name: 'Chandra', short: 'BE', reportsTo: 'M', hq: 'HQ-Hubballi', onLeave: true },
    { id: 'D', name: 'Vacant seat', short: 'BE', reportsTo: 'M', hq: 'HQ-Hubballi', vacant: true },
  ];

  const rows = [
    row({ employeeId: 'A', visitTime: '2026-09-05 10:00:00' }),
    row({ employeeId: 'A', visitTime: '2026-09-05 11:00:00' }),
    row({ employeeId: 'A' }),
    row({ employeeId: 'B', visitTime: '2026-09-05 10:00:00' }),
    row({ employeeId: 'B' }),
    row({ employeeId: 'C' }),
  ];

  it('agrees with the count on the chip it opens from', () => {
    // The whole point of sharing attendanceOf: a chip reading 2 must not
    // open a list of 1.
    const { counts } = attendance(rows, team);
    for (const state of ['working', 'notReporting', 'onLeave', 'vacant']) {
      expect(repsInAttendanceState(team, rows, state)).toHaveLength(counts[state]);
    }
  });

  it('lists managers too, because the chip counts them', () => {
    /* The list and the number that opened it have to be the same population
       — a chip reading 20 that opens 19 names is worse than no drill-down. */
    const all = ['working', 'notReporting', 'onLeave', 'vacant'].flatMap((s) =>
      repsInAttendanceState(team, rows, s),
    );
    expect(all.some((p) => p.id === 'M')).toBe(true);
    expect(all).toHaveLength(team.length);
  });

  it('orders by calls done, descending', () => {
    const working = repsInAttendanceState(team, rows, 'working');
    expect(working.map((p) => p.name)).toEqual(['Anil', 'Bala']);
    expect(working.map((p) => p.happened)).toEqual([2, 1]);
  });

  it('carries the plan, the role and the geo split for each row', () => {
    /* The card draws a bar, not a ratio, so the three segments have to come
       from here — a card re-deriving its own would be free to disagree with
       the tree row for the same rep. */
    const [anil] = repsInAttendanceState(team, rows, 'working');
    expect(anil).toMatchObject({ planned: 3, happened: 2, short: 'BE' });
    expect(anil.verified + anil.force).toBe(anil.happened);
  });

  it('gives a vacant seat no plan rather than a zero one', () => {
    const [seat] = repsInAttendanceState(team, rows, 'vacant');
    expect(seat.planned).toBe(0);
  });
});

describe('doctorPlan', () => {
  const team = [
    { id: 'M', name: 'Manager', short: 'ABM', reportsTo: null, hq: 'HQ-Hubballi' },
    { id: 'A', name: 'Anil', short: 'BE', reportsTo: 'M', hq: 'HQ-Hubballi' },
    { id: 'B', name: 'Bala', short: 'BE', reportsTo: 'M', hq: 'HQ-Hubballi' },
    { id: 'X', name: 'Outsider', short: 'BE', reportsTo: null, hq: 'HQ-Erode' },
  ];

  /* No participantId on these: they are the ordinary single-participant
     events the live data holds, where the attendee IS the plan owner and the
     fallback in doctorPlan is what resolves them. */
  const rows = [
    row({ eventId: '1', employeeId: 'A', employeeName: 'Anil', doctorId: 'DR-1', doctorName: 'Dr One' }),
    row({
      eventId: '2', employeeId: 'A', employeeName: 'Anil', doctorId: 'DR-2', doctorName: 'Dr Two',
      visitTime: '2026-09-05 14:00:00',
    }),
    row({
      eventId: '3', employeeId: 'B', employeeName: 'Bala', doctorId: 'DR-3', doctorName: 'Dr Three',
      visitTime: '2026-09-05 09:00:00',
    }),
    row({ eventId: '4', employeeId: 'X', employeeName: 'Outsider', doctorId: 'DR-4', doctorName: 'Dr Four' }),
  ];

  it('does not roll a report’s calls up to their manager', () => {
    // The behaviour this replaced: opening Dr plan on an ABM listed every
    // call in the branch as though the manager had made them.
    expect(doctorPlan(team[0], team, rows)).toEqual([]);
  });

  it('lists the joint calls a manager actually attended', () => {
    const joint = [
      ...rows,
      row({
        eventId: '2', employeeId: 'A', employeeName: 'Anil', doctorId: 'DR-2', doctorName: 'Dr Two',
        visitTime: '2026-09-05 14:05:00', participantId: 'M', participantName: 'Manager',
      }),
    ];
    const plan = doctorPlan(team[0], team, joint);
    /* Both attendees come back, not just the manager's own row: the sheet
       groups them into one call and expands to show who was there. A call
       listing only the reader would hide the rep they went with. */
    expect(plan.map((v) => v.doctorName)).toEqual(['Dr Two', 'Dr Two']);
    expect(groupByEvent(plan)).toHaveLength(1);
    expect(groupByEvent(plan)[0].participants).toHaveLength(2);
  });

  it('brings a colleague along only for the calls the member was on', () => {
    // Anil has three calls; the manager joined one. The manager's plan is
    // that one call with both names, not all three with both names.
    const joint = [
      ...rows,
      row({
        eventId: '2', employeeId: 'A', employeeName: 'Anil', doctorId: 'DR-2', doctorName: 'Dr Two',
        visitTime: '2026-09-05 14:05:00', participantId: 'M', participantName: 'Manager',
      }),
    ];
    const groups = groupByEvent(doctorPlan(team[0], team, joint));
    expect(groups).toHaveLength(1);
    expect(groups[0].doctorName).toBe('Dr Two');
  });

  it('scopes to one rep when the node is a rep', () => {
    const plan = doctorPlan(team[1], team, rows);
    expect(plan.map((v) => v.doctorName).sort()).toEqual(['Dr One', 'Dr Two']);
  });

  it('falls back to the plan owner when the participant did not resolve', () => {
    // An unresolved participant (ops account, inactive, a schema that does
    // not return reference_docname) must not empty every plan on the screen.
    const unresolved = [
      row({ eventId: '5', employeeId: 'A', employeeName: 'Anil', doctorName: 'Dr Five', participantId: null }),
    ];
    expect(doctorPlan(team[1], team, unresolved)).toHaveLength(1);
  });

  it('prefers the participant over the plan owner when both are present', () => {
    // A's plan, attended by B. It is B's call, not A's.
    const lent = [
      row({
        eventId: '6', employeeId: 'A', employeeName: 'Anil', doctorName: 'Dr Six',
        participantId: 'B', participantName: 'Bala',
      }),
    ];
    expect(doctorPlan(team[1], team, lent)).toEqual([]);
    expect(doctorPlan(team[2], team, lent).map((v) => v.doctorName)).toEqual(['Dr Six']);
  });

  it('puts completed calls first, in the order they happened', () => {
    const plan = doctorPlan(team[1], team, rows);
    expect(plan.map((v) => v.doctorName)).toEqual(['Dr Two', 'Dr One']);
  });

  it('sums POB per (rep, doctor, day) rather than taking the first', () => {
    const pob = [
      { employeeId: 'A', doctorId: 'DR-2', plannedDate: '2026-09-05', amount: 400 },
      { employeeId: 'A', doctorId: 'DR-2', plannedDate: '2026-09-05', amount: 600 },
      { employeeId: 'X', doctorId: 'DR-2', plannedDate: '2026-09-05', amount: 999 },
    ];
    const plan = doctorPlan(team[1], team, rows, pob);
    expect(plan.find((v) => v.doctorName === 'Dr Two').pob).toBe(1000);
  });

  it('keys every row uniquely when one Event carries two participants', () => {
    // An Event with two participants flattens to two rows sharing an
    // eventId -- React saw duplicate keys and dropped a visit from the list.
    const shared = [
      row({ eventId: 'SAME', employeeId: 'A', employeeName: 'Anil', doctorName: 'Dr Nine' }),
      row({
        eventId: 'SAME', employeeId: 'A', employeeName: 'Anil', doctorName: 'Dr Nine',
        participantId: 'A', participantName: 'Anil',
      }),
    ];
    const plan = doctorPlan(team[1], team, shared);
    expect(plan).toHaveLength(2);
    expect(new Set(plan.map((v) => v.id)).size).toBe(2);
  });

  it('leaves POB null on a call no quotation matched', () => {
    const plan = doctorPlan(team[1], team, rows, []);
    expect(plan.every((v) => v.pob === null)).toBe(true);
  });

  it('carries the force visit reason through to the row', () => {
    const forced = [
      row({
        eventId: '9', employeeId: 'A', employeeName: 'Anil', doctorId: 'DR-9', doctorName: 'Dr Nine',
        visitTime: '2026-09-05 10:00:00', forceVisit: true, forceVisitReason: 'Camp duty at a nearby PHC',
      }),
    ];
    expect(doctorPlan(team[1], team, forced)[0].forceVisitReason).toBe('Camp duty at a nearby PHC');
  });

  it('drops a reason left on a row whose force flag is off', () => {
    // A half-edited record: showing the reason would tell the reader the
    // call was forced when the flag says it was not.
    const stale = [
      row({
        eventId: '9', employeeId: 'A', employeeName: 'Anil', doctorId: 'DR-9', doctorName: 'Dr Nine',
        visitTime: '2026-09-05 10:00:00', forceVisit: false, forceVisitReason: 'Clinic closed',
      }),
    ];
    expect(doctorPlan(team[1], team, stale)[0].forceVisitReason).toBe('');
  });

  it('gives a forced call with no reason an empty string, not undefined', () => {
    // The field is not mandatory and the fixture omits it entirely; the
    // sheet renders on truthiness, so undefined would be a silent hole.
    const bare = [
      row({
        eventId: '9', employeeId: 'A', employeeName: 'Anil', doctorId: 'DR-9', doctorName: 'Dr Nine',
        visitTime: '2026-09-05 10:00:00', forceVisit: true,
      }),
    ];
    expect(doctorPlan(team[1], team, bare)[0].forceVisitReason).toBe('');
  });
});

describe('monthEnd', () => {
  it('is the last real day of the month, not always the 31st', () => {
    expect(monthEnd('2026-01')).toBe('2026-01-31');
    expect(monthEnd('2026-04')).toBe('2026-04-30');
    expect(monthEnd('2026-02')).toBe('2026-02-28');
    expect(monthEnd('2024-02')).toBe('2024-02-29');
  });

  it('does not slip a day on a timezone east of UTC', () => {
    // new Date('2026-08-01') is parsed as UTC and is July 31st in IST.
    // Every month here must end on its own last day regardless.
    expect(monthEnd('2026-08').startsWith('2026-08')).toBe(true);
  });
});


describe('period labels', () => {
  it('names a month with its year', () => {
    expect(formatMonthName('2026-08')).toBe('Aug 2026');
  });

  it('keeps MTD for the current month, because the figures are partial', () => {
    expect(periodSuffix('month', '2026-09', '2026-09-05')).toBe('MTD');
    expect(periodSuffix('month', undefined, '2026-09-05')).toBe('MTD');
  });

  it('drops the year on a past month in the same year, keeps it otherwise', () => {
    expect(periodSuffix('month', '2026-08', '2026-09-05')).toBe('Aug');
    expect(periodSuffix('month', '2025-08', '2026-09-05')).toBe('Aug 2025');
  });

  it('is "today" whatever month is picked, when the period is today', () => {
    expect(periodSuffix('today', '2025-08', '2026-09-05')).toBe('today');
  });
});

describe('periodSuffix over a range', () => {
  it('joins the ends and keeps MTD while the range is still running', () => {
    expect(periodSuffix('month', '2026-07', '2026-09-05', '2026-09')).toBe('Jul–Sep MTD');
  });

  it('drops MTD once the range is entirely in the past', () => {
    expect(periodSuffix('month', '2026-06', '2026-09-05', '2026-07')).toBe('Jun–Jul');
  });
});

describe('byHq only counts real HQs', () => {
  const team = [
    { id: 'A', name: 'Anil', short: 'BE', hq: 'HQ-Hubballi', reportsTo: null },
    { id: 'B', name: 'Bala', short: 'BE', hq: 'Tn-Coimbatore', reportsTo: null },
    { id: 'C', name: 'Chandra', short: 'BE', hq: '', reportsTo: null },
  ];

  it('drops a territory that is not an HQ', () => {
    /* The Territory tree carries states, zones and countries alongside the
       HQs. Counted as HQs they become cards for places nobody works in. */
    const out = byHq([
      row({ employeeId: 'A', hq: 'HQ-Hubballi', visitTime: '2026-09-05 10:00:00' }),
      row({ employeeId: 'B', hq: 'Tn-Coimbatore', visitTime: '2026-09-05 10:00:00' }),
    ], team);
    expect(out.map((h) => h.hq)).toEqual(['HQ-Hubballi']);
  });

  it('drops an unset territory rather than making a nameless card', () => {
    // Empty team, so the only thing that could create a card is the row.
    const out = byHq([row({ employeeId: 'C', hq: '', visitTime: '2026-09-05 10:00:00' })], []);
    expect(out).toEqual([]);
  });

  it('still shows a real HQ that has reps but no visits yet', () => {
    // The card is the territory, not the activity: an HQ whose reps have
    // not started is 0/12, not absent.
    const out = byHq([], team);
    expect(out.map((h) => h.hq)).toEqual(['HQ-Hubballi']);
    expect(out[0].totalReps).toBe(1);
  });

  it('does not count a rep outside an HQ in any headcount', () => {
    // Otherwise a denominator appears under a card for a place that does
    // not exist, or worse, under the wrong one.
    const out = byHq([row({ employeeId: 'A', hq: 'HQ-Hubballi', visitTime: '2026-09-05 10:00:00' })], team);
    expect(out[0].totalReps).toBe(1);
    expect(out[0].activeReps).toBe(1);
  });

  it('is case sensitive: hq- is not HQ-', () => {
    // The naming series is uppercase; anything else is a different scheme
    // and guessing at it is how a typo becomes a territory.
    expect(byHq([row({ hq: 'hq-hubballi', visitTime: '2026-09-05 10:00:00' })], [])).toEqual([]);
  });
});

/* Attendance follows the period now. Over a range the question changes from
   "who is out right now" to "who reported at any point in it", and only
   VACANCY stays an as-of-now fact. */
describe('attendance over a range', () => {
  const at = (over) => ({ id: 'X', name: 'X', short: 'BE', vacant: false, onLeave: false, ...over });
  const worked = new Set(['X']);
  const none = new Set();

  it('counts a rep who reported as reported, even if they are out today', () => {
    /* Twenty days in the field and one afternoon off is not "Absent" for the
       month — and the call count beside the chip is the proof. */
    expect(attendanceOf(at({ onLeave: true, onLeaveInWindow: true }), worked, true)).toBe('working');
    // On a single day the old order stands: out today means out today.
    expect(attendanceOf(at({ onLeave: true }), worked, false)).toBe('onLeave');
  });

  it('uses the WINDOW leave flag, not today\'s, over a range', () => {
    // Away on the 4th, at a desk today: absent for August, reported nothing.
    expect(attendanceOf(at({ onLeave: false, onLeaveInWindow: true }), none, true)).toBe('onLeave');
    // The mirror: out today, but no leave anywhere in the window.
    expect(attendanceOf(at({ onLeave: true, onLeaveInWindow: false }), none, true)).toBe('notReporting');
  });

  it('falls back to today\'s flag when the source has no windowed one', () => {
    /* The mock, and any caller still on the old shape. A missing field has to
       degrade to the old behaviour, not to "nobody was ever away". */
    expect(attendanceOf(at({ onLeave: true }), none, true)).toBe('onLeave');
  });

  it('keeps a vacant seat vacant in both', () => {
    // A seat is empty or it is not; there is no having been vacant last week.
    expect(attendanceOf(at({ vacant: true, onLeaveInWindow: true }), worked, true)).toBe('vacant');
  });

  it('opens a drill-down that agrees with the chip that opened it', () => {
    /* The one invariant that matters here: same rows, same flag, same
       classification. A chip reading 2 must never open a list of 3. */
    const team = [
      at({ id: 'A' }),
      at({ id: 'B', onLeaveInWindow: true }),
      at({ id: 'C', onLeaveInWindow: true }),
      at({ id: 'V', vacant: true }),
    ];
    const rows = [row({ employeeId: 'C', visitTime: '2026-09-05 10:00:00' })];
    const { counts } = attendance(rows, team, true);

    /* A and B have no plan at all, so both are Not reported; B and C carry
       leave in the window, so both are Absent; C reported. The buckets
       overlap by design — C is Reported AND Absent — so these no longer sum
       to the headcount. */
    expect(counts).toEqual({ working: 1, notReporting: 2, onLeave: 2, vacant: 1 });
    for (const state of Object.keys(counts)) {
      expect(repsInAttendanceState(team, rows, state, true)).toHaveLength(counts[state]);
    }
  });
});

/* The attendance card and the team tree draw from the same roster now. These
   pin the population, which is the thing that used to differ. */
describe('attendance counts the whole sales roster', () => {
  const p = (id, short, over = {}) => ({
    id, short, name: id, reportsTo: short === 'ABM' ? null : 'M',
    vacant: false, onLeave: false, hq: 'HQ-Hubballi', ...over,
  });
  const team = [p('M', 'ABM'), p('A', 'BE'), p('B', 'BE')];
  const did = (id) => row({ employeeId: id, visitTime: '2026-09-05 10:00:00' });

  it('counts a manager who made a call as reported', () => {
    /* A fifth of the plan is joint, and since the attribution fix those
       calls land on the manager's own id — they were being counted nowhere. */
    const { counts, inScope } = attendance([did('M')], team);
    expect(counts.working).toBe(1);
    expect(inScope).toBe(3);
  });

  it('counts a manager’s PEOPLE on their row, never themselves', () => {
    /* The card counts everyone in scope, the manager included — it is a
       population. A row is not: "5/5 reported" above four visible children is
       a number the rows underneath contradict, and the manager's own work is
       already the bar beside it. So the two differ by exactly one person,
       deliberately, and that person is counted on their own row. */
    const roll = rollupFor(team[0], team, [did('M'), did('A')]);
    expect(roll).toMatchObject({ workingReps: 1, totalReps: 2 });

    const { inScope } = attendance([did('M'), did('A')], team);
    expect(inScope).toBe(3);
  });

  it('classifies a manager by the same range rule the card used', () => {
    /* rollupFor took no `overRange` and always judged as-of-today, so in the
       month view a tree row could contradict the card above it. */
    const onLeave = [p('M', 'ABM', { onLeave: true, onLeaveInWindow: true }), p('A', 'BE')];
    expect(rollupFor(onLeave[0], onLeave, [did('M')], [], false).attendance).toBe('onLeave');
    // Over a range, a manager who logged a call reported — leave comes second.
    expect(rollupFor(onLeave[0], onLeave, [did('M')], [], true).attendance).toBe('working');
  });
});

/* Day-based states: the same person can be in two buckets, because over a
   month "did they report" is not one question. */
describe('attendanceStatesOf', () => {
  const who = (over = {}) => ({ id: 'X', name: 'X', short: 'BE', vacant: false, onLeave: false, ...over });
  const d = (date, planned, happened) => ({ date, planned, happened });

  it('puts a rep who worked some days and missed others in BOTH buckets', () => {
    /* The whole point of the change: "Reported" for August used to mean one
       visit in twenty-two days, so a rep who worked the 4th and vanished
       scored the same as one who worked every day. */
    const states = attendanceStatesOf(who(), [d('2026-09-04', 4, 4), d('2026-09-11', 3, 0)], true);
    expect(states).toContain('working');
    expect(states).toContain('notReporting');
  });

  it('keeps a rep who never missed a day out of Not reported', () => {
    expect(attendanceStatesOf(who(), [d('2026-09-04', 4, 4)], true)).toEqual(['working']);
  });

  it('counts leave alongside whatever else is true', () => {
    // Away on the 4th, working the rest: both facts, both buckets.
    const states = attendanceStatesOf(who({ onLeaveInWindow: true }), [d('2026-09-11', 2, 2)], true);
    expect(states).toEqual(['working', 'onLeave']);
  });

  it('never loses a person with no plan at all', () => {
    /* No day can speak for them, so the range does — a body in none of the
       four buckets is a person the screen has quietly dropped. */
    expect(attendanceStatesOf(who(), [], true)).toEqual(['notReporting']);
  });

  it('gives a vacant seat one state and no other', () => {
    expect(attendanceStatesOf(who({ vacant: true }), [d('2026-09-04', 1, 0)], true)).toEqual(['vacant']);
  });

  it('still returns exactly one state on a single day', () => {
    // The buckets only overlap once there are days to disagree about.
    for (const days of [[], [d('2026-09-04', 2, 0)], [d('2026-09-04', 2, 2)]]) {
      expect(attendanceStatesOf(who(), days, false)).toHaveLength(1);
    }
  });

  it('counts each person once per state, never twice', () => {
    // Two silent days must not make somebody "Not reported" twice over.
    const team = [who({ id: 'A', name: 'A' })];
    const rows = [
      row({ employeeId: 'A', plannedDate: '2026-09-04' }),
      row({ employeeId: 'A', plannedDate: '2026-09-11' }),
    ];
    expect(attendance(rows, team, true).counts.notReporting).toBe(1);
  });

  it('reports a headcount that is people, not the sum of the buckets', () => {
    /* inScope used to be working + notReporting + onLeave. Overlapping
       buckets make that larger than the roster, which would print "26 of 31
       reported" for a team of nineteen. */
    const team = [who({ id: 'A', name: 'A', onLeaveInWindow: true }), who({ id: 'V', name: 'V', vacant: true })];
    const rows = [
      row({ employeeId: 'A', plannedDate: '2026-09-04', visitTime: '2026-09-04 10:00:00' }),
      row({ employeeId: 'A', plannedDate: '2026-09-11' }),
    ];
    const { counts, inScope } = attendance(rows, team, true);
    expect(inScope).toBe(1);
    expect(counts.working + counts.notReporting + counts.onLeave).toBe(3);
  });
});

/* The Absent list needs the days themselves and the kind of leave each was —
   "away six days" is a fact nobody can act on. */
describe('leaveDaysOf', () => {
  const week = ['2026-09-04', '2026-09-05', '2026-09-07', '2026-09-08'];
  const on = (spells) => ({ id: 'X', name: 'X', short: 'BE', leave: spells });

  it('expands a spell into the working days it covers', () => {
    const out = leaveDaysOf(on([{ from: '2026-09-04', to: '2026-09-07', type: 'Casual Leave' }]), week);
    expect(out).toEqual([
      { date: '2026-09-04', type: 'Casual Leave' },
      { date: '2026-09-05', type: 'Casual Leave' },
      { date: '2026-09-07', type: 'Casual Leave' },
    ]);
  });

  it('never counts a day the window does not', () => {
    /* Sunday the 6th is inside that spell and absent from the calendar, so
       "3 of 4 days" stays a fraction of the same denominator the rest of the
       card uses. A leave day outside the window is the same story. */
    const out = leaveDaysOf(on([{ from: '2026-08-01', to: '2026-12-31', type: 'Sick Leave' }]), week);
    expect(out.map((d) => d.date)).toEqual(week);
  });

  it('keeps each spell its own type', () => {
    // Two spells in one month are routinely two different kinds of leave.
    const out = leaveDaysOf(
      on([
        { from: '2026-09-04', to: '2026-09-04', type: 'Casual Leave' },
        { from: '2026-09-08', to: '2026-09-08', type: 'Sick Leave' },
      ]),
      week,
    );
    expect(out).toEqual([
      { date: '2026-09-04', type: 'Casual Leave' },
      { date: '2026-09-08', type: 'Sick Leave' },
    ]);
  });

  it('is empty for somebody with no leave at all', () => {
    expect(leaveDaysOf(on([]), week)).toEqual([]);
    expect(leaveDaysOf({ id: 'X' }, week)).toEqual([]);
  });
});

describe('everyonePicks', () => {
  it('covers the whole roster once: every top-of-chain person with their branch', async () => {
    const { everyonePicks, subtreeOf } = await import('../selectors');
    const team = [
      { id: 'GM', reportsTo: null },
      { id: 'A1', reportsTo: 'GM' },
      { id: 'B1', reportsTo: 'A1' },
      { id: 'R2', reportsTo: 'OUTSIDE' },
      { id: 'B2', reportsTo: 'R2' },
      { id: 'LONE', reportsTo: 'GONE' },
    ];
    const picks = everyonePicks(team);
    expect(picks).toEqual([
      { id: 'GM', includeSubtree: true },
      { id: 'R2', includeSubtree: true },
      { id: 'LONE', includeSubtree: true },
    ]);
    const covered = new Set(picks.flatMap((p) => subtreeOf(team, p.id).map((m) => m.id)));
    expect(covered.size).toBe(team.length);
  });
});
