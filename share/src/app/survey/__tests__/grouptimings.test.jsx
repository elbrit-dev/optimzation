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

  it('a day Google shows as 24 hours is warned at once (not only refused)', () => {
    const all = { p: place, p_t: { place_id: 'gp-1', place_name: 'Sagar Dispensary', days: week(day('open', [['00:00', '23:59']])), source: 'google' } };
    render(<QuestionCard q={grp} index={0} value={[all]} onChange={() => {}} api={{ mapsKey: async () => ({}), places: async () => ({ places: [] }) }} response="SR-1" />);
    expect(screen.queryByText(/Google shows this place open 24 hours/)).toBeNull();
    expect(screen.getByText('Google shows 24 hours — enter the actual timings.')).toBeTruthy();
    expect(answerProblem(grp, [all])).toMatch(/Fix the timings in red/);
  });

  it('a place Google lists as 24 hours: the days load empty with one hint, and Monday can be copied to every open day', async () => {
    const { fireEvent, waitFor } = await import('@testing-library/react');
    const all = {};
    ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].forEach((d) => (all[d] = { state: 'open', slots: [] }));
    let got = null;
    const api = { mapsKey: async () => ({}), places: async (a) => (a.mode === 'hours' ? { hours: { has: 1, name: 'Sagar Dispensary', days: all, h24: Object.keys(all), special: [] } } : { places: [] }) };
    const { rerender } = render(<QuestionCard q={grp} index={0} value={[{ p: place }]} onChange={(v) => { got = v; }} api={api} response="SR-1" />);
    await waitFor(() => expect(got?.[0]?.p_t?.days).toBeTruthy());
    expect(got[0].p_t.days.Monday).toEqual({ state: 'open', slots: [['', '']] });
    rerender(<QuestionCard q={grp} index={0} value={got} onChange={(v) => { got = v; }} api={api} response="SR-1" />);
    expect(screen.getByText(/Open 24 hours on Google/)).toBeTruthy();
    expect(screen.queryByText(/Google shows 24 hours/)).toBeNull();
    const filled = JSON.parse(JSON.stringify(got));
    filled[0].p_t.days.Monday.slots = [['10:00', '13:00']];
    filled[0].p_t.days.Sunday = { state: 'closed', slots: [] };
    rerender(<QuestionCard q={grp} index={0} value={filled} onChange={(v) => { got = v; }} api={api} response="SR-1" />);
    fireEvent.click(screen.getByRole('button', { name: /Copy Mon to all/ }));
    expect(got[0].p_t.days.Friday.slots).toEqual([['10:00', '13:00']]);
    expect(got[0].p_t.days.Sunday).toEqual({ state: 'closed', slots: [] });
    // one tap: Open | Closed | N/A
    fireEvent.click(screen.getAllByRole('radio', { name: 'Closed' })[1]);
    expect(got[0].p_t.days.Tuesday).toEqual({ state: 'closed', slots: [] });
  });

  it('the week in one line', async () => {
    const { weekLine } = await import('../components/QuestionCard');
    const o = (sl) => ({ state: 'open', slots: sl });
    const v = { days: { Monday: o([['10:00', '13:00']]), Tuesday: o([['10:00', '13:00']]), Wednesday: o([['10:00', '13:00']]), Thursday: o([['10:00', '13:00']]), Friday: o([['10:00', '13:00']]), Saturday: o([['10:00', '13:00']]), Sunday: { state: 'closed', slots: [] } } };
    expect(weekLine(v)).toEqual({ text: 'Mon–Sat 10:00–13:00 · Sun Closed', done: true });
    v.days.Friday = o([['', '']]);
    expect(weekLine(v).done).toBe(false);
    expect(weekLine(v).text).toBe('Mon–Thu 10:00–13:00 · Fri to fill · Sat 10:00–13:00 · Sun Closed');
  });

  it('a sent answer reads as places and a week, not one line of text', () => {
    const shop = { lat: 26.79, lng: 82.2, place_id: 'gp-2', name: 'Prakash Medical store', kind: 'Pharmacy', address: 'Darshan Nagar Rd, Ayodhya 224135', how: 'place', serving: { customer: 'C1', label: 'Buddha Medical Agencies' } };
    const wk = { place_id: 'gp-2', place_name: 'Prakash Medical store', days: week(day('open', [['10:00', '13:00']])) };
    render(<QuestionCard q={grp} index={0} value={[{ p: shop, p_t: wk }]} onChange={() => {}} readOnly />);
    expect(screen.getByText('Prakash Medical store', { selector: 'p' })).toBeTruthy();
    expect(screen.getByText('Darshan Nagar Rd, Ayodhya 224135')).toBeTruthy();
    expect(screen.getByText('Buddha Medical Agencies')).toBeTruthy();
    expect(screen.getByText('Visiting timings at this place')).toBeTruthy();
    expect(screen.getByText('10:00–13:00')).toBeTruthy();
    expect(screen.getByText('Tue–Sat')).toBeTruthy();
    expect(screen.queryByText(/Distributor: Buddha/)).toBeNull();
  });
});
