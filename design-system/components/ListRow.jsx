'use client';

import { cx } from '../lib/cx';

/* ListRow — title over subtitle on the left, anything you like on the right,
   a hairline underneath, and the whole thing optionally tappable.

   The row is a <button> when it has an onClick and a <div> when it does not.
   It is never a div with a click handler: that loses keyboard access, the
   focus ring and the role, and this pattern is the main way into a drill-down
   on a phone.

   `trailing` takes a node rather than a string so a caller can put a count, a
   pill, a chevron or a stacked pair there without this component growing a
   prop per shape. */

export function ListRow({
  title,
  subtitle,
  trailing,
  onClick,
  dense = false,
  divider = true,
  className,
  children,
  ...rest
}) {
  const interactive = typeof onClick === 'function';
  const Tag = interactive ? 'button' : 'div';

  return (
    <Tag
      type={interactive ? 'button' : undefined}
      onClick={onClick}
      className={cx(
        'ds-listrow',
        dense && 'ds-listrow--dense',
        divider && 'ds-listrow--divider',
        interactive && 'ds-listrow--interactive',
        className,
      )}
      {...rest}
    >
      <span className="ds-listrow__main">
        <span className="ds-listrow__title">{title}</span>
        {subtitle != null ? <span className="ds-listrow__subtitle">{subtitle}</span> : null}
        {children}
      </span>
      {trailing != null ? <span className="ds-listrow__trailing">{trailing}</span> : null}
    </Tag>
  );
}
