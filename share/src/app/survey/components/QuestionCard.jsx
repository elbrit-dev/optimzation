'use client';

import { useEffect, useRef, useState } from 'react';
import { Card, Icon, ProgressBar, cx } from '@/design-system';
import { LOGIN_EXCEPTIONS, TIMING_DAYS, aiFlags, answerProblem, answerText, fileProblem, fileRules, isAnswered, isEmpty, loginExceptions, mapIsPoint, mapParseLatLng, repeatList, repeatNoun, scaleRange, timingDayError } from '../data/shape';
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

/* 27 Nov 2026 · Survey Studio's own names for the answer types (the artifact's "Q1 · Location") */
const STUDIO_LABEL = { location: 'Location', text: 'Short', number: 'Number', single: 'Single', multi: 'Multiple', yesno: 'Yes', rating: 'Rating', photo: 'Photo', date: 'Date', file: 'File', group: 'Repeated' };
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
  repeat: 'Repeated',
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
/* 26 Nov 2026 · "Any exceptions?" (required): No exceptions / OTP required / Mail required / Other (+ a note).
   OTP / Mail / Other count as the reason when the login isn't verified. Answer adds exceptions: [..]. */
function LoginInput({ q, value, onChange, disabled, api, response, onBusy }) {
  const v = value && typeof value === 'object' ? value : {};
  const [busy, setBusy] = useState(false);
  const ready = String(v.url ?? '').trim() && String(v.login ?? '').trim() && String(v.password ?? '').trim();
  const set = (k, x) => {
    const next = { url: v.url ?? '', login: v.login ?? '', password: v.password ?? '', reason: v.reason ?? '', exceptions: loginExceptions(v), [k]: x };
    if (k !== 'reason' && k !== 'exceptions') delete next.test;
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
  const exc = loginExceptions(v);
  const other = exc.includes('Other');
  const bad = !!t && t.result !== 'verified';
  const needNote = other || (bad && !exc.some((x) => x !== 'No exceptions'));
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
      {disabled ? null : (
        <div className="flex flex-col gap-1.5 text-11 font-semibold text-ds-muted" role="group" aria-label="Any exceptions">
          <span>
            Any exceptions? <span className="uppercase text-danger-text">required</span>
          </span>
          <span className="flex flex-wrap gap-1.5">
            {LOGIN_EXCEPTIONS.map((c) => {
              const on = exc.includes(c);
              return (
                <button
                  key={c}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set('exceptions', on ? exc.filter((x) => x !== c) : c === 'No exceptions' ? [c] : exc.filter((x) => x !== 'No exceptions').concat(c))}
                  className={cx('flex min-h-10 items-center gap-1 rounded-full border px-3 text-12 font-semibold', on ? 'border-brand bg-brand-tint-weak text-brand-text' : 'border-line bg-surface text-body')}
                >
                  {on ? <Icon name="check" size="var(--fs-11)" /> : null}
                  {c}
                </button>
              );
            })}
          </span>
        </div>
      )}
      {!disabled && (other || bad || String(v.reason ?? '').trim()) ? (
        <label className="flex flex-col gap-1.5 text-11 font-semibold text-ds-muted">
          <span>
            {other ? 'The other exception' : bad ? 'Why isn’t it verified?' : 'Note'}{' '}
            {needNote ? <span className="uppercase text-danger-text">required</span> : <span className="font-normal">(optional)</span>}
          </span>
          <textarea
            rows={3}
            maxLength={1000}
            value={v.reason ?? ''}
            onChange={(e) => set('reason', e.target.value)}
            placeholder={other ? 'e.g. works only on the office computer' : 'e.g. OTP goes to the distributor’s phone; the details were confirmed with him'}
            className={cx(FIELD, 'w-full resize-y text-13 font-normal')}
          />
        </label>
      ) : null}
    </div>
  );
}

/* 25 Nov 2026 · Visiting timings (as the ERP's My Surveys): linked to the Map location question before it (q.of).
   Once that question has a place, its REGULAR weekly hours load from Google (survey_places mode=hours) and fill
   Monday … Sunday; the BE keeps or edits them (up to 3 timings a day, or Closed / Not available). A day Google shows
   as 24 hours must be edited; end before start and overlapping timings are red until fixed. */
/* 26 Nov 2026 · a Separated map question (a list of places): one timetable per chosen place; the answer is the list */
function TimingsInput({ q, value, onChange, disabled, api, answers, showErrors = false }) {
  const m = answers?.[q.of];
  const listRef = useRef([]);
  listRef.current = Array.isArray(value) ? value : [];
  if (!Array.isArray(m)) return <TimingsOne q={q} mapAns={m} value={value} onChange={onChange} disabled={disabled} api={api} showErrors={showErrors} />;
  const P = m.filter((p) => p?.place_id);
  if (!P.length) {
    return (
      <p className="flex items-center gap-2 rounded-lg bg-sunken px-3 py-3 text-12 text-ds-muted">
        <Icon name="info-circle" size="sm" />
        Choose the places in the map question above first.
      </p>
    );
  }
  /* each place's timings in the places' order — read from a ref, so two loading at once don't undo each other */
  const setOne = (pid, one) => {
    const cur = listRef.current;
    const next = P.map((p) => (p.place_id === pid ? one : cur.find((x) => x?.place_id === p.place_id))).filter(Boolean);
    listRef.current = next;
    onChange(next);
  };
  return (
    <div className="flex flex-col gap-4">
      {P.map((p, i) => (
        <div key={p.place_id} className="flex flex-col gap-1.5">
          {P.length > 1 ? <span className="text-11 font-semibold uppercase tracking-wide text-ds-muted">Place {i + 1} of {P.length}</span> : null}
          <TimingsOne q={q} mapAns={p} value={listRef.current.find((x) => x?.place_id === p.place_id) ?? null} onChange={(one) => setOne(p.place_id, one)} disabled={disabled} api={api} showErrors={showErrors} />
        </div>
      ))}
    </div>
  );
}
function TimingsOne({ q, mapAns, value, onChange, disabled, api, showErrors = false }) {
  /* 27 Nov 2026 · a day's problem shows once that day is touched, or after Submit was tried — not before */
  const [touched, setTouched] = useState({});
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
        const er = touched[d] || showErrors ? timingDayError(v, d) : '';
        return (
          <div key={d} onChangeCapture={() => !touched[d] && setTouched((t) => ({ ...t, [d]: true }))} className={cx('flex flex-col gap-2 rounded-lg border px-3 py-2.5', er ? 'border-danger-border bg-danger-wash' : 'border-line bg-surface')}>
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
/* 28 Nov 2026 · every AI-read upload, in every survey: what was read is shown under the file and the rep can correct
   any value or line (no reason needed; a changed cell is marked, the AI's original stays with the file). The AI check's
   flags (lines that aren't Elbrit, a check that didn't pass, something not found) are listed under it with "Why?",
   which is required while any flag is there. Only Elbrit lines are shown when the lines were matched to Elbrit. */
/* the reader's own notes (the Elbrit summary, failed parts) are not values to show or correct */
const hideReadKey = (k) => k.startsWith('_') || k === 'elbrit_summary' || k === 'parts_failed';
const readWord = (k) => String(k).replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
const showVal = (v) => (v === true ? 'Yes' : v === false ? 'No' : v == null ? '' : String(v));
const inr = (n) => `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
function AiCheck({ f, disabled, onPatch }) {
  const ai = f.ai || {};
  const fields = ai.fields && typeof ai.fields === 'object' ? ai.fields : null;
  if (!fields) return null;
  const flags = aiFlags(f);
  const el = fields.elbrit_summary && typeof fields.elbrit_summary === 'object' ? fields.elbrit_summary : null;
  const values = Object.entries(fields).filter(([k, v]) => !hideReadKey(k) && !/^check_/.test(k) && !Array.isArray(v) && (v == null || typeof v !== 'object'));
  const lists = Object.entries(fields).filter(([k, v]) => !hideReadKey(k) && Array.isArray(v) && v.length && v.every((x) => x && typeof x === 'object'));
  const was = (k, i, c) => (i == null ? ai.orig?.[k] : ai.orig?.[k]?.[i]?.[c]);
  const changed = (k, i, c) => !!ai.orig && String(was(k, i, c) ?? '') !== String((i == null ? fields[k] : fields[k]?.[i]?.[c]) ?? '');
  const setField = (k, val) => onPatch((a) => ({ ...a, fields: { ...a.fields, [k]: val } }));
  const setCell = (k, i, c, val) => onPatch((a) => ({ ...a, fields: { ...a.fields, [k]: a.fields[k].map((r, j) => (j === i ? { ...r, [c]: val } : r)) } }));
  return (
    <div className="flex flex-col gap-2 rounded-md bg-sunken px-2.5 py-2">
      {values.length ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-10 font-semibold uppercase tracking-wide text-ds-muted">{disabled ? 'We read' : 'We read · correct anything wrong'}</span>
          {values.slice(0, 20).map(([k, v]) => (
            <label key={k} className="flex items-center gap-2 text-12">
              <span className="w-28 shrink-0 text-ds-muted">{readWord(k)}</span>
              {disabled ? (
                <span className="min-w-0 flex-1 break-words font-semibold text-heading">{showVal(v) || '—'}</span>
              ) : (
                <input type="text" aria-label={readWord(k)} value={showVal(v)} onChange={(e) => setField(k, e.target.value)} className={cx('h-8 min-w-0 flex-1 rounded-md border bg-surface px-2 text-12 text-heading', changed(k) ? 'border-brand' : 'border-line-strong')} />
              )}
            </label>
          ))}
        </div>
      ) : null}
      {lists.map(([k, all]) => {
        const idx = all.map((r, i) => i).filter((i) => !el || all[i].elbrit_product);
        const cols = [...new Set(idx.flatMap((i) => Object.keys(all[i])))].filter((c) => c !== 'elbrit_product').slice(0, 7);
        return (
          <div key={k} className="flex flex-col gap-1">
            <span className="text-10 font-semibold uppercase tracking-wide text-ds-muted">
              {el ? `Elbrit lines · ${idx.length} of ${all.length}${el.value != null ? ` · ${inr(el.value)}` : ''}` : `${all.length} ${all.length === 1 ? 'line' : 'lines'} read`}
            </span>
            {idx.length ? (
              <div className="overflow-x-auto rounded-md border border-line bg-surface">
                <table className="w-full text-11">
                  <thead>
                    <tr>
                      {el ? <th className="whitespace-nowrap px-2 py-1 text-left font-medium text-ds-muted">Elbrit product</th> : null}
                      {cols.map((c) => <th key={c} className="whitespace-nowrap px-2 py-1 text-left font-medium text-ds-muted">{readWord(c)}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {idx.slice(0, 80).map((i) => (
                      <tr key={i} className="border-t border-line">
                        {el ? <td className="whitespace-nowrap px-2 py-1 font-semibold text-heading">{all[i].elbrit_product}</td> : null}
                        {cols.map((c) => (
                          <td key={c} className="px-1 py-0.5">
                            {disabled ? (
                              <span className="px-1 text-heading">{all[i][c] == null ? '' : String(all[i][c])}</span>
                            ) : (
                              <input
                                aria-label={`${readWord(c)}, line ${i + 1}`}
                                value={all[i][c] == null ? '' : String(all[i][c])}
                                onChange={(e) => setCell(k, i, c, e.target.value)}
                                className={cx('h-7 w-full min-w-[56px] rounded border bg-surface px-1 text-11 text-heading', changed(k, i, c) ? 'border-brand' : 'border-line')}
                              />
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        );
      })}
      {flags.length ? (
        <div className="flex flex-col gap-1.5">
          <div role="alert" className="flex flex-col gap-0.5 rounded-md border border-warning bg-warning-wash px-2.5 py-1.5">
            <span className="text-10 font-semibold uppercase tracking-wide text-warning-text">Flagged by the AI check</span>
            {flags.map((x) => (
              <span key={x} className="text-12 text-heading">✕ {x}</span>
            ))}
          </div>
          <label className="flex flex-col gap-1 text-12">
            <span className="font-semibold text-heading">
              Why? <span className="text-danger-text">*</span>
            </span>
            {disabled ? (
              <span className="text-heading">{ai.reason || '—'}</span>
            ) : (
              <textarea
                value={ai.reason ?? ''}
                rows={3}
                onChange={(e) => onPatch((a) => ({ ...a, reason: e.target.value }))}
                placeholder="Say why, e.g. other companies' lines on the same statement"
                className={cx('min-h-[64px] w-full rounded-md border bg-surface px-2 py-1.5 text-12 text-heading', String(ai.reason ?? '').trim() ? 'border-line-strong' : 'border-danger-border')}
              />
            )}
          </label>
        </div>
      ) : null}
    </div>
  );
}

/* 28 Nov 2026 · pharmacy mapping: after the pharmacy, the rep chooses the distributor that serves it — those with the
   pharmacy's PIN first, then the HQ's (distributors have no map point in the ERP); "Not sure / another one" is allowed */
function ServingPicker({ value, onChange, disabled, api, response }) {
  const pin = (String(value?.address || '').match(/\b\d{6}\b/) || [''])[0];
  const [list, setList] = useState(null);
  useEffect(() => {
    let gone = false;
    if (disabled || typeof api?.servingDistributors !== 'function') return undefined;
    setList(null);
    api
      .servingDistributors({ response, pin })
      .then((r) => !gone && setList(Array.isArray(r?.items) ? r.items : []))
      .catch(() => !gone && setList([]));
    return () => {
      gone = true;
    };
  }, [api, response, pin, disabled]);
  const sv = value?.serving;
  const pick = (x) => onChange({ ...value, serving: x });
  if (disabled) return sv ? <p className="text-12 text-heading">Serving distributor: <b>{sv.none ? 'Not sure / another one' : sv.label || sv.customer}</b></p> : null;
  return (
    <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="Which distributor serves it?">
      <span className="text-13 font-semibold text-heading">
        Which distributor serves it? <span className="text-danger-text">*</span>
      </span>
      {list === null ? <span className="text-11 text-ds-muted">Finding the distributors for {pin ? `PIN ${pin}` : 'this area'}…</span> : null}
      {(list || []).map((x) => {
        const on = sv && !sv.none && sv.customer === x.customer;
        return (
          <button key={x.customer} type="button" role="radio" aria-checked={!!on} onClick={() => pick({ customer: x.customer, label: x.label, why: x.why })}
            className={cx('flex min-h-11 items-center gap-2.5 rounded-lg border px-3 py-1.5 text-left', on ? 'border-brand bg-brand-tint-weak' : 'border-line bg-surface hover:border-line-strong')}>
            <span className={cx('size-4 shrink-0 rounded-full border', on ? 'border-[5px] border-brand' : 'border-line-strong')} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-13 font-semibold text-heading">{x.label}</span>
              <span className="text-11 text-ds-muted">{[x.pin && `PIN ${x.pin}`, x.hq].filter(Boolean).join(' · ')}</span>
            </span>
            <span className="shrink-0 text-10 font-semibold text-ds-muted">{x.why}</span>
          </button>
        );
      })}
      {list !== null ? (
        <button type="button" role="radio" aria-checked={!!sv?.none} onClick={() => pick({ none: 1 })}
          className={cx('flex min-h-11 items-center gap-2.5 rounded-lg border px-3 py-1.5 text-left', sv?.none ? 'border-brand bg-brand-tint-weak' : 'border-line bg-surface hover:border-line-strong')}>
          <span className={cx('size-4 shrink-0 rounded-full border', sv?.none ? 'border-[5px] border-brand' : 'border-line-strong')} />
          <span className="text-13 text-heading">{list.length ? 'Not sure / another one' : 'No distributor found here: not sure / another one'}</span>
        </button>
      ) : null}
    </div>
  );
}

function FileUpload({ q, value, onChange, disabled, onUpload }) {
  const rules = fileRules(q);
  const files = value ?? [];
  const inputRef = useRef(null);
  const [ups, setUps] = useState([]); // { id, name, size, progress, error }
  /* 23 Nov 2026: a file the AI could not read (blurry, dark, cut off): { url: reason }.
     The only thing the rep is ever told about the AI read. */
  const [unread, setUnread] = useState({});
  /* 26 Nov 2026: files the AI is still reading ({ url: true }) — the file is already in the answer */
  const [reading, setReading] = useState({});
  /* a one-file question: Replace swaps the file (the box no longer just disappears) */
  const replaceRef = useRef(false);
  const busy = ups.some((u) => !u.error);
  const room = rules.maxFiles - files.length - ups.filter((u) => !u.error).length;
  const valueRef = useRef(files);
  valueRef.current = files;

  const start = (list, replace) => {
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
          const added = { url: res.file_url, name: res.file_name, size: res.file_size };
          onChange(replace ? [added] : [...valueRef.current, added]);
          if (res.reading && typeof res.reading.then === 'function') {
            setReading((m) => ({ ...m, [res.file_url]: true }));
            res.reading.then((read) => {
              setReading((m) => {
                const n = { ...m };
                delete n[res.file_url];
                return n;
              });
              if (read && read.readable === false) setUnread((m) => ({ ...m, [res.file_url]: read.reason || 'The file could not be read.' }));
              /* 26 Nov 2026 · Survey Studio: this file's verdict (Redo blocks Submit) and, with "check on the phone", what was read */
              if (read && (read.state || read.fields)) {
                const ai = { state: read.state || '', why: read.why || '', redo: read.redo ? 1 : 0, ...(read.fields ? { fields: read.fields, orig: JSON.parse(JSON.stringify(read.fields)) } : {}) };
                onChange(valueRef.current.map((x) => (x.url === res.file_url ? { ...x, ai } : x)));
              }
            });
          }
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
            <Icon name={q.camera ? 'camera' : 'upload'} size="sm" />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="text-15 font-semibold text-heading">{q.camera ? (files.length ? 'Take another photo' : 'Take a photo') : files.length ? 'Add another file' : 'Attach a file'}</span>
            <span className="text-11 text-ds-muted">
              {rules.label} · up to {rules.maxMb} MB{rules.maxFiles > 1 ? ` · up to ${rules.maxFiles} files` : ''}
            </span>
          </span>
        </button>
      ) : rules.maxFiles === 1 && files.length === 1 && !busy && !disabled ? (
        <button
          type="button"
          onClick={() => {
            replaceRef.current = true;
            inputRef.current?.click();
          }}
          className="flex items-center gap-1.5 self-start rounded-lg border border-line bg-surface px-3 py-2 text-12 font-semibold text-brand-text hover:border-brand"
        >
          <Icon name="refresh" size="sm" />
          Replace the file
        </button>
      ) : null}
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={q.camera ? 'image/*' : rules.exts.length ? rules.exts.map((e) => `.${e}`).join(',') : undefined}
        capture={q.camera ? 'environment' : undefined}
        multiple={room > 1}
        aria-label={q.label}
        onChange={(e) => {
          const replace = replaceRef.current;
          replaceRef.current = false;
          const list = [...(e.target.files ?? [])].slice(0, replace ? 1 : Math.max(room, 0));
          e.target.value = '';
          start(list, replace);
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
          {reading[f.url] ? (
            <p role="status" className="flex items-center gap-1.5 text-11 text-ds-muted">
              <Icon name="spinner pi-spin" size="sm" className="shrink-0" />
              <span>Uploaded · checking the file… (you can carry on)</span>
            </p>
          ) : null}
          {f.ai?.redo ? (
            <p role="alert" className="flex items-start gap-1.5 text-11 font-medium text-danger-text">
              <Icon name="exclamation-circle" size="sm" className="mt-px shrink-0" />
              <span>Not clear{f.ai.why ? ` — ${f.ai.why}` : ''}. Remove it and upload it again.</span>
            </p>
          ) : f.ai?.state === 'clear' && !aiFlags(f).length ? (
            <p role="status" className="flex items-center gap-1.5 text-11 font-medium text-success">
              <Icon name="check-circle" size="sm" className="shrink-0" />
              Checked — it looks right.
            </p>
          ) : null}
          {f.ai?.fields && Object.keys(f.ai.fields).length ? (
            <AiCheck f={f} disabled={disabled} onPatch={(fn) => onChange(valueRef.current.map((x) => (x.url === f.url ? { ...x, ai: fn(x.ai || {}) } : x)))} />
          ) : null}
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

function Input({ q, value, onChange, disabled, onUpload, api, response, answers, onBusy, showErrors = false }) {
  switch (q.type) {
    case 'map_location':
      return (
        <>
          <MapLocation q={q} value={value} onChange={onChange} disabled={disabled} api={api} response={response} />
          {q.serving && q.places === 'pharmacy' && mapIsPoint(value) ? <ServingPicker value={value} onChange={onChange} disabled={disabled} api={api} response={response} /> : null}
        </>
      );
    case 'paragraph':
      return <textarea aria-label={q.label} rows={3} value={value ?? ''} disabled={disabled} placeholder="Your answer…" onChange={(e) => onChange(e.target.value)} className={cx(FIELD, 'w-full resize-y')} />;
    case 'number':
      return <input aria-label={q.label} type="text" inputMode="decimal" value={value ?? ''} disabled={disabled} placeholder="0" onChange={(e) => onChange(e.target.value)} className={cx(FIELD, 'h-10 w-40 tabular-nums')} />;
    case 'date':
      return <DateInput q={q} value={value} onChange={onChange} disabled={disabled} />;
    case 'timings':
      return <TimingsInput q={q} value={value} onChange={onChange} disabled={disabled} api={api} answers={answers} showErrors={showErrors} />;
    case 'login':
      return <LoginInput q={q} value={value} onChange={onChange} disabled={disabled} api={api} response={response} onBusy={onBusy} />;
    case 'time':
      return <TimeInput q={q} value={value} onChange={onChange} disabled={disabled} />;
    case 'days':
      return <Choices q={{ ...q, options: q.options?.length ? q.options : WEEK }} value={value} onChange={onChange} disabled={disabled} multi />;
    case 'multiple_choice':
      if (q.studio_type === 'yesno') return <YesNo q={q} value={value} onChange={onChange} disabled={disabled} />;
      return <Choices q={q} value={value} onChange={onChange} disabled={disabled} />;
    case 'checkboxes':
      return <Choices q={q} value={value} onChange={onChange} disabled={disabled} multi />;
    case 'dropdown':
      return <Dropdown q={q} value={value} onChange={onChange} disabled={disabled} />;
    case 'linear_scale':
      return <Scale q={q} value={value} onChange={onChange} disabled={disabled} />;
    case 'rating':
      if (q.studio_type === 'rating') return <Rate5 q={q} value={value} onChange={onChange} disabled={disabled} />;
      return <Stars q={q} value={value} onChange={onChange} disabled={disabled} />;
    case 'file_upload':
      return <FileUpload q={q} value={value} onChange={onChange} disabled={disabled} onUpload={onUpload} />;
    case 'repeat':
      return <RepeatInput q={q} value={value} onChange={onChange} disabled={disabled} onUpload={onUpload} api={api} response={response} showErrors={showErrors} />;
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

/* 27 Nov 2026 · Repeated group: one small card per entry, each asking the group's questions (q.fields) with the
   usual controls; "+ <button text>" under the last one adds an empty entry, ✕ takes one off. It opens with one
   empty entry so the rep just starts filling. */
function RepeatInput({ q, value: raw, onChange, disabled, onUpload, api, response, showErrors = false }) {
  const value = repeatList(q, raw);
  /* 27 Nov 2026 · it starts with ONE entry; "+ Add another …" is always there and adds an empty entry, even before
     the first is answered. The answered entries come first, then the empty ones added on this screen; empty entries
     are never saved (an old draft's empty ones are not shown again). */
  const filled = (Array.isArray(value) ? value : []).filter((r) => r && typeof r === 'object' && Object.values(r).some((x) => !isEmpty(x)));
  const [blanks, setBlanks] = useState(0);
  const nb = filled.length ? blanks : Math.max(1, blanks);
  const rows = [...filled, ...Array.from({ length: nb }, () => ({}))];
  const noun = repeatNoun(q);
  const Noun = noun.charAt(0).toUpperCase() + noun.slice(1);
  const max = Number(q.max) || 50;
  const kids = q.fields ?? [];
  /* 27 Nov 2026 · one entry open at a time (its questions, its map); the others are one line each — tap to edit */
  const [open, setOpen] = useState(() => rows.length - 1);
  const openI = Math.min(open, rows.length - 1);
  const hasAny = (r) => Object.values(r).some((x) => !isEmpty(x));
  const setOne = (i, id, v) => {
    const row = { ...rows[i], [id]: v };
    const keep = filled.filter((_, j) => j !== i);
    if (i >= filled.length && hasAny(row)) {
      /* an empty entry gets its first answer: it joins the answered ones (kept open) */
      setBlanks(Math.max(0, nb - 1));
      setOpen(filled.length);
      onChange([...filled, row]);
    } else if (i < filled.length && !hasAny(row)) {
      /* an answered entry is cleared: it stays on screen as an empty one (kept open) */
      setBlanks(nb + 1);
      setOpen(keep.length + nb);
      onChange(keep.length ? keep : null);
    } else if (i < filled.length) onChange(filled.map((r, j) => (j === i ? row : r)));
  };
  const drop = (i) => {
    const next = i < filled.length ? filled.filter((_, j) => j !== i) : filled;
    if (i >= filled.length) setBlanks(Math.max(0, nb - 1));
    setOpen(Math.max(0, Math.min(open > i ? open - 1 : open, rows.length - 2)));
    onChange(next.length ? next : null);
  };
  /* a photo / file (read by the AI) and a map get "<group id>.<question id>", so their reads and map keep apart */
  const kidQ = (k) => (k.type === 'file_upload' || k.type === 'map_location' ? { ...k, id: `${q.id}.${k.id}` } : k);
  const summary = (r) => kids.map((k) => (isEmpty(r[k.id]) ? '' : answerText(k, r[k.id]).split('\n')[0])).filter(Boolean).join(' · ');
  const problemOf = (r) => kids.map((k) => answerProblem(k, r[k.id])).find(Boolean) || null;
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((r, i) =>
        i !== openI && !disabled ? (
          <div key={i} className={cx('flex items-center gap-2 rounded-[10px] border bg-sunken px-3 py-2', showErrors && problemOf(r) ? 'border-danger-border' : 'border-line')}>
            <button type="button" onClick={() => setOpen(i)} className="flex min-h-10 min-w-0 flex-1 flex-col items-start justify-center text-left">
              <span className="text-13 font-semibold text-heading">
                {Noun} {i + 1}
              </span>
              <span className={cx('w-full truncate text-12', showErrors && problemOf(r) ? 'text-danger-text' : 'text-ds-muted')}>
                {showErrors && problemOf(r) ? problemOf(r) : summary(r) || 'Not filled yet'}
              </span>
            </button>
            <button type="button" aria-label={`Edit ${noun} ${i + 1}`} onClick={() => setOpen(i)} className="flex size-10 shrink-0 items-center justify-center rounded-md text-ds-muted hover:bg-surface">
              <Icon name="pencil" size="sm" />
            </button>
            <button type="button" aria-label={`Remove ${noun} ${i + 1}`} onClick={() => drop(i)} className="-mr-1.5 flex size-10 shrink-0 items-center justify-center rounded-md text-ds-muted hover:bg-surface">
              <Icon name="times" size="sm" />
            </button>
          </div>
        ) : (
        <div key={i} className="flex flex-col gap-2.5 rounded-[10px] border border-line bg-sunken p-3" role="group" aria-label={`${Noun} ${i + 1}`}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-13 font-semibold text-heading">
              {Noun} {i + 1}
            </span>
            {disabled || (rows.length < 2 && !Object.values(r).some((x) => !isEmpty(x))) ? null : (
              <button type="button" aria-label={`Remove ${noun} ${i + 1}`} onClick={() => drop(i)} className="-m-1.5 flex size-10 items-center justify-center rounded-md text-ds-muted hover:bg-surface">
                <Icon name="times" size="sm" />
              </button>
            )}
          </div>
          {kids.map((k) => {
            const p = showErrors ? answerProblem(k, r[k.id]) : null;
            return (
              <div key={k.id} className="flex flex-col gap-1.5">
                {/* one question in the group: the entry title already names it ("Hospital or clinic 1") */}
                {kids.length > 1 ? (
                  <span className="text-13 font-medium text-heading">
                    {k.label}
                    {k.required ? <span className="text-danger-text"> *</span> : null}
                  </span>
                ) : null}
                <Input q={kidQ(k)} value={r[k.id]} onChange={(v) => setOne(i, k.id, v)} disabled={disabled} onUpload={onUpload} api={api} response={response} />
                {p ? <span className="text-11 font-medium text-danger-text">{p}</span> : null}
              </div>
            );
          })}
        </div>
        ),
      )}
      {disabled || rows.length >= max ? null : (
        <button
          type="button"
          onClick={() => {
            setOpen(rows.length);
            setBlanks(nb + 1);
          }}
          className="flex h-10 items-center gap-1.5 self-start rounded-lg border border-dashed border-brand px-3 text-13 font-semibold text-brand-text hover:bg-brand-tint-weak"
        >
          <Icon name="plus" size="sm" />
          {q.button || 'Add another'}
        </button>
      )}
    </div>
  );
}

/* 26 Nov 2026 · Survey Studio "Show from ERP": saved data of the record to read and check against — nothing to answer */
/* 28 Nov 2026 · a saved location (the Lead's "Latitude and Longitude" is kept as {"x": lat, "y": lng}) is shown as
   "26.776763, 82.178278" with a link to the map, not as the raw value */
function erpPoint(f) {
  const v = String(f?.value ?? '').trim();
  if (!v || !(v.startsWith('{') || /lat|long|location|geo/i.test(`${f.label || ''} ${f.tag || ''}`))) return null;
  return mapParseLatLng(v);
}

function ErpInfoCard({ q }) {
  const fields = (q.fields ?? []).filter((f) => f && f.label);
  return (
    <Card variant="hairline" className="flex flex-col gap-2 bg-sunken" data-question={q.id}>
      <div className="flex items-center justify-between gap-3 text-10 font-semibold uppercase tracking-wide text-ds-muted">
        <span>From ERP</span>
        <span>Read only</span>
      </div>
      <p className="text-13 font-semibold leading-snug text-heading">{q.label}</p>
      {fields.length ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-12">
          {fields.map((f) => (
            <div key={f.tag} className="contents">
              <dt className="text-ds-muted">{f.label}</dt>
              <dd className="min-w-0 break-words font-semibold text-heading">
                {erpPoint(f) ? (
                  <a href={`https://www.google.com/maps?q=${erpPoint(f).lat},${erpPoint(f).lng}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand-text underline-offset-2 hover:underline">
                    <Icon name="map-marker" size="sm" />
                    {erpPoint(f).lat.toFixed(6)}, {erpPoint(f).lng.toFixed(6)}
                  </a>
                ) : f.value && f.value !== '—' ? (
                  f.value
                ) : (
                  <span className="font-normal text-ds-muted">Not on record</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {q.description ? <p className="text-11 text-ds-muted">{q.description}</p> : null}
    </Card>
  );
}

/* 27 Nov 2026 · Survey Studio: Yes / No as two tiles, and Rating 1 to 5 as numbered circles (the artifact's controls) */
function YesNo({ q, value, onChange, disabled }) {
  return (
    <div className="grid grid-cols-2 gap-2.5" role="radiogroup" aria-label={q.label}>
      {['Yes', 'No'].map((o) => (
        <button key={o} type="button" role="radio" aria-checked={value === o} disabled={disabled} onClick={() => onChange(value === o ? '' : o)}
          className={cx('flex h-12 items-center justify-center rounded-[10px] border text-15 font-semibold transition-colors', value === o ? 'border-brand bg-brand-tint-weak text-brand-text' : 'border-line bg-surface text-heading hover:bg-sunken')}>
          {o}
        </button>
      ))}
    </div>
  );
}
function Rate5({ q, value, onChange, disabled }) {
  return (
    <div className="flex gap-2" role="radiogroup" aria-label={q.label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={Number(value) === n} aria-label={`${n} of 5`} disabled={disabled} onClick={() => onChange(Number(value) === n ? '' : n)}
          className={cx('flex size-10 items-center justify-center rounded-full border-[1.5px] text-14 font-semibold transition-colors', Number(value) === n ? 'border-brand bg-brand text-on-brand' : 'border-line-strong text-ds-secondary hover:bg-sunken')}>
          {n}
        </button>
      ))}
    </div>
  );
}

/* 28 Nov 2026 · the "We read this automatically: …" line under a photo / file question is gone (the user: too much
   text); what was read still shows after the upload ("We read · check and correct") */

export function QuestionCard(props) {
  if (props.q.type === 'erp_info') return <ErpInfoCard q={props.q} />;
  return <AnswerCard {...props} />;
}

function AnswerCard({ q, index, value, onChange, onUpload, api, response, answers, error, readOnly = false, disabled = false }) {
  const answered = isAnswered(q, value);
  /* 27 Nov 2026 · Survey Studio (the artifact's phone): a short text / number's help sits under its box; a map's
     help that only repeats where the map starts is left out (the map's own tile says it, right for this doctor) */
  const helpBelow = (q.studio_type === 'text' || q.studio_type === 'number') && Boolean(q.description);
  const helpRepeats = q.type === 'map_location' && /^\s*the map starts at/i.test(q.description || '');
  const [busy, setBusy] = useState(false);
  const shownError = busy ? null : error;
  return (
    <Card variant="hairline" className={cx('flex scroll-mt-20 flex-col gap-3 rounded-xl p-4', shownError && 'border-danger-border')} data-question={q.id}>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-11 font-medium uppercase tracking-[0.06em] text-ds-muted">
            Q{index + 1} · {(q.studio_type && STUDIO_LABEL[q.studio_type]) || TYPE_LABEL[q.type] || 'Answer'}
            {q.required || q.studio_type ? '' : ' · Optional'}
          </span>
          {answered ? (
            <span className="flex items-center gap-1 text-10 font-semibold text-success">
              <Icon name="check-circle" size="var(--fs-10)" />
              Answered
            </span>
          ) : q.required && !readOnly ? (
            <span className="text-13 text-ds-muted">Required</span>
          ) : null}
        </div>
        <p className="text-16 font-semibold leading-[22px] text-heading">
          {q.label}
          {q.required && !readOnly ? <span className="text-danger-text"> *</span> : null}
        </p>
        {q.description && !readOnly && !helpBelow && !helpRepeats ? <p className="text-13 text-ds-muted">{q.description}</p> : null}
      </div>
      {readOnly ? (
        <p className={cx('flex items-center gap-2 whitespace-pre-line rounded-lg bg-sunken px-3 py-2 text-12', answered ? 'font-semibold text-heading' : 'text-ds-muted')}>
          {q.type === 'file_upload' && answered ? <Icon name="paperclip" size="sm" className="text-ds-muted" /> : null}
          {answered ? answerText(q, value) : 'Skipped'}
        </p>
      ) : (
        <Input q={q} value={value} onChange={onChange} disabled={disabled} onUpload={onUpload} api={api} response={response} answers={answers} onBusy={setBusy} showErrors={Boolean(error)} />
      )}
      {helpBelow && !readOnly ? <p className="-mt-1 text-13 text-ds-muted">{q.description}</p> : null}
      {shownError ? (
        <p role="alert" className="flex items-center gap-1.5 text-11 font-medium text-danger-text">
          <Icon name="exclamation-circle" size="var(--fs-12)" />
          {shownError}
        </p>
      ) : null}
    </Card>
  );
}
