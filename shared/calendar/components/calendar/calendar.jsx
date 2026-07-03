"use client";

import React, {useEffect} from "react";
import { toast } from "sonner";
import { CalendarBody } from "@calendar/components/calendar/calendar-body";
import { CalendarProvider, useCalendar } from "@calendar/components/calendar/contexts/calendar-context";
import { DndProvider } from "@calendar/components/calendar/contexts/dnd-context";
import { CalendarHeader } from "@calendar/components/calendar/header/calendar-header";
import { MobileCalendarHeader } from "@calendar/components/calendar/mobile/mobile-calendar-header";
import { useMediaQuery } from "@calendar/components/calendar/hooks";
import { AgendaSidebar } from "@calendar/components/calendar/views/agenda-view/agenda-sidebar";
import NotificationToast from "@calendar/components/calendar/notification/NotificationToast";
export function Calendar() {
  const isMobile = useMediaQuery("(max-width: 768px)");
  return (
    <CalendarProvider  view="month">
      <NotificationToast />
      <DndProvider showConfirmation={false}>
        <div className="h-full min-h-0 w-full overflow-hidden flex flex-col">
          {isMobile ? <MobileCalendarHeader /> : <CalendarHeader />}
          {/* ===== Desktop Split Layout ===== */}
          <div className="flex flex-1 overflow-hidden">
            {!isMobile && (
              <aside className="w-[20%] min-w-[280px] border-r bg-background bg-white">
                <AgendaSidebar />
              </aside>
            )}

            <main className="flex-1 overflow-hidden">
            <CalendarBody />
            </main>
          </div>
        </div>
      </DndProvider>
    </CalendarProvider>
  );
}
