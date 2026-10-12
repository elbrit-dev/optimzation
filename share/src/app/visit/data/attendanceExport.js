import { shortDesignation } from './shape';

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
export function attendanceExportRows(people, team, state, overRange = false, calendar = []) {
  const byId = new Map(team.map((m) => [m.id, m]));

  return people.map((p) => {
    const member = byId.get(p.id);
    const manager = member?.reportsTo ? byId.get(member.reportsTo) : null;
    const row = {
      'Employee ID': p.id,
      Name: p.name,
      Designation: shortDesignation(member?.designation),
      HQ: p.hq ?? '',
      'Reports to': manager?.name ?? '',
    };
    /* An empty seat has no calls and no days — the columns would be a row of
       zeros about a person who does not exist. */
    if (state === 'vacant') return row;

    if (overRange) {
      row['Working days'] = calendar.length;
      row['Days reported'] = p.reportedDays ?? 0;
      row['Days not reported'] = (p.days?.length ?? 0) - (p.reportedDays ?? 0);
    }
    row['Calls planned'] = p.planned;
    row['Calls done'] = p.happened;

    /* The "when" the sheet's expanded rows answer, so the file answers it too. */
    if (overRange && state === 'notReporting') {
      row['Not reported on'] = (p.days ?? [])
        .filter((d) => d.happened === 0)
        .map((d) => d.date)
        .join(', ');
    }
    if (overRange && state === 'onLeave') {
      row['Leave days'] = (p.leaveDays ?? []).map((d) => `${d.date} (${d.type})`).join(', ');
    }
    return row;
  });
}

/* `not-reported_2026-10-01_to_2026-10-12.xlsx` — the state and the window, so
   two exports downloaded a minute apart do not land as export (1).xlsx. */
export function attendanceExportFilename(state, calendar = []) {
  const slug = { working: 'reported', notReporting: 'not-reported', onLeave: 'absent', vacant: 'vacant' }[state] ?? state;
  const from = calendar[0];
  const to = calendar[calendar.length - 1];
  const span = !from ? '' : from === to ? `_${from}` : `_${from}_to_${to}`;
  return `${slug}${span}.xlsx`;
}
