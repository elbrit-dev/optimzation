'use client';

import { useRef, useState } from 'react';
import { Card, Icon, ProgressBar, cx } from '@/design-system';
import { answerText, fileProblem, fileRules, isEmpty, scaleRange } from '../data/shape';

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
};

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
      onUpload(file, (p) => setUps((u) => u.map((x) => (x.id === id ? { ...x, progress: p } : x))))
        .then((res) => {
          setUps((u) => u.filter((x) => x.id !== id));
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
        <div key={f.url} className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-12">
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
      ))}
    </div>
  );
}

function Input({ q, value, onChange, disabled, onUpload }) {
  switch (q.type) {
    case 'paragraph':
      return <textarea aria-label={q.label} rows={3} value={value ?? ''} disabled={disabled} placeholder="Your answer…" onChange={(e) => onChange(e.target.value)} className={cx(FIELD, 'w-full resize-y')} />;
    case 'number':
      return <input aria-label={q.label} type="text" inputMode="decimal" value={value ?? ''} disabled={disabled} placeholder="0" onChange={(e) => onChange(e.target.value)} className={cx(FIELD, 'h-10 w-40 tabular-nums')} />;
    case 'date':
      return <input aria-label={q.label} type="date" value={value ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value || null)} className={cx(FIELD, 'h-10 w-48')} />;
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
      return <input aria-label={q.label} type="text" value={value ?? ''} disabled={disabled} placeholder="Your answer…" onChange={(e) => onChange(e.target.value)} className={cx(FIELD, 'h-10 w-full')} />;
  }
}

export function QuestionCard({ q, index, value, onChange, onUpload, error, readOnly = false, disabled = false }) {
  const answered = !isEmpty(value);
  return (
    <Card variant="hairline" className={cx('flex scroll-mt-20 flex-col gap-3', error && 'border-danger-border')} data-question={q.id}>
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
        <Input q={q} value={value} onChange={onChange} disabled={disabled} onUpload={onUpload} />
      )}
      {error ? (
        <p role="alert" className="flex items-center gap-1.5 text-11 font-medium text-danger-text">
          <Icon name="exclamation-circle" size="var(--fs-12)" />
          {error}
        </p>
      ) : null}
    </Card>
  );
}
