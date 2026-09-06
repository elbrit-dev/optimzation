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
import { StatusPill } from './components/StatusPill';
import { Switch } from './components/Switch';
import { Tag } from './components/Tag';

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
      options: ['approved', 'pending', 'rejected', 'draft', 'info'],
      defaultValue: 'pending',
      description: 'Semantic and closed. For open labels use DS Tag.',
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

const REGISTRY = [
  [Button, buttonMeta],
  [Field, fieldMeta],
  [Switch, switchMeta],
  [StatusPill, statusPillMeta],
  [Tag, tagMeta],
  [SegmentedControl, segmentedControlMeta],
  [Card, cardMeta],
  [Icon, iconMeta],
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
