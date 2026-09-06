'use client';

import { cx } from '../lib/cx';

/* Card — white, 8px radius, soft shadow, no border. That is the default.
   `variant="hairline"` swaps the shadow for a 1px hairline. Pick one, never
   both.

   There is no left-accent-border card in this system: status belongs in a
   StatusPill inside the card, not on its edge. */

const PADDING_CLASS = {
  none: 'ds-card--flush',
  app: 'ds-card--app',
  console: 'ds-card--console',
};

export function Card({
  children,
  variant = 'shadow',
  padding = 'app',
  title,
  actions,
  onClick,
  className,
  style,
  ...rest
}) {
  const isInteractive = typeof onClick === 'function';

  return (
    <div
      className={cx(
        'ds-card',
        variant === 'hairline' && 'ds-card--hairline',
        PADDING_CLASS[padding] ?? PADDING_CLASS.app,
        isInteractive && 'ds-card--interactive',
        className,
      )}
      onClick={onClick}
      role={isInteractive ? 'button' : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      onKeyDown={
        isInteractive
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onClick(event);
              }
            }
          : undefined
      }
      style={style}
      {...rest}
    >
      {title != null || actions != null ? (
        <div className="ds-card__header">
          {title != null ? <h3 className="ds-card__title">{title}</h3> : <span />}
          {actions}
        </div>
      ) : null}
      {children}
    </div>
  );
}
