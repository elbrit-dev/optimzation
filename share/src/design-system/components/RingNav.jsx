'use client';

import { cx } from '../lib/cx';
import { toneText } from '../lib/tone';
import { CountBadge } from './CountBadge';
import { Icon } from './Icon';
import { ProgressRing } from './ProgressRing';

/* RingNav — a scrolling strip of task tiles, each one a LINK to that task.

   Each tile says three things before it is opened: WHAT it is (icon and
   label), HOW FAR ALONG it is (the ring — done against owed), and WHETHER
   IT NEEDS YOU (the count badge, and a date caption when something is due).
   The field app's daily strip — Secondary, Support, Expense, Leave, Survey —
   is the product counterpart, and the reason this is a primitive.

   NAVIGATION, NOT TABS. A tile goes somewhere; it does not switch a panel
   on this page. So it is an anchor inside a <nav>, not role="tab", and it
   has NO SELECTED STATE: once you are on the page a tile points at, the
   strip is not what you are looking at. That is also why there is no red
   underline here — it belongs to Tabs.

   Which control, when:

     Tabs      2-4 fixed peers that divide THIS page.
     ChipRow   an open, data-driven filter. Text only.
     RingNav   an open list of work items, each with its own progress,
               each leading to its own page.

   A tile with no `href`, or `disabled`, renders as a plain tile — seen, not
   pressable.

   `linkAs` lets an app swap the anchor for its router's link (next/link)
   without the design system importing a framework: it gets `href`,
   `target`, `className`, `aria-label`, `onClick` and children, which is
   exactly next/link's surface.

   The status dot in the lower corner is an INDICATOR, not a button. A second
   press target inside a link would nest interactive content, and a 16px
   target fails --tap-target-min by nearly two thirds. It is decorative to
   assistive tech; a tile whose status must be spoken sets `ariaLabel`.

   Item shape:
     { id, label, href, target, icon, caption, captionTone, iconTone,
       segments, count, countTone, statusIcon, statusTone, ariaLabel,
       disabled }

   `segments` is ProgressRing's (and StackedBar's) contract. Tones come from
   lib/tone.js and colour TEXT here — `toneText`, not `toneFill` — because
   the icon and caption sit on a white disc, where the green fill measures
   2.28:1. */

function describe(item) {
  if (item.ariaLabel) return item.ariaLabel;
  const parts = [item.label];
  if (item.caption) parts.push(String(item.caption));
  const count = Number(item.count);
  if (Number.isFinite(count) && count > 0) parts.push(`${count} pending`);
  return parts.filter(Boolean).join(', ');
}

function TileBody({ item }) {
  const hasCaption = item.caption != null && item.caption !== '';
  return (
    <>
      <span className="ds-ringnav__ring">
        <ProgressRing segments={item.segments} aria-hidden="true">
          <span className="ds-ringnav__disc" style={{ color: toneText(item.iconTone ?? 'brand') }}>
            {/* Smaller with a caption under it, larger alone — the glyph
                takes what the date does not. Both are proportions of the
                ring, set in components.css. */}
            {item.icon ? (
              <Icon
                name={item.icon}
                size={hasCaption ? 'var(--ds-ringnav-glyph)' : 'var(--ds-ringnav-glyph-alone)'}
              />
            ) : null}
            {hasCaption ? (
              <span className="ds-ringnav__caption" style={{ color: toneText(item.captionTone ?? 'neutral') }}>
                {item.caption}
              </span>
            ) : null}
          </span>
        </ProgressRing>
        <CountBadge value={item.count} tone={item.countTone} className="ds-ringnav__badge" aria-hidden="true" />
        {item.statusIcon ? (
          <span
            className="ds-ringnav__status"
            style={{ color: toneText(item.statusTone ?? 'brand') }}
            aria-hidden="true"
          >
            <Icon name={item.statusIcon} size="var(--ds-ringnav-status-glyph)" />
          </span>
        ) : null}
      </span>
      <span className="ds-ringnav__label">{item.label}</span>
    </>
  );
}

export function RingNav({
  items = [],
  onItemClick,
  linkAs: Link = 'a',
  ariaLabel = 'Shortcuts',
  className,
  ...rest
}) {
  if (items.length === 0) return null;

  return (
    <nav aria-label={ariaLabel} className={cx('ds-ringnav', 'ds-scroll-x', className)} {...rest}>
      {items.map((item) => {
        const label = describe(item);
        if (!item.href || item.disabled) {
          return (
            <span key={item.id} className="ds-ringnav__item" aria-disabled="true" aria-label={label} role="img">
              <TileBody item={item} />
            </span>
          );
        }
        return (
          <Link
            key={item.id}
            href={item.href}
            target={item.target || undefined}
            /* A new tab must not hand this page's window to the one it
               opens. */
            rel={item.target === '_blank' ? 'noopener noreferrer' : undefined}
            aria-label={label}
            className="ds-ringnav__item"
            onClick={onItemClick ? (event) => onItemClick(item.id, item.href, event) : undefined}
          >
            <TileBody item={item} />
          </Link>
        );
      })}
    </nav>
  );
}
