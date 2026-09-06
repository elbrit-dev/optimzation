/* Elbrit Design System — public entry point.
   Import primitives from here, never from a component file directly:

     import { Button, StatusPill } from '@/design-system';

   CSS is imported separately, once per app, from the app root. See README. */

export { Button } from './components/Button';
export { Card } from './components/Card';
export { Field } from './components/Field';
export { Icon } from './components/Icon';
export { SegmentedControl } from './components/SegmentedControl';
export { StatusPill } from './components/StatusPill';
export { Switch } from './components/Switch';
export { Tag } from './components/Tag';

export { cx } from './lib/cx';
export { registerDesignSystem } from './plasmic';
