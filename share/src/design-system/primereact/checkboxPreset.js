/* PrimeReact Checkbox — design-system PassThrough preset.
 *
 * WHY IT LIVES HERE AND NOT IN dataTablePreset.js
 * A DataTable's row/header selection controls ARE Checkbox components —
 * `data-pc-name="checkbox"` in the DOM — so once `checkbox` is in the global
 * registry, a copy of these classes inside the DataTable preset would apply a
 * SECOND time to the same element. Provider-level `pt` and component-level `pt`
 * compose; they do not replace each other.
 *
 * The rule that follows, and it applies to the rest of the sweep: when
 * PrimeReact nests component B inside component A, B's styling belongs in the
 * registry, NOT in A's preset. Paginator was the first case of this, Checkbox
 * the second. A's preset keeps only the parts A itself renders — and its test
 * hooks, which stay in dataTableHooks.js because they name table parts
 * (`row-checkbox`) rather than checkbox parts.
 *
 * The checked treatment is driven off the ancestor's `data-p-highlight` rather
 * than `context.checked`, which is NOT populated for this component — see
 * landmine 2 in docs/PRIMEREACT_SWEEP.md. The boxes rendered permanently
 * unchecked on the first attempt, while rows really were selected.
 */
const cx = (...parts) => parts.filter(Boolean).join(' ');

const BOX =
  'inline-flex h-control-sm aspect-square shrink-0 items-center justify-center ' +
  'rounded-sm border border-line bg-surface transition-colors hover:border-brand-hover';

/* Written out in full, not built from a constant: Tailwind only generates
   classes it finds as literal strings in the source. See landmine 8.

   `>` and NOT the descendant combinator `_`. PrimeReact puts `data-p-highlight`
   on the checkbox's own root, but a DataTable ALSO puts it on a selected <tr>.
   With `[[data-p-highlight=true]_&]` any ancestor matched, so an UNCHECKED box
   sitting in a selected row rendered as checked. The box is a direct child of
   the checkbox root, so the child combinator says exactly what is meant. */
const BOX_CHECKED =
  '[[data-p-highlight=true]>&]:border-brand [[data-p-highlight=true]>&]:bg-brand';

/* The real <input type="checkbox">, behind the styled box. lara hid it with
   `p-hidden-accessible`; `unstyled` removes that class, and without a
   replacement the browser's own cyan-accent native control renders VISIBLY next
   to ours — two controls per row. `sr-only` rather than `hidden`, because the
   input is what receives focus and the click. */
const INPUT = 'sr-only';

export const checkboxPt = {
  root: { className: 'relative inline-flex items-center' },
  input: { className: INPUT },
  box: { className: cx(BOX, BOX_CHECKED) },
  icon: { className: 'text-10 text-on-brand' },
};

/* Shared with the DataTable preset's `rowRadioButton`, which is the same
   control with a round corner and a dot instead of a tick. */
export const radioBoxClassName = cx(BOX, 'rounded-full', BOX_CHECKED);
export const selectInputClassName = INPUT;

export default checkboxPt;
