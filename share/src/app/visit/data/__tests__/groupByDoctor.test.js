import { describe, expect, it } from 'vitest';
import { groupByDoctor } from '../selectors';

/* Over a month a rep sees the same doctor more than once, and the plan sheet
   said so by listing that doctor's card again — identical but for a clock
   time. This merges them, and what matters is what survives the merge. */

const visit = (over = {}) => ({
  participantId: 'E1', participantName: 'Anil', participantShort: 'BE',
  plannedDate: '2026-09-05', visitTime: '2026-09-05 10:00:00', forceVisit: false, ...over,
});

const call = (over = {}) => ({
  id: over.id ?? 'EV1',
  doctorId: 'DR-1', doctorName: 'Dr One', doctorCity: 'Erode', hq: 'HQ-Erode',
  plannedDate: over.plannedDate ?? '2026-09-05',
  visitTime: over.visitTime === undefined ? '2026-09-05 10:00:00' : over.visitTime,
  /* Only the keys the caller actually set: spreading an explicit `undefined`
     would wipe the attendance's own defaults rather than leave them. */
  participants: over.participants ?? [visit(Object.fromEntries(
    Object.entries({ plannedDate: over.plannedDate, visitTime: over.visitTime })
      .filter(([, v]) => v !== undefined),
  ))],
  pob: over.pob ?? null,
  ...over,
});

describe('groupByDoctor', () => {
  it('counts the DAYS a doctor was seen, not the visits', () => {
    const [group] = groupByDoctor([
      call({ id: 'A', plannedDate: '2026-09-05', visitTime: '2026-09-05 10:00:00' }),
      call({ id: 'B', plannedDate: '2026-09-11', visitTime: '2026-09-11 15:00:00' }),
    ]);
    expect(group.dayCount).toBe(2);
    expect(group.days).toEqual(['2026-09-05', '2026-09-11']);
  });

  it('counts two visits on ONE day as one day', () => {
    // "2 day visits" is a claim about days; twice before lunch is one of them.
    const [group] = groupByDoctor([
      call({ id: 'A', visitTime: '2026-09-05 10:00:00' }),
      call({ id: 'B', visitTime: '2026-09-05 16:00:00' }),
    ]);
    expect(group.dayCount).toBe(1);
    expect(group.participants).toHaveLength(2);
  });

  it('keeps every attendance, each with the date of its OWN visit', () => {
    /* The table inside the card reads these. Taking the date from whichever
       call created the group would stamp one day on all of them. */
    const [group] = groupByDoctor([
      call({ id: 'A', plannedDate: '2026-09-05', visitTime: '2026-09-05 10:00:00' }),
      call({ id: 'B', plannedDate: '2026-09-11', visitTime: '2026-09-11 15:00:00' }),
    ]);
    expect(group.participants.map((p) => p.plannedDate)).toEqual(['2026-09-05', '2026-09-11']);
  });

  it('never merges two different doctors', () => {
    const groups = groupByDoctor([call({ id: 'A' }), call({ id: 'B', doctorId: 'DR-2', doctorName: 'Dr Two' })]);
    expect(groups).toHaveLength(2);
  });

  it('keeps callers with no doctor apart rather than collapsing them', () => {
    // Two unnamed calls are not the same doctor twice.
    const groups = groupByDoctor([
      call({ id: 'A', doctorId: '', doctorName: '' }),
      call({ id: 'B', doctorId: '', doctorName: '' }),
    ]);
    expect(groups).toHaveLength(2);
  });

  it('sums the money across days', () => {
    // Two visits are two quotations; the per-call rule takes one attendee's
    // figure once, which is a different question.
    const [group] = groupByDoctor([
      call({ id: 'A', pob: 900 }),
      call({ id: 'B', plannedDate: '2026-09-11', visitTime: '2026-09-11 15:00:00', pob: 600 }),
    ]);
    expect(group.pob).toBe(1500);
  });

  it('is red only when EVERY attendance was forced', () => {
    /* A doctor seen properly on Monday and forced on Friday is not a forced
       relationship — the same optimistic rule one call already uses. */
    const mixed = groupByDoctor([
      call({ id: 'A', participants: [visit()] }),
      call({ id: 'B', participants: [visit({ forceVisit: true, visitTime: '2026-09-11 15:00:00' })] }),
    ]);
    expect(mixed[0].forceVisit).toBe(false);
    expect(mixed[0].mixed).toBe(true);

    const allForced = groupByDoctor([
      call({ id: 'A', participants: [visit({ forceVisit: true })] }),
      call({ id: 'B', participants: [visit({ forceVisit: true, visitTime: '2026-09-11 15:00:00' })] }),
    ]);
    expect(allForced[0].forceVisit).toBe(true);
  });

  it('carries the earliest visit as the card’s own moment and day', () => {
    const [group] = groupByDoctor([
      call({ id: 'B', plannedDate: '2026-09-11', visitTime: '2026-09-11 15:00:00' }),
      call({ id: 'A', plannedDate: '2026-09-05', visitTime: '2026-09-05 10:00:00' }),
    ]);
    expect(group.visitTime).toBe('2026-09-05 10:00:00');
    expect(group.plannedDate).toBe('2026-09-05');
  });

  it('leaves a doctor seen once looking exactly as it did', () => {
    // The day view renders these unmerged; the month view must not make a
    // single visit read differently just because it went through the merge.
    const [group] = groupByDoctor([call({ id: 'A' })]);
    expect(group.dayCount).toBe(1);
    expect(group.participants).toHaveLength(1);
    expect(group.visitTime).toBe('2026-09-05 10:00:00');
  });
});

describe('counting the visits behind a card', () => {
  it('counts CALLS, not attendances', () => {
    /* A joint call is one visit two people were on. Counting rows would
       report a doctor seen once by a rep and their manager as seen twice. */
    const joint = call({
      id: 'A',
      participants: [
        visit({ participantId: 'E1', participantName: 'Anil' }),
        visit({ participantId: 'E2', participantName: 'Kamal' }),
      ],
    });
    const [group] = groupByDoctor([joint]);
    expect(group.visitCount).toBe(1);
    expect(group.participants).toHaveLength(2);
  });

  it('counts two calls on one day as two visits and one day', () => {
    // The pair the day count alone cannot tell apart from a single visit.
    const [group] = groupByDoctor([
      call({ id: 'A', visitTime: '2026-09-05 10:00:00' }),
      call({ id: 'B', visitTime: '2026-09-05 16:00:00' }),
    ]);
    expect(group.visitCount).toBe(2);
    expect(group.dayCount).toBe(1);
  });
});
