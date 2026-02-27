import { eventSchema } from "@calendar/components/calendar/schemas";
import { COLOR_HEX_MAP } from "@calendar/components/calendar/constants";
import { TAG_FORM_CONFIG } from "@calendar/lib/calendar/form-config";
import { TAG_IDS } from "@calendar/components/calendar/constants";
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

export function mapErpGraphqlEventToCalendar(node) {
  if (!node) return null;
  const tag = TAG_IDS[node.event_category] ?? TAG_IDS.OTHER;
  const tagConfig = TAG_FORM_CONFIG[tag] ?? TAG_FORM_CONFIG.DEFAULT;
  const isBirthday = tag === "Birthday";

  /* ---------------------------------------------
     PARTICIPANTS (SOURCE OF TRUTH)
  --------------------------------------------- */

  const event_participants =
    node.event_participants?.map((p) => ({
      reference_doctype: p.reference_doctype__name,
      reference_docname: String(p.reference_docname__name),
      attending: p.attending,
      kly_lat_long: p.kly_lat_long,
      email: p.email ?? null,
      // ✅ Only meaningful for Employee
      kly_role_id:
        p.reference_doctype__name === "Employee"
          ? p.kly_role_id?.name ?? null
          : null,
    })) ?? [];

  const participants = event_participants.map((p) => ({
    type: p.reference_doctype,
    id: p.reference_docname,
    attending: p.attending,
    kly_lat_long: p.kly_lat_long,
    email: p.email,

    // ✅ Only Employee gets roleId
    ...(p.reference_doctype === "Employee" && {
      kly_role_id: p.kly_role_id,
    }),
  }));

  /* ---------------------------------------------
     DERIVE EMPLOYEES & DOCTORS
  --------------------------------------------- */
  const employees = participants
    .filter((p) => p.type === "Employee")
    .map((p) => p.id);

  const doctors = participants
    .filter((p) => p.type === "Lead")
    .map((p) => p.id);

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
    tag === TAG_IDS.DOCTOR_VISIT_PLAN && hasEmployeeAttendingYes
      ? "green"
      : tagConfig.fixedColor ??
      mapHexToColor(node.color) ??
      "blue";
  const attending = normalizeAttending(node.attending);

  /* ---------------------------------------------
     EVENT OBJECT (SCHEMA-SAFE)
  --------------------------------------------- */
  const event = {
    erpName: node.name,
    title: node.subject || "",
    description: node.description ?? "",
    allDay: Boolean(node.all_day),
    forceVisit:Boolean(node.fsl_is_force_visit),
    startDate: startDate ? startDate.toISOString() : null,
    endDate: endDate ? endDate.toISOString() : null,
    attending,
    roleId: node.fsl_role_id?.name ?? undefined,
    tags: tag,

    // ✅ REQUIRED BY eventSchema
    employees: tagConfig.employee?.multiselect
      ? employees
      : employees[0] ?? undefined,

    doctor: tagConfig.doctor?.multiselect
      ? doctors
      : doctors[0] ?? undefined,

    color,
    hqTerritory: node.fsl_territory__name ?? "",

    owner: node.owner
      ? {
        id: node.owner.name,
        name: node.owner.full_name || node.owner.name,
        email: node.owner.email,
      }
      : undefined,

    isMultiDay:
      startDate &&
      endDate &&
      startDate.toDateString() !== endDate.toDateString(),

    // 🔒 ERP truth
    event_participants,

    // 👇 UI derived
    participants,
  };
  if (
    tag === TAG_IDS.DOCTOR_VISIT_PLAN &&
    Array.isArray(node.fsl_doctor_item)
  ) {
    event.fsl_doctor_item = node.fsl_doctor_item;
    event.pob_given =
      event.fsl_doctor_item.length > 0
        ? "Yes"
        : "No";
  }

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
  if (!hex) return "blue";

  const entry = Object.entries(COLOR_HEX_MAP).find(
    ([, value]) => value.toLowerCase() === hex.toLowerCase()
  );

  return entry ? entry[0] : "blue";
}
