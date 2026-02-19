  
  import { addMinutes } from "date-fns";
  import { LOGGED_IN_USER } from "@calendar/components/auth/calendar-users";
  
export const COLORS = [
	"blue",
	"green",
	"red",
	"yellow",
	"purple",
	"orange",
	"teal",
  ];
  
  export const COLOR_HEX_MAP = {
	blue: "#2563EB",
	green: "#16A34A",
	red: "#DC2626",
	yellow: "#CA8A04",
	purple: "#7C3AED",
	orange: "#EA580C",
	teal: "#0D9488",
  };
  
  export const TAG_IDS = {
	LEAVE: "Leave",
	HQ_TOUR_PLAN: "HQ Tour Plan",
	DOCTOR_VISIT_PLAN: "Doctor Visit plan",
	// BIRTHDAY: "Birthday",
	TODO_LIST: "Todo List",
	MEETING: "Meeting",
	OTHER: "Other",
  };
  
  export const TAGS = [
	{ id: TAG_IDS.LEAVE, label: "Leave" },
	{ id: TAG_IDS.HQ_TOUR_PLAN, label: "HQ Tour Plan" },
	{ id: TAG_IDS.DOCTOR_VISIT_PLAN, label: "DR Tour Plan" },
	// { id: TAG_IDS.BIRTHDAY, label: "DR Birthday" },
	{ id: TAG_IDS.TODO_LIST, label: "Todo List" },
	{ id: TAG_IDS.MEETING, label: "Meeting" },
	{ id: TAG_IDS.OTHER, label: "Other" },
  ];
  export const PARTICIPANT_SOURCE_BY_TAG = {
	[TAG_IDS.LEAVE]: ["EMPLOYEE"],
	[TAG_IDS.HQ_TOUR_PLAN]: ["HQ_TERRITORY"],
	[TAG_IDS.MEETING]: ["EMPLOYEE"],
	// [TAG_IDS.BIRTHDAY]: ["DOCTOR"],
	[TAG_IDS.DOCTOR_VISIT_PLAN]: ["EMPLOYEE", "DOCTOR"],
	[TAG_IDS.TODO_LIST]: ["EMPLOYEE"],
	[TAG_IDS.OTHER]: ["EMPLOYEE", "DOCTOR"],
  };
export function buildEventDefaultValues({ event, defaultTag }) {
  const now = new Date();

  const startDate = event
    ? new Date(event.startDate)
    : now;

  const endDate = event
    ? new Date(event.endDate)
    : addMinutes(now, 60);

  const employeeParticipant = event?.participants?.find(
    (p) => p.type === "Employee"
  );

  return {
    title: event?.title ?? "",
    description: event?.description ?? "",
    startDate,
    endDate,
    tags: event?.tags ?? defaultTag ?? "Other",
    hqTerritory: event?.hqTerritory ?? "",
    employees: event?.employees,
    doctor: event?.doctor,
    allocated_to: event?.allocated_to ?? "",
    leaveType: event?.leaveType ?? "Casual Leave",
    reportTo: event?.reportTo ?? "",
    medicalAttachment: event?.medicalAttachment ?? "",
    allDay: event?.allDay ?? false,
    todoStatus: "Open",
    priority: "Medium",
    leavePeriod: "Full",
    halfDayDate: event?.halfDayDate ?? "",
    approvedBy: event?.approvedBy ?? "",
    attending: employeeParticipant?.attending ?? "",
    kly_lat_long: employeeParticipant?.kly_lat_long ?? "",
    pob_given: event?.pob_given ?? "No",
    roleId: event?.roleId ?? LOGGED_IN_USER.roleId,
    leave_approver: event?.leave_approver ?? LOGGED_IN_USER.leave_approver,
    fsl_doctor_item: event?.fsl_doctor_item ?? [],
  };
}
