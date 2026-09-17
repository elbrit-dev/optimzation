'use client';

import { useState } from 'react';
import { Card, DisclosureRow, ProgressBar, SectionLabel, StatusPill } from '@/design-system';
import { childrenOf, rollupFor } from '../lib/selectors';
import { ATTENDANCE_LABEL, ATTENDANCE_TONE } from '../lib/shape';
import { attainmentTone, formatPercent, formatRatio } from '../lib/format';

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
    return (
      <span className="block text-10 text-ds-secondary">
        {member.short} · {roll.workingReps}/{roll.totalReps} working
      </span>
    );
  }

  const state = member.vacant ? 'vacant' : roll.attendance;
  if (state === 'working') {
    return (
      <span className="block text-10 text-ds-secondary">
        {member.short} · plan {roll.planned}
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

function TreeNode({ member, team, rows, depth, open, toggle }) {
  const roll = rollupFor(member, team, rows);
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
      <span className="shrink-0 text-right">
        <span className="block text-13 font-semibold tabular-nums text-heading">
          {formatRatio(roll.happened, roll.planned)}
        </span>
        <span className="block text-10 text-ds-secondary">
          {roll.attainment == null ? 'no plan' : `${formatPercent(roll.attainment)} of plan`}
        </span>
      </span>
    </div>
  );

  return (
    <DisclosureRow
      header={header}
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
          depth={depth + 1}
          open={open}
          toggle={toggle}
        />
      ))}
    </DisclosureRow>
  );
}

export function TeamTree({ team, rows, rootId }) {
  const [open, setOpen] = useState(() => new Set());

  const toggle = (id) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const tops = childrenOf(team, rootId);

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
              depth={0}
              open={open}
              toggle={toggle}
            />
          ))
        )}
      </Card>
    </section>
  );
}
