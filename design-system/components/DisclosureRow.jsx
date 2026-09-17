'use client';

import { cx } from '../lib/cx';

/* DisclosureRow — one node of a tappable tree: a header you press to expand,
   and children that appear underneath at the next indent.

   Controlled only. A tree that owns its own open/closed state cannot be
   collapsed when the scope changes, cannot deep-link, and cannot lazily fetch
   a subtree on first expand — and lazy expansion is the whole reason this is
   a tree and not a flat list, because the full hierarchy is five levels and
   four hundred people.

   `depth` drives indent through a CSS custom property rather than a class per
   level, so nesting is not capped at whatever the stylesheet anticipated.

   A leaf (no `children`) still renders its header, with a bullet instead of a
   caret and no press affordance — passing `expandable={false}` is not
   required, absence of children is enough. */

export function DisclosureRow({
  header,
  children,
  expanded = false,
  onToggle,
  depth = 0,
  expandable,
  className,
  ...rest
}) {
  const canExpand = expandable ?? Boolean(children);
  const Tag = canExpand ? 'button' : 'div';

  return (
    <div
      className={cx('ds-disclosure', className)}
      style={{ '--ds-disclosure-depth': depth }}
      {...rest}
    >
      <Tag
        type={canExpand ? 'button' : undefined}
        onClick={canExpand ? onToggle : undefined}
        aria-expanded={canExpand ? expanded : undefined}
        className={cx('ds-disclosure__header', canExpand && 'ds-disclosure__header--interactive')}
      >
        <span className="ds-disclosure__marker" aria-hidden="true">
          {canExpand ? (expanded ? '▾' : '▸') : '·'}
        </span>
        <span className="ds-disclosure__body">{header}</span>
      </Tag>
      {canExpand && expanded ? <div className="ds-disclosure__children">{children}</div> : null}
    </div>
  );
}
