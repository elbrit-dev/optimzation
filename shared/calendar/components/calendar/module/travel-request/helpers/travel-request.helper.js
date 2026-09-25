import { roleCodeFromProfile } from "@calendar/lib/meetingRoles";

/**
 * Travel Request — raised from the calendar's Add Event form, but saved only as
 * an ERP "Travel Request" (as a draft, for procurement to submit) and a Task in
 * the Procurement project — no Event. The calendar reads the Travel Requests
 * back and shows each one on its departure date.
 *
 * ERP setup this depends on: a "Purpose of Travel" record named
 * TRAVEL_REQUEST_PURPOSE must exist — purpose_of_travel is mandatory.
 */

export const TRAVEL_REQUEST_PURPOSE = "Official";
export const TRAVEL_REQUEST_PROJECT = "PROJ-2026-2027-0013"; // "Procurement"

// ERP is the source of truth: these are its own Travel Itinerary ›
// mode_of_travel options, shown and stored exactly as ERP has them.
export const TRAVEL_MODES = {
  FLIGHT: "Flight",
  TAXI: "Taxi",
  HOTEL: "Hotel",
};

export const TRAVEL_MODE_OPTIONS = [
  { value: TRAVEL_MODES.FLIGHT, attachmentLabel: "Flight Ticket" },
  { value: TRAVEL_MODES.TAXI, attachmentLabel: "Taxi Booking" },
  { value: TRAVEL_MODES.HOTEL, attachmentLabel: "Hotel Booking" },
];

// ERP's GraphQL hands Select values back as enum codes ("TAXI",
// "REQUIRE_FULL_FUNDING") while saveDoc only accepts the stored option
// ("Taxi"). Matching ignores case and punctuation, and every value is put
// through this both when read and before it is sent.
const toEnumKey = (value) =>
  String(value ?? "").toUpperCase().replace(/[^A-Z0-9]+/g, "");

function matchErpOption(options, value) {
  return options.find((option) => toEnumKey(option) === toEnumKey(value)) ?? value ?? "";
}

export function normalizeTravelMode(value) {
  return matchErpOption(Object.values(TRAVEL_MODES), value);
}

export function normalizeTravelFunding(value) {
  return matchErpOption(TRAVEL_FUNDING_OPTIONS, value);
}

// Exact option strings of Travel Request › travel_funding.
export const TRAVEL_FUNDING_OPTIONS = [
  "Require Full Funding",
  "Fully Sponsored",
  "Partially Sponsored, Require Partial Funding",
];

// Hotel bookings may be filed before anything is booked; tickets and taxi
// bookings are requested with the screenshot the employee already has.
export function isTravelAttachmentRequired(mode) {
  const normalized = normalizeTravelMode(mode);
  return normalized === TRAVEL_MODES.FLIGHT || normalized === TRAVEL_MODES.TAXI;
}

// Only SMs raise travel requests. Admin gets it under `next dev` so it can be
// tested without an SM login; every production build is SM-only.
const TRAVEL_REQUEST_ROLES =
  process.env.NODE_ENV === "development" ? ["SM", "ADMIN"] : ["SM"];

export function canUseTravelRequest(roleId) {
  return TRAVEL_REQUEST_ROLES.includes(roleCodeFromProfile(roleId));
}

// `day` keeps its date; the time is `now` rounded up to the next 15 minutes.
export function roundUpToQuarterHour(day, now = new Date()) {
  const next = new Date(day);
  const minutes = Math.ceil((now.getHours() * 60 + now.getMinutes() + 1) / 15) * 15;
  next.setHours(0, minutes, 0, 0);
  return next;
}
