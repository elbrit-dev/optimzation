import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TreeSelect } from '../TreeSelect';

/* The three-step cycle, and specifically what the THIRD click does to the
   last remaining selection -- which is the difference between a scope you can
   clear and one you cannot. */

const tree = [
  { id: 'gm', label: 'Rajkumar N · GM', children: [{ id: 'sm', label: 'Santosh Kumar · SM' }] },
];

async function open(user) {
  await user.click(screen.getByLabelText('Scope'));
}

function renderSelect(props = {}) {
  const onChange = vi.fn();
  render(<TreeSelect label="Scope" subtreeToggle tree={tree} value={[]} onChange={onChange} {...props} />);
  return { onChange };
}

describe('TreeSelect subtree cycle', () => {
  it('first click selects the node alone', async () => {
    const user = userEvent.setup();
    const { onChange } = renderSelect();
    await open(user);
    await user.click(screen.getByRole('checkbox', { name: /Rajkumar N/ }));
    expect(onChange).toHaveBeenCalledWith([{ id: 'gm', includeSubtree: false }]);
  });

  it('second click widens it to the whole branch', async () => {
    const user = userEvent.setup();
    const { onChange } = renderSelect({ value: [{ id: 'gm', includeSubtree: false }] });
    await open(user);
    await user.click(screen.getByRole('checkbox', { name: /Rajkumar N/ }));
    expect(onChange).toHaveBeenCalledWith([{ id: 'gm', includeSubtree: true }]);
  });

  it('wraps the last selection back to "node alone" by default', async () => {
    // The documented guard: an empty picker would be a screen of zeroes for
    // a caller that has not answered the empty case.
    const user = userEvent.setup();
    const { onChange } = renderSelect({ value: [{ id: 'gm', includeSubtree: true }] });
    await open(user);
    await user.click(screen.getByRole('checkbox', { name: /Rajkumar N/ }));
    expect(onChange).toHaveBeenCalledWith([{ id: 'gm', includeSubtree: false }]);
  });

  it('clears the last selection when allowEmpty is set', async () => {
    /* THE BUG THIS FIXES. Without allowEmpty the top of the tree can never
       be unticked -- the third click wraps and the node stays selected. */
    const user = userEvent.setup();
    const { onChange } = renderSelect({ value: [{ id: 'gm', includeSubtree: true }], allowEmpty: true });
    await open(user);
    await user.click(screen.getByRole('checkbox', { name: /Rajkumar N/ }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('still clears a non-last selection without allowEmpty', async () => {
    const user = userEvent.setup();
    const { onChange } = renderSelect({
      value: [{ id: 'gm', includeSubtree: true }, { id: 'other', includeSubtree: true }],
    });
    await open(user);
    await user.click(screen.getByRole('checkbox', { name: /Rajkumar N/ }));
    expect(onChange).toHaveBeenCalledWith([{ id: 'other', includeSubtree: true }]);
  });

  it('shows the placeholder when nothing is selected', () => {
    renderSelect({ value: [], placeholder: 'No team selected' });
    expect(screen.getByText('No team selected')).toBeInTheDocument();
  });
});

/* A leaf has no branch, so "this node alone" and "this node's whole branch"
   name the same set of people. Offering both makes one click a no-op that
   still changes how the row looks. */
describe('TreeSelect leaf cycle', () => {
  it('clears a leaf on the SECOND click, not the third', async () => {
    const user = userEvent.setup();
    const { onChange } = renderSelect({
      allowEmpty: true,
      value: [{ id: 'sm', includeSubtree: false }],
    });
    await open(user);
    await user.click(screen.getByRole('checkbox', { name: /Santosh Kumar/ }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('never widens a leaf to a branch it does not have', async () => {
    const user = userEvent.setup();
    const { onChange } = renderSelect({ allowEmpty: true, value: [] });
    await open(user);
    // Collapsed by default with nothing selected: the leaf has to be revealed.
    await user.click(screen.getByRole('button', { name: /Expand Rajkumar N/ }));

    const leaf = screen.getByRole('checkbox', { name: /Santosh Kumar/ });
    await user.click(leaf);
    expect(onChange).toHaveBeenCalledWith([{ id: 'sm', includeSubtree: false }]);
    // ...and no call anywhere in the cycle asks for its subtree.
    for (const call of onChange.mock.calls) {
      expect(call[0].find((v) => v.id === 'sm')?.includeSubtree).not.toBe(true);
    }
  });

  it('still gives a node WITH children all three steps', async () => {
    const user = userEvent.setup();
    const { onChange } = renderSelect({ value: [{ id: 'gm', includeSubtree: false }] });
    await open(user);
    await user.click(screen.getByRole('checkbox', { name: /Rajkumar N/ }));
    expect(onChange).toHaveBeenCalledWith([{ id: 'gm', includeSubtree: true }]);
  });
});
