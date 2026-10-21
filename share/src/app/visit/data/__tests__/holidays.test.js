import { describe, expect, it } from 'vitest';
import {
  attendance,
  attendanceOf,
  attendanceStatesOf,
  calendarFor,
  callTarget,
  excusedOn,
  holidayDaysOf,
  holidayOn,
  repsInAttendanceState,
  workingDaysPerRep,
} from '../selectors';
import { workingDaysBetween } from '../format';
import { holidaysFrom } from '../liveSource';
import { attendanceExportRows } from '../attendanceExport';

/* Holidays come from each person's ERP Holiday List, which is per state:
   on Gandhi Jayanthi the Tamil Nadu rep is off; on a state-only holiday the
   other state works. A holiday is that person's Sunday — not one of their
   working days. */

const GANDHI = { date: '2026-10-02', name: 'Gandhi Jayanthi' };
const tn = { id: 'TN', name: 'Tamil Rep', short: 'BE', hq: 'HQ-Chennai', vacant: false, holidays: [GANDHI] };
const ka = { id: 'KA', name: 'Karnataka Rep', short: 'BE', hq: 'HQ-Mysore', vacant: false, holidays: [] };

/* Thu 1 Oct – Wed 7 Oct 2026: Sunday the 4th is off by the calendar. */
const week = workingDaysBetween('2026-10-01', '2026-10-07');

const visit = (employeeId, plannedDate, done = true) => ({
  employeeId,
  plannedDate,
  hq: 'HQ-Chennai',
  visitTime: done ? `${plannedDate} 10:00:00` : null,
  forceVisit: false,
  participantCount: 1,
});

describe('a person’s working days', () => {
  it('leaves out the holidays on their own list, and only theirs', () => {
    expect(week).toEqual(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-05', '2026-10-06', '2026-10-07']);
    expect(calendarFor(tn, week)).toEqual(['2026-10-01', '2026-10-03', '2026-10-05', '2026-10-06', '2026-10-07']);
    expect(calendarFor(ka, week)).toBe(week);
  });

  it('names the holiday, and lists the ones in the window', () => {
    expect(holidayOn(tn, '2026-10-02')).toBe('Gandhi Jayanthi');
    expect(holidayOn(ka, '2026-10-02')).toBeNull();
    expect(holidayDaysOf(tn, week)).toEqual([GANDHI]);
    expect(holidayDaysOf(tn, ['2026-10-05'])).toEqual([]);
  });

  it('excuses a holiday ahead of anything else filed for it', () => {
    const onLeaveToo = { ...tn, leave: [{ from: '2026-10-01', to: '2026-10-03', type: 'Casual Leave' }] };
    expect(excusedOn(onLeaveToo, '2026-10-02')).toBe('holiday');
    expect(excusedOn(onLeaveToo, '2026-10-01')).toBe('leave');
  });
});

describe('one day', () => {
  it('shows someone off on a holiday as Holiday, not Not reported', () => {
    expect(attendanceOf({ ...tn, onHoliday: true }, new Set(), false)).toBe('holiday');
    expect(attendanceStatesOf({ ...tn, onHoliday: true }, [], false)).toEqual(['holiday']);
  });

  it('counts someone who worked their holiday as Reported', () => {
    expect(attendanceOf({ ...tn, onHoliday: true }, new Set(['TN']), false)).toBe('working');
  });

  it('keeps leave first, as before', () => {
    expect(attendanceOf({ ...tn, onHoliday: true, onLeave: true }, new Set(), false)).toBe('onLeave');
  });

  it('puts them in the Holiday bucket of the card, the other state in Not reported', () => {
    const team = [{ ...tn, onHoliday: true }, ka];
    const { counts, inScope } = attendance([], team, false, ['2026-10-02']);
    expect(counts.holiday).toBe(1);
    expect(counts.notReporting).toBe(1);
    expect(inScope).toBe(2);
  });
});

describe('a range', () => {
  /* Both reps logged a call on every one of THEIR working days. */
  const everyDay = (id, days) => days.map((d) => visit(id, d));
  const rows = [...everyDay('TN', calendarFor(tn, week)), ...everyDay('KA', week)];

  it('does not call a rep silent for their holiday', () => {
    const { counts } = attendance(rows, [tn, ka], true, week);
    expect(counts.working).toBe(2);
    expect(counts.notReporting).toBe(0);
  });

  it('still calls the holiday a silent day for a state that had it as a working day', () => {
    const kaMissed = rows.filter((r) => !(r.employeeId === 'KA' && r.plannedDate === '2026-10-02'));
    const { counts } = attendance(kaMissed, [tn, ka], true, week);
    expect(counts.notReporting).toBe(1);
  });

  it('counts the days against their own working days in the drill-down and the export', () => {
    const [p] = repsInAttendanceState([tn], rows, 'working', true, week);
    expect(p.workingDays).toBe(5);
    expect(p.days.map((d) => d.date)).not.toContain('2026-10-02');
    expect(p.reportedDays).toBe(5);
    expect(p.holidayDays).toEqual([GANDHI]);
    const [row] = attendanceExportRows([p], [tn], 'working', true, week);
    expect(row['Working days']).toBe(5);
    expect(row.Holidays).toBe(1);
  });

  it('keeps a visit logged on a holiday', () => {
    const [p] = repsInAttendanceState([tn], [...rows, visit('TN', '2026-10-02')], 'working', true, week);
    expect(p.reportedDays).toBe(6);
    expect(p.happened).toBe(6);
  });

  it('is Holiday when every working day of the range was one', () => {
    expect(attendanceStatesOf(tn, [], true, ['2026-10-02'])).toEqual(['holiday']);
    expect(attendanceStatesOf(ka, [], true, ['2026-10-02'])).toEqual(['notReporting']);
  });
});

describe('the call target', () => {
  /* October 2026, seen on the 7th: the TN rep also has Pooja on the 19th. */
  const october = workingDaysBetween('2026-10-01', '2026-10-31');
  const tnMonth = { ...tn, holidays: [GANDHI, { date: '2026-10-19', name: 'Pooja' }] };

  it('takes their holidays off the target, the ones still ahead too', () => {
    const t = callTarget(tnMonth, [], october, '2026-10-07');
    const k = callTarget(ka, [], october, '2026-10-07');
    expect(october.length).toBe(27);
    expect(k.target).toBe(12 * 27);
    expect(t.target).toBe(12 * 25);
    expect(t.daysHoliday).toBe(2);
    expect(k.daysHoliday).toBe(0);
  });

  it('averages over the days they were expected out', () => {
    const done = calendarFor(tnMonth, workingDaysBetween('2026-10-01', '2026-10-06')).map((d) => visit('TN', d));
    const t = callTarget(tnMonth, done, october, '2026-10-07');
    // 1, 3, 5, 6 Oct: four days worked, one call each — 1.0/day, not 4/5.
    expect(t.average).toBe(1);
  });
});

describe('the call average', () => {
  it('divides by each rep’s own working days', () => {
    const rows = [visit('TN', '2026-10-01'), visit('KA', '2026-10-01')];
    // TN: 5 working days that week, KA: 6 -> 5.5 on average.
    expect(workingDaysPerRep(rows, [tn, ka], week)).toBe(5.5);
  });

  it('counts a holiday someone worked as one of their days', () => {
    expect(workingDaysPerRep([visit('TN', '2026-10-02')], [tn], ['2026-10-02'])).toBe(1);
  });

  it('falls back to the calendar when nobody reported', () => {
    expect(workingDaysPerRep([], [tn, ka], week)).toBe(6);
  });
});

describe('the summary’s holidays', () => {
  it('maps each employee to their list’s days', () => {
    const map = holidaysFrom({
      holidays: {
        lists: [['TamilNadu Holidays 2026', [['2026-10-02', 'Gandhi Jayanthi'], ['2026-10-19', '']]]],
        of: { TN: 0, LOST: 4 },
      },
    });
    expect(map.get('TN')).toEqual([GANDHI, { date: '2026-10-19', name: 'Holiday' }]);
    expect(map.has('LOST')).toBe(false);
  });

  it('is empty for a summary from before holidays were sent', () => {
    expect(holidaysFrom({ rows: [] }).size).toBe(0);
  });
});
