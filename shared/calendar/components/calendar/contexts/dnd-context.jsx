"use client";;
import React, { createContext, useCallback, useContext, useRef, useState, useMemo } from "react";
import { toast } from "sonner";
import { useCalendar } from "@calendar/components/calendar/contexts/calendar-context";
import { DndConfirmationDialog } from "@calendar/components/calendar/dialogs/dnd-confirmation-dialog";

const DragDropContext = createContext(undefined);

export function DndProvider({
    children,
    showConfirmation: showConfirmationProp = false
}) {
	const { updateEvent } = useCalendar();
	const [dragState, setDragState] = useState({ draggedEvent: null, isDragging: false });

	const [showConfirmation, setShowConfirmation] =
		useState(showConfirmationProp);

	const [pendingDropData, setPendingDropData] =
		useState(null);

	const onEventDroppedRef = useRef(null);

	const startDrag = useCallback((event) => {
		setDragState({ draggedEvent: event, isDragging: true });
	}, []);

	const endDrag = useCallback(() => {
		setDragState({ draggedEvent: null, isDragging: false });
	}, []);

	const calculateNewDates = useCallback((event, targetDate, hour, minute) => {
        const originalStart = new Date(event.startDate);
        const originalEnd = new Date(event.endDate);
        const duration = originalEnd.getTime() - originalStart.getTime();

        const newStart = new Date(targetDate);
        if (hour !== undefined) {
            newStart.setHours(hour, minute || 0, 0, 0);
        } else {
            newStart.setHours(originalStart.getHours(), originalStart.getMinutes(), 0, 0);
        }

        return {
            newStart,
            newEnd: new Date(newStart.getTime() + duration),
        };
    }, []);

	const isSamePosition = useCallback((date1, date2) => {
		return date1.getTime() === date2.getTime();
	}, []);

	const handleEventDrop = useCallback((targetDate, hour, minute) => {
        const { draggedEvent } = dragState;
        if (!draggedEvent) return;

        const { newStart, newEnd } = calculateNewDates(draggedEvent, targetDate, hour, minute);
        const originalStart = new Date(draggedEvent.startDate);

        // Check if dropped in same position
        if (isSamePosition(originalStart, newStart)) {
            endDrag();
            return;
        }

        if (showConfirmation) {
            // Show confirmation dialog if user wants it
            setPendingDropData({
                event: draggedEvent,
                newStartDate: newStart,
                newEndDate: newEnd,
            });
        } else {
            // Instantly update event if user doesn't want confirmation
            const callback = onEventDroppedRef.current;
            if (callback) {
                callback(draggedEvent, newStart, newEnd);
            }
            endDrag();
        }
    }, [dragState, calculateNewDates, isSamePosition, endDrag, showConfirmation]);

	const handleConfirmDrop = useCallback(() => {
		if (!pendingDropData) return;

		const callback = onEventDroppedRef.current;
		if (callback) {
			callback(
                pendingDropData.event,
                pendingDropData.newStartDate,
                pendingDropData.newEndDate
            );
		}

		// Reset states
		setPendingDropData(null);
		endDrag();
	}, [pendingDropData, endDrag]);

	const handleCancelDrop = useCallback(() => {
		setPendingDropData(null);
		endDrag();
	}, [endDrag]);

	// Default event update handler
	const handleEventUpdate = useCallback((event, newStartDate, newEndDate) => {
        try {
            const updatedEvent = {
                ...event,
                startDate: newStartDate.toISOString(),
                endDate: newEndDate.toISOString(),
            };
            updateEvent(updatedEvent);
            toast.success("Event updated successfully");
        } catch {
            toast.error("Failed to update event");
        }
    }, [updateEvent]);

	// Set default callback
	React.useEffect(() => {
		onEventDroppedRef.current = handleEventUpdate;
	}, [handleEventUpdate]);

	// When the prop changes, update the state
	React.useEffect(() => {
		setShowConfirmation(showConfirmationProp);
	}, [showConfirmationProp]);

	const contextValue = useMemo(() => ({
        draggedEvent: dragState.draggedEvent,
        isDragging: dragState.isDragging,
        startDrag,
        endDrag,
        handleEventDrop,
        showConfirmation,
        pendingDropData,
        handleConfirmDrop,
        handleCancelDrop,
        setShowConfirmation,
    }), [
        dragState,
        showConfirmation,
        pendingDropData,
        startDrag,
        endDrag,
        handleEventDrop,
        handleConfirmDrop,
        handleCancelDrop,
        setShowConfirmation,
    ]);

	return (
        <DragDropContext.Provider value={contextValue}>
            {showConfirmation && pendingDropData && <DndConfirmationDialog />}
            {children}
        </DragDropContext.Provider>
    );
}

export function useDragDrop() {
	const context = useContext(DragDropContext);
	if (!context) {
		throw new Error("useDragDrop must be used within a DragDropProvider");
	}
	return context;
}
