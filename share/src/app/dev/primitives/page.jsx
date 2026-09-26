'use client';

/* Dev harness for the remaining PrimeReact primitives.
 *
 * WHY ONE HARNESS FOR MANY COMPONENTS
 * Most of what is left in the sweep has little or no CSS in the override sheet,
 * which means the current appearance IS lara's and migrating is closer to a
 * restyle than a re-platforming. None of them appear in any existing baseline:
 * they live on /report-table and the playgrounds, which are backend-driven, or
 * inside overlays that are only open transiently. Writing 20-odd presets with
 * nothing checking them is exactly how the cyan/#f8f8fa/Inter leaks shipped.
 *
 * So: baseline them here in the STYLED state first, migrate in batches, diff.
 * Amortises the harness cost across the whole tail of the sweep.
 *
 * Overlay components (Dialog, Sidebar, ConfirmDialog, OverlayPanel) are held
 * OPEN via `visible`, because a closed overlay renders nothing to compare.
 *
 * Static content, no network, no auth. Deliberately NOT wrapped in
 * ProtectedRoute.
 */

import { useEffect, useRef, useState } from 'react';
import { Divider } from 'primereact/divider';
import { Skeleton } from 'primereact/skeleton';
import { Tag } from 'primereact/tag';
import { Chip } from 'primereact/chip';
import { Card } from 'primereact/card';
import { SelectButton } from 'primereact/selectbutton';
import { SplitButton } from 'primereact/splitbutton';
import { TabMenu } from 'primereact/tabmenu';
import { Accordion, AccordionTab } from 'primereact/accordion';
import { TabView, TabPanel } from 'primereact/tabview';
import { Splitter, SplitterPanel } from 'primereact/splitter';
import { Tree } from 'primereact/tree';
import { Dialog } from 'primereact/dialog';
import { Sidebar } from 'primereact/sidebar';
import { OverlayPanel } from 'primereact/overlaypanel';

const TREE = [
  { key: '0', label: 'Reports', children: [
    { key: '0-0', label: 'Sales' },
    { key: '0-1', label: 'Stock' },
  ] },
  { key: '1', label: 'Settings' },
];

const MENU_ITEMS = [{ label: 'Save' }, { label: 'Duplicate' }, { label: 'Delete' }];

function Section({ id, title, children }) {
  return (
    <section className="flex flex-col gap-2" data-testid={id}>
      <h2 className="type-app-label text-heading">{title}</h2>
      <div className="flex flex-wrap items-start gap-4">{children}</div>
    </section>
  );
}

export default function PrimitivesDevHarness() {
  const op = useRef(null);
  /* Read straight from the URL rather than `useSearchParams`, which Next 16
     requires to sit inside a Suspense boundary and which would mean wrapping
     this harness in one for no benefit. */
  const [overlay, setOverlay] = useState(null);
  const [sidebarPos, setSidebarPos] = useState('right');
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setOverlay(q.get('overlay'));
    setSidebarPos(q.get('pos') || 'right');
  }, []);

  return (
    <div data-surface="console" className="min-h-screen bg-page">
      <main className="mx-auto flex max-w-[1100px] flex-col gap-8 px-4 py-8">
        <header>
          <h1 className="type-doc-head text-heading">Primitives harness</h1>
          <p className="type-app-body text-ds-secondary">
            The tail of the PrimeReact sweep. Baselined styled, then migrated.
          </p>
        </header>

        <Section id="prim-inline" title="Divider / Skeleton / Tag / Chip">
          <div className="w-64">
            <span className="text-12 text-body">Above</span>
            <Divider unstyled />
            <span className="text-12 text-body">Below</span>
          </div>
          <Skeleton unstyled width="8rem" height="1.5rem" />
          <Tag unstyled value="Approved" />
          <Tag unstyled value="Rejected" severity="danger" />
          <Chip unstyled label="Cardiology" />
        </Section>

        <Section id="prim-card" title="Card">
          <Card unstyled title="Summary" subTitle="Last 30 days" className="w-72">
            <p className="text-12 text-ds-secondary m-0">32,032 items inspected.</p>
          </Card>
        </Section>

        <Section id="prim-buttons" title="SelectButton / SplitButton / TabMenu">
          <SelectButton unstyled value="Table" options={['Cards', 'Table']} />
          <SplitButton unstyled label="Save" model={MENU_ITEMS} />
          <div className="w-96">
            <TabMenu unstyled model={[{ label: 'Overview' }, { label: 'Detail' }, { label: 'Audit' }]} />
          </div>
        </Section>

        <Section id="prim-accordion" title="Accordion">
          <div className="w-96">
            <Accordion unstyled activeIndex={0}>
              <AccordionTab unstyled header="First">
                <p className="text-12 text-ds-secondary m-0">Panel one content.</p>
              </AccordionTab>
              <AccordionTab unstyled header="Second">
                <p className="text-12 text-ds-secondary m-0">Panel two content.</p>
              </AccordionTab>
            </Accordion>
          </div>
        </Section>

        <Section id="prim-tabview" title="TabView">
          <div className="w-96">
            <TabView unstyled>
              <TabPanel unstyled header="Alpha">
                <p className="text-12 text-ds-secondary m-0">Alpha body.</p>
              </TabPanel>
              <TabPanel unstyled header="Beta">
                <p className="text-12 text-ds-secondary m-0">Beta body.</p>
              </TabPanel>
            </TabView>
          </div>
        </Section>

        {/* BOTH orientations. The harness rendered only the horizontal one, and
            that is exactly how a broken vertical splitter reached the GraphQL
            playground: Splitter injects its own `flex-direction: column` for
            `layout="vertical"` and `unstyled` drops it, so Query rendered
            beside Variables instead of above. */}
        <Section id="prim-splitter-vertical" title="Splitter (vertical)">
          <Splitter unstyled layout="vertical" style={{ height: '160px', width: '360px' }}>
            <SplitterPanel unstyled className="flex items-center justify-center text-12 text-ds-secondary">
              Top
            </SplitterPanel>
            <SplitterPanel unstyled className="flex items-center justify-center text-12 text-ds-secondary">
              Bottom
            </SplitterPanel>
          </Splitter>
        </Section>

        <Section id="prim-splitter" title="Splitter">
          <Splitter unstyled style={{ height: '120px', width: '480px' }}>
            <SplitterPanel unstyled className="flex items-center justify-center text-12 text-ds-secondary">
              Left
            </SplitterPanel>
            <SplitterPanel unstyled className="flex items-center justify-center text-12 text-ds-secondary">
              Right
            </SplitterPanel>
          </Splitter>
        </Section>

        <Section id="prim-tree" title="Tree">
          <div className="w-72">
            <Tree unstyled value={TREE} expandedKeys={{ 0: true }} />
          </div>
        </Section>

        {/* OVERLAYS ARE RENDERED ONE AT A TIME, VIA `?overlay=`.
            They are `position: fixed` — that is what the preset gives them, and
            what lara gave them — so they float over the whole viewport no
            matter what container they sit in. Held open all at once, the dialog
            covered the accordion and the sidebar covered the tree, and the
            section screenshots caught the overlay instead of their own subject.
            One at a time, screenshotted by their own root, is the only way to
            frame them. */}
        {overlay === 'dialog' && (
          <Dialog
            unstyled
            header="Export grouped data"
            visible
            onHide={() => {}}
            style={{ width: '380px' }}
            pt={{ root: { 'data-testid': 'overlay-dialog' } }}
          >
            <p className="text-12 text-ds-secondary m-0">Choose the levels to export.</p>
          </Dialog>
        )}

        {overlay === 'sidebar' && (
          <Sidebar
            unstyled
            visible
            onHide={() => {}}
            position={sidebarPos}
            pt={{ root: { 'data-testid': 'overlay-sidebar' } }}
          >
            <p className="text-12 text-ds-secondary m-0">Sidebar body.</p>
          </Sidebar>
        )}

        {overlay === 'overlaypanel' && (
          <div className="relative h-40 w-96">
            <OverlayPanel unstyled ref={op} pt={{ root: { 'data-testid': 'overlay-panel' } }}>
              <p className="text-12 text-ds-secondary m-0">Overlay body.</p>
            </OverlayPanel>
            <button
              type="button"
              data-testid="op-trigger"
              className="rounded-md border border-line-subtle px-3 py-1.5 text-12"
              onClick={(e) => op.current?.toggle(e)}
            >
              Open overlay
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
