"use client";;
import {  useRef, useMemo } from "react";
import { toast } from "sonner";
import { Button } from "@calendar/components/ui/button";
import { TAG_FORM_CONFIG } from "@calendar/lib/calendar/form-config";
import { ScrollArea } from "@calendar/components/ui/scroll-area";
import { useCalendar } from "@calendar/components/calendar/contexts/calendar-context";
import { AddEditEventDialog } from "@calendar/components/calendar/dialogs/add-edit-event-dialog";
import { deleteEventFromErp } from "@calendar/services/event.service";
import { buildParticipantsWithDetails } from "@calendar/lib/helper";
import { resolveDisplayValueFromEvent } from "@calendar/lib/calendar/resolveDisplay";
import { ICONS } from "../event-details-dialog";

export function EventDefaultDialog({
	event,setOpen
}) {
	const { use24HourFormat, removeEvent, employeeOptions, doctorOptions } = useCalendar();
	const deleteLockRef = useRef(false);
	const tagConfig =TAG_FORM_CONFIG[event.tags] ?? TAG_FORM_CONFIG.DEFAULT;

	const canDelete =
		tagConfig.ui?.allowDelete?.(event) ?? true;
	const canEdit =
		tagConfig.ui?.allowEdit?.(event) ?? true;
	const editAction = tagConfig.ui?.primaryEditAction;
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
	return (
		<>
        	<ScrollArea className="max-h-[80vh]">
					<div className="p-2">
						<EventDetailsFields
							event={eventWithOptions}
							config={tagConfig}
							use24HourFormat={use24HourFormat}
						/>
					</div>
				</ScrollArea>
				<div className="flex justify-end gap-2">
					{canEdit && (
							<AddEditEventDialog
                            event={event}
                            forceValues={editAction?.setOnEdit}
                        >
                            <Button variant="outline">
                                {editAction?.label ?? "Edit"}
                            </Button>
                        </AddEditEventDialog>
					)}

					{canDelete && (
						<Button
							variant="destructive"
							onClick={async () => {
								if (deleteLockRef.current) return;
								deleteLockRef.current = true;

								try {
									await deleteEventFromErp(event.erpName);
									removeEvent(event.erpName);
									setOpen(false);
									toast.success("Event deleted successfully.");
								} catch (e) {
									toast.error("Error deleting event.");
								} finally {
									deleteLockRef.current = false;
								}
							}}
						>
							Delete
						</Button>
					)}
				</div>
        </>
	);
}


export function EventDetailsFields({ event, config, use24HourFormat }) {
    if (!config?.details?.fields) return null;
    return (
      <div className="space-y-4">
        {config.details.fields.map((field) => {
          const Icon = ICONS[field.type] ?? ICONS["text"];
          const value = resolveDisplayValueFromEvent({
            event,
            field,
            use24HourFormat,
          });
          if (!value) return null;
          return (
            <div key={field.key} className="flex items-start gap-2">
              <Icon className="mt-1 size-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{field.label}</p>
  
                {/* 1️⃣ Description */}
                {field.key === "description" && (
                  <div
                    className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground"
                    dangerouslySetInnerHTML={{ __html: value }}
                  />
                )}
  
                {/* 3️⃣ Default Value (only if not description or employee) */}
                {field.key !== "description" &&
                  field.key !== "employee" && (
                    <p className="text-sm text-muted-foreground">
                      {value}
                    </p>
                  )}
              </div>
  
            </div>
          );
        })}
      </div>
    );
  }