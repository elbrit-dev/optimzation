import { format, parseISO, isValid } from "date-fns";
import { formatTime } from "@calendar/components/calendar/helpers";

function formatOwnerSummary(event) {
  const ownerId = event.ownerEmployeeId ?? event.owner?.id ?? null;
  const ownerName = event.ownerFullName ?? event.owner?.fullName ?? null;
  const ownerEmail = event.ownerEmail ?? event.owner?.email ?? null;

  const firstLine = [ownerName, ownerId]
    .filter(Boolean)
    .filter((part, index, arr) => arr.indexOf(part) === index)
    .join(" • ");

  if (!firstLine && !ownerEmail) return null;

  return (
    <>
      {ownerName} • {ownerId}
      <br />
      {ownerEmail}
    </>
  )
}

export function resolveDisplayValueFromEvent({
  event,
  field,
  use24HourFormat,
}) {
  const value = event[field.key];
  switch (field.type) {
    case "doctor": {
      if (!event.doctor) return null;

      const doctorIds = Array.isArray(event.doctor)
        ? event.doctor
        : [event.doctor];

      return doctorIds
        .map((doctorId) => {
          const doc = event._doctorOptions?.find(
            (option) => option.value === doctorId
          );
          return doc?.label ?? doctorId;
        })
        .join(", ");
    }

    case "employee": {
      const names = event.event_participants
        ?.filter((p) => p.reference_doctype === "Employee")
        .map((p) => {
          const emp = event._employeeOptions?.find(
            (e) => e.value === p.reference_docname
          );

          return emp?.label ?? p.reference_docname;
        })
        .join(", ");

      return names;
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
      return (
        formatOwnerSummary(event) ??
        (() => {
          if (!event.ownerEmployeeId) return null;

          const owner = event._employeeOptions?.find(
            (employee) => employee.value === event.ownerEmployeeId
          );

          return owner?.label ?? event.ownerEmployeeId;
        })()
      );
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
