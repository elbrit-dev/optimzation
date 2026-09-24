'use client';

import { forwardRef, useState } from 'react';
import { cx } from '../lib/cx';

/* Switch — replaces the antd `Switch` currently imported in both apps for
   this one control. Controlled via `checked` + `onChange`, or uncontrolled
   via `defaultChecked`. */

export const Switch = forwardRef(function Switch(
  {
    checked,
    defaultChecked = false,
    onChange,
    size = 'default',
    disabled = false,
    label,
    id,
    className,
    style,
    ...rest
  },
  ref,
) {
  const isControlled = checked != null;
  const [internal, setInternal] = useState(defaultChecked);
  const isOn = isControlled ? Boolean(checked) : internal;

  function toggle() {
    if (disabled) return;
    const next = !isOn;
    if (!isControlled) setInternal(next);
    onChange?.(next);
  }

  return (
    <button
      ref={ref}
      id={id}
      type="button"
      role="switch"
      aria-checked={isOn}
      aria-label={label}
      disabled={disabled}
      onClick={toggle}
      className={cx('ds-switch', size === 'lg' && 'ds-switch--lg', className)}
      style={style}
      {...rest}
    >
      <span className="ds-switch__knob" />
    </button>
  );
});
