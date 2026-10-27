import { forwardRef, useId, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Button, Field, Sheet } from '@/design-system';
import {
  DEFAULT_DEPARTMENTS,
  DEFAULT_DESIGNATIONS,
  actorLabel,
  backToSelf,
  currentActor,
  isAllowed,
  switchTo,
  useImpersonation,
} from './Impersonation';

/**
 * ImpersonateSwitch: the header's "Impersonate" button and its form, the same
 * shape as the Studio modal it replaces (Employee, UID, your email + Reason,
 * Cancel / Switch).
 *
 * A short form, so the design system's Sheet with desktop="dialog": a bottom
 * sheet on a phone (swipe down or back to close), a small centred dialog from
 * 768px.
 *
 * The Employee picker searches what people sign in with and are known by:
 * email, phone, employee code and name, and each option shows all of them.
 * Matches open inline under the field rather than in a floating dropdown, so
 * on a phone with the keyboard up they are never clipped or hidden.
 *
 * While impersonating, the button reads "Viewing as <person>", the form leads
 * with Back to me, and Switch stays available, so jumping from one person to
 * the next never needs a logout. The switching itself is
 * components/Impersonation.jsx.
 *
 * It hides itself for anyone who may not switch: `me` outside the allowed
 * departments/designations, unless they are being impersonated right now.
 */

// A picker, not a directory: past this many matches, typing narrows it.
const MAX_OPTIONS = 8;

const PREVIEW_TARGET = '9876543210';

const EMPLOYEE_CODE = /^[A-Z]{1,4}\d{3,}$/i;

/* `people` comes in two shapes. The old query listed ERP Users (email, phone);
   an Employees query has name (the code), employee_name, cell_number,
   company_email and the ERP login as user_id__name. */

function isEmployee(p) {
  return Boolean(p?.employee_name || p?.cell_number || p?.user_id__name);
}

/** The ERP login (User id) behind an Employee row, when the query has it. */
function personLogin(p) {
  const link = p?.user_id__name || p?.user_id;
  return typeof link === 'string' ? link : link?.name || '';
}

function personPhone(p) {
  return p?.phone || p?.mobile_no || p?.cell_number || p?.cell_phone || '';
}

function personEmail(p) {
  return p?.email || p?.company_email || personLogin(p) || p?.personal_email || '';
}

function personCode(p) {
  const code = p?.employee || p?.employee_id || p?.employee_code || p?.code;
  if (code) return String(code);
  if (!p?.name) return '';
  return isEmployee(p) || EMPLOYEE_CODE.test(p.name) ? String(p.name) : '';
}

function personName(p) {
  return (
    p?.full_name ||
    p?.employee_name ||
    [p?.first_name, p?.last_name].filter(Boolean).join(' ') ||
    ''
  );
}

/**
 * What the switch signs in with. The ERP's userToken looks the person up by
 * User email / mobile_no / phone, so an Employee row switches by its ERP login
 * (user_id): its cell_number need not match the User's mobile_no. A User row
 * switches by phone, else email, as the old modal did.
 */
function personId(p) {
  const login = personLogin(p);
  if (login) return login;
  return String(personPhone(p) || personEmail(p) || p?.id || '');
}

function personLabel(p) {
  return personEmail(p) || personName(p) || personId(p);
}

function personDetail(p) {
  const label = personLabel(p);
  return [personCode(p), personPhone(p), personName(p)].filter((v) => v && v !== label).join(' · ');
}

function matches(p, needle) {
  if (!needle) return true;
  const text = [personEmail(p), personLogin(p), personName(p), personCode(p), personPhone(p)]
    .join(' ')
    .toLowerCase();
  if (text.includes(needle)) return true;
  const digits = needle.replace(/\D/g, '');
  return digits.length >= 3 && personPhone(p).replace(/\D/g, '').includes(digits);
}

function asList(value, fallback) {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string' && value.trim()) return value.split(',').map((s) => s.trim());
  return fallback;
}

const listStyle = {
  margin: 'var(--space-4) 0 0',
  padding: 'var(--space-4)',
  listStyle: 'none',
  border: 'var(--border-w) solid var(--border-subtle)',
  borderRadius: 'var(--radius-8, 8px)',
  background: 'var(--surface-card)',
  boxShadow: 'var(--ds-shadow-card)',
};

// .ds-listrow is width:100%, and an interactive one bleeds -12px past its
// container (made for edge-to-edge sheet lists). Inside this bordered list it
// must stay within the border: no bleed, padding inside the width.
const optionStyle = {
  boxSizing: 'border-box',
  width: 'auto',
  marginInline: 0,
  paddingInline: 'var(--space-8)',
  borderRadius: 'var(--radius-6, 6px)',
};

const ImpersonateSwitch = forwardRef(function ImpersonateSwitch(
  {
    people,
    me,
    allowedDepartments,
    allowedDesignations,
    requireReason = true,
    triggerLabel = 'Impersonate',
    title = 'Impersonate',
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
  const [listOpen, setListOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [picked, setPicked] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  const listId = useId();

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
  const options = found.slice(0, MAX_OPTIONS);

  const allowed =
    previewState !== 'auto' ||
    isAllowed(me, {
      active: state.active,
      departments: asList(allowedDepartments, DEFAULT_DEPARTMENTS),
      designations: asList(allowedDesignations, DEFAULT_DESIGNATIONS),
    });
  if (!allowed) return null;

  const current = state.active ? list.find((p) => personId(p) === state.target) : null;
  const currentName = state.active ? (current ? personLabel(current) : state.target) : null;
  // You, whoever's account is in use: the saved actor while impersonating,
  // else the Firebase user, else the ERP `me`.
  const you = actorLabel(live.actor || currentActor() || (me?.email ? { email: me.email } : null));

  const close = () => {
    setOpen(false);
    setQuery('');
    setListOpen(false);
    setPicked(null);
    setReason('');
  };

  const choose = (p) => {
    setPicked(p);
    setQuery(personLabel(p));
    setListOpen(false);
  };

  const onType = (value) => {
    setQuery(value);
    setPicked(null);
    setHighlight(0);
    setListOpen(true);
  };

  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setListOpen(true);
      setHighlight((h) => Math.min(h + 1, Math.max(options.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (event.key === 'Enter' && listOpen && options[highlight]) {
      event.preventDefault();
      choose(options[highlight]);
    } else if (event.key === 'Escape' && listOpen) {
      // Close the list, not the whole sheet.
      event.stopPropagation();
      setListOpen(false);
    }
  };

  const pickedId = picked ? personId(picked) : '';
  const canSwitch =
    Boolean(pickedId) && pickedId !== state.target && (!requireReason || reason.trim().length > 0) && !busy;

  const doSwitch = () => {
    if (!canSwitch) return;
    setBusy(true);
    if (!switchTo(pickedId, reason.trim(), you)) setBusy(false);
  };

  const doBack = () => {
    setBusy(true);
    backToSelf();
  };

  const showList = listOpen;

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

      <Sheet.Root open={open || Boolean(previewOpen)} onOpenChange={(next) => !next && close()} desktop="dialog">
        <Sheet.Popup surface="app" aria-label={title} initialFocus={inputRef}>
          <Sheet.Header>
            <Sheet.Title>{title}</Sheet.Title>
            {state.active ? <Sheet.Description>Viewing as {currentName}</Sheet.Description> : null}
            <Sheet.Close />
          </Sheet.Header>

          <Sheet.Body style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>
            {state.active ? (
              <Button type="default" size="app" block disabled={busy} onClick={doBack}>
                Back to me ({you})
              </Button>
            ) : null}

            <div>
              <Field
                ref={inputRef}
                size="app"
                placeholder="Select an Employee"
                value={query}
                onChange={onType}
                onFocus={() => setListOpen(true)}
                onBlur={() => setListOpen(false)}
                onKeyDown={onKeyDown}
                autoComplete="off"
                role="combobox"
                aria-label="Employee"
                aria-expanded={showList}
                aria-controls={listId}
                aria-autocomplete="list"
                suffix={
                  <i
                    className={showList ? 'pi pi-chevron-up' : 'pi pi-chevron-down'}
                    aria-hidden="true"
                    style={{ fontSize: 'var(--icon-sm, 12px)' }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setListOpen((v) => !v);
                      inputRef.current?.focus();
                    }}
                  />
                }
              />
              {showList ? (
                <ul id={listId} role="listbox" aria-label="Employees" style={listStyle}>
                  {list.length === 0 ? (
                    <li className="ds-field-hint" style={{ padding: 'var(--space-8)' }}>
                      No employees loaded.
                    </li>
                  ) : options.length === 0 ? (
                    <li className="ds-field-hint" style={{ padding: 'var(--space-8)' }}>
                      Nobody matches “{query}”.
                    </li>
                  ) : (
                    options.map((p, i) => {
                      const id = personId(p);
                      const isCurrent = state.active && id === state.target;
                      const detail = personDetail(p);
                      return (
                        <li
                          key={`${id}-${i}`}
                          role="option"
                          aria-selected={i === highlight}
                          aria-disabled={isCurrent || undefined}
                          className="ds-listrow ds-listrow--dense ds-listrow--interactive"
                          style={{
                            ...optionStyle,
                            backgroundColor: i === highlight ? 'var(--intent-info-wash)' : undefined,
                            opacity: isCurrent ? 0.5 : undefined,
                          }}
                          // mousedown, not click: the field's blur would close the list first.
                          onMouseDown={(e) => {
                            e.preventDefault();
                            if (!isCurrent) choose(p);
                          }}
                          onMouseEnter={() => setHighlight(i)}
                        >
                          <span className="ds-listrow__main">
                            <span className="ds-listrow__title">{personLabel(p)}</span>
                            {detail ? <span className="ds-listrow__subtitle">{detail}</span> : null}
                          </span>
                          {isCurrent ? <span className="ds-listrow__subtitle">Current</span> : null}
                        </li>
                      );
                    })
                  )}
                  {found.length > options.length ? (
                    <li className="ds-field-hint" style={{ padding: 'var(--space-4) var(--space-8)' }}>
                      {found.length - options.length} more. Keep typing to narrow down.
                    </li>
                  ) : null}
                </ul>
              ) : null}
            </div>

            <Field size="app" placeholder="UID" value={pickedId} readOnly disabled aria-label="UID" />

            <div style={{ display: 'flex', gap: 'var(--space-8)' }}>
              <Field size="app" value={you} readOnly disabled aria-label="You" style={{ flex: 1, minWidth: 0 }} />
              <Field
                size="app"
                placeholder={requireReason ? 'Reason' : 'Reason (optional)'}
                value={reason}
                onChange={setReason}
                maxLength={200}
                aria-label="Reason"
                style={{ flex: 1, minWidth: 0 }}
              />
            </div>
          </Sheet.Body>

          <Sheet.Footer style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
            <Button type="default" size="app" onClick={close}>
              Cancel
            </Button>
            <Button size="app" disabled={!canSwitch} loading={busy} onClick={doSwitch}>
              Switch
            </Button>
          </Sheet.Footer>
        </Sheet.Popup>
      </Sheet.Root>
    </>
  );
});

export default ImpersonateSwitch;
