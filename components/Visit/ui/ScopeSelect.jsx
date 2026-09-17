'use client';

import { TreeSelect } from '@/design-system';
import { managerRoots } from '../lib/selectors';
import { MANAGER_LEVELS, shortDesignation } from '../lib/shape';

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
 * see the comment on shape.js's 'Chief Executive Officer' entry. */

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
function buildManagerTree(team, rootId) {
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

  const roots = managerRoots(team).filter((m) => !isDeadEndVacant(m));

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

export function ScopeSelect({ team, value, onChange, rootId }) {
  const tree = buildManagerTree(team, rootId);

  return (
    <TreeSelect label="Team scope" hideLabel tree={tree} value={value} onChange={onChange} />
  );
}
