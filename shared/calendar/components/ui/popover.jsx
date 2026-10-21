import { Popover as DsPopover } from "@/design-system"

import { cn } from "@calendar/lib/utils"
import { asChildProps } from "@calendar/components/ui/as-child"

/* Popover — the calendar's anchored panels (comboboxes, filters, date and time
   pickers, the link editor, the user picker), on the design system's base
   Popover. Same exports and props as the Radix version it replaces.

   Placement is Base UI's: it flips above when there is no room below, keeps
   to the screen, and never lands beside its field. Back closes it before the
   dialog it sits in, being a layer of its own.

   PopoverAnchor has no Base UI counterpart (the trigger is the anchor); it is
   kept as a plain wrapper so an import of it does not break. */

const Popover = ({ children, ...props }) => (
  <DsPopover.Root backName="calendar-popover" {...props}>
    {children}
  </DsPopover.Root>
)

const PopoverTrigger = (props) => <DsPopover.Trigger {...asChildProps(props)} />

const PopoverAnchor = ({ children }) => children

/* Radix's onOpenAutoFocus(event): calling event.preventDefault() meant "do
   not move focus in" (the combobox does it on touch, so the keyboard does not
   jump up). Base UI's initialFocus takes a function that returns false for the
   same thing, so the handler runs as before and decides. */
const radixAutoFocus = (onOpenAutoFocus) => () => {
  let prevented = false
  onOpenAutoFocus({ preventDefault: () => { prevented = true } })
  return !prevented
}

const PopoverContent = ({
  className,
  align = "center",
  side = "bottom",
  sideOffset = 4,
  onOpenAutoFocus,
  children,
  ...props
}) => (
  <DsPopover.Portal>
    <DsPopover.Positioner align={align} side={side} sideOffset={sideOffset}>
      <DsPopover.Popup
        initialFocus={onOpenAutoFocus ? radixAutoFocus(onOpenAutoFocus) : undefined}
        className={cn("w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none", className)}
        {...props}
      >
        {children}
      </DsPopover.Popup>
    </DsPopover.Positioner>
  </DsPopover.Portal>
)

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor }
