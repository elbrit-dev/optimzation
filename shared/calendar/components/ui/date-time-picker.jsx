import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Button } from "@calendar/components/ui/button";
import { Calendar } from "@calendar/components/ui/calendar";
import {
	FormControl,
	FormItem,
	FormLabel,
	FormMessage,
} from "@calendar/components/ui/form";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@calendar/components/ui/popover";
import { ScrollArea, } from "@calendar/components/ui/scroll-area";
import { cn } from "@calendar/lib/utils";
import { useCalendar } from "@calendar/components/calendar/contexts/calendar-context";
import { useState, useEffect } from "react";

export function DateTimePicker({
	form, label,
	field,
	allowAllDates = false,
	hideTime = false,
	defaultHour = 0,
	defaultMinute = 0,
	disabled = false,
	minDate,
	maxDate,
}) {
	const { use24HourFormat } = useCalendar();
	const [open, setOpen] = useState(false);

	useEffect(() => {
		if (!hideTime) return;
		if (form.formState.isDirty === false) return;
		const value = form.getValues(field.name);
		if (!value) return;

		const normalized = new Date(value);
		normalized.setHours(defaultHour);
		normalized.setMinutes(0);
		normalized.setSeconds(0);

		if (
			value.getHours() !== normalized.getHours() ||
			value.getMinutes() !== 0 ||
			value.getSeconds() !== 0
		) {
			form.setValue(field.name, normalized, { shouldDirty: false });
		}
	}, [hideTime]);


	const today = new Date();
	today.setHours(0, 0, 0, 0);

	function handleDateSelect(date) {
		if (!date) return;

		const newDate = new Date(date);

		if (hideTime) {
			newDate.setHours(defaultHour);
			newDate.setMinutes(defaultMinute);
			newDate.setSeconds(0);

			// ✅ close immediately for date-only picker
			setOpen(false);
		} else {
			const current = field.value ?? new Date();

			newDate.setHours(current.getHours());
			newDate.setMinutes(current.getMinutes());
			newDate.setSeconds(0);
		}
		form.setValue(field.name, newDate);
	}


	function handleTimeChange(type, value) {
		const currentDate = form.getValues(field.name) || new Date();
		const newDate = new Date(currentDate);

		if (type === "hour") {
			newDate.setHours(parseInt(value, 10));
		} else if (type === "minute") {
			newDate.setMinutes(parseInt(value, 10));
		} else if (type === "ampm") {
			const hours = newDate.getHours();
			if (value === "AM" && hours >= 12) {
				newDate.setHours(hours - 12);
			} else if (value === "PM" && hours < 12) {
				newDate.setHours(hours + 12);
			}
		}

		form.setValue(field.name, newDate);
	}
	const startDateValue = form.getValues("startDate");
	const normalizedStartDate =
		startDateValue
			? new Date(
				startDateValue.getFullYear(),
				startDateValue.getMonth(),
				startDateValue.getDate()
			)
			: null;
	const normalizedMinDate = minDate
		? new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate())
		: null;

	const normalizedMaxDate = maxDate
		? new Date(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate())
		: null;

	return (
		<FormItem className="flex flex-col">
			<FormLabel>
				{label ? label : field.name === "startDate" ? "Start Date" : "End Date"}
			</FormLabel>
			<Popover open={open} onOpenChange={setOpen} modal={false}>
				<PopoverTrigger asChild>
					<FormControl>
						<Button
							disabled={disabled}
							variant={"outline"}
							onMouseDown={(e) => e.preventDefault()}
							className={cn(
								"w-full pl-3 text-left font-normal",
								!field.value && "text-muted-foreground"
							)}>
							{field.value ? (
								format(
									field.value,
									hideTime ? "MM/dd/yyyy" :
										use24HourFormat
											? "MM/dd/yyyy HH:mm"
											: "MM/dd/yyyy hh:mm aa"
								)
							) : (
								<span>MM/DD/YYYY</span>
							)}
							<CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
						</Button>
					</FormControl>
				</PopoverTrigger>
				<PopoverContent className="w-auto p-0">
					<div className="sm:flex w-[220px]">
						<Calendar
							mode="single"
							selected={field.value}
							onSelect={handleDateSelect}
							initialFocus

							{...(allowAllDates && {
								captionLayout: "dropdown",
								fromYear: 1940,
								toYear: 2100,
							})}

							disabled={(date) => {
								if (allowAllDates) return false;

								const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());

								// 🔒 MIN DATE
								if (normalizedMinDate && day < normalizedMinDate) {
									return true;
								}

								// 🔒 MAX DATE
								if (normalizedMaxDate && day > normalizedMaxDate) {
									return true;
								}

								// Existing rules
								if (field.name === "startDate") {
									return day < today;
								}

								if (field.name === "endDate" && normalizedStartDate) {
									return day < normalizedStartDate;
								}

								return false;
							}}

						/>

						{!hideTime && (
							<div className="flex flex-col sm:flex-row sm:h-[300px] divide-y sm:divide-y-0 sm:divide-x">
								{/* HOURS */}
								<ScrollArea className="w-64 sm:w-auto">
									<div className="flex sm:flex-col p-2">
										{Array.from({ length: use24HourFormat ? 24 : 12 }, (_, i) => i).map(
											(hour) => (
												<Button
													key={hour}
													size="icon"
													onMouseDown={(e) => e.preventDefault()}
													variant={
														field.value &&
															field.value.getHours() %
															(use24HourFormat ? 24 : 12) ===
															hour %
															(use24HourFormat ? 24 : 12)
															? "default"
															: "ghost"
													}
													className="sm:w-full shrink-0 aspect-square"
													onClick={() =>
														handleTimeChange("hour", hour.toString())
													}
												>
													{hour.toString().padStart(2, "0")}
												</Button>
											)
										)}
									</div>
								</ScrollArea>

								{/* MINUTES */}
								<ScrollArea className="w-64 sm:w-auto">
									<div className="flex sm:flex-col p-2">
										{Array.from({ length: 12 }, (_, i) => i * 5).map((minute) => (
											<Button
												key={minute}
												onMouseDown={(e) => e.preventDefault()}
												size="icon"
												variant={
													field.value && field.value.getMinutes() === minute
														? "default"
														: "ghost"
												}
												className="sm:w-full shrink-0 aspect-square"
												onClick={() =>
													handleTimeChange("minute", minute.toString())
												}
											>
												{minute.toString().padStart(2, "0")}
											</Button>
										))}
									</div>
								</ScrollArea>
							</div>
						)}

					</div>
				</PopoverContent>
			</Popover>
			<FormMessage />
		</FormItem>
	);
}
