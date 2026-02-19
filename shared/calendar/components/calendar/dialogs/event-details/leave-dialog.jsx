"use client";;
import { useState, useRef, useMemo } from "react";
import { toast } from "sonner";
import { Button } from "@calendar/components/ui/button";
import { TAG_FORM_CONFIG } from "@calendar/lib/calendar/form-config";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@calendar/components/ui/dialog";
import { ScrollArea } from "@calendar/components/ui/scroll-area";
import { useCalendar } from "@calendar/components/calendar/contexts/calendar-context";
import { AddEditEventDialog } from "@calendar/components/calendar/dialogs/add-edit-event-dialog";
import { deleteEventFromErp, saveEvent } from "@calendar/services/event.service";
import { TAG_IDS } from "@calendar/components/calendar/constants"
import { LOGGED_IN_USER } from "@calendar/components/auth/calendar-users";
import { resolveDoctorVisitState, submitDoctorVisitLocation } from "@calendar/lib/doctorVisitState";
import { buildParticipantsWithDetails } from "@calendar/lib/helper";
import { Calendar, Clock, Text, User } from "lucide-react";
import { resolveDisplayValueFromEvent } from "@calendar/lib/calendar/resolveDisplay";

const ICONS = {
  owner: User,
  date: Calendar,
  datetime: Clock,
  text: Text,
};
export async function joinDoctorVisit({ erpName, existingParticipants, employeeId }) {
	return saveEvent({
		name: erpName,
		event_participants: [
			...existingParticipants,
			{
				reference_doctype: "Employee",
				reference_docname: employeeId,
			},
		],
	});
}


export function EventLeaveDialog({
	event,open,setOpen,
	children
}) {
	const isDoctorVisit = event.tags === TAG_IDS.DOCTOR_VISIT_PLAN;
	const visitState = resolveDoctorVisitState(
		event,
		LOGGED_IN_USER.id
	);
	const isEmployeeParticipant =
		event.event_participants?.some(
			(p) =>
				p.reference_doctype === "Employee" &&
				String(p.reference_docname) === String(LOGGED_IN_USER.id)
		) ?? false;

	const canJoinVisit = isDoctorVisit && !isEmployeeParticipant;

	const canVisitNow = isDoctorVisit && isEmployeeParticipant;
	// const [open, setOpen] = useState(false);
	const { use24HourFormat, removeEvent, employeeOptions, doctorOptions, addEvent } = useCalendar();
	const deleteLockRef = useRef(false);
	const tagConfig =
		TAG_FORM_CONFIG[event.tags] ?? TAG_FORM_CONFIG.DEFAULT;

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
						<>
							{/* Join Visit */}
							{canJoinVisit && (
								<Button variant="outline"
									onClick={async () => {
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
											const updated = rebuildCalendarEvent(
												event,
												updatedErpParticipants,
												{ employeeOptions, doctorOptions }
											);

											removeEvent(event.erpName);
											addEvent(updated);

											toast.success("You have joined the visit");
											setOpen(false);
										} catch (err) {
											console.error(err);
											toast.error("Failed to join visit");
										}
									}}
								>
									Join Visit
								</Button>
							)}
							{visitState.needsLocation && (
								<Button
									variant="secondary"
									onClick={async () => {
										try {
											await submitDoctorVisitLocation({
												event,
												loggedInUserId: LOGGED_IN_USER.id,
												removeEvent,
												addEvent,
											});

											toast.success("Location submitted successfully");
											setOpen(false);
										} catch (err) {
											toast.error("Failed to fetch location");
										}
									}}
								>
									Request Location
								</Button>
							)}
							{/* Visit Now (Primary Edit Action) */}
							{canVisitNow && (
								<AddEditEventDialog
									event={event}
									forceValues={editAction?.setOnEdit}
								>
									<Button variant="success">
										{editAction?.label ?? "Visit Now"}
									</Button>
								</AddEditEventDialog>
							)}

							{/* Normal Edit (Non-doctor events) */}
							{!isDoctorVisit && (
								<AddEditEventDialog
									event={event}
									forceValues={editAction?.setOnEdit}
								>
									<Button variant="outline">
										{editAction?.label ?? "Edit"}
									</Button>
								</AddEditEventDialog>
							)}
						</>
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

function rebuildCalendarEvent(event, updatedErpParticipants, options) {
	return {
		...event,
		event_participants: updatedErpParticipants,
		participants: buildParticipantsWithDetails(
			updatedErpParticipants,
			options
		),
	};
}


export function EventDetailsFields({ event, config, use24HourFormat }) {
  if (!config?.details?.fields) return null;
  // const participants =
  //   event?.participants?.filter(
  //     (x) => x.type === "Employee"
  //   ) || [];
  return (
    <div className="space-y-4">
      {config.details.fields.map((field) => {
        const Icon = ICONS[field.type] ?? Text;
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

              {/* 2️⃣ Employee Table */}
              {/* {field.key === "employee" && (
                <div className="mt-2 overflow-x-auto">
                  <ParticipantsTable participants={participants} />
                </div>
              )} */}

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

// function ParticipantsTable({ participants }) {
//   return (
//     <div className="w-full overflow-hidden">
//       <table className="w-full table-fixed border border-border text-sm">
//         <thead className="bg-muted">
//           <tr>
//             <th className="w-1/4 md:w-1/4 border p-2 md:px-3 md:py-2 text-left">
//               Employee
//             </th>

//             <th className="w-1/4 md:w-1/6 border p-2 md:px-3 md:py-2 text-center">
//               Visited
//             </th>

//             <th className="w-1/4 md:w-7/12 border p-2 md:px-3 md:py-2 text-left">
//               Location
//             </th>
//           </tr>
//         </thead>

//         <tbody>
//           {participants?.length ? (
//             participants.map((participant, index) => (
//               <tr key={index} className="border-t">
//                 <td className="w-1/4 md:w-1/4 border p-2 md:px-3 md:py-2 break-words">
//                   {participant.name || "-"}
//                 </td>

//                 <td className="w-1/4 md:w-1/6 border p-2 md:px-3 md:py-2 text-center">
//                   {participant.attending || "No"}
//                 </td>

//                 <td className="w-1/4 md:w-7/12 border p-2 md:px-3 md:py-2 break-all font-mono text-xs">
//                   {participant.kly_lat_long || "-"}
//                 </td>
//               </tr>
//             ))
//           ) : (
//             <tr>
//               <td
//                 colSpan={3}
//                 className="px-3 py-2 text-center text-muted-foreground"
//               >
//                 No participants found
//               </td>
//             </tr>
//           )}
//         </tbody>
//       </table>
//     </div>
//   );
// }
