'use client';

import { forwardRef, useId } from 'react';
import { cx } from '../lib/cx';

/* Select — a single choice from a list.
 *
 * A NATIVE <select> under the hood, deliberately. On a phone it opens the
 * platform picker: scrollable, type-ahead, dismissable, screen-reader correct
 * and keyboard correct, none of which a div-based dropdown gets for free. The
 * system has no design opinion that a custom listbox would buy back.
 *
 * It shares Field's box — `--ds-shadow-field` supplies both the hairline and
 * the focus ring, so there is no border here either. What it cannot share is
 * Field's component: Field wraps an <input> and its inline prefix/suffix slots
 * have no meaning on a native select, whose chevron is drawn by the platform.
 *
 * Sizes follow the control scale, but `size` defaults to `lg` rather than to
 * the surrounding density. A select is a primary choice — on the app surface
 * `--control-h-app` is 22px, which is half of --tap-target-min. Pass an
 * explicit size for a select that genuinely sits in a dense toolbar.
 *
 * onChange emits (value, event) — value first, matching Field, so a Plasmic
 * writable state can bind straight to `value`.
 */

const SIZE_CLASS = {
  sm: 'ds-field-box--sm',
  default: 'ds-field-box--default',
  lg: 'ds-field-box--lg',
  app: 'ds-field-box--app',
};

export const Select = forwardRef(function Select(
  {
    label,
    hideLabel = false,
    size = 'lg',
    options = [],
    value,
    defaultValue,
    onChange,
    placeholder,
    disabled = false,
    invalid = false,
    hint,
    error,
    block = true,
    id,
    className,
    style,
    ...rest
  },
  ref,
) {
  const autoId = useId();
  const selectId = id ?? autoId;
  const isInvalid = invalid || error != null;
  const describedBy = error != null || hint != null ? `${selectId}-hint` : undefined;

  return (
    <div className={cx('ds-field-wrap', block && 'ds-field-wrap--block', className)} style={style}>
      {label ? (
        <label className={cx('ds-field-label', hideLabel && 'ds-visually-hidden')} htmlFor={selectId}>
          {label}
        </label>
      ) : null}

      <div
        className={cx(
          'ds-field-box',
          SIZE_CLASS[size] ?? SIZE_CLASS.lg,
          isInvalid && 'ds-field-box--invalid',
          disabled && 'ds-field-box--disabled',
        )}
      >
        <select
          ref={ref}
          id={selectId}
          className="ds-select"
          value={value}
          defaultValue={defaultValue}
          disabled={disabled}
          aria-invalid={isInvalid || undefined}
          aria-describedby={describedBy}
          onChange={(event) => onChange?.(event.target.value, event)}
          {...rest}
        >
          {/* Disabled, so it can be shown but never chosen back into. A
              placeholder that is selectable is a value the form has to
              validate against. */}
          {placeholder ? (
            <option value="" disabled>
              {placeholder}
            </option>
          ) : null}
          {options.map((opt) => {
            const item = typeof opt === 'string' ? { value: opt, label: opt } : opt;
            return (
              <option key={item.value} value={item.value} disabled={item.disabled}>
                {item.label}
              </option>
            );
          })}
        </select>
      </div>

      {error != null || hint != null ? (
        <span
          id={`${selectId}-hint`}
          className={cx('ds-field-hint', error != null && 'ds-field-hint--error')}
        >
          {error ?? hint}
        </span>
      ) : null}
    </div>
  );
});
