"use client";

import { X } from "lucide-react";
import {
  Sheet,
  SheetClose,
  SheetContent,
} from "@calendar/components/ui/sheet";
import { MobileSchedulerSidebarContent } from "@calendar/components/calendar/mobile/mobile-scheduler-sidebar-content";

export function CalendarSidebar({ open, onOpenChange }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="flex h-[100dvh] w-[92vw] max-w-[42rem] flex-col overflow-hidden rounded-r-[32px] p-0 sm:w-[38rem] [&>button]:hidden">
        <div className="shrink-0 flex items-center justify-between px-4 pb-2 pt-5">
          <h2 className="text-[2rem] font-semibold tracking-tight text-slate-950">Scheduler</h2>
          <SheetClose asChild>
            <button
              type="button"
              className="flex size-10 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
              aria-label="Close scheduler"
            >
              <X className="size-5" />
            </button>
          </SheetClose>
        </div>

        <MobileSchedulerSidebarContent
          open={open}
          onClose={() => onOpenChange(false)}
        />
      </SheetContent>
    </Sheet>
  );
}
