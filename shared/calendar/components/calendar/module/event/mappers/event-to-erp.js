import { format } from "date-fns";
import { COLOR_HEX_MAP, DEFAULT_COLORS } from "@calendar/components/calendar/constants";
import { LOGGED_IN_USER } from "@calendar/components/auth/calendar-users";
import { TAG_IDS } from "@calendar/components/calendar/constants";
import { ERP_EVENT_FIELDS } from "@calendar/components/calendar/module/event/graphql/field-config";

/**
 * Maps form values to an ERP Event document
 * - Handles create & update
 * - Adds name only when editing
 */

export function mapFormToErpEvent(values, options = {}) {

  const {
    erpName,
    employeeResolvers,
    doctorResolvers,googleCalendar,
  } = options;
  const isDoctorVisitPlan =
    values.tags === TAG_IDS.DOCTOR_VISIT_PLAN;

  const isUpdate = Boolean(erpName);
  function buildParticipants(values) {
    const participants = [];

    /* ---------- Employees ---------- */
    if (values.employees) {
      const employeeList = Array.isArray(values.employees)
        ? values.employees
        : [values.employees];

      employeeList.forEach((emp) => {
        const isObject = typeof emp === "object" && emp !== null;

        const empId = isObject ? emp.value : emp;

        const empEmail = isObject
          ? emp.email
          : employeeResolvers?.getEmployeeFieldById(
              empId,
              "email"
            );
        
        const empRoleId = isObject
          ? emp.roleId
          : employeeResolvers?.getEmployeeFieldById(
              empId,
              "roleId"
            );
        const participant = {
          reference_doctype: "Employee",
          reference_docname: empId,
          email: empEmail || "",
          ...(empRoleId && {
            [ERP_EVENT_FIELDS.participantRoleProfileWrite]: empRoleId,
          }),
        };

        // Doctor Visit Edit logic
        if (isDoctorVisitPlan) {
          if (values.attending === "Yes" || values.attending === "No") {
            participant.attending = values.attending;
          }

          if (values.custom_latitude && values.custom_longitude) {
            participant.custom_latitude = parseFloat(values.custom_latitude);
            participant.custom_longitude = parseFloat(values.custom_longitude);
          }

          if (typeof values.distanceKm === "number") {
            participant[ERP_EVENT_FIELDS.participantDistanceWrite] =
              values.distanceKm;
          }

          participant[ERP_EVENT_FIELDS.participantForceVisitWrite] =
            values.forceVisit ? 1 : 0;

          if (values.custom_force_visit_reason) {
            participant[
              ERP_EVENT_FIELDS.participantForceVisitReasonWrite
            ] = values.custom_force_visit_reason;
          }
        }

        participants.push(participant);
      });
    }

    return participants;
  }

  const hasEmployee =
    Boolean(values.employees) &&
    (Array.isArray(values.employees)
      ? values.employees.length > 0
      : true);

  const hasEmployeeAttendingYes =
    isDoctorVisitPlan &&
    isUpdate &&
    hasEmployee &&
    values.attending === "Yes";
  const resolvedColor = hasEmployeeAttendingYes
    ? DEFAULT_COLORS.EVENT_COMPLETED
    : values.color;

  const isBirthday = values.tags === "Birthday";
  const normalizedDoctors = values.doctor
    ? Array.isArray(values.doctor)
      ? values.doctor
      : [values.doctor]
    : [];
  const primaryDoctor = normalizedDoctors[0];
  const doctorId =
    typeof primaryDoctor === "object"
      ? primaryDoctor?.value
      : primaryDoctor;
  const doc = {
    // doctype: "Event",
    subject: values.title,
    description: values.description,
    attending: values.attending,
    starts_on: format(values.startDate, "yyyy-MM-dd HH:mm:ss"),
    ends_on: format(values.endDate, "yyyy-MM-dd HH:mm:ss"),
    [ERP_EVENT_FIELDS.roleProfileWrite]:
      values.roleId ?? LOGGED_IN_USER.roleId,
    event_category: values.tags,
    color:
      COLOR_HEX_MAP[resolvedColor] ??
      COLOR_HEX_MAP.blue,
    all_day: isBirthday || values.allDay ? 1 : 0,
    event_type: "Private",
    status: "Open",
    docstatus: 0,
    event_participants: buildParticipants(values),
    [ERP_EVENT_FIELDS.hqWrite]: values.hqTerritory || "",
    [ERP_EVENT_FIELDS.doctorWrite]: doctorId || "",
    sync_with_google_calendar: 1,
    google_calendar: googleCalendar || "IT Elbrit",
    add_video_conferencing: values.tags === TAG_IDS.MEETING ? 1 : 0,
  };

  /* ------------------------------------
     🎂 Birthday repeat logic (ERP)
  ------------------------------------ */
  if (isBirthday) {
    doc.repeat_this_event = 1;
    doc.repeat_on = "Yearly";
  }
  if (!erpName) {
    doc[ERP_EVENT_FIELDS.ownerEmployeeWrite] = LOGGED_IN_USER.id;
  }
  // Only include name for UPDATE
  if (erpName) {
    doc.name = erpName;
  }

  return doc;
}


export function serializeEventDoc(doc) {
  return JSON.stringify(doc);
}
