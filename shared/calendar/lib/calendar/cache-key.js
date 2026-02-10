export function buildRangeCacheKey(view, start, end) {
    return `${view}:${start.toISOString().slice(0, 10)}:${end
      .toISOString()
      .slice(0, 10)}`;
  }
  