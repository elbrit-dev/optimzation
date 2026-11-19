'use client';

import { useEffect, useRef, useState } from 'react';
import { Avatar, Button, Card, Icon, StatusPill, Tag, cx } from '@/design-system';
import { appliedLabel, fullRangeLabel, shortDay } from '../data/shape';

/* One leave request's card on the Leave Approval screen.
 *
 * Laid out after the "Leave approval card" design:
 *   strip     how urgent it is (started / starting soon), only when it is
 *   who       avatar, name, team, and the bulk-select box on the right
 *   when      the dates, large, with the leave type and "1 day · applied …"
 *   facts     Balance · Reason · Why you · Note, as a two-column list
 *   actions   Reject (1 part) and Approve (2 parts, on the right), 48px tall;
 *             Reject opens a required reason right on the card
 * A leave waiting on someone else has no box or buttons; a decided one shows
 * its decision instead. */

const TYPE_TONE = {
  'Sick Leave': 'magenta',
  'Casual Leave': 'blue',
  'Privilege Leave': 'violet',
  'Earned Leave': 'violet',
  'Leave Without Pay': 'amber',
};
export const typeTone = (t) => TYPE_TONE[t] ?? 'neutral';

/* "Casual Leave" → "Casual"; the balance line names types without the noun. */
const typeWord = (t) => String(t ?? '').replace(/\s+leave$/i, '').trim() || t;
const num = (n) => String(Math.round(n * 10) / 10);
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

function daysText(l) {
  if (l.halfDay) return 'Half day';
  return plural(l.days, 'day');
}

/* The strip across the top: only when timing is the news. */
function urgencyStrip(l) {
  if (l.startsIn < 0) return { tone: 'warning', text: `Overdue · leave ${l.days > 1 && l.startsIn + l.days > 0 ? 'started' : 'was taken'} ${plural(-l.startsIn, 'day')} ago` };
  if (l.startsIn === 0) return { tone: 'warning', text: 'Starts today' };
  if (l.urgency === 'soon') return { tone: 'neutral', text: l.startsIn === 1 ? 'Starts tomorrow' : `Starts in ${l.startsIn} days` };
  return null;
}

function Fact({ label, children }) {
  return (
    <>
      <dt className="text-ds-muted">{label}</dt>
      <dd className="m-0 min-w-0">{children}</dd>
    </>
  );
}

/* "Casual 6 → 5 after approval", then every other balance on a quiet line.
   Red when approving would take it below zero. An unpaid type with no
   allocation reads as the days this leave adds. */
function Balance({ balance, leave: l, waiting }) {
  if (balance === undefined) return <span className="block h-4 w-40 rounded bg-sunken" aria-label="Loading leave balances" />;
  if (!balance) return <span className="text-ds-muted">Not available</span>;
  const own = balance.types.find((b) => b.type === l.leaveType);
  const rest = balance.types.filter((b) => b.type !== l.leaveType);
  const after = own ? own.left - (l.days || 0) : null;
  return (
    <span className="flex flex-col gap-0.5 tabular-nums">
      <span className="font-semibold text-heading">
        {own ? (
          waiting ? (
            <>
              {typeWord(l.leaveType)} {num(own.left)} → <span className={cx(after < 0 && 'text-danger-text')}>{num(after)}</span> after approval
            </>
          ) : (
            <>
              {typeWord(l.leaveType)} {num(own.left)}
            </>
          )
        ) : waiting ? (
          <>
            {typeWord(l.leaveType)} +{num(l.days || 0)} days
          </>
        ) : (
          <>{typeWord(l.leaveType)}</>
        )}
      </span>
      {rest.length ? (
        <span className="text-12 text-ds-muted">{rest.map((b) => `${typeWord(b.type)} ${num(b.left)}`).join(' · ')}</span>
      ) : null}
    </span>
  );
}

/* Why this leave is in front of the viewer, or who it waits on. */
function whyText(l) {
  const who = l.approverName ?? l.approver ?? 'the approver';
  if (l.role === 'escalation') {
    return l.waitingDays
      ? `Escalated from ${who}, who has not acted in ${plural(l.waitingDays, 'day')}`
      : `Escalated from ${who}, who has not decided yet`;
  }
  if (l.role === 'override') return `${who} has not decided; you can decide as HR`;
  if (l.role === 'watcher') return `Waiting on ${who}`;
  return null;
}

function RejectForm({ leave: l, busy, error, onCancel, onConfirm }) {
  const [reason, setReason] = useState('');
  const [missing, setMissing] = useState(false);
  const ref = useRef(null);
  useEffect(() => ref.current?.focus(), []);
  const id = `reject-${l.name}`;
  const first = String(l.employeeName ?? '').split(/\s+/)[0] || 'They';
  return (
    <form
      className="flex flex-col gap-2 border-t border-line pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (busy) return;
        if (!reason.trim()) {
          setMissing(true);
          ref.current?.focus();
          return;
        }
        onConfirm(reason.trim());
      }}
    >
      <label htmlFor={id} className="text-14 font-semibold text-heading">
        Reason for rejecting <span className="text-danger-text">(required)</span>
      </label>
      <textarea
        ref={ref}
        id={id}
        rows={3}
        value={reason}
        disabled={busy}
        aria-invalid={missing || undefined}
        aria-describedby={`${id}-help`}
        onChange={(e) => {
          setReason(e.target.value);
          setMissing(false);
        }}
        className={cx(
          'w-full resize-y rounded-lg border bg-surface p-3 text-16 leading-6 text-heading',
          missing ? 'border-danger' : 'border-line-strong',
        )}
      />
      {missing ? (
        <span role="alert" className="text-13 font-medium text-danger-text">
          Add a reason so {first} knows why this was rejected.
        </span>
      ) : null}
      {error ? (
        <span role="alert" className="text-13 font-medium text-danger-text">
          {error}
        </span>
      ) : null}
      <span id={`${id}-help`} className="text-13 text-ds-muted">
        {l.employeeName} will see this message.
      </span>
      <div className="mt-1 grid grid-cols-[1fr_2fr] gap-3">
        <Button type="default" size="lg" block className="!h-12" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="primary" size="lg" danger block className="!h-12" htmlType="submit" loading={busy}>
          {busy ? 'Rejecting' : 'Reject request'}
        </Button>
      </div>
    </form>
  );
}

export function LeaveCard({
  leave: l,
  selected,
  onToggle,
  onApprove,
  onStartReject,
  onCancelReject,
  onConfirmReject,
  rejecting = false,
  rejectError,
  busy,
  canDecide,
  viewer,
  balance,
}) {
  const decided = l.status === 'Approved' || l.status === 'Rejected';
  const watching = l.role === 'watcher';
  const actionable = canDecide && !decided && !watching;
  const strip = decided ? null : urgencyStrip(l);
  const why = decided ? null : whyText(l);
  const by = l.decidedBy && l.decidedBy === viewer ? 'you' : l.decidedBy?.split('@')[0] ?? null;
  const mine = busy === l.name;

  return (
    <Card
      padding="none"
      role="article"
      aria-label={`Leave request from ${l.employeeName}`}
      className={cx('flex flex-col overflow-hidden', selected && 'ring-2 ring-brand')}
    >
      {strip ? (
        <div
          className={cx(
            'flex items-center gap-2 px-4 py-2.5 text-13 font-semibold',
            strip.tone === 'warning' ? 'bg-warning-wash text-warning-text' : 'bg-sunken text-ds-secondary',
          )}
        >
          <Icon name="clock" size="sm" />
          <span>{strip.text}</span>
        </div>
      ) : null}

      <div className="flex flex-col gap-4 p-4">
        {/* Desktop (a wide list): who on the left, when on the right. */}
        <div className="flex flex-col gap-4 @2xl/leave:grid @2xl/leave:grid-cols-2 @2xl/leave:items-center @2xl/leave:gap-6">
        <div className="flex items-center gap-3">
          <Avatar name={l.employeeName} size="lg" aria-hidden />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-16 font-semibold leading-6 text-heading">{l.employeeName}</span>
            {l.team ? <span className="truncate text-13 text-ds-muted">{l.team}</span> : null}
          </div>
          {actionable ? (
            <label className="flex size-11 shrink-0 cursor-pointer items-center justify-center">
              <input
                type="checkbox"
                checked={selected}
                onChange={onToggle}
                aria-label={`Select ${l.employeeName}'s leave for bulk action`}
                className="size-5 accent-[var(--elbrit-blue)]"
              />
            </label>
          ) : decided ? (
            <StatusPill status={l.status === 'Approved' ? 'approved' : 'rejected'} className="shrink-0">
              {l.status}
            </StatusPill>
          ) : null}
        </div>

        <div className="flex flex-col gap-1 rounded-lg bg-sunken px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-20 font-bold leading-7 text-heading">{fullRangeLabel(l.from, l.to)}</span>
            <Tag tone={typeTone(l.leaveType)} className="shrink-0">
              {l.leaveType}
            </Tag>
          </div>
          <span className="text-13 text-ds-muted">
            {[daysText(l), appliedLabel(l)].filter(Boolean).join(' · ')}
          </span>
        </div>
        </div>

        <dl className="m-0 grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 gap-y-2.5 text-14 leading-5">
          <Fact label="Balance">
            <Balance balance={balance} leave={l} waiting={!decided} />
          </Fact>
          <Fact label="Reason">
            {l.reason ? <span className="text-body">{l.reason}</span> : <span className="text-ds-muted">None given</span>}
          </Fact>
          {why ? <Fact label={watching ? 'Waiting on' : 'Why you'}>{watching ? (l.approverName ?? l.approver ?? 'the approver') : why}</Fact> : null}
          {l.attachment ? (
            <Fact label="Note">
              <a href={l.attachment} target="_blank" rel="noreferrer" className="text-brand-text underline">
                Medical note attached
              </a>
            </Fact>
          ) : null}
          {decided && l.decidedOn ? (
            <Fact label="Decided">
              {l.status}
              {by ? ` by ${by}` : ''} on {shortDay(l.decidedOn)}
            </Fact>
          ) : null}
        </dl>

        {actionable && !rejecting ? (
          <div className="grid grid-cols-[1fr_2fr] gap-3 @2xl/leave:flex @2xl/leave:flex-row-reverse @2xl/leave:justify-end">
            <Button type="default" size="lg" danger block className="!h-12 @2xl/leave:!w-36" onClick={onStartReject} disabled={Boolean(busy)}>
              Reject
            </Button>
            <Button
              type="primary"
              size="lg"
              block
              className="!h-12 @2xl/leave:!w-44"
              icon={mine ? null : <Icon name="check" size="sm" />}
              onClick={onApprove}
              loading={mine}
              disabled={Boolean(busy)}
            >
              {mine ? 'Approving' : 'Approve'}
            </Button>
          </div>
        ) : null}

        {actionable && rejecting ? (
          <RejectForm leave={l} busy={mine} error={rejectError} onCancel={onCancelReject} onConfirm={onConfirmReject} />
        ) : null}
      </div>
    </Card>
  );
}

/* What replaces a card the moment it is decided here: the outcome, in the
   card's place, until the list is read again. */
export function DecidedNotice({ leave: l, status, reason, balanceAfter }) {
  const approved = status === 'Approved';
  return (
    <div
      role="status"
      className={cx(
        'flex items-center gap-3 rounded-xl px-4 py-3',
        approved ? 'bg-success-wash text-approved-text' : 'bg-danger-wash text-danger-text',
      )}
    >
      <Icon name={approved ? 'check' : 'times'} className="shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-14 font-semibold">
          {approved ? 'Approved' : 'Rejected'} · {l.employeeName}, {fullRangeLabel(l.from, l.to)}
        </span>
        {approved && balanceAfter != null ? (
          <span className="text-13">
            {typeWord(l.leaveType)} leave balance is now {num(balanceAfter)}
          </span>
        ) : null}
        {!approved && reason ? <span className="break-words text-13">Reason sent: {reason}</span> : null}
      </div>
    </div>
  );
}
