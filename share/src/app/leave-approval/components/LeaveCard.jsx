'use client';

import { Avatar, Button, Card, Icon, StatusPill, Tag, cx } from '@/design-system';
import { rangeLabel, shortDay } from '../data/shape';

/* The pieces of the Leave Approval screen: one request's card, the week
 * strip of who is off, and a decided leave's row. Presentational only. */

const TYPE_TONE = {
  'Sick Leave': 'magenta',
  'Casual Leave': 'blue',
  'Privilege Leave': 'violet',
  'Earned Leave': 'violet',
  'Leave Without Pay': 'amber',
};
export const typeTone = (t) => TYPE_TONE[t] ?? 'neutral';

function daysText(l) {
  if (l.halfDay) return 'Half day';
  return `${l.days} day${l.days === 1 ? '' : 's'}`;
}

function startsText(l) {
  if (l.startsIn < 0) return `Started ${-l.startsIn} day${l.startsIn === -1 ? '' : 's'} ago`;
  if (l.startsIn === 0) return 'Starts today';
  if (l.startsIn === 1) return 'Starts tomorrow';
  return `Starts in ${l.startsIn} days`;
}

function Fact({ icon, tone = 'muted', children }) {
  const color = { muted: 'text-ds-secondary', warning: 'text-pending-text', danger: 'text-danger-text' }[tone];
  return (
    <span className={cx('flex items-center gap-1.5 text-11', color)}>
      <Icon name={icon} size="sm" className="shrink-0" />
      <span className="min-w-0">{children}</span>
    </span>
  );
}

/* One request: who, what and when — and its two buttons. Ticking it adds
 * it to the pinned bar's batch. A DECIDED leave (`viewer` given, status not
 * Open) is the same card with its decision in place of the checkbox and
 * buttons: the status, who decided and when. */
export function LeaveCard({ leave: l, selected, onToggle, onApprove, onReject, busy, canDecide, viewer }) {
  const decided = l.status === 'Approved' || l.status === 'Rejected';
  const actionable = canDecide && !decided;
  const startTone = l.urgency === 'started' ? 'danger' : l.urgency === 'soon' ? 'warning' : 'muted';
  const by = l.decidedBy && l.decidedBy === viewer ? 'you' : l.decidedBy?.split('@')[0] ?? null;
  return (
    <Card padding="app" className={cx('flex flex-col gap-3', selected && 'ring-2 ring-brand')}>
      <div className="flex items-start gap-3">
        {actionable ? (
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            aria-label={`Select ${l.employeeName}'s leave`}
            className="mt-2.5 size-4 shrink-0 accent-[var(--elbrit-blue)]"
          />
        ) : null}
        <Avatar name={l.employeeName} size="md" aria-hidden />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-start justify-between gap-2">
            <span className="truncate text-14 font-semibold text-heading">{l.employeeName}</span>
            <Tag tone={typeTone(l.leaveType)} className="shrink-0">{l.leaveType}</Tag>
          </div>
          <span className="flex items-center justify-between gap-2">
            <span className="truncate text-11 text-ds-muted">{l.team}</span>
            {decided ? (
              <StatusPill status={l.status === 'Approved' ? 'approved' : 'rejected'} className="shrink-0">
                {l.status}
              </StatusPill>
            ) : null}
          </span>
        </div>
      </div>

      <div className="flex items-baseline justify-between gap-3 rounded-lg bg-sunken px-3 py-2.5">
        <span className="text-16 font-semibold text-heading">{rangeLabel(l.from, l.to)}</span>
        <span className="shrink-0 text-12 text-ds-secondary">{daysText(l)}</span>
      </div>

      {l.reason ? <p className="text-12 leading-snug text-body">“{l.reason}”</p> : <p className="text-12 italic text-ds-muted">No reason given</p>}

      <div className="flex flex-col gap-1.5">
        {decided ? (
          <Fact icon="clock">
            Applied {l.appliedOn ? shortDay(l.appliedOn) : '—'}
            {l.decidedOn ? ` · ${l.status.toLowerCase()}${by ? ` by ${by}` : ''} on ${shortDay(l.decidedOn)}` : ''}
          </Fact>
        ) : (
          <Fact icon="clock" tone={startTone}>
            {startsText(l)} · applied {l.waitingDays ? `${l.waitingDays} day${l.waitingDays === 1 ? '' : 's'} ago` : 'today'}
          </Fact>
        )}
        {l.attachment ? (
          <Fact icon="paperclip">
            <a href={l.attachment} target="_blank" rel="noreferrer" className="text-brand-text underline">
              Medical note attached
            </a>
          </Fact>
        ) : null}
        {!decided && l.role === 'escalation' ? (
          <Fact icon="arrow-up" tone="warning">
            {l.waitingDays ? `Waiting on ${l.approverName ?? l.approver} for ${l.waitingDays} day${l.waitingDays === 1 ? '' : 's'}` : `Not yet decided by ${l.approverName ?? l.approver}`} — you can decide as the next level
          </Fact>
        ) : null}
      </div>

      {actionable ? (
        <div className="grid grid-cols-2 gap-2">
          <Button type="default" size="app" danger block onClick={onReject} disabled={Boolean(busy)}>
            Reject
          </Button>
          <Button type="primary" size="app" block onClick={onApprove} loading={busy === l.name} disabled={Boolean(busy)}>
            Approve
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

/* The next seven days, each with how many are off: approved (green) and
 * still asked (amber). A tap shows who. */
export function WeekStrip({ days, picked, onPick }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const n = d.approved.length + d.waiting.length;
          const on = picked === d.iso;
          return (
            <button
              key={d.iso}
              type="button"
              onClick={() => onPick(on ? null : d.iso)}
              aria-pressed={on}
              aria-label={`${d.weekday} ${d.day}: ${d.approved.length} off, ${d.waiting.length} asked`}
              className={cx(
                'flex flex-col items-center gap-1 rounded-lg border px-0.5 py-1.5 transition-colors',
                on ? 'border-brand bg-brand-tint-weak' : 'border-transparent bg-surface',
              )}
            >
              <span className="text-10 text-ds-muted">{d.weekday}</span>
              <span className="text-13 font-semibold text-heading">{d.day}</span>
              <span className="flex h-2 items-center gap-0.5">
                {d.approved.slice(0, 3).map((_, i) => <span key={`a${i}`} className="size-1.5 rounded-full bg-[var(--status-approved)]" />)}
                {d.waiting.slice(0, 3).map((_, i) => <span key={`w${i}`} className="size-1.5 rounded-full bg-[var(--status-pending)]" />)}
                {!n ? <span className="size-1.5 rounded-full bg-[var(--ds-border)]" /> : null}
              </span>
            </button>
          );
        })}
      </div>
      {picked ? (() => {
        const d = days.find((x) => x.iso === picked);
        if (!d) return null;
        return (
          <p className="rounded-lg bg-surface px-3 py-2 text-11 text-ds-secondary">
            <span className="font-semibold text-heading">{shortDay(d.iso)}: </span>
            {d.approved.length || d.waiting.length
              ? [d.approved.length ? `off — ${d.approved.join(', ')}` : null, d.waiting.length ? `asked — ${d.waiting.join(', ')}` : null].filter(Boolean).join(' · ')
              : 'everyone in'}
          </p>
        );
      })() : null}
    </div>
  );
}
