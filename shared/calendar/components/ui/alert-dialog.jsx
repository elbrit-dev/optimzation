"use client"

import { Sheet } from "@/design-system"
import { cn } from "@calendar/lib/utils"
import { buttonVariants } from "@calendar/components/ui/button"
import { asChildProps } from "@calendar/components/ui/as-child"

/* AlertDialog — the calendar's yes/no confirmations (delete an event, confirm
   a drag-and-drop move), on the design system's Sheet with desktop="dialog":
   a bottom sheet on a phone, a small centred dialog from 768px — the same
   thing confirm() and every other confirmation in both apps are. Back,
   Escape and the scrim all answer "Cancel".

   Same exports and props as the Radix version it replaces. Action and Cancel
   are the sheet's Close with the button looks they had: both close it, and
   Action runs its onClick first. */

const AlertDialog = ({ children, ...props }) => (
  <Sheet.Root desktop="dialog" {...props}>
    {children}
  </Sheet.Root>
)

const AlertDialogTrigger = (props) => <Sheet.Trigger {...asChildProps(props)} />

const AlertDialogContent = ({ className, children, ...props }) => (
  <Sheet.Popup role="alertdialog" {...props} className={cn("bg-white", className)}>
    <div className="grid gap-4 p-6">{children}</div>
  </Sheet.Popup>
)

const AlertDialogHeader = ({ className, ...props }) => (
  <div className={cn("flex flex-col space-y-2 text-center sm:text-left", className)} {...props} />
)
AlertDialogHeader.displayName = "AlertDialogHeader"

const AlertDialogFooter = ({ className, ...props }) => (
  <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)} {...props} />
)
AlertDialogFooter.displayName = "AlertDialogFooter"

const AlertDialogTitle = ({ className, ...props }) => (
  <Sheet.Title className={cn("text-lg font-semibold", className)} {...props} />
)

const AlertDialogDescription = ({ className, ...props }) => (
  <Sheet.Description className={cn("text-sm text-muted-foreground", className)} {...props} />
)

const AlertDialogAction = ({ className, ...props }) => (
  <Sheet.Close {...asChildProps({ ...props, className: cn(buttonVariants(), className) })} />
)

const AlertDialogCancel = ({ className, ...props }) => (
  <Sheet.Close
    {...asChildProps({ ...props, className: cn(buttonVariants({ variant: "outline" }), "mt-2 sm:mt-0", className) })}
  />
)

export {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
}
