import { TrashIcon } from "lucide-react";
import { toast } from "sonner";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@calendar/components/ui/alert-dialog";
import { Button } from "@calendar/components/ui/button";
import { useCalendar } from "@calendar/components/calendar/contexts/calendar-context";

export default function DeleteEventDialog({
    erpName
}) {
	const { removeEvent } = useCalendar();

	const deleteEvent = () => {
		try {
			removeEvent(erpName);
			toast.success("Event deleted successfully.");
		} catch {
			toast.error("Error deleting event.");
		}
	};

	if (!erpName) {
		return null;
	}

	return (
        <AlertDialog>
            <AlertDialogTrigger asChild>
				<Button variant="destructive">
					<TrashIcon />
					Delete
				</Button>
			</AlertDialogTrigger>
            <AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
					<AlertDialogDescription>
						This action cannot be undone. This will permanently delete your
						event and remove event data from our servers.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction onClick={deleteEvent}>Continue</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
        </AlertDialog>
    );
}
