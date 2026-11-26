'use client';

/* Pieces both survey screens share — SurveyHome (strip + survey in place)
   and SurveyPage (one survey on its own page). */

import { Button, Icon, Sheet } from '@/design-system';

/* The task page's top bar — Secondary Entry's header: a bare chevron flush
   with the content edge (no box; lighter on hover, brand on press), the
   title beside it. A form's title leads with its survey, "S2 › D1". */
export function PageHeader({ onBack, backLabel, title, parent, sub }) {
  /* 26 Nov 2026 · a form: the doctor's / record's name, the survey's under it (`sub`) — not "Doctor › Dr A" */
  if (sub) {
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
        <div className="flex min-w-0 flex-1 flex-col">
          <h1 className="min-w-0 truncate text-16 font-semibold text-heading @2xl/survey:text-20">{title}</h1>
          <p className="min-w-0 truncate text-11 text-ds-muted">{sub}</p>
        </div>
      </header>
    );
  }
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
            <span className="min-w-0 max-w-[45%] shrink-0 truncate font-medium text-ds-muted">{parent}</span>
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
  for (let n = el; n; n = n.parentElement) {   // the page itself first: it scrolls inside the Elbrit frame
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

/* "Leave this form?" — asked before leaving a form with unsaved answers.
   Save for later keeps them on this device (as the form's Save for later
   does) and leaves; Discard leaves without them; Keep editing stays. */
export function DiscardChangesSheet({ open, onCancel, onConfirm, onSave }) {
  return (
    <Sheet.Root open={open} onOpenChange={(o) => !o && onCancel()} desktop="dialog">
      <Sheet.Popup surface="app">
        <Sheet.Header>
          <Sheet.Title>Leave this form?</Sheet.Title>
          <Sheet.Close />
        </Sheet.Header>
        <Sheet.Body>
          <p className="text-sm text-ds-secondary">Your answers aren’t sent yet.</p>
        </Sheet.Body>
        <Sheet.Footer>
          <div className="flex flex-col gap-2">
            <Button type="primary" size="app" block onClick={onSave}>
              Save for later
            </Button>
            <Button type="default" size="app" block danger onClick={onConfirm}>
              Discard
            </Button>
            <Button type="default" size="app" block onClick={onCancel}>
              Keep editing
            </Button>
          </div>
        </Sheet.Footer>
      </Sheet.Popup>
    </Sheet.Root>
  );
}
