import { addMinutes, format } from "date-fns";
import { DEFAULT_COLORS, TAG_IDS } from "@calendar/components/calendar/constants";
import {
  TRAVEL_MODES,
  TRAVEL_REQUEST_PROJECT,
  TRAVEL_REQUEST_PURPOSE,
  normalizeTravelFunding,
  normalizeTravelMode,
} from "@calendar/components/calendar/module/travel-request/helpers/travel-request.helper";

export function buildTravelRequestTitle({ travelMode, travelFrom, travelTo }) {
  const route = [travelFrom, travelTo].filter(Boolean).join(" → ");
  const mode = normalizeTravelMode(travelMode);
  return route ? `${mode}: ${route}` : mode || "Travel Request";
}

/* A hotel is also a lodging request on the row. */
export function buildItineraryRow({ travelMode, travelFrom, travelTo, startDate }) {
  const departure = format(new Date(startDate), "yyyy-MM-dd HH:mm:ss");
  const row = {
    travel_from: travelFrom,
    travel_to: travelTo,
    mode_of_travel: normalizeTravelMode(travelMode),
    departure_date: departure,
  };

  if (normalizeTravelMode(travelMode) === TRAVEL_MODES.HOTEL) {
    row.lodging_required = 1;
    row.preferred_area_for_lodging = travelTo;
    row.check_in_date = format(new Date(startDate), "yyyy-MM-dd");
  }

  return row;
}

// Saved as a draft (docstatus 0); the booking proof is uploaded first so the
// request is written once, with its proof link.
export function mapFormToErpTravelRequest(values, { employee, proofUrl, existingName } = {}) {
  return {
    ...(existingName && { name: existingName }),
    docstatus: 0,
    travel_type: "Domestic",
    travel_funding: normalizeTravelFunding(values.travelFunding),
    ...(values.travelSponsorDetails?.trim() && {
      details_of_sponsor: values.travelSponsorDetails.trim(),
    }),
    ...(proofUrl && { travel_proof: proofUrl }),
    purpose_of_travel: TRAVEL_REQUEST_PURPOSE,
    employee: employee.id,
    employee_name: employee.name,
    ...(employee.email && { prefered_email: employee.email }),
    description: [buildTravelRequestTitle(values), values.description]
      .filter(Boolean)
      .join("\n"),
    itinerary: [buildItineraryRow(values)],
  };
}

export function mapTravelRequestToTask(values, { travelRequestName, employee, existingName } = {}) {
  const day = format(new Date(values.startDate), "yyyy-MM-dd");

  return {
    ...(existingName && { name: existingName }),
    subject: `${buildTravelRequestTitle(values)} (${employee.name})`,
    project: TRAVEL_REQUEST_PROJECT,
    status: "Open",
    priority: "Medium",
    exp_start_date: day,
    exp_end_date: day,
    description: [
      `Travel Request: ${travelRequestName}`,
      `Employee: ${employee.name} (${employee.id})`,
      `Type: ${normalizeTravelMode(values.travelMode)}`,
      `Funding: ${normalizeTravelFunding(values.travelFunding)}`,
      values.travelSponsorDetails?.trim() && `Sponsor: ${values.travelSponsorDetails.trim()}`,
      `From: ${values.travelFrom}`,
      `To: ${values.travelTo}`,
      `Departure: ${format(new Date(values.startDate), "dd MMM yyyy, hh:mm a")}`,
      values.description,
    ]
      .filter(Boolean)
      .join("<br>"),
  };
}

const TRAVEL_REQUEST_STATUS = {
  0: "Draft",
  1: "Submitted",
  2: "Cancelled",
};

function parseErpDateTime(value) {
  if (!value) return null;
  const date = new Date(String(value).replace(" ", "T"));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function mapErpTravelRequestToCalendar(node) {
  const row = node?.itinerary?.[0];
  const departure = parseErpDateTime(row?.departure_date);
  if (!node?.name || !departure) return null;

  const travelMode = row.mode_of_travel
    ? normalizeTravelMode(row.mode_of_travel)
    : Number(row.lodging_required) === 1
      ? TRAVEL_MODES.HOTEL
      : "";
  const employee = node.employee ?? {};
  const employeeId = employee.name ?? null;
  const fullName =
    [employee.first_name, employee.middle_name, employee.last_name]
      .filter(Boolean)
      .join(" ") ||
    node.employee_name ||
    employeeId ||
    "";
  const values = {
    travelMode,
    travelFrom: row.travel_from ?? "",
    travelTo: row.travel_to ?? "",
  };

  return {
    erpName: node.name,
    id: node.name,
    tags: TAG_IDS.TRAVEL_REQUEST,
    erpDoctype: "Travel Request",
    title: buildTravelRequestTitle(values),
    ...values,
    status: TRAVEL_REQUEST_STATUS[Number(node.docstatus)] ?? "Draft",
    travelFunding: normalizeTravelFunding(node.travel_funding),
    travelSponsorDetails: node.details_of_sponsor ?? "",
    attachment: node.travel_proof ?? "",
    startDate: departure.toISOString(),
    endDate: addMinutes(departure, 60).toISOString(),
    // ERP's description opens with the title line; only the notes belong here.
    description: String(node.description ?? "")
      .replace(buildTravelRequestTitle(values), "")
      .trim(),
    color: DEFAULT_COLORS.TRAVEL_REQUEST,
    employee: employeeId,
    ownerEmployeeId: employeeId,
    ownerFullName: fullName,
    ownerEmail: employee.company_email ?? undefined,
    owner: employeeId
      ? { id: employeeId, email: employee.company_email ?? undefined, fullName }
      : undefined,
  };
}
