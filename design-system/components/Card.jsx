'use client';

import { cx } from '../lib/cx';

/* Card — white, 8px radius, soft shadow, no border. That is the default.
   `variant="hairline"` swaps the shadow for a 1px hairline. Pick one, never
   both.

   There is no left-accent-border card in this system: status belongs in a
   StatusPill inside the card, not on its edge.

   `selected` turns an interactive card into a CHOICE. That is a distinct thing
   from a card you can click through to somewhere: it stays on the page and one
   of the group is always on, so it needs a persistent treatment (brand ring +
   wash) and `aria-pressed`, not just a hover. Reach for it when a set of cards
   IS the filter — see /visit, where selecting an HQ card drives the chart
   below it. `selected` on a card with no `onClick` is meaningless and ignored.

   The ring is an `outline`, not a shadow: this system's four shadows mean
   elevation, and a selected card is not raised. */

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
  selected,
  className,
  style,
  ...rest
}) {
  const isInteractive = typeof onClick === 'function';
  const isChoice = isInteractive && selected != null;

  return (
    <div
      className={cx(
        'ds-card',
        variant === 'hairline' && 'ds-card--hairline',
        PADDING_CLASS[padding] ?? PADDING_CLASS.app,
        isInteractive && 'ds-card--interactive',
        isChoice && selected && 'ds-card--selected',
        className,
      )}
      onClick={onClick}
      role={isInteractive ? 'button' : undefined}
      aria-pressed={isChoice ? Boolean(selected) : undefined}
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
