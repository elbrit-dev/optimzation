import { LOGGED_IN_USER } from "@calendar/components/auth/calendar-users";
export function resolveVisibleRoleIds(elbritEdges = []) {
  
    if (!LOGGED_IN_USER?.roleId) return [];
  
    const { roleMap, childrenMap } = buildRoleIndex(elbritEdges);
    const myRoleId = LOGGED_IN_USER.roleId;
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

  export function resolveVisibleEmployeeIds(elbritEdges, users) {
    // ✅ ADMIN (roleId === "Admin") → see ALL users
    if (LOGGED_IN_USER?.roleId === "Admin") {
      return users.map(u => u.id);
    }
  
    const visibleRoleIds = resolveVisibleRoleIds(elbritEdges);
    if (!visibleRoleIds.length) {
      return users.map((user) => user.id);
    }
    const allowedRoles = new Set(visibleRoleIds);
  
    return users
      .filter(u => allowedRoles.has(u.roleId))
      .map(u => u.id);
  }

  
