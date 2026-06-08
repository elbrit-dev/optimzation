import { format } from "date-fns";
import { COLOR_HEX_MAP, DEFAULT_COLORS } from "@calendar/components/calendar/constants";
import { LOGGED_IN_USER } from "@calendar/components/auth/calendar-users";
import { TAG_IDS } from "@calendar/components/calendar/constants";

/**
 * Maps form values to an ERP Event document
 * - Handles create & update
 * - Adds name only when editing
 */

export function mapFormToErpEvent(values, options = {}) {

  const {
    erpName,
    employeeResolvers,
    doctorResolvers,
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
          // ✅ ROLE (ERP STRUCTURE)
          ...(empRoleId && {
            custom_role_id: empRoleId,
          }),
        };

        // Doctor Visit Edit logic
        if (isDoctorVisitPlan && isUpdate) {
          if (values.attending === "Yes" || values.attending === "No") {
            participant.attending = values.attending;
          }

          if (values.custom_latitude && values.custom_longitude) {
            participant.custom_latitude = parseFloat(values.custom_latitude);
            participant.custom_longitude = parseFloat(values.custom_longitude);
          }
        }

        participants.push(participant);
      });
    }

    /* ---------- Leads ---------- */
    if (values.doctor) {
      const doctors = Array.isArray(values.doctor)
        ? values.doctor
        : [values.doctor];

      doctors.forEach((doctor) => {
        const isObject =
          typeof doctor === "object" && doctor !== null;

          const leadId = isObject
          ? doctor.value
          : doctor;
        
        const leadEmail = isObject
          ? doctor.email
          : doctorResolvers?.getDoctorFieldById(
              leadId,
              "email"
            );
        const participant = {
          reference_doctype: "Lead",
          reference_docname: leadId,
          email: leadEmail || "",
        };

        if (
          isObject &&
          doctor.custom_latitude &&
          doctor.custom_longitude  &&
          (!isUpdate || !participant.custom_latitude)
        ) {
          participant.custom_latitude = parseFloat(
            doctor.custom_latitude
          );
        
          participant.custom_longitude = parseFloat(
            doctor.custom_longitude
          );
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
  const doc = {
    // doctype: "Event",
    subject: values.title,
    description: values.description,
    attending: values.attending,
    starts_on: format(values.startDate, "yyyy-MM-dd HH:mm:ss"),
    ends_on: format(values.endDate, "yyyy-MM-dd HH:mm:ss"),
    custom_role_id: values.roleId,
    event_category: values.tags,
    custom_force_visit_reason: values.custom_force_visit_reason || "",
    color:
      COLOR_HEX_MAP[resolvedColor] ??
      COLOR_HEX_MAP.blue,
    all_day: isBirthday || values.allDay ? 1 : 0,
    custom_is_force_visit: values.forceVisit ? 1 : 0,
    event_type: "Private",
    status: "Open",
    docstatus: 0,
    event_participants: buildParticipants(values),
    custom_hq_territory: values.hqTerritory || "",
    sync_with_google_calendar: 1,
    google_calendar: "IT Elbrit",
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
    doc.owner = LOGGED_IN_USER.id;
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
