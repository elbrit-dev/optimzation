import { useDragDrop } from "@calendar/components/calendar/contexts/dnd-context";
import { memo } from "react";
import { EventDropConfirmationDialog } from "@calendar/components/calendar/dialogs/event-drop-confirmation-dialog";

const DndConfirmationDialog = memo(() => {
	const {
		showConfirmation,
		pendingDropData,
		handleConfirmDrop,
		handleCancelDrop,
	} = useDragDrop();

	if (!showConfirmation || !pendingDropData) return null;

	return (
        <EventDropConfirmationDialog
            open={showConfirmation}
            // Controlled by context
            onOpenChange={() => {}}
            event={pendingDropData.event}
            newStartDate={pendingDropData.newStartDate}
            newEndDate={pendingDropData.newEndDate}
            onConfirm={handleConfirmDrop}
            onCancel={handleCancelDrop} />
    );
});

DndConfirmationDialog.displayName = "DndConfirmationDialog";

export { DndConfirmationDialog };
