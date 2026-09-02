"use client";

import { useState } from "react";
import { Menu, ListChecks, Eye, SlidersHorizontal, CircleCheckBig, RotateCw } from "lucide-react";
import { motion } from "framer-motion";
import { slideFromLeft, transition } from "@calendar/components/calendar/animations";
import { Button } from "@calendar/components/ui/button";
import { format } from "date-fns";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@calendar/components/ui/dropdown-menu";
import { CalendarSidebar } from "@calendar/components/calendar/mobile/calendar-sidebar";
import { useCalendar } from "@calendar/components/calendar/contexts/calendar-context";
import { cn } from "@calendar/lib/utils";
import { tabs } from "@calendar/components/calendar/header/view-tabs";
import { DateNavigator } from "@calendar/components/calendar/header/date-navigator";
import { isTagEnabled, STATUS, TAG_IDS } from "@calendar/components/calendar/constants";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@calendar/components/ui/popover";
import { UserSelect } from "@calendar/components/calendar/header/user-select";
import { toast } from "sonner";

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
    syncCalendar,
    selectedUserId,
    enabledTagIds,
  } = useCalendar();
  const [isSyncing, setIsSyncing] = useState(false);
  const today = new Date();
  const todayDate = format(today, "d");
  const selectedViewerCount = Array.isArray(selectedUserId) ? selectedUserId.length : 0;

  const handleTodayClick = () => {
    setSelectedDate(today);
    // 👇 keep current semantic view
    setMobileLayer(MOBILE_LAYER_MAP[view] ?? "month-expanded");
  };

  const handleSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      await syncCalendar();
      toast.success("Calendar up to date");
    } catch (err) {
      console.error("Failed to sync calendar", err);
      // Without this a failed sync is indistinguishable from a successful one
      // that found nothing new.
      toast.error(err?.message || "Couldn't sync the calendar");
    } finally {
      setIsSyncing(false);
    }
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
  const isAgendaFilterActive = showOnlyApprovedLeaves || showOnlyTodoList;
  const canFilterLeaves = isTagEnabled(TAG_IDS.LEAVE, enabledTagIds);
  const canFilterTodos = isTagEnabled(TAG_IDS.TODO_LIST, enabledTagIds);

  return (
    <>
      {/* One row: date on the left, then the two controls reached constantly
          (sync, whose calendars) as buttons. View switching and the agenda
          filters sit behind a single menu, so the row is a fixed width and
          nothing gets clipped by the calendar's overflow-hidden shell. */}
      <header className="flex items-center gap-1 border-b px-2 py-1.5 md:hidden">
        <Button
          variant="ghost"
          size="icon"
          className="size-9 shrink-0"
          aria-label="Open scheduler"
          onClick={() => setSidebarOpen(true)}
        >
          <Menu />
        </Button>

        <motion.div
          className="flex min-w-0 items-center"
          variants={slideFromLeft}
          initial="initial"
          animate="animate"
          transition={transition}
        >
          <DateNavigator view={view} events={events} />
        </motion.div>

        {/* TODAY */}
        <Button
          onClick={handleTodayClick}
          className="mr-auto h-8 shrink-0 border px-2 text-sm"
          variant="ghost"
        >
          {todayDate}
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-9 shrink-0"
          onClick={handleSync}
          disabled={isSyncing}
          aria-label="Sync calendar data"
          title="Refresh calendar data"
        >
          <RotateCw className={cn("h-5 w-5", isSyncing && "animate-spin")} />
        </Button>

        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="relative size-9 shrink-0"
              aria-label="Choose whose calendars to view"
              title="Choose whose calendars to view"
            >
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

        {/* VIEW + AGENDA FILTERS */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="relative size-9 shrink-0"
              aria-label="View and filters"
              title="View and filters"
            >
              <SlidersHorizontal className="h-5 w-5" />
              {/* The filters used to advertise themselves by turning their icon
                  blue; behind a menu they need a marker of their own. */}
              {(isAgendaFilterActive || pendingSyncCount > 0) && (
                <span className="absolute right-1 top-1 size-2 rounded-full bg-primary" />
              )}
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" sideOffset={8} className="w-56">
            <DropdownMenuLabel>View</DropdownMenuLabel>
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

            {(canFilterLeaves || canFilterTodos) && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Show only</DropdownMenuLabel>

                {canFilterLeaves && (
                  <DropdownMenuCheckboxItem
                    checked={showOnlyApprovedLeaves}
                    onCheckedChange={() =>
                      handleAgendaToggle(
                        setShowOnlyApprovedLeaves,
                        setShowOnlyTodoList,
                        STATUS.APPROVED
                      )
                    }
                  >
                    <CircleCheckBig className="mr-2 h-4 w-4" />
                    Approved leaves
                  </DropdownMenuCheckboxItem>
                )}

                {canFilterTodos && (
                  <DropdownMenuCheckboxItem
                    checked={showOnlyTodoList}
                    onCheckedChange={() =>
                      handleAgendaToggle(
                        setShowOnlyTodoList,
                        setShowOnlyApprovedLeaves
                      )
                    }
                  >
                    <ListChecks className="mr-2 h-4 w-4" />
                    Todo list
                  </DropdownMenuCheckboxItem>
                )}
              </>
            )}

            {pendingSyncCount > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={retryPendingSync}
                  disabled={isRetryingSync}
                  className="flex items-center gap-2"
                >
                  <RotateCw
                    className={cn("h-4 w-4", isRetryingSync && "animate-spin")}
                  />
                  {isRetryingSync
                    ? "Retrying sync..."
                    : `Retry sync (${pendingSyncCount})`}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <CalendarSidebar
        open={sidebarOpen}
        onOpenChange={setSidebarOpen}
      />
    </>
  );
}
