"use client";
import { useEffect, useMemo, useState } from "react";
import { format, parseISO, isValid } from "date-fns";
import { Crown, Eye, MapPin, Text, UserCog, Users, Video } from "lucide-react";
import { Button } from "@calendar/components/ui/button";
import { TAG_FORM_CONFIG } from "@calendar/lib/calendar/form-config";
import { ScrollArea } from "@calendar/components/ui/scroll-area";
import { useCalendar } from "@calendar/components/calendar/contexts/calendar-context";
import { AddEditEventDialog } from "@calendar/components/calendar/dialogs/add-edit-event-dialog";
import { buildParticipantsWithDetails } from "@calendar/lib/helper";
import { useDeleteEvent } from "@calendar/components/calendar/hooks";
import DeleteEventDialog from "@calendar/components/calendar/dialogs/delete-event-dialog";
import TiptapViewer from "@calendar/components/ui/TiptapViewer";
import { toast } from "sonner";
import { saveEvent } from "@calendar/components/calendar/module/event/services/event.service";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@calendar/components/ui/select";
import {
  DetailSummary,
  DetailItem,
  DetailGrid,
  DetailFooter,
} from "@calendar/components/calendar/dialogs/event-details/detail-ui";
import { SharedToBlock } from "@calendar/components/calendar/dialogs/share-event-dialog";
import {
  resolveMeetingRoles,
  roleCodeFromProfile,
} from "@calendar/lib/meetingRoles";

/**
 * EventMeetingDialog — the meeting detail view, rendered differently for the
 * three people who look at it (see @calendar/lib/meetingRoles):
 *   - creator     : the BE who set it up → accent + "you created this", can edit/delete.
 *   - host        : the ABM/RBM conducting it → accent + "you're conducting", can edit.
 *   - participant : any other attendee → read-only, sees who conducts + who created.
 * Everyone can always see who is conducting and who created it.
 */

const ROLE_META = {
  creator: {
    label: "You created this",
    Icon: UserCog,
    accent: "bg-indigo-500",
    chip: "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200",
  },
  host: {
    label: "You're conducting",
    Icon: Crown,
    accent: "bg-amber-500",
    chip: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  },
  participant: {
    label: "You're attending",
    Icon: Users,
    accent: "bg-slate-500",
    chip: "bg-slate-100 text-slate-700 ring-1 ring-slate-200",
  },
  viewer: {
    label: "Shared with you",
    Icon: Eye,
    accent: "bg-slate-400",
    chip: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
  },
};

function formatRange(event, use24HourFormat) {
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
    return `${format(start, dayFmt)} · ${format(start, timeFmt)} – ${format(end, timeFmt)}`;
  }
  return `${format(start, `${dayFmt}, ${timeFmt}`)} → ${format(end, `${dayFmt}, ${timeFmt}`)}`;
}

/** Attendee list; the derived host is flagged with a crown. */
function TeamRoster({ participants, hostId }) {
  if (!participants.length) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <div className="flex flex-col gap-1.5">
      {participants.map((p) => {
        const isHost = hostId != null && String(p.id) === String(hostId);
        const role = roleCodeFromProfile(p.role_profile ?? p.kly_role_id);
        return (
          <div key={p.id} className="flex items-center gap-2 text-[13px]">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[9px] font-bold text-primary">
              {String(p.name).trim().charAt(0).toUpperCase() || "?"}
            </span>
            <span className="min-w-0 truncate text-foreground">{p.name}</span>
            {role ? (
              <span className="shrink-0 text-[11px] text-muted-foreground">{role}</span>
            ) : null}
            {p.attending === "Yes" ? (
              <span className="shrink-0 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
                Present
              </span>
            ) : null}
            {p.attending === "No" ? (
              <span className="shrink-0 rounded-full bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 ring-1 ring-rose-200">
                Absent
              </span>
            ) : null}
            {p.attending === "Maybe" ? (
              <span className="shrink-0 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200">
                Maybe
              </span>
            ) : null}
            {isHost ? (
              <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200">
                <Crown className="size-3" /> Host
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

const ATTENDANCE_OPTIONS = [
  { value: "Yes", label: "Present" },
  { value: "No", label: "Absent" },
  { value: "Maybe", label: "Maybe" },
];

function buildAttendanceMap(participants) {
  return Object.fromEntries(
    participants.map((participant) => [participant.id, participant.attending ?? ""])
  );
}

function AttendanceEditor({
  participants,
  hostId,
  editable,
  attendanceById,
  onChange,
}) {
  if (!participants.length) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
        <div className="overflow-hidden rounded-lg border">
      <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1.3fr)_112px] gap-2 border-b bg-muted/40 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        <span>Name</span>
        <span>Email</span>
        <span>Attendance</span>
      </div>
      <div className="divide-y">
        {participants.map((participant) => {
          const isHost = hostId != null && String(participant.id) === String(hostId);

          return (
            <div
              key={participant.id}
              className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1.3fr)_112px] items-center gap-2 px-3 py-2"
            >
              <div className="min-w-0 flex items-center gap-2">
                <span className="truncate text-[12.5px] font-medium text-foreground">
                  {participant.name}
                </span>
                {isHost ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200">
                    <Crown className="size-3" />
                  </span>
                ) : null}
              </div>
              <span className="truncate text-[11px] text-muted-foreground">
                {participant.email || "—"}
              </span>
              {editable ? (
                <Select
                  value={attendanceById[participant.id] ?? ""}
                  onValueChange={(value) => onChange(participant.id, value)}
                >
                  <SelectTrigger className="h-8 px-2 text-[11px]">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {ATTENDANCE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span className="text-[11px] font-medium text-foreground">
                  {ATTENDANCE_OPTIONS.find(
                    (option) => option.value === (attendanceById[participant.id] ?? "")
                  )?.label ?? "—"}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function EventMeetingDialog({ event, setOpen }) {
  const {
    use24HourFormat,
    removeEvent,
    employeeOptions,
    doctorOptions,
    updateEvent,
  } =
    useCalendar();
  const { handleDelete } = useDeleteEvent({
    removeEvent,
    onClose: () => setOpen(false),
  });
  const [attendanceById, setAttendanceById] = useState({});
  const [isSavingAttendance, setIsSavingAttendance] = useState(false);

  const tagConfig = TAG_FORM_CONFIG[event.tags] ?? TAG_FORM_CONFIG.DEFAULT;
  const editAction = tagConfig.ui?.primaryEditAction;
  const isFailedSync = event?.__syncStatus === "failed";

  const participants = useMemo(
    () =>
      buildParticipantsWithDetails(event.event_participants ?? [], {
        employeeOptions,
        doctorOptions,
      }),
    [event.event_participants, employeeOptions, doctorOptions]
  );

  const { viewerRole, host, hostIsCreator } = useMemo(
    () => resolveMeetingRoles({ event, participants }),
    [event, participants]
  );

  const meta = ROLE_META[viewerRole] ?? ROLE_META.viewer;
  const RoleIcon = meta.Icon;

  const creatorName =
    event.ownerFullName || event.owner?.fullName || event.ownerEmployeeId || "—";
  const hostName = host?.name ?? null;
  const hostRole = roleCodeFromProfile(host?.role_profile ?? host?.kly_role_id);
  const viewerIsConductor =
    viewerRole === "host" ||
    (viewerRole === "creator" && (hostIsCreator || !host));

  // Creators manage the meeting they own; hosts can edit the meeting they run;
  // attendees are read-only. A failed local sync always stays fixable/removable.
  const canEdit = viewerRole === "creator" || viewerRole === "host" || isFailedSync;
  const canDelete = viewerRole === "creator" || isFailedSync;
  const canManageAttendance = viewerIsConductor && participants.length > 0;
  const initialAttendanceById = useMemo(
    () => buildAttendanceMap(participants),
    [participants]
  );
  const hasAttendanceChanges = useMemo(() => {
    const participantIds = participants.map((participant) => participant.id);
    return participantIds.some(
      (participantId) =>
        (attendanceById[participantId] ?? "") !==
        (initialAttendanceById[participantId] ?? "")
    );
  }, [attendanceById, initialAttendanceById, participants]);

  useEffect(() => {
    setAttendanceById(initialAttendanceById);
  }, [initialAttendanceById]);

  const handleAttendanceChange = (participantId, nextValue) => {
    setAttendanceById((current) => ({
      ...current,
      [participantId]: nextValue,
    }));
  };

  const handleAttendanceUpdate = async () => {
    try {
      setIsSavingAttendance(true);

      const updatedEventParticipants = (event.event_participants ?? []).map(
        (participant) => {
          if (participant.reference_doctype !== "Employee") {
            return participant;
          }

          const employeeId = String(participant.reference_docname ?? "");
          const nextAttendance = attendanceById[employeeId] ?? "";

          return {
            ...participant,
            attending: nextAttendance || undefined,
          };
        }
      );

      await saveEvent({
        name: event.erpName,
        event_participants: updatedEventParticipants,
      });

      updateEvent({
        ...event,
        event_participants: updatedEventParticipants,
        participants: buildParticipantsWithDetails(updatedEventParticipants, {
          employeeOptions,
          doctorOptions,
        }),
      });

      toast.success("Attendance updated");
    } catch (error) {
      console.error(error);
      toast.error("Failed to update attendance");
    } finally {
      setIsSavingAttendance(false);
    }
  };

  return (
    <>
      <ScrollArea className="max-h-[68vh]">
        <div className="space-y-4 p-1">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${meta.chip}`}
          >
            <RoleIcon className="size-3.5" />
            {meta.label}
          </span>

          <DetailSummary
            title={event.title || "Meeting"}
            subtitle={formatRange(event, use24HourFormat)}
            status={event.status}
            accentClassName={meta.accent}
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

          <DetailGrid>
            <DetailItem icon={Crown} label="Conducted by">
              {viewerIsConductor
                ? "You"
                : hostName
                ? hostRole
                  ? `${hostName} · ${hostRole}`
                  : hostName
                : "Not assigned"}
            </DetailItem>

            {viewerRole !== "creator" ? (
              <DetailItem icon={UserCog} label="Created by">
                {creatorName}
              </DetailItem>
            ) : null}

            {event.meetingLocation ? (
              <DetailItem icon={MapPin} label="Location / venue">
                {event.meetingLocation}
              </DetailItem>
            ) : null}

            <DetailItem icon={Users} label="Team">
              <TeamRoster participants={participants} hostId={host?.id ?? null} />
            </DetailItem>

            {event.description ? (
              <DetailItem icon={Text} label="Description">
                <div className="prose prose-sm dark:prose-invert max-w-none text-foreground">
                  <TiptapViewer content={event.description} />
                </div>
              </DetailItem>
            ) : null}

            <DetailItem icon={Users} label="Attendance">
              <div className="space-y-3">
                <AttendanceEditor
                  participants={participants}
                  hostId={host?.id ?? null}
                  editable={canManageAttendance}
                  attendanceById={attendanceById}
                  onChange={handleAttendanceChange}
                />
                {canManageAttendance ? (
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      onClick={handleAttendanceUpdate}
                      disabled={!hasAttendanceChanges || isSavingAttendance}
                    >
                      {isSavingAttendance ? "Updating..." : "Update Attendance"}
                    </Button>
                  </div>
                ) : null}
              </div>
            </DetailItem>
          </DetailGrid>
        </div>
      </ScrollArea>

      <div className="mt-1 border-t pt-3 sm:grid sm:grid-cols-2 sm:items-start sm:gap-3">
        <div className="min-w-0">
          <SharedToBlock
            event={event}
            variant="footer"
            renderWhenEmpty
            className="sm:min-h-[52px]"
          />
        </div>
        {canEdit || canDelete ? (
          <DetailFooter className="mt-3 border-t-0 pt-0 sm:mt-0 sm:justify-self-end sm:justify-end">
            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
              {canEdit ? (
                <AddEditEventDialog event={event} forceValues={editAction?.setOnEdit}>
                  <Button variant="outline" className="w-full sm:w-auto">
                    {editAction?.label ?? "Edit"}
                  </Button>
                </AddEditEventDialog>
              ) : null}
              {canDelete ? (
                <DeleteEventDialog
                  className="w-full sm:w-auto"
                  onConfirm={() => handleDelete(event.erpName, undefined, event)}
                />
              ) : null}
            </div>
          </DetailFooter>
        ) : null}
      </div>
    </>
  );
}
