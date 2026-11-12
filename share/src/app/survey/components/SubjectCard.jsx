'use client';

import { Avatar, Card, Icon, StatusPill, cx } from '@/design-system';
import { hqLabel } from '@/app/secondary-entry/data/format';
import { ROW_LABEL, ROW_TONE } from '../data/shape';

/* One row of a survey — the doctor or distributor it is about (or the
 * person themself, for an Employees survey). Secondary Entry's
 * StockistCard, cut to what a survey row says: avatar, name and status
 * pill; the code chip and the HQ under them. The whole card opens the
 * form; on the form it is the header, without a chevron.
 *
 * The avatar takes the categorical ramp, never green or red: a distributor
 * is not a status. */

const CHIP = 'inline-flex h-5.5 shrink-0 items-center whitespace-nowrap rounded-chip bg-sunken px-2 text-10 font-medium leading-none tabular-nums text-ds-secondary';

export function SubjectCard({ subject, me, state, note, onOpen, className }) {
  const name = subject?.label ?? me ?? 'You';
  const hq = hqLabel(subject?.hq);
  const canOpen = typeof onOpen === 'function';
  const pill = state ? ROW_LABEL[state] : null;
  return (
    <Card
      variant="hairline"
      onClick={canOpen ? onOpen : undefined}
      aria-label={canOpen ? [name, subject?.code, hq, pill].filter(Boolean).join(', ') : undefined}
      className={cx('flex min-w-0 items-start gap-3', className)}
    >
      <Avatar name={name.replace(/^Dr\.?\s*/i, '')} size="md" aria-hidden="true" />
      <span className="flex min-w-0 flex-1 flex-col gap-1.5" aria-hidden={canOpen || undefined}>
        <span className="flex w-full items-start justify-between gap-3">
          <span className="min-w-0 truncate text-14 font-semibold text-heading">{subject ? name : 'Your answers'}</span>
          {pill ? (
            <StatusPill status={ROW_TONE[state]} className="shrink-0 gap-1">
              {state === 'done' ? <Icon name="check" size="var(--fs-8)" /> : null}
              {pill}
              {canOpen ? <Icon name="chevron-right" size="var(--fs-8)" /> : null}
            </StatusPill>
          ) : null}
        </span>
        <span className="flex w-full min-w-0 items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-1 overflow-hidden">
            {subject?.code ? (
              <span className={CHIP} title={subject.doctype === 'Customer' ? 'EBS code' : 'Doctor code'}>
                {subject.code}
              </span>
            ) : null}
            {subject?.extra ? <span className={cx(CHIP, 'min-w-0 truncate')}>{subject.extra}</span> : null}
            {!subject ? <span className="truncate text-11 text-ds-muted">{name}</span> : null}
          </span>
          {hq ? (
            <span className="flex shrink-0 items-center gap-1 text-11 text-ds-muted">
              <Icon name="map-marker" size="var(--fs-10)" />
              {hq}
            </span>
          ) : null}
        </span>
        {note ? <span className="truncate text-11 text-ds-muted">{note}</span> : null}
      </span>
    </Card>
  );
}
