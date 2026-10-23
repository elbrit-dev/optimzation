'use client';

import { createContext, useContext } from 'react';
import { Drawer as BaseDrawer } from '@base-ui/react/drawer';
import { cx } from '../lib/cx';
import { useIsDesktop, useOverlayRoot } from './useOverlayRoot';

/* Drawer — the design system's base edge overlay: a panel that slides in from
   an edge and follows the finger. Base UI's Drawer underneath, token-styled.

   BASE, NOT COMPOUND. These are Base UI's parts with the system's classes on
   them and nothing assembled: Root, Portal, Backdrop, Viewport, Popup,
   Content, Title, Description, Close, plus a Handle (the grab bar). A screen
   that wants "title, close, scrolling body" uses Sheet, which is built from
   these; a screen that needs a different shape assembles the parts itself.
   Nothing outside design-system/base imports '@base-ui/*' (lint enforces it),
   so every overlay in both apps behaves the same way.

   ONE EDGE PER SCREEN SIZE. `side="auto"` (the default) is a bottom sheet on
   a phone and, from 768px up, a CENTRED POPUP — app-wide, since 2026-10-23;
   it used to be a right-hand side drawer, and a desktop reader got a tall
   strip pinned to the edge of a wide screen. Swipe-to-dismiss follows the
   edge: down for a bottom sheet and for the popup, right for a side drawer.
   `side="bottom"`, `side="right"` or `side="center"` pins it.

   Back closes it — see useOverlayRoot.

   MOTION IS THE SYSTEM'S. One curve (--ds-ease-standard), --dur-base, slides
   and fades only; prefers-reduced-motion drops --dur-base to 1ms. While a
   finger is down the panel tracks it with no transition at all, and a fast
   flick shortens the release (--drawer-swipe-strength). */

const EdgeContext = createContext('bottom');

const SWIPE_FOR_EDGE = { bottom: 'down', center: 'down', right: 'right', left: 'left' };

function Root({
  open: openProp,
  defaultOpen,
  onOpenChange: onOpenChangeProp,
  side = 'auto',
  /* Name for the back-button layer, for debugging the stack. */
  backName = 'drawer',
  children,
  ...rest
}) {
  const desktop = useIsDesktop();
  const edge = side === 'auto' ? (desktop ? 'center' : 'bottom') : side;
  const { open, onOpenChange } = useOverlayRoot({
    open: openProp,
    defaultOpen,
    onOpenChange: onOpenChangeProp,
    backName,
  });

  return (
    <EdgeContext.Provider value={edge}>
      <BaseDrawer.Root
        open={open}
        onOpenChange={onOpenChange}
        swipeDirection={SWIPE_FOR_EDGE[edge] ?? 'down'}
        {...rest}
      >
        {children}
      </BaseDrawer.Root>
    </EdgeContext.Provider>
  );
}

function Backdrop({ className, ...rest }) {
  return <BaseDrawer.Backdrop className={cx('ds-drawer-backdrop', className)} {...rest} />;
}

/* `surface` restores the density scope the portal leaves behind (see Sheet). */
function Viewport({ className, surface, ...rest }) {
  const edge = useContext(EdgeContext);
  return (
    <BaseDrawer.Viewport
      className={cx('ds-drawer-viewport', className)}
      data-edge={edge}
      data-surface={surface}
      {...rest}
    />
  );
}

function Popup({ className, ...rest }) {
  const edge = useContext(EdgeContext);
  return <BaseDrawer.Popup className={cx('ds-drawer', className)} data-edge={edge} {...rest} />;
}

function Content({ className, ...rest }) {
  return <BaseDrawer.Content className={cx('ds-drawer__content', className)} {...rest} />;
}

/* The grab bar. Decoration on a side drawer, so it only draws on a bottom
   sheet — where it is the affordance that says "this moves". */
function Handle({ className, ...rest }) {
  const edge = useContext(EdgeContext);
  if (edge !== 'bottom') return null;
  return <div aria-hidden="true" className={cx('ds-drawer__handle', className)} {...rest} />;
}

export const Drawer = {
  Root,
  Trigger: BaseDrawer.Trigger,
  Portal: BaseDrawer.Portal,
  Backdrop,
  Viewport,
  Popup,
  Content,
  Handle,
  Title: BaseDrawer.Title,
  Description: BaseDrawer.Description,
  Close: BaseDrawer.Close,
  VirtualKeyboardProvider: BaseDrawer.VirtualKeyboardProvider,
  createHandle: BaseDrawer.createHandle,
};
