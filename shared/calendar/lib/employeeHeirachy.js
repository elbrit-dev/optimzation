import { LOGGED_IN_USER } from "@calendar/components/auth/calendar-users";
import { roleCodeFromProfile } from "@calendar/lib/meetingRoles";

// The host passes LOGGED_IN_USER.roleId from the Employee `role_id` field, which
// can be stale and differs from `custom_role_profile` — the field the role
// hierarchy (and users[].roleId) is actually keyed on. Resolve the logged-in
// user's role from the loaded employee data so the walk root matches the edges;
// fall back to the host value only when no employee match is found.
export function resolveLoggedInRoleId(users = []) {
  const matchById = users.find(
    (user) => user.id && user.id === LOGGED_IN_USER.id
  );
  if (matchById?.roleId) return matchById.roleId;

  const matchByEmail = users.find(
    (user) =>
      user.email &&
      LOGGED_IN_USER.email &&
      user.email.toLowerCase() === LOGGED_IN_USER.email.toLowerCase()
  );
  if (matchByEmail?.roleId) return matchByEmail.roleId;

  return LOGGED_IN_USER.roleId ?? null;
}

// Admin, IT, GM and CEO sit outside every reporting chain (root role profiles
// with no children), so no upward share reaches them and the hierarchy treats
// them like a BE. They still see everyone's Other Work, and can pick anyone in
// the calendar's employee filter to do it. "Deputy GM" is not GM.
const ALL_OTHER_WORK_ROLE_CODES = ["ADMIN", "IT", "GM", "CEO"];

export function seesAllOtherWork(users = []) {
  if (LOGGED_IN_USER?.role === "Admin" || LOGGED_IN_USER?.roleId === "Admin") {
    return true;
  }
  return [resolveLoggedInRoleId(users), LOGGED_IN_USER?.roleId].some((roleId) =>
    ALL_OTHER_WORK_ROLE_CODES.includes(roleCodeFromProfile(roleId))
  );
}

export function resolveVisibleRoleIds(
  elbritEdges = [],
  roleId = LOGGED_IN_USER?.roleId
) {

  if (!roleId) return [];

  const { roleMap, childrenMap } = buildRoleIndex(elbritEdges);
  const myRoleId = roleId;
  const myNode = roleMap.get(myRoleId);


  if (!myNode) return [];

  // ADMIN
  if (LOGGED_IN_USER.role === "Admin") {
    return [...roleMap.keys()];
  }

  const visible = new Set();

  // BE user -> only self
  if (!myNode.is_group) {
    return [myRoleId];
  }

  const queue = [myRoleId];
  visible.add(myRoleId);

  while (queue.length) {
    const current = queue.shift();
    const children = childrenMap.get(current) || [];

    children.forEach(childId => {
      if (!visible.has(childId)) {
        visible.add(childId);
        queue.push(childId);
      }
    });
  }
  return [...visible];
}

// A "leaf" role (is_group = false, e.g. a BE) has no subordinates. ERP already
// permission-scopes the events it returns to such a user (their own + anything
// shared with them via DocShare), so the client-side hierarchy filter must not
// narrow further — otherwise DocShare-shared events (owned by someone outside
// the user's own role) get dropped even though ERP granted access.
export function isLeafRole(elbritEdges = [], roleId) {
  if (!roleId) return false;

  // Admins are handled separately (they see everything); never treat as leaf.
  if (LOGGED_IN_USER?.role === "Admin" || LOGGED_IN_USER?.roleId === "Admin") {
    return false;
  }

  const { roleMap } = buildRoleIndex(elbritEdges);
  const node = roleMap.get(roleId);
  if (!node) return false;

  return !node.is_group;
}

function buildRoleIndex(elbritEdges = []) {
  const nodes = elbritEdges.map(e => e.node);

  const roleMap = new Map();      // roleId → node
  const childrenMap = new Map();  // roleId → childRoleIds[]

  nodes.forEach(node => {
    roleMap.set(node.role_id, node);

    const parentId = node.parent_elbrit_role_id__name;
    if (!parentId) return;

    if (!childrenMap.has(parentId)) {
      childrenMap.set(parentId, []);
    }

    childrenMap.get(parentId).push(node.role_id);
  });

  return { roleMap, childrenMap };
}

// All role_ids whose department falls under the given role's department
// (department nested set: lft/rgt). Used by the event form employee picker.
export function resolveDepartmentRoleIds(elbritEdges = [], roleId) {
  if (!roleId) return [];

  const nodes = elbritEdges.map((edge) => edge.node);
  const myNode = nodes.find((node) => node.role_id === roleId);
  if (!myNode || myNode.lft == null || myNode.rgt == null) return [];

  const myLft = Number(myNode.lft);
  const myRgt = Number(myNode.rgt);
  if (Number.isNaN(myLft) || Number.isNaN(myRgt)) return [];

  return nodes
    .filter((node) => {
      if (node.lft == null || node.rgt == null) return false;
      const lft = Number(node.lft);
      const rgt = Number(node.rgt);
      if (Number.isNaN(lft) || Number.isNaN(rgt)) return false;
      return lft >= myLft && rgt <= myRgt;
    })
    .map((node) => node.role_id);
}

export function resolveSuperiorRoleIds(
  elbritEdges = [],
  roleId
) {
  if (!roleId) return [];

  const nodes = elbritEdges.map((edge) => edge.node);
  const parentByRoleId = new Map();

  nodes.forEach((node) => {
    parentByRoleId.set(
      node.role_id,
      node.parent_elbrit_role_id__name ?? null
    );
  });

  const superiors = [];
  let currentRoleId = parentByRoleId.get(roleId);
  while (currentRoleId) {
    superiors.push(currentRoleId);
    currentRoleId = parentByRoleId.get(currentRoleId);
  }

  return superiors;
}

export function resolveSuperiorEmployeeIds(
  elbritEdges = [],
  users = [],
  roleId
) {
  const superiorRoleIds = new Set(
    resolveSuperiorRoleIds(elbritEdges, roleId)
  );

  if (!superiorRoleIds.size) {
    return [];
  }

  return users
    .filter(
      (user) =>
        user.id &&
        user.roleId &&
        superiorRoleIds.has(user.roleId)
    )
    .map((user) => user.id);
}

export function resolveSuperiorShareUserIds(
  elbritEdges = [],
  users = [],
  roleId
) {
  const superiorRoleIds = new Set(
    resolveSuperiorRoleIds(elbritEdges, roleId)
  );
  if (!superiorRoleIds.size) {
    return [];
  }

  return users
    .filter(
      (user) =>
        user.email &&
        user.roleId &&
        superiorRoleIds.has(user.roleId)
    )
    .map((user) => user.email)
    .filter(Boolean);
}

// Like resolveSuperiorShareUserIds, but the walk up stops at the first role of
// `stopCode` (role profile prefix, "SM2-ELBR-…" -> "SM"), inclusive: a leave
// goes to the ABM, RBM and SM, never above. With no such role in the chain the
// whole chain is used.
export function resolveSuperiorShareUserIdsUpTo(
  elbritEdges = [],
  users = [],
  roleId,
  stopCode = "SM"
) {
  const chain = resolveSuperiorRoleIds(elbritEdges, roleId);
  const stopAt = chain.findIndex(
    (id) => String(id).split("-")[0].replace(/[0-9]/g, "").toUpperCase() === stopCode
  );
  const superiorRoleIds = new Set(stopAt === -1 ? chain : chain.slice(0, stopAt + 1));
  if (!superiorRoleIds.size) return [];

  return users
    .filter((user) => user.email && user.roleId && superiorRoleIds.has(user.roleId))
    .map((user) => user.email);
}

// Seats below an SM, by role profile prefix. ERP shares a new Event of theirs
// up to and including their SM itself (Server Script "Elbrit Event Upline
// Share", After Insert), from the whole tree — including the managers in
// another department that this browser cannot see.
const SERVER_SHARED_SEAT_CODES = ["BE", "ABM", "RBM", "SRBM", "KAM"];

// The managers a NEW Event still needs the app to share with, given that ERP
// has already shared it up to the SM: only those above the SM. `null` when ERP
// shares nothing for this seat (an SM, or a seat outside the sales tree) — the
// caller then shares with the whole chain itself, as before.
// A chain with no SM in sight belongs to a sales seat whose managers are
// hidden by Department permissions: ERP covers all of them, so nothing is left.
export function resolveSuperiorShareUserIdsAboveSm(elbritEdges = [], users = [], roleId) {
  if (!roleId) return null;
  const ownCode = roleCodeFromProfile(roleId);
  if (ownCode === "SM") return null;
  const chain = resolveSuperiorRoleIds(elbritEdges, roleId);
  const smAt = chain.findIndex((id) => roleCodeFromProfile(id) === "SM");
  let above;
  if (smAt !== -1) above = chain.slice(smAt + 1);
  else if (SERVER_SHARED_SEAT_CODES.includes(ownCode)) above = [];
  else return null;

  const aboveRoleIds = new Set(above);
  return users
    .filter((user) => user.email && user.roleId && aboveRoleIds.has(user.roleId))
    .map((user) => user.email);
}

export function resolveVisibleEmployeeIds(elbritEdges, users) {
  // ✅ ADMIN (roleId === "Admin") → see ALL users
  if (LOGGED_IN_USER?.roleId === "Admin") {
    return users.map(u => u.id);
  }

  const visibleRoleIds = resolveVisibleRoleIds(
    elbritEdges,
    resolveLoggedInRoleId(users)
  );
  if (!visibleRoleIds.length) {
    return users.map((user) => user.id);
  }
  const allowedRoles = new Set(visibleRoleIds);

  return users
    .filter(u => allowedRoles.has(u.roleId))
    .map(u => u.id);
}



// The DR Tour Plan HQ of each seat the user plans for -- their own and every
// seat under them (an admin: every seat) -- read from the seat's Role Profile
// (custom_territory), never the Employee record: HR's Employee HQ can disagree
// (E00985's says Kumbakonam, his seat and all its doctor mappings say Tanjore),
// and a vacant seat has no employee at all but still has an HQ and doctors.
// -> Map(roleId -> hq), seats without an HQ left out
export function resolveSeatHqs(elbritEdges = [], roleId) {
  const isAdmin = LOGGED_IN_USER?.role === "Admin" || LOGGED_IN_USER?.roleId === "Admin";
  const roles = new Set(resolveVisibleRoleIds(elbritEdges, roleId));
  const seats = new Map();
  elbritEdges.forEach(({ node }) => {
    if (node?.role_id && node.hq && (isAdmin || roles.has(node.role_id))) {
      seats.set(node.role_id, node.hq);
    }
  });
  return seats;
}

// The HQs a user books DR Tour Plans against: their own seat's and those of
// every seat under them (resolveSeatHqs). A BE has one, an ABM their BEs', an
// RBM / SM their team's, an admin every one. `fallbackHq` is the user's own HQ
// when no seat carries one.
// -> [{ doctype: "Territory", value, label }], sorted
export function resolveOwnHqOptions(employees = [], elbritEdges = [], roleId, fallbackHq = null) {
  const hqs = new Set(resolveSeatHqs(elbritEdges, roleId).values());
  if (!hqs.size && fallbackHq) hqs.add(fallbackHq);
  // Real HQs only ("HQ-Erode"): a manager's own territory can be a region
  // ("Tn-Coimbatore"), which no doctor is mapped to. Kept as-is when there is
  // no HQ- name at all, rather than offering nothing.
  const real = [...hqs].filter((hq) => /^HQ-/i.test(hq));
  return (real.length ? real : [...hqs])
    .sort((a, b) => a.localeCompare(b))
    .map((hq) => ({ doctype: "Territory", value: hq, label: hq }));
}
