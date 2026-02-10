import { format, isSameDay } from "date-fns";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
} from "@calendar/components/ui/responsive-modal";
import { cn } from "@calendar/lib/utils";
import { useCalendar } from "@calendar/components/calendar/contexts/calendar-context";
import { formatTime } from "@calendar/components/calendar/helpers";
import { dayCellVariants } from "@calendar/components/calendar/views/month-view/day-cell";
import { EventBullet } from "@calendar/components/calendar/views/month-view/event-bullet";
import { EventDetailsDialog } from "@calendar/components/calendar/dialogs/event-details-dialog";
import MobileAddEventBar from "../mobile/MobileAddEventBar";

export function EventListDialog({ maxVisibleEvents = 10 }) {
  const {
    events,
    eventListDate,
    setEventListDate,
    badgeVariant,
    use24HourFormat,
  } = useCalendar();

  const isOpen = Boolean(eventListDate);

  if (!isOpen) return null;

  const cellEvents = events.filter((event) =>
    isSameDay(new Date(event.startDate), eventListDate)
  );

  return (
    <Modal
      modal={false}
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) setEventListDate(null);
      }}
    >
      <ModalContent className="sm:max-w-[425px]">
        <ModalHeader>
          <ModalTitle className="my-2">
            <div className="flex items-center gap-1">
              <EventBullet color={cellEvents[0]?.color} />
              <p className="text-sm font-medium">
                Events on {format(eventListDate, "EEEE, MMMM d, yyyy")}
              </p>
            </div>
          </ModalTitle>
        </ModalHeader>

        <div className="max-h-[55vh] overflow-y-auto space-y-2 pb-24">
          {cellEvents.length > 0 ? (
            cellEvents.map((event) => (
              <EventDetailsDialog event={event} key={event.id}>
                <div
                  className={cn(
                    "flex items-center gap-1 p-1 border rounded-md hover:bg-muted cursor-pointer",
                    {
                      [dayCellVariants({ color: event.color })]:
                        badgeVariant === "colored",
                    }
                  )}
                >
                  <EventBullet color={event.color} />
                  <div className="flex justify-between items-center w-full">
                    <p className="text-sm font-medium">{event.title}</p>
                    <p className="text-xs">
                      {formatTime(event.startDate, use24HourFormat)}
                    </p>
                  </div>
                </div>
              </EventDetailsDialog>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              No events for this date.
            </p>
          )}

          <MobileAddEventBar date={eventListDate} />
        </div>
      </ModalContent>
    </Modal>
  );
}
