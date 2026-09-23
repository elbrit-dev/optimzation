'use client';

import { useMemo, useState } from 'react';
import {
  Avatar,
  Button,
  Card,
  DisclosureRow,
  SectionLabel,
  StatusPill,
} from '@/design-system';
import { childrenOf, rollupFor } from '../data/selectors';
import { GeoBar } from './GeoBar';
import { ATTENDANCE_LABEL, ATTENDANCE_TONE } from '../data/shape';
import { formatCurrency } from '../data/format';

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
 * from one manager to another and the new tree opens to the old one's shape.
 *
 * THE ROW IS A CARD IN THREE LINES:
 *
 *   ▾ (AV)  Anil Kumar                          [ Dr plan › ]
 *           [BE]  ₹1.8 L
 *           ▓▓▓▓▓▓▓▓▓▓▓▓▒▒▒░░░░░░
 *           ● Geo verified 9  ● Force visit 3  ● Pending 7
 *
 * Read top to bottom it answers WHO, then WHAT THEY DID — identity, then the
 * day taken apart. That is the same bar, in the same order, as HqCard: a
 * territory card and the rows that make it up should not need two reading
 * habits.
 *
 * THE BAR REPLACED A ProgressBar toned by attainment. It says strictly more:
 * the filled length is still "how close to plan", and the split inside it is
 * the thing a ProgressBar could never show — that two of those calls were
 * logged away from the doctor. A row at 90% of plan made entirely of force
 * visits used to look like the best row on the screen.
 *
 * NO RATIO, NO PERCENTAGE. Both were the bar's own geometry written out
 * again, and at company scope the ratio read `59416/59416` — a number at a
 * width nobody can compare, on a row whose job is comparison. The exact
 * counts are in the legend, where they are three small figures instead of
 * one enormous one. */

/* Line two: what this person IS, and the facts about them the bar below
   cannot carry.
 *
 * The role is a chip rather than prose: it is a category, it repeats on every
 * row, and as a chip the eye can skip it. An EXCEPTION is a status and gets a
 * StatusPill — only an exception, because a pill on all nineteen rows would
 * make "reported" as loud as "not reported", which is the opposite of the
 * point. Managers never get one: a manager is not in the field. */
/* The row's three conditional marks, decided in ONE place because two of them
   are rendered in different columns — the pill and the headcount sit on the
   name line, "No plan" at the far right of the card — and they are defined in
   terms of each other. Split across the two components, "no plan" and a
   "Not reported" pill could both appear on the same row, which is the same
   fact stated twice in two vocabularies. */
function rowFlags(member, roll) {
  const state = member.vacant ? 'vacant' : roll.attendance;
  /* NO "NOT REPORTED" PILL ANY MORE. It was the loudest thing on the row and
     it repeated what the row already showed twice over: an empty bar, and
     "No plan" at the right where a rep has none. A red pill on every silent
     rep also made the tree look like a wall of failures on a morning when
     half the field had simply not logged yet — the attendance card above is
     where that count belongs, with the day's own framing around it.

     VACANT AND ABSENT KEEP THEIRS. Neither is derivable from the bar: an
     empty row means something different when nobody sits in the seat, or
     when the person is on approved leave, and a reader who cannot tell those
     from "did nothing today" is being told the wrong thing. */
  const showPill = member.vacant || (roll.isLeaf && state === 'onLeave');
  return {
    state,
    showPill,
    showHeadcount: !roll.isLeaf && !member.vacant,
    /* SAYS IT OF THE PERSON, not of their branch. Now that the bar counts a
       person's own calls (see rollupFor), a manager with none is the ordinary
       case rather than a rare one — and the headcount on the name line is
       what keeps the row from reading as a dead branch: "12/14 reported" on
       the left with "No plan" on the right is a manager whose people are out
       while they are not, which is exactly the thing this row could not say
       before. */
    showNoPlan: roll.planned === 0 && !showPill,
  };
}

function RoleLine({ member, roll }) {
  /* The pill is STILL LEAVES ONLY, even though the attendance card now counts
     managers too. A manager who made no call of their own is the ordinary
     case, not an exception — most of them manage on any given day — so
     pilling them red would put a warning on two rows in five and teach the
     reader to ignore the colour. Their own state is not lost:
     `workingReps/totalReps` beside the name counts them in. */
  const { state, showPill, showHeadcount } = rowFlags(member, roll);

  return (
    <span className="flex min-w-0 items-center gap-1.5">
      {/* THE SPECIALTY BADGE, WORN BY A ROLE. Same brand tint, same 10px
          uppercase, same chip radius as the badge on DoctorCard — it answers
          the same shape of question ("what kind of person is this") in the
          same slot, on a screen where these lists sit one above the other.
       *
       * BRAND TINT, NOT GREEN OR GREY. Green already means geo-verified here,
       * so a green chip beside a name would read as a status. The DS Tag's
       * neutral tint was the other way round: a 10% wash of the secondary
       * grey, indistinguishable from plain text — a chip nobody can see as a
       * chip is just a word that costs 8px of padding. */}
      <span className="shrink-0 whitespace-nowrap rounded-chip bg-brand-tint-weak px-2 py-0.5 text-10 font-semibold uppercase tracking-wide text-brand-text">
        {member.short}
      </span>

      {showPill ? (
        <StatusPill status={ATTENDANCE_TONE[state]}>{ATTENDANCE_LABEL[state]}</StatusPill>
      ) : null}

      {/* A manager's own headcount. The bar below counts VISITS; this counts
          PEOPLE, and on a manager the gap between the two is the story —
          nineteen calls from four of eleven reps is a different morning from
          nineteen calls from all eleven. */}
      {showHeadcount ? (
        <span className="min-w-0 truncate text-10 text-ds-secondary">
          {roll.workingReps}/{roll.totalReps} reported
        </span>
      ) : null}

      {/* No leading separator: a rep has no headcount before it, and `BE ·
          ₹1.8 L` reads as a dot that lost its left-hand side. */}
      {roll.pobAmount > 0 ? (
        <span className="shrink-0 text-10 text-ds-secondary">{formatCurrency(roll.pobAmount)}</span>
      ) : null}

    </span>
  );
}

function TreeNode({ member, team, rows, pob, depth, open, toggle, onDoctorPlan, overRange }) {
  const roll = rollupFor(member, team, rows, pob, overRange);
  const kids = childrenOf(team, member.id);
  const isOpen = open.has(member.id);
  const { showNoPlan } = rowFlags(member, roll);

  /* The SECOND thing you want from a tree row. Expanding answers "which of
     my people", this answers "which of their calls" — two different questions
     off one row, which is why it is DisclosureRow's `action` slot and not
     something nested in the header (a button cannot nest inside the header's
     own button).
   *
   * `actionAlign="start"` now: it sits beside the NAME, where a destination
   * belongs, rather than under figures it has nothing to do with.
   *
   * Ghost primary, so it reads as blue and hollow: it is the only thing on
   * this row that LEAVES the row. The chevron is the same one LegendChip uses
   * for the same promise — "there is a list behind this" — and is aria-hidden,
   * because a screen reader announcing "single right-pointing angle quotation
   * mark" after every row is noise on top of a button that already says where
   * it goes.
   *
   * DISABLED, not hidden, when the node has no plan of its own — which, now
   * that the numbers are each person's own (see rollupFor), is most manager
   * rows rather than a rare one. A sheet reading "0 visits planned" is a dead
   * end dressed as a destination, but dropping the control makes the buttons
   * down the right-hand edge ragged and a missing control reads as a bug
   * rather than as "nothing here". Greyed out beside the row's own "No plan"
   * they say the same thing twice, in the two places the eye lands. */
  const drPlanButton = (onClick) => (
    <Button type="primary" ghost size="sm" disabled={roll.planned === 0} onClick={onClick}>
      Dr plan
      <span aria-hidden="true">›</span>
    </Button>
  );

  const header = (
    <div className="flex w-full flex-col gap-2">
      <div className="flex w-full items-start gap-2.5">
        {/* Decorative: the name is immediately beside it, so announcing it
            again is noise. Same reasoning as DoctorCard and PersonCard —
            three lists on one screen, one anatomy. */}
        <Avatar name={member.name} size="sm" aria-hidden="true" />

        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="block truncate text-13 font-semibold text-heading">{member.name}</span>
          <RoleLine member={member} roll={roll} />
        </span>

        <span className="flex shrink-0 flex-col items-end gap-1">
          {/* THE LANE THE OVERLAID BUTTON LANDS IN. Nothing in DisclosureRow
              can measure this column, so the header reserves the box itself —
              a hidden twin wearing the button's own classes rather than a
              hard-coded width, which cannot drift when the label or the type
              scale changes.

              A SPAN, NOT A Button. The header IS a <button>, and a button
              inside a button is invalid markup that React refuses to hydrate.
              The twin needs the control's box, never its behaviour —
              `visibility: hidden` also keeps it out of the tab order. */}
          {onDoctorPlan ? (
            <span
              className="ds-disclosure__action-lane ds-btn ds-btn--primary ds-btn--sm ds-btn--ghost"
              style={{ visibility: 'hidden' }}
              aria-hidden="true"
            >
              Dr plan ›
            </span>
          ) : null}

          {/* AT THE FAR RIGHT OF THE ROW, under the control it explains.
              It is not another fact about the person — the name line carries
              those — it is the reason the bar below is empty and the reason
              the button above it is grey. Beside the headcount it read as one
              phrase with it ("12/14 reported · No plan"), which invited the
              two to be parsed as a single claim about the branch. */}
          {showNoPlan ? (
            <span className="shrink-0 text-10 text-ds-muted">No plan</span>
          ) : null}
        </span>
      </div>

      <GeoBar
        planned={roll.planned}
        happened={roll.happened}
        verified={roll.verified}
        force={roll.force}
        jointVerified={roll.jointVerified}
        jointForce={roll.jointForce}
        jointPending={roll.jointPending}
      />
    </div>
  );

  return (
    <DisclosureRow
      header={header}
      action={onDoctorPlan ? drPlanButton(() => onDoctorPlan(member)) : null}
      actionAlign="start"
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
          overRange={overRange}
        />
      ))}
    </DisclosureRow>
  );
}

export function TeamTree({ team, rows, pob, rootIds = [], onDoctorPlan, overRange = false }) {
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
  /* DEAD-END VACANCIES ARE DROPPED. A vacant seat with nobody under it and
     nothing logged against it is a row that can never say anything: no plan,
     no visits, no children to open, and a Dr plan button that is disabled the
     moment it is drawn. On a live roster there are a dozen of them, sitting
     between the reps you are actually reading.
   *
   * A vacant seat that still has REPORTS stays. The org beneath it is real,
   * and dropping it would orphan everyone under it — the same rule
   * ScopeSelect applies to its own picker.
   *
   * IT ALSO STAYS IF ANYTHING WAS LOGGED AGAINST IT, which should not happen
   * but decides the question if it ever does: the tree is a breakdown of the
   * cards above it, and a row carrying visits must never be hidden or the
   * two stop adding up.
   *
   * None of the rollups move. `totalReps` already excluded vacant seats, and
   * a seat with no rows contributes nothing to planned, happened or POB. */
  const visibleTeam = useMemo(() => {
    const childCount = new Map();
    for (const m of team) childCount.set(m.reportsTo, (childCount.get(m.reportsTo) ?? 0) + 1);
    const withRows = new Set(rows.map((r) => r.employeeId));

    return team.filter(
      (m) => !m.vacant || (childCount.get(m.id) ?? 0) > 0 || withRows.has(m.id),
    );
  }, [team, rows]);

  const byId = new Map(visibleTeam.map((m) => [m.id, m]));
  const tops = rootIds.map((id) => byId.get(id)).filter(Boolean);

  return (
    <section className="flex flex-col gap-2">
      <SectionLabel>Team tree · tap to expand</SectionLabel>
      <Card>
        {tops.length === 0 ? (
          <p className="text-10 text-ds-muted">No reports in this scope.</p>
        ) : (
          tops.map((m) => (
            <TreeNode
              key={m.id}
              member={m}
              /* The pruned roster, so dead-end vacancies are gone at every
                 level rather than only at the top. TreeNode passes whatever
                 it is given straight down to its children. */
              team={visibleTeam}
              rows={rows}
              pob={pob}
              depth={0}
              open={open}
              toggle={toggle}
              onDoctorPlan={onDoctorPlan}
              overRange={overRange}
            />
          ))
        )}
      </Card>
    </section>
  );
}
