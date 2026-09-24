'use client';

/* Plasmic registration for the design-system primitives.

   Both repos drive their UI from Plasmic Studio, so the primitives have to be
   droppable on a canvas — otherwise Studio users compose raw divs with typed
   hex codes and drift re-enters at the design layer, which defeats the whole
   exercise.

   Call this from each app's plasmic-init alongside the existing
   registerElbritCoreComponents:

     import { registerDesignSystem } from './share/src/design-system/plasmic';
     registerDesignSystem(PLASMIC);

   Every prop here is a closed choice list wherever the underlying token set
   is closed. That is deliberate: a Studio user cannot invent a sixth button
   type or an off-scale size through the props panel. */

import { Button } from './components/Button';
import { Card } from './components/Card';
import { Field } from './components/Field';
import { Icon } from './components/Icon';
import { SegmentedControl } from './components/SegmentedControl';
import { Avatar } from './components/Avatar';
import { ChipRow } from './components/ChipRow';
import { DisclosureRow } from './components/DisclosureRow';
import { Eyebrow } from './components/Eyebrow';
import { LegendChip } from './components/LegendChip';
import { ListRow } from './components/ListRow';
import { Metric } from './components/Metric';
import { ProgressBar } from './components/ProgressBar';
import { SectionLabel } from './components/SectionLabel';
import { Sheet } from './components/Sheet';
import { Select } from './components/Select';
import { StackedBar } from './components/StackedBar';
import { StatusPill } from './components/StatusPill';
import { Tabs } from './components/Tabs';
import { Switch } from './components/Switch';
import { Tag } from './components/Tag';
import { TreeSelect } from './components/TreeSelect';
import { CountBadge } from './components/CountBadge';
import { ProgressRing } from './components/ProgressRing';
import { RingNav } from './components/RingNav';

const SECTION = 'Elbrit Design System';

const buttonMeta = {
  name: 'DsButton',
  displayName: 'DS Button',
  section: SECTION,
  importPath: './src/design-system/components/Button',
  importName: 'Button',
  defaultStyles: { width: 'hug' },
  props: {
    children: { type: 'slot', defaultValue: 'Submit' },
    type: {
      type: 'choice',
      options: ['primary', 'default', 'dashed', 'text', 'link'],
      defaultValue: 'primary',
      description: 'ghost and danger are separate flags, not types.',
    },
    size: {
      type: 'choice',
      options: ['sm', 'default', 'lg', 'app'],
      defaultValue: 'default',
      description:
        'sm 24px, default 32px, lg 40px for the console; app 22px for the field app.',
    },
    shape: { type: 'choice', options: ['default', 'round'], defaultValue: 'default' },
    icon: {
      type: 'slot',
      hidePlaceholder: true,
      description: 'Drop a DS Icon here. With no children the button becomes icon-only.',
    },
    iconPosition: { type: 'choice', options: ['start', 'end'], defaultValue: 'start' },
    ghost: { type: 'boolean', defaultValue: false },
    danger: {
      type: 'boolean',
      defaultValue: false,
      description: 'Destructive intent. One of the three places red is allowed.',
    },
    block: { type: 'boolean', defaultValue: false },
    loading: { type: 'boolean', defaultValue: false },
    disabled: { type: 'boolean', defaultValue: false },
    href: { type: 'string', description: 'Renders an anchor instead of a button.' },
    onClick: { type: 'eventHandler', argTypes: [] },
  },
};

const fieldMeta = {
  name: 'DsField',
  displayName: 'DS Field',
  section: SECTION,
  importPath: './src/design-system/components/Field',
  importName: 'Field',
  props: {
    label: { type: 'string', defaultValue: 'Label' },
    placeholder: {
      type: 'string',
      defaultValue: 'Search...',
      description: 'A phrase plus an ellipsis. Never "Enter a value".',
    },
    value: { type: 'string' },
    size: { type: 'choice', options: ['sm', 'default', 'lg', 'app'], defaultValue: 'default' },
    prefix: { type: 'slot', hidePlaceholder: true },
    suffix: { type: 'slot', hidePlaceholder: true },
    hint: { type: 'string' },
    error: { type: 'string', description: 'Setting this also marks the field invalid.' },
    disabled: { type: 'boolean', defaultValue: false },
    block: { type: 'boolean', defaultValue: true },
    onChange: {
      type: 'eventHandler',
      argTypes: [{ name: 'value', type: 'string' }],
    },
  },
  states: {
    value: {
      type: 'writable',
      variableType: 'text',
      valueProp: 'value',
      onChangeProp: 'onChange',
    },
  },
};

const switchMeta = {
  name: 'DsSwitch',
  displayName: 'DS Switch',
  section: SECTION,
  importPath: './src/design-system/components/Switch',
  importName: 'Switch',
  props: {
    checked: { type: 'boolean' },
    defaultChecked: { type: 'boolean', defaultValue: false },
    size: { type: 'choice', options: ['default', 'lg'], defaultValue: 'default' },
    disabled: { type: 'boolean', defaultValue: false },
    label: { type: 'string', description: 'Accessible name. Required when unlabelled.' },
    onChange: {
      type: 'eventHandler',
      argTypes: [{ name: 'checked', type: 'boolean' }],
    },
  },
  states: {
    checked: {
      type: 'writable',
      variableType: 'boolean',
      valueProp: 'checked',
      onChangeProp: 'onChange',
    },
  },
};

const statusPillMeta = {
  name: 'DsStatusPill',
  displayName: 'DS Status Pill',
  section: SECTION,
  importPath: './src/design-system/components/StatusPill',
  importName: 'StatusPill',
  defaultStyles: { width: 'hug' },
  props: {
    status: {
      type: 'choice',
      options: ['approved', 'pending', 'rejected', 'draft', 'info',
        'success', 'warning', 'danger', 'neutral', 'brand'],
      defaultValue: 'pending',
      description:
        'Semantic and closed. For open labels use DS Tag. The last five are the '
        + 'outcome names the bar and metric primitives use; they resolve to the '
        + 'same tokens.',
    },
    children: { type: 'slot', defaultValue: 'Pending' },
    showDot: { type: 'boolean', defaultValue: true },
  },
};

const tagMeta = {
  name: 'DsTag',
  displayName: 'DS Tag',
  section: SECTION,
  importPath: './src/design-system/components/Tag',
  importName: 'Tag',
  defaultStyles: { width: 'hug' },
  props: {
    children: { type: 'slot', defaultValue: 'Label' },
    tone: {
      type: 'choice',
      options: ['neutral', 'blue', 'magenta', 'violet', 'plum', 'cyan', 'amber'],
      defaultValue: 'neutral',
      description: 'Categorical only. Never use a tone to mean success or failure.',
    },
    variant: { type: 'choice', options: ['tint', 'outline'], defaultValue: 'tint' },
    icon: { type: 'slot', hidePlaceholder: true },
  },
};

const segmentedControlMeta = {
  name: 'DsSegmentedControl',
  displayName: 'DS Segmented Control',
  section: SECTION,
  importPath: './src/design-system/components/SegmentedControl',
  importName: 'SegmentedControl',
  defaultStyles: { width: 'hug' },
  props: {
    items: {
      type: 'object',
      defaultValue: [
        { id: 'cards', label: 'Cards', icon: 'pi pi-th-large' },
        { id: 'table', label: 'Table', icon: 'pi pi-table' },
      ],
      description:
        'Either ["Cards","Table"] or [{ id, label, icon, disabled }]. icon is a PrimeIcons class.',
    },
    value: { type: 'string' },
    defaultValue: { type: 'string' },
    shape: { type: 'choice', options: ['default', 'pill'], defaultValue: 'default' },
    ariaLabel: { type: 'string', defaultValue: 'View' },
    onChange: {
      type: 'eventHandler',
      argTypes: [{ name: 'id', type: 'string' }],
    },
  },
  states: {
    value: {
      type: 'writable',
      variableType: 'text',
      valueProp: 'value',
      onChangeProp: 'onChange',
    },
  },
};

const cardMeta = {
  name: 'DsCard',
  displayName: 'DS Card',
  section: SECTION,
  importPath: './src/design-system/components/Card',
  importName: 'Card',
  props: {
    children: { type: 'slot' },
    variant: {
      type: 'choice',
      options: ['shadow', 'hairline'],
      defaultValue: 'shadow',
      description: 'Shadow or hairline — never both.',
    },
    padding: { type: 'choice', options: ['none', 'app', 'console'], defaultValue: 'app' },
    title: { type: 'string' },
    actions: { type: 'slot', hidePlaceholder: true },
    onClick: { type: 'eventHandler', argTypes: [] },
    selected: {
      type: 'boolean',
      description:
        'Turns an interactive card into a CHOICE — brand ring, wash and '
        + 'aria-pressed. Requires onClick; ignored without it.',
    },
  },
};

const iconMeta = {
  name: 'DsIcon',
  displayName: 'DS Icon',
  section: SECTION,
  importPath: './src/design-system/components/Icon',
  importName: 'Icon',
  defaultStyles: { width: 'hug' },
  props: {
    name: {
      type: 'string',
      defaultValue: 'search',
      description: 'PrimeIcons name, with or without the "pi pi-" prefix.',
    },
    size: {
      type: 'choice',
      options: ['sm', 'md', 'lg', 'xl'],
      defaultValue: 'md',
      description: '14 / 16 / 18 / 24px. Inherits currentColor.',
    },
    label: { type: 'string', description: 'Accessible name. Omit for decorative icons.' },
  },
};

/* ---- Quantitative and list primitives ----------------------------------
   Added with the Visit KPI screen. None of them knows anything about visits;
   they are the generic shapes that screen turned out to need. */

const TONE_CHOICE = {
  type: 'choice',
  options: ['brand', 'success', 'warning', 'danger', 'neutral'],
  defaultValue: 'neutral',
  description: 'Meaning, not decoration. See design-system/lib/tone.js.',
};

const avatarMeta = {
  name: 'DsAvatar',
  displayName: 'DS Avatar',
  section: SECTION,
  importPath: './src/design-system/components/Avatar',
  importName: 'Avatar',
  defaultStyles: { width: 'hug' },
  props: {
    name: { type: 'string', defaultValue: 'Santosh Kumar' },
    src: { type: 'imageUrl', description: 'Falls back to initials when absent.' },
    size: { type: 'choice', options: ['sm', 'md', 'lg'], defaultValue: 'md' },
    color: {
      type: 'string',
      description: 'Overrides the colour derived from the name. Use a token, not a hex.',
    },
  },
};

const metricMeta = {
  name: 'DsMetric',
  displayName: 'DS Metric',
  section: SECTION,
  importPath: './src/design-system/components/Metric',
  importName: 'Metric',
  props: {
    label: { type: 'string', defaultValue: 'Visits happened' },
    value: { type: 'string', defaultValue: '199' },
    caption: { type: 'string', defaultValue: '71% of plan' },
    tone: TONE_CHOICE,
    dot: { type: 'boolean', defaultValue: false },
    progress: {
      type: 'object',
      description: 'An ornament: { value, max }. The caption carries the meaning.',
    },
  },
};

const progressBarMeta = {
  name: 'DsProgressBar',
  displayName: 'DS Progress Bar',
  section: SECTION,
  importPath: './src/design-system/components/ProgressBar',
  importName: 'ProgressBar',
  props: {
    value: { type: 'number', defaultValue: 60 },
    max: { type: 'number', defaultValue: 100 },
    tone: { ...TONE_CHOICE, defaultValue: 'brand' },
    size: { type: 'choice', options: ['sm', 'md', 'lg'], defaultValue: 'md' },
    showTrack: { type: 'boolean', defaultValue: true },
    label: { type: 'string', description: 'Accessible name.' },
  },
};

const stackedBarMeta = {
  name: 'DsStackedBar',
  displayName: 'DS Stacked Bar',
  section: SECTION,
  importPath: './src/design-system/components/StackedBar',
  importName: 'StackedBar',
  props: {
    segments: {
      type: 'object',
      defaultValue: [
        { key: 'working', value: 20, tone: 'success', label: 'Working' },
        { key: 'absent', value: 2, tone: 'danger', label: 'Not reporting' },
      ],
      description:
        'Percentages are of the segment TOTAL. For a partly-filled track add a '
        + 'trailing neutral segment for the remainder.',
    },
    size: { type: 'choice', options: ['sm', 'md', 'lg'], defaultValue: 'lg' },
    label: { type: 'string', description: 'Accessible name.' },
  },
};

const legendChipMeta = {
  name: 'DsLegendChip',
  displayName: 'DS Legend Chip',
  section: SECTION,
  importPath: './src/design-system/components/LegendChip',
  importName: 'LegendChip',
  defaultStyles: { width: 'hug' },
  props: {
    label: { type: 'string', defaultValue: 'Working' },
    value: { type: 'string', defaultValue: '20' },
    tone: TONE_CHOICE,
    showChevron: { type: 'boolean', description: 'Defaults to true when onClick is set.' },
    onClick: { type: 'eventHandler', argTypes: [] },
  },
};

const chipRowMeta = {
  name: 'DsChipRow',
  displayName: 'DS Chip Row',
  section: SECTION,
  importPath: './src/design-system/components/ChipRow',
  importName: 'ChipRow',
  props: {
    items: {
      type: 'object',
      defaultValue: [
        { key: 'hubballi', label: 'Hubballi', count: 136 },
        { key: 'hyderabad', label: 'Hyderabad', count: 63 },
      ],
      description: 'Open, data-driven list. For a fixed small set use DS Segmented Control.',
    },
    value: { type: 'string' },
    ariaLabel: { type: 'string', defaultValue: 'Filter' },
    onChange: { type: 'eventHandler', argTypes: [{ name: 'key', type: 'string' }] },
  },
};

const listRowMeta = {
  name: 'DsListRow',
  displayName: 'DS List Row',
  section: SECTION,
  importPath: './src/design-system/components/ListRow',
  importName: 'ListRow',
  props: {
    title: { type: 'string', defaultValue: 'Hubballi' },
    subtitle: { type: 'string', defaultValue: '14/15 reps active' },
    trailing: { type: 'slot', hidePlaceholder: true },
    dense: { type: 'boolean', defaultValue: false },
    divider: { type: 'boolean', defaultValue: true },
    onClick: { type: 'eventHandler', argTypes: [] },
  },
};

const disclosureRowMeta = {
  name: 'DsDisclosureRow',
  displayName: 'DS Disclosure Row',
  section: SECTION,
  importPath: './src/design-system/components/DisclosureRow',
  importName: 'DisclosureRow',
  props: {
    header: { type: 'slot', defaultValue: 'Bishnu Charan Behera' },
    action: {
      type: 'slot',
      hidePlaceholder: true,
      description:
        'A control beside the header, outside its press target. A button belongs HERE and never in header: an expandable header is itself a button.',
    },
    children: { type: 'slot', hidePlaceholder: true },
    expanded: {
      type: 'boolean',
      defaultValue: false,
      description: 'Controlled only, so the tree can reset open state when scope changes.',
    },
    depth: { type: 'number', defaultValue: 0 },
    expandable: { type: 'boolean', description: 'Defaults to whether children are present.' },
    onToggle: { type: 'eventHandler', argTypes: [] },
  },
};

const tabsMeta = {
  name: 'DsTabs',
  displayName: 'DS Tabs',
  section: SECTION,
  importPath: './src/design-system/components/Tabs',
  importName: 'Tabs',
  props: {
    items: {
      type: 'object',
      defaultValue: [
        { id: 'today', label: 'Today' },
        { id: 'mtd', label: 'Month till date' },
      ],
      description: 'Array of { id, label, count, disabled }.',
    },
    value: { type: 'string', defaultValue: 'today' },
    ariaLabel: { type: 'string', defaultValue: 'View' },
    onChange: { type: 'eventHandler', argTypes: [{ name: 'id', type: 'string' }] },
  },
};

const selectMeta = {
  name: 'DsSelect',
  displayName: 'DS Select',
  section: SECTION,
  importPath: './src/design-system/components/Select',
  importName: 'Select',
  props: {
    label: { type: 'string', defaultValue: 'Team scope' },
    hideLabel: { type: 'boolean', defaultValue: false },
    options: {
      type: 'object',
      defaultValue: [
        { value: 'e1', label: 'Santosh Kumar - SM' },
        { value: 'e2', label: 'Bishnu Charan Behera - RBM' },
      ],
      description: 'Array of strings, or of { value, label, disabled }.',
    },
    value: { type: 'string' },
    defaultValue: { type: 'string' },
    placeholder: { type: 'string' },
    size: {
      type: 'choice',
      options: ['sm', 'default', 'lg', 'app'],
      defaultValue: 'lg',
      description: 'Defaults to lg: 22px fails the 44px tap target for a primary choice.',
    },
    disabled: { type: 'boolean', defaultValue: false },
    invalid: { type: 'boolean', defaultValue: false },
    hint: { type: 'string' },
    error: { type: 'string' },
    onChange: { type: 'eventHandler', argTypes: [{ name: 'value', type: 'string' }] },
  },
};

const treeSelectMeta = {
  name: 'DsTreeSelect',
  displayName: 'DS Tree Select',
  section: SECTION,
  importPath: './src/design-system/components/TreeSelect',
  importName: 'TreeSelect',
  props: {
    label: { type: 'string', defaultValue: 'Team scope' },
    hideLabel: { type: 'boolean', defaultValue: false },
    tree: {
      type: 'object',
      defaultValue: [
        {
          id: 'e1',
          label: 'Santosh Kumar · SM',
          children: [{ id: 'e2', label: 'Bishnu Charan Behera · RBM' }],
        },
      ],
      description: 'Nested nodes: array of { id, label, children? }, any depth.',
    },
    value: { type: 'string' },
    placeholder: { type: 'string', defaultValue: 'Select…' },
    size: {
      type: 'choice',
      options: ['sm', 'default', 'lg', 'app'],
      defaultValue: 'lg',
      description: 'Defaults to lg: 22px fails the 44px tap target for a primary choice.',
    },
    disabled: { type: 'boolean', defaultValue: false },
    onChange: { type: 'eventHandler', argTypes: [{ name: 'value', type: 'string' }] },
  },
  states: {
    value: {
      type: 'writable',
      variableType: 'text',
      valueProp: 'value',
      onChangeProp: 'onChange',
    },
  },
};

const eyebrowMeta = {
  name: 'DsEyebrow',
  displayName: 'DS Eyebrow',
  section: SECTION,
  importPath: './src/design-system/components/Eyebrow',
  importName: 'Eyebrow',
  defaultStyles: { width: 'hug' },
  props: {
    children: { type: 'slot', defaultValue: 'Visit plans today' },
  },
};

const sectionLabelMeta = {
  name: 'DsSectionLabel',
  displayName: 'DS Section Label',
  section: SECTION,
  importPath: './src/design-system/components/SectionLabel',
  importName: 'SectionLabel',
  defaultStyles: { width: 'hug' },
  props: {
    children: { type: 'slot', defaultValue: 'Where the visits happened' },
  },
};

const sheetMeta = {
  name: 'DsSheet',
  displayName: 'DS Sheet',
  section: SECTION,
  importPath: './src/design-system/components/Sheet',
  importName: 'Sheet',
  props: {
    open: { type: 'boolean', defaultValue: true },
    title: { type: 'string', defaultValue: 'Working today' },
    subtitle: { type: 'string', defaultValue: '20 people in this scope' },
    surface: {
      type: 'choice',
      options: ['app', 'console'],
      description:
        'The sheet portals to document.body, outside the wrapper that carries data-surface. Pass what that wrapper has, or it renders at the other density.',
    },
    children: { type: 'slot', hidePlaceholder: true },
    onClose: { type: 'eventHandler', argTypes: [] },
  },
};

/* ---- The task strip ----------------------------------------------------
   RingNav is the bare strip of links, rendering plain anchors. In a Next app
   use "Elbrit Ring Nav" from ElbritCoreLib, which routes through next/link. */

const progressRingMeta = {
  name: 'DsProgressRing',
  displayName: 'DS Progress Ring',
  section: SECTION,
  importPath: './src/design-system/components/ProgressRing',
  importName: 'ProgressRing',
  defaultStyles: { width: 'hug' },
  props: {
    segments: {
      type: 'object',
      defaultValue: [
        { key: 'done', value: 6, tone: 'success', label: 'Done' },
        { key: 'owed', value: 14, tone: 'danger', label: 'Pending' },
      ],
      description:
        'Same contract as DS Stacked Bar: [{ key, value, tone, label }]. Shares of the TOTAL; '
        + 'a zero segment draws nothing. Pass the remainder as its own segment.',
    },
    label: { type: 'string', description: 'Accessible name. Defaults to the segment list.' },
    children: { type: 'slot', hidePlaceholder: true, description: 'Centred inside the ring.' },
  },
};

const countBadgeMeta = {
  name: 'DsCountBadge',
  displayName: 'DS Count Badge',
  section: SECTION,
  importPath: './src/design-system/components/CountBadge',
  importName: 'CountBadge',
  defaultStyles: { width: 'hug' },
  props: {
    value: { type: 'number', defaultValue: 14, description: 'Renders nothing at 0.' },
    max: { type: 'number', defaultValue: 99, description: 'Above this it reads "99+".' },
    tone: {
      type: 'choice',
      options: ['danger', 'brand'],
      defaultValue: 'danger',
      description: 'danger = overdue or owed; brand = new but not late.',
    },
    label: { type: 'string', description: 'Accessible name, e.g. "14 pending".' },
  },
};

const ringNavMeta = {
  name: 'DsRingNav',
  displayName: 'DS Ring Nav',
  section: SECTION,
  importPath: './src/design-system/components/RingNav',
  importName: 'RingNav',
  /* Stretch, never hug: the strip is a size container and sizes its rings
     from its own width, so it cannot take its width from them. */
  defaultStyles: { width: 'stretch' },
  props: {
    items: {
      type: 'object',
      description:
        'Array of { id, label, href, target, icon, caption, captionTone, iconTone, segments, count, '
        + 'countTone, statusIcon, statusTone, ariaLabel, disabled }. A tile with no href is shown '
        + 'but not pressable. icon / statusIcon are PrimeIcons names. Tones: brand, success, '
        + 'warning, danger, neutral. No sample data: renders nothing until items is set. Plain '
        + 'anchors: for client-side routing use Elbrit Ring Nav.',
    },
    ariaLabel: { type: 'string', defaultValue: 'Shortcuts' },
    onItemClick: {
      type: 'eventHandler',
      argTypes: [
        { name: 'id', type: 'string' },
        { name: 'href', type: 'string' },
      ],
    },
  },
};

const REGISTRY = [
  [Button, buttonMeta],
  [Field, fieldMeta],
  [Switch, switchMeta],
  [StatusPill, statusPillMeta],
  [Tag, tagMeta],
  [SegmentedControl, segmentedControlMeta],
  [Card, cardMeta],
  [Icon, iconMeta],
  [Tabs, tabsMeta],
  [Select, selectMeta],
  [TreeSelect, treeSelectMeta],
  [Avatar, avatarMeta],
  [Metric, metricMeta],
  [ProgressBar, progressBarMeta],
  [StackedBar, stackedBarMeta],
  [LegendChip, legendChipMeta],
  [ChipRow, chipRowMeta],
  [ListRow, listRowMeta],
  [DisclosureRow, disclosureRowMeta],
  [Eyebrow, eyebrowMeta],
  [SectionLabel, sectionLabelMeta],
  [Sheet, sheetMeta],
  [ProgressRing, progressRingMeta],
  [CountBadge, countBadgeMeta],
  [RingNav, ringNavMeta],
];

/**
 * Register every design-system primitive on a Plasmic loader.
 *
 * `registerElbritCoreComponents` already calls this, and both apps call that,
 * so you do not normally invoke it yourself. It stays exported for a consumer
 * that wants the primitives WITHOUT the core data components and their
 * dependency tree (PrimeReact, xlsx, jmespath) — a docs site or Storybook.
 * Call one or the other, never both: re-registering a name warns in Studio.
 *
 * @param {import('@plasmicapp/loader-nextjs').PlasmicComponentLoader} loader
 */
export function registerDesignSystem(loader) {
  REGISTRY.forEach(([component, meta]) => {
    loader.registerComponent(component, meta);
  });
}

export { REGISTRY as designSystemRegistry };
