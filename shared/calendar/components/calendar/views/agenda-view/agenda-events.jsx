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

import { ICON_MAP } from "../../mobile/MobileAddEventBar";
import { TAG_IDS } from "../../constants";

const SWIPE_THRESHOLD = 60;

export const AgendaEvents = ({ scope = "all" }) => {
  const {
    events,
    badgeVariant,
    agendaModeGroupBy,
    selectedDate,
    setSelectedDate,
    activeDate,
    setActiveDate,
    mobileLayer,
    view,
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

  const scopedEvents = useMemo(() => {
    if (scope === "day") {
      return events.filter((event) =>
        isWithinInterval(parseISO(event.startDate), {
          start: startOfDay(selectedDate),
          end: endOfDay(selectedDate),
        })
      );
    }

    if (scope === "week") {
      return events.filter((event) =>
        isWithinInterval(parseISO(event.startDate), {
          start: startOfWeek(selectedDate),
          end: endOfWeek(selectedDate),
        })
      );
    }

    return getEventsForMonth(events, selectedDate);
  }, [events, selectedDate, scope]);

  /* ===============================
     GROUP EVENTS
  =============================== */

  const agendaEvents = Object.groupBy(scopedEvents, (event) =>
    agendaModeGroupBy === "date"
      ? format(parseISO(event.startDate), "yyyy-MM-dd")
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

            const doctorEvents = groupedEvents.filter(
              (event) => event.tags === TAG_IDS.DOCTOR_VISIT_PLAN
            );

            const normalEvents = groupedEvents.filter(
              (event) => event.tags !== TAG_IDS.DOCTOR_VISIT_PLAN
            );

            const isOpen = doctorAccordionOpen[groupKey];

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
    {doctorEvents.length > 0 && (
                  <>
                    <CommandItem
                      value={`doctor-${groupKey}`}
                      onSelect={() =>
                        setDoctorAccordionOpen((prev) => ({
                          ...prev,
                          [groupKey]: !prev[groupKey],
                        }))
                      }
                      className="mb-1 p-2 border rounded-md cursor-pointer font-medium mt-2"
                    >
                      <div className="flex justify-between w-full">
                        {doctorEvents.length} Doctor Visit Plan Events

                        <ChevronDown
                          className={cn(
                            "h-4 w-4 transition",
                            isOpen && "rotate-180"
                          )}
                        />
                      </div>
                    </CommandItem>

                    {isOpen && doctorEvents.map(renderEventCard)}
                  </>
                )}

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