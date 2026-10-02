'use client';

import { useMemo, useState } from 'react';
import { Avatar, Button, Card, DisclosureRow, SectionLabel, StackedBar, StatusPill, toneFill } from '@/design-system';
import { teamIndex, teamTops } from '../data/team';
import { useTask } from '../data/task';

/* The team's month as a tree — RBM → ABM → BE, expanded on tap — Visit's
 * team tree in this screen's terms. A row is a card in three lines:
 *
 *   ▾ (AV)  Kamala Kannan                              [ View › ]
 *           [BE]  2/4 stockists
 *           ▓▓▓▓▓▓▓▒▒▒░░░░
 *           ● Approved 2  ● Waiting 1  ● To do 1
 *
 * A manager's row is their WHOLE BRANCH (their people's months added up),
 * and how many of its stockists are approved; a BE's is their own seat. "View"
 * opens that person's entries, read-only. Open state lives in one Set at the
 * root, as in Visit, so a new team never opens to the old one's shape. */

const SEGMENTS = [
  { key: 'approved', tone: 'success', label: 'Approved' },
  { key: 'waiting', tone: 'warning', label: 'Waiting' },
  { key: 'todo', tone: 'danger', label: 'To do' },
];

function Dot({ tone }) {
  return <span aria-hidden="true" className="inline-block size-2 shrink-0 rounded-full" style={{ backgroundColor: toneFill(tone) }} />;
}

function TeamNode({ member, index, depth, open, toggle, onView, segments, covered }) {
  const task = useTask();
  const roll = index.rollup(member);
  const kids = index.children(member.id);
  const isLeaf = kids.length === 0;
  /* A vacant seat the viewer covers is theirs to ENTER; anyone else's seat
     with records is theirs to view. */
  const enter = Boolean(member.seat && covered?.has(member.seat));
  const canView = enter || (Boolean(member.seat) && member.total > 0 && !member.vacant);
  const actionLabel = enter ? 'Enter' : 'View';

  const header = (
    <div className="flex w-full flex-col gap-2">
      <div className="flex w-full items-start gap-2.5">
        <Avatar name={member.name} size="sm" aria-hidden="true" />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="block truncate text-13 font-semibold text-heading">{member.name}</span>
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="shrink-0 whitespace-nowrap rounded-chip bg-brand-tint-weak px-2 py-0.5 text-10 font-semibold uppercase tracking-wide text-brand-text">
              {member.tier ?? '—'}
            </span>
            {member.vacant ? <StatusPill status="neutral">Vacant</StatusPill> : null}
            {/* Approved of all the branch's stockists (a BE: their own). */}
            {roll.total ? (
              <span className="min-w-0 truncate text-10 text-ds-secondary">
                {roll.approved}/{roll.total} {roll.total === 1 ? task.party : task.parties}
              </span>
            ) : null}
          </span>
        </span>
        {/* The lane the overlaid View button lands in (see Visit's TeamTree):
            a hidden twin, since a button cannot nest in the header's button. */}
        {canView ? (
          <span className="ds-disclosure__action-lane ds-btn ds-btn--primary ds-btn--sm ds-btn--ghost" style={{ visibility: 'hidden' }} aria-hidden="true">
            {actionLabel} ›
          </span>
        ) : null}
      </div>
      {roll.total ? (
        <>
          <StackedBar size="sm" segments={segments.map((s) => ({ tone: s.tone, label: s.label, value: roll[s.key] }))} />
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-10 text-ds-secondary">
            {segments.map((s) => (
              <span key={s.key} className="inline-flex items-center gap-1">
                <Dot tone={s.tone} />
                {s.label} {roll[s.key]}
              </span>
            ))}
          </span>
        </>
      ) : (
        <span className="text-10 text-ds-muted">No {task.parties} this month</span>
      )}
    </div>
  );

  return (
    <DisclosureRow
      header={header}
      action={
        canView ? (
          <Button type="primary" ghost size="sm" onClick={() => onView(member)} aria-label={enter ? `Enter for the vacant seat ${member.seat}` : `View ${member.name}'s entries`}>
            {actionLabel}
            <span aria-hidden="true">›</span>
          </Button>
        ) : null
      }
      actionAlign="start"
      depth={depth}
      expanded={open.has(member.id)}
      onToggle={() => toggle(member.id)}
      expandable={!isLeaf}
    >
      {kids.map((k) => (
        <TeamNode key={k.id} member={k} index={index} depth={depth + 1} open={open} toggle={toggle} onView={onView} segments={segments} covered={covered} />
      ))}
    </DisclosureRow>
  );
}

/* `labels`: the page's words for the three counts, e.g. { todo: 'Rework' }
   on the Approval screen, where "to do" is what went back to the BE. */
/* `covers`: the vacant seats the viewer covers ([{ seat }]) — those rows
   offer Enter instead of View. */
export function TeamProgress({ team, onView, labels, covers }) {
  const covered = useMemo(() => new Set((covers ?? []).map((c) => c.seat)), [covers]);
  const segments = SEGMENTS.map((s) => ({ ...s, label: labels?.[s.key] ?? s.label }));
  const index = useMemo(() => teamIndex(team?.members ?? []), [team]);
  const tops = useMemo(() => teamTops(team?.members ?? [], team?.root, index), [team, index]);
  /* A lone manager row opens by itself, so an RBM lands on their ABMs. */
  const [open, setOpen] = useState(() => new Set(tops.length === 1 ? [tops[0].id] : []));
  const toggle = (id) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <section className="flex flex-col gap-2">
      <SectionLabel>Team · tap to expand</SectionLabel>
      <Card>
        {tops.length === 0 ? (
          <p className="text-10 text-ds-muted">Nobody reports to you.</p>
        ) : (
          tops.map((m) => <TeamNode key={m.id} member={m} index={index} depth={0} open={open} toggle={toggle} onView={onView} segments={segments} covered={covered} />)
        )}
      </Card>
    </section>
  );
}
