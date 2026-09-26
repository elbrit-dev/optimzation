import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { DoctorPlanSheet } from '../DoctorPlanSheet';

/* jsdom ships no IntersectionObserver, so the sheets fall back to rendering
   everything and the paging never runs. These stub it and fire it by hand,
   which is the only way to see the behaviour the reader actually gets. */

const TEAM = [{ id: 'A', name: 'Anil', short: 'BE', reportsTo: null, hq: 'HQ-Hubballi' }];

function rows(n) {
  return Array.from({ length: n }, (_, i) => ({
    eventId: `EV${i}`, plannedDate: '2026-09-05', employeeId: 'A', employeeName: 'Anil',
    participantId: 'A', participantName: 'Anil', participantShort: 'BE',
    doctorId: `DR-${i}`, doctorName: `Dr ${String(i).padStart(3, '0')}`,
    hq: 'HQ-Hubballi', doctorCity: '', doctorSpecialty: 'CARDIO', doctorCategories: [],
    pobGiven: false, visitTime: '2026-09-05 10:00:00', distanceKm: null,
    forceVisit: false, forceVisitReason: '',
  }));
}

/* Captures every observer so a test can fire the most recent one — the hook
   rebuilds it on each page, and only the live one matters. */
let observers = [];
function stubObserver() {
  observers = [];
  vi.stubGlobal('IntersectionObserver', class {
    constructor(cb) { this.cb = cb; observers.push(this); }
    observe() {}
    disconnect() { observers = observers.filter((o) => o !== this); }
  });
}
const scrollToBottom = () => act(() => {
  observers.at(-1)?.cb([{ isIntersecting: true }]);
});

const plan = (n) => render(
  <DoctorPlanSheet member={TEAM[0]} team={TEAM} rows={rows(n)} pob={[]}
    periodLabel="Aug 2026" onClose={vi.fn()} />,
);
const cards = () => screen.getAllByRole('button', { name: /^Dr \d/ }).length;

afterEach(() => vi.unstubAllGlobals());

describe('infinite scroll', () => {
  it('renders one page first, not the whole month', () => {
    stubObserver();
    plan(237);
    expect(cards()).toBe(30);
  });

  it('extends as the reader reaches the bottom', () => {
    stubObserver();
    plan(237);
    scrollToBottom();
    expect(cards()).toBe(60);
    scrollToBottom();
    expect(cards()).toBe(90);
  });

  it('reaches the end and stops watching', () => {
    stubObserver();
    plan(65);
    for (let i = 0; i < 5; i += 1) scrollToBottom();
    expect(cards()).toBe(65);
    // Nothing left to load, so nothing is left observing the bottom.
    expect(observers).toHaveLength(0);
  });

  it('counts what is shown against the whole list, not a cap', () => {
    stubObserver();
    plan(237);
    expect(screen.getByText(/showing 30 of 237/)).toBeInTheDocument();
    scrollToBottom();
    expect(screen.getByText(/showing 60 of 237/)).toBeInTheDocument();
  });

  it('drops the count once everything is on screen', () => {
    stubObserver();
    plan(10);
    expect(screen.queryByText(/showing/)).not.toBeInTheDocument();
  });

  it('renders everything where IntersectionObserver does not exist', () => {
    /* Slow beats truncated: rows nobody can reach are worse than a long
       list. This is also why the whole suite passed before these tests. */
    vi.stubGlobal('IntersectionObserver', undefined);
    plan(120);
    expect(cards()).toBe(120);
  });
});
