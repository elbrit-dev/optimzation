"use client";

import { useMemo } from "react";
import { format, parseISO, differenceInCalendarDays } from "date-fns";
import { ScrollArea } from "@calendar/components/ui/scroll-area";
import { Button } from "@calendar/components/ui/button";
import { useCalendar } from "@calendar/components/calendar/contexts/calendar-context";
import { useEmployeeResolvers } from "@calendar/lib/employeeResolver";
import { TAG_FORM_CONFIG } from "@calendar/lib/calendar/form-config";
import { AddEditEventDialog } from "@calendar/components/calendar/dialogs/add-edit-event-dialog";
import { useDeleteEvent } from "../../hooks";
import { getPriorityClass, getStatusBadgeClass } from "../../helpers";

/* =====================================================
   PURE HELPERS
===================================================== */

function resolveAllocatedTo(event, employeeResolvers) {
  if (!event?.allocated_to) return null;

  const email = event.allocated_to.toLowerCase();

  const employeeId =
    employeeResolvers.getEmployeeIdByEmail(email);

  if (!employeeId) {
    return {
      email,
      name: email,
    };
  }

  const name =
    employeeResolvers.getEmployeeNameById(employeeId);

  return {
    id: employeeId,
    email,
    name: name ?? email,
  };
}

function resolveVisibleTo(event, employeeResolvers) {
  if (!Array.isArray(event?.assignedTo)) return [];

  return event.assignedTo.map((employeeId) => {
    const name =
      employeeResolvers.getEmployeeNameById(employeeId);

    return {
      id: employeeId,
      name: name ?? employeeId,
    };
  });
}

function getDueDateMeta(startDate) {
  if (!startDate) return null;

  const parsed = parseISO(startDate);
  const today = new Date();

  return {
    formatted: format(parsed, "dd/MM/yyyy"),
    diffDays: differenceInCalendarDays(parsed, today),
  };
}

/* =====================================================
   COMPONENT
===================================================== */

export function EventTodoDialog({
  event,
  open,
  setOpen,
}) {
  const { removeEvent, employeeOptions } = useCalendar();
  console.log("EVENTS",event)
  const employeeResolvers =
    useEmployeeResolvers(employeeOptions);

  const tagConfig =
    TAG_FORM_CONFIG[event.tags] ??
    TAG_FORM_CONFIG.DEFAULT;

  /* ================= Derived Data ================= */

  const allocatedTo = useMemo(
    () =>
      resolveAllocatedTo(
        event,
        employeeResolvers
      ),
    [event.allocated_to, employeeResolvers]
  );

  const visibleTo = useMemo(
    () =>
      resolveVisibleTo(
        event,
        employeeResolvers
      ),
    [event.assignedTo, employeeResolvers]
  );

  const dueDate = useMemo(
    () => getDueDateMeta(event.startDate),
    [event.startDate]
  );

  const permissions = useMemo(() => {
    return {
      canDelete:
        tagConfig.ui?.allowDelete?.(event) ?? true,
      canEdit:
        tagConfig.ui?.allowEdit?.(event) ?? true,
    };
  }, [tagConfig, event]);

  /* ================= Delete Logic ================= */

  const { handleDelete } = useDeleteEvent({
    removeEvent,
    onClose: () => setOpen(false),
  });
  console.log("EVENT",event)

  /* =====================================================
     RENDER
  ===================================================== */
  return (
    <>
      <ScrollArea className="max-h-[80vh]">
        <div className="p-4 space-y-6">

          {/* ================= HEADER ================= */}
          <div className="flex justify-between items-start">

            {/* Due Date */}
            <div>
              <p className="text-sm font-medium">
                Due Date
              </p>
              {dueDate ? (
                <p className="text-sm text-muted-foreground">
                  {dueDate.formatted} ({dueDate.diffDays} days)
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  -
                </p>
              )}
            </div>

            {/* Status */}
            <div className="text-right">
              <p className="text-sm font-medium">
                Status
              </p>
              <span
                className={`text-white text-xs px-3 py-1 rounded-md ${getStatusBadgeClass(
                  event.status
                )}`}
              >
                {event.status}
              </span>
            </div>
          </div>

          {/* ================= ALLOCATED + PRIORITY ================= */}
          <div className="flex justify-between items-start">

            {/* Allocated To */}
            <div>
              <p className="text-sm font-medium">
                Allocated To
              </p>
              <p className="text-sm text-muted-foreground">
                {allocatedTo?.name ?? "-"}
              </p>
            </div>

            {/* Priority */}
            <div className="text-right">
              <p className="text-sm font-medium">
                Priority
              </p>
              <p
                className={`text-sm font-medium ${getPriorityClass(
                  event.priority
                )}`}
              >
                {event.priority ?? "-"}
              </p>
            </div>
          </div>

          {/* ================= VISIBLE TO ================= */}
          <div>
            <p className="text-sm font-medium">
              Visible To
            </p>

            <div className="flex gap-2 mt-2 flex-wrap">
              {visibleTo.length > 0 ? (
                visibleTo.map((emp) => (
                  <span
                    key={emp.id}
                    className="bg-muted px-2 py-1 rounded text-xs"
                  >
                    {emp.name}
                  </span>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">
                  -
                </span>
              )}
            </div>
          </div>

          {/* ================= DESCRIPTION ================= */}
          <div>
            <p className="text-sm font-medium mb-2">
              Description
            </p>

            {event.description ? (
              <div
                className="border rounded-md p-3 text-sm"
                dangerouslySetInnerHTML={{
                  __html: event.description,
                }}
              />
            ) : (
              <div className="border rounded-md p-3 text-sm text-muted-foreground">
                No description
              </div>
            )}
          </div>
        </div>
      </ScrollArea>

      {/* ================= FOOTER ================= */}
      <div className="flex justify-end gap-2 p-4 border-t">

        {permissions.canEdit && (
          <AddEditEventDialog
            event={event}
            forceValues={
              tagConfig.ui?.primaryEditAction?.setOnEdit
            }
          >
            <Button>
              {tagConfig.ui?.primaryEditAction?.label ??
                "Edit"}
            </Button>
          </AddEditEventDialog>
        )}

        {permissions.canDelete && (
          <Button
            variant="destructive"
            onClick={() =>
              handleDelete(event.erpName,"ToDo")
            }
          >
            Delete
          </Button>
        )}
      </div>
    </>
  );
}