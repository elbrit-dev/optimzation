"use client";
import { useState, useMemo, cloneElement, isValidElement } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@calendar/components/ui/dialog";
import { useCalendar } from "@calendar/components/calendar/contexts/calendar-context";
import { TAG_IDS } from "@calendar/components/calendar/constants"
import { buildParticipantsWithDetails } from "@calendar/lib/helper";
import { EventLeaveDialog } from "@calendar/components/calendar/module/leave/components/leave-dialog";
import { Calendar, Clock, Share2, Text, User } from "lucide-react";
import { EventDefaultDialog } from "@calendar/components/calendar/module/event/components/event-details/default-dialog";
import { EventDoctorVisitDialog } from "@calendar/components/calendar/module/event/components/event-details/doctor-visit-dialog";
import { EventTodoDialog } from "@calendar/components/calendar/module/todo/components/todo-dialog";
import { ErrorBoundary } from "@calendar/components/ui/error-boundary";
import { Button } from "@calendar/components/ui/button";
import { EventShareDialog } from "@calendar/components/calendar/dialogs/share-event-dialog";
import {
  SyncErrorMessage,
  SyncStatusBadge,
} from "@calendar/components/calendar/sync/sync-status-badge";

export const ICONS = {
  owner: User,
  date: Calendar,
  datetime: Clock,
  text: Text,
};

export const EVENT_DETAILS_LAYOUTS = {
  [TAG_IDS.LEAVE]: EventLeaveDialog,
  [TAG_IDS.DOCTOR_VISIT_PLAN]: EventDoctorVisitDialog,
  [TAG_IDS.TODO_LIST]: EventTodoDialog,
};
export const getEventDetailsLayout = (tag) =>
  EVENT_DETAILS_LAYOUTS[tag] ?? EventDefaultDialog;

export function EventDetailsDialog({ event, children }) {
  const [open, setOpen] = useState(false);
  const { employeeOptions, doctorOptions } = useCalendar();

  const enrichedParticipants = useMemo(() => {
    return buildParticipantsWithDetails(
      event.event_participants ?? [],
      { employeeOptions, doctorOptions }
    );
  }, [event.event_participants, employeeOptions, doctorOptions]);

  const eventWithOptions = {
    ...event,
    participants: enrichedParticipants,
    _employeeOptions: employeeOptions,
    _doctorOptions: doctorOptions,
  };

  const LayoutComponent = getEventDetailsLayout(event.tags);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isValidElement(children)
          ? cloneElement(children, {
            open,
            setOpen,
          })
          : children}
      </DialogTrigger>

      <DialogContent className="max-h-[88vh] overflow-y-auto w-[calc(100vw-1.5rem)] sm:w-full">
        <DialogHeader className="pr-4">
          <div className="flex min-w-0 items-center gap-1.5">
            <DialogTitle className="min-w-0 flex-1 break-words text-left">
              {event.tags == TAG_IDS.TODO_LIST ? event.title : event.tags}
            </DialogTitle>
            <EventShareDialog event={eventWithOptions}>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 shrink-0 rounded-full p-0"
                aria-label="Share event"
              >
                <Share2 className="size-4" />
              </Button>
            </EventShareDialog>
          </div>
        </DialogHeader>

        <div className="space-y-2">
          <SyncStatusBadge event={eventWithOptions} />
          <SyncErrorMessage event={eventWithOptions} />
        </div>

        <ErrorBoundary>
          <LayoutComponent
            event={eventWithOptions}
            open={open}
            setOpen={setOpen}
          />
        </ErrorBoundary>
      </DialogContent>
    </Dialog>
  );
}
