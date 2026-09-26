'use client';

/* The harness remembers its settings in this browser — environment, who
 * you are acting as, props, viewport, add-on switches — so a reload (or a
 * hot reload while iterating) comes back to the same screen. Keys are
 * namespaced; values are JSON. Dev-only: this includes ERP tokens, which is
 * why the harness says so where you type one. */

import { useCallback, useEffect, useRef, useState } from 'react';

const PREFIX = 'elbrit.harness.';

export function readStored(key, fallback) {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writeStored(key, value) {
  if (typeof window === 'undefined') return;
  try {
    if (value === undefined) window.localStorage.removeItem(PREFIX + key);
    else window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* Storage full or blocked: the harness still works, it just forgets. */
  }
}

/* useState that persists under `key`. The stored value is read after mount
   (the server render has no storage), and a change of `key` reloads it. */
export function useStoredState(key, initial) {
  const initialRef = useRef(initial);
  const [value, setValue] = useState(initial);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setValue(readStored(key, initialRef.current));
    setLoaded(true);
  }, [key]);
  const set = useCallback(
    (next) =>
      setValue((prev) => {
        const v = typeof next === 'function' ? next(prev) : next;
        writeStored(key, v);
        return v;
      }),
    [key],
  );
  return [value, set, loaded];
}
