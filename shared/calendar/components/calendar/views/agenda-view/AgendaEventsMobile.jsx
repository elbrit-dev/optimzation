"use client";

import { format, parseISO } from "date-fns";
import { useMemo, useRef, useState } from "react";
import { cn } from "@calendar/lib/utils";
import { useCalendar } from "@calendar/components/calendar/contexts/calendar-context";
import {
  getBgColor,
  getColorClass,
  getEventsForMonth,
  getFirstLetters,
  getPriorityClass,
  getStatusBadgeClass,
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

import { TAG_IDS } from "../../constants";
import { ICON_MAP } from "../../mobile/MobileAddEventBar";
import { navigateDate } from "@calendar/components/calendar/helpers";
import { ChevronDown } from "lucide-react";

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
  } = useCalendar();

  const scrollRef = useRef(null);
  const startY = useRef(0);
  const startX = useRef(0);

  const pulling = useRef(false);
  const swiping = useRef(false);

  const [isAtTop, setIsAtTop] = useState(true);
  const [doctorAccordionOpen, setDoctorAccordionOpen] = useState(false);

  /* ===============================
     SCROLL
  =============================== */

  const handleScroll = () => {
    if (!scrollRef.current) return;
    setIsAtTop(scrollRef.current.scrollTop === 0);
  };

  /* ===============================
     TOUCH START
  =============================== */

  const onTouchStartCapture = (e) => {
    startY.current = e.touches[0].clientY;
    startX.current = e.touches[0].clientX;

    pulling.current = false;
    swiping.current = false;
  };

  /* ===============================
     TOUCH MOVE
  =============================== */

  const onTouchMoveCapture = (e) => {
    const deltaY = e.touches[0].clientY - startY.current;
    const deltaX = e.touches[0].clientX - startX.current;

    if (isAtTop && deltaY > 10) pulling.current = true;
    if (Math.abs(deltaX) > 10) swiping.current = true;
  };

  /* ===============================
     TOUCH END
  =============================== */

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
     MONTH EVENTS
  =============================== */

  const monthEvents = useMemo(() => {
    return getEventsForMonth(events, selectedDate);
  }, [events, selectedDate]);

  /* ===============================
     SPLIT EVENTS
  =============================== */

  const doctorTourEvents = useMemo(() => {
    return monthEvents.filter(
      (event) => event.tags === TAG_IDS.DOCTOR_VISIT_PLAN
    );
  }, [monthEvents]);

  const normalEvents = useMemo(() => {
    return monthEvents.filter(
      (event) => event.tags !== TAG_IDS.DOCTOR_VISIT_PLAN
    );
  }, [monthEvents]);

  /* ===============================
     GROUP NORMAL EVENTS
  =============================== */

  const agendaEvents = useMemo(() => {
    return Object.groupBy(normalEvents, (event) =>
      agendaModeGroupBy === "date"
        ? format(parseISO(event.startDate), "yyyy-MM-dd")
        : event.color
    );
  }, [normalEvents, agendaModeGroupBy]);

  const groupedAndSortedEvents = useMemo(() => {
    return Object.entries(agendaEvents).sort(
      (a, b) => new Date(a[0]) - new Date(b[0])
    );
  }, [agendaEvents]);

  /* ===============================
     GROUP DOCTOR EVENTS
  =============================== */

  const doctorGroups = useMemo(() => {
    return Object.entries(
      Object.groupBy(doctorTourEvents, (event) =>
        format(parseISO(event.startDate), "yyyy-MM-dd")
      )
    ).sort((a, b) => new Date(a[0]) - new Date(b[0]));
  }, [doctorTourEvents]);

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

                <p className="text-xs text-muted-foreground line-clamp-1">
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
      className="[&::-webkit-scrollbar]:hidden"
      onTouchStartCapture={onTouchStartCapture}
      onTouchMoveCapture={onTouchMoveCapture}
      onTouchEndCapture={onTouchEndCapture}
    >
      <Command
        ref={scrollRef}
        onScroll={handleScroll}
        className="overflow-y-scroll py-4 h-[80vh] bg-transparent"
      >
        <div className="mb-4 mx-4">
          <CommandInput placeholder="Type a command or search..." />
        </div>

        <CommandList className="px-2 border-t max-h-none overflow-visible">

          {/* Doctor Visit Plan Accordion */}

          {doctorTourEvents.length > 0 && (
            <>
              <CommandItem
                value="doctor-visit-plan"
                onSelect={() =>
                  setDoctorAccordionOpen((p) => !p)
                }
                className="mb-2 p-2 border rounded-md cursor-pointer font-medium mt-2"
              >
                <div className="flex justify-between w-full">
                  {doctorTourEvents.length} Doctor Visit Plan Events
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 transition",
                      doctorAccordionOpen && "rotate-180"
                    )}
                  />
                </div>
              </CommandItem>

              {doctorAccordionOpen &&
                doctorGroups.map(([date, events]) => (
                  <CommandGroup
                    key={date}
                    heading={format(
                      parseISO(date),
                      "EEEE, MMMM d, yyyy"
                    )}
                  >
                    {events.map(renderEventCard)}
                  </CommandGroup>
                ))}
            </>
          )}

          {/* NORMAL EVENTS */}

          {groupedAndSortedEvents.map(([groupKey, groupedEvents]) => (
            <CommandGroup
              key={groupKey}
              heading={
                agendaModeGroupBy === "date"
                  ? format(
                      parseISO(groupKey),
                      "EEEE, MMMM d, yyyy"
                    )
                  : toCapitalize(groupedEvents[0].color)
              }
            >
              {groupedEvents.map(renderEventCard)}
            </CommandGroup>
          ))}

          <CommandEmpty>No results found.</CommandEmpty>
        </CommandList>
      </Command>
    </div>
  );
};