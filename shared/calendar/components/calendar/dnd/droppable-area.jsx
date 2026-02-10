import React from "react";
import { useDragDrop } from "@calendar/components/calendar/contexts/dnd-context";

export function DroppableArea({
    date,
    hour,
    minute,
    children,
    className
}) {
	const { handleEventDrop, isDragging } = useDragDrop();

	return (
        <div
            className={`${className || ""} ${isDragging ? "drop-target" : ""}`}
            onDragOver={(e) => {
				// Prevent default to allow drop
				e.preventDefault();
				e.currentTarget.classList.add("bg-primary/10");
			}}
            onDragLeave={(e) => {
				e.currentTarget.classList.remove("bg-primary/10");
			}}
            onDrop={(e) => {
				e.preventDefault();
				e.currentTarget.classList.remove("bg-primary/10");
				handleEventDrop(date, hour, minute);
			}}>
            {children}
        </div>
    );
}
