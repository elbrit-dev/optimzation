'use client';

import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import { cx } from '../lib/cx';
import { useOverlayRoot } from './useOverlayRoot';

/* Dialog — the design system's base centred overlay. Base UI's Dialog
   underneath, token-styled, with the back button wired in (useOverlayRoot).

   The same parts as Drawer — Root, Portal, Backdrop, Viewport, Popup, Title,
   Description, Close — so a composed component (Sheet) can render either
   from one tree: a swipeable bottom sheet on a phone, a centred dialog on a
   desktop. No gestures here; Base UI's guidance is that a panel which does
   not need them is a Dialog.

   It fades and settles a short distance on --dur-base; prefers-reduced-motion
   takes that to 1ms like every other transition in the system. */

function Root({ open: openProp, defaultOpen, onOpenChange: onOpenChangeProp, backName = 'dialog', children, ...rest }) {
  const { open, onOpenChange } = useOverlayRoot({
    open: openProp,
    defaultOpen,
    onOpenChange: onOpenChangeProp,
    backName,
    closeWatcher: true,
  });
  return (
    <BaseDialog.Root open={open} onOpenChange={onOpenChange} {...rest}>
      {children}
    </BaseDialog.Root>
  );
}

function Backdrop({ className, ...rest }) {
  return <BaseDialog.Backdrop className={cx('ds-dialog-backdrop', className)} {...rest} />;
}

/* `surface` restores the density scope the portal leaves behind (see Sheet). */
function Viewport({ className, surface, ...rest }) {
  return <BaseDialog.Viewport className={cx('ds-dialog-viewport', className)} data-surface={surface} {...rest} />;
}

function Popup({ className, ...rest }) {
  return <BaseDialog.Popup className={cx('ds-dialog', className)} {...rest} />;
}

export const Dialog = {
  Root,
  Trigger: BaseDialog.Trigger,
  Portal: BaseDialog.Portal,
  Backdrop,
  Viewport,
  Popup,
  Title: BaseDialog.Title,
  Description: BaseDialog.Description,
  Close: BaseDialog.Close,
  createHandle: BaseDialog.createHandle,
};
