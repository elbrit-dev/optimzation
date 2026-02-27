import { motion } from "framer-motion";
import { useDragDrop } from "@calendar/components/calendar/contexts/dnd-context";

export function DraggableEvent({
    event,
    children,
    className
}) {
	const { startDrag, endDrag, isDragging, draggedEvent } = useDragDrop();

	const isCurrentlyDragged = isDragging && draggedEvent?.id === event.id;

	const handleClick = (e) => {
		e.stopPropagation();
	};

	return (
        <motion.div
            className={`${className || ""} ${isCurrentlyDragged ? "opacity-50 cursor-grabbing" : "w-full cursor-grab"}`}
            draggable
            onClick={(e) => handleClick(e)}
            onDragStart={(e) => {
				e.dataTransfer.setData("text/plain", event.id.toString());
				startDrag(event);
			}}
            onDragEnd={() => {
				endDrag();
			}}>
            {children}
        </motion.div>
    );
}
