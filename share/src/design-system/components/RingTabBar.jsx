'use client';

import { cx } from '../lib/cx';
import { toneText } from '../lib/tone';
import { CountBadge } from './CountBadge';
import { Icon } from './Icon';
import { ProgressRing } from './ProgressRing';

/* RingTabBar — a scrolling strip of task tiles, each one a tab.

   Each tile says three things before it is opened: WHAT it is (icon and
   label), HOW FAR ALONG it is (the ring — done against owed), and WHETHER
   IT NEEDS YOU (the count badge, and a date caption when something is due).
   The field app's daily strip — Secondary, Support, Expense, Leave, Survey —
   is the product counterpart, and the reason this is a primitive.

   Which tab control, when:

     Tabs        2-4 fixed peers that divide the page. Full width, equal.
     ChipRow     an open, data-driven filter. Text only.
     RingTabBar  an open list of WORK ITEMS, each carrying its own progress.
                 Scrolls like ChipRow; switches the page like Tabs.

   The selected treatment is Tabs', on purpose — blue label, info-wash disc,
   and the RED UNDERLINE, the one interactive red principle 2 allows. The mock
   had no selected state at all; borrowing Tabs' means "this one is open"
   looks the same whichever tab control is showing it.

   The status dot in the lower corner is an INDICATOR, not a button. A second
   press target inside a tab would nest a button in a button, and a 16px
   target fails --tap-target-min by nearly two thirds. It is decorative to
   assistive tech; a tile whose status must be spoken sets `ariaLabel`.

   Item shape:
     { id, label, icon, caption, captionTone, iconTone, segments, count,
       countTone, statusIcon, statusTone, ariaLabel, disabled }

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

export function RingTabBar({
  items = [],
  value,
  onChange,
  ariaLabel = 'Sections',
  idPrefix,
  className,
  ...rest
}) {
  if (items.length === 0) return null;

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cx('ds-ringtabs', 'ds-scroll-x', className)}
      {...rest}
    >
      {items.map((item) => {
        const active = item.id === value;
        const hasCaption = item.caption != null && item.caption !== '';
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={idPrefix ? `${idPrefix}-tab-${item.id}` : undefined}
            aria-controls={idPrefix ? `${idPrefix}-panel-${item.id}` : undefined}
            aria-selected={active}
            aria-label={describe(item)}
            disabled={item.disabled}
            onClick={() => onChange?.(item.id)}
            className="ds-ringtab"
          >
            <span className="ds-ringtab__ring">
              <ProgressRing segments={item.segments} aria-hidden="true">
                <span className="ds-ringtab__disc" style={{ color: toneText(item.iconTone ?? 'brand') }}>
                  {/* Smaller with a caption under it, larger alone — the
                      glyph takes what the date does not. Both are
                      proportions of the ring, set in components.css. */}
                  {item.icon ? (
                    <Icon
                      name={item.icon}
                      size={hasCaption ? 'var(--ds-ringtab-glyph)' : 'var(--ds-ringtab-glyph-alone)'}
                    />
                  ) : null}
                  {hasCaption ? (
                    <span
                      className="ds-ringtab__caption"
                      style={{ color: toneText(item.captionTone ?? 'neutral') }}
                    >
                      {item.caption}
                    </span>
                  ) : null}
                </span>
              </ProgressRing>
              <CountBadge
                value={item.count}
                tone={item.countTone}
                className="ds-ringtab__badge"
                aria-hidden="true"
              />
              {item.statusIcon ? (
                <span
                  className="ds-ringtab__status"
                  style={{ color: toneText(item.statusTone ?? 'brand') }}
                  aria-hidden="true"
                >
                  <Icon name={item.statusIcon} size="var(--ds-ringtab-status-glyph)" />
                </span>
              ) : null}
            </span>
            <span className="ds-ringtab__label">{item.label}</span>
            <span className="ds-ringtab__underline" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
