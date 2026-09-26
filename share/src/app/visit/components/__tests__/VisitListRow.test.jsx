import { describe, expect, it } from 'vitest';
import { forceNote, visitStatus } from '../VisitListRow';
import { VISIT_STATUS_LABEL } from '../../data/shape';

/* These two functions are the only place the screen decides what green, red
   and grey MEAN, and how a forced call is worded. Pinned here rather than
   re-asserted through each sheet that renders them.

   The flat row component these used to test is gone — both sheets render the
   doctor card now, and its behaviour is covered by DoctorCard and
   DoctorPlanSheet. */

function visit(over = {}) {
  return { visitTime: '2026-09-05 14:10:00', forceVisit: false, distanceKm: null, forceVisitReason: '', ...over };
}

describe('visitStatus', () => {
  it('calls a completed, on-location visit geo verified', () => {
    expect(visitStatus(visit())).toEqual({ tone: 'success', label: 'Geo' });
  });

  it('calls a forced visit a force visit, even though it is done', () => {
    // A force visit IS completed. The pill must not read as "not done".
    expect(visitStatus(visit({ forceVisit: true }))).toEqual({ tone: 'danger', label: 'Force' });
  });

  it('calls a visit with no time pending', () => {
    expect(visitStatus(visit({ visitTime: null }))).toEqual({ tone: 'neutral', label: 'Pending' });
  });

  it('takes its words from the screen lexicon, and offers no override', () => {
    /* There used to be a `verifiedLabel` argument, so the doctor plan sheet
       could soften green to "Visited". What it produced was a card whose
       header said "Visited" and whose attendee rows said "Geo verified" —
       one call, one colour, two words. Any extra argument is ignored now. */
    expect(visitStatus(visit(), 'Visited').label).toBe(VISIT_STATUS_LABEL.verified);
    expect(visitStatus(visit({ forceVisit: true })).label).toBe(VISIT_STATUS_LABEL.force);
    expect(visitStatus(visit({ visitTime: null })).label).toBe(VISIT_STATUS_LABEL.pending);
  });
});

describe('forceNote', () => {
  it('puts the distance before the reason', () => {
    // The distance is what TRIPPED the flag; the reason is the rep's account
    // of it, so the measurement leads.
    expect(forceNote(visit({ forceVisit: true, distanceKm: 8.2, forceVisitReason: 'Camp duty' })))
      .toBe('8.2 km away · Camp duty');
  });

  it('gives metres under a kilometre', () => {
    expect(forceNote(visit({ forceVisit: true, distanceKm: 0.612 }))).toBe('612 m away');
  });

  it('carries the distance alone when no reason was typed', () => {
    // The field is not mandatory and most forced calls carry nothing.
    expect(forceNote(visit({ forceVisit: true, distanceKm: 8.2 }))).toBe('8.2 km away');
  });

  it('carries the reason alone when the distance is missing', () => {
    expect(forceNote(visit({ forceVisit: true, forceVisitReason: 'Clinic closed' }))).toBe('Clinic closed');
  });

  it('says nothing at all on an ordinary call', () => {
    // '' is also the render condition: there is no line to draw.
    expect(forceNote(visit({ distanceKm: 0.2 }))).toBe('');
  });
});
