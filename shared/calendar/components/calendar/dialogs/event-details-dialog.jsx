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
import { EventLeaveDialog } from "./event-details/leave-dialog";
import { EventDefaultDialog } from "./event-details/default-dialog";
import { Calendar, Clock, Text, User } from "lucide-react";
import { EventDoctorVisitDialog } from "./event-details/doctor-visit-dialog";

export const ICONS = {
	owner: User,
	date: Calendar,
	datetime: Clock,
	text: Text,
  };

export const EVENT_DETAILS_LAYOUTS = {
	[TAG_IDS.LEAVE]: EventLeaveDialog,
	[TAG_IDS.DOCTOR_VISIT_PLAN]: EventDoctorVisitDialog,
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

      <DialogContent>
        <DialogHeader>
          <DialogTitle>{event.tags}</DialogTitle>
        </DialogHeader>

        <LayoutComponent
          event={eventWithOptions}
          open={open}
          setOpen={setOpen}
        />
      </DialogContent>
    </Dialog>
  );
}
