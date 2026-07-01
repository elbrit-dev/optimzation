"use client";;
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
import { Calendar, Clock, Text, User } from "lucide-react";
import { EventDefaultDialog } from "@calendar/components/calendar/module/event/components/event-details/default-dialog";
import { EventDoctorVisitDialog } from "@calendar/components/calendar/module/event/components/event-details/doctor-visit-dialog";
import { EventTodoDialog } from "@calendar/components/calendar/module/todo/components/todo-dialog";
import { ErrorBoundary } from "@calendar/components/ui/error-boundary";
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
  [TAG_IDS.TODO_LIST]:EventTodoDialog,
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
        <DialogHeader>
          <DialogTitle className="pr-6 break-words">
            {event.tags == TAG_IDS.TODO_LIST ? event.title:event.tags}
          </DialogTitle>
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
