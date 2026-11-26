'use client';

import { useEffect, useRef, useState } from 'react';
import { Card, Icon, ProgressBar, cx } from '@/design-system';
import { TIMING_DAYS, answerText, fileProblem, fileRules, isEmpty, scaleRange, timingDayError } from '../data/shape';
import { MapLocation } from './MapLocation';

/* One question, by its type (SURVEYS_CONTEXT.md §3) — answered, or shown
 * read-only for a sent or missed response.
 *
 * Inputs are authored from tokens, as Secondary Entry's QtyInput is: a boxed
 * DS Field inside a card inside a page is three frames for one answer.
 * Choices are full-width rows (40px, a thumb's target); a pressed one takes
 * the brand tint AND a mark (filled dot, tick, filled star), never a colour
 * swap alone (principle 5). `error` shows under the question, in the ERP
 * page's own words (shape.answerProblem). */

const OPTION =
  'flex min-h-10 w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-12 transition-colors disabled:cursor-not-allowed';
const ON = 'border-brand bg-brand-tint-weak font-semibold text-heading';
const OFF = 'border-line bg-surface text-body hover:border-line-strong';
/* No width here: cx joins without resolving conflicts, so each input sets
   its own (full, or a number's narrow box). */
const FIELD =
  'rounded-lg bg-surface px-3 py-2 text-13 text-body shadow-field placeholder:text-placeholder focus:outline-none disabled:bg-sunken';

const TYPE_LABEL = {
  short_text: 'Short answer',
  paragraph: 'Paragraph',
  number: 'Number',
  date: 'Date',
  multiple_choice: 'Pick one',
  dropdown: 'Pick one',
  checkboxes: 'Pick any',
  linear_scale: 'Scale',
  rating: 'Rating',
  file_upload: 'File',
  map_location: 'Location',
  time: 'Time',
  days: 'Days',
  login: 'Login',
  timings: 'Visiting timings',
};

/* 25 Nov 2026 · Days: Monday … Sunday, pick any */
const WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const todayISO = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

/* a Date question can start on today's date (q.today); the person can change it */
function DateInput({ q, value, onChange, disabled }) {
  useEffect(() => {
    if (q.today && !value && !disabled) onChange(todayISO());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.id]);
  return <input aria-label={q.label} type="date" value={value ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value || null)} className={cx(FIELD, 'h-10 w-48')} />;
}

/* 25 Nov 2026 · Login: Website URL · Login ID · Password (shown as typed).
   26 Nov 2026 · Test login: the app's server signs in to the website with these details, then signs out; the result
   is recorded in the ERP. Signed in → Verified; anything else → Not verified + a REQUIRED reason (OTP, email …).
   Changing any of the three boxes needs a new test. Answer = { url, login, password, test, reason }. */
const LOGIN_CHIPS = ['OTP needed', 'Email verification needed', 'Captcha on the website', 'Wrong password from the distributor', 'Website down', 'Login is in an app (not a website)'];
function LoginInput({ q, value, onChange, disabled, api, response, onBusy }) {
  const v = value && typeof value === 'object' ? value : {};
  const [busy, setBusy] = useState(false);
  const ready = String(v.url ?? '').trim() && String(v.login ?? '').trim() && String(v.password ?? '').trim();
  const set = (k, x) => {
    const next = { url: v.url ?? '', login: v.login ?? '', password: v.password ?? '', reason: v.reason ?? '', [k]: x };
    if (k !== 'reason') delete next.test;
    else if (v.test) next.test = v.test;
    onChange(next.url || next.login || next.password ? next : null);
  };
  const test = async () => {
    if (!ready || busy) return;
    setBusy(true);
    onBusy?.(true); // 26 Nov 2026: the old red note goes while the test runs
    let t;
    try {
      const m = typeof api?.testLogin === 'function' ? await api.testLogin({ response, question: q.id, url: v.url, login: v.login, password: v.password }) : null;
      t = m ? { result: m.result === 'verified' ? 'verified' : 'not_verified', code: m.code || '', message: m.message || '' } : { result: 'not_verified', code: 'error', message: 'Testing isn’t available here.' };
    } catch (e) {
      t = { result: 'not_verified', code: 'error', message: `The test could not run (${e?.message || 'no connection'}). Try again, or say why below.` };
    } finally {
      setBusy(false);
      onBusy?.(false);
    }
    onChange({ ...v, test: t });
  };
  const box = (k, label, type, ph) => (
    <label className="flex flex-col gap-1 text-11 font-semibold text-ds-muted">
      {label}
      <input
        aria-label={`${q.label} — ${label}`}
        type={type}
        inputMode={type === 'url' ? 'url' : undefined}
        autoCapitalize="off"
        autoComplete="off"
        spellCheck={false}
        value={v[k] ?? ''}
        disabled={disabled}
        readOnly={busy}
        placeholder={ph}
        onChange={(e) => set(k, e.target.value)}
        className={cx(FIELD, 'h-10 w-full')}
      />
    </label>
  );
  const t = v.test;
  return (
    <div className="flex flex-col gap-2.5">
      {box('url', 'Website URL', 'url', 'https://…')}
      {box('login', 'Login ID', 'text', 'User ID, email or mobile')}
      {box('password', 'Password', 'text', 'Password')}
      {disabled ? null : busy ? (
        <p role="status" className="flex items-center gap-2 rounded-lg bg-sunken px-3 py-3 text-12 text-body">
          <Icon name="spinner pi-spin" size="sm" />
          Testing — opening the website and signing in…
        </p>
      ) : t ? (
        <>
          <div role={t.result === 'verified' ? 'status' : 'alert'} className={cx('flex flex-wrap items-center gap-2 rounded-lg px-3 py-3 text-12', t.result === 'verified' ? 'bg-success-wash text-success' : 'bg-danger-wash text-danger-text')}>
            <Icon name={t.result === 'verified' ? 'check-circle' : 'exclamation-circle'} size="sm" />
            <span className="min-w-0 flex-1">
              <b>{t.result === 'verified' ? 'Verified' : 'Not verified'}</b> — {t.message || (t.result === 'verified' ? 'signed in successfully' : 'the sign-in did not work')}
            </span>
            <button type="button" onClick={test} className="text-12 font-semibold underline">
              Test again
            </button>
          </div>
          {t.result !== 'verified' ? (
            <label className="flex flex-col gap-1.5 text-11 font-semibold text-ds-muted">
              <span>
                Why isn’t it verified? <span className="uppercase text-danger-text">required</span>
              </span>
              <span className="flex flex-wrap gap-1.5">
                {LOGIN_CHIPS.map((c) => {
                  const on = String(v.reason ?? '').includes(c);
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => {
                        const r = String(v.reason ?? '').trim();
                        set('reason', r.includes(c) ? r : r ? `${r}; ${c}` : c);
                      }}
                      className={cx('min-h-9 rounded-full border px-3 text-12 font-medium', on ? 'border-brand bg-brand-tint-weak text-brand-text' : 'border-line bg-surface text-body')}
                    >
                      {c}
                    </button>
                  );
                })}
              </span>
              <textarea
                rows={3}
                maxLength={1000}
                value={v.reason ?? ''}
                onChange={(e) => set('reason', e.target.value)}
                placeholder="e.g. OTP goes to the distributor’s phone; the details were confirmed with him"
                className={cx(FIELD, 'w-full resize-y text-13 font-normal')}
              />
            </label>
          ) : null}
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <button
            type="button"
            onClick={test}
            disabled={!ready}
            className="flex h-11 items-center gap-1.5 rounded-lg bg-brand px-4 text-12 font-semibold text-on-brand hover:bg-brand-hover disabled:opacity-50"
          >
            <Icon name="shield" size="sm" />
            Test login
          </button>
          <span className="text-12 text-ds-muted">{ready ? 'Signs in to the website with these details, then signs out. Required before sending.' : 'Fill all three, then test the login.'}</span>
        </div>
      )}
    </div>
  );
}

/* 25 Nov 2026 · Visiting timings (as the ERP's My Surveys): linked to the Map location question before it (q.of).
   Once that question has a place, its REGULAR weekly hours load from Google (survey_places mode=hours) and fill
   Monday … Sunday; the BE keeps or edits them (up to 3 timings a day, or Closed / Not available). A day Google shows
   as 24 hours must be edited; end before start and overlapping timings are red until fixed. */
function TimingsInput({ q, value, onChange, disabled, api, answers }) {
  const mapAns = answers?.[q.of];
  const pid = mapAns?.place_id || '';
  const v = value && typeof value === 'object' && value.days ? value : null;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [tries, setTries] = useState(0);
  useEffect(() => {
    if (!pid || disabled || (v && v.place_id === pid) || typeof api?.places !== 'function') return undefined;
    let gone = false;
    if (v && v.place_id && v.place_id !== pid) setNote('The place changed — its timings were loaded again.');
    setBusy(true);
    setErr('');
    api
      .places({ mode: 'hours', id: pid })
      .then((m) => {
        if (gone) return;
        const h = m?.hours || {};
        const days = {};
        TIMING_DAYS.forEach((d) => {
          const g = h.days?.[d];
          days[d] = h.has && g ? { state: g.state === 'open' ? 'open' : 'closed', slots: (g.slots || []).slice(0, 3).map((s) => [s[0], s[1]]) } : { state: 'open', slots: [['', '']] };
        });
        onChange({ place_id: pid, place_name: h.name || mapAns?.name || '', days, source: h.has ? 'google' : 'typed', special: h.special || [] });
      })
      .catch((e) => !gone && setErr(e?.message || 'Couldn’t load the timings.'))
      .finally(() => !gone && setBusy(false));
    return () => {
      gone = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pid, tries]);

  if (!pid) {
    return (
      <p className="flex items-center gap-2 rounded-lg bg-sunken px-3 py-3 text-12 text-ds-muted">
        <Icon name="info-circle" size="sm" />
        Choose the place in the map question above first.
      </p>
    );
  }
  if (!v || v.place_id !== pid) {
    return err ? (
      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-danger-wash px-3 py-3 text-12 text-danger-text">
        <Icon name="exclamation-circle" size="sm" />
        <span className="flex-1">{err}</span>
        <button type="button" onClick={() => setTries((n) => n + 1)} className="flex h-10 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-12 font-semibold text-heading">
          <Icon name="refresh" size="sm" />
          Try again
        </button>
      </div>
    ) : (
      <p className="flex items-center gap-2 rounded-lg bg-sunken px-3 py-3 text-12 text-ds-muted">
        <Icon name={busy ? 'spinner pi-spin' : 'clock'} size="sm" />
        Loading the timings of <b className="text-heading">{mapAns?.name || 'the place'}</b> from Google…
      </p>
    );
  }
  const edit = (fn) => {
    const next = JSON.parse(JSON.stringify(v));
    fn(next);
    if (next.source === 'google') next.source = 'edited';
    onChange(next);
  };
  const src = v.source === 'google' ? 'From Google — check and correct' : v.source === 'edited' ? 'From Google, edited' : 'No timings on Google — please fill them';
  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-start gap-2 rounded-lg bg-brand-tint-weak px-3 py-2.5">
        <Icon name="map-marker" size="sm" className="mt-0.5 shrink-0 text-danger-text" />
        <span className="flex min-w-0 flex-col">
          <span className="text-13 font-semibold text-heading [overflow-wrap:anywhere]">{v.place_name || mapAns?.name || 'Chosen place'}</span>
          <span className="text-11 text-ds-muted">{src}</span>
        </span>
      </p>
      {note ? <p className="flex items-center gap-1.5 text-12 text-body"><Icon name="info-circle" size="sm" />{note}</p> : null}
      {(v.special || []).length ? (
        <p className="flex items-center gap-1.5 text-12 text-body">
          <Icon name="calendar" size="sm" />
          Google shows special hours on {v.special.join(', ')} (e.g. a festival) — the usual weekly timings are filled.
        </p>
      ) : null}
      {TIMING_DAYS.map((d) => {
        const x = v.days[d] || { state: 'closed', slots: [] };
        const er = timingDayError(v, d);
        return (
          <div key={d} className={cx('flex flex-col gap-2 rounded-lg border px-3 py-2.5', er ? 'border-danger-border bg-danger-wash' : 'border-line bg-surface')}>
            <div className="flex items-center justify-between gap-2">
              <b className="text-13 text-heading">{d}</b>
              <select
                aria-label={d}
                value={x.state}
                disabled={disabled}
                onChange={(e) =>
                  edit((n) => {
                    const y = n.days[d];
                    y.state = e.target.value;
                    if (y.state === 'open' && !(y.slots || []).length) y.slots = [['', '']];
                    if (y.state !== 'open') y.slots = [];
                  })
                }
                className={cx(FIELD, 'h-10 w-40')}
              >
                <option value="open">Open</option>
                <option value="closed">Closed</option>
                <option value="na">Not available</option>
              </select>
            </div>
            {x.state === 'open' ? (
              <div className="flex flex-col gap-1.5">
                {(x.slots || []).map((s, k) => (
                  <div key={k} className="flex items-center gap-1.5">
                    <input
                      aria-label={`${d} start`}
                      type="time"
                      value={s[0] || ''}
                      disabled={disabled}
                      onChange={(e) => edit((n) => (n.days[d].slots[k][0] = e.target.value))}
                      className={cx(FIELD, 'h-10 min-w-0 flex-1')}
                    />
                    <span className="text-ds-muted">–</span>
                    <input
                      aria-label={`${d} end`}
                      type="time"
                      value={s[1] || ''}
                      disabled={disabled}
                      onChange={(e) => edit((n) => (n.days[d].slots[k][1] = e.target.value))}
                      className={cx(FIELD, 'h-10 min-w-0 flex-1')}
                    />
                    <button
                      type="button"
                      aria-label="Remove this timing"
                      disabled={disabled}
                      onClick={() => edit((n) => n.days[d].slots.splice(k, 1))}
                      className="flex size-10 shrink-0 items-center justify-center rounded-md text-ds-muted hover:bg-sunken"
                    >
                      <Icon name="times" size="sm" />
                    </button>
                  </div>
                ))}
                {(x.slots || []).length < 3 && !disabled ? (
                  <button
                    type="button"
                    onClick={() => edit((n) => (n.days[d].slots = (n.days[d].slots || []).concat([['', '']]).slice(0, 3)))}
                    className="flex items-center gap-1 self-start text-12 font-semibold text-brand-text"
                  >
                    <Icon name="plus" size="sm" />
                    Add a timing
                  </button>
                ) : null}
              </div>
            ) : null}
            {er ? (
              <p role="alert" className="flex items-center gap-1.5 text-12 font-semibold text-danger-text">
                <Icon name="exclamation-circle" size="sm" />
                {er}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/* Time: one time ("09:30"), or a start and an end ("09:30-12:00") when q.range */
function TimeInput({ q, value, onChange, disabled }) {
  if (!q.range) return <input aria-label={q.label} type="time" value={value ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value || null)} className={cx(FIELD, 'h-10 w-40')} />;
  const [a = '', b = ''] = String(value ?? '').split('-');
  const set = (x, y) => onChange(x || y ? `${x}-${y}` : null);
  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="flex flex-col gap-1 text-11 font-semibold text-ds-muted">
        Start
        <input aria-label={`${q.label} — start`} type="time" value={a} disabled={disabled} onChange={(e) => set(e.target.value, b)} className={cx(FIELD, 'h-10 w-full')} />
      </label>
      <label className="flex flex-col gap-1 text-11 font-semibold text-ds-muted">
        End
        <input aria-label={`${q.label} — end`} type="time" value={b} disabled={disabled} onChange={(e) => set(a, e.target.value)} className={cx(FIELD, 'h-10 w-full')} />
      </label>
    </div>
  );
}

function Mark({ on, square }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'flex size-4.5 shrink-0 items-center justify-center border-2 transition-colors',
        square ? 'rounded-md' : 'rounded-full',
        on ? 'border-brand bg-brand text-on-brand' : 'border-line-strong bg-surface text-transparent',
      )}
    >
      {square ? <Icon name="check" size="var(--fs-10)" /> : <span className={cx('size-1.5 rounded-full', on ? 'bg-on-brand' : 'bg-transparent')} />}
    </span>
  );
}

function Choices({ q, value, onChange, disabled, multi }) {
  const picked = new Set(multi ? (value ?? []) : []);
  return (
    <div role={multi ? 'group' : 'radiogroup'} aria-label={q.label} className="flex flex-col gap-1.5">
      {(q.options ?? []).map((o) => {
        const on = multi ? picked.has(o) : value === o;
        return (
          <button
            key={o}
            type="button"
            role={multi ? 'checkbox' : 'radio'}
            aria-checked={on}
            disabled={disabled}
            onClick={() => {
              if (!multi) return onChange(on ? null : o);
              const next = new Set(picked);
              if (on) next.delete(o);
              else next.add(o);
              onChange((q.options ?? []).filter((x) => next.has(x)));
            }}
            className={cx(OPTION, on ? ON : OFF)}
          >
            <Mark on={on} square={multi} />
            <span className="min-w-0 flex-1">{o}</span>
          </button>
        );
      })}
    </div>
  );
}

function Dropdown({ q, value, onChange, disabled }) {
  return (
    <div className="relative">
      <select
        aria-label={q.label}
        value={value ?? ''}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value || null)}
        className={cx(FIELD, 'h-10 w-full appearance-none pr-9', !value && 'text-placeholder')}
      >
        <option value="">Choose…</option>
        {(q.options ?? []).map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <Icon name="chevron-down" size="sm" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ds-muted" />
    </div>
  );
}

function Scale({ q, value, onChange, disabled }) {
  const { min, max } = scaleRange(q);
  const steps = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return (
    <div className="flex flex-col gap-1.5">
      <div role="radiogroup" aria-label={q.label} className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((n) => {
          const on = Number(value) === n && value !== null && value !== '';
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={`${n}${n === min && q.min_label ? `, ${q.min_label}` : ''}${n === max && q.max_label ? `, ${q.max_label}` : ''}`}
              disabled={disabled}
              onClick={() => onChange(on ? null : n)}
              className={cx(
                'flex h-10 items-center justify-center rounded-lg border text-14 font-semibold tabular-nums transition-colors',
                on ? 'border-brand-fill bg-brand-fill text-on-brand' : 'border-line bg-surface text-heading hover:border-line-strong',
              )}
            >
              {n}
            </button>
          );
        })}
      </div>
      {q.min_label || q.max_label ? (
        <div className="flex justify-between gap-3 text-10 text-ds-muted">
          <span>{q.min_label}</span>
          <span className="text-right">{q.max_label}</span>
        </div>
      ) : null}
    </div>
  );
}

function Stars({ q, value, onChange, disabled }) {
  const { max } = scaleRange(q);
  const n = Number(value) || 0;
  return (
    <div role="radiogroup" aria-label={q.label} className="flex items-center gap-1">
      {Array.from({ length: max }, (_, i) => i + 1).map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={n === s}
          aria-label={`${s} star${s === 1 ? '' : 's'}`}
          disabled={disabled}
          onClick={() => onChange(n === s ? null : s)}
          className={cx('flex size-10 items-center justify-center rounded-lg transition-colors hover:bg-sunken', s <= n ? 'text-pending' : 'text-line-strong')}
        >
          <Icon name={s <= n ? 'star-fill' : 'star'} size="var(--fs-20)" />
        </button>
      ))}
      {n ? <span className="ml-1 text-12 tabular-nums text-ds-secondary">{n} of {max}</span> : null}
    </div>
  );
}

function sizeText(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/* Pick → check type and size against the question → upload (private) with
   a progress bar → a chip with remove. `value` holds only finished uploads,
   as {url, name, size} — exactly what survey_submit_response takes. */
function FileUpload({ q, value, onChange, disabled, onUpload }) {
  const rules = fileRules(q);
  const files = value ?? [];
  const inputRef = useRef(null);
  const [ups, setUps] = useState([]); // { id, name, size, progress, error }
  /* 23 Nov 2026: a file the AI could not read (blurry, dark, cut off): { url: reason }.
     The only thing the rep is ever told about the AI read. */
  const [unread, setUnread] = useState({});
  const busy = ups.some((u) => !u.error);
  const room = rules.maxFiles - files.length - ups.filter((u) => !u.error).length;
  const valueRef = useRef(files);
  valueRef.current = files;

  const start = (list) => {
    for (const file of list) {
      const id = `${Date.now()}-${Math.random()}`;
      const problem = fileProblem(q, file);
      if (problem) {
        setUps((u) => [...u, { id, name: file.name, size: file.size, error: problem }]);
        continue;
      }
      setUps((u) => [...u, { id, name: file.name, size: file.size, progress: 0 }]);
      onUpload(file, (p) => setUps((u) => u.map((x) => (x.id === id ? { ...x, progress: p } : x))), q)
        .then((res) => {
          setUps((u) => u.filter((x) => x.id !== id));
          if (res.read && res.read.readable === false) setUnread((m) => ({ ...m, [res.file_url]: res.read.reason || 'The file could not be read.' }));
          onChange([...valueRef.current, { url: res.file_url, name: res.file_name, size: res.file_size }]);
        })
        .catch((e) => setUps((u) => u.map((x) => (x.id === id ? { ...x, error: e?.message || 'Upload failed.' } : x))));
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {room > 0 ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className="flex w-full items-center gap-3 rounded-lg border border-dashed border-line-strong bg-surface px-3 py-3 text-left transition-colors hover:border-brand disabled:cursor-not-allowed"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-tint-weak text-brand-text" aria-hidden="true">
            <Icon name="upload" size="sm" />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="text-12 font-semibold text-heading">{files.length ? 'Add another file' : 'Choose a file'}</span>
            <span className="text-11 text-ds-muted">
              {rules.label} · up to {rules.maxMb} MB{rules.maxFiles > 1 ? ` · up to ${rules.maxFiles} files` : ''}
            </span>
          </span>
        </button>
      ) : null}
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={rules.exts.length ? rules.exts.map((e) => `.${e}`).join(',') : undefined}
        multiple={room > 1}
        aria-label={q.label}
        onChange={(e) => {
          const list = [...(e.target.files ?? [])].slice(0, Math.max(room, 0));
          e.target.value = '';
          start(list);
        }}
      />

      {ups.map((u) => (
        <div key={u.id} className={cx('flex flex-col gap-1.5 rounded-lg px-3 py-2', u.error ? 'bg-danger-wash' : 'bg-sunken')}>
          <div className="flex items-center gap-2 text-12">
            <Icon name={u.error ? 'exclamation-circle' : 'file'} size="sm" className={u.error ? 'text-danger-text' : 'text-ds-muted'} />
            <span className={cx('min-w-0 flex-1 truncate', u.error ? 'text-danger-text' : 'text-heading')}>{u.error || u.name}</span>
            {u.error ? (
              <button type="button" aria-label="Dismiss" onClick={() => setUps((x) => x.filter((y) => y.id !== u.id))} className="text-danger-text">
                <Icon name="times" size="sm" />
              </button>
            ) : (
              <span className="shrink-0 tabular-nums text-ds-muted">{Math.round((u.progress ?? 0) * 100)}%</span>
            )}
          </div>
          {u.error ? null : <ProgressBar value={u.progress ?? 0} max={1} size="sm" label={`Uploading ${u.name}`} />}
        </div>
      ))}

      {files.map((f) => (
        <div key={f.url} className={cx('flex flex-col gap-1 rounded-lg border px-3 py-2 text-12', unread[f.url] ? 'border-warning bg-warning-wash' : 'border-line bg-surface')}>
          <div className="flex items-center gap-2">
            <Icon name={/\.pdf$/i.test(f.name) ? 'file-pdf' : 'image'} size="sm" className="text-brand-text" />
            <span className="min-w-0 flex-1 truncate font-semibold text-heading">{f.name}</span>
            <span className="shrink-0 tabular-nums text-ds-muted">{sizeText(f.size || 0)}</span>
            <button
              type="button"
              aria-label={`Remove ${f.name}`}
              disabled={disabled || busy}
              onClick={() => onChange(files.filter((x) => x.url !== f.url))}
              className="flex size-7 items-center justify-center rounded-md text-ds-muted transition-colors hover:bg-sunken hover:text-danger-text"
            >
              <Icon name="times" size="sm" />
            </button>
          </div>
          {unread[f.url] ? (
            <p role="status" className="flex items-start gap-1.5 text-11 font-medium text-warning-text">
              <Icon name="exclamation-triangle" size="sm" className="mt-px shrink-0" />
              <span>{unread[f.url]} Couldn’t read it — please remove it and upload a clearer one.</span>
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function Input({ q, value, onChange, disabled, onUpload, api, response, answers, onBusy }) {
  switch (q.type) {
    case 'map_location':
      return <MapLocation q={q} value={value} onChange={onChange} disabled={disabled} api={api} response={response} />;
    case 'paragraph':
      return <textarea aria-label={q.label} rows={3} value={value ?? ''} disabled={disabled} placeholder="Your answer…" onChange={(e) => onChange(e.target.value)} className={cx(FIELD, 'w-full resize-y')} />;
    case 'number':
      return <input aria-label={q.label} type="text" inputMode="decimal" value={value ?? ''} disabled={disabled} placeholder="0" onChange={(e) => onChange(e.target.value)} className={cx(FIELD, 'h-10 w-40 tabular-nums')} />;
    case 'date':
      return <DateInput q={q} value={value} onChange={onChange} disabled={disabled} />;
    case 'timings':
      return <TimingsInput q={q} value={value} onChange={onChange} disabled={disabled} api={api} answers={answers} />;
    case 'login':
      return <LoginInput q={q} value={value} onChange={onChange} disabled={disabled} api={api} response={response} onBusy={onBusy} />;
    case 'time':
      return <TimeInput q={q} value={value} onChange={onChange} disabled={disabled} />;
    case 'days':
      return <Choices q={{ ...q, options: q.options?.length ? q.options : WEEK }} value={value} onChange={onChange} disabled={disabled} multi />;
    case 'multiple_choice':
      return <Choices q={q} value={value} onChange={onChange} disabled={disabled} />;
    case 'checkboxes':
      return <Choices q={q} value={value} onChange={onChange} disabled={disabled} multi />;
    case 'dropdown':
      return <Dropdown q={q} value={value} onChange={onChange} disabled={disabled} />;
    case 'linear_scale':
      return <Scale q={q} value={value} onChange={onChange} disabled={disabled} />;
    case 'rating':
      return <Stars q={q} value={value} onChange={onChange} disabled={disabled} />;
    case 'file_upload':
      return <FileUpload q={q} value={value} onChange={onChange} disabled={disabled} onUpload={onUpload} />;
    default:
      /* 25 Nov 2026 · a password is typed hidden (the ERP saves it encrypted to the record, never in the answers);
         a website gets the web keyboard (the ERP checks it opens when the survey is sent) */
      if (q.secret || q.check_url) {
        return (
          <div className="flex flex-col gap-1">
            <input
              aria-label={q.label}
              type={q.secret ? 'password' : 'url'}
              inputMode={q.secret ? undefined : 'url'}
              autoCapitalize="off"
              autoComplete={q.secret ? 'new-password' : 'off'}
              value={value ?? ''}
              disabled={disabled}
              placeholder={q.secret ? 'Type the password' : 'https://…'}
              onChange={(e) => onChange(e.target.value)}
              className={cx(FIELD, 'h-10 w-full')}
            />
            <span className="text-11 text-ds-muted">{q.secret ? 'Saved encrypted to the record — not shown in the answers.' : 'The website must open before you can send.'}</span>
          </div>
        );
      }
      return <input aria-label={q.label} type="text" value={value ?? ''} disabled={disabled} placeholder="Your answer…" onChange={(e) => onChange(e.target.value)} className={cx(FIELD, 'h-10 w-full')} />;
  }
}

export function QuestionCard({ q, index, value, onChange, onUpload, api, response, answers, error, readOnly = false, disabled = false }) {
  const answered = !isEmpty(value);
  const [busy, setBusy] = useState(false);
  const shownError = busy ? null : error;
  return (
    <Card variant="hairline" className={cx('flex scroll-mt-20 flex-col gap-3', shownError && 'border-danger-border')} data-question={q.id}>
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-3">
          <span className="text-10 font-semibold uppercase tracking-wide text-ds-muted">
            Q{index + 1} · {TYPE_LABEL[q.type] ?? 'Answer'}
            {q.required ? '' : ' · Optional'}
          </span>
          {answered ? (
            <span className="flex items-center gap-1 text-10 font-semibold text-success">
              <Icon name="check-circle" size="var(--fs-10)" />
              Answered
            </span>
          ) : q.required && !readOnly ? (
            <span className="text-10 font-semibold text-ds-muted">Required</span>
          ) : null}
        </div>
        <p className="text-13 font-semibold leading-snug text-heading">
          {q.label}
          {q.required && !readOnly ? <span className="text-danger-text"> *</span> : null}
        </p>
        {q.description && !readOnly ? <p className="text-11 text-ds-muted">{q.description}</p> : null}
      </div>
      {readOnly ? (
        <p className={cx('flex items-center gap-2 rounded-lg bg-sunken px-3 py-2 text-12', answered ? 'font-semibold text-heading' : 'text-ds-muted')}>
          {q.type === 'file_upload' && answered ? <Icon name="paperclip" size="sm" className="text-ds-muted" /> : null}
          {answered ? answerText(q, value) : 'Skipped'}
        </p>
      ) : (
        <Input q={q} value={value} onChange={onChange} disabled={disabled} onUpload={onUpload} api={api} response={response} answers={answers} onBusy={setBusy} />
      )}
      {shownError ? (
        <p role="alert" className="flex items-center gap-1.5 text-11 font-medium text-danger-text">
          <Icon name="exclamation-circle" size="var(--fs-12)" />
          {shownError}
        </p>
      ) : null}
    </Card>
  );
}
