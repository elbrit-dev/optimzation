"use client";

import { useCalendar } from "@calendar/components/calendar/contexts/calendar-context";
import { AgendaEvents } from "@calendar/components/calendar/views/agenda-view/agenda-events";

export function AgendaSidebar() {
  const {activeDate, view } = useCalendar();

  const scope =
  view === "month"
    ? activeDate
      ? "day"
      : "month"
    : view;
  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b">
        <h3 className="text-sm font-semibold">Agenda</h3>
        <p className="text-xs text-muted-foreground capitalize">
          {view} view
        </p>
      </div>

      <div className="flex-1 overflow-hidden">
        <AgendaEvents scope={scope} />
      </div>
    </div>
  );
}
