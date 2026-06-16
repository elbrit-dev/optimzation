"use client";

import {
  format,
  parseISO,
  startOfDay,
  endOfDay,
  isWithinInterval,
} from "date-fns";

import { useMemo, useRef, useState } from "react";
import { cn } from "@calendar/lib/utils";
import { useCalendar } from "@calendar/components/calendar/contexts/calendar-context";

import {
  getBgColor,
  getColorClass,
  getFirstLetters,
  toCapitalize,
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
import { navigateDate } from "@calendar/components/calendar/helpers";
import { ChevronDown } from "lucide-react";
import FilterEvents from "@calendar/components/calendar/header/filter";

const PULL_THRESHOLD = 70;
const SWIPE_THRESHOLD = 70;

export const AgendaEventsMobile = () => {
  const {
    events,
    badgeVariant,
    agendaModeGroupBy,
    setMobileLayer,
    setView,
    selectedDate,
    setSelectedDate,
    showOnlyApprovedLeaves,showOnlyTodoList
  } = useCalendar();

  const scrollRef = useRef(null);
  const startY = useRef(0);
  const startX = useRef(0);

  const pulling = useRef(false);
  const swiping = useRef(false);

  const [isAtTop, setIsAtTop] = useState(true);
  const [accordionOpen, setAccordionOpen] = useState({});

  /* ===============================
     TOUCH LOGIC (UNCHANGED)
  =============================== */

  const handleScroll = () => {
    if (!scrollRef.current) return;
    setIsAtTop(scrollRef.current.scrollTop === 0);
  };

  const onTouchStartCapture = (e) => {
    startY.current = e.touches[0].clientY;
    startX.current = e.touches[0].clientX;
    pulling.current = false;
    swiping.current = false;
  };

  const onTouchMoveCapture = (e) => {
    const deltaY = e.touches[0].clientY - startY.current;
    const deltaX = e.touches[0].clientX - startX.current;

    if (isAtTop && deltaY > 10) pulling.current = true;
    if (Math.abs(deltaX) > 10) swiping.current = true;
  };

  const onTouchEndCapture = (e) => {
    const deltaY = e.changedTouches[0].clientY - startY.current;
    const deltaX = e.changedTouches[0].clientX - startX.current;

    if (isAtTop && pulling.current && deltaY > PULL_THRESHOLD) {
      setMobileLayer("week");
      setView("week");
      return;
    }

    if (Math.abs(deltaX) > SWIPE_THRESHOLD) {
      const direction = deltaX < 0 ? "next" : "previous";

      setSelectedDate((prev) =>
        navigateDate(prev, "month", direction)
      );
    }
  };

  /* ===============================
     RANGE FILTER (FIXED)
  =============================== */


  const filteredEvents = useMemo(() => {
    const startOfCurrentMonth = new Date(
      selectedDate.getFullYear(),
      selectedDate.getMonth(),
      1
    );
    
    const endOfCurrentMonth = new Date(
      selectedDate.getFullYear(),
      selectedDate.getMonth() + 1,
      0
    );
    
    let data = events.filter((event) => {
      const start = parseISO(event.startDate);
      const end = parseISO(event.endDate || event.startDate);
    
      return (
        isWithinInterval(start, {
          start: startOfCurrentMonth,
          end: endOfCurrentMonth,
        }) ||
        isWithinInterval(end, {
          start: startOfCurrentMonth,
          end: endOfCurrentMonth,
        }) ||
        isWithinInterval(startOfCurrentMonth, {
          start,
          end,
        })
      );
    });

    if (showOnlyApprovedLeaves) {
      return data.filter(
        (event) =>
          event.tags === TAG_IDS.LEAVE 
      );
    }
    if (showOnlyTodoList) {
      return data.filter(
        (event) => event.tags === TAG_IDS.TODO_LIST
      );
    }
    return data;
  }, [events, selectedDate, showOnlyApprovedLeaves,showOnlyTodoList]);

  /* ===============================
     GROUP BY DATE (FIXED)
  =============================== */

  const getEventDisplayDate = (event) => {
    const start = parseISO(event.startDate);
    const end = parseISO(event.endDate || event.startDate);

    if (
      isWithinInterval(selectedDate, {
        start: startOfDay(start),
        end: endOfDay(end),
      })
    ) {
      return format(selectedDate, "yyyy-MM-dd");
    }

    return format(start, "yyyy-MM-dd");
  };

  const agendaEvents = useMemo(() => {
    return Object.groupBy(filteredEvents, (event) =>
      agendaModeGroupBy === "date"
        ? getEventDisplayDate(event)
        : event.color
    );
  }, [filteredEvents, agendaModeGroupBy, selectedDate]);

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
          <div className="flex gap-2 items-center w-full">
            {badgeVariant === "dot" ? (
              <EventBullet color={event.color} />
            ) : (
              <Avatar>
                <AvatarFallback className={getBgColor(event.color)}>
                  {getFirstLetters(event.title)}
                </AvatarFallback>
              </Avatar>
            )}

            <div className="w-full">
              <div className="flex items-center gap-2">
                {TagIcon && (
                  <TagIcon className="w-4 h-4 text-muted-foreground" />
                )}
                <p className="font-medium text-sm">{event.title}</p>
              </div>

              <p className="text-xs text-muted-foreground">
                {event.owner?.name}
              </p>
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
      onTouchStartCapture={onTouchStartCapture}
      onTouchMoveCapture={onTouchMoveCapture}
      onTouchEndCapture={onTouchEndCapture}
    >
      <Command
        ref={scrollRef}
        onScroll={handleScroll}
        className="overflow-y-scroll py-4 h-[80vh] bg-transparent"
      >
        <div className="mb-4 mx-4 flex justify-between items-center">
          <CommandInput placeholder="Search..." />
          <FilterEvents variant={true}/>
        </div>

        <CommandList className="px-2 border-t max-h-none overflow-visible">

          {groupedAndSortedEvents.map(([groupKey, groupedEvents]) => {

            const hqEvents = groupedEvents.filter(
              (e) =>
                e.tags === TAG_IDS.HQ_TOUR_PLAN ||
                e.tags === TAG_IDS.DOCTOR_VISIT_PLAN
            );

            const normalEvents = groupedEvents.filter(
              (e) =>
                e.tags !== TAG_IDS.HQ_TOUR_PLAN &&
                e.tags !== TAG_IDS.DOCTOR_VISIT_PLAN
            );

            /* ✅ Inject HQ */
            const enhancedHQEvents = [...hqEvents];

            groupedEvents.forEach((event) => {
              if (event.tags === TAG_IDS.DOCTOR_VISIT_PLAN) {
                const hqId = event.hqTerritory;

                const exists = enhancedHQEvents.some(
                  (e) =>
                    e.tags === TAG_IDS.HQ_TOUR_PLAN &&
                    e.hqTerritory === hqId
                );

                if (!exists) {
                  const hqEvent = events.find(
                    (e) =>
                      e.tags === TAG_IDS.HQ_TOUR_PLAN &&
                      e.hqTerritory === hqId
                  );

                  if (hqEvent) enhancedHQEvents.push(hqEvent);
                }
              }
            });

            const groupedByHQ = Object.groupBy(
              enhancedHQEvents,
              (e) => e.hqTerritory
            );

            return (
              <CommandGroup
                key={groupKey}
                heading={format(parseISO(groupKey), "EEEE, MMM d")}
              >

                {Object.entries(groupedByHQ).map(([hqId, events]) => {
                  const hqOnly = events.filter(
                    (e) => e.tags === TAG_IDS.HQ_TOUR_PLAN
                  );

                  const doctor = events.filter(
                    (e) => e.tags === TAG_IDS.DOCTOR_VISIT_PLAN
                  );

                  const key = `${groupKey}-${hqId}`;
                  const isOpen = accordionOpen[key];

                  const name = hqOnly[0]?.hqName || hqId;
                  const title =
                    doctor.length > 0
                      ? `${name?name:"No-HQ"}-${doctor.length}-Doctor-Plan`
                      : name;

                  return (
                    <div key={hqId}>
                      <CommandItem
                        onSelect={() =>
                          setAccordionOpen((p) => ({
                            ...p,
                            [key]: !p[key],
                          }))
                        }
                        className="border rounded-md p-2 mb-2"
                      >
                        <div className="flex justify-between w-full">
                          {title}
                          <ChevronDown
                            className={cn(
                              isOpen && "rotate-180"
                            )}
                          />
                        </div>
                      </CommandItem>

                      {isOpen && (
                        <div className="ml-4">
                          {hqOnly.map(renderEventCard)}
                          {doctor.map(renderEventCard)}
                        </div>
                      )}
                    </div>
                  );
                })}

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