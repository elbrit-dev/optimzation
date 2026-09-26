# Dev harness — `/dev/harness`

One page for trying any Elbrit screen against a real ERP, as anyone.
`/visit`, `/dev/secondary-entry`, `/dev/secondary-approval` and `/ring-nav` are this harness too.

| Rail panel | What it does |
|---|---|
| **Environment** | Which ERP (the `/tokens` rows). The admin token for it lists people and, on test ERPs, mints their tokens. Production is detected by host (`lib/erp.js` `PRODUCTION_HOSTS`) and never mints. |
| **Acting as** | *A user* — search the ERP's people (name, email, seat); use their remembered token, paste one, or mint one (test ERPs only — this replaces their API secret there). *Token* — any pasted token. *Env row* — the row's own token. The ERP is asked whose the token is, and that answer is shown. |
| **Data** | The screen's data modes: ERP (server script — how the app mounts it), Saved query (inside an Elbrit DataProvider), Mock (seeded rows, no network). |
| **Add-ons** | Per-screen logic: dry-run writes (reads still hit the ERP; writes are not sent — the browser console says what would have been), emulated navigation (link clicks stay in the frame with an address bar and Back), mock-data controls. |
| **Props** | Every prop from the component's Plasmic registration (`<component>/plasmic.meta.js`, the same object Studio registers). Identity-driven props (`gqlToken`, `gqlEnvironment`, `viewer`) are *auto* and can be overridden. Event handlers are wired by the harness and not listed. Each box starts with the screen's **default props** (the entry's and the mode's `defaults` — sample data such as Ring Nav's mock tiles), edited in place; *reset* returns a prop to its default. Object props take JSON or JavaScript, so a value can hold functions. |

The stage has viewport presets (Fit, 320–1280), a drag handle and Remount. Event-handler props are wired and report to the browser console, as do add-ons (a dry-run write says there what it would have sent). Settings, identities and tokens are remembered in this browser (`localStorage`, `elbrit.harness.*`) — dev only.

## Adding a screen

1. Keep its Plasmic registration in `src/app/<screen>/plasmic.meta.js` and import it into `src/plasmic-init.js`.
2. Write `entries/<screen>.jsx` — see the ENTRY CONTRACT at the top of `HarnessShell.jsx`:
   ```js
   export const myHarness = {
     id: 'my-screen', title: 'My screen', component: MyScreen, meta: myScreenMeta,
     bind: ({ envName, token, who }) => ({ gqlEnvironment: envName, gqlToken: token }),
     defaults: { title: 'Sample' },          // starting props, shown in Props
     frame: { width: 390, surface: 'app', padded: true },
     modes: [{ id: 'live', label: 'ERP' }, myMockMode],
     addons: [dryRunWrites({ makeWriter }), emulatedBrowser()],
   };
   ```
3. List it in `entries/index.js`. It appears at `/dev/harness/my-screen`.

A mode may carry its own `defaults` (added to the entry's — Ring Nav's Mock mode starts `items` and `data`); edits to those are kept per mode. A mode or add-on is `{ id, use(ctx) }`; `use` is a hook run beside the screen and returns any of `panel` (rail UI), `props(p) → p` and `wrap(node) → node`. `ctx.useSetting(key, initial)` persists a setting; `ctx.log(name, args)` writes to the browser console.
