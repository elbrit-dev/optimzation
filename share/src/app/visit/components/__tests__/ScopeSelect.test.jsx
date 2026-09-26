import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ScopeSelect } from '../ScopeSelect';

/* Who the picker will let you report on. It used to be managers only, on the
   grounds that a BE scope is a team of one — which is a report people want. */

const TEAM = [
  { id: 'R', name: 'Rajkumar N', designation: 'General Manager', reportsTo: null },
  { id: 'M', name: 'Tousif A', designation: 'Area Business Manager', reportsTo: 'R' },
  { id: 'A', name: 'Anil Kumar', designation: 'Business Executive', reportsTo: 'M' },
  { id: 'V', name: 'Vacant_Seat', designation: 'Business Executive', reportsTo: 'M', vacant: true },
];

async function openTo(user, team = TEAM) {
  const onChange = vi.fn();
  render(<ScopeSelect team={team} value={[]} onChange={onChange} rootId="R" viewerId={null} />);
  await user.click(screen.getByLabelText('Team scope'));
  await user.click(screen.getByRole('button', { name: /Expand Rajkumar N/ }));
  await user.click(screen.getByRole('button', { name: /Expand Tousif A/ }));
  return onChange;
}

describe('ScopeSelect', () => {
  it('offers reps, not just managers', async () => {
    const user = userEvent.setup();
    await openTo(user);
    expect(screen.getByRole('checkbox', { name: /Anil Kumar · BE/ })).toBeInTheDocument();
  });

  it('picks a rep in one click, with no branch step after it', async () => {
    /* A rep has no branch: "alone" and "whole branch" would name the same
       person, so the second click clears instead of widening. */
    const user = userEvent.setup();
    const onChange = await openTo(user);

    await user.click(screen.getByRole('checkbox', { name: /Anil Kumar/ }));
    expect(onChange).toHaveBeenCalledWith([{ id: 'A', includeSubtree: false }]);
  });

  it('leaves vacant seats out, since there is nobody to report on', async () => {
    const user = userEvent.setup();
    await openTo(user);
    expect(screen.queryByRole('checkbox', { name: /Vacant_Seat/ })).not.toBeInTheDocument();
  });

  it('still offers a manager both depths', async () => {
    const user = userEvent.setup();
    const onChange = await openTo(user);

    await user.click(screen.getByRole('checkbox', { name: /Tousif A · ABM/ }));
    expect(onChange).toHaveBeenCalledWith([{ id: 'M', includeSubtree: false }]);
  });
});
