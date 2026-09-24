/* Merge two PrimeReact PassThrough objects.
 *
 * Needed because the test hooks (dataTableHooks.js) and the styling
 * (dataTablePreset.js) are deliberately separate files that both target the
 * same sections — `column.headerCell` carries a className from one and
 * `data-frozen` from the other. Passing two `pt` props is not an option, so
 * they are merged here.
 *
 * Three shapes have to survive the merge, because PrimeReact allows all three
 * for any section:
 *   - a props object            `{ className: 'x' }`
 *   - a function of context     `({ context }) => ({ className: ... })`
 *   - a nested section group    `{ paginator: { root: ... } }`
 *
 * A function on EITHER side makes the result a function, since the merged value
 * cannot be known until PrimeReact supplies the context.
 */

/* Distinguishing a props object from a nested group is the whole difficulty:
   both are plain objects. A props object is identified by carrying at least one
   thing that is unmistakably a DOM prop — `className`, `style`, or a hyphenated
   attribute (`data-*` / `aria-*`). Section names are always plain camelCase
   identifiers, so they never collide with that test. */
const isPropsObject = (o) =>
  'className' in o || 'style' in o || Object.keys(o).some((k) => k.includes('-'));

const mergeProps = (a, b) => {
  if (!a) return b;
  if (!b) return a;
  const out = { ...a, ...b };
  // className is the one prop where both sides must survive, not last-wins.
  const classes = [a.className, b.className].filter(Boolean);
  if (classes.length) out.className = classes.join(' ');
  return out;
};

const callSection = (section, ctx) =>
  typeof section === 'function' ? section(ctx) : section;

export function mergePt(a, b) {
  if (!a) return b;
  if (!b) return a;

  if (typeof a === 'function' || typeof b === 'function') {
    return (ctx) => mergeProps(callSection(a, ctx), callSection(b, ctx));
  }

  if (isPropsObject(a) || isPropsObject(b)) return mergeProps(a, b);

  // Both are nested groups: recurse key by key.
  const out = { ...a };
  for (const key of Object.keys(b)) {
    out[key] = key in a ? mergePt(a[key], b[key]) : b[key];
  }
  return out;
}

export default mergePt;
