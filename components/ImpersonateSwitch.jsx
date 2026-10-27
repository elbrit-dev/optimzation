import { forwardRef, useImperativeHandle, useMemo, useState } from 'react';
import { Button, Field, ListRow, Sheet } from '@/design-system';
import {
  DEFAULT_DEPARTMENTS,
  DEFAULT_DESIGNATIONS,
  actorLabel,
  backToSelf,
  isAllowed,
  switchTo,
  useImpersonation,
} from './Impersonation';

/**
 * ImpersonateSwitch: the header's "Impersonate" button and the panel it
 * opens, replacing the Studio-built modal (combobox + uid + name + reason).
 *
 * The panel is the design system's Sheet: a bottom sheet on a phone (swipe
 * down or back to close), a centred popup from 768px. It holds a search over
 * `people`, a reason, and Switch. While impersonating, the button reads
 * "Viewing as <person>" and the panel leads with "Back to me", and Switch
 * stays available, so jumping from one person to the next never needs a
 * logout. The switching itself is components/Impersonation.jsx.
 *
 * It hides itself for anyone who may not switch: `me` outside the allowed
 * departments/designations, unless they are being impersonated right now.
 */

// A long list is searched, not scrolled: past this, typing narrows it.
const MAX_ROWS = 60;

const PREVIEW_TARGET = '9876543210';

function personId(p) {
  return String(p?.phone || p?.mobile_no || p?.cell_number || p?.email || p?.id || p?.name || '');
}

function personName(p) {
  return (
    p?.full_name ||
    p?.employee_name ||
    [p?.first_name, p?.last_name].filter(Boolean).join(' ') ||
    p?.email ||
    personId(p)
  );
}

function personDetail(p) {
  const name = personName(p);
  return [p?.email, p?.phone || p?.mobile_no || p?.cell_number]
    .filter((v) => v && v !== name)
    .join(' · ');
}

function matches(p, needle) {
  if (!needle) return true;
  const digits = needle.replace(/\D/g, '');
  const hay = [personName(p), p?.email, p?.phone, p?.mobile_no, p?.cell_number, p?.employee, p?.name]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (hay.includes(needle)) return true;
  return digits.length >= 3 && hay.replace(/\D/g, '').includes(digits);
}

function asList(value, fallback) {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string' && value.trim()) return value.split(',').map((s) => s.trim());
  return fallback;
}

const ImpersonateSwitch = forwardRef(function ImpersonateSwitch(
  {
    people,
    me,
    allowedDepartments,
    allowedDesignations,
    requireReason = true,
    triggerLabel = 'Impersonate',
    title = 'Switch account',
    previewState = 'auto',
    previewOpen = false,
    className,
    style,
  },
  ref
) {
  const live = useImpersonation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  useImperativeHandle(ref, () => ({ open: () => setOpen(true), close: () => setOpen(false) }), []);

  // Editor preview only: Studio's canvas has no session to read.
  const state =
    previewState === 'impersonating'
      ? { ...live, active: true, target: live.target || PREVIEW_TARGET }
      : previewState === 'idle'
        ? { ...live, active: false, target: null }
        : live;

  const list = useMemo(() => (Array.isArray(people) ? people.filter(Boolean) : []), [people]);
  const needle = query.trim().toLowerCase();
  const found = useMemo(() => list.filter((p) => matches(p, needle)), [list, needle]);
  const shown = found.slice(0, MAX_ROWS);

  const current = state.active ? list.find((p) => personId(p) === state.target) : null;
  const currentName = state.active ? (current ? personName(current) : state.target) : null;

  const allowed =
    previewState !== 'auto' ||
    isAllowed(me, {
      active: state.active,
      departments: asList(allowedDepartments, DEFAULT_DEPARTMENTS),
      designations: asList(allowedDesignations, DEFAULT_DESIGNATIONS),
    });
  if (!allowed) return null;

  const close = () => {
    setOpen(false);
    setQuery('');
    setPicked(null);
    setReason('');
  };

  const pickedId = picked ? personId(picked) : '';
  const canSwitch =
    Boolean(pickedId) && pickedId !== state.target && (!requireReason || reason.trim().length > 0) && !busy;

  const doSwitch = () => {
    if (!canSwitch) return;
    setBusy(true);
    if (!switchTo(pickedId, reason.trim())) setBusy(false);
  };

  const doBack = () => {
    setBusy(true);
    backToSelf();
  };

  return (
    <>
      <Button
        type={state.active ? 'primary' : 'default'}
        size="sm"
        className={className}
        style={style}
        onClick={() => setOpen(true)}
        title={state.active ? `Viewing as ${currentName}. Tap to switch or go back.` : undefined}
      >
        {state.active ? `Viewing as ${currentName}` : triggerLabel}
      </Button>

      <Sheet.Root open={open || Boolean(previewOpen)} onOpenChange={(next) => !next && close()}>
        <Sheet.Popup surface="app" aria-label={title}>
          <Sheet.Header>
            <Sheet.Title>{title}</Sheet.Title>
            <Sheet.Description>
              {state.active
                ? `Viewing as ${currentName}. Your own account${live.actor ? ` (${actorLabel(live.actor)})` : ''} is kept.`
                : 'See the app the way someone else sees it.'}
            </Sheet.Description>
            <Sheet.Close />
          </Sheet.Header>

          <Sheet.Toolbar>
            {state.active ? (
              <Button type="default" size="app" block disabled={busy} onClick={doBack}>
                Back to me
              </Button>
            ) : null}
            <Field
              size="app"
              type="search"
              placeholder="Search name, email or phone…"
              value={query}
              onChange={setQuery}
              autoComplete="off"
              aria-label="Search people"
            />
          </Sheet.Toolbar>

          <Sheet.Body>
            {list.length === 0 ? (
              <p className="ds-field-hint" style={{ padding: 'var(--space-16) 0' }}>
                No people to show yet. The list comes from the page.
              </p>
            ) : shown.length === 0 ? (
              <p className="ds-field-hint" style={{ padding: 'var(--space-16) 0' }}>
                Nobody matches “{query}”.
              </p>
            ) : (
              shown.map((p) => {
                const id = personId(p);
                const isPicked = id === pickedId;
                const isCurrent = state.active && id === state.target;
                return (
                  <ListRow
                    key={id}
                    dense
                    title={personName(p)}
                    subtitle={personDetail(p) || null}
                    onClick={isCurrent ? undefined : () => setPicked(p)}
                    aria-pressed={isCurrent ? undefined : isPicked}
                    style={isPicked ? { backgroundColor: 'var(--intent-info-wash)' } : undefined}
                    trailing={
                      isCurrent ? (
                        <span className="ds-listrow__subtitle">Current</span>
                      ) : isPicked ? (
                        <i className="pi pi-check" aria-hidden="true" style={{ color: 'var(--brand-text)' }} />
                      ) : null
                    }
                  />
                );
              })
            )}
            {found.length > shown.length ? (
              <p className="ds-field-hint" style={{ padding: 'var(--space-8) 0' }}>
                {found.length - shown.length} more. Type to narrow down.
              </p>
            ) : null}
          </Sheet.Body>

          <Sheet.Footer>
            <Field
              size="app"
              label={requireReason ? 'Reason' : 'Reason (optional)'}
              placeholder="Why you're switching…"
              value={reason}
              onChange={setReason}
              maxLength={200}
            />
            <Button size="app" block disabled={!canSwitch} loading={busy} onClick={doSwitch}>
              {picked ? `Switch to ${personName(picked)}` : 'Pick a person'}
            </Button>
          </Sheet.Footer>
        </Sheet.Popup>
      </Sheet.Root>
    </>
  );
});

export default ImpersonateSwitch;
