import { LOGGED_IN_USER } from "@calendar/components/auth/calendar-users";
import { differenceInCalendarDays, startOfDay, endOfDay,format } from "date-fns";
function toERPDate(date = new Date()) {
  return format(startOfDay(date), "yyyy-MM-dd");
}
export function mapFormToErpLeave(values) {
  const isHalf = values.leavePeriod === "Half";
  const fromDate = toERPDate(values.startDate);
  const toDate = isHalf
    ? fromDate
    : toERPDate(values.endDate);
    const totalDays =
    differenceInCalendarDays(
      startOfDay(values.endDate),
      startOfDay(values.startDate)
    ) + 1;
  return {
    doctype: "Leave Application",
    employee: LOGGED_IN_USER.id,
    leave_type: values.leaveType,

    from_date: fromDate,
    to_date: toDate,

    half_day: isHalf ? 1 : 0,
    half_day_date: isHalf
    ? toERPDate(values.halfDayDate)
    : null,
    total_leave_days: isHalf
      ? totalDays - 0.5
      : totalDays,
    description: values.description ?? "",
    posting_date: toERPDate(),
    status: "Open",
    follow_via_email: 1,
    fsl_attach: values.medicalAttachment ?? null,
  };
}

export function mapErpLeaveToCalendar(leave) {
  if (!leave?.from_date || !leave?.to_date || !leave?.name) return null;

  const start = startOfDay(
    new Date(`${leave.from_date}T00:00:00`)
  );

  const end = endOfDay(
    new Date(`${leave.to_date}T00:00:00`)
  );

  return {
    erpName:`LEAVE-${leave.name}`,
    id: `LEAVE-${leave.name}`,
    title: leave.leave_type__name || "Leave",
    tags: "Leave",
    leaveType: leave.leave_type__name,
    startDate: start.toISOString(), // ✅ normalized
    endDate: end.toISOString(),     // ✅ normalized
    status: leave.status,
    halfDayDate:leave.half_day_date ?? "",
    description: leave.description,
    color: "red",
    allDay: true,
    medicalAttachment:leave.fsl_attach ?? "",
    approvedBy:leave.leave_approver_name ?? ""
  };
}