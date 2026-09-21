'use client';

import { useState } from 'react';
import { Button, Card, DisclosureRow, ProgressBar, SectionLabel, StatusPill } from '@/design-system';
import { childrenOf, rollupFor } from '../data/selectors';
import { ATTENDANCE_LABEL, ATTENDANCE_TONE } from '../data/shape';
import { attainmentTone, formatCurrency, formatPercent, formatRatio } from '../data/format';

/* RBM → ABM → BE, expanded on tap.
 *
 * EXPANSION IS LAZY AND THAT IS THE POINT. `rollupFor` walks a subtree and
 * aggregates its rows; calling it for every node up front is O(people × rows)
 * over a hierarchy that is five levels deep and mostly closed. A node computes
 * its own numbers when it renders, and its children compute theirs only once
 * opened.
 *
 * Open state lives in ONE Set at the root rather than in each row. A row that
 * owns its own boolean cannot be collapsed when the scope changes — you switch
 * from one manager to another and the new tree opens to the old one's shape. */

/* A rep's subtitle is a fact ("plan 11"); a rep's EXCEPTION is a status, and
   status belongs in a StatusPill rather than in prose — the DS is explicit
   about that. Only exceptions get one: a pill on all nineteen rows would make
   "working" as loud as "not reporting", which is the opposite of the point.
   Managers never get one; their state is the ratio next to their name. */
function SubtitleFor({ member, roll }) {
  if (!roll.isLeaf) {
    if (member.vacant) {
      return (
        <span className="mt-1 flex items-center gap-2 text-10 text-ds-secondary">
          {member.short}
          <StatusPill status={ATTENDANCE_TONE.vacant}>{ATTENDANCE_LABEL.vacant}</StatusPill>
        </span>
      );
    }
    return (
      <span className="block text-10 text-ds-secondary">
        {member.short} · {roll.workingReps}/{roll.totalReps} working
        {roll.pobAmount > 0 ? ` · ${formatCurrency(roll.pobAmount)}` : null}
      </span>
    );
  }

  const state = member.vacant ? 'vacant' : roll.attendance;
  if (state === 'working') {
    return (
      <span className="block text-10 text-ds-secondary">
        {member.short} · plan {roll.planned}
        {roll.pobAmount > 0 ? ` · ${formatCurrency(roll.pobAmount)}` : null}
      </span>
    );
  }

  return (
    <span className="mt-1 flex items-center gap-2 text-10 text-ds-secondary">
      {member.short}
      <StatusPill status={ATTENDANCE_TONE[state]}>{ATTENDANCE_LABEL[state]}</StatusPill>
    </span>
  );
}

function TreeNode({ member, team, rows, pob, depth, open, toggle, onDoctorPlan }) {
  const roll = rollupFor(member, team, rows, pob);
  const kids = childrenOf(team, member.id);
  const isOpen = open.has(member.id);

  const header = (
    <div className="flex w-full items-start justify-between gap-3">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-13 font-semibold text-heading">{member.name}</span>
        <SubtitleFor member={member} roll={roll} />
        <ProgressBar
          className="mt-1"
          size="sm"
          tone={attainmentTone(roll.attainment)}
          value={roll.happened}
          max={Math.max(roll.planned, 1)}
          label={`${member.name}: ${roll.happened} of ${roll.planned}`}
        />
      </span>
      {/* `leading-tight` on both lines, not the stock 20px: three things stack
          in this column now and a 10px caption sitting in a 20px box spends
          half the row on air. */}
      <span className="shrink-0 text-right">
        <span className="block text-13 font-semibold leading-tight tabular-nums text-heading">
          {formatRatio(roll.happened, roll.planned)}
        </span>
        <span className="mt-0.5 block text-10 leading-tight text-ds-secondary">
          {roll.attainment == null ? 'no plan' : `${formatPercent(roll.attainment)} of plan`}
        </span>
        {/* The third line of this column is the Dr plan button, which the
            DisclosureRow lays over the header's bottom-right rather than
            beside it (a button cannot nest inside the header's own button).
            This reserves its height so the two never collide — see
            ds-disclosure__action-lane. */}
        {onDoctorPlan ? <span className="ds-disclosure__action-lane" aria-hidden="true" /> : null}
      </span>
    </div>
  );

  /* The SECOND thing you want from a tree row. Expanding answers "which of
     my people", this answers "which of their calls" — two different questions
     off one row, which is why it is DisclosureRow's `action` slot and not
     something nested in the header (see DisclosureRow.jsx).

     Ghost primary, so it reads as blue and hollow: it is the only thing on
     this row that LEAVES the row, and the default type's body-grey label sat
     in the tree like a second piece of data rather than a way out of it. The
     chevron is the same one LegendChip uses for the same promise — "there is
     a list behind this" — and is aria-hidden, because a screen reader
     announcing "single right-pointing angle quotation mark" after every row
     is noise on top of a button that already says where it goes.

     DISABLED, not hidden, when the node has no plan. A vacant seat's sheet
     would read "0 visits planned", which is a dead end dressed as a
     destination — but dropping the control instead makes the buttons down the
     right-hand edge ragged, and a missing control reads as a bug rather than
     as "nothing here". */
  const action = onDoctorPlan ? (
    <Button
      type="primary"
      ghost
      size="sm"
      disabled={roll.planned === 0}
      onClick={() => onDoctorPlan(member)}
    >
      Dr plan
      <span aria-hidden="true">›</span>
    </Button>
  ) : null;

  return (
    <DisclosureRow
      header={header}
      action={action}
      depth={depth}
      expanded={isOpen}
      onToggle={() => toggle(member.id)}
      expandable={kids.length > 0}
    >
      {kids.map((kid) => (
        <TreeNode
          key={kid.id}
          member={kid}
          team={team}
          rows={rows}
          pob={pob}
          depth={depth + 1}
          open={open}
          toggle={toggle}
          onDoctorPlan={onDoctorPlan}
        />
      ))}
    </DisclosureRow>
  );
}

export function TeamTree({ team, rows, pob, rootIds = [], onDoctorPlan }) {
  /* Open on each selected node, so the card arrives showing the level
     below every pick rather than as a row of closed names. Remounted by
     the caller when the picks change, which is what resets this. */
  const [open, setOpen] = useState(() => new Set(rootIds));

  const toggle = (id) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /* One top row per SELECTED node -- a forest, not a tree, because two
     picks from different branches have no single parent to hang off. The
     picked rows are shown rather than skipped to their children: with
     several in play, the name you ticked is what tells you which block of
     rows is whose. */
  const byId = new Map(team.map((m) => [m.id, m]));
  const tops = rootIds.map((id) => byId.get(id)).filter(Boolean);

  return (
    <section className="flex flex-col gap-2">
      <SectionLabel>Team tree · tap to expand</SectionLabel>
      <Card>
        {tops.length === 0 ? (
          <p className="text-10 text-ds-muted">No direct reports in this scope.</p>
        ) : (
          tops.map((m) => (
            <TreeNode
              key={m.id}
              member={m}
              team={team}
              rows={rows}
              pob={pob}
              depth={0}
              open={open}
              toggle={toggle}
              onDoctorPlan={onDoctorPlan}
            />
          ))
        )}
      </Card>
    </section>
  );
}
