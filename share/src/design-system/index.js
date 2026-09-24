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
/* Sheet is an overlay, not a quantity — it portals to document.body and
   owns focus while it is open. See Sheet.jsx for why the portal is load-
   bearing rather than a z-index trick. */
export { Sheet } from './components/Sheet';
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
