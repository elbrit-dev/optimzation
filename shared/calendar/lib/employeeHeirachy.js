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

  export function resolveVisibleEmployeeIds(elbritEdges, users) {
    // ✅ ADMIN (roleId === "Admin") → see ALL users
    if (LOGGED_IN_USER?.roleId === "Admin") {
      return users.map(u => u.id);
    }
  
    const visibleRoleIds = resolveVisibleRoleIds(elbritEdges);
    const allowedRoles = new Set(visibleRoleIds);
  
    return users
      .filter(u => allowedRoles.has(u.roleId))
      .map(u => u.id);
  }

  
