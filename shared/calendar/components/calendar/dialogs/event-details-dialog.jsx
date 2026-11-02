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
import { EventMeetingDialog } from "@calendar/components/calendar/module/event/components/event-details/meeting-dialog";
import { EventTodoDialog } from "@calendar/components/calendar/module/todo/components/todo-dialog";
import { Drawer } from "@/design-system";
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
  [TAG_IDS.MEETING]: EventMeetingDialog,
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

      {/* Shaped like the design system's Sheet: the panel itself never scrolls,
          the body is the drawer's Content. On a phone a drag on a scrolling
          PANEL moves the sheet instead of the content, so the footer
          (Approve / Reject) was left below the edge with no way to reach it. */}
      <DialogContent className="flex max-h-[85dvh] flex-col gap-0 overflow-hidden p-0 py-0 md:p-0">
        <DialogHeader className="shrink-0 px-3 pb-4 pt-6 md:px-6">
          <div className="flex min-w-0 items-center gap-1.5 pr-4">
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

        <Drawer.Content className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-3 md:px-6">
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
        </Drawer.Content>
      </DialogContent>
    </Dialog>
  );
}
