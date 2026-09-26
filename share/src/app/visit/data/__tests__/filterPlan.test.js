import { describe, expect, it } from 'vitest';
import { filterPlan, planChips, planFilterValues, PLAN_FILTER_DEFS } from '../selectors';

/* The plan sheet's filter and sort, in the shape FilterSortSidebar speaks:
   `values` is { field: string[] } and `sorts` is { field: 'asc'|'desc' }.
   These are the parts a screenshot cannot show — what a tab offers, what it
   searches, and which order Apply actually produces. */

function call(over = {}) {
  return {
    id: over.id ?? 'EV1',
    doctorId: 'DR-1',
    doctorName: 'Dr One',
    doctorCity: 'Hubballi',
    doctorSpecialty: 'CARDIO',
    doctorCategories: ['C', 'EC10'],
    hq: 'HQ-Hubballi',
    plannedDate: '2026-09-05',
    visitTime: '2026-09-05 10:00:00',
    /* A grouped call carries its attendees, and the rep filter reads them.
       One name unless a test says otherwise — the solo call the live data
       mostly holds. */
    participants: [{ participantId: 'E1', participantName: 'Anil Kumar' }],
    ...over,
  };
}

const CALLS = [
  call({ id: 'A', doctorId: 'DR-1', doctorName: 'Dr Anil', doctorCity: 'Hubballi', visitTime: '2026-09-05 14:00:00' }),
  call({ id: 'B', doctorId: 'DR-2', doctorName: 'Dr Bala', doctorCity: 'Dharwad', hq: 'HQ-Dharwad', doctorSpecialty: 'DERMA', doctorCategories: ['SC'], plannedDate: '2026-09-06', visitTime: '2026-09-06 09:00:00' }),
  call({ id: 'C', doctorId: 'DR-3', doctorName: 'Dr Chitra', doctorCity: 'Dharwad', hq: 'HQ-Dharwad', doctorSpecialty: 'CARDIO', doctorCategories: ['E', 'EC10'], plannedDate: '2026-09-04', visitTime: null }),
];

describe('filterPlan', () => {
  it('leaves the plan alone when nothing is picked', () => {
    expect(filterPlan(CALLS, {}).map((c) => c.id).sort()).toEqual(['A', 'B', 'C']);
    expect(filterPlan(CALLS).length).toBe(3);
  });

  it('treats an empty array as "all", which is what an untouched tab sends', () => {
    expect(filterPlan(CALLS, { values: { city: [] } }).length).toBe(3);
  });

  it('keeps only the picked values, and ORs within one field', () => {
    expect(filterPlan(CALLS, { values: { doctor: ['DR-2', 'DR-3'] } }).map((c) => c.id)).toEqual(['B', 'C']);
  });

  it('ANDs across fields', () => {
    expect(filterPlan(CALLS, { values: { city: ['Dharwad'], hq: ['HQ-Dharwad'] } }).length).toBe(2);
    expect(filterPlan(CALLS, { values: { city: ['Dharwad'], hq: ['HQ-Hubballi'] } })).toEqual([]);
  });

  it('empties the list when nothing matches, rather than falling back to all', () => {
    // The sheet says "no calls match these filters" off the back of this.
    expect(filterPlan(CALLS, { values: { doctor: ['DR-999'] } })).toEqual([]);
  });

  it('ignores a value picked for a field that has no tab', () => {
    /* Date and time are sort-only now (see PLAN_FILTER_DEFS). Nothing can
       send values for them, and if something did, matching nothing would be
       worse than ignoring it -- an empty plan reads as a broken screen. */
    expect(filterPlan(CALLS, { values: { visitTime: ['09'] } }).length).toBe(3);
  });

  it('sorts newest first by default', () => {
    expect(filterPlan(CALLS, {}).map((c) => c.id)).toEqual(['B', 'A', 'C']);
  });

  it('puts pending calls last in EITHER direction', () => {
    // A call with no visit time has no moment; it heads neither order.
    expect(filterPlan(CALLS, { sorts: { visitDate: 'asc' } }).map((c) => c.id)).toEqual(['A', 'B', 'C']);
    expect(filterPlan(CALLS, { sorts: { visitDate: 'desc' } }).map((c) => c.id)).toEqual(['B', 'A', 'C']);
  });

  it('sorts by time of day across dates, which is the point of the second date sort', () => {
    // B is the LATER date but the earlier hour, so it leads ascending.
    expect(filterPlan(CALLS, { sorts: { visitTime: 'asc' } }).map((c) => c.id)).toEqual(['B', 'A', 'C']);
  });

  it('sorts by doctor name, not by the code the filter keys on', () => {
    expect(filterPlan(CALLS, { sorts: { doctor: 'asc' } }).map((c) => c.id)).toEqual(['A', 'B', 'C']);
  });

  it('honours the first sort when the sidebar sends several', () => {
    const picked = filterPlan(CALLS, { sorts: { visitTime: 'asc', doctor: 'desc' } });
    expect(picked.map((c) => c.id)).toEqual(['B', 'A', 'C']);
  });

  it('does not reorder the caller\'s array', () => {
    const input = [...CALLS];
    filterPlan(input, { sorts: { doctor: 'asc' } });
    expect(input.map((c) => c.id)).toEqual(['A', 'B', 'C']);
  });
});

describe('planFilterValues', () => {
  it('offers values for every field the sidebar gives a tab', () => {
    for (const def of PLAN_FILTER_DEFS.filter((d) => !d.sortOnly)) {
      expect(planFilterValues(CALLS, def.key).length).toBeGreaterThan(0);
    }
  });

  it('offers none for the sort-only fields, which have no tab to fill', () => {
    for (const def of PLAN_FILTER_DEFS.filter((d) => d.sortOnly)) {
      expect(planFilterValues(CALLS, def.key)).toEqual([]);
    }
  });

  it('lists each value once, labelled for a reader', () => {
    expect(planFilterValues(CALLS, 'doctor')).toEqual([
      { value: 'DR-1', label: 'Dr Anil · DR-1', count: 1 },
      { value: 'DR-2', label: 'Dr Bala · DR-2', count: 1 },
      { value: 'DR-3', label: 'Dr Chitra · DR-3', count: 1 },
    ]);
  });

  it('strips the HQ- prefix, which is an ERPNext naming convention', () => {
    expect(planFilterValues(CALLS, 'hq').map((v) => v.label)).toEqual(['Dharwad', 'Hubballi']);
  });

  it('drops blanks, which are a way to empty the list by accident', () => {
    const noCity = [call({ id: 'X', doctorCity: '' }), call({ id: 'Y', doctorCity: 'Hubballi' })];
    expect(planFilterValues(noCity, 'city')).toEqual([{ value: 'Hubballi', label: 'Hubballi', count: 1 }]);
  });

  it('searches the doctor tab by NAME and by CODE', () => {
    expect(planFilterValues(CALLS, 'doctor', { search: 'chit' }).map((v) => v.value)).toEqual(['DR-3']);
    expect(planFilterValues(CALLS, 'doctor', { search: 'dr-2' }).map((v) => v.value)).toEqual(['DR-2']);
  });

  it('pages, and a short page means no more', () => {
    expect(planFilterValues(CALLS, 'doctor', { page: 1, pageLength: 2 }).map((v) => v.value)).toEqual(['DR-1', 'DR-2']);
    expect(planFilterValues(CALLS, 'doctor', { page: 2, pageLength: 2 }).map((v) => v.value)).toEqual(['DR-3']);
    expect(planFilterValues(CALLS, 'doctor', { page: 3, pageLength: 2 })).toEqual([]);
  });

  it('searches the whole plan, then pages the answer', () => {
    // Not "page one, then search it" — the reverse is how a search box lies.
    const many = Array.from({ length: 80 }, (_, i) =>
      call({ id: `E${i}`, doctorId: `DR-${1000 + i}`, doctorName: i === 79 ? 'Dr Zebedee' : `Dr Number ${i}` }));
    expect(planFilterValues(many, 'doctor', { search: 'zebedee' }).map((v) => v.value)).toEqual(['DR-1079']);
  });
});

describe('planChips', () => {
  it('has nothing to say about an untouched plan', () => {
    expect(planChips(CALLS, {})).toEqual([]);
    expect(planChips(CALLS)).toEqual([]);
  });

  it('names each applied value the way the panel named it', () => {
    // Same label as the ticked box it came from, or the chip is a second
    // vocabulary for the same filter.
    expect(planChips(CALLS, { values: { doctor: ['DR-2'], hq: ['HQ-Dharwad'] } })).toEqual([
      { kind: 'value', key: 'doctor', value: 'DR-2', label: 'Dr Bala · DR-2' },
      { kind: 'value', key: 'hq', value: 'HQ-Dharwad', label: 'Dharwad' },
    ]);
  });

  it('carries every picked value past the first page of options', () => {
    const many = Array.from({ length: 80 }, (_, i) =>
      call({ id: `E${i}`, doctorId: `DR-${1000 + i}`, doctorName: `Dr Number ${i}` }));
    // DR-1079 is well beyond a 50-long page: labelling from page one would
    // leave the chip showing a raw code.
    expect(planChips(many, { values: { doctor: ['DR-1079'] } })[0].label).toBe('Dr Number 79 · DR-1079');
  });

  it('reads a sort as an order, not as another filter', () => {
    expect(planChips(CALLS, { sorts: { visitTime: 'asc' } })).toEqual([
      { kind: 'sort', key: 'visitTime', label: 'Visit time ↑' },
    ]);
    expect(planChips(CALLS, { sorts: { doctor: 'desc' } })[0].label).toBe('Doctor ↓');
  });

  it('ignores an emptied field, so removing the last chip removes the row', () => {
    expect(planChips(CALLS, { values: { doctor: [] } })).toEqual([]);
  });
});

/* A doctor carries one specialty and up to FOUR category links at once, which
   makes the category tab the only multi-valued filter on this sheet. */
describe('the doctor’s own attributes', () => {
  it('filters by specialty', () => {
    expect(filterPlan(CALLS, { values: { specialty: ['CARDIO'] } }).map((c) => c.id)).toEqual(['A', 'C']);
  });

  it('matches a call when ANY of its categories is picked', () => {
    // A is [C, EC10], C is [E, EC10]. Picking EC10 keeps both.
    expect(filterPlan(CALLS, { values: { category: ['EC10'] } }).map((c) => c.id).sort()).toEqual(['A', 'C']);
    expect(filterPlan(CALLS, { values: { category: ['SC'] } }).map((c) => c.id)).toEqual(['B']);
  });

  it('still ANDs the category against the other tabs', () => {
    expect(filterPlan(CALLS, { values: { category: ['EC10'], city: ['Hubballi'] } }).map((c) => c.id)).toEqual(['A']);
  });

  it('lists every category a plan touches, once each', () => {
    expect(planFilterValues(CALLS, 'category').map((v) => v.value)).toEqual(['C', 'E', 'EC10', 'SC']);
    expect(planFilterValues(CALLS, 'specialty').map((v) => v.value)).toEqual(['CARDIO', 'DERMA']);
  });

  it('offers nothing for a doctor carrying neither', () => {
    // An empty list is not an option: it is a way to empty the plan by accident.
    const bare = [call({ id: 'X', doctorSpecialty: '', doctorCategories: [] })];
    expect(planFilterValues(bare, 'category')).toEqual([]);
    expect(planFilterValues(bare, 'specialty')).toEqual([]);
  });

  it('sorts by the FIRST category, the commercial grade every doctor has', () => {
    /* A is [C, EC10] and B is [SC], so A leads ascending — sorted by the
       joined list, "C, EC10" would have fallen after "C" for no reason a
       reader could name. C trails both because it is pending, which outranks
       every sort. */
    expect(filterPlan(CALLS, { sorts: { category: 'asc' } }).map((c) => c.id)).toEqual(['A', 'B', 'C']);
    expect(filterPlan(CALLS, { sorts: { category: 'desc' } }).map((c) => c.id)).toEqual(['B', 'A', 'C']);
  });

  it('names them on a chip the way the panel named them', () => {
    expect(planChips(CALLS, { values: { category: ['EC10'], specialty: ['CARDIO'] } })).toEqual([
      { kind: 'value', key: 'specialty', value: 'CARDIO', label: 'CARDIO' },
      { kind: 'value', key: 'category', value: 'EC10', label: 'EC10' },
    ]);
  });
});

/* The number beside each value in the panel. It is the reason a reader can
   tell a filter worth applying from one that empties the list. */
describe('value counts', () => {
  it('counts the calls behind each value', () => {
    const many = [
      call({ id: '1', doctorCity: 'Hubballi' }),
      call({ id: '2', doctorCity: 'Hubballi' }),
      call({ id: '3', doctorCity: 'Dharwad' }),
    ];
    expect(planFilterValues(many, 'city')).toEqual([
      { value: 'Dharwad', label: 'Dharwad', count: 1 },
      { value: 'Hubballi', label: 'Hubballi', count: 2 },
    ]);
  });

  it('counts a call under every category it carries', () => {
    // Not a partition: the counts down a category tab sum to more than the plan.
    const counts = Object.fromEntries(planFilterValues(CALLS, 'category').map((v) => [v.value, v.count]));
    expect(counts).toEqual({ C: 1, EC10: 2, E: 1, SC: 1 });
  });

  it('narrows the counts by what the OTHER tabs have picked', () => {
    /* Counted against the whole plan, "CARDIO 2" beside a list filtered to
       Dharwad would be a number matching nothing on screen. */
    const all = planFilterValues(CALLS, 'specialty');
    expect(all.find((v) => v.value === 'CARDIO').count).toBe(2);

    const inDharwad = planFilterValues(CALLS, 'specialty', {
      currentFilters: { city: ['Dharwad'] },
    });
    expect(inDharwad.find((v) => v.value === 'CARDIO').count).toBe(1);
  });

  it('ignores this tab’s OWN selection when counting', () => {
    /* Otherwise every unticked value reads 0 — true, and useless: the reader
       is asking what happens if they tick it. */
    const values = planFilterValues(CALLS, 'city', { currentFilters: { city: ['Hubballi'] } });
    expect(values.find((v) => v.value === 'Dharwad').count).toBe(2);
  });

  it('keeps a value that would leave nothing, as a zero', () => {
    // A list that loses options as you narrow reads as a list that broke.
    const values = planFilterValues(CALLS, 'city', { currentFilters: { specialty: ['DERMA'] } });
    expect(values.find((v) => v.value === 'Hubballi')).toEqual({ value: 'Hubballi', label: 'Hubballi', count: 0 });
  });
});

/* Who went. The hourly sheet is every rep's 2pm, so this is the tab that
   makes that list navigable; a single rep's own plan culls it out. */
describe('the rep filter', () => {
  const joint = call({
    id: 'J',
    participants: [
      { participantId: 'E1', participantName: 'Anil Kumar' },
      { participantId: 'E2', participantName: 'Tousif A' },
    ],
  });
  const solo = call({ id: 'S', participants: [{ participantId: 'E3', participantName: 'Bala R' }] });

  it('keeps a joint call under EITHER attendee', () => {
    // It belongs to both of them, not to whoever is listed first.
    expect(filterPlan([joint, solo], { values: { rep: ['E1'] } }).map((c) => c.id)).toEqual(['J']);
    expect(filterPlan([joint, solo], { values: { rep: ['E2'] } }).map((c) => c.id)).toEqual(['J']);
    expect(filterPlan([joint, solo], { values: { rep: ['E3'] } }).map((c) => c.id)).toEqual(['S']);
  });

  it('lists attendees by name, not by employee id', () => {
    expect(planFilterValues([joint, solo], 'rep')).toEqual([
      { value: 'E1', label: 'Anil Kumar', count: 1 },
      { value: 'E3', label: 'Bala R', count: 1 },
      { value: 'E2', label: 'Tousif A', count: 1 },
    ]);
  });

  it('offers nothing when a call has no attendee on it', () => {
    // visitsIn rows that never resolved to a person: an id-less tab is no tab.
    expect(planFilterValues([call({ participants: [] })], 'rep')).toEqual([]);
  });
});

/* Over a month the plan sheet merges a doctor's visits into one card, so a
   card can span several days — and then "which day is this card" depends on
   which end of it you are asking about. */
describe('sorting cards that cover several days', () => {
  const visit = (date, time, name) => ({
    participantId: 'E1', participantName: name ?? 'Anil', plannedDate: date, visitTime: `${date} ${time}`,
  });
  const merged = (id, doctor, ...visits) => ({
    id, doctorId: doctor, doctorName: doctor, doctorCity: 'Erode', hq: 'HQ-Erode',
    doctorSpecialty: 'CARDIO', doctorCategories: ['C'],
    plannedDate: visits[0].plannedDate,
    visitTime: visits[0].visitTime,
    participants: visits,
  });

  /* SPREAD was seen twice, on the first and the last day of the window;
     MIDDLE once, between them. */
  const SPREAD = merged('SPREAD', 'DR-1', visit('2026-09-01', '09:00:00'), visit('2026-09-23', '16:00:00'));
  const MIDDLE = merged('MIDDLE', 'DR-2', visit('2026-09-10', '11:00:00'));

  it('leads with the most recent visit, not the oldest one on the card', () => {
    /* SPREAD's latest is the 23rd, later than MIDDLE's only visit, so it
       heads a latest-first list. Ranked by the card's `visitTime` — the
       earliest of its visits, the 1st — it would have come last. */
    expect(filterPlan([MIDDLE, SPREAD], { sorts: { visitDate: 'desc' } }).map((c) => c.id))
      .toEqual(['SPREAD', 'MIDDLE']);
  });

  it('leads with the earliest visit when asked for oldest first', () => {
    expect(filterPlan([MIDDLE, SPREAD], { sorts: { visitDate: 'asc' } }).map((c) => c.id))
      .toEqual(['SPREAD', 'MIDDLE']);
  });

  it('reads the same end for the time-of-day order', () => {
    /* Ascending compares SPREAD's 09:00 against MIDDLE's 11:00; descending
       compares SPREAD's 16:00 against the same 11:00. The card leads both
       lists, and for opposite reasons. */
    expect(filterPlan([MIDDLE, SPREAD], { sorts: { visitTime: 'asc' } }).map((c) => c.id))
      .toEqual(['SPREAD', 'MIDDLE']);
    expect(filterPlan([MIDDLE, SPREAD], { sorts: { visitTime: 'desc' } }).map((c) => c.id))
      .toEqual(['SPREAD', 'MIDDLE']);
  });

  it('still puts a card with nothing done at the end', () => {
    const pending = { ...merged('PEND', 'DR-3', visit('2026-09-05', '10:00:00')), visitTime: null,
      participants: [{ participantId: 'E1', participantName: 'Anil', plannedDate: '2026-09-05', visitTime: null }] };
    expect(filterPlan([pending, MIDDLE], { sorts: { visitDate: 'asc' } }).map((c) => c.id))
      .toEqual(['MIDDLE', 'PEND']);
  });
});
