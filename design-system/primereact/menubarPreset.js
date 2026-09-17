/* PrimeReact Menubar — design-system PassThrough preset.
 *
 * The highest-impact component in the sweep: it is the app header
 * (src/components/AppHeader.jsx), so it renders on all 13 routes and any
 * regression here is an all-pages regression. `e2e/authed/route-baselines.spec.js`
 * baselines it on its own as `app-header.png` for exactly that reason — the
 * Plasmic-rendered pages are too unstable to baseline whole, so the header
 * clip is what protects them.
 *
 * Reproduces the `.app-header-menubar` block from globals.css, with ONE
 * deliberate change, noted at `action` below.
 */
const cx = (...parts) => parts.filter(Boolean).join(' ');

/* The current-route marker.
 *
 * AppHeader used to tag the active item with `p-menuitem-active` — a LARA class
 * name, applied by our own code as application state. It happened to work
 * because the CSS matched on it, but it is a theme class doing a product job,
 * and `unstyled` is precisely the thing that makes such a name meaningless.
 * Renamed to a design-system name and matched here with Tailwind's ancestor
 * variant, since the marker lands on the <li> while the styling belongs on the
 * <a> inside it. Keep this export and AppHeader in step. */
export const NAV_CURRENT_CLASS = 'ds-nav-current';

export const menubarPt = {
  /* `padding: 12px 16px`, dropping to `8px 12px` under 640px, matching the
     media query the CSS block carried. */
  root: { className: 'relative flex items-center bg-surface px-4 py-3 max-sm:px-3 max-sm:py-2' },

  start: { className: 'flex-1' },
  end: { className: 'flex-1 flex justify-end max-sm:ml-2' },

  /* The root list. Hidden below 640px unless the hamburger is open, where it
     becomes a floating panel — that is the `.p-menubar-mobile-active` rule.
     `context.mobileActive` IS populated for this component (verified in the
     DOM; see landmine 2 in docs/PRIMEREACT_SWEEP.md, where three other
     context keys turned out not to be). */
  menu: ({ context }) => ({
    className: cx(
      'flex items-center gap-2 m-0 p-0 list-none',
      context?.mobileActive
        ? 'max-sm:absolute max-sm:left-0 max-sm:right-0 max-sm:top-full max-sm:z-50 ' +
          'max-sm:mt-2 max-sm:flex-col max-sm:items-stretch max-sm:rounded-lg ' +
          'max-sm:border max-sm:border-line-subtle max-sm:bg-surface max-sm:p-2 max-sm:shadow-pop'
        : 'max-sm:hidden',
    ),
  }),

  menuitem: { className: 'relative' },
  content: { className: 'contents' },

  /* The clickable nav item.
   *
   * ONE DELIBERATE CHANGE: hover was `--elbrit-surface-mute`, which is a raw
   * grey with no semantic alias — the only token equal to it is
   * `--surface-disabled`, so reproducing it exactly would mean painting a hover
   * state with the DISABLED surface. The design system's hover convention is a
   * 4% blue wash (`brand-tint-weak`), the same one the table rows use, so that
   * is what this uses. Not visible in `app-header.png`, which is captured
   * without hover; asserted in the route-baselines spec instead.
   *
   * The active/current treatment is unchanged: `--intent-info-wash` background
   * with `--brand-primary` text. */
  action: {
    className: cx(
      'flex items-center px-4 py-2 rounded-md no-underline',
      'type-app-body font-medium text-body transition-colors',
      'hover:bg-brand-tint-weak',
      /* WRITTEN OUT IN FULL ON PURPOSE. Tailwind generates CSS only for class
         names it can find as literal strings in the source, so building this
         from NAV_CURRENT_CLASS with a template literal produced no rule at
         all — the marker landed on the <li> and nothing happened. If you rename
         NAV_CURRENT_CLASS, change these two by hand. */
      '[.ds-nav-current_&]:bg-info-wash [.ds-nav-current_&]:text-brand-text',
      // Mobile items are taller and stack.
      'max-sm:px-4 max-sm:py-3 max-sm:mb-1',
    ),
  },

  /* `color: inherit` is what let the active item tint its icon along with its
     label, so the icon must NOT set its own colour. */
  /* `pi` glyphs are a FONT, so their size is font-size — and with lara gone
     they would inherit the action's 12px console body scale instead of the
     16px `.p-component` was forcing. Nav glyphs are pinned to `--icon-md`
     rather than left to shrink by accident. */
  icon: { className: 'mr-2 text-current text-[length:var(--icon-md)]' },
  label: { className: 'text-current' },
  submenuIcon: { className: 'ml-2 text-current' },

  /* The hamburger. Hidden above 640px, which is the inverse of the root list. */
  button: {
    className: cx(
      'hidden max-sm:flex items-center justify-center p-2 rounded-md',
      'text-body transition-colors hover:bg-brand-tint-weak',
    ),
  },
  popupIcon: { className: 'text-current' },

  submenu: {
    className:
      'absolute z-50 mt-1 min-w-[200px] list-none rounded-lg border border-line-subtle bg-surface p-2 shadow-pop',
  },

  separator: { className: 'my-1 border-t border-line-subtle' },
};

export default menubarPt;
