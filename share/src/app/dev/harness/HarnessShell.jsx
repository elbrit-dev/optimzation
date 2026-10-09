'use client';

/* THE HARNESS — one page for trying any Elbrit screen against a real ERP.
 *
 *   Environment   which ERP (the /tokens rows), and its admin token
 *   Acting as     any ERP user (their token remembered, minted on test ERPs,
 *                 or pasted), a pasted token, or the row's own
 *   Data          the screen's data modes (ERP / saved query / mock…)
 *   Add-ons       custom logic per screen (dry-run writes, emulated
 *                 navigation…) — see ENTRY CONTRACT below
 *   Props         every prop from the component's Plasmic registration
 *   Viewport      device widths, or drag the frame's edge
 *
 * Event-handler props are wired and report to the browser console; so do
 * add-ons (a dry-run write says there what it would have sent).
 *
 * Everything is remembered in this browser (lib/storage.js).
 *
 * SEEING THE SCREEN ALONE — two ways, same identity, props and ERP:
 *   Hide harness   (rail header) folds the rail and the viewport bar away in
 *                  place; a small floating button brings them back.
 *   Open alone ↗   opens <this url>?view=1 in a new tab: the screen alone,
 *                  full window, from the same stored settings — a link to
 *                  look at, or to hand to someone on this machine.
 *
 * ENTRY CONTRACT (harness/entries/*.js):
 *   {
 *     id, title, component, meta,          meta = the Plasmic registration
 *     bind(ctx) → props                    what "acting as" fills in
 *                                          (gqlToken, gqlEnvironment…)
 *     hidden: [prop names]                 not shown in the Props panel
 *     defaults: { prop: value }            starting props (sample data…) —
 *                                          shown and edited in the Props panel
 *     frame: { width, surface, padded }    viewport defaults
 *     modes: [{ id, label, note, defaults, use(ctx) }]
 *                                          data modes (first is default); a
 *                                          mode's defaults add to the entry's
 *     addons: [{ id, use(ctx) }]           always on, in order
 *   }
 * A mode's or add-on's `use(ctx)` is a React hook run next to the screen, so
 * it can keep state. It returns any of:
 *   panel             a React node for the rail
 *   props(p) → p      a transform of the component's props
 *   wrap(node) → node something around the rendered screen
 * ctx = { entry, envName, env, token, person, who, mode, log(name, args),
 *   useSetting(key, initial) } — log writes to the browser console,
 *   useSetting persists per entry. */

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, Icon, SegmentedControl } from '@/design-system';
import { resolveProps } from './lib/props';
import { useStoredState } from './lib/storage';
import { useIdentity } from './lib/useIdentity';
import { EnvironmentPanel } from './components/EnvironmentPanel';
import { IdentityPanel } from './components/IdentityPanel';
import { PropsPanel } from './components/PropsPanel';
import { Stage, VIEWPORTS } from './components/Stage';
import { RailSection } from './components/RailSection';

/* What the screen reports — its event-handler props, and add-ons such as a
   dry-run write — goes to the browser console. */
function log(name, args = []) {
  console.info(`[harness] ${name}`, ...(Array.isArray(args) ? args : [args]));
}

/* Runs the mode's and add-ons' hooks beside the screen and renders it.
   Keyed by mode (and Remount), so a mode switch starts every hook afresh. */
function Host({ entry, mode, ctxBase, props, panelSlot }) {
  const useSetting = (key, initial) => useStoredState(`addon.${entry.id}.${key}`, initial); // eslint-disable-line react-hooks/rules-of-hooks
  const ctx = { ...ctxBase, useSetting };
  const parts = [mode?.use ? mode.use(ctx) : null, ...(entry.addons ?? []).map((a) => a.use(ctx))].filter(Boolean);

  let finalProps = props;
  for (const p of parts) if (p.props) finalProps = p.props(finalProps);
  const Component = entry.component;
  let node = <Component {...finalProps} />;
  for (const p of parts) if (p.wrap) node = p.wrap(node);

  const panels = parts.filter((p) => p.panel).map((p, i) => <div key={i}>{p.panel}</div>);
  return (
    <>
      {node}
      {panelSlot && panels.length ? createPortal(<>{panels}</>, panelSlot) : null}
    </>
  );
}

export function HarnessShell({ entry }) {
  const [envName, setEnvName] = useStoredState('env', 'UAT');
  const identity = useIdentity(envName);
  const [width, setWidth] = useStoredState(`width.${entry.id}`, entry.frame?.width ?? null);
  const modes = entry.modes?.length ? entry.modes : [{ id: 'live', label: 'ERP' }];
  const [modeId, setModeId] = useStoredState(`mode.${entry.id}`, modes[0].id);
  const mode = modes.find((m) => m.id === modeId) ?? modes[0];
  /* Edits to a prop the MODE starts (Ring Nav's mock items) belong to that
     mode, so they do not follow you into another (where they would hide the
     ERP's tiles); every other edit is shared by all modes. */
  const [shared, setShared] = useStoredState(`props.${entry.id}`, {});
  const [own, setOwn] = useStoredState(`props.${entry.id}.${mode.id}`, {});
  const values = useMemo(() => ({ ...shared, ...own }), [shared, own]);
  const setValues = (update) => {
    const next = typeof update === 'function' ? update(values) : update;
    const mine = (k) => Object.prototype.hasOwnProperty.call(mode.defaults ?? {}, k);
    setOwn(Object.fromEntries(Object.entries(next).filter(([k]) => mine(k))));
    setShared(Object.fromEntries(Object.entries(next).filter(([k]) => !mine(k))));
  };
  const [overridden, setOverridden] = useStoredState(`overridden.${entry.id}`, []);
  const [remount, setRemount] = useState(0);
  const [slot, setSlot] = useState(null);
  /* ?view=1 — the screen alone (read after mount: the server render has no
     URL search). Hidden — the same, toggled in place and remembered. */
  const [standalone, setStandalone] = useState(false);
  const [links, setLinks] = useState({ alone: null, harness: null });
  useEffect(() => {
    const here = new URL(window.location.href);
    setStandalone(here.searchParams.has('view'));
    const alone = new URL(here);
    alone.searchParams.set('view', '1');
    const back = new URL(here);
    back.searchParams.delete('view');
    setLinks({ alone: alone.toString(), harness: back.toString() });
  }, []);
  const [hidden, setHidden] = useStoredState(`hidden.${entry.id}`, false);
  const bare = standalone || hidden;
  /* The app's own top bar sits at z-index 1000 — the same layer as a
     Sheet — so the bare view hides it rather than out-stacking it (which
     would bury every drawer the screen opens). */
  useEffect(() => {
    if (!bare) return undefined;
    document.body.setAttribute('data-harness-bare', '');
    return () => document.body.removeAttribute('data-harness-bare');
  }, [bare]);
  const defaults = useMemo(() => ({ ...entry.defaults, ...mode.defaults }), [entry.defaults, mode.defaults]);

  const ctxBase = {
    entry,
    envName,
    env: identity.env,
    token: identity.token,
    person: identity.person,
    who: identity.who,
    mode: mode.id,
    log,
  };
  const bound = useMemo(
    () => (entry.bind ? entry.bind({ envName, token: identity.token, who: identity.who, person: identity.person }) : {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entry, envName, identity.token, identity.who.email, identity.person?.email],
  );
  const { props, errors } = useMemo(
    () => resolveProps(entry.meta, { values, bound, overridden, log, defaults }),
    [entry.meta, values, bound, overridden, defaults],
  );

  const screen = <Host key={`${mode.id}:${remount}`} entry={entry} mode={mode} ctxBase={ctxBase} props={props} panelSlot={bare ? null : slot} />;

  if (bare) {
    /* Over the whole window — the app's own top bar hidden — so what is seen
       is the screen and nothing else. It keeps the width chosen in the
       harness (the same stored setting, so a change here carries back): Fit
       fills the window; a device width centres a column that wide, which is
       all the screen's container queries read. The width buttons sit in the
       floating bar, beside the way back to the harness. */
    const fixed = width != null;
    return (
      <div className={`fixed inset-0 z-40 overflow-auto ${fixed ? 'bg-sunken' : 'bg-page'}`} data-surface={entry.frame?.surface}>
        <div
          className={`${entry.frame?.padded ? 'p-4' : ''} ${fixed ? 'mx-auto my-4 min-h-[calc(100dvh-2rem)] overflow-hidden rounded-xl bg-page shadow-[var(--ds-shadow-pop)]' : ''}`}
          style={fixed ? { width, maxWidth: 'calc(100vw - 1rem)' } : undefined}
        >
          {screen}
        </div>
        <div className="fixed bottom-3 right-3 z-50 flex flex-wrap items-center justify-end gap-1 rounded-full bg-surface p-1 shadow-[var(--ds-shadow-pop)] opacity-70 transition-opacity [@media(hover:hover)]:hover:opacity-100">
          <div role="group" aria-label="Screen width" className="flex items-center">
            {VIEWPORTS.map((v) => (
              <button
                key={v.id}
                type="button"
                aria-pressed={width === v.width}
                onClick={() => setWidth(v.width)}
                className={`rounded-full px-2 py-1 text-11 tabular-nums ${width === v.width ? 'bg-brand text-on-brand' : 'text-ds-secondary [@media(hover:hover)]:hover:bg-brand-tint-weak'}`}
              >
                {v.label}
              </button>
            ))}
          </div>
          <span className="h-4 w-px bg-[var(--border-subtle)]" aria-hidden="true" />
          {standalone ? (
            <a href={links.harness ?? '#'} className="flex items-center gap-1 rounded-full px-3 py-1.5 text-11 font-medium text-brand-text">
              <Icon name="sliders-h" size="sm" /> Open in harness
            </a>
          ) : (
            <button type="button" onClick={() => setHidden(false)} className="flex items-center gap-1 rounded-full px-3 py-1.5 text-11 font-medium text-brand-text">
              <Icon name="sliders-h" size="sm" /> Show harness
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100dvh-4rem)] min-h-[560px] bg-page">
      <aside className="ds-scrollbar flex w-72 shrink-0 flex-col gap-4 overflow-y-auto border-r border-line-subtle bg-surface p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-10 font-semibold uppercase tracking-wide text-ds-muted">Harness</p>
            <h1 className="text-14 font-semibold text-heading">{entry.title}</h1>
          </div>
        </div>
        <div className="-mt-2 flex gap-2">
          <Button size="sm" onClick={() => setHidden(true)} icon={<Icon name="eye-slash" size="sm" />}>Hide harness</Button>
          <a
            href={links.alone ?? '#'}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-md px-2 text-12 font-medium text-brand-text [@media(hover:hover)]:hover:bg-brand-tint-weak"
          >
            Open alone <Icon name="external-link" size="sm" />
          </a>
        </div>
        <EnvironmentPanel envName={envName} setEnvName={setEnvName} identity={identity} />
        <IdentityPanel identity={identity} />
        {modes.length > 1 ? (
          <RailSection title="Data">
            <SegmentedControl items={modes.map(({ id, label }) => ({ id, label }))} value={mode.id} onChange={setModeId} ariaLabel="Data mode" />
            {mode.note ? <p className="text-11 text-ds-secondary">{mode.note}</p> : null}
          </RailSection>
        ) : null}
        <div ref={setSlot} className="flex flex-col gap-4" />
        <PropsPanel
          meta={entry.meta}
          bound={bound}
          hidden={entry.hidden ?? []}
          values={values}
          defaults={defaults}
          setValues={setValues}
          overridden={overridden}
          setOverridden={setOverridden}
          errors={errors}
        />
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1">
          <Stage
            width={width}
            setWidth={setWidth}
            surface={entry.frame?.surface}
            padded={entry.frame?.padded}
            onRemount={() => setRemount((n) => n + 1)}
          >
            {screen}
          </Stage>
        </div>
      </main>
    </div>
  );
}
