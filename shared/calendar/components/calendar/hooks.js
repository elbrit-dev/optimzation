import { useEffect, useState } from "react";
import { TAG_IDS } from "@calendar/components/calendar/constants";
import { useRef } from "react";
import { toast } from "sonner";
import { deleteEventFromErp } from "@calendar/components/calendar/module/event/services/event.service";
import {
  discardQueuedSubmission,
} from "@calendar/lib/calendar/submission-queue";
const OVERLAY_HISTORY_FLAG = "__calendarOverlayLayer";

function isEditableElement(element) {
  if (!element) return false;

  const tagName = element.tagName;
  if (tagName === "TEXTAREA") return true;
  if (tagName === "INPUT") {
    // Checkbox/radio/button inputs never raise a keyboard.
    return !["checkbox", "radio", "button", "submit", "reset", "range"].includes(
      element.type
    );
  }

  return element.isContentEditable === true;
}

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
	// Callers pass `initialValue` as an inline object literal, so its identity
	// changes on every render. Keep it in a ref so it can never be an effect
	// dependency - having it in the hydration deps below re-ran the effect on
	// every render, and `JSON.parse` always returns a fresh object, so the
	// setState never bailed out and the tree looped until React threw #185
	// ("Maximum update depth exceeded").
	const initialValueRef = useRef(initialValue);
	initialValueRef.current = initialValue;

	// Render the server / first client pass with the fallback so hydration
	// matches, then read localStorage once the component is mounted.
	const [storedValue, setStoredValue] = useState(initialValue);

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

/**
 * Makes the device back gesture close an open overlay instead of leaving the
 * calendar.
 *
 * Back on Android is history navigation, so with a dialog open it popped the
 * calendar route and dropped the user on the overview page, throwing away the
 * form they were filling in. While `isOpen`, a throwaway history entry stands
 * in for the overlay: back pops that entry, `onBack` closes the overlay, and
 * the route never changes.
 *
 * The listener runs in the capture phase and stops the event there, so the host
 * router (Next's, here) never sees the pop and does not re-render the route.
 */
export function useBackToClose(isOpen, onBack) {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    if (!isOpen || typeof window === "undefined") return;

    const pushLayerEntry = () => {
      window.history.pushState(
        { ...window.history.state, [OVERLAY_HISTORY_FLAG]: true },
        ""
      );
    };

    const swallowPop = (popEvent) => {
      popEvent.stopImmediatePropagation();
    };

    const handlePop = (popEvent) => {
      swallowPop(popEvent);

      // Back unwinds one layer at a time, closing the overlay only when it is
      // the last thing standing — losing a half-filled form to a stray back
      // press is not recoverable.

      // 1. A combobox or date popover on top of the overlay is its own layer;
      //    Escape is what Radix listens for.
      if (document.querySelector("[data-radix-popper-content-wrapper]")) {
        pushLayerEntry();
        document.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
        );
        return;
      }

      // 2. An open soft keyboard is a layer to the user even though the browser
      //    reports nothing about it: blurring the field is what dismisses it.
      if (isEditableElement(document.activeElement)) {
        pushLayerEntry();
        document.activeElement.blur();
        return;
      }

      onBackRef.current?.();
    };

    pushLayerEntry();
    window.addEventListener("popstate", handlePop, true);

    return () => {
      window.removeEventListener("popstate", handlePop, true);

      // Closing through the UI (Cancel / Update / X) has to drop the entry too,
      // or the next back press is spent on a layer that is already gone. Guarded
      // on our own flag, so unmounting through a real navigation never rewinds
      // the user's history.
      if (!window.history.state?.[OVERLAY_HISTORY_FLAG]) return;

      window.addEventListener("popstate", swallowPop, true);
      window.history.back();
      window.setTimeout(
        () => window.removeEventListener("popstate", swallowPop, true),
        500
      );
    };
  }, [isOpen]);
}
