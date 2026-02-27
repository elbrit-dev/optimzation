import {
	addDays,
	addMonths,
	addWeeks,
	addYears,
	differenceInDays,
	differenceInMinutes,
	eachDayOfInterval,
	endOfMonth,
	endOfWeek,
	endOfYear,
	format,
	isSameDay,
	isSameMonth,
	isSameWeek,
	isSameYear,
	isValid,
	parseISO,
	startOfDay,
	startOfMonth,
	startOfWeek,
	startOfYear,
	subDays,
	subMonths,
	subWeeks,
	subYears,
} from "date-fns";
import { useCalendar } from "@calendar/components/calendar/contexts/calendar-context";

const FORMAT_STRING = "MMM d, yyyy";

export function rangeText(view, date) {
	let start;
	let end;

	switch (view) {
		case "month":
			start = startOfMonth(date);
			end = endOfMonth(date);
			break;
		case "week":
			start = startOfWeek(date);
			end = endOfWeek(date);
			break;
		case "day":
			return format(date, FORMAT_STRING);
		case "year":
			start = startOfYear(date);
			end = endOfYear(date);
			break;
		case "agenda":
			start = startOfMonth(date);
			end = endOfMonth(date);
			break;
		default:
			return "Error while formatting";
	}

	return `${format(start, FORMAT_STRING)} - ${format(end, FORMAT_STRING)}`;
}

export function navigateDate(date, view, direction) {
	const operations = {
		month: direction === "next" ? addMonths : subMonths,
		week: direction === "next" ? addWeeks : subWeeks,
		day: direction === "next" ? addDays : subDays,
		year: direction === "next" ? addYears : subYears,
		agenda: direction === "next" ? addMonths : subMonths,
	};

	return operations[view](date, 1);
}

export function getEventsCount(events, date, view) {
	const compareFns = {
		day: isSameDay,
		week: isSameWeek,
		month: isSameMonth,
		year: isSameYear,
		agenda: isSameMonth,
	};

	const compareFn = compareFns[view];
	return events.filter((event) => compareFn(parseISO(event.startDate), date))
		.length;
}

export function groupEvents(dayEvents) {
	const sortedEvents = dayEvents.sort(
        (a, b) => parseISO(a.startDate).getTime() - parseISO(b.startDate).getTime()
    );
	const groups = [];

	for (const event of sortedEvents) {
		const eventStart = parseISO(event.startDate);
		let placed = false;

		for (const group of groups) {
			const lastEventInGroup = group[group.length - 1];
			const lastEventEnd = parseISO(lastEventInGroup.endDate);

			if (eventStart >= lastEventEnd) {
				group.push(event);
				placed = true;
				break;
			}
		}

		if (!placed) groups.push([event]);
	}

	return groups;
}

export function getEventBlockStyle(
	event,
	day,
	groupIndex,
	groupSize,
) {
	const startDate = parseISO(event.startDate);
	const dayStart = startOfDay(day); // Use startOfDay instead of manual reset
	const eventStart = startDate < dayStart ? dayStart : startDate;
	const startMinutes = differenceInMinutes(eventStart, dayStart);

	const top = (startMinutes / 1440) * 100; // 1440 minutes in a day
	const width = 100 / groupSize;
	const left = groupIndex * width;

	return { top: `${top}%`, width: `${width}%`, left: `${left}%` };
}

export function getCalendarCells(selectedDate) {
	const year = selectedDate.getFullYear();
	const month = selectedDate.getMonth();

	const daysInMonth = endOfMonth(selectedDate).getDate(); // Faster than new Date(year, month + 1, 0)
	const firstDayOfMonth = startOfMonth(selectedDate).getDay();
	const daysInPrevMonth = endOfMonth(new Date(year, month - 1)).getDate();
	const totalDays = firstDayOfMonth + daysInMonth;

	const prevMonthCells = Array.from({ length: firstDayOfMonth }, (_, i) => ({
		day: daysInPrevMonth - firstDayOfMonth + i + 1,
		currentMonth: false,
		date: new Date(year, month - 1, daysInPrevMonth - firstDayOfMonth + i + 1),
	}));

	const currentMonthCells = Array.from({ length: daysInMonth }, (_, i) => ({
		day: i + 1,
		currentMonth: true,
		date: new Date(year, month, i + 1),
	}));

	const nextMonthCells = Array.from({ length: (7 - (totalDays % 7)) % 7 }, (_, i) => ({
        day: i + 1,
        currentMonth: false,
        date: new Date(year, month + 1, i + 1),
    }));

	return [...prevMonthCells, ...currentMonthCells, ...nextMonthCells];
}

export function calculateMonthEventPositions(multiDayEvents, singleDayEvents, selectedDate) {
	const monthStart = startOfMonth(selectedDate);
	const monthEnd = endOfMonth(selectedDate);

	const eventPositions = {};
	const occupiedPositions = {};

	eachDayOfInterval({ start: monthStart, end: monthEnd }).forEach((day) => {
		occupiedPositions[day.toISOString()] = [false, false, false];
	});

	const sortedEvents = [
		...multiDayEvents.sort((a, b) => {
			const aDuration = differenceInDays(parseISO(a.endDate), parseISO(a.startDate));
			const bDuration = differenceInDays(parseISO(b.endDate), parseISO(b.startDate));
			return (bDuration - aDuration || parseISO(a.startDate).getTime() - parseISO(b.startDate).getTime());
		}),
		...singleDayEvents.sort((a, b) =>
            parseISO(a.startDate).getTime() - parseISO(b.startDate).getTime()),
	];

	sortedEvents.forEach((event) => {
		const eventStart = parseISO(event.startDate);
		const eventEnd = parseISO(event.endDate);
		const eventDays = eachDayOfInterval({
			start: eventStart < monthStart ? monthStart : eventStart,
			end: eventEnd > monthEnd ? monthEnd : eventEnd,
		});

		let position = -1;

		for (let i = 0; i < 3; i++) {
			if (
				eventDays.every((day) => {
					const dayPositions = occupiedPositions[startOfDay(day).toISOString()];
					return dayPositions && !dayPositions[i];
				})
			) {
				position = i;
				break;
			}
		}

		if (position !== -1) {
			eventDays.forEach((day) => {
				const dayKey = startOfDay(day).toISOString();
				occupiedPositions[dayKey][position] = true;
			});
			eventPositions[event.id] = position;
		}
	});

	return eventPositions;
}

export function getMonthCellEvents(
	date,
	events,
	eventPositions,
) {
	const dayStart = startOfDay(date);
	const eventsForDate = events.filter((event) => {
		const eventStart = parseISO(event.startDate);
		const eventEnd = parseISO(event.endDate);
		return ((dayStart >= eventStart && dayStart <= eventEnd) ||
        isSameDay(dayStart, eventStart) || isSameDay(dayStart, eventEnd));
	});

	return eventsForDate
		.map((event) => ({
			...event,
			position: eventPositions[event.id] ?? -1,
			isMultiDay: event.startDate !== event.endDate,
		}))
		.sort((a, b) => {
			if (a.isMultiDay && !b.isMultiDay) return -1;
			if (!a.isMultiDay && b.isMultiDay) return 1;
			return a.position - b.position;
		});
}

export function formatTime(date, use24HourFormat) {
	const parsedDate = typeof date === "string" ? parseISO(date) : date;
	if (!isValid(parsedDate)) return "";
	return format(parsedDate, use24HourFormat ? "HH:mm" : "h:mm a");
}
export function normalizeChecklistToERP(html = "") {
	if (!html) return "";
  
	const parser = new DOMParser();
	const doc = parser.parseFromString(html, "text/html");
	const root = doc.body;
  
	// 🔹 Convert task items to Quill format
	root.querySelectorAll('li[data-type="taskItem"]').forEach((li) => {
	  const checked = li.getAttribute("data-checked") === "true";
  
	  li.removeAttribute("data-type");
	  li.removeAttribute("data-checked");
	  li.setAttribute("data-list", checked ? "checked" : "unchecked");
  
	  const span = document.createElement("span");
	  span.className = "ql-ui";
	  span.setAttribute("contenteditable", "false");
  
	  const p = li.querySelector("p");
  
	  if (p) {
		li.innerHTML = "";
		li.appendChild(span);
		li.innerHTML += p.innerHTML;
	  } else {
		li.prepend(span);
	  }
	});
  
	// 🔹 Convert UL[data-type="taskList"] → OL
	root.querySelectorAll('ul[data-type="taskList"]').forEach((ul) => {
	  const ol = document.createElement("ol");
	  ol.innerHTML = ul.innerHTML;
	  ul.replaceWith(ol);
	});
  
	return `<div class="ql-editor read-mode">${root.innerHTML}</div>`;
  }
  export function normalizeChecklistFromERP(html = "") {
	if (!html) return "";
  
	const parser = new DOMParser();
	const doc = parser.parseFromString(html, "text/html");
  
	const wrapper = doc.querySelector(".ql-editor");
	const root = wrapper || doc.body;
  
	// 🔹 Convert Quill checklist items
	root.querySelectorAll("li[data-list]").forEach((li) => {
	  const checked = li.getAttribute("data-list") === "checked";
  
	  li.removeAttribute("data-list");
	  li.setAttribute("data-type", "taskItem");
	  li.setAttribute("data-checked", checked ? "true" : "false");
  
	  // Remove quill span
	  const span = li.querySelector(".ql-ui");
	  if (span) span.remove();
  
	  // Wrap content in <p> if needed
	  if (!li.querySelector("p")) {
		const p = document.createElement("p");
		p.innerHTML = li.innerHTML;
		li.innerHTML = "";
		li.appendChild(p);
	  }
	});
  
	// 🔹 Convert OL containing checklist → taskList UL
	root.querySelectorAll("ol").forEach((ol) => {
	  if (ol.querySelector('[data-type="taskItem"]')) {
		const ul = document.createElement("ul");
		ul.setAttribute("data-type", "taskList");
		ul.innerHTML = ol.innerHTML;
		ol.replaceWith(ul);
	  }
	});
  
	return root.innerHTML;
  }
// -----------------------------
// GEO UTILS
// -----------------------------
const toRad = (value) => (value * Math.PI) / 180;

export function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in KM

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

export function parseLatLong(value) {
  if (!value) return null;

  try {
    const parsed =
      typeof value === "string" ? JSON.parse(value) : value;

    if (!parsed || parsed.x == null || parsed.y == null) {
      return null;
    }

    return {
      lat: Number(parsed.x),
      lng: Number(parsed.y),
    };
  } catch (err) {
    console.error("Invalid lat long:", err);
    return null;
  }
}
export function getPriorityClass(priority) {
	switch (priority) {
	  case "High":
		return "text-red-600";
	  case "Medium":
		return "text-orange-500";
	  case "Low":
		return "text-green-600";
	  default:
		return "text-muted-foreground";
	}
  }
  
 export function getStatusBadgeClass(status) {
	switch (status) {
	  case "Open":
		return "bg-orange-400";
	  case "Closed":
		return "bg-green-600";
	  default:
		return "bg-gray-400";
	}
  }
export const getFirstLetters = str => {
	if (!str) return "";
	const words = str.split(" ");
	if (words.length === 1) return words[0].charAt(0).toUpperCase();
	return `${words[0].charAt(0).toUpperCase()}${words[1].charAt(0).toUpperCase()}`;
};

export const getEventsForDay = (events, date, isWeek = false) => {
	const targetDate = startOfDay(date);
	return events
		.filter((event) => {
			const startOfDayForEventStart = startOfDay(parseISO(event.startDate));
			const startOfDayForEventEnd = startOfDay(parseISO(event.endDate));
			if (isWeek) {
				return (
					event.startDate !== event.endDate &&
					startOfDayForEventStart <= targetDate &&
					startOfDayForEventEnd >= targetDate
				);
			}
			return (
				startOfDayForEventStart <= targetDate &&
				startOfDayForEventEnd >= targetDate
			);
		})
		.map((event) => {
			const eventStart = startOfDay(parseISO(event.startDate));
			const eventEnd = startOfDay(parseISO(event.endDate));
			let point;

			if (isSameDay(eventStart, eventEnd)) {
				point = "none";
			} else if (isSameDay(eventStart, targetDate)) {
				point = "start";
			} else if (isSameDay(eventEnd, targetDate)) {
				point = "end";
			}

			return { ...event, point };
		});
};

export const getWeekDates = date => {
	const startDate = startOfWeek(date, { weekStartsOn: 1 });
	return Array.from({ length: 7 }, (_, i) => addDays(startDate, i));
};

export const getEventsForWeek = (events, date) => {
	const weekDates = getWeekDates(date);
	const startOfWeekDate = weekDates[0];
	const endOfWeekDate = weekDates[6];

	return events.filter((event) => {
		const eventStart = parseISO(event.startDate);
		const eventEnd = parseISO(event.endDate);
		return (isValid(eventStart) &&
        isValid(eventEnd) &&
        eventStart <= endOfWeekDate && eventEnd >= startOfWeekDate);
	});
};

export const getEventsForMonth = (events, date) => {
	const startOfMonthDate = startOfMonth(date);
	const endOfMonthDate = endOfMonth(date);

	return events.filter((event) => {
		const eventStart = parseISO(event.startDate);
		const eventEnd = parseISO(event.endDate);
		return (isValid(eventStart) &&
        isValid(eventEnd) &&
        eventStart <= endOfMonthDate && eventEnd >= startOfMonthDate);
	});
};

export const getEventsForYear = (events, date) => {
	if (!events || !Array.isArray(events) || !isValid(date)) return [];

	const startOfYearDate = startOfYear(date);
	const endOfYearDate = endOfYear(date);

	return events.filter((event) => {
		const eventStart = parseISO(event.startDate);
		const eventEnd = parseISO(event.endDate);
		return (isValid(eventStart) &&
        isValid(eventEnd) &&
        eventStart <= endOfYearDate && eventEnd >= startOfYearDate);
	});
};

export const getColorClass = color => {
	const colorClasses = {
		red: "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300",
		yellow:
			"border-yellow-200 bg-yellow-50 text-yellow-700 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-300",
		green:
			"border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300",
		blue: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300",
		orange:
			"border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-300",
		purple:
			"border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-300",
	};
	return colorClasses[color] || "";
};

export const getBgColor = color => {
	const colorClasses = {
		red: "bg-red-400 dark:bg-red-600",
		yellow: "bg-yellow-400 dark:bg-yellow-600",
		green: "bg-green-400 dark:bg-green-600",
		blue: "bg-blue-400 dark:bg-blue-600",
		orange: "bg-orange-400 dark:bg-orange-600",
		purple: "bg-purple-400 dark:bg-purple-600",
		teal: "bg-teal-400 dark:bg-teal-600", 
	};
	return colorClasses[color] || "";
};

export const useGetEventsByMode = (events) => {
	const { view, selectedDate } = useCalendar();

	switch (view) {
		case "day":
			return getEventsForDay(events, selectedDate);
		case "week":
			return getEventsForWeek(events, selectedDate);
		case "agenda":
		case "month":
			return getEventsForMonth(events, selectedDate);
		case "year":
			return getEventsForYear(events, selectedDate);
		default:
			return [];
	}
};

export const toCapitalize = str => {
	if (!str) return "";
	return str.charAt(0).toUpperCase() + str.slice(1);
};
