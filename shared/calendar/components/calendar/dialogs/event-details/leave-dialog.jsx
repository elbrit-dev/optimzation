"use client";;
import { useEffect, useState, useMemo } from "react";
import { format, parseISO, differenceInCalendarDays } from "date-fns";
import { Button } from "@calendar/components/ui/button";
import { TAG_FORM_CONFIG } from "@calendar/lib/calendar/form-config";
import { ScrollArea } from "@calendar/components/ui/scroll-area";
import { useCalendar } from "@calendar/components/calendar/contexts/calendar-context";
import { AddEditEventDialog } from "@calendar/components/calendar/dialogs/add-edit-event-dialog";
import { buildParticipantsWithDetails } from "@calendar/lib/helper";
import { resolveDisplayValueFromEvent } from "@calendar/lib/calendar/resolveDisplay";
import { useDeleteEvent } from "../../hooks";
import { ICONS } from "../event-details-dialog";
import { useEmployeeResolvers } from "@calendar/lib/employeeResolver";
import { fetchEmployeeLeaveBalance, updateLeaveStatus } from "@calendar/services/event.service";
import { LOGGED_IN_USER } from "@calendar/components/auth/calendar-users";
import { resolveLeavePermissions } from "@calendar/lib/leavePermissions";
import { toast } from "sonner";

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

	useEffect(() => {
		let alive = true;

		fetchEmployeeLeaveBalance(LOGGED_IN_USER.id)
			.then((data) => {
				if (!alive) return;
				setLeaveBalance(data);
			})
			.catch(() => setLeaveBalance(null));

		return () => {
			alive = false;
		};
	}, []);

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

	const totalDays =
		start && end
			? differenceInCalendarDays(end, start) + 1
			: 0;

	const formattedRange =
		start && end
			? `${format(start, "d MMM yyyy")} - ${format(end, "d MMM yyyy")} (${totalDays} ${totalDays === 1 ? "day" : "days"
			})`
			: null;

	const status = event.status;
	const leaveType = event.leaveType;

	const available =
		leaveBalance?.[leaveType]?.available ?? null;
	const permissions = useMemo(() => {
		return resolveLeavePermissions({ event });
	}, [event]);
	const handleStatusChange = async (newStatus) => {
		try {
			await updateLeaveStatus(event.erpName, newStatus);

			// 🔄 Update local calendar state immediately
			const updatedCalendarLeave = {
				...event,
				status: newStatus,
			};

			updateEvent(updatedCalendarLeave);

			toast.success(`Leave Application ${newStatus}`);

			setOpen(false);

		} catch (err) {
			console.error("Failed to update status", err);
			toast.error("Failed to update leave status");
		}
	};
	return (
		<>
			<ScrollArea className="max-h-[80vh]">
				<div className="p-2">
					{/* 🔷 HEADER ROW */}
					<div className="flex items-start justify-between">
						<div className="space-y-1">
							<p className="text-base font-medium">
								{formattedRange}
							</p>

							{available !== null && (
								<p className="text-sm text-muted-foreground">
									{String(available).padStart(2, "0")} Days Available
								</p>
							)}
						</div>

						<div>
							<span className="text-sm font-medium text-orange-500">
								{status}
							</span>
						</div>
					</div>
					<EventDetailsFields
						event={eventWithOptions}
						config={tagConfig}
						use24HourFormat={use24HourFormat}
					/>
				</div>
			</ScrollArea>
			<div className="flex justify-end gap-2">

				{/* OWNER */}
				{permissions.canEditDelete && (
					<>
						<AddEditEventDialog
							event={event}
							forceValues={editAction?.setOnEdit}
						>
							<Button variant="outline">
								{editAction?.label ?? "Edit"}
							</Button>
						</AddEditEventDialog>

						<Button
							variant="destructive"
							onClick={() => handleDelete(event.erpName,"Leave Application")}
						>
							Delete
						</Button>
					</>
				)}

				{/* MANAGER */}
				{permissions.canApproveReject && (
					<>
						<Button onClick={() => handleStatusChange("Approved")}>
							Approve
						</Button>

						<Button
							variant="destructive"
							onClick={() => handleStatusChange("Rejected")}
						>
							Reject
						</Button>

					</>
				)}
			</div>

		</>
	);
}


export function EventDetailsFields({ event, config, use24HourFormat }) {
	if (!config?.details?.layout) return null;

	const { layout, fields } = config.details;

	return (
		<div className="space-y-6">
			{layout.map((row, rowIndex) => (
				<div
					key={rowIndex}
					className={`grid gap-6 ${row.columns === 2 ? "grid-cols-2" : "grid-cols-1"
						}`}
				>
					{row.fields.map((fieldKey) => {
						const field = fields[fieldKey];
						if (!field) return null;

						const Icon = ICONS[field.type] ?? ICONS["text"];

						const value = resolveDisplayValueFromEvent({
							event,
							field: { ...field, key: fieldKey },
							use24HourFormat,
						});

						if (!value) return null;

						return (
							<div key={fieldKey} className="space-y-1">
								<p className="text-sm font-medium text-muted-foreground">
									{field.label}
								</p>

								{/* Description HTML */}
								{fieldKey === "description" ? (
									<div
										className="prose prose-sm dark:prose-invert max-w-none"
										dangerouslySetInnerHTML={{ __html: value }}
									/>
								) : (
									<p className="text-sm">{value}</p>
								)}
							</div>
						);
					})}
				</div>
			))}
		</div>
	);
}
