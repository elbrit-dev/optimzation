import { format } from "date-fns";
import { COLOR_HEX_MAP } from "@calendar/components/calendar/constants";
import { LOGGED_IN_USER } from "@calendar/components/auth/calendar-users";
import { TAG_IDS } from "@calendar/components/calendar/mocks";

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
  console.log("ERPNAME", erpName)
  function buildParticipants(values) {
    const participants = [];
    /* ---------- Employees ---------- */
    if (values.employees) {
      const employeeIds = Array.isArray(values.employees)
        ? values.employees
        : [values.employees];

      employeeIds.forEach((emp) => {
        const empId =
          typeof emp === "object" ? emp.value : emp;

        const participant = {
          reference_doctype: "Employee",
          reference_docname: empId,
        };

        // ✅ ONLY ON EDIT + DOCTOR VISIT PLAN
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
    /* ---------- Doctors ---------- */
    if (values.doctor) {
      const doctors = Array.isArray(values.doctor)
        ? values.doctor
        : [values.doctor];

      doctors.forEach((doctor) => {
        const isObject = typeof doctor === "object" && doctor !== null;

        const participant = {
          reference_doctype: "Lead",
          reference_docname: isObject ? doctor.value : doctor,
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
    event_category: values.tags,
    color:
      COLOR_HEX_MAP[resolvedColor] ??
      COLOR_HEX_MAP.blue,
    all_day: isBirthday || values.allDay ? 1 : 0,
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
      item: {
        name: row.item__name, // 👈 REQUIRED BY ERP
      },
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
