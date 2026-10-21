'use client';

import { Popover as BasePopover } from '@base-ui/react/popover';
import { cx } from '../lib/cx';
import { useOverlayRoot } from './useOverlayRoot';

/* Popover — the design system's base anchored panel: a picker, a menu, a
   panel of options that belongs to the control it drops from. Base UI's
   Popover underneath, token-styled, with the back button wired in
   (useOverlayRoot) like Drawer and Dialog.

   BASE, NOT COMPOUND. Root, Trigger, Portal, Positioner, Popup, Title,
   Description, Close. Positioner places the popup against its anchor — the
   Trigger, or any element passed as `anchor` — flips to the side with room,
   keeps `collisionPadding` from the viewport edge, and exposes the room it
   has as --available-height so a tall panel scrolls instead of running off
   the screen. Positioned `fixed` and portalled, so a clipping report card or
   a transformed Plasmic stack cannot cut it off.

   Not modal by default: the page stays scrollable and an outside press
   closes it. */

function Root({ open: openProp, defaultOpen, onOpenChange: onOpenChangeProp, backName = 'popover', children, ...rest }) {
  const { open, onOpenChange } = useOverlayRoot({
    open: openProp,
    defaultOpen,
    onOpenChange: onOpenChangeProp,
    backName,
  });
  return (
    <BasePopover.Root open={open} onOpenChange={onOpenChange} {...rest}>
      {children}
    </BasePopover.Root>
  );
}

/* `surface` restores the density scope the portal leaves behind (see Sheet). */
function Positioner({
  className,
  surface,
  side = 'bottom',
  align = 'start',
  sideOffset = 8,
  collisionPadding = 12,
  /* Flip to the opposite side when that fits, slide along the edge to stay on
     screen, and NEVER jump to the perpendicular axis: a panel that fits
     neither above nor below a field stays below it with its height capped
     (--available-height) and scrolls, rather than landing beside the field
     on top of whatever is next to it. */
  collisionAvoidance = { side: 'flip', align: 'shift', fallbackAxisSide: 'none' },
  ...rest
}) {
  return (
    <BasePopover.Positioner
      className={cx('ds-popover-positioner', className)}
      data-surface={surface}
      side={side}
      align={align}
      sideOffset={sideOffset}
      collisionPadding={collisionPadding}
      collisionAvoidance={collisionAvoidance}
      positionMethod="fixed"
      {...rest}
    />
  );
}

function Popup({ className, ...rest }) {
  return <BasePopover.Popup className={cx('ds-popover', className)} {...rest} />;
}

export const Popover = {
  Root,
  Trigger: BasePopover.Trigger,
  Portal: BasePopover.Portal,
  Positioner,
  Popup,
  Title: BasePopover.Title,
  Description: BasePopover.Description,
  Close: BasePopover.Close,
  createHandle: BasePopover.createHandle,
};
