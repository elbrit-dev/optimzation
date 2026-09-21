# /visit — Visit KPI screen

Mobile-first daily/MTD field-force report. **Wired to live ERPNext data**
(`data/liveSource.js`); set `DATA_SOURCE` in `data/useVisitKpi.js` back to
`'mock'` for the deterministic fixture (dev harness / Playwright baseline).
Design brief, live-data findings and the ERPNext field map are in
[`docs/visit-kpi/PLAN.md`](../../../docs/visit-kpi/PLAN.md).

## Layout

```
page.jsx              width-control shell only
components/           presentation only — no fetching, no aggregation
  VisitReport         the report; owns scope, period and selected HQ
  ReportHeader        avatar, title, "as of" clock
  ScopeSelect         whose team (managers only)
  PeriodTabs          Today / Month till date
  AttendanceCard      stacked bar + four legend chips
  KpiGrid             the 2x2
  HqSection           HQ strip + the selected HQ's detail
  HqStrip             scrolling compact cards + search — selector AND data
  HqCard              one HQ, three numbers, also the control
  VisitsByHourChart   hand-rolled, deliberately not Recharts
  TeamTree            recursive, lazily aggregated
data/
  shape.js            THE CONTRACT. VisitRow / TeamMember + the ERPNext map
  mockData.js         deterministic fixture (seeded LCG, never Math.random)
  selectors.js        every number on the screen, pure
  format.js           every string on the screen, pure
  liveSource.js       ERPNext GraphQL queries (Events, Employees, LeaveApplications)
  useVisitKpi.js      THE SWAP POINT
  __tests__/          39 tests over selectors, format and the fixture
components/__tests__/ HqStrip: the search path the 3-HQ fixture never reaches
```

## Responsive behaviour

**Container queries, not media queries.** The report uses `@2xl/report:` and
`@5xl/report:` rather than `sm:` and `lg:`, keyed to a named container declared
on its own root. Two reasons:

1. It is what makes the width control at the top of `/visit` work at all. A
   media query reads the *viewport*, so pinning the wrapper to 390px in a
   1440px window would crop the desktop layout rather than switch to the phone
   one. A container query reads the wrapper.
2. It describes the layout more honestly. Nothing here cares how big the window
   is; it cares how much room it has been given — so the report drops into a
   narrow column or a drawer without a rewrite.

Thresholds are the stock container scale (`@2xl` = 672px, `@5xl` = 1024px), not
arbitrary values, so they stay tokens. They sit close to the `sm` (640) and
`lg` (1024) they replaced.

| Container width | Layout |
|---|---|
| < 672 (`compact`) | One column. Scope picker under the header at full width, KPI cards 2-up, chart plot `h-32`. |
| ≥ 672 (`medium`) | Header, scope picker and period tabs collapse into one bar. KPI cards 4-up, chart `h-40`, title 16→20px. |
| ≥ 1024 (`wide`) | Two bands: attendance (1 col) beside the KPI row (2 cols), then HQ section (2 cols) beside the team tree (1 col). Chart `h-48`, content caps at `max-w-6xl`. |

### The width control

`page.jsx` is a thin shell: a sticky bar of width presets, a drag handle, and
`<VisitReport />`. "Fit" is the default, so anyone not deliberately checking a
breakpoint sees an ordinary full-width page. Pinning a width outlines the frame
and reveals the handle; dragging it changes the width by *twice* the pointer
delta, because the frame is centred and both edges move.

Three things worth not undoing:

- **The chart's height is a class, not a number.** Bars are percentages of a
  responsively-sized plot box. The first version hardcoded `126px` and stayed
  phone-sized on a 27" monitor.
- **The summary band is `@5xl/report:items-start`.** Without it the KPI cards
  stretch to match the taller attendance card and each ends up half empty.
- **Hover states are behind `@media (hover: hover) and (pointer: fine)`.** A
  touch device resolves `:hover` on tap and keeps it until you touch elsewhere,
  so an unguarded rule leaves a stuck highlight that reads as a selection the
  user did not make. Press states are *not* gated — a press state is the only
  feedback a tap gets before the view changes.

Density stays `data-surface="app"` at every width rather than switching to
`console` when wide. This is one screen, and a surface that changes its control
heights and body size mid-resize is the exact drift the token system exists to
prevent.

## Design-system notes

Two primitives were added to the DS for this screen rather than hand-styled
here, because both filled documented gaps:

- **`Tabs`** — the DS README already reserved red for "the active-tab
  underline" (principle 2) but had no tabs to put it on, so the period switcher
  was using `SegmentedControl`, which is the toolbar control for *how the same
  data renders*. Tabs change *what you are looking at*. Blue label on a blue
  wash, red 2px underline; the underline is drawn transparent on every tab so
  selecting one does not shift the label by 2px.
- **`Select`** — `Field` only wraps `<input>`, so the scope picker was a
  hand-classed `<select>` at the app surface's 22px, half of
  `--tap-target-min`. `Select` defaults to the 40px size for that reason.
  Since superseded by `TreeSelect` for this screen specifically (see below);
  `Select` itself is unchanged and still the right call for an actual flat
  list.
- **`TreeSelect`** — the manager roster is a hierarchy (ZSM → SM → RBM → ABM),
  and a flat `Select` of ~120 names reduced that to alphabetical noise with no
  way to tell which RBM an ABM sits under. `TreeSelect` opens a panel built
  from the same `.ds-disclosure` primitive the Team tree card already renders
  with, so picking a scope is the same tap-a-caret-to-expand interaction as
  browsing the tree two components below it, not a new one.

Also: `lib/tone.js` is now the single tone map and `StatusPill` resolves
through it, so a pill and a bar meaning the same thing cannot drift to two
greens. It accepts both vocabularies — `approved`/`success` are the same tone.
Before, passing `tone="approved"` to a bar silently produced grey.

- **`Card` gained `selected`** — a card used as a *choice* rather than a link
  needs a persistent treatment and `aria-pressed`, not just a hover. That is
  what makes the HQ strip one mechanism instead of two. Extended the existing
  primitive rather than authoring a new one, per principle 6.
- **`.ds-scroll-x`** — the hidden-scrollbar horizontal scroll pattern, lifted
  out of `ChipRow` so the HQ strip shares it instead of copying it.

Exceptions in the tree (`Not reporting`, `On leave`, `Vacant`) render as
`StatusPill`; the normal case stays plain text. A pill on all nineteen rows
would make "working" as loud as "not reporting".

### "Where the visits happened" is one mechanism

It was three: a chip row that filtered, a sentence that summarised, and a list
that compared. Each printed "58 of 99" in a different shape, and only the chips
did anything when tapped.

Now the strip is both the comparison and the filter, and the split is
comparison-versus-depth. Each card is 304x89, hairline outline, no shadow:

```
All HQs                      122/232      name, and done-of-planned
▓▓▓▓▓▓▓▓▓▓▓▓▓░▒▒▒▒▒▒▒▒▒▒▒▒               geo / force / yet to visit
● Geo verified 110  ● Force visit 12  ● Yet to visit 110
```

Everything that only means something about *one* territory — reps active, the
hourly shape — lives on the detail card below, which is why the summary line is
back: it is no longer a duplicate, it is the part the cards deliberately
dropped.

Three decisions on the card:

- **The fraction is the only bold thing.** `122` at the 20px heading step,
  `/232` at 12px muted beside it, everything else secondary or muted — so the
  eye lands on the number first and the card second.
- **Hairline, not shadow.** The DS allows one or the other, never both, and a
  strip of a dozen shadowed cards is noise where a hairline stays quiet.
- **Bar and legend say the same three numbers twice**, once as proportion and
  once as count. That is the point: the bar answers "how does this territory
  look" at a glance, the legend answers "by how much" without a tooltip. An
  earlier wordless `54 · 4 · 41` row needed the reader to already know the
  colour order.

The width is `--ds-hq-card-w` (19rem), capped at `100%` of the strip so the
first card is never clipped on a 320px phone. It is the one number deciding how
many cards a phone shows at once — about one and a quarter at 390px, where the
8.5rem version it replaced showed nearly three. One declaration to change if
that trade turns out wrong in the field.

A horizontal strip rather than a wrapping grid, because a grid orphans its last
card at every item count that is not a multiple of the column count, and the
count is data (2 for one manager, 97 company-wide).

The search box is always present, and sits on the same row as the section
heading so it costs no height at all. That row wraps rather than switching at a
breakpoint: below ~360px the heading and a 144px field do not fit, the field
drops to its own line, and no container query had to know about it.

It was gated to seven-plus HQs on the reasoning that a search over three cards
is furniture — but real scopes have three, so it was never visible to anyone
reviewing the screen, and a control that comes and goes with your team size is
harder to learn than one that is always in the same place.

Two traps in the scroll strip, both about clipping:

- `overflow-x: auto` makes `overflow-y` compute to `auto` too — the spec does
  not let one axis clip while the other stays visible. A strip sized exactly to
  its cards therefore trims their shadow top and bottom. `.ds-scroll-x` carries
  block padding for that, with a matching negative margin so callers still line
  up.
- There is deliberately **no inline equivalent**. Inline padding moves the first
  item off the container's content edge by that amount, which put the HQ cards
  2px left of every other card on the page — a visible jog down the column.
  Nothing needs it, because `.ds-card--selected` draws its ring *inside* the
  border box (`outline-offset: -2px`). An outer ring is the first thing an
  ancestor with `overflow: hidden` eats, and for a card that lives in a scroll
  strip that ancestor always exists.

Every new primitive is registered in `design-system/plasmic.js` and rendered on
`/design-system`, and a test asserts the barrel and the registry stay in step.

## Conventions worth not undoing

- Selectors return `null`, not `0`, for a ratio with no denominator.
  `formatPercent` renders that as `—`. A rep with no plan has no attainment,
  and `0%` reads as failure.
- `asOf` is the latest `visitTime` in the data, never `Date.now()`.
- Attendance is always computed from **today's** rows even in the MTD view;
  call average divides by working reps **and** working days.
- Dates are parsed by string slicing, not `new Date(iso)` — a bare
  `'YYYY-MM-DD'` parses as UTC and lands a day early east of Greenwich.
- The mock is seeded. Two builds with the same anchor produce identical rows,
  which is what makes a screenshot baseline possible.
