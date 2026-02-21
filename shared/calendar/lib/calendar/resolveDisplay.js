import { format, parseISO, isValid } from "date-fns";
import { formatTime } from "@calendar/components/calendar/helpers";

export function resolveDisplayValueFromEvent({
  event,
  field,
  use24HourFormat,
}) {
  const value = event[field.key];

  switch (field.type) {
    case "doctor": {
      return event.event_participants
        ?.filter((p) => p.reference_doctype === "Lead")
        .map((p) => {
          const doc = event._doctorOptions?.find(
            (d) => d.value === p.reference_docname
          );
          return doc?.label ?? p.reference_docname;
        })
        .join(", ");
    }

    case "employee": {
      return event.event_participants
        ?.filter((p) => p.reference_doctype === "Employee")
        .map((p) => {
          const emp = event._employeeOptions?.find(
            (e) => e.value === p.reference_docname
          );
          return emp?.label ?? p.reference_docname;
        })
        .join(", ");
    }

    /* ---------------------------------
       ✅ Todo allocated_to display
       employeeId → employee name
    --------------------------------- */
    case "allocated_to": {
      if (!value) return null;

      const emp = event._employeeOptions?.find(
        (e) => e.value === value // value = employeeId
      );

      return emp?.label ?? value;
    }

    case "owner": {
      return event.employeeResolvers?.getEmployeeNameById(event.employee) 
        ?? event.employee;
    }
    case "leave_approver": {
      if (!event.leave_approver) return null;
    
      const approver = event._employeeOptions?.find(
        (e) =>
          e.email?.toLowerCase() ===
          event.leave_approver.toLowerCase()
      );
    
      return approver?.label ?? event.leave_approver;
    }
    
    case "date": {
      const d =
        typeof value === "string" ? parseISO(value) : new Date(value);
      if (!isValid(d)) return null;
      return format(d, "dd/MM/yyyy");
    }

    case "datetime": {
      const d =
        typeof value === "string" ? parseISO(value) : new Date(value);
      if (!isValid(d)) return null;

      return `${format(d, "dd/MM/yyyy")} at ${formatTime(
        d,
        use24HourFormat
      )}`;
    }

    default:
      return value ?? null;
  }
}
