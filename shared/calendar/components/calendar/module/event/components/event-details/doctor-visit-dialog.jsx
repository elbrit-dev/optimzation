"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@calendar/components/ui/button";
import { TAG_FORM_CONFIG } from "@calendar/lib/calendar/form-config";
import { ScrollArea } from "@calendar/components/ui/scroll-area";
import { useCalendar } from "@calendar/components/calendar/contexts/calendar-context";
import { AddEditEventDialog } from "@calendar/components/calendar/dialogs/add-edit-event-dialog";
import { TAG_IDS } from "@calendar/components/calendar/constants";
import { LOGGED_IN_USER } from "@calendar/components/auth/calendar-users";
import { buildParticipantsWithDetails } from "@calendar/lib/helper";
import { useDeleteEvent } from "@calendar/components/calendar/hooks";
import { useDoctorResolvers } from "@calendar/lib/doctorResolver";
import { joinDoctorVisit, leaveDoctorVisit } from "@calendar/lib/helper";
import { CircleCheck, Copy } from "lucide-react"
import { useCallback } from "react";
import DeleteEventDialog from "@calendar/components/calendar/dialogs/delete-event-dialog";
import { DoctorNotesSection } from "@calendar/components/calendar/module/event/components/DoctorNotesSection";
import { fetchDoctorById } from "@calendar/components/calendar/module/event/services/master-data.service";
import { format, parseISO, isValid } from "date-fns";
import {
  DetailSummary,
  DetailFooter,
} from "@calendar/components/calendar/dialogs/event-details/detail-ui";
import { SharedToBlock } from "@calendar/components/calendar/dialogs/share-event-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@calendar/components/ui/avatar";
import { EventParticipantAvatars } from "@calendar/components/calendar/views/shared/event-participant-avatars";
import { getAvatarColorBySeed, getFirstLetters } from "@calendar/components/calendar/helpers";
import { cn } from "@calendar/lib/utils";
/* =====================================================
   PURE HELPERS (NO LOGIC CHANGE)
===================================================== */

function resolveDoctorDetails(event, doctorResolvers) {
  const doctorId = Array.isArray(event.doctor)
    ? event.doctor[0]
    : event.doctor;
  if (!doctorId) return null;

  return {
    doctorId,
    doctorName:
      doctorResolvers.getDoctorNameById(doctorId) ?? "",
    doctorCity:
      doctorResolvers.getDoctorFieldById(doctorId, "city") ?? "",
    doctorSpeciality:
      doctorResolvers.getDoctorFieldById(
        doctorId,
        "fsl_speciality__name"
      ) ?? "",
    doctorCode:
      doctorResolvers.getDoctorFieldById(
        doctorId,
        "code"
      ) ?? "",

    // ✅ ADD THIS
    doctorNotes:
      doctorResolvers.getDoctorFieldById(
        doctorId,
        "notes"
      ) ?? [],
  };
}

function hasValidLocation(latitude, longitude) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  return lat !== 0 && lng !== 0 && !Number.isNaN(lat) && !Number.isNaN(lng);
}

/**
 * A participant has completed the visit when ERP marks them attending AND a
 * visit location was captured. This lives per-participant on the shared event,
 * so it evaluates the same for every role that opens the visit — unlike a check
 * derived from the logged-in viewer.
 */
function isParticipantVisited(participant) {
  if (!participant) return false;
  return (
    String(participant.attending ?? "").toLowerCase() === "yes" &&
    hasValidLocation(
      participant.custom_latitude,
      participant.custom_longitude
    )
  );
}


/* =====================================================
   COMPONENT
===================================================== */

export function EventDoctorVisitDialog({
  event,
  open,
  setOpen,
}) {
  const {
    removeEvent,
    updateEvent,
    employeeOptions,
    allEmployeeOptions,
    doctorOptions,
    addEvent, setDoctorOptions
  } = useCalendar();

  const { handleDelete } = useDeleteEvent({
    removeEvent,
    onClose: () => setOpen(false),
  });
  const doctorResolvers = useDoctorResolvers(doctorOptions);
  // Resolve participants against the FULL employee list, not the role-scoped
  // `employeeOptions`. A viewer only sees their own slice of the hierarchy in
  // `employeeOptions` (e.g. a BE has no ABM in scope), which previously dropped
  // out-of-scope participants from the roster — making the same visit show a
  // different participant list across BE / ABM / RBM views.
  const employeeMap = useMemo(() => {
    const map = new Map();
    (allEmployeeOptions ?? employeeOptions).forEach(emp => {
      map.set(String(emp.value), emp);
    });
    return map;
  }, [allEmployeeOptions, employeeOptions]);

  function resolveEmployeeParticipants(event, employeeMap) {
    const allowedPrefixes = ["SM", "ABM", "RBM", "BE", "Admin"];

    return (
      event.participants
        ?.filter(p => p.type === "Employee")
        .map(p => {
          const emp = employeeMap.get(String(p.id));

          // Role prefix from ERP truth: prefer the resolved employee's roleId,
          // fall back to the participant's own role so a participant is never
          // dropped just because the current viewer can't see that employee.
          const roleId =
            emp?.roleId ?? p.role_profile ?? p.kly_role_id ?? null;
          if (!roleId) return null;

          const cleanPrefix = String(roleId)
            .split("-")[0]
            .replace(/[0-9]/g, "");

          if (!allowedPrefixes.includes(cleanPrefix))
            return null;

          return {
            id: p.id,
            name: emp?.label ?? p.name ?? p.id,
            role: cleanPrefix,
            // Per-participant completion, read from that participant's own ERP
            // attendance — identical for every role that opens this visit.
            visited: isParticipantVisited(p),
            forceVisit: Boolean(p.custom_is_force_visit),
          };
        })
        .filter(Boolean) ?? []
    );
  }

  const employeeParticipants = useMemo(
    () => resolveEmployeeParticipants(event, employeeMap),
    [event, employeeMap]
  );
  const tagConfig =
    TAG_FORM_CONFIG[event.tags] ?? TAG_FORM_CONFIG.DEFAULT;

  // const visitState = resolveDoctorVisitState(
  //   event,
  //   LOGGED_IN_USER.id
  // );

  /* ================= Permissions ================= */

  const isDoctorVisit =
    event.tags === TAG_IDS.DOCTOR_VISIT_PLAN;
  const currentEmployeeParticipant = useMemo(() => {
    return event.participants?.find(
      p =>
        p.type === "Employee" &&
        String(p.id) === String(LOGGED_IN_USER.id)
    );
  }, [event.participants]);
  const isEmployeeParticipant = !!currentEmployeeParticipant;
  const permissions = useMemo(() => {
    const isFailedSync = event?.__syncStatus === "failed";
    return {
      canJoin:
        isDoctorVisit && !isEmployeeParticipant,
      canVisitNow:
        isDoctorVisit && isEmployeeParticipant,
      canLeave:
        isDoctorVisit && isEmployeeParticipant,
      canDelete:
        isFailedSync || (tagConfig.ui?.allowDelete?.(event) ?? true),
      canEdit:
        isFailedSync || (tagConfig.ui?.allowEdit?.(event) ?? true),
    };
  }, [
    isDoctorVisit,
    isEmployeeParticipant,
    tagConfig,
    event,
  ]);

  /* ================= Doctor Info ================= */

  const doctorDetails = useMemo(
    () => resolveDoctorDetails(event, doctorResolvers),
    [event, doctorResolvers]
  );

  // Doctor name + notes are resolved from the loaded `doctorOptions`, which is
  // capped (MAX_ROWS) and may not include this visit's doctor — leaving both
  // blank ("sometimes the name is visible, sometimes not"). When it's missing,
  // fetch just this doctor by id and merge it in so name and notes render.
  useEffect(() => {
    if (!open) return;

    const doctorId = Array.isArray(event.doctor)
      ? event.doctor[0]
      : event.doctor;
    if (!doctorId) return;
    // Guard on PRESENCE in the options (not on the resolved name) so a doctor
    // with a blank name doesn't re-fetch every render.
    if (doctorOptions.some((o) => String(o.value) === String(doctorId))) return;

    let cancelled = false;
    (async () => {
      try {
        const doctors = await fetchDoctorById(doctorId);
        if (cancelled || !doctors.length) return;
        setDoctorOptions((current) => {
          const optionMap = new Map();
          [...(current ?? []), ...doctors].forEach((option) => {
            if (option?.value) optionMap.set(option.value, option);
          });
          return Array.from(optionMap.values());
        });
      } catch (err) {
        console.error("Failed to load doctor for visit", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, event.doctor, doctorOptions, setDoctorOptions]);

  /* ================= Join Logic ================= */

  const handleJoin = async () => {
    try {
      const existingParticipants =
        event.event_participants?.map((p) => ({
          reference_doctype: p.reference_doctype,
          reference_docname: p.reference_docname,
        })) || [];

      await joinDoctorVisit({
        erpName: event.erpName,
        existingParticipants,
        employeeId: LOGGED_IN_USER.id,
      });

      const updatedParticipants = [
        ...existingParticipants,
        {
          reference_doctype: "Employee",
          reference_docname: LOGGED_IN_USER.id,
        },
      ];

      const updatedEvent = {
        ...event,
        event_participants: updatedParticipants,
        participants: buildParticipantsWithDetails(
          updatedParticipants,
          { employeeOptions, doctorOptions }
        ),
      };

      updateEvent(updatedEvent);

      toast.success("You have joined the visit");
    } catch (err) {
      console.error(err);
      toast.error("Failed to join visit");
    }
  };
  const handleLeaveVisit = async () => {
    try {
      const existingParticipants =
        event.event_participants?.map((p) => ({
          reference_doctype: p.reference_doctype,
          reference_docname: p.reference_docname,
        })) || [];

      await leaveDoctorVisit({
        erpName: event.erpName,
        existingParticipants,
        employeeId: LOGGED_IN_USER.id,
      });

      const updatedParticipants = existingParticipants.filter(
        (p) =>
          !(
            p.reference_doctype === "Employee" &&
            String(p.reference_docname) === String(LOGGED_IN_USER.id)
          )
      );

      const updatedEvent = {
        ...event,
        event_participants: updatedParticipants,
        participants: buildParticipantsWithDetails(
          updatedParticipants,
          { employeeOptions, doctorOptions }
        ),
      };

      updateEvent(updatedEvent);

      toast.success("You have left the visit");
    } catch (err) {
      console.error(err);
      toast.error("Failed to leave visit");
    }
  };
  /* =====================================================
   RENDER
===================================================== */
  // Whether the CURRENT VIEWER has personally completed their own visit. This
  // drives the footer actions (Join / Visit / Remove) only — it must never
  // decide the displayed status, or the same visit reads differently per role.
  const viewerHasVisited = isParticipantVisited(currentEmployeeParticipant);

  // Whether the VISIT ITSELF is complete, derived from the participant data on
  // the shared event. Identical across BE / ABM / RBM views.
  const visitCompleted = useMemo(
    () => employeeParticipants.some((p) => p.visited),
    [employeeParticipants]
  );
  const isFailedSync = event?.__syncStatus === "failed";
  const hasPobItems =
    Array.isArray(event.fsl_doctor_item) &&
    event.fsl_doctor_item.length > 0;
  const hasParticipants = event.participants?.some(
    (p) => p.type === "Employee"
  ) ?? false;
  const shouldShowPob =
    hasPobItems || visitCompleted;
  const pobTotals = useMemo(() => {
    if (!hasPobItems) return { qty: 0, amount: 0 };

    return event.fsl_doctor_item.reduce(
      (acc, item) => {
        acc.qty += Number(item.qty);
        acc.amount += Number(item.amount);
        return acc;
      },
      { qty: 0, amount: 0 }
    );
  }, [event.fsl_doctor_item, hasPobItems]);
  const visitDateTime = useMemo(() => {
    if (!event.pobCreation) return null;

    const parsed = parseISO(event.pobCreation);
    if (!isValid(parsed)) return null;

    return format(parsed, "dd/MM/yyyy, hh:mm a");
  }, [event.pobCreation]);

  return (
    <>
      <ScrollArea className="max-h-[68vh]">
        <div className="p-1 space-y-4">
          <DetailSummary
            title={doctorDetails?.doctorName || "Doctor Visit"}
            subtitle={
              event.startDate && isValid(parseISO(event.startDate))
                ? format(parseISO(event.startDate), "EEE, d MMM yyyy")
                : null
            }
            status={visitCompleted ? "Completed" : event.status}
            accentClassName="bg-emerald-500"
          />
          {/* Doctor Section */}
          {doctorDetails?.doctorId && (
            <div className="space-y-1">
              <p className="text-sm font-medium mb-[4px]">Doctor</p>

              {/* Row 1 */}
              <div className="flex items-center gap-6 text-sm flex-wrap">
                {/* Name */}
                <span className="font-medium">
                  {doctorDetails.doctorName}
                </span>

                {/* Speciality */}
                {doctorDetails.doctorSpeciality && (
                  <span className="text-muted-foreground">
                    {doctorDetails.doctorSpeciality}
                  </span>
                )}

                {/* Code with Copy */}
                {doctorDetails.doctorCode && (
                  <span className="flex items-center gap-1 text-blue-600 font-medium">
                    {doctorDetails.doctorCode}

                    <Copy
                      className="h-3.5 w-3.5 cursor-pointer hover:opacity-70"
                      onClick={() => {
                        navigator.clipboard.writeText(
                          doctorDetails.doctorCode
                        );
                      }}
                    />
                  </span>
                )}
              </div>

              {/* Row 2 - City */}
              {doctorDetails.doctorCity && (
                <p className="text-sm text-muted-foreground">
                  {doctorDetails.doctorCity}
                </p>
              )}
            </div>
          )}
          {(event.hqTerritory ||
            (event.distanceKm != null && Number(event.distanceKm) > 0)) && (
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {event.hqTerritory && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground/80">
                    HQ Territory
                  </p>
                  <p className="text-[13px]">{event.hqTerritory}</p>
                </div>
              )}
              {event.distanceKm != null && Number(event.distanceKm) > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground/80">
                    Distance from doctor
                  </p>
                  <p className="text-[13px]">
                    {Number(event.distanceKm).toFixed(2)} km
                    {event.forceVisit ? (
                      <span className="ml-1.5 rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
                        Force visit
                      </span>
                    ) : null}
                  </p>
                </div>
              )}
            </div>
          )}
          {event.owner && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground/80">
                Created By
              </p>
              <p className="text-[13px] text-muted-foreground">
                {event.ownerFullName} • {event.ownerEmployeeId}
                {event.ownerEmail ? (
                  <span className="block text-[11px]">{event.ownerEmail}</span>
                ) : null}
              </p>
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium mb-[2px]">Participants</p>
            <EventParticipantAvatars
              event={event}
              max={3}
              className="mb-[2px]"
              avatarClassName="size-5 text-[10px]"
            />
          </div>
          {/* Participants */}
          {employeeParticipants.map((p, index) => (
            <div
              key={p.id ?? index}
              className="flex flex-wrap items-center gap-2 text-sm"
            >
              <Avatar className="size-6 shrink-0">
                <AvatarImage alt={p.name} />
                <AvatarFallback
                  className={cn(
                    "text-[10px] font-semibold text-white",
                    getAvatarColorBySeed(p.name || p.id)
                  )}
                >
                  {getFirstLetters(p.name)}
                </AvatarFallback>
              </Avatar>
              <span className="text-muted-foreground leading-none">
                {p.name}
              </span>

              <span className="text-muted-foreground leading-none">
                {p.role}
              </span>

              {p.visited && (
                <span
                  className={cn(
                    "font-medium leading-none",
                    p.forceVisit ? "text-rose-600" : "text-green-600"
                  )}
                >
                  <CircleCheck />
                </span>
              )}
              {p.forceVisit && (
                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-700 leading-none">
                  Force visit
                </span>
              )}
            </div>
          ))}

          {/* ================= Notes Section ================= */}
          <DoctorNotesSection
            doctorId={doctorDetails.doctorId}
            notes={doctorDetails.doctorNotes}
            setDoctorOptions={setDoctorOptions}
          />
          {/* ================= Force Visit Reason ================= */}
          {event.forceVisit && (
            <div>
              <p className="text-sm font-medium mb-[4px]">
                Force Visit Reason
              </p>
              <p className="text-sm text-muted-foreground">
                {event.custom_force_visit_reason}
              </p>
            </div>
          )}
          {/* ================= POB ================= */}
          {shouldShowPob && (
            <div className="space-y-3">
              <p className="text-sm font-medium mb-[4px]">
                POB
              </p>

              <p className="text-sm text-muted-foreground">
                {Number(event.pob_given) === 1 ? "Yes" : "No"}
              </p>

              {/* Table only if items exist */}
              {hasPobItems && (
                <div className="border rounded-md text-sm mt-2">
                  <div className="grid grid-cols-4 gap-4 border-b p-2 font-medium">
                    <span>Date</span>
                    <span>Item</span>
                    <span>Qty</span>
                    <span>Amount</span>
                  </div>

                  {event.fsl_doctor_item.map((row, index) => (
                    <div
                      key={index}
                      className="grid grid-cols-4 gap-4 p-2 border-b last:border-0"
                    >
                      <span>{visitDateTime ?? "—"}</span>
                      <span>{row.item__name}</span>
                      <span>{row.qty}</span>
                      <span>{(row.amount).toFixed(2)}</span>
                    </div>
                  ))}

                  {/* Total */}
                  <div className="grid grid-cols-4 gap-4 p-2 font-semibold bg-muted/40">
                    <span>Total</span>
                    <span></span>
                    <span>
                      {pobTotals.qty}
                    </span>
                    <span>
                      {pobTotals.amount.toFixed(2)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}


        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="mt-1 border-t pt-3 sm:grid sm:grid-cols-2 sm:items-start sm:gap-3">
        <div className="min-w-0">
          <SharedToBlock
            event={event}
            variant="footer"
            renderWhenEmpty
            className="sm:min-h-[52px]"
          />
        </div>
        <DetailFooter className="mt-3 border-t-0 pt-0 sm:mt-0 sm:justify-self-end sm:justify-end">
          {permissions.canEdit && (!viewerHasVisited || isFailedSync) && (
            <>
              {isFailedSync ? (
                <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
                  <AddEditEventDialog
                    event={event}
                    forceValues={
                      tagConfig.ui?.primaryEditAction
                        ?.setOnEdit
                    }
                  >
                    <Button className="w-full sm:w-auto">
                      Edit
                    </Button>
                  </AddEditEventDialog>
                  {permissions.canDelete && (
                    <DeleteEventDialog
                      className="w-full sm:w-auto"
                      onConfirm={() => handleDelete(event.erpName, undefined, event)}
                    />
                  )}
                </div>
              ) : null}

              {permissions.canJoin && (
                <Button
                  variant="success"
                  className="w-full sm:w-auto"
                  onClick={handleJoin}
                >
                  Join
                </Button>
              )}

              {permissions.canVisitNow && !isFailedSync && (
                <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
                  <Button
                    variant="destructive"
                    className="w-full sm:w-auto"
                    onClick={handleLeaveVisit}
                  >
                    Remove
                  </Button>
                  <AddEditEventDialog
                    event={event}
                    forceValues={
                      tagConfig.ui?.primaryEditAction
                        ?.setOnEdit
                    }
                  >
                    <Button className="w-full sm:w-auto">
                      {tagConfig.ui?.primaryEditAction
                        ?.label ?? "Visit"}
                    </Button>
                  </AddEditEventDialog>
                </div>
              )}
            </>
          )}

          {permissions.canDelete && !isFailedSync && (!hasParticipants || isFailedSync) && (
            <DeleteEventDialog
              className="w-full sm:w-auto"
              onConfirm={() => handleDelete(event.erpName, undefined, event)}
            />
          )}
        </DetailFooter>
      </div>
    </>
  );
}
