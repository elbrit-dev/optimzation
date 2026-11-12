'use client';

/* Pieces both survey screens share — SurveyHome (strip + survey in place)
   and SurveyPage (one survey on its own page). */

import { Button, Icon, Sheet } from '@/design-system';

/* The task page's top bar — Secondary Entry's header: a bare chevron flush
   with the content edge (no box; lighter on hover, brand on press), the
   title beside it. A form's title leads with its survey, "S2 › D1". */
export function PageHeader({ onBack, backLabel, title, parent }) {
  return (
    <header className="flex items-center gap-2">
      <button
        type="button"
        onClick={onBack}
        aria-label={backLabel}
        className="flex shrink-0 items-center text-heading transition-colors hover:text-brand-hover active:text-brand"
      >
        <Icon name="chevron-left" />
      </button>
      <h1 className="flex min-w-0 flex-1 items-baseline gap-1.5 text-16 font-semibold text-heading @2xl/survey:text-20">
        {parent ? (
          <>
            <span className="shrink-0 font-medium text-ds-muted">{parent}</span>
            <Icon name="chevron-right" size="var(--fs-10)" className="shrink-0 self-center text-ds-muted" aria-hidden="true" />
          </>
        ) : null}
        <span className="min-w-0 truncate">{title}</span>
      </h1>
    </header>
  );
}

/* The element whose scroll is the page's: the nearest scrolling ancestor,
   else the document. */
export function scroller(el) {
  for (let n = el?.parentElement; n; n = n.parentElement) {
    const o = getComputedStyle(n).overflowY;
    if ((o === 'auto' || o === 'scroll') && n.scrollHeight > n.clientHeight) return n;
  }
  return typeof document !== 'undefined' ? document.scrollingElement : null;
}

const draftKey = (user) => `elbrit.survey.drafts.${user || 'anon'}`;
export function readDrafts(user) {
  try {
    return JSON.parse(window.localStorage.getItem(draftKey(user)) || '{}') || {};
  } catch {
    return {};
  }
}
export function writeDrafts(user, drafts) {
  try {
    window.localStorage.setItem(draftKey(user), JSON.stringify(drafts));
  } catch {
    /* private window or storage blocked: drafts last this session */
  }
}

/* "Discard changes?" — asked before leaving a form with unsaved answers
   (Secondary's useUnsavedGuard drives it). */
export function DiscardChangesSheet({ open, onCancel, onConfirm }) {
  return (
    <Sheet.Root open={open} onOpenChange={(o) => !o && onCancel()} desktop="dialog">
      <Sheet.Popup surface="app">
        <Sheet.Header>
          <Sheet.Title>Discard changes?</Sheet.Title>
          <Sheet.Close />
        </Sheet.Header>
        <Sheet.Body>
          <p className="text-sm text-ds-secondary">Your answers are not saved. Save a draft to keep them, or leave without saving.</p>
        </Sheet.Body>
        <Sheet.Footer>
          <div className="flex justify-end gap-2">
            <Button type="default" size="app" onClick={onCancel}>
              Keep editing
            </Button>
            <Button type="primary" size="app" danger onClick={onConfirm}>
              Discard
            </Button>
          </div>
        </Sheet.Footer>
      </Sheet.Popup>
    </Sheet.Root>
  );
}
