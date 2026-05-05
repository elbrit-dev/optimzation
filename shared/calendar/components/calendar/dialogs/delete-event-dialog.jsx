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

export default function DeleteEventDialog({
	onConfirm,
}) {
	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button variant="destructive">
					<TrashIcon />
					Delete
				</Button>
			</AlertDialogTrigger>

			<AlertDialogContent className="bg-background/95 backdrop-blur-sm">
				<AlertDialogHeader>
					<AlertDialogTitle>
						Are you absolutely sure?
					</AlertDialogTitle>

					<AlertDialogDescription>
						This action cannot be undone. This will permanently delete your
						event and remove event data from our servers.
					</AlertDialogDescription>
				</AlertDialogHeader>

				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>

					<AlertDialogAction
						onClick={onConfirm}
						className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
					>
						Yes Delete
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}