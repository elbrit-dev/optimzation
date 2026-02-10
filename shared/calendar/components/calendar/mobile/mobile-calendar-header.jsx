"use client";

import { useState } from "react";
import { Menu, CheckSquare, House, Rows2 } from "lucide-react";
import { motion } from "framer-motion";
import { slideFromLeft, transition } from "@calendar/components/calendar/animations";
import { Button } from "@calendar/components/ui/button";
import { format } from "date-fns";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@calendar/components/ui/dropdown-menu";
import { CalendarSidebar } from "@calendar/components/calendar/mobile/calendar-sidebar";
import { useCalendar } from "@calendar/components/calendar/contexts/calendar-context";
import { cn } from "@calendar/lib/utils";
import { tabs } from "@calendar/components/calendar/header/view-tabs";
import { DateNavigator } from "@calendar/components/calendar/header/date-navigator";

const MOBILE_LAYER_MAP = {
  month: "month-expanded",
  week: "week",
  agenda: "agenda",
  // year: "year",
};

export function MobileCalendarHeader() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const {
    view,
    setView,
    setSelectedDate,
    setMobileLayer,
    events,
  } = useCalendar();

  const today = new Date();
  const todayDate = format(today, "d");

  const handleTodayClick = () => {
    setSelectedDate(today);

    // 👇 keep current semantic view
    setMobileLayer(MOBILE_LAYER_MAP[view] ?? "month-expanded");
  };

  const handleViewChange = (nextView) => {
    setView(nextView);
    setMobileLayer(MOBILE_LAYER_MAP[nextView]);
  };

  return (
    <>
      <header className="flex items-center justify-between border-b px-0 py-2 md:hidden">
        {/* LEFT */}
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)}>
            <Menu />
          </Button>

          <motion.div
            className="flex items-center gap-2"
            variants={slideFromLeft}
            initial="initial"
            animate="animate"
            transition={transition}
          >
            <DateNavigator view={view} events={events} />
          </motion.div>
        </div>

        {/* RIGHT */}
        <div className="flex items-center">
          {/* TODAY */}
          <Button
            onClick={handleTodayClick}
            className="mx-1 px-2 h-8 text-sm border"
            variant="ghost"
          >
            {todayDate}
          </Button>

          {/* VIEW SWITCH */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <Rows2 />
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" sideOffset={8} className="w-44">
              {tabs
                .filter((tab) => tab.value !== "day")
                .map(({ name, value, icon: Icon }) => (
                  <DropdownMenuItem
                    key={value}
                    onClick={() => handleViewChange(value)}
                    className={cn(
                      "flex items-center gap-2",
                      view === value && "bg-muted font-medium"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {name}
                  </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant="ghost" size="icon"><CheckSquare /></Button>
          <Button variant="ghost" size="icon"><House /></Button>
        </div>
      </header>

      <CalendarSidebar
        open={sidebarOpen}
        onOpenChange={setSidebarOpen}
      />
    </>
  );
}
