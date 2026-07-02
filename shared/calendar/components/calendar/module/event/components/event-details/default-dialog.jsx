"use client";
import { useEffect, useMemo, useState } from "react";
import { format, parseISO, isValid } from "date-fns";
import { Button } from "@calendar/components/ui/button";
import { TAG_FORM_CONFIG } from "@calendar/lib/calendar/form-config";
import { ScrollArea } from "@calendar/components/ui/scroll-area";
import { useCalendar } from "@calendar/components/calendar/contexts/calendar-context";
import { AddEditEventDialog } from "@calendar/components/calendar/dialogs/add-edit-event-dialog";
import { buildParticipantsWithDetails } from "@calendar/lib/helper";
import { resolveDisplayValueFromEvent } from "@calendar/lib/calendar/resolveDisplay";
import TiptapViewer from "@calendar/components/ui/TiptapViewer";
import { Video } from "lucide-react";
import { ICONS } from "@calendar/components/calendar/dialogs/event-details-dialog";
import DeleteEventDialog from "@calendar/components/calendar/dialogs/delete-event-dialog";
import { useDeleteEvent } from "@calendar/components/calendar/hooks";
import {
  DetailSummary,
  DetailItem,
  DetailGrid,
  DetailFooter,
} from "@calendar/components/calendar/dialogs/event-details/detail-ui";
import { fetchDocSharesByDocument } from "@calendar/components/calendar/module/event/services/docshare.service";
import { TAG_IDS } from "@calendar/components/calendar/constants";

function formatEventRange(event, use24HourFormat) {
  const start = event.startDate ? parseISO(event.startDate) : null;
  if (!start || !isValid(start)) return null;

  const end = event.endDate ? parseISO(event.endDate) : null;
  const dayFmt = "EEE, d MMM yyyy";
  const timeFmt = use24HourFormat ? "HH:mm" : "h:mm a";
  const sameDay =
    end && isValid(end) && format(start, "yyyy-MM-dd") === format(end, "yyyy-MM-dd");

  if (event.allDay) {
    return !end || sameDay
      ? format(start, dayFmt)
      : `${format(start, dayFmt)} → ${format(end, dayFmt)}`;
  }
  if (!end || !isValid(end)) return format(start, dayFmt);
  if (sameDay) {
    return `${format(start, dayFmt)} · ${format(start, timeFmt)} – ${format(
      end,
      timeFmt
    )}`;
  }
  return `${format(start, `${dayFmt}, ${timeFmt}`)} → ${format(
    end,
    `${dayFmt}, ${timeFmt}`
  )}`;
}

export function EventDefaultDialog({ event, setOpen }) {
  const {
    use24HourFormat,
    removeEvent,
    employeeOptions,
    doctorOptions,
    users,
  } =
    useCalendar();
  const { handleDelete } = useDeleteEvent({
    removeEvent,
    onClose: () => setOpen(false),
  });
  const tagConfig = TAG_FORM_CONFIG[event.tags] ?? TAG_FORM_CONFIG.DEFAULT;

  const canDelete = tagConfig.ui?.allowDelete?.(event) ?? true;
  const canEdit = tagConfig.ui?.allowEdit?.(event) ?? true;
  const isFailedSync = event?.__syncStatus === "failed";
  const editAction = tagConfig.ui?.primaryEditAction;

  const enrichedParticipants = useMemo(
    () =>
      buildParticipantsWithDetails(event.event_participants ?? [], {
        employeeOptions,
        doctorOptions,
      }),
    [event.event_participants, employeeOptions, doctorOptions]
  );

  const [sharedTo, setSharedTo] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function hydrateSharedTo() {
      if (
        event.tags !== TAG_IDS.HQ_TOUR_PLAN ||
        !event.erpName
      ) {
        setSharedTo("");
        return;
      }

      try {
        const shares = await fetchDocSharesByDocument("Event", event.erpName);
        if (cancelled) return;

        const ownerEmail = event.ownerEmail?.toLowerCase?.() ?? null;
        const sharedNames = shares
          .map((share) => share?.user?.name)
          .filter(Boolean)
          .filter((email) => email.toLowerCase() !== ownerEmail)
          .map((email) => {
            const matchedUser = users.find(
              (user) =>
                user.email?.toLowerCase() === email.toLowerCase()
            );
            const matchedEmployee = employeeOptions.find(
              (employee) =>
                employee.email?.toLowerCase() === email.toLowerCase()
            );

            return (
              matchedEmployee?.label ??
              matchedUser?.name ??
              matchedUser?.id ??
              email
            );
          });

        setSharedTo(
          Array.from(new Set(sharedNames)).join(", ")
        );
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to fetch HQ DocShares", error);
          setSharedTo("");
        }
      }
    }

    hydrateSharedTo();

    return () => {
      cancelled = true;
    };
  }, [event.erpName, event.ownerEmail, event.tags, employeeOptions, users]);

  const eventWithOptions = {
    ...event,
    participants: enrichedParticipants,
    sharedTo,
    _employeeOptions: employeeOptions,
    _doctorOptions: doctorOptions,
  };

  return (
    <>
      <ScrollArea className="max-h-[68vh]">
        <div className="space-y-5 p-1">
          <DetailSummary
            title={event.title || event.tags}
            subtitle={formatEventRange(event, use24HourFormat)}
            status={event.status}
          />
          {event.googleMeetLink ? (
            <a
              href={event.googleMeetLink}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-[13px] font-semibold text-white transition hover:bg-primary/90"
            >
              <Video className="size-4" />
              Join Google Meet
            </a>
          ) : null}
          <EventDetailsFields
            event={eventWithOptions}
            config={tagConfig}
            use24HourFormat={use24HourFormat}
            skipKeys={["startDate", "endDate"]}
          />
        </div>
      </ScrollArea>

      <DetailFooter>
        {(canEdit || isFailedSync) && (
          <AddEditEventDialog event={event} forceValues={editAction?.setOnEdit}>
            <Button variant="outline" className="w-full sm:w-auto">
              {editAction?.label ?? "Edit"}
            </Button>
          </AddEditEventDialog>
        )}

        {(canDelete || isFailedSync) && (
          <DeleteEventDialog
            className="w-full sm:w-auto"
            onConfirm={() => handleDelete(event.erpName, undefined, event)}
          />
        )}
      </DetailFooter>
    </>
  );
}

export function EventDetailsFields({
  event,
  config,
  use24HourFormat,
  skipKeys = [],
}) {
  if (!config?.details?.fields) return null;

  const fields = config.details.fields.filter(
    (field) => !skipKeys.includes(field.key)
  );
  const descriptionField = fields.find((field) => field.key === "description");
  const gridFields = fields.filter((field) => field.key !== "description");

  return (
    <div className="space-y-5">
      <DetailGrid>
        {gridFields.map((field) => {
          const Icon = ICONS[field.type] ?? ICONS["text"];
          const value = resolveDisplayValueFromEvent({
            event,
            field,
            use24HourFormat,
          });
          if (!value) return null;
          return (
            <DetailItem key={field.key} icon={Icon} label={field.label}>
              {value}
            </DetailItem>
          );
        })}
      </DetailGrid>

      {descriptionField && event.description ? (
        <DetailItem icon={ICONS["text"]} label={descriptionField.label}>
          <div className="prose prose-sm dark:prose-invert max-w-none text-foreground">
            <TiptapViewer content={event.description} />
          </div>
        </DetailItem>
      ) : null}
    </div>
  );
}
