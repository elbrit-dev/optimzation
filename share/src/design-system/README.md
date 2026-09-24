# Elbrit Design System

Shared foundation for **netstar** (web console) and **elbrit-app** (field app).

Lives in netstar at `src/design-system/`. **netstar is the only place to edit
it.**

## Getting it into elbrit-app — at `share/src/design-system`, path for path

elbrit-app's `share/src/` mirrors netstar's `src/` — the datatable and the
Visit report already live there — and the design system now does too:

```
netstar      src/design-system/           <- edit here, and only here
elbrit-app   share/src/design-system/     <- a copy, minus __tests__
```

Same relative path on both sides, so a port is a directory copy and every
import inside the system resolves unchanged. `share/` is safe from syncs:
`npm run copy-shared` degits only `components/` and `shared/`.

It was first ported to `elbrit-app/design-system/` at the repo root, on the
belief that `copy-shared` overwrote `share/`. It does not, and the root
copy forced elbrit-app to register the primitives by hand from its own
plasmic-init — so it was moved.

**Registration is netstar's, in both apps.** `registerElbritCoreComponents`
calls `registerDesignSystem`; elbrit-app's root `plasmic-init.js` calls only
`registerElbritCoreComponents` from `share/src/plasmic-init.js` (netstar's
registrar, copied). Never add a second `registerDesignSystem` call in the
app: it registers every primitive twice.

What elbrit-app wires by hand:

| File | Change |
| --- | --- |
| `elbrit-app/styles/globals.css` | tokens + `tailwind.css` + `components.css` from `../share/src/design-system/`, after `@import "tailwindcss"` |
| `elbrit-app/pages/_app.jsx` | `dsPrimeReactValue` from `share/src/design-system/primereact/registry`; Roboto + Work Sans via `next/font/google`; `display:contents` wrapper carrying the variables and `data-surface="app"` |
| `elbrit-app/jsconfig.json` | `@/design-system` -> `./share/src/design-system` |

The copy is byte-for-byte: nothing in it is app-specific. To port, replace
the folder wholesale (minus `__tests__`) and diff to confirm.

- **The Geist mapping was already dead.** elbrit-app's `@theme inline` set
  `--font-sans: var(--font-geist-sans)`, but nothing ever defined that
  variable — `_document.jsx` declares the faces as `GeistVF`/`GeistMonoVF`. So
  `font-sans` had been emitting an invalid value. It now maps to `--ds-font-ui`.


---

## The six principles

These decide whether a change belongs. If a design choice contradicts one, the
rule wins.

1. **Tokens, never literals.** Every colour, size, radius, shadow and duration
   comes from a CSS custom property. A hex code in a component file is a bug.
2. **Blue is the product, red is the brand.** Blue `rgb(15,135,249)` carries
   every interactive affordance. Red `rgb(220,38,39)` is reserved for the mark,
   the centre nav action, the active-tab underline, and destructive intent. Red
   never decorates the tool.
3. **Density before comfort.** This is an operational tool. 10–12px type in the
   app, 12–14px in the console; 22–40px controls. Do not inflate a component to
   feel modern.
4. **Flat surfaces only.** No gradients, no photography behind UI, no textures,
   no glass, no backdrop blur. Depth comes from four shadows and nothing else.
5. **Hover lighter, press darker, focus is a ring.** Fixed across the whole
   system. Never inverted for one component, and focus is never a colour swap.
6. **Compose before you author.** Extend the primitives below before adding a
   new one. A new primitive needs a real counterpart in the product.

**Never:** gradients · a card with a coloured left border · Unicode emoji as
icons · Lucide/Heroicons substitutes · a scale-down press effect · a shadow
outside the four · a spacing value snapped from 11px to 12px.

---

## Layout

```
design-system/
  tokens/
    index.css      entry — import this one
    fonts.css      three families
    color.css      brand, product, status, neutral, intent
    type.css       14-step scale, line heights, weights, role shorthands
    space.css      spacing, radii, control heights, elevation, motion
    base.css       element defaults (body, a, ::placeholder, focus-visible)
  tailwind.css         additive Tailwind v4 bridge — safe to adopt today
  tailwind-strict.css  removes Tailwind's stock palette — opt in per surface
  components/
    components.css     primitive styles (all classes prefixed `ds-`)

    controls    Button.jsx  Field.jsx  Select.jsx  Switch.jsx
                SegmentedControl.jsx  Tabs.jsx  ChipRow.jsx
    labels      StatusPill.jsx  Tag.jsx  Eyebrow.jsx  SectionLabel.jsx
                RingNav.jsx
    quantities  Metric.jsx  ProgressBar.jsx  StackedBar.jsx  LegendChip.jsx
                ProgressRing.jsx  CountBadge.jsx
    containers  Card.jsx  ListRow.jsx  DisclosureRow.jsx
    other       Icon.jsx  Avatar.jsx
  lib/cx.js        class joiner; the DS has no runtime dependencies
  lib/tone.js      the ONE tone vocabulary — see below
  plasmic.js       Studio registration for every primitive
  index.js         public barrel — import from here
  .oxlintrc.json   adherence rules
```

Wired up in:

| File | What it does |
| --- | --- |
| `netstar/src/app/globals.css` | imports tokens + bridge + primitive styles |
| `elbrit-app/styles/globals.css` | same three imports, from `share/src/design-system/` |
| `netstar/src/plasmic-init.js` | `registerElbritCoreComponents` calls `registerDesignSystem` |
| `elbrit-app/share/src/plasmic-init.js` | the same `registerElbritCoreComponents`, copied — it calls `registerDesignSystem` |

In both apps the primitives come free with `registerElbritCoreComponents`, and
appear under an "Elbrit Design System" section in the Studio tray.
`registerDesignSystem` stays exported for a consumer that wants the primitives
without the core data components — but call it once. Calling it *and* a
`registerElbritCoreComponents` that already invokes it registers every
primitive twice.

Live specimen page: **`/design-system`** in netstar. Open it when reviewing a
token change; it renders every primitive in every state that matters.

---

## Usage

```jsx
import { Button, Card, Field, Icon, StatusPill, Switch, Tag } from '@/design-system';

<Card padding="app" title="Tour plan">
  <Field label="Search doctors" placeholder="Doctor name..." prefix={<Icon name="search" />} />
  <StatusPill status="approved">Approved</StatusPill>
  <Button type="primary" icon={<Icon name="check" />}>Submit</Button>
</Card>
```

Never import a component file directly — `@/design-system` only. The oxlint
config enforces it.

### Which control, when

Four pairs get confused. The distinction is what the control *changes*, not
what it looks like.

| Use | Not | Because |
| --- | --- | --- |
| `Tabs` | `SegmentedControl` | Tabs change WHAT you are looking at and span the page. SegmentedControl changes HOW the same data renders (Cards vs Table) and sits in a toolbar, sized to content. |
| `ChipRow` | `SegmentedControl` | ChipRow selects from an OPEN, data-driven list — 2 HQs today, 97 tomorrow — so it scrolls horizontally and sizes to content. SegmentedControl divides a fixed, small, known set with equal-width items. |
| `StatusPill` | `Tag` | Status is semantic and closed. Tag is categorical and open, and its colours carry no meaning. |
| `StackedBar` | two `ProgressBar`s | Parts of a whole belong in one track, where the segments cannot drift out of sync. |
| `RingNav` | `Tabs` / `ChipRow` | An open list of WORK ITEMS, each carrying its own progress ring, count and due date, each a LINK to its own page. Scrolls like ChipRow; unlike Tabs it switches nothing on this page, so it has no selected state and no red underline. In Studio use "Elbrit Ring Nav" from ElbritCoreLib, which routes through next/link (harness: `/ring-nav`). |

**The task strip's red is `danger`, not the brand red.** The source mock drew
its rings and badges in `--elbrit-red` (the mark). Here they mean "owed", so
rings take `toneFill('danger')` and badges `--intent-danger-fill`. Its
`conic-gradient` rings are SVG arcs (`ProgressRing`), per principle 4, and its
6.5px date caption is `--fs-8`.

**The active-tab underline is the one interactive red in the system.**
Principle 2 names it. Everything else on a `Tabs` item is blue — the label
takes `--brand-text`, the wash `--intent-info-wash`. Do not "correct" the
underline to blue.

### One tone vocabulary — `lib/tone.js`

Every component that colours something by meaning resolves through
`toneFill()` / `toneText()`. Two names exist for each tone and both are
accepted:

| Outcome (bars, metrics) | Status (pills) | Fill token |
| --- | --- | --- |
| `brand` | `info` | `--brand-primary` |
| `success` | `approved` | `--status-approved` |
| `warning` | `pending` | `--status-pending` |
| `danger` | `rejected` | `--status-rejected` |
| `neutral` | `draft` | `--status-draft` |

Both sets are kept because neither reads in the other's context — "a draft
progress bar" and "an approved bar segment" are both nonsense. What is *not*
kept is a second copy of the map inside a component: that is how one green
drifts from another. `toneText` exists because the saturated fills fail as
small text (green 2.28:1, amber 1.93:1); a bar segment can be
`--status-approved`, the label beside it cannot.

### Surface density

The two surfaces share the token set but not the density. Set `data-surface`
on a root element and density-aware tokens follow:

```jsx
<main data-surface="console">  {/* netstar: 32px controls, 14px body */}
<main data-surface="app">      {/* elbrit-app: 22px controls, 12px body */}
```

That drives `--control-h-default`, `--type-body-default` and
`--ds-font-surface`, and therefore the `h-control-default` utility and
`SegmentedControl`'s height.

---

## Tokens

Prefer semantic aliases (`--brand-primary`, `--ds-text-secondary`,
`--surface-card`). Reach for a raw ramp value (`--elbrit-*`) only when no alias
expresses the intent.

### Why some tokens carry a `--ds-` prefix

Tailwind v4 claims `--font-*`, `--text-*`, `--radius-*`, `--shadow-*` and
`--ease-*` as `@theme` namespaces. An unprefixed DS token of the same name
makes the bridge self-referential (`--radius-md: var(--radius-md)`), which
resolves to nothing and silently breaks `rounded-md`. So exactly those five
groups are prefixed:

| Prefixed | Plain |
| --- | --- |
| `--ds-font-ui`, `--ds-font-display`, `--ds-font-mono` | `--space-*`, `--fs-*`, `--lh-*`, `--fw-*`, `--ls-*` |
| `--ds-text-body`, `--ds-text-secondary`, `--ds-text-muted`, … | `--brand-*`, `--surface-*`, `--border-*`, `--status-*`, `--intent-*`, `--elbrit-*` |
| `--ds-radius-sm/md/lg/xl/chip/pill/circle` | `--control-h*`, `--icon-*`, `--dur-*`, `--type-*` |
| `--ds-shadow-hairline/field/card/pop/bottom-nav` | |
| `--ds-ease-standard` | |

### The values people "fix" and shouldn't

A button's inline padding is **15px**, not 16. An input's is **11px**, not 12.
A small control's is **7px**, not 8. A chip's is **5px**. These come from the
source kit's own control metrics; snapping them to 8 makes every control a
pixel out of line with the rest of the product. In Tailwind they are named for
intent so they survive the next reader: `px-btn`, `px-field`, `px-tight`,
`px-chip`.

### Elevation

Four shadows and nothing else. `--ds-shadow-field` for anything that accepts
typing (it carries the hairline *and* the ring, so fields have no border);
`--ds-shadow-card` for cards and panels; `--ds-shadow-pop` for dropdowns and
popovers — the only hard shadow; `--ds-shadow-hairline` for a 1px lift.
`--ds-shadow-bottom-nav` is the one documented exception: the field app's nav
casts upward.

---

## The Tailwind bridge

`tailwind.css` is **additive and safe**. It adds DS colour, type, radius and
shadow utilities, and re-points the t-shirt type sizes onto DS line-heights.
Nothing is removed, so every existing `bg-gray-200` keeps compiling.

The one behavioural change: **`text-xs` is now 12/20 instead of 12/16.** Sizes
are unchanged — they were already legal DS steps — but the paired line-height
becomes the DS 20px workhorse. That is what makes table rows align, and it is
why the bridge is worth adopting before anything else.

| Instead of | Use |
| --- | --- |
| `bg-white` | `bg-surface` |
| `bg-gray-50` | `bg-sunken` or `bg-row-alt` |
| `text-gray-500` | `text-ds-secondary` / `text-ds-muted` |
| `text-gray-900` | `text-body` / `text-heading` |
| `border-gray-200` | `border-line` / `border-line-subtle` |
| `bg-blue-600 hover:bg-blue-700` | `bg-brand hover:bg-brand-hover` |
| `text-xs` + hand-set leading | `type-app-body` |
| `h-8` | `h-control` |
| `shadow-sm` | `shadow-card` |
| `p-[11px]` | `p-field` |

### Spacing is deliberately untouched

Tailwind's stock 0.25rem steps already land on every **even** DS step, so those
need no bridge:

```
p-0.5 = 2px   p-1  = 4px   p-1.5 = 6px   p-2 = 8px    p-2.5 = 10px
p-3   = 12px  p-4  = 16px  p-5   = 20px  p-6 = 24px   p-8   = 32px   p-12 = 48px
```

Redefining them would silently rescale 557 existing call sites in netstar alone
(`gap-2` from 8px to 2px). Only the four **odd** steps are added, under the
intent names above.

---

## Adoption status

**netstar is 100% migrated and running in strict mode.** Zero literals remain
in any category, across JSX, JS and both CSS sheets:

| Category | Before | After |
| --- | --- | --- |
| Stock palette classes | 1,455 | 0 |
| Hex literals (JS) | 184 | 0 |
| Hex literals (CSS) | 294 | 0 |
| `rgb()` / `rgba()` literals | 33 | 0 |
| Inline style dimensions | ~210 | 0 |
| Off-scale type | 130 | 0 |
| Stock shadows | 72 | 0 |
| Gradients | 16 | 0 |
| `backdrop-blur` | 1 | 0 |
| `antd` imports | 3 | 0 |

Two re-runnable, idempotent scripts hold the full mapping tables:

- `scripts/migrate-to-ds.mjs` — JSX/JS: classes, hex, inline style objects,
  CSS-in-template-literal declarations
- `scripts/migrate-css-to-ds.mjs <files...>` — stylesheets

Run either without `--write` for a report.

**elbrit-app is not migrated** and must NOT import `tailwind-strict.css` until
it is — see the sync section above.

### Deliberate behaviour changes

The migration was not purely mechanical. These changed the rendered result on
purpose, to satisfy a principle the old code violated:

- **Hover direction.** `hover:bg-blue-700` on a `bg-blue-600` base was the
  *press* direction used as hover. Now `hover:bg-brand-hover` (lighter), with
  `active:` mapping to `bg-brand-active` (darker).
- **Neutral hovers became a blue wash.** `hover:bg-gray-100/200` and the
  paginator's `rgb(0 0 0 / 0.04)` are now `--brand-tint-weak`/`--brand-tint`,
  per the 4-8% blue tint rule for row and nav hover.
- **The export button is blue, not green.** Green is the "approved" status
  colour; blue carries every interactive affordance. The old markup also set
  its hover to the same green as its base, so it had no hover state at all.
- **Scrollbars are flat and neutral.** They were bluish-purple gradients —
  named explicitly in the guide's "Never" list — and used categorical colours
  as chrome.
- **`.card` was deleted.** It set both a shadow and a border, which the system
  forbids ("pick one, never both"). Its one consumer now uses `<Card>`.
- **Off-scale values snapped to real steps:** `text-[9px]`->10 (rounded up,
  against the contrast floor), `0.8rem`->13, `0.9375rem`->14, `text-3xl/4xl/5xl`
  ->32, `border-radius: 10px`->8, `border-[3px]`->2px.

### Two rules in `tailwind-strict.css` worth knowing

**Reset colour family by family, never `--color-*: initial`.** A namespace
wildcard applies to everything registered in that namespace regardless of
which `@theme` block declared it. Because strict is imported *after*
`tailwind.css`, the wildcard also deletes every DS colour — `bg-surface`,
`text-ds-secondary` and `bg-brand` silently stop compiling while `bg-white`
survives. This was a real bug during the migration.

**Spacing is left alone, even in strict.** Tailwind's numeric steps land on the
DS even scale (`p-4` = 16px = `--space-16`), so they are already compliant.
Removing them would break 557 correct call sites and buy nothing. Arbitrary
values (`p-[13px]`) are caught by oxlint instead, since no `@theme` key can
express them.

### What is deliberately still a literal

`min-w-[120px]`, `max-w-[1600px]`, `min-h-[400px]` and friends — 30 of them.
These are layout constraints, not design tokens: the system has an opinion on
control heights and spacing steps, not on how wide a config panel should be.
Inventing tokens for them would be worse than leaving them legible.

### Visual validation

`node scripts/ds-screenshots.mjs` captures the migrated surfaces to
`<tmp>/ds-shots/`. It is not a regression suite — there are no baselines to
diff — but it is how the migration was checked, and it earned its keep:
screenshots and computed styles caught five things a literal audit could not.

**What it found**

| Finding | Why the literal audit missed it |
| --- | --- |
| The fullscreen toolbar button rendered **purple** | `SmartTableToolbar`'s `COLOR_CLASSES` offered `green`/`purple`/`indigo` fills. They were valid *tokens* (`bg-cat-plum`), just the wrong ones — categorical colours used as chrome. Their `off` hover also equalled their base, so those buttons had no hover state. |
| Table headers rendered in **Inter at weight 600** | `graphiql/graphiql.css` is imported by the playground route but bundled app-wide, and puts `"Inter var"` on table headers. Nothing in this repo was wrong; the fix is to state `font: var(--type-table-head)` so the role shorthand wins. |
| Zebra rows were theme grey `#f8f8fa`, selection was lara **cyan** | Both live in `node_modules/primereact/.../lara-light-cyan/theme.css`, outside anything a repo audit can see. Now overridden to `--surface-row-alt` and `--brand-tint`. |
| **Spacing, weights and control dimensions in CSS were never audited** | The first pass checked colour, radius, type, shadow and easing. Three whole categories went unchecked, which is how 14px table-cell padding survived a "zero literals" claim. Now covered by `migrate-css-spacing.mjs` and `migrate-css-dimensions.mjs`. |
| Row dividers used `--elbrit-surface-mute` | A *surface* token used as a border. Visually near-identical to `--border-subtle`, so only a computed-style check separates them — but a surface change would have moved the dividers with it. |

**Verified by computed style, not by eye:** brand `#0f87f9`, hover `#4096ff`,
press `#0958d9`, mark `#dc2627`, body text `rgba(0,0,0,0.88)`, row-alt
`#fafcff`, divider `#d9d9d9`, cells `8px 16px` on 12/20, 37px rows, header
Roboto/500, paginator `rgb(15,135,249)`, Roboto served by `next/font`.

**Coverage is partial.** Only `/design-system`, `/dev/smart-table` and `/login`
could be captured. Every other route sits behind `ProtectedRoute` -> real
Firebase auth and redirects to login; seeding the SDK's IndexedDB record does
not work because it validates server-side. So the GraphiQL skin — 299
replacements — has **not** been seen rendered. It needs a session to check.

### Self-review checks

Two scripts hunt the class of bug a literal audit cannot see — values that are
valid *tokens* but the wrong ones for their context. Run both after any token
or component change.

```
node scripts/ds-review.mjs      # semantic mismatches, static
node scripts/ds-contrast.mjs    # measured contrast, needs a server on :3111
```

`ds-review.mjs` currently reports clean. It found and drove fixes for:

| Pattern | Instances | Example |
| --- | --- | --- |
| `hover-equals-base` — a hover utility identical to its own base, so the element has no hover state | 9 | `bg-success hover:bg-success` on Save / Apply / Create-preset |
| `status-colour-as-interactive` — green as a primary-action fill, when green means "approved" and blue carries interaction | 5 | Export, Save preset, New config |
| `text-token-as-fill` — a text token used as a background | 1 | `bg-secondary text-on-brand hover:bg-body` on Discard |
| `no-visible-boundary` — a clickable element on a near-white fill with no border, shadow or ring | 1 | the `+N more` chip |
| `surface-token-as-border` | 1 | table row divider on `--elbrit-surface-mute` |

It works by **tokenising class strings on whitespace and comparing token sets**,
not by regex over the raw line. An earlier version escaped a boundary assertion
through a shell heredoc, `\s` silently became a literal `s`, and the check
reported zero findings while eight real ones sat in the code. If you extend it,
extend the tokeniser.

### Contrast: what the palette cannot do

`ds-contrast.mjs` walks every text node, resolves the effective background by
climbing ancestors, flattens alpha, and compares against the WCAG AA floor
(4.5:1 normal, 3:1 large). It went 19 failing pairings -> 15. **The remaining 15
are properties of the supplied palette, not migration errors, and were left
alone rather than silently re-branded.**

Measured on white:

| Token | Ratio | AA text? |
| --- | --- | --- |
| `--brand-primary` `rgb(15,135,249)` | **3.59:1** | no |
| `--intent-danger` `rgb(255,77,79)` | **3.27:1** | no |
| `--status-approved` `rgb(0,199,50)` | **2.28:1** | no |
| `--status-pending` `rgb(250,169,88)` | **1.93:1** | no |
| `--status-draft` `rgb(172,172,172)` | **2.27:1** | no |
| `--elbrit-cyan` `rgb(19,194,194)` | **2.21:1** | no |
| `--brand-primary-active` `rgb(9,88,217)` | 6.16:1 | yes |
| `--elbrit-red-deep` `rgb(217,54,62)` | 4.62:1 | yes |
| `--ds-text-secondary` (0.65 alpha) | 7.00:1 | yes |

So **every primary button in the system fails AA for its label** (white on
`--brand-primary`), as does every status pill. That is a real accessibility
property of the brand, and fixing it means changing brand colours — a decision
for whoever owns the design system, not something to slip into a migration.

What was fixed, using the palette's own deeper values rather than new colours:

- **Two new text-only tokens.** `--intent-danger-text` (`--elbrit-red-deep`,
  4.62:1) and `--brand-text` (`--brand-primary-active`, 6.16:1). Use these for
  text and icons on a light surface; keep the saturated tokens for fills, where
  the label sits *on* the colour.
- `Field`'s hint was `--ds-text-muted` at 10px (3.35:1) and its error hint was
  `--intent-danger` at 10px (3.27:1). Now `--ds-text-secondary` (7:1) and
  `--intent-danger-text` (4.62:1).
- `SegmentedControl`'s inactive label was muted on a *tint* (3.33:1) — the
  guide permits muted only at "12px+ on white". Now secondary.
- The specimen page itself used `text-ds-muted` at 8px and 10px, violating the
  guide's own contrast floor.

Disabled text (`rgba(0,0,0,0.25)`, 1.83:1) is reported but is exempt: WCAG
excludes disabled controls.

### The lara-light-cyan leak, and the import-order trap

`lara-light-cyan/theme.css` lives in `node_modules`, so nothing in this repo
can tokenise it — it just wins wherever the override sheet does not reach.
Its primary is **cyan**, a colour absent from this palette. Found so far:

| Leak | Where | Now |
| --- | --- | --- |
| Cyan primary on every PrimeReact `Button` (72 call sites, 17 files) | Filter/Sort sidebar's Apply rendered turquoise; its outlined Clear had a grey label light enough to read as disabled | `.p-button.p-component` overrides |
| `#d1d5db` (gray-300) control border, cyan focus ring on `InputText` (15 files) | table filter row | `.p-inputtext.p-component` overrides |
| `#f8f8fa` zebra rows, cyan row selection | every table | `--surface-row-alt` / `--brand-tint` |
| `"Inter var"` at weight 600 on table headers | from `graphiql.css`, bundled app-wide | `font: var(--type-table-head)` |

**The import-order trap.** `layout.jsx` imports `globals.css` FIRST, before the
theme, so lara wins every equal-specificity contest — which is why the sheet
leans on `!important` and on doubled selectors like `.p-button.p-component`
(0,2,0 beats lara's 0,1,0).

Swapping the order looks like the obvious fix. It is not, and this was tried:
putting `globals.css` last also puts **Tailwind's preflight** last, and its
`border-width: 0` reset then strips the border off every `.p-inputtext`,
blanking out the table's filter row. Reordering is still the right end state,
but it changes many things at once and needs visual-regression baselines first.

Until then: **win on specificity, not on order.** PrimeReact always renders
`p-<component> p-component` together, so `.p-x.p-component` is a reliable hook
that needs no `!important`.

### Enforcement

netstar has no ESLint config, so nothing runs in CI yet. The adherence rules
are written and ready:

```
npx oxlint -c src/design-system/.oxlintrc.json src
```

Wiring that into CI is what stops new drift.

---

## Done

- Every literal in `src` is a token — JSX, JS, and both stylesheets.
- `antd` removed entirely (`Switch` x2 replaced; `Descriptions` was dead).
- `ViewSwitcher` delegates to `SegmentedControl` and lost its off-scale
  1.75rem/28px default.
- The state matrix holds everywhere. `tokens/base.css` supplies the focus ring
  and the disabled treatment at **zero specificity** via `:where()`, so all
  131 hand-rolled `<button>` elements get them without touching a call site,
  and any explicit `disabled:*` utility or PrimeReact `.p-disabled` rule still
  wins. The one control that defeated it with a bare `focus:outline-none` now
  supplies a ring.
- Both stylesheets tokenised, including the ~1300-line PrimeReact override
  sheet, so a token change now reaches the PrimeReact surface.
- Geist replaced by Roboto + Work Sans via `next/font`.

### Why 131 buttons did not become `<Button>`

Worth recording, because the raw count is misleading. Of the 131 `<button>`
elements: **2** are labelled action buttons, **16** are icon-only affordances,
and **99** are dropdown triggers, tab items, list rows, chips and toolbar
toggles. Only the first group is a Button; forcing the rest into the primitive
would break their semantics and layout for no gain. The genuine ones were
converted (login's four, the export dialog's two, `DataTableControls`' two),
and the rest are token-correct and inherit the state matrix as above.

## PrimeReact: owning the theme instead of overriding it

The override sheet is ~413 `.p-*` rules fighting `lara-light-cyan` from
`node_modules`, and the fix is to stop overriding and own the styling.

**PrimeReact 11 was spiked and rejected.** v11's `DataTable` has **no
`Column`** — it is a compositional/headless API of 37 parts
(`DataTableRoot`, `DataTableTHeadCell`, `DataTableCell`, …), and 14 of the 35
modules netstar imports are gone or renamed (`column`, `columngroup`, `row`,
`confirmdialog`, `editor`, `menubar`, `selectbutton`, `splitbutton`,
`inputicon`, plus `calendar`->`datepicker`, `dropdown`->`select`,
`sidebar`->`drawer`, `overlaypanel`->`popover`, `tabview`->`tabs`). That makes
it a re-platform of ~5,700 lines (`SmartDataTable` + `DataTableNew`) for a
styling outcome. Revisit only if upgrading for non-styling reasons.

**v10 `unstyled` + a PassThrough preset was built instead.**
`src/design-system/primereact/dataTablePreset.js` — `unstyled` stops PrimeReact
emitting `p-*` classes, so lara has nothing to select and cannot leak. Verified
by computed style, not by eye:

| | styled | unstyled |
| --- | --- | --- |
| header cell | 8px 16px, 2px border | same |
| filter row cell | 12px 16px, 1px | same |
| body cell | 8px 16px, 1px | same |
| filter input | 32px | same |
| column resizer | 36px | same |
| row height | 37px | same |
| `p-*` classes present | yes | **none** |

Three defects the measurement caught that a screenshot would not:

- **Frozen columns broke.** `position: sticky` came from lara's
  `.p-frozen-column`, so the Lock-first-column toggle silently stopped working.
- **The column resizer was 94.5px tall.** `h-full` on an absolutely-positioned
  element inside a `table-cell` resolves against the wrong containing block —
  an invisible 8px handle over the whole header, swallowing header clicks.
- **`table-fixed`** made every column equal width; lara leaves `table-layout`
  at `auto`.

### Why it is opt-in, and what unblocks it

`unstyled` removes the `p-*` classes **the whole test layer selects on** —
`.p-datatable-tbody`, `.p-datatable-thead`, `.p-column-title`,
`.p-row-toggler`, `.p-datatable-emptymessage` — plus several unit tests.
Turning it on by default took the suite from 73 passing to 2.

So the flip is gated on a test-infrastructure change, not a styling one:
inject `data-testid` hooks from the preset (pt sections accept arbitrary
attributes) and move the page object onto selectors that hold in both modes
(`tbody > tr`, `th` text rather than `.p-column-title`). Bounded, but it must
land *before* the flip. Until then: `config={{ unstyled: true }}` per view.

Pixel-parity with the old CSS is **not** the gate and was abandoned
deliberately: with every measurable property matching, a 0.5px header rounding
difference (37.5 vs 37) still re-antialiases every glyph below it, which reads
as a stable 7-10% pixel diff. The tolerance cannot absorb it either — 0.05 /
120px is what was needed to catch a full rebrand. Review by eye, re-baseline,
move on.

## Not done yet

1. **Migrate the test selectors off `p-*`** — the one thing blocking `unstyled`
   by default (above). After that, the DataTable rules in the override sheet
   are dead and can be deleted.
2. **The other 34 PrimeReact components.** Each needs its own preset section
   set. `Button` and `InputText` are currently handled by CSS overrides
   instead, which works and is verified.
3. **DataTable sections deliberately absent from the preset:** row selection
   checkboxes, row editing, the filter *menu* (this table uses
   `filterDisplay="row"`), virtual scrolling. None are enabled today; enabling
   one means adding its sections.
4. **`sidebar-filter.spec.js` (4 skips)** — the harness passes no `sortOptions`
   config, so the sidebar never renders and the tests skip themselves.
5. **Dark mode.** Not shipped; every surface token is a light value.

## Deviations from the supplied Figma extraction

The `Elbrit Design System` zip was an archaeological transcription of
`canvas.fig`: faithful to measurements, but 148 of its 185 components were raw
Figma dumps with hardcoded literals (`components/app` had 2,619 raw `rgb()`
calls against 110 token references). This system takes its **token contract**
and its **principles**, and departs where transcription fidelity conflicted
with being usable:

| Deviation | Why |
| --- | --- |
| 3 font families, not 7 | Poppins, Inter, Mulish, Montserrat, Manrope, Plus Jakarta Sans and ABeeZee appeared in isolated screens only. |
| Buttons use `--ds-font-ui`, not SF Pro Text | SF Pro has no font file and is Apple-licensed, so it resolved to a different face per OS. In a cross-platform PWA that is a bug, not a style. |
| Text colours are the alpha ramp (0.88 / 0.65 / 0.45 / 0.25) on both surfaces | The guide already mandated this for console components so they survive a surface-colour change. Applying it everywhere is strictly better than mixing solid greys and alphas. |
| 14 type steps, not 17 | Dropped 15px (iOS list rows — no iOS surface here) and 30px (redundant between 28 and 32). |
| Primitive states live in a stylesheet, not inline style objects | The guide's "import React only, inline styles" rule is an authoring constraint of the DS repo's own bundler. Inline styles cannot express `:hover`/`:focus-visible`, and driving six states from React state costs a re-render per pointer event on a 5,000-row table. Every value is still a token. |
| PrimeReact and Tailwind are kept | The guide forbids npm UI packages. Applied literally, `SmartDataTable` could never comply and would need a multi-quarter rewrite. The rule that actually produces consistency is "tokens, never literals", which is fully satisfied. |
| No `misc/` tier | `Frame239195`, `Component11`, `VasoolRaja` and the other frame-numbered dumps are not a component library. |

### Geist is gone (netstar)

netstar previously loaded Geist and Geist Mono — a create-next-app leftover —
and mapped `--font-sans` to it, which beat the bridge. The Figma source and
this system both specify Roboto as the product face, so `layout.jsx` now loads
Roboto + Work Sans via `next/font/google` and the Geist mapping is deleted.
elbrit-app's Geist mapping is gone too, as part of the port described at the
top of this file.
