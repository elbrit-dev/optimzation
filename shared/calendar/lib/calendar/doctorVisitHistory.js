import { TAG_IDS } from "@calendar/components/calendar/constants";

/**
 * Doctor id off a calendar event.
 *
 * Server events carry the plain Lead id, while an event still sitting in the
 * offline submission queue carries whatever the form held — which may be an
 * option object.
 */
function resolveDoctorIds(doctor) {
  const values = Array.isArray(doctor) ? doctor : [doctor];

  return values
    .map((entry) => {
      if (!entry) return null;
      if (typeof entry === "string") return entry;
      return entry.value ?? entry.name ?? entry.code ?? null;
    })
    .filter(Boolean)
    .map(String);
}

function toTimestamp(value) {
  if (!value) return null;

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
}

/**
 * When the visit actually happened — not when it was planned.
 *
 * A doctor visit is only "done" once an employee participant is marked
 * attending with a visit timestamp, so a plan that was never carried out never
 * counts as a visit.
 */
function resolveVisitTimestamp(event) {
  const participants = Array.isArray(event?.participants)
    ? event.participants
    : [];

  const visitTimes = participants
    .filter(
      (participant) =>
        participant?.type === "Employee" &&
        String(participant?.attending).toLowerCase() === "yes"
    )
    .map((participant) => toTimestamp(participant?.custom_visit_time))
    .filter(Boolean);

  if (!visitTimes.length) return null;

  return Math.max(...visitTimes);
}

/**
 * Map of doctor id → timestamp of the most recent completed visit.
 *
 * Derived from the events the calendar already holds rather than a separate ERP
 * round trip. The calendar loads one year at a time, so a doctor last visited
 * before that window reads as "no visit recorded" — a blank, never a wrong date.
 */
export function buildLastVisitByDoctor(events = []) {
  const lastVisitByDoctor = new Map();

  events.forEach((event) => {
    if (event?.tags !== TAG_IDS.DOCTOR_VISIT_PLAN) return;

    const visitedAt = resolveVisitTimestamp(event);
    if (!visitedAt) return;

    resolveDoctorIds(event.doctor).forEach((doctorId) => {
      const current = lastVisitByDoctor.get(doctorId);
      if (!current || visitedAt > current) {
        lastVisitByDoctor.set(doctorId, visitedAt);
      }
    });
  });

  return lastVisitByDoctor;
}
