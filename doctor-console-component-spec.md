# Doctor console — component split spec

Five separately placeable blocks — one per card in the approved design — inside
the component that already owns the data, so a Studio page can stack them itself.

Registered through `registerDoctorConsoleComponents(loader)` in
`components/DoctorConsole/plasmic.js`, following `registerElbritCoreComponents`
(`share/src/plasmic-init.js`): `section: "Doctor console"`, `parentComponentName:
"DoctorDetail"` on every block so Studio only offers them inside it.

**The provider is `DoctorDetail` itself.** No new provider component was added —
it already did every read, the scoping, the filter and the analytics, so it now
carries `providesData: true`, publishes all of that on a context, and takes a
`children` slot. Leave the slot empty and the page is exactly as it was; drop
blocks in and they replace the built-in stack. Additive, not a migration.

---

## Why one provider, and not five independent fetchers

Every block is a different view of ONE scoped dataset. If each fetched for
itself you would get five copies of the same reads, five chances to disagree,
and — the part that matters — five chances to scope differently. The filter
(department, period, value format) exists precisely so that no two numbers on
the page are measured over different windows; that guarantee only holds if one
thing owns the data.

The `ui/*` parts are already pure presentation. They take computed props
(`lines`, `cols`, `table`, `groups`) — the reads, the scoping and the analytics
all live in `index.jsx` today. The split left that body where it was and published it.

---

## 1. `DoctorDetail` — the provider, and the only thing that touches ERP

`providesData: true`. Does the reads, resolves the viewer, builds the scope,
applies the filter, runs the analytics, and publishes one object. Its `children`
slot is where the blocks go.

### Props

| Prop | Type | Required | Notes |
|---|---|---|---|
| `doctor` | object \| string | **yes** | Lead id (`$ctx.params.id`) or a doctor row. No default — a default here becomes the value the page falls back to when the binding fails, and would show one real doctor's figures under another's name. |
| `erpUrl` | string | **yes** | GraphQL endpoint. Bind the environment the page actually means. |
| `authToken` | string | **yes** | The signed-in user's token. Must come from the same instance as `erpUrl`. |
| `employee` | string | no | **Narrows** scope to this Employee's subtree instead of the viewer's own. For a manager looking at one report's slice. |
| `roleProfile` | string | no | **Narrows** scope to a single seat, e.g. `BE4-ELBR-CO-ERO`. For a doctor covered by several BEs when you want one column. |
| `department` | string | no | Initial department filter. Empty = all. |
| `period` | choice | no | `fy` (default) \| `cur` \| `last` \| `m3` \| `all`. |
| `valueFormat` | choice | no | `full` (default) \| `short`. |
| `pobLimit` | number | no | Default 500. |
| `onBack`, `onAddClinic`, `onRequestService`, `onPobSaved`, `onDoctorLoaded` | eventHandler | no | As today. |

**`employee` and `roleProfile` can only narrow, never widen.** They are
intersected with the token-derived scope, so binding a seat outside it yields
nothing rather than more. There is deliberately **no** prop for the viewer's
role or for service visibility: that is derived from the token
(`logged user → Employee → seat/designation → rank`), because a prop would let
anyone with Studio access hand themselves sight of the service figures.

### Provides (read by the blocks through `useDoctorConsole()`)

```
doctor      { id, name, initials, spec, qual, city, hq, hqs[], code,
              cats[], catLine, divisions[], covering[], lat, lon }
viewer      { employee, employeeName, designation, roleId, role, rank, hq }
scope       { resolved, roleProfiles[], departments[], hqs[], employees[] }
canSeeService, scoped, loading, ready, fatal, errors{}, denied{}, endpoint
support[] service[] pobs[] visits[] notes[] clinics[] pharmacies[]
range       { from, to, label }
roi         { tillDate, latest, supTotal, svcTotal }
months[]    coverage[]  table  activity[]
refresh()
```

All row arrays are **already scoped and already filtered**. A section never
filters again.

---

## 2. The five blocks — AS BUILT

One per card in the approved design, and no finer. The clinic row, the Add POB /
Notes buttons, the Rx chip and the Data ⇄ Activity switch are parts of the card
they sit in, NOT components — a page should not be able to place half a card.

All five are `parentComponentName: "DoctorDetail"`, `section: "Doctor console"`,
and read from context. None of them fetch.

| Block | Studio name | Props |
|---|---|---|
| Hero card — avatar, name, meta, chips, ROI, Rx, clinics, actions | `Doctor · Hero card` | `showRoi`, `showClinics`, `showActions`, `compact` (auto/full/compact) |
| Totals strip | `Doctor · Totals` | `cards` (multi-select of visit/pob/support/note/service) |
| Signed-in + Filter + permission notices | `Doctor · Filter bar` | `showViewer`, `showWarnings` |
| Coverage rings | `Doctor · Coverage by role` | `openable` |
| Trend + switch + table/activity, one surface | `Doctor · Trend & data` | `startOn` (table/activity), `showSwitch` |

`showRoi` and the `service` card can only HIDE. Whether a reader may see service
figures at all is decided by their ERP token (SM and above), never by a prop.

Verified by rendering the whole-page path and the five-block path side by side:
every marker present in both — hero, name, clinic row, actions, totals banner,
strip, filter button, coverage, trend, switch, table, panel surface.

## Notes for implementation

- All provider props are wired: `doctor`, `erpUrl`, `authToken`, `employee`,
  `roleProfile`, `department`, `period`, `valueFormat`, `pobLimit` and the event
  handlers.
- `department`, `period` and `valueFormat` are DEFAULTS, not controls. They set
  where the page opens and are re-applied only when the prop itself changes, so
  a Studio edit lands without stamping on a reader mid-session.
- `period` takes the keys the filter actually offers: `fy`, `cur`, `last`, `m3`,
  `all` (an earlier draft of this spec said ytd/mtd — those do not exist).
- The trend, table and activity are built ONCE by the provider and handed out as
  elements, so a placed `Doctor · Trend & data` and the built-in one cannot be
  fed different series.
- A block dropped outside the provider renders a labelled placeholder, never
  blank and never a thrown error — a half-assembled Studio canvas should not
  take the editor down.
