import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SurveyPage } from '../components/SurveyPage';
import { createSurveyApi } from '../api';

/* 26 Nov 2026 · Survey Studio approvals — /survey/approve, the approver's "To approve" (Studio's Approver preview). */

function setup() {
  const api = createSurveyApi({ source: 'mock', role: 'BE', delay: 0 });
  const onBack = vi.fn();
  render(<SurveyPage api={api} campaign="approve" onBack={onBack} />);
  return { api, onBack };
}
const tabs = () => within(screen.getByRole('tablist', { name: 'Team members' })).getAllByRole('tab');

describe('To approve', () => {
  it('shows the progress, what the AI approved, one tab per team member (most waiting first) and the Clerk reason', async () => {
    setup();
    expect(await screen.findByRole('heading', { name: 'To approve' })).toBeTruthy();
    await waitFor(() => expect(tabs().map((t) => t.textContent)).toEqual(['Ravi · 2', 'Meena']));
    expect(screen.getByText(/1 answer was Clear and approved automatically\. 2 need you, by employee\./)).toBeTruthy();
    expect(screen.getByText('Ganga Pharma Agencies')).toBeTruthy();
    expect(screen.getByText('Clerk')).toBeTruthy();
    expect(screen.getByText('Invoice: Not met: total min')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Approve all 2' })).toBeTruthy();
  });

  it('Return needs a reason; then the answer leaves the queue', async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByText('Ganga Pharma Agencies');
    await user.click(screen.getAllByRole('button', { name: 'Return' })[0]);
    const send = screen.getByRole('button', { name: 'Send back' });
    expect(send.disabled).toBe(true);
    await user.type(screen.getByRole('textbox', { name: 'Why are you returning it?' }), 'Wrong month');
    await user.click(screen.getByRole('button', { name: 'Send back' }));
    expect(await screen.findByText('Sent back — the rep sees your reason.')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('Ganga Pharma Agencies')).toBeNull());
    expect(tabs()[0].textContent).toBe('Ravi · 1');
  });

  it('Approve all approves the person’s waiting answers', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByRole('button', { name: 'Approve all 2' }));
    expect(await screen.findByText('Approved 2.')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Nothing waiting from Ravi')).toBeTruthy());
  });

  it('Back fires onBack', async () => {
    const user = userEvent.setup();
    const { onBack } = setup();
    await screen.findByRole('heading', { name: 'To approve' });
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
