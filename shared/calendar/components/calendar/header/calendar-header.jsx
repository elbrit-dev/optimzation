"use client";;
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Plus, RotateCw } from "lucide-react";
import { Button } from "@calendar/components/ui/button";
import { LOGGED_IN_USER } from "@calendar/components/auth/calendar-users";
import { isEmployeeOnApprovedLeave } from "@calendar/lib/calendar/leaveDay";
import {
	slideFromLeft,
	slideFromRight,
	transition,
} from "@calendar/components/calendar/animations";
import { startOfDay, isBefore } from "date-fns";
import { useCalendar } from "@calendar/components/calendar/contexts/calendar-context";
import { AddEditEventDialog } from "@calendar/components/calendar/dialogs/add-edit-event-dialog";
import { DateNavigator } from "@calendar/components/calendar/header/date-navigator";
import { TodayButton } from "@calendar/components/calendar/header/today-button";
import FilterEvents from "@calendar/components/calendar/header/filter";
import { UserSelect } from "@calendar/components/calendar/header/user-select";
import { Settings } from "@calendar/components/calendar/settings/settings";
import Views from "@calendar/components/calendar/header/view-tabs";
import GoogleCalendarConnect from "../google-auth";

export function CalendarHeader() {
	const {
		view,
		events,
		activeDate,
		selectedDate,
		pendingSyncCount,
		retryPendingSync,
		isRetryingSync,
		syncCalendar,
		allEvents,
	} = useCalendar();
	const [isSyncing, setIsSyncing] = useState(false);

	const handleSync = async () => {
		if (isSyncing) return;
		setIsSyncing(true);
		try {
			await syncCalendar();
		} catch (err) {
			console.error("Failed to sync calendar", err);
		} finally {
			setIsSyncing(false);
		}
	};
	const today = startOfDay(new Date());

	const candidateDate = activeDate ?? selectedDate ?? null;

	const isPast =
		candidateDate &&
		isBefore(startOfDay(candidateDate), today);

	const startDateForDialog = isPast ? undefined : candidateDate;

	// If the logged-in employee has an APPROVED leave covering the selected day,
	// they're off — adding an event that day is pointless, so disable it.
	const isOnLeaveOnSelectedDay = useMemo(
		() =>
			isEmployeeOnApprovedLeave(allEvents, LOGGED_IN_USER.id, candidateDate),
		[allEvents, candidateDate]
	);

	return (
		<div
			className="flex flex-col gap-4 border-b p-4 lg:flex-row lg:items-center lg:justify-between">
			<motion.div
				className="flex items-center gap-3"
				variants={slideFromLeft}
				initial="initial"
				animate="animate"
				transition={transition}>
				<TodayButton />
				<DateNavigator view={view} events={events} />
			</motion.div>
			<motion.div
				className="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-1.5"
				variants={slideFromRight}
				initial="initial"
				animate="animate"
				transition={transition}>
				<div className="options flex-wrap flex items-center gap-4 md:gap-2">
					<GoogleCalendarConnect />
					<Views />
				</div>

				<div className="flex flex-row gap-4  lg:items-center lg:gap-1.5">
					<UserSelect />
					<Button
						type="button"
						variant="outline"
						onClick={handleSync}
						disabled={isSyncing}
						aria-label="Sync calendar data"
						title="Refresh calendar data"
					>
						<RotateCw
							className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`}
						/>
						<span className="hidden sm:inline">
							{isSyncing ? "Syncing..." : "Sync"}
						</span>
					</Button>
					{pendingSyncCount > 0 && (
						<Button
							type="button"
							variant="outline"
							onClick={retryPendingSync}
							disabled={isRetryingSync}
						>
							<RotateCw className="h-4 w-4" />
							{isRetryingSync
								? "Retrying..."
								: `Retry Sync(${pendingSyncCount})`}
						</Button>
					)}
					<div className="hidden md:block">
						<AddEditEventDialog startDate={startDateForDialog}>
							<Button
								disabled={isOnLeaveOnSelectedDay}
								title={
									isOnLeaveOnSelectedDay
										? "You're on leave on this day"
										: undefined
								}
							>
								<Plus className="h-4 w-4" />
								Add Event
							</Button>
						</AddEditEventDialog>
					</div>
					<div className="flex gap-2 flex-row lg:items-center lg:gap-1.5">
						<FilterEvents variant={true} />
						<Settings />
					</div>
				</div>
			</motion.div>
		</div>
	);
}
