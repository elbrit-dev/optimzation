/* Parallel, but never too much of it (17 Nov 2026). Plain JS, for the
 * browser and the server alike.
 *
 *   limiter(n)        -> run(fn): at most n of fn running at once, the rest
 *                        wait their turn in order.
 *   eachByGroup(items, keyOf, n, work)
 *                     -> the items of DIFFERENT groups (employees, claims) in
 *                        parallel, at most n groups at a time; one group's
 *                        items one after another, so two writes never race
 *                        on the same record (a claim's sanctioned total, say).
 *                        Resolves to [{ item, ok, value | error }] in the
 *                        items' order; one failure never stops the others.
 */

export function limiter(max) {
  const n = Math.max(1, Number(max) || 1);
  let active = 0;
  const waiting = [];
  const next = () => {
    if (active >= n || !waiting.length) return;
    active += 1;
    const { fn, resolve, reject } = waiting.shift();
    Promise.resolve()
      .then(fn)
      .then(resolve, reject)
      .finally(() => {
        active -= 1;
        next();
      });
  };
  const run = (fn) =>
    new Promise((resolve, reject) => {
      waiting.push({ fn, resolve, reject });
      next();
    });
  run.pending = () => waiting.length;
  run.active = () => active;
  return run;
}

export async function eachByGroup(items, keyOf, max, work) {
  const groups = new Map();
  items.forEach((item, i) => {
    const k = String(keyOf(item) ?? i);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push({ item, i });
  });
  const out = new Array(items.length);
  const run = limiter(max);
  await Promise.all(
    [...groups.values()].map((list) =>
      run(async () => {
        for (const { item, i } of list) {
          try {
            out[i] = { item, ok: true, value: await work(item) };
          } catch (error) {
            out[i] = { item, ok: false, error };
          }
        }
      }),
    ),
  );
  return out;
}
