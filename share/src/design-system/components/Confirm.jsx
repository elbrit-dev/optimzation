'use client';

import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from './Button';
import { Sheet } from './Sheet';
import { useRetained } from '../lib/useRetained';

/* confirm() — ask one yes/no question and wait for the answer.

     if (await confirm({ title: 'Delete this event?', confirmLabel: 'Delete', danger: true })) { … }

   Resolves true on the confirm button, false on everything else: Cancel, the
   ✕, the scrim, Escape, a swipe, the back button. It is a Sheet — a small
   centred dialog from 768px, a bottom sheet on a phone — so it looks and
   behaves like every other confirmation in the system. The replacement for
   PrimeReact's confirmDialog, Radix's AlertDialog and window.confirm.

   Options: title, description, confirmLabel ('OK'), cancelLabel ('Cancel'),
   danger (red confirm), surface (density scope, as Sheet.Popup).

   NO HOST TO MOUNT. The first call renders a small React root of its own into
   <body>; later calls reuse it. The Sheet portals to <body> anyway, so the
   app's tree has nothing to contribute — and neither app has to remember to
   put a <ConfirmHost /> in its shell for this to work.

   ONE QUESTION AT A TIME. A second call while one is open answers the first
   with false: the newer question is the one the person is looking at. */

let pending = null; // { options, resolve }
const listeners = new Set();
let root = null;

const publish = () => listeners.forEach((listener) => listener(pending));

function settle(entry, answer) {
  if (!entry) return;
  entry.resolve(answer);
  if (pending === entry) {
    pending = null;
    publish();
  }
}

export function confirm(options = {}) {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve(false);
      return;
    }
    if (!root) {
      const node = document.createElement('div');
      node.setAttribute('data-confirm-host', '');
      document.body.appendChild(node);
      root = createRoot(node);
      root.render(<ConfirmHost />);
    }
    const previous = pending;
    pending = { options, resolve };
    if (previous) previous.resolve(false);
    publish();
  });
}

function ConfirmHost() {
  const [current, setCurrent] = useState(pending);
  useEffect(() => {
    listeners.add(setCurrent);
    setCurrent(pending);
    return () => listeners.delete(setCurrent);
  }, []);

  /* The question stays on screen while the sheet animates out. */
  const shown = useRetained(current);
  const o = shown?.options ?? {};

  return (
    <Sheet.Root open={current != null} onOpenChange={(open) => !open && settle(current, false)} desktop="dialog">
      <Sheet.Popup surface={o.surface} role="alertdialog">
        <Sheet.Header>
          <Sheet.Title>{o.title}</Sheet.Title>
          {o.description ? <Sheet.Description>{o.description}</Sheet.Description> : null}
          <Sheet.Close />
        </Sheet.Header>
        <Sheet.Footer>
          <div className="flex justify-end gap-2">
            <Button type="default" size="app" onClick={() => settle(current, false)}>
              {o.cancelLabel ?? 'Cancel'}
            </Button>
            <Button type="primary" size="app" danger={Boolean(o.danger)} onClick={() => settle(current, true)}>
              {o.confirmLabel ?? 'OK'}
            </Button>
          </div>
        </Sheet.Footer>
      </Sheet.Popup>
    </Sheet.Root>
  );
}
