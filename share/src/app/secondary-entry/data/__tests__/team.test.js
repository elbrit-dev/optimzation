import { describe, expect, it } from 'vitest';
import { hasTeam, teamIndex, teamTops } from '../team';

const m = (id, reportsTo, over = {}) => ({ id, name: id, seat: `${id}-SEAT`, tier: 'BE', reportsTo, vacant: 0, approved: 0, waiting: 0, todo: 0, total: 0, ...over });

const TEAM = [
  m('RBM', 'SM', { tier: 'RBM' }),
  m('ABM1', 'RBM', { tier: 'ABM' }),
  m('ABM2', 'RBM', { tier: 'ABM' }),
  m('BE1', 'ABM1', { approved: 2, total: 2 }),
  m('BE2', 'ABM1', { waiting: 1, todo: 2, total: 3 }),
  m('BE3', 'ABM2', { todo: 1, total: 1 }),
  m('VACANT-BE', 'ABM2', { vacant: 1 }),
  m('VACANT-ABM', 'RBM', { tier: 'ABM', vacant: 1 }),
  m('BE4', 'VACANT-ABM', { approved: 1, total: 1 }),
];

describe('the team tree', () => {
  it("shows the caller's reports at the top, managers first, and each branch rolled up", () => {
    const ix = teamIndex(TEAM);
    const tops = teamTops(TEAM, 'RBM', ix);
    expect(tops.map((t) => t.id)).toEqual(['ABM1', 'ABM2', 'VACANT-ABM']);
    expect(ix.rollup(ix.byId.get('ABM1'))).toMatchObject({ approved: 2, waiting: 1, todo: 2, total: 5, people: 2, done: 1 });
    expect(ix.rollup(ix.byId.get('RBM'))).toMatchObject({ approved: 3, waiting: 1, todo: 3, total: 7, people: 4, done: 2 });
  });

  it('drops a vacant seat with nobody under it and nothing to enter, keeps one with reports', () => {
    const ix = teamIndex(TEAM);
    expect(ix.children('ABM2').map((k) => k.id)).toEqual(['BE3']);
    expect(teamTops(TEAM, 'RBM', ix).map((t) => t.id)).toContain('VACANT-ABM');
    expect(ix.children('VACANT-ABM').map((k) => k.id)).toEqual(['BE4']);
  });

  it('with no root (IT) starts from everyone whose manager is not in the list', () => {
    expect(teamTops(TEAM, null).map((t) => t.id)).toEqual(['RBM']);
  });

  it('knows when the caller has a team', () => {
    expect(hasTeam({ root: 'RBM', members: TEAM })).toBe(true);
    expect(hasTeam({ root: 'BE1', members: [TEAM[3]] })).toBe(false);
    expect(hasTeam({ root: null, members: TEAM })).toBe(true);
    expect(hasTeam(null)).toBe(false);
  });
});
