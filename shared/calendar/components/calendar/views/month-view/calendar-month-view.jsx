"use client";
import { addDays } from "date-fns";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo, startTransition, useEffect, useState } from "react";
import {
  staggerContainer,
  SwipeFadeVariants,
  transition,
} from "@calendar/components/calendar/animations";
import { useCalendar } from "@calendar/components/calendar/contexts/calendar-context";
import {
  calculateMonthEventPositions,
  getCalendarCells,
  navigateDate,
} from "@calendar/components/calendar/helpers";
import { DayCell } from "@calendar/components/calendar/views/month-view/day-cell";
import { EventListDialog } from "../../dialogs/events-list-dialog";
import { useMediaQuery } from "@calendar/components/calendar/hooks";
import { AgendaEvents } from "@calendar/components/calendar/views/agenda-view/agenda-events";
import { CalendarVerticalSwipeLayer } from "../../mobile/CalendarVerticalSwipeLayer";

const WEEK_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SWIPE_THRESHOLD = 80;

export function CalendarMonthView({
  singleDayEvents,
  multiDayEvents,
}) {
  const { selectedDate, setSelectedDate, activeDate,setActiveDate,mobileLayer } = useCalendar();
  const allEvents = [...multiDayEvents, ...singleDayEvents];
  const isMobile = useMediaQuery("(max-width: 768px)");

  // const [isCollapsed, setIsCollapsed] = useState(false);
  const isCollapsed = isMobile && mobileLayer === "month-agenda";


  /* --------------------------------
     Collapse only when activeDate exists
  -------------------------------- */
  // useEffect(() => {
  //   if (isMobile && activeDate) {
  //     setIsCollapsed(true);
  //   }
  // }, [activeDate, isMobile]);

  const cells = useMemo(
    () => getCalendarCells(selectedDate),
    [selectedDate]
  );

  const eventPositions = useMemo(
    () =>
      calculateMonthEventPositions(
        multiDayEvents,
        singleDayEvents,
        selectedDate
      ),
    [multiDayEvents, singleDayEvents, selectedDate]
  );

  /* ================================
     Horizontal swipe (month navigation)
  ================================ */
  const handleDragEnd = (_, info) => {
    if (!isMobile) return;
  
    const offsetX = info.offset.x;
    if (Math.abs(offsetX) < SWIPE_THRESHOLD) return;
  
    const direction = offsetX < 0 ? "next" : "previous";
  
    // 📱 DAY SWIPE (when a day is selected)
    if (activeDate) {
      startTransition(() => {
        const nextDay =
          direction === "next"
            ? addDays(activeDate, 1)
            : addDays(activeDate, -1);
  
        // update BOTH
        setActiveDate(nextDay);
        setSelectedDate(nextDay);
      });
  
      return;
    }
  
    // 📅 MONTH SWIPE (no day selected)
    startTransition(() => {
      setSelectedDate((prev) =>
        navigateDate(prev, "month", direction)
      );
    });
  };
  
  return (
    <motion.div
      variants={staggerContainer}
      initial={false}
      transition={{ duration: 0.3, ease: "easeInOut" }}
      animate={{ y: 0 }}
      className="flex-1 min-h-0 h-full flex flex-col overflow-hidden"
    >
      <motion.div
        className={`overflow-hidden ${isCollapsed ? 'mobile-height':''}`}
        animate={{ height: isCollapsed ? "60%" : "100%" }}
      >
        <div className="grid grid-cols-7">
          {WEEK_DAYS.map((day, index) => (
            <motion.div
              key={day}
              className="flex items-center justify-center py-2"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05, ...transition }}
            >
              <span className="text-xs font-medium text-t-quaternary">
                {day}
              </span>
            </motion.div>
          ))}
        </div>
    
        {/* Swipeable month grid */}
        <CalendarVerticalSwipeLayer style={{ height: isCollapsed ? "85%" : "100%" }}>
        <AnimatePresence initial={false}>
          <motion.div
            variants={SwipeFadeVariants}
            initial="initial"
            exit="exit"
            transition={{ duration: 0.12, ease: "easeOut" }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.12}
            onDragEnd={handleDragEnd}
             className="flex flex-wrap h-full"
            // className="grid grid-cols-7 grid-rows-6 h-full min-h-0"
          >
            {/* <CalendarVerticalSwipeLayer> */}
            {cells.map((cell, index) => (
              <DayCell
                key={index}
                cell={cell}
                events={allEvents}
                eventPositions={eventPositions}
              />
            ))}
            {/* </CalendarVerticalSwipeLayer> */}
          </motion.div>
        </AnimatePresence>
        </CalendarVerticalSwipeLayer>
      </motion.div>
      {!isMobile && <EventListDialog />}

      {isMobile && mobileLayer === "month-agenda" && (
        <div className="overflow-y-scroll [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] border-t">
          <AgendaEvents scope={activeDate ? "day" : "month"} />
        </div>
      )}
    </motion.div>
  );
}
