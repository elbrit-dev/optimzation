import { otherWorkKinds, otherWorkText, shortDesignation } from './shape';

/* The rows behind an attendance sheet, flattened for a spreadsheet.
 *
 * THE WHOLE LIST, not the page on screen: the sheet pages in as it scrolls
 * (see useIncrementalList), and an export that stopped at the thirty rows
 * the reader happened to have scrolled past would be a list that silently
 * disagrees with the count above it.
 *
 * Built from the same `people` the sheet renders — repsInAttendanceState —
 * so the file and the screen cannot classify anyone differently. Pure, so the
 * columns are testable without a browser download.
 */
export function attendanceExportRows(people, team, state, overRange = false, calendar = [], contacts = new Map()) {
  const byId = new Map(team.map((m) => [m.id, m]));

  return people.map((p) => {
    const member = byId.get(p.id);
    const manager = member?.reportsTo ? byId.get(member.reportsTo) : null;
    const c = contacts.get(p.id) ?? {};
    const row = {
      'Employee ID': p.id,
      'Employee code': c.employeeCode ?? '',
      Name: p.name,
      Designation: shortDesignation(member?.designation),
      Department: c.department ?? '',
      HQ: p.hq ?? '',
      'Reports to': manager?.name ?? '',
      'User ID': member?.userId ?? '',
      Phone: c.phone ?? '',
      /* Company email first; many BE records leave it empty, so fall back to
         the preferred and then the personal one rather than print a blank. */
      Email: c.companyEmail || c.preferredEmail || c.personalEmail || '',
    };
    /* An empty seat has no calls and no days — the columns would be a row of
       zeros about a person who does not exist. */
    if (state === 'vacant') return row;

    if (overRange) {
      /* THEIR working days: the window's less the holidays on their list. */
      row['Working days'] = p.workingDays ?? calendar.length;
      row.Holidays = p.holidayDays?.length ?? 0;
      row['Days reported'] = p.reportedDays ?? 0;
      row['Days not reported'] = p.silentDays ?? (p.days?.length ?? 0) - (p.reportedDays ?? 0);
    }
    row['Calls planned'] = p.planned;
    row['Calls done'] = p.happened;

    /* Their calls against the month — the line under their card. */
    if (p.calls) {
      const round1 = (n) => (n == null ? '' : Math.round(n * 10) / 10);
      row['Calls/day'] = round1(p.calls.average);
      row['Leave days'] = p.calls.daysLeave;
      row['Other work days'] = p.calls.daysOtherWork;
      row['Month target'] = p.calls.target;
      row['Calls left'] = p.calls.left;
      row['Calls/day needed'] = round1(p.calls.perDayNeeded);
    }

    /* The "when" the sheet's expanded rows answer, so the file answers it too. */
    if (overRange && state === 'notReporting') {
      row['Not reported on'] = (p.days ?? [])
        .filter((d) => d.happened === 0 && !d.excused)
        .map((d) => d.date)
        .join(', ');
    }
    if (overRange && state === 'onLeave') {
      row['Leave days'] = (p.leaveDays ?? []).map((d) => `${d.date} (${d.type})`).join(', ');
    }
    if (state === 'otherWork') {
      row['Other work'] = p.otherWorkToday ? otherWorkText(p.otherWorkToday) : otherWorkKinds(p.otherWorkDays);
    }
    if (overRange && state === 'otherWork') {
      row['Other work days'] = (p.otherWorkDays ?? []).map((d) => `${d.date} (${otherWorkText(d)})`).join(', ');
    }
    if (state === 'holiday') {
      row.Holiday = overRange
        ? (p.holidayDays ?? []).map((d) => `${d.date} (${d.name})`).join(', ')
        : p.holidayToday ?? '';
    }
    return row;
  });
}

/* `not-reported_2026-10-01_to_2026-10-12.xlsx` — the state and the window, so
   two exports downloaded a minute apart do not land as export (1).xlsx. */
export function attendanceExportFilename(state, calendar = []) {
  const slug = { working: 'reported', notReporting: 'not-reported', onLeave: 'absent', otherWork: 'other-work', holiday: 'holiday', vacant: 'vacant' }[state] ?? state;
  const from = calendar[0];
  const to = calendar[calendar.length - 1];
  const span = !from ? '' : from === to ? `_${from}` : `_${from}_to_${to}`;
  return `${slug}${span}.xlsx`;
}
