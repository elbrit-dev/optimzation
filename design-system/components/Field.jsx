'use client';

import { forwardRef, useId } from 'react';
import { cx } from '../lib/cx';

/* Field — a text input. No border: --shadow-field supplies both the hairline
   and the focus ring. Labels sit above (console) or inline-left (app), never
   floating. Placeholders are a phrase plus an ellipsis.

   onChange emits (value, event) — value first, not the bare event. That is
   what lets a Plasmic writable state bind straight to `value` without an
   interaction to unwrap `event.target.value`. */

const SIZE_CLASS = {
  sm: 'ds-field-box--sm',
  default: 'ds-field-box--default',
  lg: 'ds-field-box--lg',
  app: 'ds-field-box--app',
};

export const Field = forwardRef(function Field(
  {
    label,
    size = 'default',
    prefix = null,
    suffix = null,
    hint,
    error,
    invalid = false,
    disabled = false,
    block = true,
    onChange,
    id,
    className,
    style,
    inputProps,
    ...rest
  },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const isInvalid = invalid || error != null;
  const describedBy = error != null || hint != null ? `${inputId}-hint` : undefined;

  return (
    <div
      className={cx('ds-field-wrap', block && 'ds-field-wrap--block', className)}
      style={style}
    >
      {label ? (
        <label className="ds-field-label" htmlFor={inputId}>
          {label}
        </label>
      ) : null}

      <div
        className={cx(
          'ds-field-box',
          SIZE_CLASS[size] ?? SIZE_CLASS.default,
          isInvalid && 'ds-field-box--invalid',
          disabled && 'ds-field-box--disabled',
        )}
      >
        {prefix ? (
          <span className="ds-field-affix" aria-hidden="true">
            {prefix}
          </span>
        ) : null}

        <input
          ref={ref}
          id={inputId}
          className="ds-field-input"
          disabled={disabled}
          aria-invalid={isInvalid || undefined}
          aria-describedby={describedBy}
          onChange={(event) => onChange?.(event.target.value, event)}
          {...inputProps}
          {...rest}
        />

        {suffix ? <span className="ds-field-affix">{suffix}</span> : null}
      </div>

      {error != null || hint != null ? (
        <span
          id={describedBy}
          className={cx('ds-field-hint', error != null && 'ds-field-hint--error')}
        >
          {error ?? hint}
        </span>
      ) : null}
    </div>
  );
});
