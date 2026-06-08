// lib/calendar/data-cache.js

const cache = Object.create(null);

export async function getCached(key, fetcher) {
  if (cache[key]) return cache[key];

  const data = await fetcher();
  cache[key] = data;
  return data;
}

export function clearCached(keys = []) {
  keys.forEach((key) => {
    delete cache[key];
  });
}
export function clearParticipantCache(key) {
  delete cache[key];
}

