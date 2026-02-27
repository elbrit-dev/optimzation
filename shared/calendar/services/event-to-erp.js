import { format } from "date-fns";
import { COLOR_HEX_MAP } from "@calendar/components/calendar/constants";
import { LOGGED_IN_USER } from "@calendar/components/auth/calendar-users";
import { TAG_IDS } from "@calendar/components/calendar/constants";

/**
 * Maps form values to an ERP Event document
 * - Handles create & update
 * - Adds name only when editing
 */

export function mapFormToErpEvent(values, options = {}) {

  const { erpName } = options;
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
        const empEmail = isObject ? emp.email : undefined;
        const empRoleId =
          isObject ? emp.roleId : values.roleId; // fallback
  
        const participant = {
          reference_doctype: "Employee",
          reference_docname: empId,
  
          // ✅ EMAIL
          ...(empEmail && { email: empEmail }),
  
          // ✅ ROLE (ERP STRUCTURE)
          ...(empRoleId && {
            kly_role_id: empRoleId,
          }),
        };
  
        // Doctor Visit Edit logic
        if (isDoctorVisitPlan && isUpdate) {
          if (values.attending === "Yes" || values.attending === "No") {
            participant.attending = values.attending;
          }
  
          if (values.kly_lat_long) {
            participant.kly_lat_long = values.kly_lat_long;
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
  
        const leadId = isObject ? doctor.value : doctor;
        const leadEmail = isObject ? doctor.email : undefined;
  
        const participant = {
          reference_doctype: "Lead",
          reference_docname: leadId,
  
          // ✅ EMAIL ONLY
          ...(leadEmail && { email: leadEmail }),
        };
  
        if (
          isObject &&
          doctor.kly_lat_long &&
          (!isUpdate || !participant.kly_lat_long)
        ) {
          participant.kly_lat_long = doctor.kly_lat_long;
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
    ? "green"
    : values.color;

  const isBirthday = values.tags === "Birthday";
  const doc = {
    // doctype: "Event",
    subject: values.title,
    description: values.description,
    attending:values.attending,
    starts_on: format(values.startDate, "yyyy-MM-dd HH:mm:ss"),
    ends_on: format(values.endDate, "yyyy-MM-dd HH:mm:ss"),
    fsl_role_id: values.roleId,
    event_category: values.tags,
    color:
      COLOR_HEX_MAP[resolvedColor] ??
      COLOR_HEX_MAP.blue,
    all_day: isBirthday || values.allDay ? 1 : 0,
    fsl_is_force_visit: values.forceVisit? 1 :0,
    event_type: "Public",
    status: "Open",
    docstatus: 0,
    event_participants: buildParticipants(values),
    fsl_territory: values.hqTerritory || "",
  };
  // ✅ POB DETAILS (Doctor Visit Plan – Edit only)
  if (
    isDoctorVisitPlan &&
    isUpdate &&
    values.pob_given === "Yes" &&
    Array.isArray(values.fsl_doctor_item)
  ) {
    doc.fsl_doctor_item = values.fsl_doctor_item.map((row) => ({
      item:
        typeof row.item__name === "object"
          ? row.item__name.value
          : row.item__name,
    
      qty: Number(row.qty) || 0,
      rate: Number(row.rate) || 0,
      amount: Number(row.amount) || 0,
    }));
    
  }

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
