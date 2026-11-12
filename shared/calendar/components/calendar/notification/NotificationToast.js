import { useCalendar } from "@calendar/components/calendar/contexts/calendar-context";
import { useRef,useEffect } from "react";
import { toast } from "sonner";

export default function NotificationToast() {
    const { notifications } = useCalendar();
    const shown = useRef(new Set());

    useEffect(() => {
      const pending = new Set(notifications.map((n) => n.id));

      // A leave approved / rejected since its toast went up: take the toast
      // down. Its id stays in `shown`, so a list that briefly empties during a
      // reload does not toast everything again.
      shown.current.forEach((id) => {
        if (!pending.has(id)) toast.dismiss(`leave-pending-${id}`);
      });

      notifications.forEach((n) => {
        if (shown.current.has(n.id)) return;

        shown.current.add(n.id);

        toast.warning(n.title, {
          id: `leave-pending-${n.id}`,
          description: n.message,
        });
      });
    }, [notifications]);

    return null;
  }
