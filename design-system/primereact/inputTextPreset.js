/* PrimeReact InputText — design-system PassThrough preset.
 *
 * The second component off lara, after DataTable. It matters more than its size
 * suggests: an InputText sits in every column filter, so as long as it stayed
 * themed the table was only partly design-system-owned, and the enforcement
 * spec could see `p-inputtext` / `p-component` inside an otherwise clean table.
 *
 * These classes reproduce, in DS utilities, what the `.p-inputtext.p-component`
 * block in globals.css did — that block exists because lara's own `.p-inputtext`
 * had to be outranked on specificity (0,2,0 beats 0,1,0). Rendering unstyled
 * removes both sides of that fight rather than winning it again.
 *
 * Focus and disabled treatment are NOT here. base.css supplies both at zero
 * specificity via `:where()`, so every focusable element in the system gets one
 * ring from one place; repeating it per preset is how rings drift apart.
 */

/* `h-control` is the 32px control scale, matching the filter row the styled
   sheet sized with `.p-datatable .p-column-filter-row .p-inputtext`. That
   selector is dead under `unstyled` — neither `.p-datatable` nor
   `.p-column-filter-row` is emitted — which is why the height has to be stated
   here rather than inherited from the sheet. */
export const inputTextPt = {
  root: {
    className: [
      'h-control w-full rounded-md border border-line-subtle bg-surface',
      'px-2 text-12 text-body',
      'transition-colors',
      'hover:border-brand-hover',
      /* The states the `.p-inputtext.p-component` block carried. Focus itself
         is NOT here — base.css supplies one ring for everything focusable at
         zero specificity, and repeating it per preset is how rings drift. */
      'disabled:bg-surface-disabled disabled:border-line disabled:text-disabled',
      '[&.p-invalid]:border-danger',
      // No placeholder colour here: base.css sets `::placeholder` globally.
      // `appearance-none` because Safari paints its own inner border on inputs,
      // which reads as a doubled hairline against a 1px border.
      'appearance-none',
    ].join(' '),
  },
};

export default inputTextPt;
