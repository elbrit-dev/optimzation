
import { addMinutes } from "date-fns";
import { LOGGED_IN_USER } from "@calendar/components/auth/calendar-users";

export const COLORS = {
  BLUE: "blue",
  GREEN: "green",
  RED: "red",
  INDIGO: "indigo",
  YELLOW: "yellow",
  PURPLE: "purple",
  ORANGE: "orange",
  TEAL: "teal",
};

export const COLOR_HEX_MAP = {
  [COLORS.BLUE]: "#2563EB",
  [COLORS.GREEN]: "#16A34A",
  [COLORS.RED]: "#DC2626",
  [COLORS.INDIGO]: "#4F46E5",
  [COLORS.YELLOW]: "#CA8A04",
  [COLORS.PURPLE]: "#7C3AED",
  [COLORS.ORANGE]: "#EA580C",
  [COLORS.TEAL]: "#0D9488",
};
export const DEFAULT_COLORS = {
  TODO: COLORS.ORANGE,
  LEAVE_OPEN: COLORS.BLUE,
  LEAVE_APPROVED: COLORS.GREEN,
  LEAVE_REJECTED: COLORS.RED,
  EVENT: COLORS.BLUE,
  EVENT_COMPLETED: COLORS.GREEN,
  HQ_TOUR_PLAN:COLORS.PURPLE
};

export const STATUS = {
  OPEN: "Open",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CLOSED: "Closed",
  CANCELLED: "Cancelled",
};
export const TAG_IDS = {
  LEAVE: "Leave",
  HQ_TOUR_PLAN: "HQ Tour Plan",
  DOCTOR_VISIT_PLAN: "Doctor Visit plan",
  TODO_LIST: "Todo List",
  MEETING: "Meeting",
  OTHER: "Other",
};
export const STATUS_MAP = {
  open: STATUS.OPEN,
  closed: STATUS.CLOSED,
  cancelled: STATUS.CANCELLED,
  approved: STATUS.APPROVED,
  rejected: STATUS.REJECTED,
};

export const STATUS_BY_TAG = {
  [TAG_IDS.TODO_LIST]: [
    STATUS.OPEN,
    STATUS.CLOSED,
    STATUS.CANCELLED,
  ],

  [TAG_IDS.LEAVE]: [
    STATUS.OPEN,
    STATUS.APPROVED,
    STATUS.REJECTED,
    STATUS.CANCELLED,
  ],

  [TAG_IDS.HQ_TOUR_PLAN]: [
    STATUS.OPEN,
    STATUS.CLOSED,
    STATUS.CANCELLED,
  ],

  [TAG_IDS.DOCTOR_VISIT_PLAN]: [
    STATUS.OPEN,
    STATUS.CLOSED,
    STATUS.CANCELLED,
  ],

  [TAG_IDS.MEETING]: [
    STATUS.OPEN,
    STATUS.CLOSED,
    STATUS.CANCELLED,
  ],

  // [TAG_IDS.OTHER]: [
  //   STATUS.OPEN,
  //   STATUS.CLOSED,
  //   STATUS.CANCELLED,
  // ],
};
export const TAGS = [
  { id: TAG_IDS.LEAVE, label: "Leave" },
  { id: TAG_IDS.HQ_TOUR_PLAN, label: "HQ Tour Plan" },
  { id: TAG_IDS.DOCTOR_VISIT_PLAN, label: "DR Tour Plan" },
  { id: TAG_IDS.TODO_LIST, label: "Todo List" },
  { id: TAG_IDS.MEETING, label: "Meeting" },
  // { id: TAG_IDS.OTHER, label: "Other" },
];
export const PARTICIPANT_SOURCE_BY_TAG = {
  [TAG_IDS.LEAVE]: ["EMPLOYEE"],
  [TAG_IDS.HQ_TOUR_PLAN]: ["HQ_TERRITORY"],
  [TAG_IDS.MEETING]: ["EMPLOYEE"],
  [TAG_IDS.DOCTOR_VISIT_PLAN]: ["EMPLOYEE", "DOCTOR"],
  [TAG_IDS.TODO_LIST]: ["EMPLOYEE"],
  // [TAG_IDS.OTHER]: ["EMPLOYEE", "DOCTOR"],
};

function normalizeAttendingChoice(value) {
  if (typeof value !== "string") return "";

  const normalized = value.trim().toLowerCase();

  if (normalized === "yes") return "Yes";
  if (normalized === "no") return "No";
  if (normalized === "maybe") return "Maybe";

  return "";
}

export function buildEventDefaultValues({ event, defaultTag }) {
  const now = new Date();

  const startDate = event
    ? new Date(event.startDate)
    : now;

  const endDate = event
    ? new Date(event.endDate)
    : addMinutes(now, 60);

  const employeeParticipant =
    event?.participants?.find(
      (p) =>
        p.type === "Employee" &&
        String(p.id) === String(LOGGED_IN_USER.id)
    ) ??
    event?.participants?.find((p) => p.type === "Employee");

  return {
    title: event?.title ?? "",
    description: event?.description ?? "",
    startDate,
    endDate,
    tags: event?.tags ?? defaultTag ?? "Leave",
    hqTerritory: event?.hqTerritory ?? "",
    employees: event?.employees,
    doctor: event?.doctor,
    assignedTo: event?.assignedTo,
    forceVisit:event?.forceVisit ?? false,
    distanceKm: event?.distanceKm ?? undefined,
    customer: event?.customer ?? "",
    custom_force_visit_reason:event?.custom_force_visit_reason ?? "",
    allocated_to: event?.allocated_to ?? "",
    shareEmployees: [],
    leaveType: event?.leaveType ?? "Casual Leave",
    reportTo: event?.reportTo ?? "",
    medicalAttachment: event?.medicalAttachment ?? "",
    allDay: event?.allDay ?? false,
    enableGoogleMeet:
      event?.enableGoogleMeet ??
      Boolean(event?.googleMeetLink),
    status: event?.status,
    priority: event?.priority,
    leavePeriod:
      event?.half_day || event?.leavePeriod === "Half"
        ? "Half"
        : "Full",
    halfDayDate: event?.halfDayDate
      ? new Date(event.halfDayDate)
      : undefined,
    halfDayPosition:
      (event?.half_day || event?.leavePeriod === "Half") &&
      event?.halfDayDate &&
      event?.endDate &&
      event?.startDate &&
      new Date(event.halfDayDate).toDateString() ===
        new Date(event.endDate).toDateString() &&
      new Date(event.startDate).toDateString() !==
        new Date(event.endDate).toDateString()
        ? "LAST_DAY"
        : "FIRST_DAY",
    approvedBy: event?.approvedBy ?? "",
    attending: normalizeAttendingChoice(employeeParticipant?.attending),
    custom_latitude: employeeParticipant?.custom_latitude ?? undefined,
    custom_longitude: employeeParticipant?.custom_longitude ?? undefined,
    pob_given: event?.pob_given ?? undefined,
    roleId: event?.roleId ?? LOGGED_IN_USER.roleId ?? "",
    leave_approver:
      event?.leave_approver ??
      LOGGED_IN_USER.leave_approver ??
      "",
    fsl_doctor_item: event?.fsl_doctor_item ?? [],
  };
}
