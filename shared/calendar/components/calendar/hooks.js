import { useEffect, useState, useMemo } from "react";
import { differenceInCalendarDays } from "date-fns";
import { TAG_IDS } from "@calendar/components/calendar/constants";
import { fetchEmployeeLeaveBalance } from "@calendar/services/event.service";
import { LOGGED_IN_USER } from "@calendar/components/auth/calendar-users";
import { normalizeMeetingTimes, normalizeNonMeetingDates, syncPobItemRates } from "@calendar/lib/helper";
import { loadParticipantOptionsByTag } from "@calendar/lib/participants";

export function useDisclosure({
	defaultIsOpen = false
} = {}) {
	const [isOpen, setIsOpen] = useState(defaultIsOpen);

	const onOpen = () => setIsOpen(true);
	const onClose = () => setIsOpen(false);
	const onToggle = () => setIsOpen((currentValue) => !currentValue);

	return { onOpen, onClose, isOpen, onToggle };
}

export const useLocalStorage = (key, initialValue) => {
	const readValue = () => {
		if (typeof window === "undefined") {
			return initialValue;
		}

		try {
			const item = window.localStorage.getItem(key);
			return item ? (JSON.parse(item)) : initialValue;
		} catch (error) {
			console.warn(`Error reading localStorage key "${key}":`, error);
			return initialValue;
		}
	};

	const [storedValue, setStoredValue] = useState(readValue);

	const setValue = (value) => {
		try {
			const valueToStore =
				value instanceof Function ? value(storedValue) : value;
			setStoredValue(valueToStore);
			if (typeof window !== "undefined") {
				window.localStorage.setItem(key, JSON.stringify(valueToStore));
			}
		} catch (error) {
			console.warn(`Error setting localStorage key "${key}":`, error);
		}
	};

	return [storedValue, setValue];
};

export function useMediaQuery(query) {
	const [matches, setMatches] = useState(false);

	useEffect(() => {
		const media = window.matchMedia(query);
		if (media.matches !== matches) {
			setMatches(media.matches);
		}

		const listener = () => setMatches(media.matches);
		media.addEventListener("change", listener);

		return () => media.removeEventListener("change", listener);
	}, [matches, query]);

	return matches;
}

export const useSubmissionRouter = ({
	isEditing,
	handleLeave,
	handleTodo,
	handleDoctorVisitPlan,
	handleDefaultEvent,
}) => {
	return {
		[TAG_IDS.LEAVE]: handleLeave,
		[TAG_IDS.TODO_LIST]: handleTodo,
		[TAG_IDS.DOCTOR_VISIT_PLAN]: async (values) => {
			if (isEditing) return handleDefaultEvent(values);
			if (Array.isArray(values.doctor) && values.doctor.length)
				return handleDoctorVisitPlan(values);
		},
		default: handleDefaultEvent,
	};
};
