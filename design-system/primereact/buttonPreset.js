/* PrimeReact Button — design-system PassThrough preset.
 *
 * The last and largest component in the sweep: 84 render sites across 18 files,
 * and the biggest remaining block in globals.css. Two other components were
 * blocked on it — SplitButton and ConfirmDialog both render Buttons internally,
 * and `unstyled` propagates to children, so registering them earlier stripped
 * SplitButton to naked text with a chevron.
 *
 * IT HAS TO READ MODIFIERS FROM TWO PLACES, AND THAT IS THE WHOLE DIFFICULTY.
 *   - PROPS (`outlined`, `text`, `severity`, `size`): PrimeReact normally turns
 *     these into its own `p-button-outlined` and friends, but that is exactly
 *     what `unstyled` stops it doing. So they are read from `props` here.
 *   - className (`ds-button-outlined`, `ds-button-sm`, ...): 87 call sites apply
 *     these by hand. They are plain strings in our own JSX, so they survive
 *     `unstyled` — and they are matched with variants below. They were called
 *     `p-button-*` until the lara theme was removed; the mechanism is
 *     unchanged, the vocabulary is now ours.
 * Covering only one path would have silently unstyled a large fraction of the
 * buttons in the app. The class names are OURS (`ds-button-*`) — they were
 * `p-button-*` until the lara theme was deleted, at which point keeping the
 * theme's vocabulary in our JSX made no sense.
 *
 * The design system also has its OWN Button (`@/design-system`). Consolidating
 * onto it is a different refactor with real behaviour risk; this preset only
 * re-skins PrimeReact's in place.
 */
const cx = (...parts) => parts.filter(Boolean).join(' ');

/* Shared by both paths. Focus is NOT here: base.css supplies one ring for
   everything focusable, at zero specificity. */
const BASE = cx(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap',
  'rounded-md border border-transparent transition-colors cursor-pointer',
  /* `!` on the colour: the variant classes below also set a text colour, at
     the same specificity, so without it a disabled PRIMARY button kept its
     white label on the grey disabled fill — 1.08:1, which is invisible. */
  'disabled:cursor-default disabled:bg-surface-disabled!',
  'disabled:border-line disabled:text-disabled!',
);

/* Filled brand — the default. */
const FILLED = cx(
  'bg-brand-fill text-on-brand',
  /* Hover DARKER, not lighter: `--brand-primary-hover` is a lighter blue and
     white on it is 2.9:1. See the --brand-fill note in tokens/color.css. */
  'enabled:hover:bg-brand-fill-hover enabled:active:bg-brand-fill-hover',
);

const OUTLINED = cx(
  'bg-surface border-line-subtle text-brand-text',
  'enabled:hover:bg-brand-tint-weak enabled:hover:border-brand-hover',
  'disabled:bg-transparent disabled:border-line-subtle',
);

const TEXT = cx(
  'bg-transparent border-transparent text-brand-text',
  'enabled:hover:bg-brand-tint-weak',
);

const SECONDARY = cx(
  'bg-surface border-line-subtle text-body',
  'enabled:hover:bg-brand-tint-weak enabled:hover:border-brand-hover enabled:hover:text-brand-text',
);

const DANGER = cx(
  'bg-danger-fill text-on-brand',
  'enabled:hover:bg-danger',
);

/* Sizes. `--space-7` and `--space-15` are the odd steps the system keeps
   deliberately; `px-[15px]` binds to the raw value because Tailwind's scale has
   no 15px step and the design system does not want one added. */
const SIZE_DEFAULT = 'h-control px-[15px] text-14';
const SIZE_SM = 'h-control-sm px-[7px] rounded-sm text-12';
const SIZE_LG = 'h-control-lg px-[15px] rounded-lg text-16';

/* The className path. Every one of these is written out in full because
   Tailwind only generates classes it finds as literal strings (landmine 8), and
   they are matched on the button's OWN class list, so `&` is correct here —
   unlike the parent-based cases in Calendar and Timeline. */
const FROM_CLASSNAME = cx(
  '[&.ds-button-outlined]:bg-surface [&.ds-button-outlined]:border-line-subtle [&.ds-button-outlined]:text-brand-text',
  '[&.ds-button-outlined]:enabled:hover:bg-brand-tint-weak',
  '[&.ds-button-text]:bg-transparent [&.ds-button-text]:border-transparent [&.ds-button-text]:text-brand-text',
  '[&.ds-button-text]:enabled:hover:bg-brand-tint-weak',
  '[&.ds-button-secondary]:bg-surface [&.ds-button-secondary]:border-line-subtle [&.ds-button-secondary]:text-body',
  '[&.ds-button-secondary]:enabled:hover:bg-brand-tint-weak',
  '[&.ds-button-danger]:bg-danger-fill [&.ds-button-danger]:text-on-brand [&.ds-button-danger]:border-transparent',
  '[&.ds-button-danger]:enabled:hover:bg-danger',
  '[&.ds-button-warning]:bg-warning [&.ds-button-warning]:text-on-brand',
  '[&.ds-button-primary]:bg-brand-fill [&.ds-button-primary]:text-on-brand',
  '[&.ds-button-sm]:h-control-sm [&.ds-button-sm]:px-[7px] [&.ds-button-sm]:rounded-sm [&.ds-button-sm]:text-12',
  '[&.ds-button-lg]:h-control-lg [&.ds-button-lg]:rounded-lg [&.ds-button-lg]:text-16',
  '[&.ds-button-icon-only]:w-control [&.ds-button-icon-only]:px-0',
  '[&.ds-button-icon-only.ds-button-sm]:w-control-sm',
  '[&.ds-button-icon-only.ds-button-lg]:w-control-lg',
);

const SEVERITY = {
  danger: DANGER,
  secondary: SECONDARY,
  warning: 'bg-warning text-on-brand enabled:hover:brightness-95',
  success: 'bg-success text-on-brand enabled:hover:brightness-95',
  info: FILLED,
  help: FILLED,
};

export const buttonPt = {
  root: ({ props }) => {
    const size = props?.size === 'small' ? SIZE_SM : props?.size === 'large' ? SIZE_LG : SIZE_DEFAULT;
    /* PrimeReact adds its own `p-button-icon-only` when there is an icon and no
       label; unstyled it does not, so the same test is made here. */
    const iconOnly = Boolean(props?.icon) && !props?.label && !props?.children;
    const variant = props?.outlined
      ? OUTLINED
      : props?.text
        ? TEXT
        : SEVERITY[props?.severity] ?? FILLED;

    return {
      className: cx(
        BASE,
        size,
        variant,
        iconOnly && (props?.size === 'small' ? 'w-control-sm px-0' : props?.size === 'large' ? 'w-control-lg px-0' : 'w-control px-0'),
        props?.rounded && 'rounded-full',
        // className modifiers win over the prop-derived variant above.
        FROM_CLASSNAME,
      ),
    };
  },

  label: { className: 'leading-none' },
  icon: { className: 'text-[length:var(--icon-md)]' },
  loadingIcon: { className: 'text-[length:var(--icon-md)] animate-spin' },
};

export default buttonPt;
