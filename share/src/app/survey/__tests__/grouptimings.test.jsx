import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QuestionCard } from '../components/QuestionCard';
import { answerProblem, toPayload } from '../data/shape';

/* 28 Nov 2026 · a map inside a Repeated group can also ask the visiting timings at the place each entry chose */
const grp = {
  id: 'g', type: 'repeat', label: 'Every hospital or clinic', required: 1, button: 'Add another hospital or clinic', min: 1, max: 5,
  fields: [
    { id: 'p', type: 'map_location', label: 'Hospital or clinic', required: 1 },
    { id: 'p_t', type: 'timings', of: 'p', label: 'Visiting timings at this place', required: 1 },
  ],
};
const place = { lat: 26.77, lng: 82.17, place_id: 'gp-1', name: 'Sagar Dispensary', how: 'place' };
const day = (state, slots = []) => ({ state, slots });
const week = (mon) => ({ Monday: mon, Tuesday: day('closed'), Wednesday: day('closed'), Thursday: day('closed'), Friday: day('closed'), Saturday: day('closed'), Sunday: day('na') });

describe('Visiting timings inside a Repeated group', () => {
  it("each entry's timings belong to that entry's place, and are required with it", () => {
    expect(answerProblem(grp, [{ p: place }])).toMatch(/Visiting timings at this place: Wait for the timings to load/);
    const ok = [{ p: place, p_t: { place_id: 'gp-1', place_name: 'Sagar Dispensary', days: week(day('open', [['10:00', '13:00']])), source: 'google' } }];
    expect(answerProblem(grp, ok)).toBeNull();
    const bad = [{ p: place, p_t: { place_id: 'gp-1', days: week(day('open', [['13:00', '10:00']])) } }];
    expect(answerProblem(grp, bad)).toMatch(/Fix the timings in red/);
    expect(toPayload([grp], { g: ok }).g[0].p_t.days.Monday).toEqual(day('open', [['10:00', '13:00']]));
  });

  it('shows the timings under the map in the entry', () => {
    render(<QuestionCard q={grp} index={0} value={[{ p: place }]} onChange={() => {}} api={{ mapsKey: async () => ({}), places: async () => ({ places: [] }) }} response="SR-1" />);
    expect(screen.getByText('Visiting timings at this place')).toBeTruthy();
  });
});
