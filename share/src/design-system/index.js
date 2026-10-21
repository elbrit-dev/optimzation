/* Elbrit Design System — public entry point.
   Import primitives from here, never from a component file directly:

     import { Button, StatusPill } from '@/design-system';

   CSS is imported separately, once per app, from the app root. See README. */

export { Button } from './components/Button';
export { Card } from './components/Card';
export { Field } from './components/Field';
export { Icon } from './components/Icon';
export { SegmentedControl } from './components/SegmentedControl';
export { Select } from './components/Select';
export { StatusPill } from './components/StatusPill';
export { Switch } from './components/Switch';
export { TreeSelect } from './components/TreeSelect';
/* Tabs vs SegmentedControl: Tabs change WHAT you are looking at and span the
   page; SegmentedControl changes HOW the same data is rendered and sits in a
   toolbar. Tabs.jsx has the long version. */
export { Tabs } from './components/Tabs';
export { Tag } from './components/Tag';

/* Quantitative + list primitives. Added for the Team Report screen, but
   nothing in them knows about visits — keep it that way. */
export { Avatar, initialsOf } from './components/Avatar';
export { ChipRow } from './components/ChipRow';
export { DisclosureRow } from './components/DisclosureRow';
export { Eyebrow } from './components/Eyebrow';
export { LegendChip } from './components/LegendChip';
export { ListRow } from './components/ListRow';
export { Metric } from './components/Metric';
export { ProgressBar } from './components/ProgressBar';
export { SectionLabel } from './components/SectionLabel';
/* Overlays. Drawer (edge, gestures) and Dialog (centred) are the BASE layer —
   Base UI's parts, token-styled, with the back button wired in; nothing else
   in either app imports '@base-ui/*'. Sheet is COMPOSED from them:
   <Sheet.Root>, <Sheet.Popup>, <Sheet.Header>, <Sheet.Body>… Reach for Sheet
   first; assemble base parts only for a shape Sheet's parts cannot make. */
export { Dialog } from './base/Dialog';
export { Drawer } from './base/Drawer';
export { Popover } from './base/Popover';
export { Sheet } from './components/Sheet';
export { confirm } from './components/Confirm';
export { useRetained } from './lib/useRetained';
export { StackedBar } from './components/StackedBar';

/* The field app's task strip, and the two pieces it is built from. The ring
   and the badge stand alone; RingNav is a strip of links to work items, not
   tabs — see its header for when to reach for which. */
export { CountBadge } from './components/CountBadge';
export { ProgressRing } from './components/ProgressRing';
export { RingNav } from './components/RingNav';

export { cx } from './lib/cx';
export { TONES, toneFill, toneText } from './lib/tone';
export { registerDesignSystem } from './plasmic';
