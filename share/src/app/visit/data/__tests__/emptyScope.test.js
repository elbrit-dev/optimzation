import { describe, expect, it } from 'vitest';
import { attendance, byHq, callAverage, geoSplit, happened, planned, pobTotal, visitsByHour, activeReps } from '../selectors';

/* With nothing selected the report short-circuits to an empty state, but the
   derived `view` memo still runs over empty arrays. None of it may throw. */
describe('empty scope', () => {
  it('every selector tolerates an empty team and no rows', () => {
    expect(() => {
      attendance([], []);
      byHq([], []);
      geoSplit([]);
      visitsByHour([]);
      planned([]);
      happened([]);
      pobTotal([]);
      activeReps([], []);
      callAverage([], 0, 1);
    }).not.toThrow();
  });

  it('reports no reps rather than dividing by zero', () => {
    expect(callAverage([], 0, 1)).toBeNull();
    expect(byHq([], [])).toEqual([]);
    expect(activeReps([], [])).toBe(0);
  });
});
