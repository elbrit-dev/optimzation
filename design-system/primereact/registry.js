/* The global PassThrough registry — one place where every migrated PrimeReact
 * component's styling is declared.
 *
 * PrimeReactProvider takes a `pt` keyed by component name and applies it to
 * every instance of that component in the tree. That is what makes a sweep
 * tractable: without it, moving ~30 components off the lara theme would mean
 * touching each of ~250 render sites to pass a preset.
 *
 * ADDING A COMPONENT
 *   1. Write `<name>Preset.js` next to this file.
 *   2. Add it below, keyed by PrimeReact's own lowercase component name (the
 *      value of `data-pc-name` in the DOM — check there rather than guessing).
 *   3. Set `unstyled` for it. Until the whole sweep lands that is done per
 *      component, via the wrappers in `./components.jsx`.
 *   4. Delete its rules from globals.css and its `p-*` call sites.
 *   5. Tick it off in docs/PRIMEREACT_SWEEP.md.
 *
 * WHY `datatable` IS NOT HERE
 * Its preset has a per-instance variant — `size="small"` needs different cell
 * padding, and PrimeReact does not pass `size` down to the nested `column.*`
 * sections, so it has to be resolved by the caller. A provider-level `pt`
 * cannot vary per instance. DataTable therefore keeps its own entry point
 * (`dataTableProps.js`), and putting it here as well would apply two pt objects
 * to the same component for no gain. Any component that grows a per-instance
 * variant belongs at an entry point rather than in this registry.
 */
import { paginatorPt } from './paginatorPreset';
import { menubarPt } from './menubarPreset';
import { checkboxPt } from './checkboxPreset';
import { timelinePt } from './timelinePreset';
import { dropdownPt } from './dropdownPreset';
import { inputTextPt } from './inputTextPreset';
import { inputNumberPt } from './inputNumberPreset';
import { calendarPt } from './calendarPreset';
import { buttonPt } from './buttonPreset';
import {
  dividerPt, skeletonPt, tagPt, chipPt, cardPt, selectButtonPt, splitButtonPt,
  tabMenuPt, accordionPt, accordionTabPt, tabViewPt, tabPanelPt, splitterPt,
  treePt, dialogPt, sidebarPt, overlayPanelPt, toastPt, confirmDialogPt,
  tooltipPt, iconFieldPt, inputIconPt,
} from './primitivePresets';

/* THE RULE: a component enters this registry only once EVERY ONE of its call
   sites renders `unstyled`. Provider-level `pt` applies to every instance, so
   registering a component that is still lara-themed layers design-system
   classes ON TOP of the theme rather than replacing it. `inputTextPt` was in
   here for exactly one build and would have done that to all 24 InputText
   instances — `w-full` alone would have resized inputs across the app.

   That makes each component an atomic unit of work: preset + every call site +
   registry entry land together, or not at all.

   `inputtext` was the worked example: it sat here for one build before its
   call sites were ready. It is registered now, together with `calendar` and
   `inputnumber` — see the cluster note below. */
export const dsPassThrough = {
  /* Paginator has exactly two call sites and both are unstyled: the one
     DataTable renders as a child (which inherits `unstyled` from it) and the
     standalone one in DataTableNew.jsx. */
  paginator: paginatorPt,

  /* One render site — the app header — but it appears on all 13 routes, so
     this is the widest-reaching entry in the registry. */
  menubar: menubarPt,

  /* Reaches BOTH the five standalone call sites and the selection controls a
     DataTable renders internally — those are Checkbox components too, which is
     why dataTablePreset no longer styles them itself. */
  checkbox: checkboxPt,

  /* One call site (EventTimeline). Note this preset carries LAYOUT, not just
     colour — Timeline injects its own layout CSS and `unstyled` drops it. */
  timeline: timelinePt,

  /* Nine standalone call sites plus the rows-per-page control every Paginator
     renders. */
  dropdown: dropdownPt,

  /* THE INPUT CLUSTER — these three must be registered together.
     Calendar and InputNumber each render an InputText internally, and we cannot
     pass `unstyled` to an instance we do not construct. Registering `inputtext`
     while either of the others was still themed would layer design-system
     classes ON TOP of lara. Their internal InputText inherits `unstyled` from
     its parent, so all three come off the theme at once. */
  inputtext: inputTextPt,
  inputnumber: inputNumberPt,
  calendar: calendarPt,

  /* The tail — see primitivePresets.js. Keys are PrimeReact's own lowercase
     component names, which is what `data-pc-name` reports; note `accordiontab`
     and `tabpanel` are separate components from their containers. */
  /* Button, and the two components that were blocked on it. SplitButton and
     ConfirmDialog render Buttons internally and `unstyled` propagates to
     children, so registering them before Button existed stripped those buttons
     to bare browser defaults — SplitButton rendered as naked text with a
     chevron. All three land together. */
  button: buttonPt,
  splitbutton: splitButtonPt,
  confirmdialog: confirmDialogPt,

  divider: dividerPt,
  skeleton: skeletonPt,
  tag: tagPt,
  chip: chipPt,
  card: cardPt,
  selectbutton: selectButtonPt,
  tabmenu: tabMenuPt,
  accordion: accordionPt,
  accordiontab: accordionTabPt,
  tabview: tabViewPt,
  tabpanel: tabPanelPt,
  splitter: splitterPt,
  tree: treePt,
  dialog: dialogPt,
  sidebar: sidebarPt,
  overlaypanel: overlayPanelPt,
  toast: toastPt,
  tooltip: tooltipPt,
  iconfield: iconFieldPt,
  inputicon: inputIconPt,
};

/* The value handed to PrimeReactProvider.
 *
 * `unstyled` stays FALSE here on purpose. Flipping it globally is the last step
 * of the sweep, not the first: it would strip every unmigrated component at
 * once, and the components without presets yet would render as unstyled HTML.
 * Until then each migrated component opts in individually.
 *
 * `mergeSections` keeps this registry as the base and lets a call site's own
 * `pt` add to it rather than replace it wholesale — otherwise passing `pt` for
 * one section at a call site would silently drop every other section.
 */
export const dsPrimeReactValue = {
  unstyled: false,
  pt: dsPassThrough,
  ptOptions: { mergeSections: true, mergeProps: true },
};

export default dsPassThrough;
