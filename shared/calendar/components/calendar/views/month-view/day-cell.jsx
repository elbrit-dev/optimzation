"use client";;
import { cva } from "class-variance-authority";
import { isToday, startOfDay, isSunday, isSameMonth } from "date-fns";
import { motion } from "framer-motion";
import { useMemo, useCallback } from "react";
import { isBefore } from "date-fns";
import { useCalendar } from "../../contexts/calendar-context";
import { cn } from "@calendar/lib/utils";
import { transition } from "@calendar/components/calendar/animations";
import { DroppableArea } from "@calendar/components/calendar/dnd/droppable-area";
import { getMonthCellEvents } from "@calendar/components/calendar/helpers";
import { useMediaQuery } from "@calendar/components/calendar/hooks";
import { EventBullet } from "@calendar/components/calendar/views/month-view/event-bullet";
import { MonthEventBadge } from "@calendar/components/calendar/views/month-view/month-event-badge";
import { AddEditEventDialog } from "../../dialogs/add-edit-event-dialog";
import { Button } from "@calendar/components/ui/button";
import { Plus } from "lucide-react";

export const dayCellVariants = cva("text-white", {
  variants: {
    color: {
      blue: "bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 dark:hover:bg-blue-400 ",
      green:
        "bg-green-600 dark:bg-green-500 hover:bg-green-700 dark:hover:bg-green-400",
      red: "bg-red-600 dark:bg-red-500 hover:bg-red-700 dark:hover:bg-red-400",
      yellow:
        "bg-yellow-600 dark:bg-yellow-500 hover:bg-yellow-700 dark:hover:bg-yellow-400",
      purple:
        "bg-purple-600 dark:bg-purple-500 hover:bg-purple-700 dark:hover:bg-purple-400",
      orange:
        "bg-orange-600 dark:bg-orange-500 hover:bg-orange-700 dark:hover:bg-orange-400",
      gray: "bg-gray-600 dark:bg-gray-500 hover:bg-gray-700 dark:hover:bg-gray-400",
      teal: "bg-teal-600 dark:bg-teal-500 hover:bg-teal-700 dark:hover:bg-teal-400", 
    },
  },
  defaultVariants: {
    color: "blue",
  },
});

const MAX_VISIBLE_EVENTS_DESKTOP = 1;
const MAX_VISIBLE_EVENTS_MOBILE = 1;


export function DayCell({
  cell,
  events,
  eventPositions
}) {
  const { day, currentMonth, date } = cell;
  const isMobile = useMediaQuery("(max-width: 768px)");
  const { setEventListDate, isEventListOpen, setSelectedDate,activeDate, setActiveDate } = useCalendar();
  const isSelected =
    activeDate &&
    startOfDay(activeDate).getTime() === startOfDay(date).getTime();

  const toggleDateSelection = () => {
    const isSame =
      activeDate &&
      startOfDay(activeDate).getTime() === startOfDay(date).getTime();

    setActiveDate(isSame ? null : date);

    // keep navigation in sync
    setSelectedDate(date);
  };

  // Memoize cellEvents and currentCellMonth for performance
  const { cellEvents, currentCellMonth } = useMemo(() => {
    const cellEvents = getMonthCellEvents(date, events, eventPositions);
    const currentCellMonth = startOfDay(new Date(date.getFullYear(), date.getMonth(), 1));
    return { cellEvents, currentCellMonth };
  }, [date, events, eventPositions]);
  const visibleEvents = isMobile
    ? cellEvents.slice(0, MAX_VISIBLE_EVENTS_MOBILE)
    : cellEvents.slice(0, MAX_VISIBLE_EVENTS_DESKTOP);

  const hiddenEventsCount = cellEvents.length - visibleEvents.length;
  // Memoize event rendering for each position with animation
  const renderEventAtPosition = useCallback((position) => {
    const event = cellEvents.find((e) => e.position === position);
    if (!event) {
      return (
        <motion.div
          key={`empty-${position}`}
          className="lg:flex-1"
          initial={false}
          animate={false} />
      );
    }
    const showBullet = isSameMonth(new Date(event.startDate), currentCellMonth);

    return (
      <motion.div
        key={`event-${event.id}-${position}`}
        className="lg:flex-1"
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: position * 0.1, ...transition }}>
        <>
          {!isEventListOpen && showBullet && (
            <EventBullet className="lg:hidden" color={event.color} />
          )}
          <MonthEventBadge className="hidden lg:flex" event={event} cellDate={startOfDay(date)} />
        </>
      </motion.div>
    );
  }, [cellEvents, currentCellMonth, date]);

  const showMoreCount = cellEvents.length - MAX_VISIBLE_EVENTS_DESKTOP;

  const showMobileMore = isMobile && currentMonth && showMoreCount > 0;
  const showDesktopMore = !isMobile && currentMonth && showMoreCount > 0;
  const isPastDate = isBefore(startOfDay(date), startOfDay(new Date()));
  const cellContent = useMemo(() => (
    <motion.div
      className={cn(
        "flex h-full lg:min-h-[7rem] flex-col gap-1 border-l border-t transition-colors",
        isSunday(date) && "border-l-0",
        isSelected &&
        "ring-1 ring-inset ring-gray-400 dark:ring-gray-600 bg-gray-50/60 dark:bg-gray-900/40"
      )}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={transition}>
      <DroppableArea
        date={date}
        className="w-full h-full py-2 flex md:block pointer-events-none"
      >
        <motion.span
          onPointerDown={(e) => e.stopPropagation()}
          className={cn(
            "h-6 px-1 text-xs font-semibold lg:px-2",
            !currentMonth && "opacity-20",
            isToday(date) &&
            "flex w-6 translate-x-1 items-center justify-center rounded-full bg-primary px-0 font-bold text-primary-foreground"
          )}
        >
          {day}
        </motion.span>
        <motion.div
          className={cn(
            "flex h-fit gap-1 px-2 mt-1 lg:h-max-content overflow-hidden lg:flex-col lg:gap-1 lg:px-0",
            !currentMonth && "opacity-50"
          )}>
          {!isPastDate && cellEvents.length === 0 ? (
            <div className="w-full h-full hidden md:flex  flex justify-center items-center group">
              <AddEditEventDialog startDate={date}>
                <Button
                  variant="ghost"
                  onPointerDownCapture={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  className="border opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-auto"
                >
                  <Plus className="h-4 w-4" />
                  <span className="max-sm:hidden">Add Event</span>
                </Button>
              </AddEditEventDialog>
            </div>
          ) : (
            visibleEvents.map((event, index) => (
              <motion.div
                key={`event-${event.id}`}
                className="lg:flex-1"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05, ...transition }}
              >
                {!isMobile && (
                  <MonthEventBadge
                    className="hidden lg:flex"
                    event={event}
                    cellDate={startOfDay(date)}
                  />
                )}

                {isMobile && (
                  <EventBullet color={event.color} />
                )}
              </motion.div>
            ))
          )}

        </motion.div>

        {!isMobile && hiddenEventsCount > 0 && currentMonth && (
          <div className="px-1 ">
            <button
              type="button"
              onPointerDownCapture={(e) => e.stopPropagation()}  // 🔥 REQUIRED
              onClick={(e) => {
                e.stopPropagation();
                setSelectedDate(date);
                setEventListDate(date);
              }}
              className="text-xs font-semibold text-muted-foreground hover:text-foreground pointer-events-auto"
            >
              +{hiddenEventsCount} more
            </button>
          </div>
        )}
      </DroppableArea>
    </motion.div>
  ), [
    date,
    day,
    currentMonth,
    cellEvents,
    showMobileMore,
    showDesktopMore,
    showMoreCount,
    renderEventAtPosition,
  ]);
  if (!isMobile || !currentMonth) {
    return (
      <motion.div
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => {
          if (!currentMonth) return;

          const isSame =
            activeDate &&
            startOfDay(activeDate).getTime() === startOfDay(date).getTime();

          setActiveDate(isSame ? null : date);
          setSelectedDate(date);
        }}
      >
        {cellContent}
      </motion.div>
    );

  }
  if (isMobile && currentMonth) {
    return (
      <motion.div
        onPointerDown={(e) => e.stopPropagation()}
        onClick={toggleDateSelection}
      >
        {cellContent}
      </motion.div>

    );
  }

  return cellContent;
}
