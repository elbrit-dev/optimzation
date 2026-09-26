'use client';

import { SegmentedControl } from '@/design-system';

const DEFAULT_VIEWS = [
  { id: 'cards', label: 'Cards', icon: 'pi pi-th-large' },
  { id: 'table', label: 'Table', icon: 'pi pi-bars' },
];

/**
 * ViewSwitcher — thin wrapper over the design system's SegmentedControl, kept
 * because it is registered in Plasmic under this name and Studio pages bind to
 * its props. All behaviour now lives in SegmentedControl, which was written
 * API-compatible with this component for exactly this handover: it accepts
 * `['Cards','Table']` or `[{ id, label, icon }]`, is controlled via `value` or
 * uncontrolled via `defaultValue`, and emits the initial value on mount so a
 * Plasmic $state binding is never undefined.
 *
 * `height` is still honoured for Studio pages that set it, but it no longer
 * DEFAULTS to 1.75rem/28px — that value is not on the control scale
 * (22/24/32/40). Left unset, the control now follows --control-h-default and
 * therefore the surrounding [data-surface] density.
 */
export function ViewSwitcher({ views, value, defaultValue, onChange, height, className }) {
  return (
    <SegmentedControl
      items={views ?? DEFAULT_VIEWS}
      value={value}
      defaultValue={defaultValue}
      onChange={onChange}
      className={className}
      style={height ? { height } : undefined}
    />
  );
}
