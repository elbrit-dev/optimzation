'use client';

import { useMemo, useRef, useState } from 'react';
import { SegmentedControl } from '@/design-system';
import { SecondaryApproval } from '@/app/secondary-approval/components/SecondaryApproval';
import { secondaryApprovalMeta } from '@/app/secondary-approval/plasmic.meta';
import { MOCK_TODAY, MOCK_VIEWER, buildMockRows } from '@/app/secondary-approval/data/mockData';
import { createDecisionWriter, createMockWriter } from '@/app/secondary-approval/data/writes';
import { RailSection } from '../components/RailSection';
import { dryRunWrites } from '../addons/dryRunWrites';
import { emulatedBrowser } from '../addons/emulatedBrowser';
import { providerMode } from './providerMode';

const MOCK_VIEWERS = [
  { id: MOCK_VIEWER, label: 'Nandhakumar (ABM)' },
  { id: 'ravikumar1182.be@elbrit.org', label: 'Ravikumar (BE)' },
];

const mockMode = {
  id: 'mock',
  label: 'Mock',
  note: 'Seeded trackers and a writer that plays the ERP (and its workflow) — no network.',
  use(ctx) {
    const [viewer, setViewer] = ctx.useSetting('mockViewer', MOCK_VIEWER);
    const [rows, setRows] = useState(buildMockRows);
    const rowsRef = useRef(rows);
    rowsRef.current = rows;
    const writer = useMemo(() => createMockWriter({ getRows: () => rowsRef.current, setRows, viewer }), [viewer]);
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
      /* The mock writer answers "who is this" for the picked viewer. */
      props: (p) => ({ ...p, rows, today: MOCK_TODAY, writer }),
    };
  },
};

export const secondaryApprovalHarness = {
  id: 'secondary-approval',
  title: 'Secondary Approval',
  component: SecondaryApproval,
  meta: secondaryApprovalMeta,
  /* Who is looking is the token's user — the component asks, no prop. */
  bind: ({ envName, token }) => ({ gqlEnvironment: envName, gqlToken: token }),
  hidden: ['className'],
  /* Bars pinned to the screen's bottom land on the device's screen, not the
     window's (the Stage sets --harness-bottom). */
  defaults: { bottomGap: 'calc(var(--harness-bottom, 0px) + 12px)' },
  frame: { width: 390, surface: 'app', padded: true },
  modes: [
    { id: 'live', label: 'ERP', note: 'The elbrit_secondary_approval server script, as the person acting — how the app mounts it.' },
    providerMode({ presetDataSource: 'SecondaryApproval', viewId: 'approval' }),
    mockMode,
  ],
  addons: [
    dryRunWrites({
      label: 'Send decisions to ERP',
      makeWriter: (log, { endpointUrl, token }) => {
        /* Which actions a user may take is still asked of the ERP, so the
           buttons are real; only the decisions are held back. */
        const real = token ? createDecisionWriter({ endpointUrl, gqlToken: token }) : null;
        return {
          live: false,
          actions: (names) => (real ? real.actions(names) : Promise.resolve(new Map())),
          async decide(decisions) {
            log('decide — dry run', [decisions], 'warn');
            return decisions.map((d) => ({ name: d.name, ok: false, state: null, error: 'Dry run — nothing sent to ERP.' }));
          },
        };
      },
    }),
    emulatedBrowser(),
  ],
};
