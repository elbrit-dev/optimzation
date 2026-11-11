import { describe, expect, it } from 'vitest';
import { groupWaiting, normalizeLeave, rangeLabel, shapeLeaves } from '../data/shape';
import { leaveApprovalTile } from '../data/tile';
import { MOCK_ABM, MOCK_RBM, MOCK_TODAY, buildMockRows } from '../data/mockData';

const shape = (viewer) => shapeLeaves(buildMockRows(), { viewer, today: MOCK_TODAY });

describe('leave approval shape', () => {
  it('lists the open leaves routed to the approver, most urgent first', () => {
    const { waiting } = shape(MOCK_ABM);
    expect(waiting.map((l) => l.employeeName)).toEqual(['Karthik S', 'Divya R', 'Manoj K', 'Priya V', 'Suresh B']);
    expect(waiting.map((l) => l.urgency)).toEqual(['started', 'started', 'soon', 'soon', 'later']);
  });

  it('works out how long a leave has waited', () => {
    const manoj = shape(MOCK_ABM).waiting.find((l) => l.employeeName === 'Manoj K');
    expect(manoj.waitingDays).toBe(5);
  });

  it('shows the escalation approver only leaves waiting 2+ days or already started', () => {
    const { waiting } = shape(MOCK_RBM);
    const names = waiting.map((l) => l.employeeName);
    expect(names).toContain('Ganesh T'); // another ABM's, waited 6 days
    expect(names).not.toContain('Priya V'); // applied today
    expect(waiting.every((l) => l.role === 'escalation')).toBe(true);
  });

  it('keeps decided leaves for the Decided tab, newest first', () => {
    expect(shape(MOCK_ABM).decided.map((l) => l.name)).toEqual(['HR-LAP-2026-00490', 'HR-LAP-2026-00488', 'HR-LAP-2026-00481']);
  });

  it('lists the open leaves waiting on someone else, without making them the viewer\'s', () => {
    const { waiting, others } = shape(MOCK_RBM);
    const names = new Set(waiting.map((l) => l.name));
    expect(others.length).toBeGreaterThan(0);
    for (const l of others) {
      expect(names.has(l.name)).toBe(false);
      expect(l.role).toBe('watcher');
    }
  });

  it('reads the ERP rich-text reason as plain text and the department as a team', () => {
    const l = normalizeLeave({ name: 'x', from_date: '2026-11-11', description: '<h4><code>housewarming&nbsp;ceremony</code></h4>', department__name: 'Elbrit Kerala - ELPL', status: 'OPEN' });
    expect(l.reason).toBe('housewarming ceremony');
    expect(l.team).toBe('Elbrit Kerala');
    expect(l.status).toBe('Open');
  });

  it('labels date ranges', () => {
    expect(rangeLabel('2026-11-11', '2026-11-11')).toBe('Wed 11 Nov');
    expect(rangeLabel('2026-11-11', '2026-11-12')).toBe('11 – 12 Nov');
    expect(rangeLabel('2026-11-30', '2026-12-02')).toBe('30 Nov – 2 Dec');
  });

  it('groups by urgency and drops empty groups', () => {
    expect(groupWaiting(shape(MOCK_ABM).waiting).map((g) => [g.id, g.items.length])).toEqual([['started', 2], ['soon', 2], ['later', 1]]);
  });
});

describe('leave approval Ring Nav tile', () => {
  it('counts what waits, captions Today when one has started, splits by urgency', () => {
    const tile = leaveApprovalTile(shape(MOCK_ABM).waiting);
    expect(tile).toMatchObject({ id: 'leave-approval', count: 5, caption: 'Today', captionTone: 'danger' });
    expect(tile.segments.map((s) => [s.key, s.value])).toEqual([['started', 2], ['soon', 2], ['later', 1]]);
  });

  it('gives no tile when nothing waits', () => {
    expect(leaveApprovalTile([])).toBeNull();
  });

  it('follows the ERP live rule when rows carry it, over the stored approver fields', () => {
    const rows = buildMockRows().map((r) => ({ ...r }));
    const a = rows.find((r) => r.name === 'HR-LAP-2026-00503');
    const b = rows.find((r) => r.name === 'HR-LAP-2026-00505');
    a.decide = { can: null, approver_names: 'Ravi Shankar' };                  // stored says Arun, the rule says Ravi
    b.decide = { can: 'override', approver_names: 'Arun Prakash' };            // HR deciding someone else's
    const { waiting, others } = shapeLeaves(rows, { viewer: MOCK_ABM, today: MOCK_TODAY });
    expect(waiting.some((l) => l.name === a.name)).toBe(false);
    expect(others.find((l) => l.name === a.name).approverName).toBe('Ravi Shankar');
    expect(waiting.find((l) => l.name === b.name).role).toBe('override');
  });
});

