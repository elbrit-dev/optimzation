"use client"

import { X } from "lucide-react"
import { Drawer } from "@/design-system"
import { cn } from "@calendar/lib/utils"
import { asChildProps } from "@calendar/components/ui/as-child"

/* Dialog — the calendar's event-details overlay, on the design system's base
   Drawer. Same exports and props as the Radix version it replaces.

   Event details is content, not a yes/no question, so by the design system's
   rule it is a drawer: a bottom sheet on a phone (swipe down to close), a
   right-hand side drawer from 768px. Back closes it; a dialog nested inside
   (edit, delete) is a layer of its own and closes first. */

const Dialog = ({ children, ...props }) => (
  <Drawer.Root backName="calendar-dialog" {...props}>
    {children}
  </Drawer.Root>
)

const DialogTrigger = (props) => <Drawer.Trigger {...asChildProps(props)} />

const DialogPortal = Drawer.Portal

const DialogClose = (props) => <Drawer.Close {...asChildProps(props)} />

const DialogOverlay = ({ className, ...props }) => <Drawer.Backdrop className={className} {...props} />

const DialogContent = ({ className, children, ...props }) => (
  <Drawer.Portal>
    <Drawer.Backdrop />
    <Drawer.Viewport>
      <Drawer.Popup
        {...props}
        /* md:max-h-none: the phone sheet's height cap (max-h-[88vh] from the
           caller) does not apply to the full-height side drawer from 768px. */
        className={cn("grid w-full content-start gap-4 bg-white p-3 py-6 md:p-6 overflow-y-auto md:max-h-none", className)}
      >
        <Drawer.Handle />
        {children}
        <Drawer.Close className="absolute right-4 top-8 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </Drawer.Close>
      </Drawer.Popup>
    </Drawer.Viewport>
  </Drawer.Portal>
)

const DialogHeader = ({ className, ...props }) => (
  <div className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)} {...props} />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({ className, ...props }) => (
  <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)} {...props} />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = ({ className, ...props }) => (
  <Drawer.Title className={cn("text-lg font-semibold leading-none tracking-tight", className)} {...props} />
)

const DialogDescription = ({ className, ...props }) => (
  <Drawer.Description className={cn("text-sm text-muted-foreground", className)} {...props} />
)

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
