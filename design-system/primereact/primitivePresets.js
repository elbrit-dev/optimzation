/* The tail of the PrimeReact sweep — one file, many small components.
 *
 * These are grouped rather than given a file each because they are small and
 * share a vocabulary: a surface is `bg-surface` with a `border-line-subtle`
 * hairline and `rounded-lg`; an interactive item hovers to `brand-tint-weak`;
 * a selected one takes `bg-info-wash` with `text-brand-text`. Splitting them into
 * twenty files would hide that they all say the same three things.
 *
 * NOTE ON WHAT THIS IS. Most of these had NO rules in the override sheet, so
 * their current appearance is lara's own and reproducing it is a restyle, not a
 * re-platforming. `e2e/primitives/primitives.spec.js` baselines each one in the
 * styled state first so the change is visible and reviewable rather than
 * assumed.
 *
 * Section names come from each component's `cx` keys, read out of its module —
 * not guessed. Several differ from the documented ones (`navcontent`, not
 * `navContent`).
 */
const cx = (...parts) => parts.filter(Boolean).join(' ');

/* The three shared shapes. */
const SURFACE = 'rounded-lg border border-line-subtle bg-surface';
const OVERLAY = cx(SURFACE, 'z-1000 shadow-pop');
const ITEM = cx(
  'cursor-pointer rounded-md px-3 py-2 text-12 text-body transition-colors',
  'hover:bg-brand-tint-weak',
  '[&[data-p-highlight=true]]:bg-info-wash [&[data-p-highlight=true]]:text-brand-text',
);

/* A close/dismiss control. Used by Dialog, Sidebar and OverlayPanel. */
/* Shared by Dialog, Sidebar (incl. the bottom drawer) and OverlayPanel.

   `text-body` (0.88), not `text-secondary` (0.65). At 0.65 with a brand-tinted
   hover, the close control read as though it only appeared on hover — the same
   defect the DataTable row expander had, reported on the bottom drawer. A
   dismiss control is the one affordance a modal surface must advertise at
   rest, so it takes full body contrast; the hover tint is then feedback rather
   than the control arriving. */
const CLOSE =
  'inline-flex h-control-sm aspect-square items-center justify-center rounded-full ' +
  'text-body transition-colors hover:bg-brand-tint-weak hover:text-brand-text';

export const dividerPt = {
  root: { className: 'my-3 flex items-center border-t border-line-subtle' },
  content: { className: 'bg-surface px-2 text-12 text-secondary' },
};

/* `animate-pulse` replaces lara's own keyframe; the design system has one
   easing curve and no bespoke animations, so the Tailwind default is used
   rather than inventing a second shimmer. */
export const skeletonPt = {
  root: {
    className: cx(
      'animate-pulse rounded-md bg-surface-disabled',
      /* `shape="circle"` is used once (SavedQueries) and needs a full radius,
         not the default corner — otherwise a circle skeleton renders as a
         rounded square. PrimeReact reports the shape on the root. */
      '[&[data-p-shape=circle]]:rounded-full',
    ),
  },
};

export const tagPt = {
  root: cx(
    'inline-flex items-center gap-1 rounded-full px-2 py-0.5',
    'text-10 font-semibold uppercase tracking-wide',
    'bg-info-wash text-brand-text',
    // Severity variants. PrimeReact puts severity on the root as a data attr.
    '[&[data-p-severity=success]]:bg-success-wash [&[data-p-severity=success]]:text-success',
    '[&[data-p-severity=warning]]:bg-warning-wash [&[data-p-severity=warning]]:text-warning',
    '[&[data-p-severity=danger]]:bg-danger-wash [&[data-p-severity=danger]]:text-danger-text',
  ),
  icon: { className: 'text-10' },
  value: { className: 'leading-none' },
};

export const chipPt = {
  root: { className: 'inline-flex items-center gap-1 rounded-full bg-sunken px-3 py-1 text-12 text-body' },
  label: { className: 'leading-none' },
  icon: { className: 'text-12 text-secondary' },
  removeIcon: { className: 'cursor-pointer text-12 text-muted hover:text-body' },
};

export const cardPt = {
  root: { className: cx(SURFACE, 'shadow-card') },
  body: { className: 'p-4' },
  title: { className: 'type-app-label text-heading' },
  subTitle: { className: 'type-app-body text-secondary' },
  content: { className: 'pt-2' },
  footer: { className: 'pt-3' },
};

export const selectButtonPt = {
  root: { className: 'inline-flex overflow-hidden rounded-md border border-line-subtle' },
  button: {
    className: cx(
      'cursor-pointer px-3 py-1.5 text-12 text-body transition-colors',
      'border-r border-line-subtle last:border-r-0',
      'hover:bg-brand-tint-weak',
      /* `aria-pressed`, NOT `data-p-highlight`. SelectButton is the one
         component in this batch that reports its state through ARIA — every
         other one uses a data attribute — so the usual variant matched nothing
         and neither option ever rendered as selected. */
      '[&[aria-pressed=true]]:bg-brand-fill [&[aria-pressed=true]]:text-on-brand',
    ),
  },
  label: { className: 'leading-none' },
};

/* NOT REGISTERED YET — see the note in registry.js. SplitButton renders two
   Button components internally, and `unstyled` propagates to them, so
   registering this before Button is migrated strips the buttons to bare
   browser defaults. Kept here ready for when Button lands. */
export const splitButtonPt = {
  root: { className: 'inline-flex items-stretch' },
  /* `button` and `menuButton` are Buttons. Button is NOT migrated yet, so it is
     still lara-themed and its own overrides in globals.css still apply — only
     the grouping is set here. Revisit when Button lands. */
  button: { root: 'rounded-r-none' },
  menuButton: { root: 'rounded-l-none border-l-0' },
  menu: { className: cx(OVERLAY, 'm-0 list-none p-1') },
  menuitem: { className: ITEM },
  action: { className: 'flex w-full items-center gap-2' },
  label: { className: 'leading-none' },
  icon: { className: 'text-12' },
  separator: { className: 'my-1 border-t border-line-subtle' },
  submenuIcon: { className: 'ml-auto text-12' },
};

export const tabMenuPt = {
  root: { className: 'relative' },
  menu: { className: 'm-0 flex list-none gap-1 border-b border-line-subtle p-0' },
  menuitem: { className: 'relative' },
  action: {
    className: cx(
      'flex items-center gap-2 px-3 py-2 text-12 text-body no-underline transition-colors',
      'border-b-2 border-transparent hover:text-brand-text',
      '[[data-p-highlight=true]>&]:border-brand [[data-p-highlight=true]>&]:text-brand-text',
    ),
  },
  label: { className: 'leading-none' },
  icon: { className: 'text-12' },
  /* lara animates a sliding underline. The active tab already carries its own
     bottom border above, so the inkbar is redundant and hidden rather than
     reimplemented. */
  inkbar: { className: 'hidden' },
};

/* Accordion exposes only `root`; its tabs are AccordionTab, whose sections are
   addressed through the `accordiontab` registry key. */
export const accordionPt = {
  root: { className: 'flex flex-col gap-1' },
};

export const accordionTabPt = {
  root: { className: SURFACE },
  header: { className: 'm-0' },
  headerAction: {
    className: cx(
      'flex w-full items-center gap-2 rounded-lg px-3 py-2',
      'text-12 font-medium text-body no-underline transition-colors',
      'hover:bg-brand-tint-weak',
    ),
  },
  headerTitle: { className: 'flex-1 text-left' },
  headerIcon: { className: 'text-12 text-secondary' },
  content: { className: 'border-t border-line-subtle px-3 py-2' },
};

export const tabViewPt = {
  root: { className: 'flex flex-col' },
  navcontainer: { className: 'relative' },
  nav: { className: 'm-0 flex list-none gap-1 border-b border-line-subtle p-0' },
  navcontent: { className: 'overflow-x-auto' },
  inkbar: { className: 'hidden' },
  prevbutton: { className: CLOSE },
  nextbutton: { className: CLOSE },
  panelcontainer: { className: 'py-3' },
};

export const tabPanelPt = {
  header: { className: 'relative' },
  headerAction: {
    className: cx(
      'flex items-center gap-2 px-3 py-2 text-12 text-body no-underline transition-colors',
      'border-b-2 border-transparent hover:text-brand-text',
      '[[data-p-highlight=true]>&]:border-brand [[data-p-highlight=true]>&]:text-brand-text',
    ),
  },
  headerTitle: { className: 'leading-none' },
};

/* Splitter INJECTS ITS OWN LAYOUT CSS, and `unstyled` drops it — the same trap
   as Timeline (landmine 11), which this batch failed to check for.
   `.p-splitter { display:flex }`, `.p-splitter-vertical { flex-direction:
   column }`, `.p-splitter-panel { flex-grow: 1 }` and the per-orientation
   gutter rules all come from the component, not the theme. Without them every
   vertical splitter rendered as a row: the GraphQL playground put Query beside
   Variables instead of above it, and squeezed the Transformer Console into a
   sliver. */
export const splitterPt = {
  root: ({ props }) => ({
    className: cx(
      'flex flex-nowrap',
      props?.layout === 'vertical' ? 'flex-col' : 'flex-row',
      SURFACE,
      /* A nested splitter loses its border and fills its panel — lara's
         `.p-splitter-panel .p-splitter { flex-grow: 1; border: 0 none }`.
         Matched against an ANCESTOR SPLITTER rather than a marker on the
         panel: `data-pc-name` is on the splitter root and survives `unstyled`,
         whereas a `splitterpanel` registry entry does not resolve at all —
         PrimeReact tags the panel `data-pc-section="splitterpanel.root"` but
         does not look up a top-level `splitterpanel` key for it. */
      '[[data-pc-name=splitter]_&]:grow [[data-pc-name=splitter]_&]:rounded-none [[data-pc-name=splitter]_&]:border-0',
    ),
  }),
  gutter: ({ props }) => ({
    className: cx(
      'flex shrink-0 grow-0 items-center justify-center bg-sunken transition-colors hover:bg-brand-tint-weak',
      props?.layout === 'vertical' ? 'cursor-row-resize' : 'cursor-col-resize',
    ),
  }),
  /* Reads inverted but matches lara: on a HORIZONTAL splitter the gutter is a
     vertical bar, so its handle is 24px tall and fills the gutter's width. */
  gutterHandler: ({ props }) => ({
    className: cx(
      'rounded-full bg-line',
      props?.layout === 'vertical' ? 'h-full w-6' : 'w-full h-6',
    ),
  }),
};

/* NOT REGISTERED. PrimeReact writes the panel's `flex-basis` inline from the
   `size` prop, which survives `unstyled`, so the panels size correctly without
   a preset — and a `splitterpanel` registry key does not resolve anyway. Kept
   as a note so the next person does not re-derive it. */

export const treePt = {
  root: { className: cx(SURFACE, 'p-2') },
  container: { className: 'm-0 list-none p-0' },
  subgroup: { className: 'm-0 list-none py-0 pl-4' },
  node: { className: 'list-none' },
  content: {
    className: cx(
      'flex items-center gap-2 rounded-md px-2 py-1.5 text-12 text-body transition-colors',
      'hover:bg-brand-tint-weak',
      '[&[data-p-highlight=true]]:bg-info-wash [&[data-p-highlight=true]]:text-brand-text',
    ),
  },
  toggler: { className: 'inline-flex h-5 w-5 items-center justify-center rounded-sm text-secondary hover:text-brand-text' },
  togglerIcon: { className: 'text-10' },
  nodeIcon: { className: 'text-12 text-secondary' },
  label: { className: 'flex-1 truncate' },
  emptyMessage: { className: 'px-2 py-1.5 text-12 text-secondary' },
  header: { className: 'mb-2 border-b border-line-subtle pb-2' },
  footer: { className: 'mt-2 border-t border-line-subtle pt-2' },
  filterContainer: { className: 'relative' },
  input: { className: 'h-control w-full rounded-md border border-line-subtle bg-surface px-2 text-12' },
  searchIcon: { className: 'absolute right-2 top-1/2 -translate-y-1/2 text-12 text-muted' },
  loadingOverlay: { className: 'absolute inset-0 flex items-center justify-center bg-surface/70' },
  loadingIcon: { className: 'text-20 text-brand-text' },
};

export const dialogPt = {
  /* POSITIONING IS PART OF THE PRESET for the overlays. lara positions the
     mask and centres the dialog inside it, and `unstyled` removes that along
     with the colours — the first version had none, so the dialog rendered in
     normal flow, pushed the page around and covered the control below it.
     A missing layout rule, not a missing colour; see landmine 3.

     `--surface-overlay` has no `--color-*` alias in the Tailwind bridge, so
     `bg-overlay` would generate no rule. Bound to the token directly rather
     than adding a colour alias for a scrim nothing else uses. */
  /* The scrim and the click-blocking are conditional on `modal`. PrimeReact
     renders the mask element either way — it is the positioning wrapper, not
     just the dim — and lara only painted it when the dialog was modal, via a
     separate `p-component-overlay` class that `unstyled` removes. Painting it
     unconditionally put a full-screen invisible blocker over the page: every
     click outside the dialog silently did nothing. */
  mask: ({ props }) => ({
    className: cx(
      'fixed inset-0 z-1000 flex items-center justify-center',
      props?.modal
        ? 'bg-[var(--surface-overlay)]'
        : 'pointer-events-none',
    ),
  }),
  root: {
    className: cx(
      OVERLAY,
      'pointer-events-auto flex max-h-[90vh] flex-col',
      /* `maximizable` is used by SmartDataTable's fullscreen view and by
         DataTableNew. lara gave the maximized state
         `width: 100vw !important; height: 100vh !important; margin: 0`, so
         without this a "fullscreen" dialog stayed at its authored 70vw/90vh —
         the button worked and nothing looked obviously wrong, which is the
         worst kind of miss. */
      '[&[data-p-maximized=true]]:m-0 [&[data-p-maximized=true]]:h-screen! [&[data-p-maximized=true]]:w-screen!',
      '[&[data-p-maximized=true]]:max-h-screen [&[data-p-maximized=true]]:rounded-none',
    ),
  },
  header: { className: 'flex items-center justify-between gap-4 border-b border-line-subtle p-4' },
  headerTitle: { className: 'type-app-label text-heading' },
  headerIcons: { className: 'flex items-center gap-1' },
  closeButton: { className: CLOSE },
  closeButtonIcon: { className: 'text-12' },
  maximizableButton: { className: CLOSE },
  maximizableIcon: { className: 'text-12' },
  content: { className: 'flex-1 overflow-auto p-4' },
  footer: { className: 'border-t border-line-subtle p-4' },
};

/* EDGE COMES FROM `position`, and getting it wrong is not subtle.
   lara injects `.p-sidebar-left/-right/-top/-bottom` with the anchoring; the
   first version of this preset hardcoded `inset-y-0 right-0`, which is correct
   for exactly one of the four. The app uses `bottom` (the drawer in
   SmartDataProvider and DataProviderNew) and `left` (both FilterSortSidebars on
   desktop) — so the hardcoded edge was wrong for every real call site. */
const SIDEBAR_EDGE = {
  left: 'inset-y-0 left-0 h-full',
  right: 'inset-y-0 right-0 h-full',
  top: 'inset-x-0 top-0 w-full',
  bottom: 'inset-x-0 bottom-0 w-full',
};

export const sidebarPt = {
  mask: ({ props }) => ({
    className: cx(
      'fixed inset-0 z-1000 flex',
      props?.modal ? 'bg-[var(--surface-overlay)]' : 'pointer-events-none',
    ),
  }),
  root: ({ props }) => ({
    className: cx(
      'pointer-events-auto absolute flex flex-col bg-surface shadow-pop',
      SIDEBAR_EDGE[props?.position] ?? SIDEBAR_EDGE.right,
    ),
  }),
  header: { className: 'flex items-center justify-between gap-4 border-b border-line-subtle p-4' },
  icons: { className: 'flex items-center gap-1' },
  closeButton: { className: CLOSE },
  closeIcon: { className: 'text-12' },
  content: { className: 'flex-1 overflow-auto p-4' },
};

export const overlayPanelPt = {
  /* PrimeReact writes `top`/`left` inline from its positioning logic; the
     preset only has to make them apply. */
  root: { className: cx(OVERLAY, 'absolute') },
  content: { className: 'p-3' },
  closeButton: { className: CLOSE },
  closeIcon: { className: 'text-12' },
};

/* Toast is `position: fixed` in lara and PrimeReact does NOT write that
   inline, so without it every toast would render in normal flow wherever the
   component happens to sit in the tree. */
const TOAST_EDGE = {
  'top-left': 'top-4 left-4',
  'top-center': 'top-4 left-1/2 -translate-x-1/2',
  'top-right': 'top-4 right-4',
  'bottom-left': 'bottom-4 left-4',
  'bottom-center': 'bottom-4 left-1/2 -translate-x-1/2',
  'bottom-right': 'bottom-4 right-4',
  center: 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
};

export const toastPt = {
  root: ({ props }) => ({
    className: cx(
      'fixed z-1000 flex w-80 flex-col gap-2',
      TOAST_EDGE[props?.position] ?? TOAST_EDGE['top-right'],
    ),
  }),
};

export const confirmDialogPt = {
  message: { className: 'text-12 text-body' },
  icon: { className: 'text-20 text-warning' },
};

export const tooltipPt = {
  root: { className: 'z-1000' },
  text: { className: 'rounded-md bg-heading px-2 py-1 text-10 text-on-brand shadow-pop' },
  arrow: { className: 'border-transparent' },
};

export const iconFieldPt = { root: { className: 'relative inline-flex w-full items-center' } };
export const inputIconPt = {
  root: { className: 'absolute right-2 top-1/2 -translate-y-1/2 text-12 text-muted' },
};
