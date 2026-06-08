import { useCalendar } from "@calendar/components/calendar/contexts/calendar-context";
import { useRef,useEffect } from "react";
import { toast } from "sonner";

export default function NotificationToast() {
    const { notifications } = useCalendar();
    const shown = useRef(new Set());
  
    useEffect(() => {
      notifications.forEach((n) => {
        if (shown.current.has(n.id)) return;
  
        shown.current.add(n.id);
  
        toast.warning(n.title, {
          description: n.message,
        });
      });
    }, [notifications]);
  
    return null;
  }