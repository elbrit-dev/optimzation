// lib/calendar/data-cache.js

const cache = Object.create(null);
const pending = Object.create(null);

export async function getCached(key, fetcher) {
  if (Object.hasOwn(cache, key)) {
    return cache[key];
  }

  if (pending[key]) {
    return pending[key];
  }

  pending[key] = Promise.resolve(fetcher())
    .then((data) => {
      cache[key] = data;
      delete pending[key];
      return data;
    })
    .catch((error) => {
      delete pending[key];
      throw error;
    });

  return pending[key];
}

export function clearCached(keys = []) {
  keys.forEach((key) => {
    delete cache[key];
    delete pending[key];
  });
}
export function clearParticipantCache(key) {
  delete cache[key];
  delete pending[key];
}
