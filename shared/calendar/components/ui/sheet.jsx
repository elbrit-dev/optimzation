import { X } from "lucide-react"
import { Drawer } from "@/design-system"
import { cn } from "@calendar/lib/utils"
import { asChildProps } from "@calendar/components/ui/as-child"

/* Sheet — the calendar's edge panel (the mobile scheduler sidebar), on the
   design system's base Drawer: it follows the finger and closes on a swipe
   towards its edge, and back closes it.

   THE EDGE IS ON THE ROOT now — `<Sheet side="left">` — because the drawer's
   swipe direction is decided where it opens, not where it renders. `side` on
   SheetContent is accepted and ignored. Defaults to the right, as the Radix
   version did. */

const Sheet = ({ side = "right", children, ...props }) => (
  <Drawer.Root side={side} backName="calendar-sheet" {...props}>
    {children}
  </Drawer.Root>
)

const SheetTrigger = (props) => <Drawer.Trigger {...asChildProps(props)} />

const SheetClose = (props) => <Drawer.Close {...asChildProps(props)} />

const SheetPortal = Drawer.Portal

const SheetOverlay = ({ className, ...props }) => <Drawer.Backdrop className={className} {...props} />

const SheetContent = ({ side: _side, className, children, ...props }) => (
  <Drawer.Portal>
    <Drawer.Backdrop />
    <Drawer.Viewport>
      <Drawer.Popup {...props} className={cn("gap-4 bg-white p-6", className)}>
        <Drawer.Close className="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </Drawer.Close>
        {children}
      </Drawer.Popup>
    </Drawer.Viewport>
  </Drawer.Portal>
)

const SheetHeader = ({ className, ...props }) => (
  <div className={cn("flex flex-col space-y-2 text-center sm:text-left", className)} {...props} />
)
SheetHeader.displayName = "SheetHeader"

const SheetFooter = ({ className, ...props }) => (
  <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)} {...props} />
)
SheetFooter.displayName = "SheetFooter"

const SheetTitle = ({ className, ...props }) => (
  <Drawer.Title className={cn("text-lg font-semibold text-foreground", className)} {...props} />
)

const SheetDescription = ({ className, ...props }) => (
  <Drawer.Description className={cn("text-sm text-muted-foreground", className)} {...props} />
)

export {
  Sheet,
  SheetPortal,
  SheetOverlay,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
