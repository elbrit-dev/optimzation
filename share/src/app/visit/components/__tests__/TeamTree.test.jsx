import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TeamTree } from '../TeamTree';

/* The tree is a breakdown of the cards above it, so the rule about hiding
   rows has one hard edge: a row carrying visits must never disappear, or the
   two stop adding up. */

const ABM = { id: 'M', name: 'Tousif', short: 'ABM', designation: 'Area Business Manager', reportsTo: null, hq: 'HQ-Hubballi' };
const rep = (over) => ({ short: 'BE', designation: 'Business Executive', reportsTo: 'M', hq: 'HQ-Hubballi', ...over });

const visit = (employeeId) => ({
  eventId: 'EV' + employeeId, plannedDate: '2026-09-05', employeeId, employeeName: employeeId,
  doctorId: 'DR-1', doctorName: 'Dr One', hq: 'HQ-Hubballi', pobGiven: false,
  visitTime: '2026-09-05 10:00:00', distanceKm: null, forceVisit: false, forceVisitReason: '',
});

function tree(team, rows = []) {
  render(<TeamTree team={team} rows={rows} pob={[]} rootIds={['M']} onDoctorPlan={vi.fn()} />);
}

describe('TeamTree vacant seats', () => {
  const team = [
    ABM,
    rep({ id: 'A', name: 'Anil' }),
    rep({ id: 'V1', name: 'Vacant_Rishu', vacant: true }),
  ];

  it('drops a vacant seat with nobody under it and nothing logged', () => {
    // It can never say anything: no plan, no visits, nothing to expand.
    tree(team, [visit('A')]);
    expect(screen.getByText('Anil')).toBeInTheDocument();
    expect(screen.queryByText('Vacant_Rishu')).not.toBeInTheDocument();
  });

  it('keeps a vacant seat that still has reports', () => {
    /* The org beneath it is real — dropping it would orphan everyone under
       it. Same rule ScopeSelect applies to its own picker. */
    const withReports = [
      ABM,
      rep({ id: 'V2', name: 'Vacant_ABM', short: 'ABM', designation: 'Area Business Manager', vacant: true }),
      rep({ id: 'B', name: 'Bala', reportsTo: 'V2' }),
    ];
    tree(withReports, [visit('B')]);
    expect(screen.getByText('Vacant_ABM')).toBeInTheDocument();
  });

  it('keeps a vacant seat that has visits against it', () => {
    /* Should not happen, but it decides the question if it ever does: the
       tree must not hide a row the cards above are counting. */
    tree(team, [visit('A'), visit('V1')]);
    expect(screen.getByText('Vacant_Rishu')).toBeInTheDocument();
  });

  it('does not change the numbers by hiding anything', () => {
    /* totalReps already excluded vacant seats, and a dropped row has no
       visits to contribute — so the manager's figures must be identical
       whether the vacancy is in the roster or not. If this ever fails, the
       tree has stopped adding up to the cards above it. */
    const figures = (teamIn) => {
      const { container, unmount } = render(
        <TeamTree team={teamIn} rows={[visit('A')]} pob={[]} rootIds={['M']} onDoctorPlan={vi.fn()} />,
      );
      const text = container.textContent;
      unmount();
      return text;
    };

    const withVacant = figures(team);
    const withoutVacant = figures(team.filter((m) => m.id !== 'V1'));
    expect(withVacant).toBe(withoutVacant);
  });
});

/* The row card: identity, the headline number, and the number taken apart.
   The three have to agree with each other and with the cards above the tree. */
describe('TeamTree row card', () => {
  const team = [ABM, rep({ id: 'A', name: 'Anil' })];
  const done = (over) => ({ ...visit('A'), ...over });

  it('splits the plan into geo verified, forced and pending', () => {
    render(
      <TeamTree
        team={team}
        rows={[
          done({ eventId: 'E1' }),
          done({ eventId: 'E2', forceVisit: true }),
          done({ eventId: 'E3', visitTime: null }),
        ]}
        pob={[]}
        rootIds={['M']}
        onDoctorPlan={vi.fn()}
      />,
    );

    /* Three planned, two done, one of them forced. The bar is the only place
       the row says this, so its words have to add up to the plan exactly —
       there is no ratio beside it to fall back on. */
    expect(
      screen.getAllByLabelText('1 geo verified, 1 force visit, 1 pending').length,
    ).toBeGreaterThan(0);
  });

  it('says "No plan" rather than 0/0', () => {
    // 0/0 reads as somebody who was given work and did none.
    render(<TeamTree team={team} rows={[]} pob={[]} rootIds={['M']} onDoctorPlan={vi.fn()} />);
    expect(screen.getAllByText('No plan').length).toBeGreaterThan(0);
    expect(screen.queryByText('/0')).not.toBeInTheDocument();
  });

  it('draws no bar for a row with nothing planned and nothing done', () => {
    // An empty track under three zeros is furniture, not information.
    const { container } = render(
      <TeamTree team={team} rows={[]} pob={[]} rootIds={['M']} onDoctorPlan={vi.fn()} />,
    );
    expect(container.querySelector('.ds-bar--stacked')).toBeNull();
  });

  it('offers exactly one Dr plan control per row', () => {
    /* The header reserves the overlaid button's box with a hidden twin. If
       that twin ever becomes a real button the markup is invalid — a button
       inside the header's own button — and React refuses to hydrate it. */
    const { container } = render(
      <TeamTree team={team} rows={[done({})]} pob={[]} rootIds={['M']} onDoctorPlan={vi.fn()} />,
    );
    const rows = container.querySelectorAll('.ds-disclosure');
    expect(screen.getAllByRole('button', { name: /Dr plan/ })).toHaveLength(rows.length);
    expect(container.querySelectorAll('.ds-disclosure__header button')).toHaveLength(0);
  });

  it('does not pill a rep for being silent, either way round', () => {
    /* "Not reported" was the loudest thing on the row and said nothing the
       row was not already showing — an empty bar, and "No plan" where there
       is none. On a morning when half the field has yet to log, a red pill on
       every one of them turns the tree into a wall of failures; the count
       belongs on the attendance card, which frames it as the day's progress.
       "Reported" never had a pill and still does not: a pill on all nineteen
       rows is a pill on none. */
    const { rerender } = render(
      <TeamTree team={team} rows={[]} pob={[]} rootIds={['M']} onDoctorPlan={vi.fn()} />,
    );
    expect(screen.queryByText('Not reported')).not.toBeInTheDocument();

    rerender(
      <TeamTree team={team} rows={[done({})]} pob={[]} rootIds={['M']} onDoctorPlan={vi.fn()} />,
    );
    expect(screen.queryByText('Not reported')).not.toBeInTheDocument();
    expect(screen.queryByText('Reported')).not.toBeInTheDocument();
  });

  it('still pills the two an empty row cannot explain', () => {
    /* A vacant seat and a rep on approved leave both draw the same empty bar
       as a rep who did nothing, and they mean three different things. */
    const withLeave = [ABM, rep({ id: 'A', name: 'Anil', onLeave: true })];
    render(<TeamTree team={withLeave} rows={[]} pob={[]} rootIds={['M']} onDoctorPlan={vi.fn()} />);
    expect(screen.getAllByText('Absent').length).toBeGreaterThan(0);
  });
});
