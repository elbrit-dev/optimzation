"use client";

import { X } from "lucide-react";
import { Drawer } from "@/design-system";
import { cn } from "@calendar/lib/utils";
import { asChildProps } from "@calendar/components/ui/as-child";

/* Modal — the calendar's form/list overlay (add & edit event, share, a day's
   events, the POB sheet), on the design system's base Drawer.

   Same exports and props as the Radix version it replaces, so call sites are
   unchanged. What it is now: a bottom sheet on a phone that follows the finger
   and closes on a swipe, a right-hand side drawer from 768px (the design
   system's rule: content gets a drawer, only a small confirmation gets a
   centred dialog), and the back button closes it, innermost first.

   `side` on ModalContent is accepted and ignored: the edge is the design
   system's (bottom on a phone, right on a desktop). The panel scrolls; a
   caller that pins a header and scrolls its own body passes
   `flex flex-col overflow-hidden` as before. */

const Modal = ({ children, ...props }) => (
  <Drawer.Root backName="calendar-modal" {...props}>
    {children}
  </Drawer.Root>
);

const ModalTrigger = (props) => <Drawer.Trigger {...asChildProps(props)} />;
const ModalClose = (props) => <Drawer.Close {...asChildProps(props)} />;
const ModalPortal = Drawer.Portal;

const ModalOverlay = ({ className, ...props }) => <Drawer.Backdrop className={className} {...props} />;

const ModalContent = ({ side: _side, className, children, ...props }) => (
  <Drawer.VirtualKeyboardProvider>
    <Drawer.Portal>
      <Drawer.Backdrop />
      <Drawer.Viewport>
        {/* md:max-h-none: callers cap the height for the phone sheet
            (max-h-[90dvh]); from 768px it is a side drawer, full height. A
            caller's own md: height still wins. */}
        <Drawer.Popup {...props} className={cn("bg-white p-4 overflow-y-auto md:max-h-none", className)}>
          <Drawer.Handle />
          {children}
          <Drawer.Close className="absolute right-2 top-2 flex size-11 items-center justify-center rounded-md opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </Drawer.Close>
        </Drawer.Popup>
      </Drawer.Viewport>
    </Drawer.Portal>
  </Drawer.VirtualKeyboardProvider>
);

const ModalHeader = (props) => (
  <div {...props} className={cn("flex flex-col space-y-2 text-center sm:text-left", props.className)} />
);

const ModalFooter = (props) => (
  <div
    {...props}
    className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", props.className)}
  />
);

const ModalTitle = (props) => (
  <Drawer.Title {...props} className={cn("text-lg font-semibold text-foreground", props.className)} />
);

const ModalDescription = (props) => (
  <Drawer.Description {...props} className={cn("text-sm text-muted-foreground", props.className)} />
);

export {
  Modal,
  ModalPortal,
  ModalOverlay,
  ModalTrigger,
  ModalClose,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalTitle,
  ModalDescription,
};
