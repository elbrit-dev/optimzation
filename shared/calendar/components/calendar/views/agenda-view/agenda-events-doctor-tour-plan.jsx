"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@calendar/lib/utils";
import { CommandItem } from "@calendar/components/ui/command";
import { EventDetailsDialog } from "@calendar/components/calendar/dialogs/event-details-dialog";
import { Avatar, AvatarFallback } from "@calendar/components/ui/avatar";
import { EventBullet } from "@calendar/components/calendar/views/month-view/event-bullet";
import {
  getBgColor,
  getFirstLetters,
  getColorClass
} from "@calendar/components/calendar/helpers";
import { ICON_MAP } from "../../mobile/MobileAddEventBar";

export function AgendaEventsDoctorTourPlan({ events }) {
  const [open, setOpen] = useState(false);

  if (!events?.length) return null;

  return (
    <>
      {/* Accordion Header */}
      <CommandItem
        value="doctor-tour-group"
        onSelect={() => setOpen((prev) => !prev)}
        className="mb-2 p-2 border rounded-md cursor-pointer"
      >
        <div className="flex justify-between items-center w-full">
          <span className="font-medium">
            {events.length} Doctor Tour Plan Events
          </span>

          <ChevronDown
            className={cn(
              "h-4 w-4 transition-transform",
              open && "rotate-180"
            )}
          />
        </div>
      </CommandItem>

      {/* Accordion Body */}
      {open &&
        events.map((event) => {
          const TagIcon = ICON_MAP[event.tags];

          return (
            <CommandItem
              key={event.id}
              value={event.id}
              className={cn(
                "mb-2 p-2 border rounded-md ml-6",
                getColorClass(event.color)
              )}
            >
              <EventDetailsDialog event={event}>
                <div className="flex justify-between gap-2 w-full">
                  <div className="flex gap-2 items-center w-full">

                    {/* Avatar / Bullet */}
                    <Avatar>
                      <AvatarFallback
                        className={getBgColor(event.color)}
                      >
                        {getFirstLetters(event.title)}
                      </AvatarFallback>
                    </Avatar>

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
        })}
    </>
  );
}