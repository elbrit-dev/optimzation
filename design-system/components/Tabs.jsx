'use client';

import { cx } from '../lib/cx';

/* Tabs — a full-width row of underlined tabs.
 *
 * NOT SegmentedControl, and the split is not cosmetic:
 *
 *   SegmentedControl switches how you are LOOKING at something — Cards vs
 *   Table, list vs calendar. Same data, different render. It is inline-flex,
 *   sized to its content, and sits beside other controls in a toolbar.
 *
 *   Tabs switch WHAT you are looking at — Today vs Month till date changes
 *   every number on the page. It spans the full width and reads as page
 *   structure, not as a setting.
 *
 * THE UNDERLINE IS RED, AND THAT IS THE ONE PLACE RED IS ALLOWED TO BE
 * INTERACTIVE. Principle 2 reserves `--brand-mark` for the mark, the centre
 * nav action, destructive intent — and the active-tab underline. Everything
 * else on the tab is blue: the label takes `--brand-text`, the wash takes
 * `--intent-info-wash`, matching what the menubar already does for its current
 * item. Do not "fix" the underline to blue; the README names this case.
 *
 * The underline is rendered as a span on EVERY tab, transparent when inactive,
 * rather than added to the active one. A border that appears on selection
 * shifts the label by 2px each time you switch, and on a phone that reads as a
 * layout bug.
 *
 * Height is pinned at --control-h-lg rather than following the surrounding
 * --control-h-default. On the app surface that resolves to 22px, and a 22px
 * primary navigation target fails --tap-target-min by half. Density before
 * comfort is principle 3; an untappable control is not density.
 */

export function Tabs({ items = [], value, onChange, ariaLabel = 'View', className, ...rest }) {
  if (items.length < 2) return null;

  return (
    <div role="tablist" aria-label={ariaLabel} className={cx('ds-tabs', className)} {...rest}>
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={item.disabled}
            onClick={() => onChange?.(item.id)}
            className="ds-tabs__item"
          >
            <span className="ds-tabs__label">
              {item.label}
              {item.count != null ? <span className="ds-tabs__count">{item.count}</span> : null}
            </span>
            <span className="ds-tabs__underline" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
