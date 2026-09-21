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
 * Only managers are offered -- selecting a BE would render a "team report"
 * for a team of one -- but the tree still has to be built from the WHOLE
 * roster: an ABM's parent is an RBM, whose parent is an SM, and skipping the
 * non-manager rows would be fine here since BEs are leaves, but skipping a
 * manager level would orphan everyone under it.
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
 * Every row offers both depths, including the tree's leaves. A leaf HERE
 * is a bottom-level ABM — the tree is managers only — and their own calls
 * against their BEs' is exactly the distinction this exists to make. */

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
  const managers = team.filter((m) => MANAGER_LEVELS.has(shortDesignation(m.designation)));
  const byParent = new Map();
  for (const m of managers) {
    const key = m.reportsTo ?? '__root__';
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(m);
  }
  for (const kids of byParent.values()) kids.sort((a, b) => a.name.localeCompare(b.name));

  /* A vacant seat with no manager reports of its own is a dead end: BEs never
     appear in this tree, so there is nothing left to show under it and it is
     dropped rather than offered as an empty "team" of one placeholder (this is
     always true of a vacant ABM, the lowest manager level). A vacant seat that
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
  const self = anchorId ? managers.find((m) => m.id === anchorId) : null;
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
    <TreeSelect label="Team scope" hideLabel subtreeToggle tree={tree} value={value} onChange={onChange} />
  );
}
