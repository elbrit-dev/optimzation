import { describe, expect, it } from 'vitest';
import { attendanceExportFilename, attendanceExportRows } from '../attendanceExport';

const team = [
  { id: 'E1', name: 'Asha', designation: 'Area Business Manager', reportsTo: null, hq: 'CBE' },
  { id: 'E2', name: 'Ravi', designation: 'Business Executive', reportsTo: 'E1', hq: 'CBE' },
];

const ravi = {
  id: 'E2',
  name: 'Ravi',
  hq: 'CBE',
  planned: 6,
  happened: 2,
  reportedDays: 1,
  leaveDays: [],
  days: [
    { date: '2026-10-01', happened: 2 },
    { date: '2026-10-02', happened: 0 },
    { date: '2026-10-03', happened: 0 },
  ],
};

describe('attendanceExportRows', () => {
  it('lists the silent days and the manager over a range', () => {
    const [row] = attendanceExportRows([ravi], team, 'notReporting', true, ['2026-10-01', '2026-10-02', '2026-10-03']);
    expect(row).toMatchObject({
      'Employee ID': 'E2',
      'Reports to': 'Asha',
      'Working days': 3,
      'Days reported': 1,
      'Days not reported': 2,
      'Calls planned': 6,
      'Calls done': 2,
      'Not reported on': '2026-10-02, 2026-10-03',
    });
  });

  it('adds contact details, falling back from the company email', () => {
    const contacts = new Map([['E2', { department: 'Sales - EL', employeeCode: 'EMP-7', phone: '98400', personalEmail: 'r@x.in' }]]);
    const [row] = attendanceExportRows([ravi], [{ ...team[0] }, { ...team[1], userId: 'ravi@elbrit.org' }], 'notReporting', false, [], contacts);
    expect(row).toMatchObject({
      'Employee code': 'EMP-7',
      Department: 'Sales - EL',
      'User ID': 'ravi@elbrit.org',
      Phone: '98400',
      Email: 'r@x.in',
    });
  });

  it('drops the day columns for a single day', () => {
    const [row] = attendanceExportRows([ravi], team, 'notReporting', false, ['2026-10-01']);
    expect(row).not.toHaveProperty('Days not reported');
    expect(row).not.toHaveProperty('Not reported on');
    expect(row['Calls done']).toBe(2);
  });
});

describe('attendanceExportFilename', () => {
  it('names the state and window', () => {
    expect(attendanceExportFilename('notReporting', ['2026-10-01', '2026-10-12'])).toBe(
      'not-reported_2026-10-01_to_2026-10-12.xlsx',
    );
    expect(attendanceExportFilename('notReporting', ['2026-10-12'])).toBe('not-reported_2026-10-12.xlsx');
  });
});
