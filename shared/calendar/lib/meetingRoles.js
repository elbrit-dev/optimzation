import { LOGGED_IN_USER } from "@calendar/components/auth/calendar-users";

/**
 * Meeting role resolution — WITHOUT any ERP schema change.
 *
 * A meeting has no explicit "host" field on the Event doctype, so the conductor
 * is DERIVED from the participants' role profiles: in a team meeting created by a
 * BE, the manager-level participant (ABM / RBM / SM) is the one conducting. The
 * viewer is then classified relative to the meeting as:
 *   - creator     : the person who created it (Event owner / custom_employee_id)
 *   - host        : the derived conductor (highest-ranked participant)
 *   - participant : any other employee attendee
 *   - viewer      : sees it (e.g. shared to them) but isn't creator/host/attendee
 *
 * Because there's no allocation field, when several participants share the top
 * rank (e.g. 3 ABMs) the FIRST one is treated as the canonical host. Picking a
 * specific one out of several peers would need an explicit host field in ERP.
 */

// Higher number = more senior. Prefix is taken from the role profile
// (e.g. "ABM1-CND-CH-CHE" -> "ABM").
const ROLE_RANK = {
  ADMIN: 5,
  SM: 4,
  RBM: 3,
  ABM: 2,
  BE: 1,
};

// Lowest rank that counts as "conducting" a meeting. BEs never auto-host.
const HOST_MIN_RANK = ROLE_RANK.ABM;

function normalizeEmail(email) {
  return (email || "").trim().toLowerCase();
}

/** "ABM1-CND-CH-CHE" -> "ABM"; returns null when unparseable. */
export function roleCodeFromProfile(roleProfile) {
  if (!roleProfile) return null;
  const firstSegment = String(roleProfile).split("-")[0] ?? "";
  const code = firstSegment.replace(/[0-9]/g, "").toUpperCase().trim();
  return code || null;
}

function roleRank(roleProfile) {
  const code = roleCodeFromProfile(roleProfile);
  return code && ROLE_RANK[code] != null ? ROLE_RANK[code] : 0;
}

function participantRoleProfile(participant) {
  return participant?.role_profile ?? participant?.kly_role_id ?? null;
}

/**
 * The conductor: the highest-ranked employee participant, provided that rank is
 * manager-level (>= ABM). First wins on a tie. Returns null when the meeting has
 * no manager-level attendee.
 */
export function resolveMeetingHost(participants = []) {
  let host = null;
  let bestRank = 0;

  for (const participant of participants) {
    if (participant?.type !== "Employee") continue;
    const rank = roleRank(participantRoleProfile(participant));
    if (rank > bestRank) {
      bestRank = rank;
      host = participant;
    }
  }

  return bestRank >= HOST_MIN_RANK ? host : null;
}

/**
 * Classify the logged-in user against a meeting.
 * @returns {{
 *   viewerRole: "creator"|"host"|"participant"|"viewer",
 *   isCreator: boolean,
 *   isHost: boolean,
 *   isParticipant: boolean,
 *   host: object|null,
 *   hostIsCreator: boolean,
 * }}
 */
export function resolveMeetingRoles({ event, participants = [] }) {
  const empty = {
    viewerRole: "viewer",
    isCreator: false,
    isHost: false,
    isParticipant: false,
    host: null,
    hostIsCreator: false,
  };

  if (!event || !LOGGED_IN_USER) return empty;

  const userId = LOGGED_IN_USER.id != null ? String(LOGGED_IN_USER.id) : null;
  const userEmail = normalizeEmail(LOGGED_IN_USER.email);

  const creatorId =
    event.ownerEmployeeId != null ? String(event.ownerEmployeeId) : null;
  const creatorEmail = normalizeEmail(event.ownerEmail);

  const host = resolveMeetingHost(participants);
  const hostId = host?.id != null ? String(host.id) : null;
  const hostEmail = normalizeEmail(host?.email);

  const matchesUser = (id, email) =>
    (!!userId && !!id && String(id) === userId) ||
    (!!userEmail && !!email && normalizeEmail(email) === userEmail);

  const hostIsCreator =
    !!host &&
    ((!!creatorId && hostId === creatorId) ||
      (!!creatorEmail && hostEmail === creatorEmail));

  const isCreator = matchesUser(creatorId, creatorEmail);
  const isHost = !isCreator && !!host && matchesUser(hostId, hostEmail);
  const isParticipant =
    !isCreator &&
    !isHost &&
    participants.some(
      (p) => p.type === "Employee" && matchesUser(p.id, p.email)
    );

  const viewerRole = isCreator
    ? "creator"
    : isHost
    ? "host"
    : isParticipant
    ? "participant"
    : "viewer";

  return { viewerRole, isCreator, isHost, isParticipant, host, hostIsCreator };
}
