import { describe, expect, it } from 'vitest';
import { teamApprovalCounts } from '../selectors';

describe("a team member's month of approvals", () => {
  const slice = (over) => ({ roleProfile: 'BE1-X', raiser: 'be@x.org', status: 'pending', state: 'ABM Approval Waiting', ...over });

  it('counts their trackers by seat: approved, waiting, and rework (sent back or rejected)', () => {
    const slices = [
      slice(),
      slice({ status: 'approved', state: 'ABM Approved and Waiting for Verification' }),
      slice({ state: 'Rework' }),
      slice({ status: 'rejected', state: 'ABM Rejected' }),
      slice({ roleProfile: 'BE2-Y', raiser: 'other@x.org' }),
    ];
    expect(teamApprovalCounts(slices, { seat: 'BE1-X', user: 'BE@x.org' })).toEqual({ approved: 1, waiting: 1, todo: 2, total: 4 });
  });

  it('also finds them by who raised it when the seat changed hands', () => {
    expect(teamApprovalCounts([slice({ roleProfile: 'OLD-SEAT' })], { seat: 'BE1-X', user: 'be@x.org' }).total).toBe(1);
    expect(teamApprovalCounts([], { seat: 'BE1-X' })).toEqual({ approved: 0, waiting: 0, todo: 0, total: 0 });
  });
});
