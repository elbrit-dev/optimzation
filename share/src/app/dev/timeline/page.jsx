'use client';

/* Dev harness for EventTimeline's three alignments.
 *
 * WHY: /timeline drives its alignment from a config the user edits and then
 * runs, so its default render only ever exercises `alternate`. Migrating the
 * Timeline off the lara theme means reproducing lara's alignment CSS —
 * `left`, `right` and the `nth-child(even)` row-reverse of `alternate` — and
 * two of the three had no pixel cover at all.
 *
 * Baselined BEFORE the migration, so the diff afterwards is meaningful. That is
 * the same discipline as phase 2 in docs/PRIMEREACT_SWEEP.md, applied per
 * component: the /dev harnesses have already been caught missing things the
 * real routes render.
 *
 * Static events, no network, no auth. Deliberately NOT wrapped in
 * ProtectedRoute.
 */

import EventTimeline from '@/app/timeline/components/EventTimeline';

/* Fixed dates and ids, so the render is byte-stable between runs. */
const EVENTS = [
  { id: '1', date: '2026-01-04T09:00:00Z', title: 'Order created', type: 'order', subtype: 'created' },
  { id: '2', date: '2026-01-05T11:30:00Z', title: 'Payment received', type: 'payment', subtype: 'received' },
  { id: '3', date: '2026-01-06T15:45:00Z', title: 'Dispatched', type: 'shipment', subtype: 'dispatched' },
  { id: '4', date: '2026-01-08T08:15:00Z', title: 'Delivered', type: 'shipment', subtype: 'delivered' },
];

const ALIGNMENTS = ['alternate', 'left', 'right'];

export default function TimelineDevHarness() {
  return (
    <div data-surface="console" className="min-h-screen bg-page">
      <main className="mx-auto flex max-w-[1600px] flex-col gap-10 px-4 py-8">
        <header>
          <h1 className="type-doc-head text-heading">EventTimeline harness</h1>
          <p className="type-app-body text-ds-secondary">
            All three alignments. `left` and `right` render single-sided, which
            is a different layout path from `alternate`.
          </p>
        </header>

        {ALIGNMENTS.map((align) => (
          <section key={align} className="flex flex-col gap-2">
            <h2 className="type-app-label text-heading">align={align}</h2>
            <div data-testid={`timeline-${align}`}>
              <EventTimeline events={EVENTS} align={align} />
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
