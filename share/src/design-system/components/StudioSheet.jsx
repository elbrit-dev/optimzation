'use client';

import { Sheet } from './Sheet';

/* StudioSheet — Sheet for Plasmic Studio only, registered as "DS Sheet".

   Studio configures a component through props and slots; it cannot assemble
   Sheet's parts. This is the one place they are assembled from props, so code
   never needs to: in code, compose <Sheet.Root> and friends directly. Not
   exported from the design-system index for that reason. */

export function StudioSheet({ open, onClose, title, subtitle, surface, children }) {
  return (
    <Sheet.Root
      open={Boolean(open)}
      onOpenChange={(next) => {
        if (!next) onClose?.();
      }}
    >
      <Sheet.Popup surface={surface}>
        <Sheet.Header>
          <Sheet.Title>{title}</Sheet.Title>
          {subtitle ? <Sheet.Description>{subtitle}</Sheet.Description> : null}
          <Sheet.Close />
        </Sheet.Header>
        <Sheet.Body>{children}</Sheet.Body>
      </Sheet.Popup>
    </Sheet.Root>
  );
}
