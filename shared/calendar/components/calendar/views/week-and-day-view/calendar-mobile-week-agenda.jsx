"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useMemo, startTransition } from "react";
import { startOfWeek, addDays } from "date-fns";
import {
  SwipeFadeVariants,
  transition,
} from "@calendar/components/calendar/animations";
import { useCalendar } from "@calendar/components/calendar/contexts/calendar-context";
import {
  calculateMonthEventPositions,
  navigateDate,
} from "@calendar/components/calendar/helpers";
import { DayCell } from "@calendar/components/calendar/views/month-view/day-cell";
import { AgendaEvents } from "@calendar/components/calendar/views/agenda-view/agenda-events";
import { useMediaQuery } from "../../hooks";
import { CalendarVerticalSwipeLayer } from "@calendar/components/calendar/mobile/CalendarVerticalSwipeLayer";
const SWIPE_THRESHOLD = 80;

export function CalendarMobileWeekAgenda({
  singleDayEvents,
  multiDayEvents,
}) {
  const { selectedDate, setSelectedDate,activeDate,setActiveDate } = useCalendar();
  const isMobile = useMediaQuery("(max-width: 768px)");
  const allEvents = [...multiDayEvents, ...singleDayEvents];

  /* --------------------------------
     Build current week (7 days only)
  -------------------------------- */
  const weekStart = useMemo(
    () => startOfWeek(selectedDate, { weekStartsOn: 0 }),
    [selectedDate]
  );

  const weekCells = useMemo(
    () =>
      Array.from({ length: 7 }).map((_, index) => {
        const date = addDays(weekStart, index);
        return {
          day: date.getDate(),
          date,
          currentMonth: true,
        };
      }),
    [weekStart]
  );

  /* --------------------------------
     Event positioning (reuse logic)
  -------------------------------- */
  const eventPositions = useMemo(
    () =>
      calculateMonthEventPositions(
        multiDayEvents,
        singleDayEvents,
        selectedDate
      ),
    [multiDayEvents, singleDayEvents, selectedDate]
  );

  /* --------------------------------
     Swipe → week navigation
  -------------------------------- */
  const handleDragEnd = (_, info) => {
    if (!isMobile) return;
  
    const offsetX = info.offset.x;
    if (Math.abs(offsetX) < SWIPE_THRESHOLD) return;
  
    const direction = offsetX < 0 ? "next" : "previous";
  
    // 📱 DAY SWIPE (when a day is highlighted)
    if (activeDate) {
      startTransition(() => {
        const nextDay =
          direction === "next"
            ? addDays(activeDate, 1)
            : addDays(activeDate, -1);
  
        // keep grid + agenda perfectly in sync
        setActiveDate(nextDay);
        setSelectedDate(nextDay);
      });
  
      return;
    }
  
    // 📆 WEEK SWIPE (no active day)
    startTransition(() => {
      setSelectedDate((prev) =>
        navigateDate(prev, "week", direction)
      );
    });
  };
  
  const WEEK_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return (
    <div className="flex flex-col h-[90vh] overflow-hidden">
      {/* Week day cells */}
      <CalendarVerticalSwipeLayer>
      <AnimatePresence initial={false}>
      <div className="grid grid-cols-7">
				{WEEK_DAYS.map((day, index) => (
					<motion.div
						key={day}
						className="flex items-center justify-center py-2"
						initial={{ opacity: 0, y: -10 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ delay: index * 0.05, ...transition }}>
						<span className="text-xs font-medium text-t-quaternary">{day}</span>
					</motion.div>
				))}
			</div>
        <motion.div
          variants={SwipeFadeVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={{ duration: 0.15, ease: "easeOut" }}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.12}
          onDragEnd={handleDragEnd}
          className="grid grid-cols-7 border-b"
        >
          {weekCells.map((cell, index) => (
            <DayCell
              key={index}
              cell={cell}
              events={allEvents}
              eventPositions={eventPositions}
            />
          ))}
        </motion.div>
      </AnimatePresence>
      </CalendarVerticalSwipeLayer>
      {/* Agenda list */}
      <div className="flex-1 overflow-auto">
        <AgendaEvents scope={activeDate ? "day" : "week"} />
      </div>
    </div>
  );
}
