import { CheckIcon, Filter, RefreshCcw } from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@calendar/components/ui/dropdown-menu";
import { Separator } from "@calendar/components/ui/separator";
import { Toggle } from "@calendar/components/ui/toggle";
import { useCalendar } from "@calendar/components/calendar/contexts/calendar-context";
import { STATUS } from "@calendar/components/calendar/constants";

export default function FilterEvents({ variant }) {
	const { selectedColors, filterEventsBySelectedColors, clearFilter, selectedStatuses, filterEventsBySelectedStatus, showOnlyTodoList, } =
		useCalendar();

	const colors = [
		"blue",
		"green",
		"red",
		"purple",
		"orange",
	];
	const statuses = Object.values(STATUS);
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Toggle variant={variant ? "outline" : ""} className="cursor-pointer w-fit">
					<Filter className="h-4 w-4" />
				</Toggle>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-[150px]">
				{!showOnlyTodoList && (
					<>
						{colors.map((color, index) => (
							<DropdownMenuItem
								key={index}
								className="flex items-center gap-2 cursor-pointer"
								onClick={(e) => {
									e.preventDefault();
									filterEventsBySelectedColors(color);
								}}>
								<div className={`size-3.5 rounded-full bg-${color}-600 dark:bg-${color}-700`} />
								<span className="capitalize flex justify-center items-center gap-2">
									{color}
									<span>
										{selectedColors.includes(color) && (
											<span className="text-blue-500">
												<CheckIcon className="size-4" />
											</span>
										)}
									</span>
								</span>
							</DropdownMenuItem>
						))}
					
				
				<Separator className="my-2" />
				</>
			)}
				<div className="px-2 py-1 text-xs font-medium">
					Status
				</div>

				{statuses.map((status) => (
					<DropdownMenuItem
						key={status}
						onClick={(e) => {
							e.preventDefault();
							filterEventsBySelectedStatus(status);
						}}
					>
						{status}

						{selectedStatuses.includes(
							status.toLowerCase()
						) && (
								<CheckIcon className="size-4 ml-auto" />
							)}
					</DropdownMenuItem>
				))}
				<Separator className="my-2" />
				<DropdownMenuItem
					disabled={selectedColors.length === 0}
					className="flex gap-2 cursor-pointer"
					onClick={(e) => {
						e.preventDefault();
						clearFilter();
					}}>
					<RefreshCcw className="size-3.5" />
					Clear Filter
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
