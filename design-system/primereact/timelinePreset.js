/* PrimeReact Timeline — design-system PassThrough preset.
 *
 * THIS ONE IS DIFFERENT FROM THE OTHERS, AND IT MATTERS.
 * For every component so far, `unstyled` removed only the THEME's classes and
 * the component still laid itself out. Timeline does not: its layout CSS —
 * `display:flex`, the alignment rules, `nth-child(even) { flex-direction:
 * row-reverse }` — is injected by the component itself into `@layer primereact`
 * via `useHandleStyle`, and `unstyled` drops that too. Setting `unstyled`
 * without this preset collapses all three alignments into one column.
 *
 * That was verified before writing a line of it: `unstyled` was set
 * temporarily and all six tests in e2e/timeline/timeline-preset.spec.js failed,
 * including the two geometry assertions. Check this for any component whose
 * layout is structural rather than decorative.
 *
 * SCOPE: vertical only. `layout="horizontal"` is never used — EventTimeline is
 * the single call site and does not set it — so its rules are deliberately
 * absent. Adding a horizontal timeline means adding them.
 */
const cx = (...parts) => parts.filter(Boolean).join(' ');

/* The alignment mode has to reach the child sections somehow. PrimeReact
   normally signals it with `p-timeline-left` / `-right` / `-alternate` on the
   root, which is exactly what `unstyled` deletes. The root section DOES receive
   `props`, so it re-emits the mode as a data attribute and the children match
   on it with Tailwind's ancestor variant.

   Every variant below is written out in full rather than composed from a
   variable: Tailwind only generates classes it can find as literal strings.
   See landmine 8 in docs/PRIMEREACT_SWEEP.md. */
export const timelinePt = {
  root: ({ props }) => ({
    className: 'flex grow flex-col',
    'data-ds-align': props?.align ?? 'left',
  }),

  event: {
    className: cx(
      'relative flex min-h-[70px] last:min-h-0',
      // align="right" mirrors every row.
      '[[data-ds-align=right]_&]:flex-row-reverse',
      // align="alternate" mirrors only the even ones.
      '[[data-ds-align=alternate]_&]:even:flex-row-reverse',
    ),
  },

  opposite: {
    className: cx(
      'flex-1 px-4',
      '[[data-ds-align=left]_&]:text-right',
      '[[data-ds-align=right]_&]:text-left',
      /* The odd/even test belongs to the EVENT, but the text-align lands on
         its child, so the variant has to reach up one level:
         `:nth-child(even) > &`. Composing it as `[ancestor_&]:even:` instead
         tested the CONTENT's own position among its siblings, which is always
         the same — the alignment silently stopped alternating and only the
         screenshot caught it. */
      '[[data-ds-align=alternate]_:nth-child(odd)>&]:text-right',
      '[[data-ds-align=alternate]_:nth-child(even)>&]:text-left',
    ),
  },

  content: {
    className: cx(
      'flex-1 px-4',
      '[[data-ds-align=left]_&]:text-left',
      '[[data-ds-align=right]_&]:text-right',
      '[[data-ds-align=alternate]_:nth-child(odd)>&]:text-left',
      '[[data-ds-align=alternate]_:nth-child(even)>&]:text-right',
    ),
  },

  /* `flex: 0` in the original, i.e. it neither grows nor shrinks from its
     content width — `flex-none` is the same declaration. */
  separator: { className: 'flex flex-none flex-col items-center' },

  /* `self-baseline` is load-bearing: it lines the marker up with the first line
     of the card rather than centring it against the whole card. The visual
     treatment (the ring, the fill) comes from the marker template that
     EventTimeline supplies, so this stays structural only. */
  marker: { className: 'flex self-baseline' },

  /* 2px, matching the theme's `.p-timeline.p-timeline-vertical` rule, tinted
     with the design system's info border rather than lara's #e5e7eb grey. */
  connector: { className: 'w-0.5 grow bg-info-border' },
};

export default timelinePt;
