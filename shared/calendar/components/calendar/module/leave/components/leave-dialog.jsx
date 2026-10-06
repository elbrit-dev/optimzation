"use client";
import { useEffect, useMemo, useState } from "react";
import { format, parseISO, differenceInCalendarDays } from "date-fns";
import { Button } from "@calendar/components/ui/button";
import { TAG_FORM_CONFIG } from "@calendar/lib/calendar/form-config";
import { ScrollArea } from "@calendar/components/ui/scroll-area";
import { useCalendar } from "@calendar/components/calendar/contexts/calendar-context";
import { AddEditEventDialog } from "@calendar/components/calendar/dialogs/add-edit-event-dialog";
import { buildParticipantsWithDetails } from "@calendar/lib/helper";
import { resolveDisplayValueFromEvent } from "@calendar/lib/calendar/resolveDisplay";
import { useDeleteEvent } from "@calendar/components/calendar/hooks";
import { ICONS } from "@calendar/components/calendar/dialogs/event-details-dialog";
import { useEmployeeResolvers } from "@calendar/lib/employeeResolver";
import { LOGGED_IN_USER } from "@calendar/components/auth/calendar-users";
import { resolveLeavePermissions } from "@calendar/lib/leavePermissions";
import { toast } from "sonner";
import TiptapViewer from "@calendar/components/ui/TiptapViewer";
import DeleteEventDialog from "@calendar/components/calendar/dialogs/delete-event-dialog";
import { fetchEmployeeLeaveBalance, updateLeaveStatus } from "@calendar/components/calendar/module/leave/services/leave.service";
import {
	DetailSummary,
	DetailItem,
	DetailGrid,
	DetailFooter,
} from "@calendar/components/calendar/dialogs/event-details/detail-ui";
import { SharedToBlock } from "@calendar/components/calendar/dialogs/share-event-dialog";

export function EventLeaveDialog({
	event, setOpen,
}) {
	const { use24HourFormat, removeEvent, employeeOptions, doctorOptions, updateEvent } = useCalendar();
	const employeeResolvers = useEmployeeResolvers(employeeOptions);
	const { handleDelete } = useDeleteEvent({
		removeEvent,
		onClose: () => setOpen(false),
	});
	const [leaveBalance, setLeaveBalance] = useState(null);
	// The balance shown is the APPLICANT'S: a manager opening a BE's leave must
	// see the BE's days left, not their own.
	const leaveOwnerId = event.employee ?? event.ownerEmployeeId ?? LOGGED_IN_USER.id;
	useEffect(() => {
		let alive = true;
		setLeaveBalance(null);

		fetchEmployeeLeaveBalance(leaveOwnerId)
			.then((data) => {
				if (!alive) return;
				setLeaveBalance(data);
			})
			.catch(() => setLeaveBalance(null));

		return () => {
			alive = false;
		};
	}, [leaveOwnerId]);

	const tagConfig =
		TAG_FORM_CONFIG[event.tags] ?? TAG_FORM_CONFIG.DEFAULT;
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
		employeeResolvers
	};
	const start = event.startDate ? parseISO(event.startDate) : null;
	const end = event.endDate ? parseISO(event.endDate) : null;

	const calendarDays =
		start && end
			? differenceInCalendarDays(end, start) + 1
			: 0;
	// ERP's total_leave_days already leaves out Sundays and holidays (no leave
	// type includes them), so it is the count to show, not the date span.
	const leaveDays = Number(event.total_leave_days ?? calendarDays);
	const excludedDays = Math.floor(calendarDays - leaveDays);

	const formattedRange =
		start && end
			? `${format(start, "d MMM yyyy")} - ${format(end, "d MMM yyyy")}${excludedDays > 0
				? ` · ${calendarDays} calendar days, ${excludedDays} ${excludedDays === 1 ? "holiday/Sunday" : "holidays/Sundays"} excluded`
				: ""
			}`
			: null;

	const status = event.status;
	const leaveType = event.leaveType;

	const available =
		leaveBalance?.[leaveType]?.available ?? null;
	const permissions = useMemo(() => {
		const resolved = resolveLeavePermissions({ event });
		if (event?.__syncStatus === "failed") {
			return {
				...resolved,
				canEditDelete: true,
			};
		}
		return resolved;
	}, [event]);
	const handleStatusChange = async (newStatus) => {
		try {
			const persistedStatus = await updateLeaveStatus(
				event.erpName,
				newStatus
			);

			// 🔄 Update local calendar state immediately
			const updatedCalendarLeave = {
				...event,
				status: persistedStatus,
			};

			updateEvent(updatedCalendarLeave);

			toast.success(`Leave Application ${persistedStatus}`);

			setOpen(false);

		} catch (err) {
			console.error("Failed to update status", err);
			// Show ERPNext's actual reason (e.g. insufficient balance) when it
			// refused the write, not a generic message that hides the cause.
			toast.error(err?.message || "Failed to update leave status");
		}
	};
	return (
		<>
			<ScrollArea className="max-h-[68vh]">
				<div className="space-y-5 p-1">
					<DetailSummary
						title={
							<>
								{leaveType || "Leave"}
								{leaveDays > 0 ? (
									<>
										{" · "}
										<span className="text-rose-600">
											{leaveDays} {leaveDays <= 1 ? "Day" : "Days"}
										</span>
									</>
								) : null}
							</>
						}
						subtitle={
							formattedRange ? (
								<>
									{formattedRange}
									{available !== null ? (
										<span className="block">
											{String(available).padStart(2, "0")} days available
										</span>
									) : null}
								</>
							) : null
						}
						status={status}
						accentClassName="bg-rose-500"
					/>
					<SharedToBlock event={event} />
					<EventDetailsFields
						event={eventWithOptions}
						config={tagConfig}
						use24HourFormat={use24HourFormat}
					/>
				</div>
			</ScrollArea>

			<DetailFooter>
				{/* OWNER */}
				{permissions.canEditDelete && (
					<div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
						<AddEditEventDialog
							event={event}
							forceValues={editAction?.setOnEdit}
						>
							<Button variant="outline" className="w-full sm:w-auto">
								{editAction?.label ?? "Edit"}
							</Button>
						</AddEditEventDialog>

						<DeleteEventDialog
							className="w-full sm:w-auto"
							onConfirm={() => handleDelete(event.erpName, "Leave Application", event)}
						/>
					</div>
				)}

				{/* MANAGER */}
				{permissions.canApproveReject && (
					<div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
						<Button
							className="w-full sm:w-auto"
							onClick={() => handleStatusChange("Approved")}
						>
							Approve
						</Button>

						<Button
							variant="destructive"
							className="w-full sm:w-auto"
							onClick={() => handleStatusChange("Rejected")}
						>
							Reject
						</Button>
					</div>
				)}
			</DetailFooter>
		</>
	);
}


export function EventDetailsFields({ event, config, use24HourFormat }) {
	if (!config?.details?.layout) return null;

	const { layout, fields } = config.details;
	const flatFields = layout
		.flatMap((row) => row.fields)
		.map((key) => ({ key, ...fields[key] }))
		.filter((field) => field?.label);

	const descriptionField = flatFields.find((field) => field.key === "description");
	const gridFields = flatFields.filter((field) => field.key !== "description");

	// A field's label may be a function of the event (e.g. the approver label
	// changes with status: "Approver" while pending vs "Approved By" once done).
	const resolveLabel = (field) =>
		typeof field.label === "function" ? field.label(event) : field.label;

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
						<DetailItem key={field.key} icon={Icon} label={resolveLabel(field)}>
							{value}
						</DetailItem>
					);
				})}
			</DetailGrid>

			{descriptionField && event.description ? (
				<DetailItem icon={ICONS["text"]} label={resolveLabel(descriptionField)}>
					<div className="prose prose-sm dark:prose-invert max-w-none">
						<TiptapViewer content={event.description} />
					</div>
				</DetailItem>
			) : null}
		</div>
	);
}
