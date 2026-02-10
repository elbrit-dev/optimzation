"use client";

import {
  getYear,
  isSameDay,
  isSameMonth,
  parseISO,startOfMonth,
  isWithinInterval,
} from "date-fns";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@calendar/lib/utils";
import {
  SwipeFadeVariants,
  transition,
} from "@calendar/components/calendar/animations";
import { startTransition } from "react";
import { useCalendar } from "@calendar/components/calendar/contexts/calendar-context";
import { EventListDialog } from "@calendar/components/calendar/dialogs/events-list-dialog";
import { getCalendarCells, navigateDate } from "@calendar/components/calendar/helpers";
import { EventBullet } from "@calendar/components/calendar/views/month-view/event-bullet";
import { CalendarVerticalSwipeLayer } from "../../mobile/CalendarVerticalSwipeLayer";

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export function CalendarYearView({ singleDayEvents, multiDayEvents }) {
  const {
    selectedDate,
    setSelectedDate,
    setView,
    setMobileLayer,setActiveDate
  } = useCalendar();

  const currentYear = getYear(selectedDate);
  const allEvents = [...multiDayEvents, ...singleDayEvents];
  const SWIPE_THRESHOLD = 80;

  const handleDragEnd = (_, info) => {
    if (info.offset.x < -SWIPE_THRESHOLD) {
      setSelectedDate(navigateDate(selectedDate, "year", "next"));
    }
    if (info.offset.x > SWIPE_THRESHOLD) {
      setSelectedDate(navigateDate(selectedDate, "year", "previous"));
    }
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto p-4 sm:p-6">
      <CalendarVerticalSwipeLayer>
      <AnimatePresence initial={false}>
        <motion.div
          key={currentYear}
          variants={SwipeFadeVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={{ duration: 0.12, ease: "easeOut" }}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.12}
          onDragEnd={handleDragEnd}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 auto-rows-fr"
        >
          {MONTHS.map((month, monthIndex) => {
            const monthDate = new Date(currentYear, monthIndex, 1);
            const cells = getCalendarCells(monthDate);

            return (
              <motion.div
                key={month}
                className="flex flex-col border border-border rounded-lg shadow-sm overflow-hidden"
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: monthIndex * 0.04, ...transition }}
                onClick={() => {
                  startTransition(() => {
                    const firstDayOfMonth = startOfMonth(monthDate);
                
                    setSelectedDate(firstDayOfMonth);
                    setActiveDate(firstDayOfMonth); // 🔑 IMPORTANT
                    setView("month");
                    setMobileLayer("month-expanded");
                  });
                }}
                
              >
                <div className="px-3 py-2 text-center font-semibold text-sm sm:text-base">
                  {month}
                </div>

                <div className="grid grid-cols-7 text-center text-xs font-medium text-muted-foreground py-2">
                  {WEEKDAYS.map((day) => (
                    <div key={day} className="p-1">{day}</div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-0.5 p-1.5 flex-grow text-xs">
                  {cells.map((cell) => {
                    const isCurrentMonth = isSameMonth(cell.date, monthDate);
                    const isToday = isSameDay(cell.date, new Date());

                    const dayEvents = allEvents.filter((event) => {
                      const start = parseISO(event.startDate);
                      const end = parseISO(event.endDate);
                      return isWithinInterval(cell.date, { start, end });
                    });

                    return (
                      <div
                        key={cell.date.toISOString()}
                        className={cn(
                          "flex flex-col items-center p-1 min-h-[2rem]",
                          !isCurrentMonth && "text-muted-foreground/40"
                        )}
                      >
                        {isCurrentMonth && dayEvents.length > 0 ? (
                          <EventListDialog date={cell.date} events={dayEvents}>
                            <div className="flex flex-col items-center gap-0.5">
                              <span
                                className={cn(
                                  "size-5 flex items-center justify-center font-medium",
                                  isToday &&
                                    "rounded-full bg-primary text-primary-foreground"
                                )}
                              >
                                {cell.day}
                              </span>

                              <div className="flex gap-0.5">
                                {dayEvents.slice(0, 2).map((event) => (
                                  <EventBullet
                                    key={event.id}
                                    color={event.color ?? "blue"}
                                    className="size-1.5"
                                  />
                                ))}
                              </div>
                            </div>
                          </EventListDialog>
                        ) : (
                          <span className="size-5 flex items-center justify-center font-medium">
                            {cell.day}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </AnimatePresence>
      </CalendarVerticalSwipeLayer>
    </div>
  );
}
