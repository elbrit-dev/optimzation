"use client";

import { useMemo, useState } from "react";
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
import { useEmployeeResolvers } from "@calendar/lib/employeeResolver";
import { joinDoctorVisit, leaveDoctorVisit } from "@calendar/lib/helper";
import { CircleCheck, Copy } from "lucide-react"
import { useCallback } from "react";
import DeleteEventDialog from "@calendar/components/calendar/dialogs/delete-event-dialog";
import { DoctorNotesSection } from "@calendar/components/calendar/module/event/components/DoctorNotesSection";
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
    employeeOptions,
    doctorOptions,
    addEvent, setDoctorOptions
  } = useCalendar();

  const { handleDelete } = useDeleteEvent({
    removeEvent,
    onClose: () => setOpen(false),
  });
  const doctorResolvers = useDoctorResolvers(doctorOptions);
  const employeeResolvers = useEmployeeResolvers(employeeOptions);
  const employeeMap = useMemo(() => {
    const map = new Map();
    employeeOptions.forEach(emp => {
      map.set(String(emp.value), emp);
    });
    return map;
  }, [employeeOptions]);

  function resolveEmployeeParticipants(event, employeeMap) {
    const allowedPrefixes = ["SM", "ABM", "RBM", "BE", "Admin"];

    return (
      event.participants
        ?.filter(p => p.type === "Employee")
        .map(p => {
          const emp = employeeMap.get(String(p.id));
          if (!emp?.roleId) return null;

          const rolePrefix = emp.roleId.split("-")[0];
          const cleanPrefix = rolePrefix.replace(/[0-9]/g, "");

          if (!allowedPrefixes.includes(cleanPrefix))
            return null;

          return {
            name: emp.label ?? p.id,
            role: cleanPrefix,
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
    return {
      canJoin:
        isDoctorVisit && !isEmployeeParticipant,
      canVisitNow:
        isDoctorVisit && isEmployeeParticipant,
      canLeave:
        isDoctorVisit && isEmployeeParticipant,
      canDelete:
        tagConfig.ui?.allowDelete?.(event) ?? true,
      canEdit:
        tagConfig.ui?.allowEdit?.(event) ?? true,
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

      removeEvent(event.erpName);
      addEvent(updatedEvent);

      toast.success("You have joined the visit");
      setOpen(false);
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

      removeEvent(event.erpName);
      addEvent(updatedEvent);

      toast.success("You have left the visit");
      setOpen(false);
    } catch (err) {
      console.error(err);
      toast.error("Failed to leave visit");
    }
  };
  /* =====================================================
   RENDER
===================================================== */
const lat = Number(currentEmployeeParticipant?.custom_latitude);
const lng = Number(currentEmployeeParticipant?.custom_longitude);

const hasLocation =
  lat !== 0 &&
  lng !== 0 &&
  !isNaN(lat) &&
  !isNaN(lng);
  
  const isAttending =
    currentEmployeeParticipant?.attending?.toLowerCase() === "yes";
  const isVisitCompleted = isAttending && hasLocation;
  const hasPobItems =
    Array.isArray(event.fsl_doctor_item) &&
    event.fsl_doctor_item.length > 0;
  const hasParticipants = event.participants?.some(
    (p) => p.type === "Employee"
  ) ?? false;
  const shouldShowPob =
    hasPobItems || isVisitCompleted;
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

  return (
    <>
      <ScrollArea className="max-h-[80vh]">
        <div className="p-2 space-y-4">
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
          <p className="text-sm font-medium mb-[4px]">Participants</p>
          {/* Participants */}
          {employeeParticipants.map((p, index) => {
            const isCurrentUser =
              String(p.name) ===
              employeeResolvers.getEmployeeNameById(
                LOGGED_IN_USER.id
              );

            return (
              <div
                key={index}
                className="flex justify-start gap-6 text-sm items-center"
              >
                <span className="text-muted-foreground">
                  {p.name}
                </span>

                <span className="text-muted-foreground">
                  {p.role}
                </span>

                {isCurrentUser &&
                  isAttending &&
                  hasLocation && (
                    <span className="text-green-600 font-medium">
                      <CircleCheck />
                    </span>
                  )}
              </div>
            );
          })}

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

              {/* Yes / No */}
              <p className="text-sm text-muted-foreground">
                {hasPobItems ? "Yes" : "No"}
              </p>

              {/* Table only if items exist */}
              {hasPobItems && (
                <div className="border rounded-md text-sm mt-2">
                  <div className="grid grid-cols-3 gap-4 border-b p-2 font-medium">
                    <span>Item</span>
                    <span>Qty</span>
                    <span>Amount</span>
                  </div>

                  {event.fsl_doctor_item.map((row, index) => (
                    <div
                      key={index}
                      className="grid grid-cols-3 gap-4 p-2 border-b last:border-0"
                    >
                      <span>{row.item__name}</span>
                      <span>{row.qty}</span>
                      <span>{(row.amount).toFixed(2)}</span>
                    </div>
                  ))}

                  {/* Total */}
                  <div className="grid grid-cols-3 gap-4 p-2 font-semibold bg-muted/40">
                    <span>Total</span>
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
      <div className="flex justify-end gap-2">
        {permissions.canEdit && !isVisitCompleted && (
          <>
            {permissions.canJoin && (
              <Button
                variant="success"
                onClick={handleJoin}
              >
                Join
              </Button>
            )}

            {permissions.canVisitNow && (
              <>
                <Button
                  variant="destructive"
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
                  <Button>
                    {tagConfig.ui?.primaryEditAction
                      ?.label ?? "Visit"}
                  </Button>
                </AddEditEventDialog>

              </>
            )}
          </>
        )}

        {permissions.canDelete && !hasParticipants && (
            <DeleteEventDialog
            onConfirm={() => handleDelete(event.erpName)}
          />
        )}
      </div>
    </>
  );
}

