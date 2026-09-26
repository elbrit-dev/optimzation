'use client';

import { useState } from 'react';
import { Field, Switch } from '@/design-system';
import { controlsFor, parseObject, toSource } from '../lib/props';
import { RailSection } from './RailSection';

function shortValue(v) {
  if (v == null || v === '') return '—';
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > 28 ? `${s.slice(0, 12)}…${s.slice(-8)}` : s;
}

/* One control per registered prop. */
function Control({ control, value, setValue, boundValue, overridden, setOverridden, error }) {
  const { name, type, help, defaultValue, options } = control;
  const auto = control.bound && !overridden;
  const header = (
    <div className="flex items-center justify-between gap-2">
      <span className="ds-field-label !mb-0 font-mono">{name}</span>
      {!control.bound && value != null ? (
        <button type="button" onClick={() => setValue(undefined)} className="text-10 text-brand-text">
          reset
        </button>
      ) : null}
      {control.bound ? (
        <button type="button" onClick={() => setOverridden(!overridden)} className="text-10 text-brand-text">
          {overridden ? 'use auto' : 'override'}
        </button>
      ) : null}
    </div>
  );

  if (auto) {
    return (
      <div className="flex flex-col gap-0.5">
        {header}
        <span className="truncate rounded-md bg-sunken px-2 py-1 font-mono text-11 text-ds-secondary" title={String(boundValue ?? '')}>
          auto · {shortValue(boundValue)}
        </span>
      </div>
    );
  }

  let input;
  if (type === 'boolean') {
    input = <Switch checked={value ?? Boolean(defaultValue)} onChange={setValue} label={value == null ? `${name} (default ${String(Boolean(defaultValue))})` : name} />;
  } else if (type === 'choice' && options.length) {
    input = (
      <select
        aria-label={name}
        className="h-8 w-full rounded-md border border-line-subtle bg-surface px-2 text-12"
        value={value ?? ''}
        onChange={(e) => setValue(e.target.value === '' ? undefined : e.target.value)}
      >
        <option value="">{defaultValue !== undefined ? `default (${String(defaultValue)})` : '—'}</option>
        {options.map((o) => (
          <option key={String(o.value)} value={o.value}>{o.label ?? String(o.value)}</option>
        ))}
      </select>
    );
  } else if (type === 'object' || type === 'code') {
    /* The box starts with the default, as source, and is edited in place;
       emptying it leaves the prop unset. */
    const text = value ?? (defaultValue !== undefined ? (typeof defaultValue === 'string' ? defaultValue : toSource(defaultValue)) : '');
    input = (
      <textarea
        aria-label={name}
        className={`max-h-80 min-h-16 w-full rounded-md border bg-surface p-2 font-mono text-11 ${error ? 'border-danger-border' : 'border-line-subtle'}`}
        rows={Math.min(14, Math.max(2, text.split('\n').length))}
        value={text}
        placeholder={type === 'object' ? 'JSON or JavaScript' : 'code'}
        onChange={(e) => setValue(e.target.value)}
        spellCheck={false}
      />
    );
  } else {
    input = (
      <Field
        type={type === 'number' ? 'number' : 'text'}
        value={value ?? ''}
        placeholder={defaultValue !== undefined ? String(defaultValue) : ''}
        onChange={(v) => setValue(v === '' ? undefined : v)}
        aria-label={name}
        size="sm"
      />
    );
  }
  return (
    <div className="flex flex-col gap-1">
      {header}
      {input}
      {error ? <span className="text-10 text-danger-text">{error}</span> : null}
      {help ? <span className="line-clamp-2 text-10 text-ds-muted" title={help}>{help}</span> : null}
    </div>
  );
}

/* THE COMPONENT'S PROPS, read from its Plasmic registration — so this panel
   is exactly what a Studio page can set. Props driven by who you are acting
   as (the token, the environment) show as "auto" and can be
   overridden. Event handlers are wired and report to the browser console. */
export function PropsPanel({ meta, bound, hidden, values, defaults = {}, setValues, overridden, setOverridden, errors }) {
  /* Event handlers are wired by the harness (they report to the console),
     so there is nothing to set for them here. */
  const controls = controlsFor(meta, { bound, hidden }).filter((c) => c.type !== 'eventHandler');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const visible = controls.filter((c) => showAdvanced || !c.advanced);
  const set = (name) => (v) => setValues((prev) => ({ ...prev, [name]: v }));
  const setOver = (name) => (on) => setOverridden((prev) => (on ? [...new Set([...prev, name])] : prev.filter((n) => n !== name)));

  return (
    <RailSection
      title={`Props · ${meta?.displayName ?? meta?.name ?? ''}`}
      aside={
        <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); setValues({}); setOverridden([]); }} onKeyDown={() => {}} className="text-brand-text">
          reset
        </span>
      }
    >
      {visible.map((c) => (
        <Control
          key={c.name}
          control={defaults[c.name] !== undefined ? { ...c, defaultValue: defaults[c.name] } : c}
          value={values[c.name]}
          setValue={set(c.name)}
          boundValue={bound[c.name]}
          overridden={overridden.includes(c.name)}
          setOverridden={setOver(c.name)}
          error={errors[c.name] ?? (c.type === 'object' ? parseObject(values[c.name]).error : null)}
        />
      ))}
      {controls.some((c) => c.advanced) ? (
        <button type="button" onClick={() => setShowAdvanced((v) => !v)} className="self-start text-10 text-brand-text">
          {showAdvanced ? 'Hide advanced props' : 'Show advanced props'}
        </button>
      ) : null}
    </RailSection>
  );
}
