'use client';

import { useState } from 'react';
import { Button, Field, ListRow, Sheet, StatusPill } from '@/design-system';

const DEMO_PEOPLE = [
  { name: 'Fayaque Ahmed Qazi', sub: 'Hubballi · reports to Mohammed Tousif · 14/15 visits done', calls: 14 },
  { name: 'Kukatla Rakesh', sub: 'Hyderabad · reports to Nagunoori Anil · 13/13 visits done', calls: 13 },
  { name: 'Umesh A M', sub: 'Hubballi · reports to Arunkumar M · 9/15 visits done', calls: 9 },
];

/* The Sheet's three shapes, composed from its parts: a long list (scroll vs
   swipe, and a second sheet stacked on the first), snap points, and a form
   with a pinned footer (the software keyboard). */
export function DemoSheets({ which, onWhich }) {
  const [nested, setNested] = useState(false);
  const [note, setNote] = useState('');
  const close = (open) => !open && onWhich(false);
  const rows = Array.from({ length: 8 }, () => DEMO_PEOPLE).flat();

  return (
    <>
      <Sheet.Root open={which === 'list'} onOpenChange={close}>
        <Sheet.Popup surface="app">
          <Sheet.Header>
            <Sheet.Title>Working today</Sheet.Title>
            <Sheet.Description>{rows.length} people in this scope</Sheet.Description>
            <Sheet.Close />
          </Sheet.Header>
          <Sheet.Body>
            {rows.map((p, i) => (
              <ListRow
                key={i}
                dense
                title={p.name}
                subtitle={p.sub}
                trailing={
                  <StatusPill status={p.calls > 10 ? 'success' : 'warning'} showDot={false}>
                    {p.calls} calls
                  </StatusPill>
                }
              />
            ))}
          </Sheet.Body>
          <Sheet.Footer>
            <Button type="default" size="lg" block onClick={() => setNested(true)}>
              Open another
            </Button>
          </Sheet.Footer>
        </Sheet.Popup>
      </Sheet.Root>

      <Sheet.Root open={nested} onOpenChange={setNested}>
        <Sheet.Popup surface="app">
          <Sheet.Header>
            <Sheet.Title>Fayaque Ahmed Qazi</Sheet.Title>
            <Sheet.Description>Stacked on the list. Back closes this one first.</Sheet.Description>
            <Sheet.Close />
          </Sheet.Header>
          <Sheet.Body>
            <p className="py-4 text-12 text-ds-secondary">14 of 15 visits done today.</p>
          </Sheet.Body>
        </Sheet.Popup>
      </Sheet.Root>

      <Sheet.Root open={which === 'snap'} onOpenChange={close} snapPoints={[0.45, 1]}>
        <Sheet.Popup surface="app">
          <Sheet.Header>
            <Sheet.Title>Snap points</Sheet.Title>
            <Sheet.Description>Opens at 45% — drag up for full height, down to close.</Sheet.Description>
            <Sheet.Close />
          </Sheet.Header>
          <Sheet.Body>
            {rows.map((p, i) => (
              <ListRow key={i} dense title={p.name} subtitle={p.sub} />
            ))}
          </Sheet.Body>
        </Sheet.Popup>
      </Sheet.Root>

      <Sheet.Root open={which === 'dialog'} onOpenChange={close} desktop="dialog">
        <Sheet.Popup surface="app">
          <Sheet.Header>
            <Sheet.Title>Discard changes?</Sheet.Title>
            <Sheet.Close />
          </Sheet.Header>
          <Sheet.Body>
            <p className="text-sm text-ds-secondary">
              A confirmation: a bottom sheet on a phone, a small centred dialog from 768px.
            </p>
          </Sheet.Body>
          <Sheet.Footer>
            <div className="flex justify-end gap-2">
              <Button type="default" size="app" onClick={() => onWhich(false)}>
                Keep editing
              </Button>
              <Button type="primary" size="app" danger onClick={() => onWhich(false)}>
                Discard
              </Button>
            </div>
          </Sheet.Footer>
        </Sheet.Popup>
      </Sheet.Root>

      <Sheet.Root open={which === 'form'} onOpenChange={close}>
        <Sheet.Popup surface="app">
          <Sheet.Header>
            <Sheet.Title>Send back for rework?</Sheet.Title>
            <Sheet.Description>The keyboard should not cover the field or the buttons.</Sheet.Description>
            <Sheet.Close />
          </Sheet.Header>
          <Sheet.Body>
            <Field size="app" label="Reason for rework" placeholder="What should be corrected…" value={note} onChange={setNote} />
          </Sheet.Body>
          <Sheet.Footer>
            <div className="grid grid-cols-2 gap-2">
              <Button type="default" size="lg" block onClick={() => onWhich(false)}>
                Cancel
              </Button>
              <Button type="primary" size="lg" block danger disabled={!note.trim()} onClick={() => onWhich(false)}>
                Send back
              </Button>
            </div>
          </Sheet.Footer>
        </Sheet.Popup>
      </Sheet.Root>
    </>
  );
}
