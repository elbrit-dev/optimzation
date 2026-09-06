/* Minimal class joiner. The design system has no dependencies of its own —
   both consuming apps have clsx/tailwind-merge, but a shared primitive must
   not require them. Falsy entries are dropped. */
export function cx(...parts) {
  let out = '';
  for (const part of parts) {
    if (!part) continue;
    out = out ? out + ' ' + part : part;
  }
  return out;
}
