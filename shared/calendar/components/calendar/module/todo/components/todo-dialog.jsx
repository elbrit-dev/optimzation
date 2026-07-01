"use client";

import { useMemo } from "react";
import { format, parseISO, differenceInCalendarDays } from "date-fns";
import { ScrollArea } from "@calendar/components/ui/scroll-area";
import { Button } from "@calendar/components/ui/button";
import { useCalendar } from "@calendar/components/calendar/contexts/calendar-context";
import { useEmployeeResolvers } from "@calendar/lib/employeeResolver";
import { TAG_FORM_CONFIG } from "@calendar/lib/calendar/form-config";
import { AddEditEventDialog } from "@calendar/components/calendar/dialogs/add-edit-event-dialog";
import { getPriorityClass } from "@calendar/components/calendar/helpers";
import TiptapViewer from "@calendar/components/ui/TiptapViewer";
import TodoComments from "@calendar/components/calendar/module/todo/components/TodoCommentsSection";
import { useDeleteEvent } from "@calendar/components/calendar/hooks";
import DeleteEventDialog from "@calendar/components/calendar/dialogs/delete-event-dialog";
import { Calendar, Text, User } from "lucide-react";
import {
  DetailSummary,
  DetailItem,
  DetailGrid,
  DetailFooter,
  PersonChips,
} from "@calendar/components/calendar/dialogs/event-details/detail-ui";

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

function resolveOwner(event, employeeResolvers) {
  const ownerId = event?.ownerEmployeeId ?? event?.owner?.id;
  const resolvedEmail =
    event?.ownerEmail ??
    event?.owner?.email ??
    (ownerId
      ? employeeResolvers.getEmployeeEmailById(ownerId)
      : null);
  const resolvedName =
    event?.ownerFullName ??
    event?.owner?.fullName ??
    (ownerId
      ? employeeResolvers.getEmployeeNameById(ownerId)
      : null);

  if (!ownerId && !resolvedEmail && !resolvedName) {
    return null;
  }

  return {
    id: ownerId ?? null,
    email: resolvedEmail ?? null,
    name: resolvedName ?? ownerId ?? resolvedEmail,
  };
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
  const {
    removeEvent,
    employeeOptions,
    allEmployeeOptions,
  } = useCalendar();
  const employeeResolvers =
    useEmployeeResolvers(allEmployeeOptions);

  const tagConfig =
    TAG_FORM_CONFIG[event.tags] ??
    TAG_FORM_CONFIG.DEFAULT;

  /* ================= Derived Data ================= */

  const allocatedTo = useMemo(
    () =>
      resolveAllocatedTo(event, employeeResolvers),
    [event, employeeResolvers]
  );

  const visibleTo = useMemo(
    () =>
      resolveVisibleTo(event, employeeResolvers),
    [event, employeeResolvers]
  );

  const dueDate = useMemo(
    () => getDueDateMeta(event.startDate),
    [event.startDate]
  );
  const owner = useMemo(
    () => resolveOwner(event, employeeResolvers),
    [event, employeeResolvers]
  );

  const permissions = useMemo(() => {
    const isFailedSync = event?.__syncStatus === "failed";
    return {
      canDelete:
        isFailedSync || (tagConfig.ui?.allowDelete?.(event) ?? true),
      canEdit:
        isFailedSync || (tagConfig.ui?.allowEdit?.(event) ?? true),
    };
  }, [tagConfig, event]);

  /* ================= Delete Logic ================= */

  const { handleDelete } = useDeleteEvent({
    removeEvent,
    onClose: () => setOpen(false),
  });
  /* =====================================================
     RENDER
  ===================================================== */
  return (
    <>
      <ScrollArea className="max-h-[68vh]">
        <div className="space-y-5 p-1">
          <DetailSummary
            title={event.title || "Todo"}
            subtitle={
              dueDate
                ? `Due ${dueDate.formatted}${
                    Number.isFinite(dueDate.diffDays)
                      ? ` · ${
                          dueDate.diffDays === 0
                            ? "today"
                            : dueDate.diffDays > 0
                            ? `in ${dueDate.diffDays} day${dueDate.diffDays === 1 ? "" : "s"}`
                            : `${Math.abs(dueDate.diffDays)} day${
                                Math.abs(dueDate.diffDays) === 1 ? "" : "s"
                              } overdue`
                        }`
                      : ""
                  }`
                : null
            }
            status={event.status}
            accentClassName="bg-violet-500"
          />

          <DetailGrid>
            <DetailItem icon={User} label="Allocated To">
              {allocatedTo?.name ?? "—"}
            </DetailItem>
            <DetailItem icon={Calendar} label="Priority">
              <span className={`font-medium ${getPriorityClass(event.priority)}`}>
                {event.priority ?? "—"}
              </span>
            </DetailItem>
            <DetailItem icon={User} label="Created by">
              {[owner?.name, owner?.id].filter(Boolean).join(" • ") || "—"}
              {owner?.email ? (
                <span className="block text-xs text-muted-foreground">
                  {owner.email}
                </span>
              ) : null}
            </DetailItem>
            <DetailItem icon={User} label="Visible To">
              <PersonChips people={visibleTo} />
            </DetailItem>
          </DetailGrid>

          <DetailItem icon={Text} label="Description">
            {event.description ? (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <TiptapViewer content={event.description} />
              </div>
            ) : (
              <span className="text-muted-foreground">No description</span>
            )}
          </DetailItem>
        </div>

        {event?.erpName && (
          <div className="mt-4">
            <TodoComments todoName={event.erpName} />
          </div>
        )}
      </ScrollArea>

      {/* ================= FOOTER ================= */}
      <DetailFooter>
        {permissions.canEdit && (
          <AddEditEventDialog
            event={event}
            forceValues={tagConfig.ui?.primaryEditAction?.setOnEdit}
          >
            <Button className="w-full sm:w-auto">
              {tagConfig.ui?.primaryEditAction?.label ?? "Edit"}
            </Button>
          </AddEditEventDialog>
        )}

        {permissions.canDelete && (
          <DeleteEventDialog
            className="w-full sm:w-auto"
            onConfirm={() => handleDelete(event.erpName, "ToDo", event)}
          />
        )}
      </DetailFooter>
    </>
  );
}
