/* PrimeReact Calendar — design-system PassThrough preset.
 *
 * Part of the INPUT CLUSTER (see structural rule B in
 * docs/PRIMEREACT_SWEEP.md): Calendar renders an InputText internally, so it
 * cannot stay lara-themed once `inputtext` is in the global registry — the
 * registry would layer design-system classes on top of the theme. Calendar,
 * InputNumber and InputText migrate together.
 *
 * The PANEL is the bulk of this file and it is the part that had never been
 * seen by any test: the product's only Calendar is the table's date-range
 * filter, whose panel is open only transiently. `/dev/inputs` renders it with
 * `inline` so it can be baselined at all.
 *
 * The time picker sections are present but minimal — nothing in the app enables
 * `showTime`, so they exist to avoid an unstyled surprise rather than because
 * they were verified.
 */
const cx = (...parts) => parts.filter(Boolean).join(' ');

/* Header nav and the today/clear buttons share a shape. */
const NAV_BUTTON =
  'inline-flex h-control-sm aspect-square items-center justify-center rounded-full ' +
  'text-ds-secondary transition-colors hover:bg-brand-tint-weak hover:text-brand-text';

/* A day cell. State comes from PrimeReact's data attributes rather than the pt
   context — `context.selected` and friends are unreliable (landmine 2), while
   the attributes survive `unstyled`. Written out in full because Tailwind only
   generates literal class strings (landmine 8). */
const DAY = cx(
  'inline-flex h-control aspect-square items-center justify-center rounded-full',
  'text-12 text-body transition-colors cursor-pointer',
  'hover:bg-brand-tint-weak',
  /* Every state attribute lives on the <td> (the `day` section), not on this
     <span> (`dayLabel`), so each variant has to reach up one level with the
     child combinator. Writing them as `[&[data-p-today=true]]` — testing the
     span itself — matched nothing at all, and the first render came out with
     no today marker and no dimmed other-month days. Same shape as the Timeline
     nth-child case; see landmine 13. */
  /* `text-ds-secondary`, not `text-ds-muted`. Muted is rgba(0,0,0,0.45) — 3.35:1 on
     white, below the AA floor — and an adjacent month's dates are still dates
     a user reads and clicks, not decoration. Secondary (0.65) clears it. */
  '[[data-p-other-month=true]>&]:text-ds-secondary',
  '[[data-p-today=true]>&]:bg-info-wash [[data-p-today=true]>&]:text-brand-text',
  /* `data-p-highlight` is the exception: PrimeReact puts THAT one on the span
     itself, while `data-p-today` and `data-p-other-month` are on the <td>.
     Mixed levels in the same component, so each attribute had to be checked
     against the DOM individually — moving all of them to the child combinator
     dimmed the other-month days correctly and silently un-filled the selected
     one. Selected wins over today, hence the important flag. */
  '[&[data-p-highlight=true]]:bg-brand-fill! [&[data-p-highlight=true]]:text-on-brand',
  '[[data-p-disabled=true]>&]:text-disabled [[data-p-disabled=true]>&]:cursor-default',
);

export const calendarPt = {
  root: { className: 'relative inline-flex items-center' },

  /* Calendar renders an InputText for its field. That instance inherits
     `unstyled` from this component, and its styling comes from the global
     `inputtext` registry entry — nothing to add here. */

  dropdownButton: {
    root: cx(
      'inline-flex h-control aspect-square shrink-0 items-center justify-center',
      'rounded-r-md border border-l-0 border-line-subtle bg-surface',
      'text-ds-secondary transition-colors hover:border-brand-hover hover:text-brand-text',
    ),
  },

  panel: {
    className: cx(
      'z-1000 rounded-lg border border-line-subtle bg-surface shadow-pop',
      // `inline` mode renders the same panel in normal flow.
      'text-14',
    ),
  },
  groupContainer: { className: 'flex' },
  group: { className: 'flex-1 px-2 pb-2' },

  header: {
    className: 'flex items-center justify-between border-b border-line-subtle p-2',
  },
  previousButton: { className: NAV_BUTTON },
  nextButton: { className: NAV_BUTTON },
  previousIcon: { className: 'text-12' },
  nextIcon: { className: 'text-12' },

  title: { className: 'flex items-center gap-2' },
  monthTitle: { className: 'font-semibold text-body hover:text-brand-text' },
  yearTitle: { className: 'font-semibold text-body hover:text-brand-text' },
  decadeTitle: { className: 'font-semibold text-body' },

  container: { className: 'w-full border-collapse' },
  table: { className: 'w-full border-collapse' },
  weekHeader: { className: 'text-12 text-ds-secondary' },
  weekLabelContainer: { className: 'text-12 text-ds-muted' },
  weekNumber: { className: 'text-12 text-ds-muted' },

  /* `td` padding, matching the override sheet's `.p-datepicker table td`. */
  day: { className: 'p-1 text-center' },
  dayLabel: { className: DAY },

  /* The month and year pickers, shown when the header title is clicked. */
  monthPicker: { className: 'grid grid-cols-3 gap-1 p-2' },
  month: { className: cx('cursor-pointer rounded-md p-2 text-center text-12 text-body hover:bg-brand-tint-weak', '[&[data-p-highlight=true]]:bg-brand-fill [&[data-p-highlight=true]]:text-on-brand') },
  yearPicker: { className: 'grid grid-cols-3 gap-1 p-2' },
  year: { className: cx('cursor-pointer rounded-md p-2 text-center text-12 text-body hover:bg-brand-tint-weak', '[&[data-p-highlight=true]]:bg-brand-fill [&[data-p-highlight=true]]:text-on-brand') },

  buttonbar: {
    className: 'flex items-center justify-between border-t border-line-subtle p-2',
  },
  /* These two ARE Buttons, so the global `button` registry entry styles them —
     and its default is the filled brand variant, which put two heavy blue
     buttons in a datepicker footer. `ds-button-text` picks the quiet variant
     instead.

     The class rather than a competing utility on purpose: buttonPreset matches
     it with `[&.ds-button-text]:bg-transparent`, an arbitrary variant at
     specificity 0,2,0, which beats its own `bg-brand` at 0,1,0. Adding
     `bg-transparent` here instead would be 0,1,0 against 0,1,0 and the winner
     would come down to declaration order in the generated sheet. */
  todayButton: { root: 'ds-button-text ds-button-sm' },
  clearButton: { root: 'ds-button-text ds-button-sm' },

  footer: { className: 'border-t border-line-subtle p-2' },

  /* Time picker: nothing in the app sets `showTime`, so these are here to
     avoid an unstyled surprise rather than because they were verified. */
  timePicker: { className: 'flex items-center justify-center gap-2 border-t border-line-subtle p-2' },
  hourPicker: { className: 'text-14 text-body' },
  minutePicker: { className: 'text-14 text-body' },
  secondPicker: { className: 'text-14 text-body' },
  ampmPicker: { className: 'text-14 text-body' },
  separatorContainer: { className: 'text-14 text-ds-secondary' },
  incrementButton: { className: NAV_BUTTON },
  decrementButton: { className: NAV_BUTTON },
};

export default calendarPt;
