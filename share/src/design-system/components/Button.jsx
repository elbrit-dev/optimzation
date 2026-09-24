'use client';

import { forwardRef } from 'react';
import { cx } from '../lib/cx';

/* Button — five types, four sizes, six states.
   `ghost` and `danger` are orthogonal flags, not types. */

const TYPE_CLASS = {
  primary: 'ds-btn--primary',
  default: 'ds-btn--default-type',
  dashed: 'ds-btn--dashed',
  text: 'ds-btn--text',
  link: 'ds-btn--link',
};

const SIZE_CLASS = {
  sm: 'ds-btn--sm',
  default: 'ds-btn--default',
  lg: 'ds-btn--lg',
  app: 'ds-btn--app',
};

const ICON_SIZE = {
  sm: 'var(--icon-sm)',
  default: 'var(--icon-md)',
  lg: 'var(--icon-lg)',
  app: 'var(--icon-md)',
};

export const Button = forwardRef(function Button(
  {
    children,
    type = 'primary',
    size = 'default',
    shape = 'default',
    icon = null,
    iconPosition = 'start',
    ghost = false,
    danger = false,
    block = false,
    loading = false,
    disabled = false,
    htmlType = 'button',
    href,
    className,
    style,
    ...rest
  },
  ref,
) {
  const isIconOnly = icon != null && children == null;
  const isDisabled = disabled || loading;

  const classes = cx(
    'ds-btn',
    TYPE_CLASS[type] ?? TYPE_CLASS.primary,
    SIZE_CLASS[size] ?? SIZE_CLASS.default,
    isIconOnly && 'ds-btn--icon-only',
    shape === 'round' && 'ds-btn--round',
    ghost && 'ds-btn--ghost',
    danger && 'ds-btn--danger',
    block && 'ds-btn--block',
    className,
  );

  const glyph = icon ? (
    <span
      className="ds-icon"
      aria-hidden="true"
      style={{ fontSize: ICON_SIZE[size] ?? ICON_SIZE.default }}
    >
      {icon}
    </span>
  ) : null;

  // A spinner would need a keyframe animation, and the system ships no
  // keyframes. Loading reads as disabled plus aria-busy instead.
  const content = (
    <>
      {iconPosition === 'start' ? glyph : null}
      {children}
      {iconPosition === 'end' ? glyph : null}
    </>
  );

  if (href != null && !isDisabled) {
    return (
      <a ref={ref} href={href} className={classes} style={style} {...rest}>
        {content}
      </a>
    );
  }

  return (
    <button
      ref={ref}
      type={htmlType}
      className={classes}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      style={style}
      {...rest}
    >
      {content}
    </button>
  );
});
