import { roleCodeFromProfile } from "@calendar/lib/meetingRoles";

/**
 * Travel Request — raised from the calendar's Add Event form, but saved only as
 * an ERP "Travel Request" (as a draft), a Task in the Procurement project and
 * one ToDo per GM — no Event. The GM approves by marking their ToDo done, which
 * submits the request. The calendar reads the Travel Requests back and shows
 * each one on its departure date.
 *
 * ERP setup this depends on: a "Purpose of Travel" record named
 * TRAVEL_REQUEST_PURPOSE must exist — purpose_of_travel is mandatory — and the
 * GM needs submit permission on Travel Request.
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

// Flight tickets and hotel bookings must be attached; a taxi booking is optional.
export function isTravelAttachmentRequired(mode) {
  const normalized = normalizeTravelMode(mode);
  return normalized === TRAVEL_MODES.FLIGHT || normalized === TRAVEL_MODES.HOTEL;
}

// SM and GM, like BE/ABM/RBM elsewhere, are read from the role profile prefix
// ("SM1-…" → "SM", "GM" → "GM"; "Deputy GM" is not GM). ZSM has no role
// profile of its own, so it is matched on the Employee's designation (`role`
// on calendar users).
// Under `next dev` every login gets it, so it can be tested without an SM or
// ZSM login.
const IS_DEV = process.env.NODE_ENV === "development";
const TRAVEL_REQUEST_ROLES = ["SM"];
const TRAVEL_REQUEST_DESIGNATIONS = ["Zonal Sales Manager"];

// The GM approves travel requests: each one gets a ToDo per GM. The
// "General Manager" designation is a fallback for a GM whose Employee has no
// role profile set; exact match, so a Deputy is never an approver.
const TRAVEL_APPROVER_ROLE = "GM";
const TRAVEL_APPROVER_DESIGNATION = "General Manager";

const sameDesignation = (a, b) =>
  String(a ?? "").trim().toLowerCase() === b.toLowerCase();

/** `requester`: { roleIds, roles } — role profiles and designations. */
export function canUseTravelRequest(requester) {
  if (IS_DEV) {
    console.info("[travel-request] access check (dev: always allowed)", requester);
    return true;
  }
  return (
    requester.roleIds.some((roleId) =>
      TRAVEL_REQUEST_ROLES.includes(roleCodeFromProfile(roleId))
    ) ||
    requester.roles.some((role) =>
      TRAVEL_REQUEST_DESIGNATIONS.some((d) => sameDesignation(role, d))
    )
  );
}

export function isTravelApprover(employee) {
  return (
    roleCodeFromProfile(employee?.roleId) === TRAVEL_APPROVER_ROLE ||
    sameDesignation(employee?.role, TRAVEL_APPROVER_DESIGNATION)
  );
}

// The logged-in user's role profiles and designations, from both the login
// (LOGGED_IN_USER — where "Admin" is set) and its Employee record in `users`
// (the calendar's employee list — where the designation is). Either may grant
// access, so neither overrides the other.
export function resolveTravelRequester(users, loggedInUser) {
  const employee = users?.find((user) => user.id === loggedInUser?.id);
  return {
    roleIds: [loggedInUser?.roleId, employee?.roleId].filter(Boolean),
    roles: [loggedInUser?.role, employee?.role].filter(Boolean),
  };
}
