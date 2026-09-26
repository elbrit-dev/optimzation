'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Switch } from '@/design-system';
import { TableOperationsContext } from '@/app/datatable/contexts/TableOperationsContext';
import { DataViewContext } from '@/app/datatable/contexts/ViewContext';
import { SecondaryEntry } from '@/app/secondary-entry/components/SecondaryEntry';
import { secondaryEntryMeta } from '@/app/secondary-entry/plasmic.meta';
import { MOCK_PRODUCTS, MOCK_ROLE_PROFILE, buildMockRows } from '@/app/secondary-entry/data/mockData';
import { createErpWriter, createMockWriter } from '@/app/secondary-entry/data/writes';
import { RailSection } from '../components/RailSection';
import { dryRunWrites } from '../addons/dryRunWrites';
import { emulatedBrowser } from '../addons/emulatedBrowser';
import { providerMode } from './providerMode';

/* Stands in for Elbrit DataProvider (Views) with enableServerPaging, so the
   paged path runs without a login: the two contexts the real provider
   publishes, with loadMore growing the page after a short "network" delay. */
function MockServerPaging({ rows, pageSize, children }) {
  const [fetchSize, setFetchSize] = useState(pageSize);
  const [loading, setLoading] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const loadMore = useCallback(() => {
    if (timer.current) return;
    setLoading(true);
    timer.current = setTimeout(() => {
      timer.current = null;
      setFetchSize((n) => n + pageSize);
      setLoading(false);
    }, 450);
  }, [pageSize]);
  const table = useMemo(() => ({ rawData: rows.slice(0, fetchSize), isLoading: loading }), [rows, fetchSize, loading]);
  const views = useMemo(
    () => ({ paging: { enabled: true, fetchSize, loadMore, loadMoreStep: pageSize, showLoadMore: false } }),
    [fetchSize, loadMore, pageSize],
  );
  return (
    <TableOperationsContext.Provider value={table}>
      <DataViewContext.Provider value={views}>{children}</DataViewContext.Provider>
    </TableOperationsContext.Provider>
  );
}

const mockMode = {
  id: 'mock',
  label: 'Mock',
  note: 'Seeded rows and a writer that plays the ERP — no network, no login.',
  use(ctx) {
    const [rows, setRows] = useState(buildMockRows);
    const rowsRef = useRef(rows);
    rowsRef.current = rows;
    const [paging, setPaging] = ctx.useSetting('mockPaging', false);
    const writer = useMemo(() => createMockWriter({ getRows: () => rowsRef.current, setRows }), []);
    return {
      panel: (
        <RailSection title="Mock data">
          <button type="button" onClick={() => setRows(buildMockRows())} className="self-start text-11 text-brand-text">
            Reset mock data
          </button>
          <Switch checked={Boolean(paging)} onChange={setPaging} label="Simulate server paging (6 a page)" />
        </RailSection>
      ),
      props: (p) => ({
        ...p,
        ...(paging ? {} : { rows }),
        products: MOCK_PRODUCTS,
        roleProfile: p.roleProfile || MOCK_ROLE_PROFILE,
        writer,
      }),
      wrap: (node) => (paging ? <MockServerPaging rows={rows} pageSize={6}>{node}</MockServerPaging> : node),
    };
  },
};

export const secondaryEntryHarness = {
  id: 'secondary-entry',
  title: 'Secondary Entry',
  component: SecondaryEntry,
  meta: secondaryEntryMeta,
  bind: ({ envName, token }) => ({ gqlEnvironment: envName, gqlToken: token }),
  hidden: ['className'],
  /* Bars pinned to the screen's bottom land on the device's screen, not the
     window's (the Stage sets --harness-bottom). */
  defaults: { bottomGap: 'calc(var(--harness-bottom, 0px) + 12px)' },
  frame: { width: 390, surface: 'app', padded: true },
  modes: [
    { id: 'live', label: 'ERP', note: 'The elbrit_secondary_entry server script, as the person acting — how the app mounts it.' },
    providerMode({ presetDataSource: 'SecondaryEntry', viewId: 'entry', paging: true }),
    mockMode,
  ],
  addons: [
    dryRunWrites({
      label: 'Save to ERP',
      makeWriter: (log, { endpointUrl, token }) => {
        const real = token ? createErpWriter({ endpointUrl, gqlToken: token }) : null;
        return {
          live: false,
          whoAmI: () => (real ? real.whoAmI() : Promise.resolve({ user: null, seat: null })),
          async saveSeat(name, opts) {
            log('saveSeat — dry run', [{ name, ...opts }], 'warn');
            return null;
          },
        };
      },
    }),
    emulatedBrowser(),
  ],
};
