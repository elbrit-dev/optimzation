import { isValidElement } from "react";

/* Radix's `asChild` in Base UI terms.

   The calendar's overlay wrappers (responsive-modal, dialog, sheet,
   alert-dialog, popover) used to be Radix, and their call sites pass
   `asChild` to make a Trigger / Close take over the child element instead of
   rendering a <button> around it. The wrappers are on the design system's
   Base UI parts now, where the same thing is the `render` prop. This keeps the
   call sites as they are.

   `nativeButton` tells Base UI whether the element it renders is a real
   <button>: a plain DOM element other than <button> (a <div>, an <a>) is not,
   so it adds the button semantics itself. A component (the calendar's
   <Button>) is assumed to render one. */
export function asChildProps({ asChild, children, ...props }) {
  if (asChild && isValidElement(children)) {
    const nativeButton = typeof children.type !== "string" || children.type === "button";
    return { ...props, render: children, nativeButton };
  }
  return { ...props, children };
}
