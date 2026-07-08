import { LOGGED_IN_USER } from "@calendar/components/auth/calendar-users";
import {  DEFAULT_COLORS, TAG_IDS } from "@calendar/components/calendar/constants";
import { normalizeStatus } from "@calendar/components/calendar/helpers";
import { differenceInCalendarDays, startOfDay, endOfDay, format,  isSunday,eachDayOfInterval} from "date-fns";
function toERPDate(date = new Date()) {
  return format(startOfDay(date), "yyyy-MM-dd");
}

export function calculateTotalLeaveDays(startDate, endDate, isHalfDay) {
  if (!startDate || !endDate) return 0;

  const days = eachDayOfInterval({
    start: startOfDay(startDate),
    end: startOfDay(endDate),
  });

  const workingDays = days.filter((day) => !isSunday(day)).length;

  if (workingDays === 0) return 0;

  return isHalfDay ? workingDays - 0.5 : workingDays;
}
function buildEmployeeFullName(employee) {
  if (!employee || typeof employee !== "object") return null;

  const parts = [
    employee.first_name,
    employee.middle_name,
    employee.last_name,
  ].filter(Boolean);

  return parts.length ? parts.join(" ") : null;
}

export function mapFormToErpLeave(values,options = {}) {
  const { erpName } = options;
  const isHalf = values.leavePeriod === "Half";
  const fromDate = toERPDate(values.startDate);
  const toDate = toERPDate(values.endDate);

  // The half day is one boundary day only: the first day's second half
  // (half_day_date = from_date) or the last day's first half (= to_date).
  const halfDayDate = isHalf
    ? values.halfDayPosition === "LAST_DAY"
      ? toDate
      : fromDate
    : null;

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
    half_day_date: halfDayDate,
    total_leave_days: totalDays,
    description: values.description ?? "",
    posting_date: toERPDate(),
    status: "OPEN",
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
  const ownerFullName =
    buildEmployeeFullName(leave.employee) ??
    leave.employee_name ??
    employeeId ??
    "";
  const ownerEmail =
    typeof leave.employee === "object"
      ? leave.employee?.company_email ?? null
      : null;

  return {
    erpName: `${leave.name}`,
    id: `${leave.name}`,
    title: ownerFullName
      ? `${leaveTypeName} - ${ownerFullName}`
      : leaveTypeName,
    tags: TAG_IDS.LEAVE,
    leaveType: leaveTypeName,
    startDate: start.toISOString(), // ✅ normalized
    endDate: end.toISOString(),     // ✅ normalized
    status: normalizedStatus,
    half_day: isHalfDay ? 1 : 0,
    total_leave_days: totalDays,
    postingDate: leave.posting_date ?? null,
    halfDayDate: leave.half_day_date
      ? new Date(`${leave.half_day_date}T00:00:00`).toISOString()
      : "",
    description: leave.description,
    color:
    DEFAULT_COLORS[
      `LEAVE_${normalizedStatus.toUpperCase()}`
    ] ?? DEFAULT_COLORS.LEAVE_OPEN,
    medicalAttachment: leave.custom_attachement ?? "",
    employee: employeeId,
    employeeName: leave.employee_name ?? employeeId ?? "",
    ownerEmployeeId: employeeId,
    ownerFullName,
    ownerEmail,
    owner: employeeId
      ? {
          id: employeeId,
          email: ownerEmail ?? undefined,
          fullName: ownerFullName || employeeId,
        }
      : undefined,
    approvedBy: leave.leave_approver_name ?? "",
    leave_approver: leaveApprover,
  };
}
