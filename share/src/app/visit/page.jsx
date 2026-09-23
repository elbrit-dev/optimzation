'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Dropdown } from 'primereact/dropdown';
import { Eyebrow, Field, Icon } from '@/design-system';
import { getEndpointConfigFromUrlKeyAsync, getEndpointOptionsAsync } from '@/app/graphql-playground/constants';
import { VisitReport } from './components/VisitReport';
import { DEFAULT_GQL_ENVIRONMENT } from './data/liveSource';

/* /visit — the Visit KPI screen, behind a playground sidebar.
 *
 * The sidebar holds every dev-only control the screen needs, so the report
 * itself never carries a knob that only exists for testing:
 *
 *   - Environment — which /tokens row `useVisitKpi` resolves its endpoint and
 *     token from. Only the row NAME (`gqlEnvironment`) ever becomes React
 *     state or a prop; the resolved bearer token is fetched fresh, once per
 *     dataset load, inside data/liveSource.js and never leaves that module.
 *   - Token override — a key to use INSTEAD of the one the /tokens row holds,
 *     for hitting the same environment with somebody else's permissions
 *     without editing that row. Committed on blur/Enter, not per
 *     keystroke, so typing a token does not fire a live ERP request per
 *     character. Empty means "use whatever Environment resolves to."
 *   - Layout width — the same width presets and drag handle this page always
 *     had, just relocated out of a sticky top bar and turned into a dropdown
 *     so it reads the same as Environment above it, not as a different kind
 *     of control that happens to sit in the same rail.
 *
 * Environment and Layout width are PrimeReact `Dropdown`s, not the DS
 * `Select`, on purpose: `Select` wraps a NATIVE `<select>` deliberately (see
 * its own comment) precisely so the open list is the platform's, not ours to
 * style. That is the right call for a form field, but it means the opened
 * panel cannot carry DS tokens at all -- no shadow-pop, no brand-tint hover.
 * report-table's and datatable's own config/preset pickers already solved
 * this the same way this screen needs: `<Dropdown unstyled>`, which emits no
 * `p-*` classes and is skinned entirely by the DS PassThrough preset every
 * `Dropdown` on the site already gets for free from
 * `design-system/primereact/dropdownPreset.js` via the app-wide
 * `PrimeReactProvider` in `layout.jsx` -- rounded panel, `shadow-pop`,
 * brand-tint hover, info-wash for the selected row. Reusing that preset here
 * means these two pickers look like every other config dropdown in netstar,
 * not like a one-off invented for this screen.
 *
 * The report itself uses CONTAINER queries, not media queries, which is the
 * whole reason a width control works here at all: a media query reads the
 * VIEWPORT, so pinning the frame to 390px in a 1440px window would crop the
 * desktop layout rather than switch to the phone one. `@container/report`
 * makes the report answer to the frame instead.
 */

/* Real device widths, not round numbers — the sizes the app is actually opened
   at. 320 is the floor worth supporting and the first one layouts break at. */
const PRESETS = [
  { key: 'fit', label: 'Fit', width: null },
  { key: '320', label: '320', width: 320 },
  { key: '390', label: '390', width: 390 },
  { key: '430', label: '430', width: 430 },
  { key: '768', label: '768', width: 768 },
  { key: '1024', label: '1024', width: 1024 },
  { key: '1280', label: '1280', width: 1280 },
];

const MIN_WIDTH = 260;
const MAX_WIDTH = 2560;


export default function VisitPage() {
  const [width, setWidth] = useState(null);
  const [gqlEnvironment, setGqlEnvironment] = useState(DEFAULT_GQL_ENVIRONMENT);
  const [envOptions, setEnvOptions] = useState([{ name: DEFAULT_GQL_ENVIRONMENT, code: '' }]);

  /* Two pieces of state, not one: `tokenInput` is what the field shows as you
     type, `gqlTokenOverride` is what actually feeds `registryToken` below.
     Committing on blur/Enter rather than every keystroke is what keeps a
     half-typed token from firing a live ERP request per character. */
  const [tokenInput, setTokenInput] = useState('');
  const [gqlTokenOverride, setGqlTokenOverride] = useState('');
  const [showToken, setShowToken] = useState(false);
  const commitToken = useCallback(() => setGqlTokenOverride(tokenInput.trim()), [tokenInput]);

  /* `VisitReport` itself never reads the /tokens registry -- it requires a
     concrete `gqlToken` prop and throws without one (see liveSource.js). The
     registry lookup lives HERE instead, as a dev-only convenience so the
     harness doesn't demand a pasted token for every environment switch; a
     real page (Plasmic Studio) binds the signed-in user's own token instead
     of this resolved value. */
  const [registryToken, setRegistryToken] = useState('');
  useEffect(() => {
    let cancelled = false;
    getEndpointConfigFromUrlKeyAsync(gqlEnvironment)
      .then((config) => {
        if (!cancelled) setRegistryToken(config?.authToken ?? '');
      })
      .catch(() => {
        if (!cancelled) setRegistryToken('');
      });
    return () => {
      cancelled = true;
    };
  }, [gqlEnvironment]);

  const effectiveGqlToken = gqlTokenOverride || registryToken;

  const dragRef = useRef(null);
  const frameRef = useRef(null);

  /* The /tokens registry is Firestore-backed, so the row list is not known at
     build time. Falls back to the one default option above on failure --
     `useVisitKpi` still works with just the name, it just cannot offer a
     second row to switch to. */
  useEffect(() => {
    let cancelled = false;
    getEndpointOptionsAsync()
      .then((rows) => {
        if (!cancelled && rows.length) setEnvOptions(rows);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  /* Pointer events, not mouse: setPointerCapture is what keeps the drag alive
     once the pointer leaves the 12px handle. Without it a fast drag drops. */
  const onPointerDown = useCallback((event) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      startX: event.clientX,
      startWidth: frameRef.current?.getBoundingClientRect().width ?? MIN_WIDTH,
    };
  }, []);

  const onPointerMove = useCallback((event) => {
    const drag = dragRef.current;
    if (!drag) return;
    /* Doubled because the frame is centred: dragging the right edge out by d
       moves the left edge out by d too, so the width grows by 2d and the
       content stays under the cursor's half of the screen. */
    const next = drag.startWidth + (event.clientX - drag.startX) * 2;
    setWidth(Math.min(Math.max(Math.round(next), MIN_WIDTH), MAX_WIDTH));
  }, []);

  const onPointerUp = useCallback((event) => {
    event.currentTarget.releasePointerCapture(event.pointerId);
    dragRef.current = null;
  }, []);

  const activePreset = width == null ? 'fit' : (PRESETS.find((p) => p.width === width)?.key ?? null);

  return (
    <div className="flex min-h-dvh bg-page">
      {/* The playground rail. Its own scroll, independent of the report's --
          a tall report should not carry the environment picker off-screen. */}
      <aside className="ds-scrollbar flex w-60 shrink-0 flex-col gap-5 overflow-y-auto border-r border-line-subtle bg-surface p-3">
        <div>
          <Eyebrow as="h2">Playground</Eyebrow>
          <p className="mt-1 text-10 text-ds-muted">Dev controls for this screen only.</p>
        </div>

        <div className="ds-field-wrap ds-field-wrap--block">
          <label className="ds-field-label" htmlFor="visit-gql-environment">Environment</label>
          <Dropdown
            unstyled
            inputId="visit-gql-environment"
            value={gqlEnvironment}
            onChange={(e) => setGqlEnvironment(e.value)}
            options={envOptions}
            optionLabel="name"
            optionValue="name"
            placeholder="Select environment…"
            className="w-full"
            style={{ height: 'var(--control-h)' }}
          />
        </div>

        <Field
          label="Token override"
          type={showToken ? 'text' : 'password'}
          placeholder="token key:secret (optional)"
          value={tokenInput}
          onChange={setTokenInput}
          onBlur={commitToken}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
          size="default"
          hint="Applies on blur or Enter. Empty uses Environment's own token (harness convenience only -- VisitReport itself always requires one)."
          suffix={
            <button
              type="button"
              onClick={() => setShowToken((s) => !s)}
              aria-label={showToken ? 'Hide token' : 'Show token'}
              className="flex items-center text-ds-secondary hover:text-brand-text"
            >
              <Icon name={showToken ? 'eye-slash' : 'eye'} size="sm" />
            </button>
          }
        />

        <div className="ds-field-wrap ds-field-wrap--block">
          <label className="ds-field-label" htmlFor="visit-layout-width">Layout width</label>
          <Dropdown
            unstyled
            inputId="visit-layout-width"
            value={activePreset}
            onChange={(e) => setWidth(PRESETS.find((p) => p.key === e.value).width)}
            options={PRESETS}
            optionLabel="label"
            optionValue="key"
            className="w-full"
            style={{ height: 'var(--control-h)' }}
          />
        </div>
      </aside>

      {/* `overflow-auto`, not hidden: the report is taller than the window at
          every width, and a clipped stage means the page simply cannot be
          scrolled to the bottom. */}
      <div className="ds-scrollbar flex flex-1 justify-center overflow-auto">
        <div
          ref={frameRef}
          /* The outline only appears once a width is pinned. At "Fit" the
             report IS the page and drawing an edge around it would be a lie;
             pinned, the edge is the thing you are looking at. */
          className={width == null ? 'relative flex min-w-0 flex-col' : 'ds-preview-frame relative flex min-w-0 flex-col'}
          style={{ width: width ?? '100%', maxWidth: '100%' }}
        >
          <VisitReport gqlEnvironment={gqlEnvironment} gqlToken={effectiveGqlToken} />
        </div>

        {/* Outside the frame, not over it — a handle drawn on top would
            swallow the pointer events the report itself needs. Hidden at
            "Fit", where there is no width to drag. */}
        {width == null ? null : (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Adjust layout width"
            aria-valuenow={width}
            aria-valuemin={MIN_WIDTH}
            aria-valuemax={MAX_WIDTH}
            tabIndex={0}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onKeyDown={(e) => {
              const step = e.shiftKey ? 100 : 10;
              if (e.key === 'ArrowRight') setWidth((w) => Math.min(w + step, MAX_WIDTH));
              if (e.key === 'ArrowLeft') setWidth((w) => Math.max(w - step, MIN_WIDTH));
            }}
            className="ds-preview-handle"
          />
        )}
      </div>
    </div>
  );
}
