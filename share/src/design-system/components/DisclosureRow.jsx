'use client';

import { cx } from '../lib/cx';

/* DisclosureRow — one node of a tappable tree: a header you press to expand,
   and children that appear underneath at the next indent.

   Controlled only. A tree that owns its own open/closed state cannot be
   collapsed when the scope changes, cannot deep-link, and cannot lazily fetch
   a subtree on first expand — and lazy expansion is the whole reason this is
   a tree and not a flat list, because the full hierarchy is five levels and
   four hundred people.

   INDENT COMES FROM THE NESTING, not from `depth`. Children render inside
   their parent's own box, so one step on the children container is already
   cumulative; multiplying it by `depth` as well made it quadratic (12, 36,
   72, 120px) and ate a third of the row's width by the fourth level. `depth`
   is still published as a custom property for callers who want to key
   something else off the level — the stylesheet no longer reads it.

   A leaf (no `children`) still renders its header, with a bullet instead of a
   caret and no press affordance — passing `expandable={false}` is not
   required, absence of children is enough.

   `action` is a SECOND destination for the same row: a control that goes
   somewhere instead of opening the node. It renders outside the header
   rather than inside it because an expandable header IS a <button>, and a
   button inside a button is invalid markup that browsers resolve by
   silently dropping one of them — the reason this is a slot at all and not
   something a caller can put in `header` themselves.

   `actionAlign` says which END of the header the control is laid over. It
   defaults to the bottom, where a right-hand column of figures usually ends;
   `start` is for a header whose first line is the one the control belongs
   beside. Either way the header must reserve the lane — see
   `.ds-disclosure__action-lane` — on the matching line of that column.

   Without an action the markup is untouched, down to the header's
   edge-to-edge hover bleed. */

export function DisclosureRow({
  header,
  action,
  actionAlign = 'end',
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

  const head = (
    <Tag
      type={canExpand ? 'button' : undefined}
      onClick={canExpand ? onToggle : undefined}
      aria-expanded={canExpand ? expanded : undefined}
      className={cx(
        'ds-disclosure__header',
        canExpand && 'ds-disclosure__header--interactive',
        action != null && 'ds-disclosure__header--with-action',
      )}
    >
      <span className="ds-disclosure__marker" aria-hidden="true">
        {canExpand ? (expanded ? '▾' : '▸') : '·'}
      </span>
      <span className="ds-disclosure__body">{header}</span>
    </Tag>
  );

  return (
    <div
      className={cx('ds-disclosure', className)}
      style={{ '--ds-disclosure-depth': depth }}
      {...rest}
    >
      {action != null ? (
        <div className="ds-disclosure__line">
          {head}
          <span
            className={cx(
              'ds-disclosure__action',
              actionAlign === 'start' && 'ds-disclosure__action--start',
            )}
          >
            {action}
          </span>
        </div>
      ) : (
        head
      )}
      {canExpand && expanded ? <div className="ds-disclosure__children">{children}</div> : null}
    </div>
  );
}
