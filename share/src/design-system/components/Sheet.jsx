'use client';

import { createContext, useContext } from 'react';
import { Dialog } from '../base/Dialog';
import { Drawer } from '../base/Drawer';
import { useIsDesktop } from '../base/useOverlayRoot';
import { cx } from '../lib/cx';

/* Sheet — a modal panel for "the rows behind this number": a header, an
   optional pinned toolbar, a scrolling body and an optional pinned footer.

   COMPOSED, NOT CONFIGURED. Each region is a part; a sheet has the regions
   it renders and nothing else:

     <Sheet.Root open={open} onOpenChange={setOpen}>
       <Sheet.Popup surface="app">
         <Sheet.Header>
           <Sheet.Title>Working today</Sheet.Title>
           <Sheet.Description>20 people in this scope</Sheet.Description>
           <Sheet.Close />
         </Sheet.Header>
         <Sheet.Toolbar>{search}</Sheet.Toolbar>
         <Sheet.Body>{rows}</Sheet.Body>
         <Sheet.Footer>{actions}</Sheet.Footer>
       </Sheet.Popup>
     </Sheet.Root>

   Root takes what decides BEHAVIOUR — open state, and where it lives:
     side        'auto' | 'bottom' | 'right'  (see base/Drawer)
     desktop     'drawer' (default): from 768px a centred popup (the base
                           Drawer's `side="auto"`; a right-hand side drawer
                           until 2026-10-23) — anything with rows, details,
                           filters. `side="right"` still pins the old edge.
                 'dialog': from 768px a centred dialog — ONLY for something
                           small: a confirmation ("Discard changes?"), a short
                           form ("Reason for rework"). Content that needs room
                           is a drawer, never a big dialog.
     snapPoints  bottom sheet heights, e.g. [0.5, 1]
   Everything about CONTENT is a child. A shape this does not cover is built
   from the base Drawer / Dialog parts directly, not by adding a prop.

   On a phone it is always the base Drawer: a bottom sheet that follows the
   finger and closes on a swipe. Everywhere it closes on Escape, the scrim,
   Close, and the back button.

   Popup bundles the plumbing every sheet needs and no sheet should repeat:
   the portal (a `@container` ancestor would otherwise trap position:fixed
   inside a card), the scrim, the viewport, the software-keyboard handling,
   and the grab bar. Because the portal lands outside the app's
   `data-surface` wrapper, Popup's `surface` puts the density scope back —
   pass what the screen's root carries.

   SCROLLING vs SWIPING. Body scrolls; a drag that starts with the body at its
   top moves the sheet. Header, Toolbar and Footer always move it. A control
   in the body with its own drag (a slider, a carousel) takes
   `data-base-ui-swipe-ignore`. */

/* Which base overlay this sheet is right now. Every part reads it, so one
   tree renders as either. */
const KindContext = createContext('drawer');

const BASE = { drawer: Drawer, dialog: Dialog };

function Root({ desktop = 'drawer', side, children, ...rest }) {
  const isDesktop = useIsDesktop();
  const kind = isDesktop && desktop === 'dialog' ? 'dialog' : 'drawer';
  const Base = BASE[kind];
  return (
    <KindContext.Provider value={kind}>
      <Base.Root backName="sheet" {...(kind === 'drawer' ? { side } : {})} {...rest}>
        {children}
      </Base.Root>
    </KindContext.Provider>
  );
}

function Popup({ surface, className, children, ...rest }) {
  const kind = useContext(KindContext);
  if (kind === 'dialog') {
    return (
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Viewport surface={surface}>
          <Dialog.Popup className={cx('ds-sheet', className)} {...rest}>
            {children}
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    );
  }
  return (
    <Drawer.VirtualKeyboardProvider>
      <Drawer.Portal>
        <Drawer.Backdrop />
        <Drawer.Viewport surface={surface}>
          <Drawer.Popup className={cx('ds-sheet', className)} {...rest}>
            <Drawer.Handle />
            {children}
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.VirtualKeyboardProvider>
  );
}

/* Title and Description stack in the first column, Close takes the second —
   by grid placement, so the header needs no wrapper around the two texts. */
function Header({ className, ...rest }) {
  return <div className={cx('ds-sheet__head', className)} {...rest} />;
}

function Title({ className, ...rest }) {
  const Base = BASE[useContext(KindContext)];
  return <Base.Title className={cx('ds-sheet__title', className)} {...rest} />;
}

function Description({ className, ...rest }) {
  const Base = BASE[useContext(KindContext)];
  return <Base.Description className={cx('ds-sheet__subtitle', className)} {...rest} />;
}

/* The way out. With no children it is the header's ✕; with children it is
   any control that closes the sheet (a footer's Cancel). */
function Close({ className, children, ...rest }) {
  const Base = BASE[useContext(KindContext)];
  if (children != null) {
    return (
      <Base.Close className={className} {...rest}>
        {children}
      </Base.Close>
    );
  }
  return (
    <Base.Close className={cx('ds-sheet__close', className)} aria-label="Close" {...rest}>
      <i className="pi pi-times" aria-hidden="true" />
    </Base.Close>
  );
}

/* Pinned under the header: controls that act ON the body (a search, a
   filter) must stay reachable while the body scrolls, or the reader scrolls
   back up to change a search and loses their place. */
function Toolbar({ className, ...rest }) {
  return <div className={cx('ds-sheet__toolbar', className)} {...rest} />;
}

/* The one part that scrolls. A sheet full of rows has no cut-off card edge to
   signal that, so it takes the DS scrollbar rather than the platform's. In a
   Drawer it is the drawer's Content, where a mouse can select text without
   starting a drag. */
function Body({ className, ...rest }) {
  const kind = useContext(KindContext);
  const classes = cx('ds-sheet__body ds-scrollbar', className);
  if (kind === 'dialog') return <div className={classes} {...rest} />;
  return <Drawer.Content className={classes} {...rest} />;
}

/* For an uncontrolled sheet: the button that opens it. */
function Trigger(props) {
  const Base = BASE[useContext(KindContext)];
  return <Base.Trigger {...props} />;
}

/* Pinned under the body: the sheet's actions. */
function Footer({ className, ...rest }) {
  return <div className={cx('ds-sheet__footer', className)} {...rest} />;
}

export const Sheet = {
  Root,
  Trigger,
  Popup,
  Header,
  Title,
  Description,
  Close,
  Toolbar,
  Body,
  Footer,
};
