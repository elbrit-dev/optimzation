"use client";

import { Button } from "@calendar/components/ui/button";
import { RotateCw } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@calendar/components/ui/sheet";
import { useCalendar } from "@calendar/components/calendar/contexts/calendar-context";
import { cn } from "@calendar/lib/utils";
import { tabs } from "../header/view-tabs";
import { UserSelect } from "@calendar/components/calendar/header/user-select";
import GoogleCalendarConnect from "../google-auth";
const MOBILE_LAYER_MAP = {
  month: "month-expanded",
  week: "week",
  agenda: "agenda",
  // year: "year",
};

export function CalendarSidebar({ open, onOpenChange }) {
  const {
    view,
    setView,
    setMobileLayer,
    pendingSyncCount,
    retryPendingSync,
    isRetryingSync,
  } = useCalendar();

  const handleViewChange = (value) => {
    setView(value);
    setMobileLayer(MOBILE_LAYER_MAP[value]);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-72 p-0">
        <SheetHeader className="border-b px-4 py-3 text-left">
          <SheetTitle>Scheduler</SheetTitle>
        </SheetHeader>

        <div className="flex h-full flex-col overflow-hidden">
          <nav className="flex flex-col gap-3 p-2">
            {tabs
              .filter((tab) => tab.value !== "day")
              .map(({ name, value, icon: Icon }) => {
                const isActive = view === value;

                return (
                  <Button
                    key={value}
                    variant={isActive ? "secondary" : "ghost"}
                    className={cn(
                      "justify-start gap-2",
                      isActive && "font-medium"
                    )}
                    onClick={() => handleViewChange(value)}
                  >
                    <Icon className="h-4 w-4" />
                    {name}
                  </Button>
                );
              })}
          </nav>

          <div className="border-t space-y-2 px-2 pt-3">
            <GoogleCalendarConnect className="w-full" />
            {pendingSyncCount > 0 && (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={retryPendingSync}
                disabled={isRetryingSync}
              >
                <RotateCw
                  className={cn(
                    "mr-2 h-4 w-4",
                    isRetryingSync && "animate-spin"
                  )}
                />
                {isRetryingSync
                  ? "Retrying..."
                  : `Retry Sync(${pendingSyncCount})`}
              </Button>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-hidden px-0 pb-3 pt-3">
            <UserSelect mode="inline" />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
