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
    doctorResolvers,
    googleCalendar,
    existingEventParticipants = [],
  } = options;
  const isDoctorVisitPlan =
    values.tags === TAG_IDS.DOCTOR_VISIT_PLAN;

  const isUpdate = Boolean(erpName);
  const currentVisitTimestamp =
    isDoctorVisitPlan && values.attending === "Yes"
      ? format(new Date(), "yyyy-MM-dd HH:mm:ss")
      : null;
  function buildParticipants(values) {
    const existingEmployeeParticipants = existingEventParticipants.filter(
      (participant) =>
        participant.reference_doctype === "Employee"
    );
    const requestedEmployees = values.employees
      ? Array.isArray(values.employees)
        ? values.employees
        : [values.employees]
      : [];
    const employeeSource =
      isDoctorVisitPlan && isUpdate
        ? existingEmployeeParticipants.map((participant) => ({
            value: participant.reference_docname,
            email: participant.email ?? "",
            roleId:
              participant[ERP_EVENT_FIELDS.participantRoleProfileWrite] ??
              participant.role_profile ??
              null,
            existingParticipant: participant,
          }))
        : requestedEmployees;
    const participants = [];

    /* ---------- Employees only ---------- */
    if (employeeSource.length) {
      employeeSource.forEach((emp) => {
        const isObject = typeof emp === "object" && emp !== null;

        const empId = isObject ? emp.value : emp;
        const existingParticipant = isObject
          ? emp.existingParticipant ?? null
          : existingEmployeeParticipants.find(
              (participant) =>
                String(participant.reference_docname) ===
                String(empId)
            ) ?? null;

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
          ...(existingParticipant ?? {}),
          reference_doctype: "Employee",
          reference_docname: empId,
          email: empEmail || "",
          ...(empRoleId && {
            [ERP_EVENT_FIELDS.participantRoleProfileWrite]: empRoleId,
          }),
        };

        // Doctor Visit Edit logic
        if (isDoctorVisitPlan) {
          if (
            String(empId) === String(LOGGED_IN_USER.id) &&
            (values.attending === "Yes" || values.attending === "No")
          ) {
            participant.attending = values.attending;
          }

          if (
            String(empId) === String(LOGGED_IN_USER.id) &&
            values.custom_latitude &&
            values.custom_longitude
          ) {
            participant.custom_latitude = parseFloat(values.custom_latitude);
            participant.custom_longitude = parseFloat(values.custom_longitude);
          }

          if (
            String(empId) === String(LOGGED_IN_USER.id) &&
            typeof values.distanceKm === "number"
          ) {
            participant[ERP_EVENT_FIELDS.participantDistanceWrite] =
              values.distanceKm;
          }

          if (String(empId) === String(LOGGED_IN_USER.id)) {
            participant[ERP_EVENT_FIELDS.participantForceVisitWrite] =
              values.forceVisit ? 1 : 0;
          }

          if (
            String(empId) === String(LOGGED_IN_USER.id) &&
            currentVisitTimestamp
          ) {
            participant[
              ERP_EVENT_FIELDS.participantVisitTimeWrite
            ] = currentVisitTimestamp;
          }

          if (
            String(empId) === String(LOGGED_IN_USER.id) &&
            values.custom_force_visit_reason
          ) {
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

  function resolveDoctorLinkId(doctorValue) {
    if (!doctorValue) return "";

    if (Array.isArray(doctorValue)) {
      return resolveDoctorLinkId(doctorValue[0]);
    }

    if (typeof doctorValue === "object") {
      return (
        doctorValue.value ??
        doctorValue.name ??
        doctorValue.code ??
        ""
      );
    }

    return String(doctorValue);
  }

  function resolveDoctorCoordinate(doctorValue, field) {
    if (!doctorValue) return null;

    if (Array.isArray(doctorValue)) {
      return resolveDoctorCoordinate(doctorValue[0], field);
    }

    if (typeof doctorValue === "object") {
      const value = doctorValue[field];
      if (value === undefined || value === null || value === "") {
        return null;
      }
      const numericValue = Number(value);
      return Number.isNaN(numericValue) ? null : numericValue;
    }

    const doctorId = resolveDoctorLinkId(doctorValue);
    const resolvedValue = doctorResolvers?.getDoctorFieldById(
      doctorId,
      field
    );
    if (resolvedValue === undefined || resolvedValue === null || resolvedValue === "") {
      return null;
    }

    const numericValue = Number(resolvedValue);
    return Number.isNaN(numericValue) ? null : numericValue;
  }

  const eventParticipants = buildParticipants(values);
  const employeeParticipants = eventParticipants.filter(
    (participant) =>
      participant.reference_doctype === "Employee"
  );
  const allEmployeeParticipantsVisited =
    isDoctorVisitPlan &&
    employeeParticipants.length > 0 &&
    employeeParticipants.every(
      (participant) =>
        String(participant.attending ?? "").toLowerCase() ===
          "yes" &&
        Boolean(
          participant[
            ERP_EVENT_FIELDS.participantVisitTimeWrite
          ]
        )
    );
  const hasEmployeeAttendingYes =
    isDoctorVisitPlan && allEmployeeParticipantsVisited;
  const resolvedColor = hasEmployeeAttendingYes
    ? DEFAULT_COLORS.EVENT_COMPLETED
    : values.color;

  const isBirthday = values.tags === "Birthday";
  const doctorId = resolveDoctorLinkId(values.doctor);
  const doctorLatitude = resolveDoctorCoordinate(
    values.doctor,
    "custom_latitude"
  );
  const doctorLongitude = resolveDoctorCoordinate(
    values.doctor,
    "custom_longitude"
  );
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
    event_type: "Public",
    status:
      isDoctorVisitPlan && allEmployeeParticipantsVisited
        ? "Completed"
        : "Open",
    docstatus: 0,
    event_participants: eventParticipants,
    [ERP_EVENT_FIELDS.hqWrite]: values.hqTerritory || "",
    [ERP_EVENT_FIELDS.doctorWrite]: doctorId,
    [ERP_EVENT_FIELDS.doctorLatitudeWrite]: doctorLatitude,
    [ERP_EVENT_FIELDS.doctorLongitudeWrite]: doctorLongitude,
    pob_given:
      isDoctorVisitPlan &&
      (Number(values.pob_given) === 1 || Number(values.pob_given) === 0)
        ? Number(values.pob_given)
        : undefined,
    sync_with_google_calendar: 1,
    google_calendar: googleCalendar || "IT Elbrit",
    add_video_conferencing:
      values.tags === TAG_IDS.MEETING &&
      values.enableGoogleMeet
        ? 1
        : 0,
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
