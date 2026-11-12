'use client';

import { useEffect, useRef, useState } from 'react';
import { Button, Field, Icon, Sheet, cx } from '@/design-system';
import { targetOf } from '../data/shape';

/* "Add distributor" (or doctor) for a Self-tag survey — Secondary Entry's
 * AddPartySheet: search in the toolbar, a multi-select list, Cancel / Done
 * pinned in the footer.
 *
 * The list is the ERP's: survey_my_subjects (SURVEYS_CONTEXT.md §4) — the
 * doctors / distributors this rep covers, searched ON THE SERVER (a rep can
 * cover hundreds), each with its state in this survey. Ones already added
 * show as such and cannot be picked again. Done hands back the chosen
 * names; the screen starts each (survey_start_subject). */

export function AddSubjectsSheet({ open, onClose, survey, api, busy = false, error = null, onDone }) {
  const t = targetOf(survey?.target);
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [chosen, setChosen] = useState(() => new Set());
  const seq = useRef(0);

  useEffect(() => {
    if (open) {
      setChosen(new Set());
      setQuery('');
    }
  }, [open]);

  /* Ask the ERP, a beat after typing stops; only the latest answer lands. */
  useEffect(() => {
    if (!open || !survey) return undefined;
    const id = ++seq.current;
    setLoadError(null);
    const timer = setTimeout(() => {
      api
        .getMySubjects(survey.campaign, query.trim())
        .then((res) => id === seq.current && setRows(res.rows))
        .catch((e) => id === seq.current && setLoadError(e?.message || 'Could not load the list.'));
    }, query ? 250 : 0);
    return () => clearTimeout(timer);
  }, [open, survey, api, query]);

  const toggle = (name) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  return (
    <Sheet.Root open={open} onOpenChange={(next) => !next && !busy && onClose()}>
      <Sheet.Popup surface="app">
        <Sheet.Header>
          <Sheet.Title>{`Add ${t.one}`}</Sheet.Title>
          <Sheet.Description>{`The ${t.many} you cover. Pick the ones you collected from.`}</Sheet.Description>
          <Sheet.Close disabled={busy} />
        </Sheet.Header>
        <Sheet.Toolbar>
          <Field
            size="lg"
            type="search"
            placeholder={`Search ${t.one} name or code…`}
            value={query}
            onChange={setQuery}
            aria-label={`Search ${t.many}`}
            prefix={<Icon name="search" size="sm" />}
          />
        </Sheet.Toolbar>
        <Sheet.Body>
          {loadError ? (
            <p role="alert" className="py-8 text-center text-12 text-danger-text">
              {loadError}
            </p>
          ) : rows == null ? (
            <div className="flex flex-col gap-2 pt-2" aria-busy="true" aria-label="Loading">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-11 rounded-lg bg-sunken" />
              ))}
            </div>
          ) : rows.length ? (
            <ul className="flex flex-col pt-1">
              {rows.map((r) => {
                const added = r.state !== 'new';
                const on = added || chosen.has(r.name);
                return (
                  <li key={r.name}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      disabled={added || busy}
                      onClick={() => toggle(r.name)}
                      className="flex w-full items-center gap-3 border-b border-line-subtle py-2.5 text-left disabled:cursor-not-allowed"
                    >
                      <span
                        aria-hidden="true"
                        className={cx(
                          'flex size-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors',
                          added ? 'border-line bg-sunken text-ds-muted' : on ? 'border-brand bg-brand text-on-brand' : 'border-line-strong bg-surface text-transparent',
                        )}
                      >
                        <Icon name="check" size="var(--fs-10)" />
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className={cx('truncate text-13 font-semibold', added ? 'text-ds-secondary' : 'text-heading')}>{r.label}</span>
                        <span className="truncate text-11 text-ds-muted">{[r.code, r.hq?.replace(/^HQ[-\s]*/i, '')].filter(Boolean).join(' · ')}</span>
                      </span>
                      {added ? (
                        <span className="shrink-0 text-10 font-semibold text-ds-muted">{r.state === 'done' ? 'Submitted' : 'Added'}</span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="py-10 text-center text-12 text-ds-muted">{query ? `No ${t.one} matches “${query}”.` : `No ${t.many} are linked to your territory.`}</p>
          )}
        </Sheet.Body>
        <Sheet.Footer>
          {error ? (
            <p role="alert" className="flex items-start gap-2 rounded-lg bg-danger-wash px-3 py-2 text-11 text-danger-text">
              <Icon name="exclamation-circle" size="sm" className="mt-px shrink-0" />
              <span>{error}</span>
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <Button type="default" size="lg" block disabled={busy} onClick={onClose}>
              Cancel
            </Button>
            <Button type="primary" size="lg" block loading={busy} disabled={!chosen.size || busy} onClick={() => onDone([...chosen])}>
              {busy ? 'Adding…' : chosen.size ? `Done · ${chosen.size}` : 'Done'}
            </Button>
          </div>
        </Sheet.Footer>
      </Sheet.Popup>
    </Sheet.Root>
  );
}
