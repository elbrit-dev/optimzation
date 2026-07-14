"use client";

import { useState } from "react";
import { Menu, ListChecks, Eye, Rows2, CircleCheckBig, RotateCw } from "lucide-react";
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
import { STATUS } from "@calendar/components/calendar/constants";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@calendar/components/ui/popover";
import { UserSelect } from "@calendar/components/calendar/header/user-select";

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
    events, showOnlyApprovedLeaves, showOnlyTodoList, setShowOnlyTodoList, setSelectedStatuses,
    setShowOnlyApprovedLeaves,
    pendingSyncCount,
    retryPendingSync,
    isRetryingSync,
    selectedUserId,
  } = useCalendar();
  const today = new Date();
  const todayDate = format(today, "d");
  const selectedViewerCount = Array.isArray(selectedUserId) ? selectedUserId.length : 0;

  const handleTodayClick = () => {
    setSelectedDate(today);
    // 👇 keep current semantic view
    setMobileLayer(MOBILE_LAYER_MAP[view] ?? "month-expanded");
  };

  const handleViewChange = (nextView) => {
    setView(nextView);
    setMobileLayer(MOBILE_LAYER_MAP[nextView]);
  };
  const handleAgendaToggle = (
    setCurrentToggle,
    setOtherToggle,
    status
  ) => {
    setCurrentToggle((prev) => {
      const next = !prev;

      if (next) {
        setOtherToggle(false);

        if (status) {
          setSelectedStatuses([status.toLowerCase()]);
        } else {
          // Todo mode clears status filter
          setSelectedStatuses([]);
        }

        setView("agenda");
        setMobileLayer("agenda");
      } else {
        setSelectedStatuses([]);
        setView("month");
        setMobileLayer("month-agenda");
      }

      return next;
    });
  };
  return (
    <>
      <header className="flex items-center justify-between border-b px-2 py-2 md:hidden">
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

          <Button
            variant="ghost"
            size="icon"
            onClick={() =>
              handleAgendaToggle(
                setShowOnlyApprovedLeaves,
                setShowOnlyTodoList, STATUS.APPROVED
              )
            }
          >
            <CircleCheckBig
              className={cn(
                "h-5 w-5",
                showOnlyApprovedLeaves && "text-blue-500"
              )}
            />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() =>
              handleAgendaToggle(
                setShowOnlyTodoList,
                setShowOnlyApprovedLeaves
              )
            }
          >
            <ListChecks
              className={cn(
                "h-5 w-5",
                showOnlyTodoList && "text-blue-500"
              )}
            />
          </Button>
          {pendingSyncCount > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mx-1 gap-1 px-2 text-xs"
              onClick={retryPendingSync}
              disabled={isRetryingSync}
            >
              <RotateCw
                className={cn(
                  "h-3.5 w-3.5",
                  isRetryingSync && "animate-spin"
                )}
              />
              {isRetryingSync
                ? "Retrying..."
                : `Retry Sync(${pendingSyncCount})`}
            </Button>
          )}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="relative">
                <Eye className="h-5 w-5" />
                {selectedViewerCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                    {selectedViewerCount}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              side="bottom"
              className="mr-2 w-[min(calc(100vw-1rem),24rem)] p-2"
            >
              <UserSelect mode="mobile-viewer" />
            </PopoverContent>
          </Popover>
        </div>
      </header>

      <CalendarSidebar
        open={sidebarOpen}
        onOpenChange={setSidebarOpen}
      />
    </>
  );
}
