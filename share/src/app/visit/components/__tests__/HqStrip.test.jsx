import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HqStrip } from '../HqStrip';

/* The strip's filtering matters most at a scale the fixture does not reach —
   a manager's scope has three HQs, the company has 97 — so it is covered here
   rather than by looking at the screen. */

const ALL = '__all__';

const TOTALS = {
  planned: 232, happened: 122, verified: 110, force: 12, activeReps: 17, totalReps: 19,
};

function hqs(names) {
  return names.map((name, i) => ({
    hq: `HQ-${name}`,
    planned: 40 + i,
    happened: 20 + i,
    verified: 20 + i - (i % 2),
    force: i % 2,
    activeReps: 3,
    totalReps: 4,
  }));
}

function renderStrip(names, props = {}) {
  const onSelect = vi.fn();
  render(
    <HqStrip
      hqRows={hqs(names)}
      totals={TOTALS}
      activeHq={ALL}
      allKey={ALL}
      onSelect={onSelect}
      {...props}
    />,
  );
  return { onSelect };
}

const SHORT = ['Hubballi', 'Hyderabad', 'Erode'];
const LONG = [
  'Hubballi', 'Hyderabad', 'Erode', 'Ayodhya', 'Agra', 'Ajmer', 'Aligharh', 'Allahabad',
];

describe('HqStrip', () => {
  it('always offers the search box, however short the list', () => {
    // It used to appear only past seven HQs. Real scopes have three, so the
    // control was never visible to anyone reviewing the screen.
    renderStrip(SHORT);
    expect(screen.getByLabelText('Find an HQ')).toBeInTheDocument();
  });

  it('filters the cards by name', async () => {
    const user = userEvent.setup();
    renderStrip(LONG);

    await user.type(screen.getByLabelText('Find an HQ'), 'hyd');

    expect(screen.getByRole('button', { name: /Hyderabad/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Hubballi/ })).not.toBeInTheDocument();
  });

  it('matches on the display name, not the HQ- prefix', () => {
    // Every territory is named `HQ-Something`, so searching "hq" must not be a
    // no-op that returns everything.
    renderStrip(LONG);
    expect(screen.getByRole('button', { name: /Ayodhya/ })).toBeInTheDocument();
  });

  it('keeps "All HQs" visible while searching', async () => {
    // A filter that hides the way back to the overview is a trap.
    const user = userEvent.setup();
    renderStrip(LONG);

    await user.type(screen.getByLabelText('Find an HQ'), 'zzz');

    expect(screen.getByRole('button', { name: /All HQs/ })).toBeInTheDocument();
    expect(screen.getByText(/No HQ matches/)).toBeInTheDocument();
  });

  it('reports the selection, and marks it pressed', async () => {
    const user = userEvent.setup();
    const { onSelect } = renderStrip(SHORT, { activeHq: 'HQ-Hubballi' });

    expect(screen.getByRole('button', { name: /Hubballi/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: /All HQs/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    await user.click(screen.getByRole('button', { name: /Hyderabad/ }));
    expect(onSelect).toHaveBeenCalledWith('HQ-Hyderabad');
  });
});
