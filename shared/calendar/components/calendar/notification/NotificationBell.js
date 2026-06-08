import { useCalendar } from "@calendar/components/calendar/contexts/calendar-context";
import { Button } from "@calendar/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@calendar/components/ui/dropdown-menu";
import { Bell } from "lucide-react";

export function NotificationBell({variant}) {
    const { notifications } = useCalendar();
  
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
           variant={variant ? "outline":"ghost"}
            size="icon"
            className="relative"
          >
            <Bell className="h-5 w-5" />
  
            {notifications.length > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-xs text-white">
                {notifications.length}
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
  
        <DropdownMenuContent
          align="end"
          className="w-96 bg-white"
        >
          <div className="p-2 font-semibold">
            Notifications
          </div>
  
          {notifications.map((n) => (
            <div
              key={n.id}
              className="border-t p-3"
            >
              <div className="font-medium">
                {n.title}
              </div>
  
              <div className="text-sm text-muted-foreground">
                {n.message}
              </div>
            </div>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }