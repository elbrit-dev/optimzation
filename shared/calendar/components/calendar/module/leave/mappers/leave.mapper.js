import { LOGGED_IN_USER } from "@calendar/components/auth/calendar-users";
import {  DEFAULT_COLORS, TAG_IDS } from "@calendar/components/calendar/constants";
import { normalizeStatus } from "@calendar/components/calendar/helpers";
import { differenceInCalendarDays, startOfDay, endOfDay, format } from "date-fns";
function toERPDate(date = new Date()) {
  return format(startOfDay(date), "yyyy-MM-dd");
}
export function mapFormToErpLeave(values,options = {}) {
  const { erpName } = options;
  const isHalf = values.leavePeriod === "Half";
  const fromDate = toERPDate(values.startDate);
  const toDate = isHalf
    ? fromDate
    : toERPDate(values.endDate);

  const totalDays = calculateTotalLeaveDays(
    values.startDate,
    values.endDate,
    isHalf
  );

  const doc = {
    doctype: "Leave Application",
    employee: LOGGED_IN_USER.id,
    leave_type: values.leaveType,
    from_date: fromDate,
    to_date: toDate,
    half_day: isHalf ? 1 : 0,
    half_day_date: isHalf
      ? toERPDate(values.halfDayDate)
      : null,
    total_leave_days: totalDays,
    description: values.description ?? "",
    posting_date: toERPDate(),
    status: "Open",
    follow_via_email: 1,
    custom_attachement: values.medicalAttachment ?? null,
    leave_approver: values.leave_approver ?? null,
  };

  // 🔥 CRITICAL FOR UPDATE
  if (erpName) {
    doc.name = erpName;
  }

  return doc;
}

export function mapErpLeaveToCalendar(leave) {
  if (!leave?.from_date || !leave?.to_date || !leave?.name) return null;

  const start = startOfDay(new Date(`${leave.from_date}T00:00:00`));
  const end = endOfDay(new Date(`${leave.to_date}T00:00:00`));

  const isHalfDay = leave.half_day === 1 || leave.half_day === true;

  const totalDays =
    leave.total_leave_days ??
    calculateTotalLeaveDays(start, end, isHalfDay);
  const normalizedStatus = normalizeStatus(leave.status);
  const employeeId =
    typeof leave.employee === "object"
      ? leave.employee?.name
      : leave.employee ?? null;
  const leaveApprover =
    typeof leave.leave_approver === "object"
      ? leave.leave_approver?.name
      : leave.leave_approver ?? null;
  const leaveTypeName =
    leave.leave_type__name ?? leave.leave_type ?? TAG_IDS.LEAVE;

  return {
    erpName: `${leave.name}`,
    id: `${leave.name}`,
    title: leaveTypeName,
    tags: TAG_IDS.LEAVE,
    leaveType: leaveTypeName,
    startDate: start.toISOString(), // ✅ normalized
    endDate: end.toISOString(),     // ✅ normalized
    status: normalizedStatus,
    half_day: isHalfDay ? 1 : 0,
    total_leave_days: totalDays,
    halfDayDate: leave.half_day_date ?? "",
    description: leave.description,
    color:
    DEFAULT_COLORS[
      `LEAVE_${normalizedStatus.toUpperCase()}`
    ] ?? DEFAULT_COLORS.LEAVE_OPEN,
    medicalAttachment: leave.custom_attachement ?? "",
    employee: employeeId,
    employeeName: leave.employee_name ?? employeeId ?? "",
    approvedBy: leave.leave_approver_name ?? "",
    leave_approver: leaveApprover,
  };
}


export function calculateTotalLeaveDays(startDate, endDate, isHalfDay) {
  const totalDays =
    differenceInCalendarDays(
      startOfDay(endDate),
      startOfDay(startDate)
    ) + 1;

  return isHalfDay ? totalDays - 0.5 : totalDays;
}
