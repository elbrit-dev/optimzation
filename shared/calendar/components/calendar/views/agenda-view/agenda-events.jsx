"use client";

import {
  format,
  parseISO,
  startOfWeek,
  startOfDay,
  endOfDay,
  endOfWeek,
  isWithinInterval,
  addDays,
} from "date-fns";

import { useMemo, useRef, useState, startTransition } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@calendar/lib/utils";
import { useCalendar } from "@calendar/components/calendar/contexts/calendar-context";
import { useMediaQuery } from "@calendar/components/calendar/hooks";

import {
  getBgColor,
  getColorClass,
  getEventsForMonth,
  getFirstLetters,
  toCapitalize,
  navigateDate,
} from "@calendar/components/calendar/helpers";

import { EventDetailsDialog } from "@calendar/components/calendar/dialogs/event-details-dialog";
import { EventBullet } from "@calendar/components/calendar/views/month-view/event-bullet";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@calendar/components/ui/command";

import { Avatar, AvatarFallback } from "@calendar/components/ui/avatar";

import { ICON_MAP } from "@calendar/components/calendar/mobile/MobileAddEventBar";
import { STATUS, TAG_IDS } from "@calendar/components/calendar/constants";

const SWIPE_THRESHOLD = 60;

export const AgendaEvents = ({ scope = "all"}) => {
  const {
    events,
    badgeVariant,
    agendaModeGroupBy,
    selectedDate,
    setSelectedDate,
    activeDate,
    setActiveDate,
    mobileLayer,
    view,showOnlyApprovedLeaves,showOnlyTodoList,
  } = useCalendar();

  const isMobile = useMediaQuery("(max-width: 768px)");

  const [doctorAccordionOpen, setDoctorAccordionOpen] = useState({});

  const startX = useRef(0);
  const startY = useRef(0);
  const isSwiping = useRef(false);

  /* ===============================
     TOUCH NAVIGATION
  =============================== */

  const onTouchStartCapture = (e) => {
    if (!isMobile) return;
    const t = e.touches[0];
    startX.current = t.clientX;
    startY.current = t.clientY;
    isSwiping.current = false;
  };

  const onTouchMoveCapture = (e) => {
    if (!isMobile) return;

    const t = e.touches[0];
    const dx = Math.abs(t.clientX - startX.current);
    const dy = Math.abs(t.clientY - startY.current);

    if (dx > dy && dx > 10) {
      isSwiping.current = true;
    }
  };

  const onTouchEndCapture = (e) => {
    if (!isMobile || !isSwiping.current) return;

    const t = e.changedTouches[0];
    const deltaX = t.clientX - startX.current;

    if (Math.abs(deltaX) < SWIPE_THRESHOLD) return;

    const direction = deltaX < 0 ? "next" : "previous";

    startTransition(() => {
      if (view === "week" || mobileLayer === "week") {
        if (activeDate) {
          const nextDay =
            direction === "next"
              ? addDays(activeDate, 1)
              : addDays(activeDate, -1);

          setActiveDate(nextDay);
          setSelectedDate(nextDay);
          return;
        }

        setSelectedDate((prev) =>
          navigateDate(prev, "week", direction)
        );
        return;
      }

      if (view === "month" || mobileLayer === "month-agenda") {
        if (activeDate) {
          const nextDay =
            direction === "next"
              ? addDays(activeDate, 1)
              : addDays(activeDate, -1);

          setActiveDate(nextDay);
          setSelectedDate(nextDay);
          return;
        }

        setSelectedDate((prev) =>
          navigateDate(prev, "month", direction)
        );
      }
    });
  };

  /* ===============================
     FILTER EVENTS
  =============================== */

  const isEventInRange = (event, date) => {
    const start = parseISO(event.startDate);
    const end = parseISO(event.endDate || event.startDate);

    return isWithinInterval(date, {
      start: startOfDay(start),
      end: endOfDay(end),
    });
  };

  const scopedEvents = useMemo(() => {
    if (scope === "day") {
      return events.filter((event) =>
        isEventInRange(event, selectedDate)
      );
    }

    if (scope === "week") {
      return events.filter((event) => {
        const start = parseISO(event.startDate);
        const end = parseISO(event.endDate || event.startDate);

        return (
          isWithinInterval(start, {
            start: startOfWeek(selectedDate),
            end: endOfWeek(selectedDate),
          }) ||
          isWithinInterval(end, {
            start: startOfWeek(selectedDate),
            end: endOfWeek(selectedDate),
          }) ||
          isWithinInterval(startOfWeek(selectedDate), {
            start,
            end,
          })
        );
      });
    }

    return getEventsForMonth(events, selectedDate);
  }, [events, selectedDate, scope]);
  const filteredEvents = useMemo(() => {
    let result = scopedEvents;
  
    if (showOnlyApprovedLeaves) {
      result = result.filter(
        (event) =>
          event.tags === TAG_IDS.LEAVE 
      );
    }
  
    if (showOnlyTodoList) {
      result = result.filter(
        (event) => event.tags === TAG_IDS.TODO_LIST
      );
    }
  
    return result;
  }, [
    scopedEvents,
    showOnlyApprovedLeaves,
    showOnlyTodoList,
  ]);

  /* ===============================
     GROUP EVENTS
  =============================== */
  const getEventDisplayDate = (event) => {
    const start = parseISO(event.startDate);
    const end = parseISO(event.endDate || event.startDate);

    // If selectedDate falls inside range → use selectedDate
    if (
      isWithinInterval(selectedDate, {
        start: startOfDay(start),
        end: endOfDay(end),
      })
    ) {
      return format(selectedDate, "yyyy-MM-dd");
    }

    // fallback → use startDate
    return format(start, "yyyy-MM-dd");
  };
  const agendaEvents = Object.groupBy(filteredEvents, (event) =>
    agendaModeGroupBy === "date"
      ? getEventDisplayDate(event)
      : event.color
  );

  const groupedAndSortedEvents = Object.entries(agendaEvents).sort(
    (a, b) => new Date(a[0]) - new Date(b[0])
  );

  /* ===============================
     EVENT CARD
  =============================== */

  const renderEventCard = (event) => {
    const TagIcon = ICON_MAP[event.tags];

    return (
      <CommandItem
        key={event.id}
        className={cn(
          "mb-2 p-2 border rounded-md",
          badgeVariant === "colored"
            ? getColorClass(event.color)
            : "hover:bg-zinc-200 dark:hover:bg-gray-900"
        )}
      >
        <EventDetailsDialog event={event}>
          <div className="flex justify-between gap-2 w-full">
            <div className="flex gap-2 items-center w-full">

              {badgeVariant === "dot" ? (
                <EventBullet color={event.color} />
              ) : (
                <Avatar>
                  <AvatarFallback
                    className={getBgColor(event.color)}
                  >
                    {getFirstLetters(event.title)}
                  </AvatarFallback>
                </Avatar>
              )}

              <div className="w-full">
                <div className="flex items-center gap-2">
                  {TagIcon && (
                    <TagIcon className="w-4 h-4 text-muted-foreground" />
                  )}

                  <p className="font-medium text-sm">
                    {event.title}
                  </p>
                </div>

                <p className="text-xs text-muted-foreground">
                  {event.owner?.name}
                </p>
              </div>
            </div>
          </div>
        </EventDetailsDialog>
      </CommandItem>
    );
  };

  /* ===============================
     UI
  =============================== */

  return (
    <div
      className="h-full"
      onTouchStartCapture={onTouchStartCapture}
      onTouchMoveCapture={onTouchMoveCapture}
      onTouchEndCapture={onTouchEndCapture}
    >
      <Command className="overflow-y-scroll py-4 h-[80vh] bg-transparent [&::-webkit-scrollbar]:hidden">

        {scope === "all" && (
          <div className="mb-4 mx-4">
            <CommandInput placeholder="Type a command or search..." />
          </div>
        )}

        <CommandList className="px-2 border-t max-h-none overflow-visible">

          {groupedAndSortedEvents.map(([groupKey, groupedEvents]) => {

            const hqEvents = groupedEvents.filter(
              (event) =>
                event.tags === TAG_IDS.HQ_TOUR_PLAN ||
                event.tags === TAG_IDS.DOCTOR_VISIT_PLAN
            );

            const normalEvents = groupedEvents.filter(
              (event) =>
                event.tags !== TAG_IDS.HQ_TOUR_PLAN &&
                event.tags !== TAG_IDS.DOCTOR_VISIT_PLAN
            );
            // 👉 Step 1: Clone existing HQ + Doctor events
            const enhancedHQEvents = [...hqEvents];

            // 👉 Step 2: Inject HQ if missing
            groupedEvents.forEach((event) => {
              if (event.tags === TAG_IDS.DOCTOR_VISIT_PLAN) {
                const hqId = event.hqTerritory;

                const alreadyExists = enhancedHQEvents.some(
                  (e) =>
                    e.tags === TAG_IDS.HQ_TOUR_PLAN &&
                    e.hqTerritory === hqId
                );

                if (!alreadyExists) {
                  const hqEvent = events.find(
                    (e) =>
                      e.tags === TAG_IDS.HQ_TOUR_PLAN &&
                      e.hqTerritory === hqId
                  );

                  if (hqEvent) {
                    enhancedHQEvents.push(hqEvent);
                  }
                }
              }
            });

            // 👉 Step 3: Now group
            const groupedByHQ = Object.groupBy(
              enhancedHQEvents,
              (event) => event.hqTerritory
            );
            return (
              <CommandGroup
                key={groupKey}
                heading={
                  agendaModeGroupBy === "date"
                    ? format(parseISO(groupKey), "EEEE, MMMM d, yyyy")
                    : toCapitalize(groupedEvents[0].color)
                }
              >
                {/* DOCTOR EVENTS */}
                {Object.entries(groupedByHQ).map(([hqId, events]) => {
                  const hqOnlyEvents = events.filter(
                    (e) => e.tags === TAG_IDS.HQ_TOUR_PLAN
                  );

                  const doctorEvents = events.filter(
                    (e) => e.tags === TAG_IDS.DOCTOR_VISIT_PLAN
                  );
                  const key = `${groupKey}-${hqId}`;
                  const isOpen = doctorAccordionOpen[key];
                  const hqName = hqOnlyEvents[0]?.hqName || hqId;
                  const doctorCount = doctorEvents.length;

                  const title =
                    doctorCount > 0
                      ? `${hqName ? hqName : "No-HQ"}-${doctorCount}-Doctor-Plan`
                      : hqName;
                  return (
                    <div key={hqId} className="mt-2">

                      {/* HQ ACCORDION HEADER */}
                      <CommandItem
                        value={`hq-${hqId}`}
                        onSelect={() =>
                          setDoctorAccordionOpen((prev) => ({
                            ...prev,
                            [key]: !prev[key],
                          }))
                        }
                        className="mb-1 p-2 border rounded-md cursor-pointer font-medium"
                      >
                        <div className="flex justify-between w-full">
                          {title}

                          <ChevronDown
                            className={cn(
                              "h-4 w-4 transition",
                              isOpen && "rotate-180"
                            )}
                          />
                        </div>
                      </CommandItem>

                      {/* HQ BODY */}
                      {isOpen && (
                        <div className="ml-4">

                          {/* HQ EVENTS */}
                          {hqOnlyEvents.map(renderEventCard)}

                          {/* DOCTOR EVENTS INSIDE HQ */}
                          {doctorEvents.length > 0 && (
                            <div className="mt-2">
                              <p className="text-xs text-muted-foreground mb-1">
                                Doctor Tour Plans
                              </p>

                              {doctorEvents.map(renderEventCard)}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* NORMAL EVENTS */}
                {normalEvents.map(renderEventCard)}

              </CommandGroup>
            );
          })}

          <CommandEmpty>No results found.</CommandEmpty>

        </CommandList>
      </Command>
    </div>
  );
};