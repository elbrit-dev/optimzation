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
			<ScrollArea className="max-h-[68vh]">
				<div className="space-y-5 p-1">
					<DetailSummary
						title={leaveType ? `${leaveType}` : "Leave"}
						subtitle={
							formattedRange
								? available !== null
									? `${formattedRange} · ${String(available).padStart(2, "0")} days available`
									: formattedRange
								: null
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
					<div className="prose prose-sm dark:prose-invert max-w-none">
						<TiptapViewer content={event.description} />
					</div>
				</DetailItem>
			) : null}
		</div>
	);
}
