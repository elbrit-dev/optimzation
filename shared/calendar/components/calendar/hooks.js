import { useEffect, useState } from "react";
import { TAG_IDS } from "@calendar/components/calendar/constants";
import { useRef } from "react";
import { toast } from "sonner";
import { deleteEventFromErp } from "@calendar/components/calendar/module/event/services/event.service";
import {
  discardQueuedSubmission,
} from "@calendar/lib/calendar/submission-queue";
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
	// `initialValue` arrives as a fresh object literal on every render at the call
	// sites (see "calendar-settings" in calendar-context), so it must never reach a
	// dependency array. Pin the mount-time value in a ref instead: it is the very
	// object `useState` captured below, so writing it back is an Object.is bail-out
	// rather than a new identity that would re-render.
	const initialValueRef = useRef(initialValue);

	// The first render has to match the server HTML, so state starts at
	// `initialValue` and the persisted value is adopted in the effect below.
	// Reading localStorage in the `useState` initialiser instead would hydrate-mismatch.
	const [storedValue, setStoredValue] = useState(initialValue);

	// Keyed on `key` ALONE — this reads once per key, never once per render.
	// Depending on `initialValue` here was an infinite loop: each run stored a
	// freshly parsed object, that re-rendered, the re-render produced a new literal,
	// the new literal re-armed the effect, until React gave up with
	// "Maximum update depth exceeded" (minified React error #185) and the page died.
	useEffect(() => {
		if (typeof window === "undefined") return;

		try {
			const item = window.localStorage.getItem(key);
			setStoredValue(item ? JSON.parse(item) : initialValueRef.current);
		} catch (error) {
			console.warn(`Error reading localStorage key "${key}":`, error);
			setStoredValue(initialValueRef.current);
		}
	}, [key]);

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

export function useDeleteEvent({ removeEvent, onClose }) {
  const deleteLockRef = useRef(false);

  const handleDelete = async (erpName, docname, event) => {
    if (deleteLockRef.current) return;
    deleteLockRef.current = true;

    try {
      if (event?.__pendingDelete) {
        toast.info("Delete is already queued for sync.");
        return;
      }

      const queueId = event?.__localQueueId;
      const isLocalOnly =
        !!queueId || String(erpName ?? "").startsWith("local-");

      if (isLocalOnly) {
        discardQueuedSubmission({
          queueId,
          erpName,
        });
        removeEvent(erpName);
        onClose?.();
        toast.success("Queued event removed.");
        return;
      }

      await deleteEventFromErp(erpName, docname);
      discardQueuedSubmission({
        erpName,
      });
      removeEvent(erpName);
      onClose?.();
      toast.success("Event deleted.");
    } catch (e) {
      const message =
        e?.response?.errors?.[0]?.message ||
        e?.graphQLErrors?.[0]?.message ||
        e?.message ||
        "Error deleting event.";
      toast.error(message);
    } finally {
      deleteLockRef.current = false;
    }
  };

  return { handleDelete };
}
