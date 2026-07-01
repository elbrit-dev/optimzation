import { eventSchema } from "@calendar/components/calendar/schemas";
import { COLOR_HEX_MAP, DEFAULT_COLORS } from "@calendar/components/calendar/constants";
import { TAG_FORM_CONFIG } from "@calendar/lib/calendar/form-config";
import { TAG_IDS } from "@calendar/components/calendar/constants";
import { normalizeStatus } from "@calendar/components/calendar/helpers";
/**
 * ERP GraphQL → Calendar Event
 * Employees & Doctors are derived ONLY from participants
 */
function normalizeAttending(value) {
  if (typeof value !== "string") return "No";

  const v = value.trim().toLowerCase();

  if (v === "yes") return "Yes";
  if (v === "no") return "No";

  return "No";
}

function buildOwnerFullName(owner) {
  if (!owner) return null;

  const parts = [
    owner.first_name,
    owner.middle_name,
    owner.last_name,
  ].filter(Boolean);

  return parts.length ? parts.join(" ") : null;
}

function buildDoctorVisitTitle(node, ownerFullName) {
  const subject = node?.subject ?? "";
  const doctorNameFromSubject =
    subject.split("-")[0]?.trim() || subject.trim();

  if (!doctorNameFromSubject) {
    return subject || "";
  }

  if (!ownerFullName) {
    return `${doctorNameFromSubject}-Visit`;
  }

  return `${doctorNameFromSubject}-Visit-${ownerFullName.replace(/\s+/g, "")}`;
}

export function mapErpGraphqlEventToCalendar(node) {
  if (!node) return null;
  const tag = normalizeEventTag(node.event_category);
  const tagConfig = TAG_FORM_CONFIG[tag] ?? TAG_FORM_CONFIG.DEFAULT;
  const isBirthday = tag === "Birthday";
  const ownerFullName =
    buildOwnerFullName(node.custom_employee_id) ??
    node.custom_employee_id?.name ??
    undefined;

  /* ---------------------------------------------
     PARTICIPANTS (SOURCE OF TRUTH)
  --------------------------------------------- */

  const event_participants =
    node.event_participants
      ?.filter(
        (participant) =>
          participant.reference_doctype__name === "Employee"
      )
      .map((p) => ({
      reference_doctype: p.reference_doctype__name,
      reference_docname: String(p.reference_docname__name),
      attending: p.attending,
      custom_latitude: p.custom_latitude ?? null,
      custom_longitude: p.custom_longitude ?? null,
      custom_distance: p.custom_distance ?? null,
      custom_is_force_visit: Boolean(p.custom_is_force_visit),
      custom_force_visit_reason:
        p.custom_force_visit_reason ?? "",
      email: p.email ?? null,
      role_profile:
        p.reference_doctype__name === "Employee"
          ? p.role_profile?.name ?? null
          : null,
    })) ?? [];

  const participants = event_participants.map((p) => ({
    type: p.reference_doctype,
    id: p.reference_docname,
    attending: p.attending,
    custom_latitude: p.custom_latitude,
    custom_longitude: p.custom_longitude,
    custom_distance: p.custom_distance,
    custom_is_force_visit: p.custom_is_force_visit,
    custom_force_visit_reason: p.custom_force_visit_reason,
    email: p.email,
    ...(p.reference_doctype === "Employee" && {
      role_profile: p.role_profile,
    }),
  }));

  /* ---------------------------------------------
     DERIVE EMPLOYEES & DOCTORS
  --------------------------------------------- */
  const employees = participants
    .filter((p) => p.type === "Employee")
    .map((p) => p.id);

  const employeeVisitParticipant = participants.find(
    (participant) => participant.type === "Employee"
  );

  /* ---------------------------------------------
     DATE HANDLING
  --------------------------------------------- */
  let startDate = parseErpDate(node.starts_on);
  let endDate = parseErpDate(node.ends_on) ?? startDate;

  // 🎂 Birthday normalization
  if (isBirthday && startDate) {
    const currentYear = new Date().getFullYear();
    startDate = new Date(startDate);
    startDate.setFullYear(currentYear);
    endDate = startDate;
  }
  const hasEmployeeAttendingYes =
    participants.some(
      (p) => p.type === "Employee" && p.attending === "YES"
    );
  const color =
    tag === TAG_IDS.DOCTOR_VISIT_PLAN &&
      hasEmployeeAttendingYes
      ? DEFAULT_COLORS.EVENT_COMPLETED
      : tagConfig.fixedColor ??
      mapHexToColor(node.color) ??
      DEFAULT_COLORS.EVENT;

  const attending = normalizeAttending(node.attending);
  /* ---------------------------------------------
     EVENT OBJECT (SCHEMA-SAFE)
  --------------------------------------------- */
  const event = {
    erpName: node.name,
    title:
      tag === TAG_IDS.DOCTOR_VISIT_PLAN
        ? buildDoctorVisitTitle(node, ownerFullName)
        : (node.subject || ""),
    description: node.description ?? "",
    status: normalizeStatus(node.status),
    allDay: Boolean(node.all_day),
    forceVisit: Boolean(
      employeeVisitParticipant?.custom_is_force_visit
    ),
    startDate: startDate ? startDate.toISOString() : null,
    endDate: endDate ? endDate.toISOString() : null,
    attending,
    roleId: node.role_profile ?? undefined,
    tags: tag,
    custom_force_visit_reason:
      employeeVisitParticipant?.custom_force_visit_reason ?? "",
    distanceKm:
      employeeVisitParticipant?.custom_distance ?? null,

    // ✅ REQUIRED BY eventSchema
    employees: tagConfig.employee?.multiselect
      ? employees
      : employees[0] ?? undefined,

    doctor: node.custom_doctor__name
      ? tagConfig.doctor?.multiselect
        ? [node.custom_doctor__name]
        : node.custom_doctor__name
      : undefined,
    doctorLatitude: node.doctor_latitude ?? null,
    doctorLongitude: node.doctor_longitude ?? null,
    ownerEmployeeId: node.custom_employee_id?.name ?? undefined,
    ownerEmail: node.custom_employee_id?.company_email ?? undefined,
    ownerFullName:
      ownerFullName,
    owner: node.custom_employee_id?.name
      ? {
          id: node.custom_employee_id.name,
          email: node.custom_employee_id.company_email ?? undefined,
          fullName: ownerFullName,
        }
      : undefined,

    color,
    hqTerritory: node.custom_hq__name ?? "",
    googleMeetLink: node.google_meet_link ?? null,
    enableGoogleMeet: Boolean(node.google_meet_link),

    isMultiDay:
      startDate &&
      endDate &&
      startDate.toDateString() !== endDate.toDateString(),

    // 🔒 ERP truth
    event_participants,

    // 👇 UI derived
    participants,
    pob_given: node.pob_given ?? "No",

    fsl_doctor_item:
      node.fsl_doctor_item ?? [],

    reference_doctype: {
      name: node.reference_doctype__name,
    },

    reference_docname:
      node.reference_docname__name,
  };

  /* ---------------------------------------------
     VALIDATE AGAINST SCHEMA
  --------------------------------------------- */
  const parsed = eventSchema.safeParse({
    ...event,
    startDate,
    endDate,
  });

  if (!parsed.success) {
    console.error(
      "Invalid ERP event ZodError:",
      parsed.error.issues,
      node
    );
    return null;
  }

  return event;
}

function normalizeEventTag(value) {
  if (!value || typeof value !== "string") {
    return TAG_IDS.OTHER;
  }

  if (Object.values(TAG_IDS).includes(value)) {
    return value;
  }

  if (TAG_IDS[value]) {
    return TAG_IDS[value];
  }

  const normalizedValue = value.trim().toLowerCase();
  const matchedTag = Object.values(TAG_IDS).find(
    (tag) => tag.toLowerCase() === normalizedValue
  );

  return matchedTag ?? TAG_IDS.OTHER;
}

/* ---------------------------------------------
   HELPERS
--------------------------------------------- */

/**
 * ERP format: "YYYY-MM-DD HH:mm:ss"
 */
function parseErpDate(value) {
  if (!value || typeof value !== "string") return null;

  const isoLike = value.replace(" ", "T");
  const date = new Date(isoLike);

  return isNaN(date.getTime()) ? null : date;
}

function mapHexToColor(hex) {
  if (!hex) return DEFAULT_COLORS.EVENT;

  const entry = Object.entries(COLOR_HEX_MAP).find(
    ([, value]) => value.toLowerCase() === hex.toLowerCase()
  );

  return entry ? entry[0] : DEFAULT_COLORS.EVENT;
}
