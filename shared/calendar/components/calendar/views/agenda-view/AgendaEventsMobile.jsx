"use client";

import { format, parseISO } from "date-fns";
import { useMemo, useRef, useState } from "react";
import { cn } from "@calendar/lib/utils";
import { useCalendar } from "@calendar/components/calendar/contexts/calendar-context";
import {
  formatTime,
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

const PULL_THRESHOLD = 70;

export const AgendaEventsMobile = () => {
  const {
    events,
    use24HourFormat,
    badgeVariant,
    agendaModeGroupBy,
    setMobileLayer,
    setView,
  } = useCalendar();

  const scrollRef = useRef(null);
  const startY = useRef(0);
  const pulling = useRef(false);
  const [isAtTop, setIsAtTop] = useState(true);

  /* ===============================
     SCROLL TRACKING
  =============================== */
  const handleScroll = () => {
    if (!scrollRef.current) return;
    setIsAtTop(scrollRef.current.scrollTop === 0);
  };

  /* ===============================
     TOUCH CAPTURE (CRITICAL)
  =============================== */
  const onTouchStartCapture = (e) => {
    if (!isAtTop) return;
    startY.current = e.touches[0].clientY;
    pulling.current = false;
  };

  const onTouchMoveCapture = (e) => {
    if (!isAtTop) return;
    const deltaY = e.touches[0].clientY - startY.current;
    if (deltaY > 10) pulling.current = true;
  };

  const onTouchEndCapture = (e) => {
    if (!isAtTop || !pulling.current) return;

    const deltaY =
      e.changedTouches[0].clientY - startY.current;

    if (deltaY < PULL_THRESHOLD) return;

    // ✅ SWITCH TO WEEK
    setMobileLayer("week");
    setView("week");
  };

  /* ===============================
     GROUP EVENTS
  =============================== */
  const agendaEvents = useMemo(() => {
    return Object.groupBy(events, (event) =>
      agendaModeGroupBy === "date"
        ? format(parseISO(event.startDate), "yyyy-MM-dd")
        : event.color
    );
  }, [events, agendaModeGroupBy]);

  const groupedAndSortedEvents = useMemo(() => {
    return Object.entries(agendaEvents).sort(
      (a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime()
    );
  }, [agendaEvents]);

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
          {groupedAndSortedEvents.map(([groupKey, groupedEvents]) => (
            <CommandGroup
              key={groupKey}
              heading={
                agendaModeGroupBy === "date"
                  ? format(parseISO(groupKey), "EEEE, MMMM d, yyyy")
                  : toCapitalize(groupedEvents[0].color)
              }
            >
              {groupedEvents.map((event) => (
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
                      <div className="flex gap-2 items-center">
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
                          <p className="font-medium text-sm">{event.title}
                          </p>
                          {/* <p className="text-xs text-muted-foreground line-clamp-1">
                            {event.description}
                          </p> */}
                          <p className="text-xs text-muted-foreground line-clamp-1">
                            {event.owner?.name}
                          </p>
                        </div>
                      </div>
                      <div className="text-xs flex items-center">
                        {formatTime(event.startDate, use24HourFormat)} –{" "}
                        {formatTime(event.endDate, use24HourFormat)}
                      </div>
                    </div>
                  </EventDetailsDialog>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}

          <CommandEmpty>No results found.</CommandEmpty>
        </CommandList>
      </Command>
    </div>
  );
};
