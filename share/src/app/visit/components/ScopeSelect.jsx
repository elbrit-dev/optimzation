'use client';

import { TreeSelect } from '@/design-system';
import { managerRoots } from '../data/selectors';
import { MANAGER_LEVELS, shortDesignation } from '../data/shape';

/* Whose team you are looking at.
 *
 * TREE, NOT A FLAT LIST. The fixture has eight managers; the live roster has
 * ~120 (85 ABM + 25 RBM + 7 SM + 3 ZSM), and a flat 120-option picker was
 * unusable however it was styled -- an ABM's name told you nothing about
 * which RBM or SM it sat under. The DS `TreeSelect` renders the actual
 * reporting hierarchy (ZSM -> SM -> RBM -> ABM) so picking a scope means
 * navigating the org, not scanning an alphabetised wall of names.
 *
 * EVERY PERSON IS PICKABLE, reps included. Managers used to be the only
 * options, on the grounds that a BE scope is a team report for a team of
 * one -- which it is, and which is a report people want: a manager checking
 * one rep's day, a rep looking at their own. A rep is a leaf, so the picker
 * offers them as a single tick rather than the two depths a manager gets.
 *
 * `MANAGER_LEVELS` (shape.js) stops at GM and never includes the CEO --
 * that's what keeps this tree scoped to Sales instead of the whole company;
 * see the comment on shape.js's 'Chief Executive Officer' entry.
 *
 * RESTRICTED TO THE VIEWER'S OWN SUBTREE when `viewerId` resolves to a
 * manager: a ZSM should see and drill into their own org, never their own
 * manager or a sibling ZSM's branch -- this is a permission boundary, not
 * just a default. Falls back to the full company tree (every top-level
 * manager root) only when the viewer can't be resolved to a manager at all
 * (an unresolvable token, a BE viewer, the dev harness with no viewer) --
 * there is no "my team" to restrict to in that case.
 *
 * TWO CLICKS, TWO DEPTHS, AND AS MANY BRANCHES AS YOU LIKE. The picker
 * answers "whose numbers" and "their team or their own" with one control
 * (`subtreeToggle` -- see TreeSelect): the first click on a manager shows
 * that manager's own calls, a second widens to everyone under them, a
 * third unticks. Several can be ticked at once -- two RBMs, or an RBM
 * plus one ABM from another branch -- and the report sums the union.
 *
 * This replaced a Team Report / My Report dropdown, which could only ever
 * say "own" about whoever was already scoped and had to be kept in step
 * with this picker by hand.
 *
 * BOTH DEPTHS ARE OFFERED WHEREVER THERE IS A BRANCH — an ABM's own calls
 * against their BEs' is exactly the distinction this exists to make. A rep
 * has no branch, so they cycle in two rather than three: "alone" and "whole
 * branch" name the same person, and a click between them would change the
 * row without changing a number. */

function labelFor(member, rootId) {
  const short = shortDesignation(member.designation);
  const vacantTag = member.vacant ? ' — vacant' : '';
  return `${member.name} · ${short}${vacantTag}${member.id === rootId ? ' (my team)' : ''}`;
}

/* Builds the manager subtree as nested `{ id, label, children }` nodes,
   ordered depth-first by name at each level. Iterative with a `seen` guard,
   same reasoning as `subtreeOf` in selectors.js: `reports_to` is a plain link
   field ERPNext does not police for cycles, so a bad edit to it should not
   turn this into an infinite loop. */
function buildManagerTree(team, rootId, viewerId) {
  /* EVERYONE, reps included. It was managers only, on the grounds that a BE
     scope is a team report for a team of one — true, and still a report
     somebody wants: a manager checking one rep's day, or a rep looking at
     their own. A rep is a leaf here, and TreeSelect gives a leaf a two-step
     toggle, so picking one is a single click with no meaningless "and their
     branch" step after it.

     A VACANT REP IS STILL DROPPED. `isDeadEndVacant` below already removes
     any vacant seat with nothing under it, which is every vacant BE: an empty
     seat has no calls to report and offering it is offering a screen of
     zeroes. */
  const people = team.filter(
    (m) => MANAGER_LEVELS.has(shortDesignation(m.designation)) || !m.vacant,
  );
  const byParent = new Map();
  for (const m of people) {
    const key = m.reportsTo ?? '__root__';
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(m);
  }
  for (const kids of byParent.values()) kids.sort((a, b) => a.name.localeCompare(b.name));

  /* A vacant seat with nobody under it is a dead end — there is no one to
     report on, so it is dropped rather than offered as an empty "team" of one
     placeholder. That covers every vacant BE and every vacant bottom-level
     ABM. A vacant seat that
     DOES have manager reports (a vacant RBM/SM/ZSM slot) stays in the tree,
     labelled "— vacant" by labelFor, because the org beneath it is real even
     though the seat itself is not -- dropping it would orphan every manager
     under it. */
  const isDeadEndVacant = (m) => m.vacant && !(byParent.get(m.id)?.length);

  /* The viewer's own node, if they ARE a manager -- restricts the whole tree
     to just them, so there is no ancestor chain and no sibling branch to
     navigate into. A dead-end-vacant self (should never happen for a real
     viewer, but the check stays cheap) still yields no options rather than a
     phantom root.

     Falls back to `rootId` -- whoever useVisitKpi resolved as the scope --
     before falling back to every manager root, and that order matters: the
     report is computed over the resolved root's branch, so offering a node
     OUTSIDE it hands back a pick that narrows to nobody and looks like a
     picker that does not work. Only when neither resolves does this open up
     to the whole company, where nothing has been narrowed to yet. */
  const anchorId = viewerId ?? rootId;
  const self = anchorId ? people.find((m) => m.id === anchorId) : null;
  const roots = self
    ? (isDeadEndVacant(self) ? [] : [self])
    : managerRoots(team).filter((m) => !isDeadEndVacant(m));

  const toNode = (member, seen) => {
    if (seen.has(member.id)) return { id: member.id, label: labelFor(member, rootId) };
    const nextSeen = new Set(seen).add(member.id);
    const kids = (byParent.get(member.id) ?? []).filter((kid) => !isDeadEndVacant(kid));
    return {
      id: member.id,
      label: labelFor(member, rootId),
      children: kids.length ? kids.map((kid) => toNode(kid, nextSeen)) : undefined,
    };
  };

  return roots.map((m) => toNode(m, new Set()));
}

export function ScopeSelect({ team, value, onChange, rootId, viewerId }) {
  const tree = buildManagerTree(team, rootId, viewerId);

  return (
    /* `allowEmpty`: the third click on the LAST selection clears it rather
       than wrapping back to "this node alone". That wrap is TreeSelect's
       default because an empty picker usually means a screen of zeroes that
       reads as a data fault -- but this report answers an empty scope in
       words ("No team selected"), so the guard is not earning anything here
       and it made the top of the tree impossible to untick. */
    <TreeSelect
      label="Team scope"
      hideLabel
      subtreeToggle
      allowEmpty
      tree={tree}
      value={value}
      onChange={onChange}
      placeholder="No team selected"
    />
  );
}
