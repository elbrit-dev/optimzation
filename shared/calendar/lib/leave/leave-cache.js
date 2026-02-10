const leaveCache = new Map();

export function getLeaveCacheKey(employeeId) {
  return `leave-balance:${employeeId}`;
}

export function getCachedLeaveBalance(key) {
  return leaveCache.get(key);
}

export function setCachedLeaveBalance(key, data) {
  leaveCache.set(key, {
    data,
    ts: Date.now(),
  });
}

export function clearLeaveCache(key) {
  if (key) leaveCache.delete(key);
  else leaveCache.clear();
}
