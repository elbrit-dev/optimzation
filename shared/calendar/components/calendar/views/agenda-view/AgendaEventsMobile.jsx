"use client";

import { format, parseISO } from "date-fns";
import { useMemo, useRef, useState } from "react";
import { cn } from "@calendar/lib/utils";
import { useCalendar } from "@calendar/components/calendar/contexts/calendar-context";
import {
  formatTime,
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
const PULL_THRESHOLD = 70;

export const AgendaEventsMobile = () => {
  const {
    events,
    use24HourFormat,
    badgeVariant,
    agendaModeGroupBy,
    setMobileLayer,
    setView, selectedDate
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
  const monthEvents = useMemo(() => {
    return getEventsForMonth(events, selectedDate);
  }, [events, selectedDate]);
  const agendaEvents = useMemo(() => {
    return Object.groupBy(monthEvents, (event) =>
      agendaModeGroupBy === "date"
        ? format(parseISO(event.startDate), "yyyy-MM-dd")
        : event.color
    );
  }, [monthEvents, agendaModeGroupBy]);

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
              {groupedEvents.map((event) => {
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
                              {event.tags === TAG_IDS.TODO_LIST ? (
                                <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                                  <p className="font-medium text-sm">{event.title ? event.title :event.tags}
                                  </p>
                                  {event.priority && (
                                    <p
                                      className={`text-sm font-medium ${getPriorityClass(
                                        event.priority
                                      )}`}
                                    >
                                      {event.priority ?? "-"}
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <p className="font-medium text-sm">{event.tags}
                                </p>
                              )}
                              {/* <p className="font-medium text-sm">
                                {event.tags}
                              </p> */}
                            </div>
                            <p className="text-xs text-muted-foreground line-clamp-1">
                              {event.owner?.name}
                            </p>
                          </div>
                        </div>
                        <div className="text-xs flex items-center">
                          {event.tags === TAG_IDS.TODO_LIST ? (
                            <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                              {event.status && (
                                <span
                                  className={`text-white text-xs px-3 py-1 rounded-md ${getStatusBadgeClass(
                                    event.status
                                  )}`}
                                >
                                  {event.status}
                                </span>
                              )}
                            </div>
                          ) : null}
                          {/* {formatTime(event.startDate, use24HourFormat)} –{" "}
                        {formatTime(event.endDate, use24HourFormat)} */}
                        </div>
                      </div>
                    </EventDetailsDialog>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          ))}

          <CommandEmpty>No results found.</CommandEmpty>
        </CommandList>
      </Command>
    </div>
  );
};
