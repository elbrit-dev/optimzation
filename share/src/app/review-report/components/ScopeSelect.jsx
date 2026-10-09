'use client';

import { useMemo } from 'react';
import { TreeSelect } from '@/design-system';

/* Whose numbers — the Visit report's "Team scope" picker (visit/components/
 * ScopeSelect.jsx) on the review's seat tree. The same TreeSelect, the same
 * value: picks of `{ id, includeSubtree }`. A click on a seat takes it alone
 * (–), a second its whole branch (✓), a third unticks; several can be ticked
 * and the page sums the union.
 *
 * The tree is what the token may see (the server decides): the caller's own
 * seat and everything under it, or for IT every SM. "(my team)" marks the
 * caller's own seat. */

function labelFor(t, me) {
  const name = t.vacant ? `Vacant · ${t.id}` : t.name;
  return `${name}${t.tier ? ` · ${t.tier}` : ''}${t.id === me ? ' (my team)' : ''}`;
}

export function ScopeSelect({ ix, value, onChange }) {
  const tree = useMemo(() => {
    const me = ix.me != null ? ix.tree[ix.me].id : null;
    const byName = (a, b) => String(ix.tree[a].name).localeCompare(String(ix.tree[b].name));
    const toNode = (i, seen) => {
      const t = ix.tree[i];
      const kids = seen.has(i) ? [] : [...(ix.kids.get(i) ?? [])].sort(byName);
      const next = new Set(seen).add(i);
      return { id: t.id, label: labelFor(t, me), children: kids.length ? kids.map((k) => toNode(k, next)) : undefined };
    };
    return [...ix.roots].sort(byName).map((i) => toNode(i, new Set()));
  }, [ix]);

  return (
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
