import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { groupByEvent, indexPob, visitsIn } from '../../data/selectors';
import { VisitEventGroup } from '../VisitEventGroup';

const row = (over = {}) => ({
  eventId: 'EV1',
  doctorId: 'DR-1',
  doctorName: 'Dr One',
  employeeId: 'E1',
  employeeName: 'Rep One',
  plannedDate: '2026-08-12',
  visitTime: '2026-08-12 10:15:00',
  forceVisit: false,
  hq: 'HQ-Erode',
  ...over,
});

describe('POB on a visit', () => {
  it('indexes quotations by rep, doctor and day, with their names', () => {
    const idx = indexPob([
      { employeeId: 'E1', doctorId: 'DR-1', plannedDate: '2026-08-12', amount: 100, quotation: 'QTN-1' },
      { employeeId: 'E1', doctorId: 'DR-1', plannedDate: '2026-08-12', amount: 50, quotation: 'QTN-2' },
    ]);
    expect(idx.get('E1|DR-1|2026-08-12')).toEqual({ amount: 150, quotations: ['QTN-1', 'QTN-2'] });
  });

  it("carries the visit's POB Given tick and its quotations into the call", () => {
    const visits = visitsIn([row({ pobGiven: true })], {}, [], [{ employeeId: 'E1', doctorId: 'DR-1', plannedDate: '2026-08-12', amount: 120, quotation: 'QTN-9' }]);
    const [call] = groupByEvent(visits);
    expect(call.pobGiven).toBe(true);
    expect(call.pob).toBe(120);
    expect(call.pobQuotations).toEqual(['QTN-9']);
  });

  it('shows a POB chip for a ticked visit, and says when there are no items', async () => {
    const [group] = groupByEvent(visitsIn([row({ pobGiven: true })], {}, []));
    function Harness() {
      const { useState } = require('react');
      const [open, setOpen] = useState(false);
      return <VisitEventGroup group={group} expanded={open} onToggle={() => setOpen((o) => !o)} />;
    }
    render(<Harness />);
    expect(screen.getByText('POB')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Dr One/ }));
    expect(screen.getByText(/no order items are recorded/)).toBeInTheDocument();
  });

  it('fetches and lists the order items when a card with a quotation opens', async () => {
    const [group] = groupByEvent(visitsIn([row()], {}, [], [{ employeeId: 'E1', doctorId: 'DR-1', plannedDate: '2026-08-12', amount: 250, quotation: 'QTN-7' }]));
    const loadPob = vi.fn(async () => [
      { quotation: 'QTN-7', item: 'CILNITAB 10', itemName: 'CILNITAB 10', qty: 2, rate: 100, amount: 200 },
      { quotation: 'QTN-7', item: 'TELBRIT 40', itemName: 'TELBRIT 40', qty: 1, rate: 50, amount: 50 },
    ]);
    render(<VisitEventGroup group={group} expanded onToggle={() => {}} loadPob={loadPob} />);
    const section = screen.getByRole('region', { name: 'POB' });
    expect(await within(section).findByText('CILNITAB 10')).toBeInTheDocument();
    expect(within(section).getByText('TELBRIT 40')).toBeInTheDocument();
    expect(within(section).queryByText('Total')).toBeNull();
    expect(loadPob).toHaveBeenCalledWith(['QTN-7']);
  });
});
