'use client';

import { useMemo, useRef, useState } from 'react';
import { SegmentedControl } from '@/design-system';
import { LeaveApproval } from '@/app/leave-approval/components/LeaveApproval';
import { leaveApprovalMeta } from '@/app/leave-approval/plasmic.meta';
import { MOCK_ABM, MOCK_RBM, MOCK_TODAY, buildMockRows } from '@/app/leave-approval/data/mockData';
import { createErpLeaveSource, createMockLeaveSource } from '@/app/leave-approval/data/erp';
import { RailSection } from '../components/RailSection';
import { dryRunWrites } from '../addons/dryRunWrites';
import { emulatedBrowser } from '../addons/emulatedBrowser';

/* Leave Approval — Mock (seeded leaves, a writer that plays the workflow)
   or the ERP as the person acting, decisions a dry run until switched on. */

const MOCK_VIEWERS = [
  { id: MOCK_ABM, label: 'Arun (ABM)' },
  { id: MOCK_RBM, label: 'Meena (RBM, escalation)' },
];

const mockMode = {
  id: 'mock',
  label: 'Mock',
  note: 'Seeded leaves on a pinned day (Wed 11 Nov) and a writer that plays the Leave Approval workflow — no network.',
  use(ctx) {
    const [viewer, setViewer] = ctx.useSetting('mockViewer', MOCK_ABM);
    const [rows, setRows] = useState(buildMockRows);
    const rowsRef = useRef(rows);
    rowsRef.current = rows;
    const writer = useMemo(() => createMockLeaveSource({ getRows: () => rowsRef.current, setRows, viewer }), [viewer]);
    return {
      panel: (
        <RailSection title="Mock data">
          <SegmentedControl
            items={MOCK_VIEWERS.map((v) => ({ id: v.id, label: v.label.split(' ')[0] }))}
            value={viewer}
            onChange={setViewer}
            ariaLabel="Mock viewer"
          />
          <p className="text-11 text-ds-secondary">{MOCK_VIEWERS.find((v) => v.id === viewer)?.label}</p>
          <button type="button" onClick={() => setRows(buildMockRows())} className="self-start text-11 text-brand-text">
            Reset mock data
          </button>
        </RailSection>
      ),
      props: (p) => ({ ...p, rows, today: MOCK_TODAY, writer }),
    };
  },
};

export const leaveApprovalHarness = {
  id: 'leave-approval',
  title: 'Leave Approval',
  component: LeaveApproval,
  meta: leaveApprovalMeta,
  bind: ({ envName, token }) => ({ gqlEnvironment: envName, gqlToken: token }),
  hidden: ['className'],
  defaults: { bottomGap: 'calc(var(--harness-bottom, 0px) + 12px)' },
  frame: { width: 390, surface: 'app', padded: true },
  modes: [mockMode, { id: 'live', label: 'ERP', note: 'Leave Applications read as the person acting (GraphQL); decisions through the Leave Approval workflow.' }],
  addons: [
    dryRunWrites({
      label: 'Send decisions to ERP',
      makeWriter: (log, { endpointUrl, token }) => {
        const real = token ? createErpLeaveSource({ endpointUrl, token }) : null;
        return {
          whoAmI: () => (real ? real.whoAmI() : Promise.resolve(null)),
          async decide(decisions) {
            log('decide — dry run', [decisions], 'warn');
            return decisions.map((d) => ({ name: d.name, ok: false, status: null, error: 'Dry run — nothing sent to ERP.' }));
          },
        };
      },
    }),
    emulatedBrowser(),
  ],
};
