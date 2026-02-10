"use client";;
import { motion } from "framer-motion";
import { Plus } from "lucide-react";
import { Button } from "@calendar/components/ui/button";
import {
	slideFromLeft,
	slideFromRight,
	transition,
} from "@calendar/components/calendar/animations";
import { startOfDay,isBefore } from "date-fns";
import { useCalendar } from "@calendar/components/calendar/contexts/calendar-context";
import { AddEditEventDialog } from "@calendar/components/calendar/dialogs/add-edit-event-dialog";
import { DateNavigator } from "@calendar/components/calendar/header/date-navigator";
import { TodayButton } from "@calendar/components/calendar/header/today-button";
import FilterEvents from "@calendar/components/calendar/header/filter";
import { UserSelect } from "@calendar/components/calendar/header/user-select";
import { Settings } from "@calendar/components/calendar/settings/settings";
import Views from "@calendar/components/calendar/header/view-tabs";

export function CalendarHeader() {
	const { view, events,activeDate, selectedDate  } = useCalendar();
	const today = startOfDay(new Date());

const candidateDate = activeDate ?? selectedDate ?? null;

const isPast =
  candidateDate &&
  isBefore(startOfDay(candidateDate), today);

const startDateForDialog = isPast ? undefined : candidateDate;
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
					<Views />
				</div>

				<div className="flex flex-row gap-4  lg:items-center lg:gap-1.5">
					<UserSelect />
					<div className="hidden md:block">
						<AddEditEventDialog startDate={startDateForDialog}>
							<Button>
								<Plus className="h-4 w-4" />
								Add Event
							</Button>
						</AddEditEventDialog>
					</div>
				<div className="flex gap-2 flex-row lg:items-center lg:gap-1.5">
					<FilterEvents />
					<Settings />
				</div>
				</div>
			</motion.div>
		</div>
	);
}
