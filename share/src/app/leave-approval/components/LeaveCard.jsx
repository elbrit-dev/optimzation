'use client';

import { Avatar, Button, Card, Icon, StatusPill, Tag, cx } from '@/design-system';
import { rangeLabel, shortDay } from '../data/shape';

/* One leave request's card on the Leave Approval screen. Presentational only. */

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

/* Short names for the leave types, as the HR dashboard's playground writes them. */
const ABBR = {
  'Casual Leave': 'CL',
  'Sick Leave': 'SL',
  'Privilege Leave': 'PL',
  'Earned Leave': 'EL',
  'Compensatory Off': 'CO',
  'Leave Without Pay': 'LWP',
  'Probation Leave': 'PROB',
};
export const typeAbbr = (t) =>
  ABBR[t] ??
  (String(t ?? '')
    .split(/\s+/)
    .filter((w) => w && !/^leave$/i.test(w))
    .map((w) => w[0].toUpperCase())
    .join('') ||
    t);
const num = (n) => String(Math.round(n * 10) / 10);

/* Every leave balance in one line; on a waiting leave its own type shows
   what it becomes if approved (red below zero). An unpaid type with no
   allocation shows the days this leave adds. */
function Balances({ balance, leave: l, waiting }) {
  if (balance === undefined) return <div className="h-4 w-40 rounded bg-sunken" aria-label="Loading leave balances" />;
  if (!balance) return null;
  const items = balance.types.map((b) => ({ ...b, after: waiting && b.type === l.leaveType ? b.left - (l.days || 0) : null }));
  if (waiting && !items.some((b) => b.type === l.leaveType)) items.push({ type: l.leaveType, add: l.days || 0 });
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-11 tabular-nums" aria-label="Leave balances">
      {items.map((b) => {
        const mine = b.type === l.leaveType;
        return (
          <span key={b.type} title={b.type} className={cx('whitespace-nowrap', mine ? 'text-heading' : 'text-ds-muted')}>
            <span className={cx('mr-1 font-semibold', mine ? 'text-heading' : 'text-ds-secondary')}>{typeAbbr(b.type)}</span>
            {b.add != null ? (
              <>+{num(b.add)}</>
            ) : b.after != null ? (
              <>
                {num(b.left)} → <span className={cx('font-semibold', b.after < 0 ? 'text-danger-text' : 'text-heading')}>{num(b.after)}</span>
              </>
            ) : (
              num(b.left)
            )}
          </span>
        );
      })}
    </div>
  );
}

/* One request: who, what and when — and its two buttons. Ticking it adds
 * it to the pinned bar's batch. A leave waiting on SOMEONE ELSE (role
 * 'watcher') has no checkbox or buttons, and says who it waits on. A DECIDED leave (`viewer` given, status not
 * Open) is the same card with its decision in place of the checkbox and
 * buttons: the status, who decided and when. */
export function LeaveCard({ leave: l, selected, onToggle, onApprove, onReject, busy, canDecide, viewer, balance }) {
  const decided = l.status === 'Approved' || l.status === 'Rejected';
  const watching = l.role === 'watcher';
  const actionable = canDecide && !decided && !watching;
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

      <Balances balance={balance} leave={l} waiting={!decided} />

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
        {!decided && watching ? (
          <Fact icon="user">
            Decision waiting on <span className="font-semibold text-heading">{l.approverName ?? l.approver ?? 'the approver'}</span>
          </Fact>
        ) : null}
        {!decided && l.role === 'override' ? (
          <Fact icon="shield">Waiting on {l.approverName ?? l.approver} — you can decide as HR</Fact>
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
